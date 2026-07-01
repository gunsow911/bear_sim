/**
 * YPくまっぷ（山口県クマ目撃情報）データ・ビルドスクリプト。
 *
 * 一次データ（目撃CSV）と地区境界 GeoJSON から、
 *   1) 山口市内の目撃点（ヒートマップ演出用）を bearInsight.ts に生成し、
 *   2) baseDensity（地区別・空間シグナル）と活発度カーブ（月形状・時間シグナル）の
 *      算出値を標準出力に印字する（stage.ts / season.ts の定数更新の参照用）。
 *
 *   入力 : data_raw/bear_insight/山口県クマ目撃情報.csv（UTF-8）
 *          src/data/stages/yamaguchi/districtsGeo.ts（点内包判定に使用）
 *   出力 : src/data/stages/yamaguchi/bearInsight.ts（SIGHTINGS）
 *          + 標準出力に baseDensity / 活発度カーブ
 *
 * 実行 : npm run build:bear-data
 *
 * 導出方針は docs/DATA.md を参照。baseDensity・活発度は値が少数のため、印字値を
 * 手で stage.ts / season.ts の定数へ反映する（コードに焼き込み）。SIGHTINGS のみ
 * 点数が多いため本スクリプトで生成する。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const CSV = join(ROOT, 'data_raw/bear_insight/山口県クマ目撃情報.csv')
const GEO_TS = join(ROOT, 'src/data/stages/yamaguchi/districtsGeo.ts')
const OUTPUT_TS = join(ROOT, 'src/data/stages/yamaguchi/bearInsight.ts')

// 出力の地区並び順（里山→市街の勾配順、stage.ts と揃える）
const ORDER = ['ato', 'tokuji', 'miyano', 'niho', 'ouchi', 'yoshiki', 'center', 'ogori', 'nanbu', 'ajisu']

// ── districtsGeo.ts から GeoJSON を取り出す（TS はそのまま import できないため
//    FeatureCollection リテラルを切り出して JSON.parse する）。
function loadGeo() {
  const ts = readFileSync(GEO_TS, 'utf8')
  const start = ts.indexOf('{"type":"FeatureCollection"')
  const obj = ts.slice(start).trim().replace(/;\s*$/, '')
  return JSON.parse(obj)
}

// ── 素朴な CSV パーサ（引用符内のカンマ・改行に対応）。
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

// ── 点内包判定（ray casting）。ring は [lng, lat] の配列。
function pointInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function pointInFeature(lng, lat, feature) {
  const g = feature.geometry
  const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]
  return polys.some(
    (poly) => pointInRing(lng, lat, poly[0]) && !poly.slice(1).some((hole) => pointInRing(lng, lat, hole)),
  )
}
function assignDistrict(lng, lat, features) {
  for (const f of features) if (pointInFeature(lng, lat, f)) return f.properties.districtId
  return null
}

function main() {
  const geo = loadGeo()
  const features = geo.features

  const rows = parseCsv(readFileSync(CSV, 'utf8'))
  const header = rows[0]
  const idx = {
    date: header.indexOf('目撃(発見)日付'),
    lat: header.indexOf('緯度'),
    lng: header.indexOf('経度'),
  }

  const sightings = []               // 山口市内の点（ヒート用）
  const distTotal = Object.fromEntries(ORDER.map((d) => [d, 0]))
  const monthAll = Array(13).fill(0) // 県全域906件の月分布（index 1..12）
  let usable = 0

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r]
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((cols[idx.date] || '').trim())
    if (!m) continue
    const lat = parseFloat(cols[idx.lat]), lng = parseFloat(cols[idx.lng])
    if (!(lat > 33.5 && lat < 34.9 && lng > 130.6 && lng < 132.4)) continue // 県内バウンディング
    usable++
    const month = parseInt(m[2], 10), day = parseInt(m[3], 10)
    monthAll[month]++                              // 月形状は県全域で
    const did = assignDistrict(lng, lat, features) // 地区ウェイトは市内で
    if (!did) continue
    distTotal[did]++
    sightings.push({ lat: +lat.toFixed(5), lon: +lng.toFixed(5), month, day })
  }

  // ── baseDensity: 地区別総数を、最大が 9 になるようスケール（実測のまま・フロアなし）。
  const maxCount = Math.max(...ORDER.map((d) => distTotal[d]))
  const scale = 9 / maxCount
  const density = Object.fromEntries(ORDER.map((d) => [d, +(distTotal[d] * scale).toFixed(2)]))

  // ── 月形状（平均=1）と活発度カーブ（7〜10月窓、10月ピーク→80）。
  const totalMonths = monthAll.slice(1).reduce((a, b) => a + b, 0)
  const avg = totalMonths / 12
  const shape = {} // 月 → 平均=1 正規化
  for (let mo = 1; mo <= 12; mo++) shape[mo] = +(monthAll[mo] / avg).toFixed(3)
  const K = 80 / shape[10]                         // 10月ピークを 80 に
  const activeness = []
  const MAX_TURNS = 16
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const frac = (turn - 1) / (MAX_TURNS - 1)      // 0..1
    const pos = 7 + 3 * frac                        // 7.0(7月) .. 10.0(10月)
    const lo = Math.floor(pos), hi = Math.min(lo + 1, 10), t = pos - lo
    const s = shape[lo] + (shape[hi] - shape[lo]) * t
    activeness.push(Math.round(s * K))
  }

  // ── 生成: bearInsight.ts（SIGHTINGS のみ）。
  const ts = `/**
 * YPくまっぷ（山口県クマ目撃情報）由来の目撃点データ。
 * ⚠️ このファイルは scripts/build-bear-data.mjs により自動生成される。手で編集しない。
 *    元データ: data_raw/bear_insight/山口県クマ目撃情報.csv。
 *    山口市の10地区ポリゴン内に入る目撃点のみ（点内包判定）。月・日は暦日（年は無視）。
 *    ヒートマップ演出（MapView）で、ゲームのターン→月の窓に応じて抽出して使う。
 */

export interface Sighting {
  /** 緯度。 */
  lat: number
  /** 経度。 */
  lon: number
  /** 月（1〜12）。 */
  month: number
  /** 日（1〜31）。 */
  day: number
}

export const SIGHTINGS: Sighting[] = ${JSON.stringify(sightings)}
`
  writeFileSync(OUTPUT_TS, ts)

  // ── 印字（stage.ts / season.ts への反映用）。
  console.log(`[build-bear-data] 使用可能(日付+県内座標)=${usable} / 市内点=${sightings.length}`)
  console.log(`[build-bear-data] 生成: ${OUTPUT_TS}`)
  console.log('\n=== baseDensity（stage.ts へ反映）===')
  for (const d of ORDER) console.log(`  ${d.padEnd(8)} cnt=${String(distTotal[d]).padStart(3)}  baseDensity=${density[d]}`)
  console.log('\n=== 月形状（平均=1、県全域）===')
  console.log('  ' + [7, 8, 9, 10].map((mo) => `${mo}月:${shape[mo]}`).join('  '))
  console.log('\n=== 活発度カーブ（season.ts へ反映、turn1=7月…turn16=10月）===')
  console.log('  [' + activeness.join(', ') + ']')
}

main()
