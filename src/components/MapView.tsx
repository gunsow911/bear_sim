/**
 * 地図ビュー。react-leaflet + 地理院タイル（淡色地図）。
 *
 * ⚠️ Step 1（足場）では基盤地図の描画のみ。地区境界 GeoJSON の choropleth 表示と
 *    クリック選択は Step 4 で追加する（src/data/districts.geojson 読み込み）。
 */

import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

/** 山口県のおおよその中心。 */
const YAMAGUCHI_CENTER: [number, number] = [34.18, 131.47]

export function MapView() {
  return (
    <MapContainer
      center={YAMAGUCHI_CENTER}
      zoom={10}
      className="h-full w-full"
      // ゲーム UI なのでスクロールズームは控えめに
      scrollWheelZoom={true}
    >
      <TileLayer
        // OpenStreetMap 標準タイル（無料・APIキー不要）
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {/* TODO(Step 4): districts.geojson を GeoJSON レイヤーで描画し、
          遭遇率で色分け・クリックで selectDistrict を呼ぶ */}
    </MapContainer>
  )
}
