/**
 * 地区境界 GeoJSON ビルドスクリプト。
 *
 * e-Stat 小地域（基本単位区）の Shapefile を読み込み、字名(S_NAME)のプレフィックスで
 * 「地区」に束ね（dissolve）、簡略化して src/data/districtsGeo.ts を生成する。
 *
 *   入力 : data_raw/yamaguchi/r2kb35203.shp（＋ .dbf/.shx/.prj、属性は Shift_JIS）
 *   出力 : src/data/districtsGeo.ts（MapView が import する FeatureCollection）
 *          scratch にデバッグ用 yamaguchi.geojson も書く
 *
 * 実行 : npm run build:geojson
 *
 * 地区の分け方を変えたいときは下の DISTRICT_RULE / DISTRICT_NAMES を編集して再実行する。
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mapshaper from 'mapshaper'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const INPUT = join(ROOT, 'data_raw/yamaguchi/r2kb35203.shp')
const OUTPUT_TS = join(ROOT, 'src/data/stages/yamaguchi/districtsGeo.ts')

// ── 地区分けルール（字名 S_NAME → districtId）。上から順に評価。
const DISTRICT_RULE = `
  /^阿東/.test(S_NAME) ? 'ato'
  : /^徳地/.test(S_NAME) ? 'tokuji'
  : /^宮野/.test(S_NAME) ? 'miyano'
  : /^(仁保|小鯖)/.test(S_NAME) ? 'niho'
  : /^(大内|吉敷)/.test(S_NAME) ? 'ouchi'
  : /^小郡/.test(S_NAME) ? 'ogori'
  : /^阿知須/.test(S_NAME) ? 'ajisu'
  : /^(名田島|佐山|嘉川|陶|鋳銭司|秋穂二島|秋穂)/.test(S_NAME) ? 'nanbu'
  : 'center'
`.replace(/\s+/g, ' ').trim()

const DISTRICT_NAMES = {
  ato: '阿東地区',
  tokuji: '徳地地区',
  miyano: '宮野地区',
  niho: '仁保・小鯖地区',
  ouchi: '大内・吉敷地区',
  center: '中心市街',
  ogori: '小郡地区',
  nanbu: '南部平野地区',
  ajisu: '阿知須地区',
}

// 出力の地区並び順（凡例・リストの並び＝里山→市街の勾配順）
const ORDER = ['ato', 'tokuji', 'miyano', 'niho', 'ouchi', 'center', 'ogori', 'nanbu', 'ajisu']

async function main() {
  const scratch = mkdtempSync(join(tmpdir(), 'bearsim-geo-'))
  const tmpGeojson = join(scratch, 'yamaguchi.geojson')

  // mapshaper の -each 式は二重引用符で囲むため、オブジェクトリテラルは単一引用符で組む
  const nameMapLiteral =
    '{' +
    Object.entries(DISTRICT_NAMES)
      .map(([k, v]) => `${k}:'${v}'`)
      .join(',') +
    '}'
  const command = [
    `-i "${INPUT}" encoding=shift_jis`,
    `-each "districtId = ${DISTRICT_RULE}"`,
    `-dissolve2 districtId`,
    `-each "name = (${nameMapLiteral})[districtId]"`,
    `-filter-fields districtId,name`,
    `-simplify 6% keep-shapes`,
    `-clean`,
    `-o "${tmpGeojson}" format=geojson precision=0.0001`,
  ].join(' ')

  console.log('[build-geojson] mapshaper 実行中...')
  await mapshaper.runCommands(command)

  const fc = JSON.parse(readFileSync(tmpGeojson, 'utf8'))

  // 地区順に並べ替え
  fc.features.sort(
    (a, b) =>
      ORDER.indexOf(a.properties.districtId) - ORDER.indexOf(b.properties.districtId),
  )

  // デバッグ用 geojson も保存
  writeFileSync(tmpGeojson, JSON.stringify(fc))
  console.log(`[build-geojson] 地区数=${fc.features.length}`)
  for (const f of fc.features) {
    console.log(`  - ${f.properties.districtId} (${f.properties.name})`)
  }

  const ts = `/**
 * 地区境界 GeoJSON。
 * ⚠️ このファイルは scripts/build-geojson.mjs により自動生成される。手で編集しない。
 *    元データ: e-Stat 小地域（国勢調査）山口市。分割ルールはスクリプト側を参照。
 *
 * データ契約: 各 Feature.properties.districtId が yamaguchiStage の地区 id と一致する。
 */
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'

export interface DistrictFeatureProps {
  districtId: string
  name: string
}

export const districtsGeo: FeatureCollection<Polygon | MultiPolygon, DistrictFeatureProps> =
  ${JSON.stringify(fc)}
`
  writeFileSync(OUTPUT_TS, ts)
  console.log(`[build-geojson] 生成: ${OUTPUT_TS}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
