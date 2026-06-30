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
//    注: 必ずアンカー(^)で判定する。実データの字名は
//      ・小鯖 → 「上小鯖 / 下小鯖」（^小鯖 では取りこぼす）
//      ・仁保津 → 「小郡上郷仁保津…」（= 小郡。contains 判定だと niho に誤混入）
//      ・青葉台 → 大内地区の団地（無印「青葉台」。未指定だと中心市街へ漏れて飛び地化）
//      ・江崎 / 深溝 → 南部沿岸平野（未指定だと中心市街へ漏れて南西飛び地化）
const DISTRICT_RULE = `
  /^阿東/.test(S_NAME) ? 'ato'
  : /^徳地/.test(S_NAME) ? 'tokuji'
  : /^宮野/.test(S_NAME) ? 'miyano'
  : /^(仁保|[上下]?小鯖)/.test(S_NAME) ? 'niho'
  : /^(大内|青葉台)/.test(S_NAME) ? 'ouchi'
  : /^吉敷/.test(S_NAME) ? 'yoshiki'
  : /^小郡/.test(S_NAME) ? 'ogori'
  : /^阿知須/.test(S_NAME) ? 'ajisu'
  : /^(名田島|佐山|嘉川|陶|鋳銭司|秋穂二島|秋穂|江崎|深溝)/.test(S_NAME) ? 'nanbu'
  : 'center'
`.replace(/\s+/g, ' ').trim()

const DISTRICT_NAMES = {
  ato: '阿東地区',
  tokuji: '徳地地区',
  miyano: '宮野地区',
  niho: '仁保・小鯖地区',
  ouchi: '大内地区',
  yoshiki: '吉敷地区',
  center: '湯田・大殿地区',
  ogori: '小郡地区',
  nanbu: '秋穂・嘉川地区',
  ajisu: '阿知須地区',
}

// 出力の地区並び順（凡例・リストの並び＝里山→市街の勾配順）
const ORDER = ['ato', 'tokuji', 'miyano', 'niho', 'ouchi', 'yoshiki', 'center', 'ogori', 'nanbu', 'ajisu']

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
    // snap: e-Stat 基本単位区は隣接境界が完全一致しておらず、そのまま溶かすと
    //   無数の隙間(穴)と断片が生じる。取り込み時にスナップして境界を一致させる。
    `-i "${INPUT}" encoding=shift_jis snap`,
    `-each "districtId = ${DISTRICT_RULE}"`,
    `-dissolve2 districtId`,
    `-each "name = (${nameMapLiteral})[districtId]"`,
    `-filter-fields districtId,name`,
    // gap-fill-area: 溶かした後に残る小さな隙間を、最長境界を共有する隣接地区へ
    //   割り当てて埋める（市域を隙間なく9地区で充填する）。
    `-clean gap-fill-area=2km2`,
    `-simplify 6% keep-shapes`,
    `-o "${tmpGeojson}" format=geojson precision=0.0001`,
  ].join(' ')

  console.log('[build-geojson] mapshaper 実行中...')
  await mapshaper.runCommands(command)

  const fc = JSON.parse(readFileSync(tmpGeojson, 'utf8'))

  // ── 内部の小さな穴を埋める（地区が囲む小空洞をその地区へ吸収）。
  //    各ポリゴンの内側リング(穴)のうち概算面積が FILL_HOLE_KM2 未満のものを削除し、
  //    山口市内部に白い穴が残らないようにする（外形・離片は保持＝面積は減らさない）。
  const FILL_HOLE_KM2 = 2
  const ringAreaKm2 = (ring) => {
    // 球面近似のシューレース（緯度補正）。符号なし面積を km² で返す。
    let a = 0
    for (let i = 0, n = ring.length; i < n; i++) {
      const [x1, y1] = ring[i]
      const [x2, y2] = ring[(i + 1) % n]
      const kx = 111.32 * Math.cos((((y1 + y2) / 2) * Math.PI) / 180)
      a += x1 * kx * (y2 * 111.32) - x2 * kx * (y1 * 111.32)
    }
    return Math.abs(a) / 2
  }
  const fillHoles = (poly) => [
    poly[0],
    ...poly.slice(1).filter((hole) => ringAreaKm2(hole) >= FILL_HOLE_KM2),
  ]
  for (const f of fc.features) {
    const g = f.geometry
    if (g.type === 'Polygon') g.coordinates = fillHoles(g.coordinates)
    else if (g.type === 'MultiPolygon') g.coordinates = g.coordinates.map(fillHoles)
  }

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
