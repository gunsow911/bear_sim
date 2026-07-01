/**
 * 地図ビュー。react-leaflet + OpenStreetMap タイル。
 * 地区境界 GeoJSON を遭遇率で色分け（choropleth）し、クリックで地区選択する。
 *
 * 地区データは src/data/stages/yamaguchi/districtsGeo.ts（現状プレースホルダ）。
 * 実データへの差し替えは docs/DATA.md を参照。
 */

import { GeoJSON, MapContainer, Marker, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import type { LatLngBoundsExpression, Layer, PathOptions } from 'leaflet'
import type { Feature } from 'geojson'
import 'leaflet/dist/leaflet.css'
import { districtsGeo } from '@/data/stages/yamaguchi/districtsGeo'
import { useGameStore } from '@/store/gameStore'
import { SightingHeatLayer } from './SightingHeatLayer'

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

/** 遭遇率(0-100) → 警戒色（テーマ）。詳細パネルの閾値と揃える。枠線・塗りの両方に使う。 */
function riskColor(rate: number): string {
  if (rate >= 75) return cssVar('--color-risk-critical')
  if (rate >= 50) return cssVar('--color-risk-danger')
  if (rate >= 25) return cssVar('--color-risk-warn')
  return cssVar('--color-risk-safe')
}

export function MapView() {
  const game = useGameStore((s) => s.game)
  const selectedId = useGameStore((s) => s.selectedDistrictId)
  const selectDistrict = useGameStore((s) => s.selectDistrict)
  const lastEvents = useGameStore((s) => s.lastEvents)
  const phase = useGameStore((s) => s.game?.phase)

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
    // 遭遇率は「枠線の色」で表現し、塗りはほぼ透明にして背景のヒートマップを透けさせる。
    // 選択地区は白枠＋やや太く＋薄いリスク塗りで見分ける。
    return {
      color: selected ? cssVar('--color-fg') : riskColor(rate),
      weight: selected ? 5 : 3,
      fillColor: riskColor(rate),
      fillOpacity: selected ? 0.4 : 0.18,
    }
  }

  // 出没（里山/市街）があった地区 id の集合
  const sightedIds = new Set(
    (phase === 'encounter' || phase === 'gameover'
      ? lastEvents
      : []
    )
      .filter((e) => e.kind !== 'fence-block')
      .map((e) => e.districtId),
  )

  // 地区重心（座標平均）の概算
  const centroidOf = (districtId: string): [number, number] | null => {
    const f = districtsGeo.features.find((ff) => ff.properties.districtId === districtId)
    if (!f) return null
    let sx = 0, sy = 0, n = 0
    const walk = (node: unknown): void => {
      if (!Array.isArray(node)) return
      if (typeof node[0] === 'number') {
        sx += node[0] as number; sy += node[1] as number; n++
        return
      }
      for (const c of node) walk(c)
    }
    walk(f.geometry.coordinates)
    return n ? [sy / n, sx / n] : null
  }

  const bearIcon = L.divIcon({
    className: '',
    html: '<div style="font-size:22px;line-height:1">🐻</div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })

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
      {game && <SightingHeatLayer turn={game.turn} maxTurns={game.maxTurns} />}
      <GeoJSON key={styleKey} data={districtsGeo} style={style} onEachFeature={onEachFeature} />
      {[...sightedIds].map((id) => {
        const c = centroidOf(id)
        return c ? <Marker key={id} position={c} icon={bearIcon} /> : null
      })}
    </MapContainer>
  )
}
