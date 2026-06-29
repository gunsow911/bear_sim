/**
 * 地図ビュー。react-leaflet + OpenStreetMap タイル。
 * 地区境界 GeoJSON を遭遇率で色分け（choropleth）し、クリックで地区選択する。
 *
 * 地区データは src/data/districtsGeo.ts（現状プレースホルダ）。
 * 実データへの差し替えは docs/DATA.md を参照。
 */

import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet'
import type { LatLngBoundsExpression, Layer, PathOptions } from 'leaflet'
import type { Feature } from 'geojson'
import 'leaflet/dist/leaflet.css'
import { districtsGeo } from '@/data/districtsGeo'
import { useGameStore } from '@/store/gameStore'

/** 全地区を含む表示範囲を GeoJSON から算出する（[ [南西lat,lng], [北東lat,lng] ]）。 */
function computeBounds(): LatLngBoundsExpression {
  let minLat = 90,
    minLng = 180,
    maxLat = -90,
    maxLng = -180
  // [lng, lat] 座標、または座標の入れ子配列を再帰的に走査する
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return
    if (typeof node[0] === 'number') {
      const [lng, lat] = node as number[]
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      return
    }
    for (const child of node) walk(child)
  }
  for (const f of districtsGeo.features) walk(f.geometry.coordinates)
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}

const CITY_BOUNDS = computeBounds()

/** CSS 変数（テーマ色）を rgb() 文字列として読む。Leaflet の塗りに使う。 */
function cssVar(name: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? `rgb(${v})` : '#888888'
}

/** 遭遇率(0-100) → 塗り色（テーマの警戒色）。詳細パネルの閾値と揃える。 */
function riskFill(rate: number): string {
  if (rate >= 75) return cssVar('--color-risk-critical')
  if (rate >= 50) return cssVar('--color-risk-danger')
  if (rate >= 25) return cssVar('--color-risk-warn')
  return cssVar('--color-risk-safe')
}

export function MapView() {
  const game = useGameStore((s) => s.game)
  const selectedId = useGameStore((s) => s.selectedDistrictId)
  const selectDistrict = useGameStore((s) => s.selectDistrict)

  const districts = game?.districts ?? {}

  // react-leaflet の <GeoJSON> はマウント後にスタイルを再評価しないため、
  // 遭遇率・選択が変わったら key を変えて再マウントし、塗りを更新する（地区数は少数）。
  const styleKey =
    Object.values(districts)
      .map((d) => `${d.id}:${Math.round(d.satoyamaEncounterRate)}:${Math.round(d.urbanEncounterRate)}`)
      .join('|') + `#${selectedId ?? ''}`

  const style = (feature?: Feature): PathOptions => {
    const id = feature?.properties?.districtId as string | undefined
    const ds = id ? districts[id] : undefined
    // 里山・市街の高い方をリスクとして色付け
    const rate = ds ? Math.max(ds.satoyamaEncounterRate, ds.urbanEncounterRate) : 0
    const selected = id === selectedId
    return {
      color: selected ? cssVar('--color-fg') : cssVar('--color-panel-border'),
      weight: selected ? 4 : 1.5,
      fillColor: riskFill(rate),
      fillOpacity: 0.55,
    }
  }

  const onEachFeature = (feature: Feature, layer: Layer) => {
    const id = feature.properties?.districtId as string | undefined
    const name = (feature.properties?.name as string) ?? id ?? ''
    layer.bindTooltip(name, { sticky: true })
    layer.on('click', () => {
      if (id) selectDistrict(id)
    })
  }

  return (
    <MapContainer bounds={CITY_BOUNDS} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSON key={styleKey} data={districtsGeo} style={style} onEachFeature={onEachFeature} />
    </MapContainer>
  )
}
