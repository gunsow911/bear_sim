/**
 * 目撃点ヒートマップ演出（常時ONの背景層）。
 *
 * YPくまっぷ実測点（山口市内144点）を、ゲームの現在ターン→ローリング月窓で抽出し、
 * leaflet.heat で描画する。ターン進行でホットゾーンが Jul→Oct と移り、10月に向けて
 * 盛り上がる（活発度カーブと連動した演出。ゲーム状態＝コロプレス塗りとは独立）。
 *
 * leaflet.heat は canvas を overlayPane に固定追加するため、専用 pane（zIndex をコロプレスの
 * overlayPane より下）へ移してコロプレスの背面に敷く。
 */

import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.heat'
import { sightingsForTurn } from '@/data/stages/yamaguchi/sightingWindow'

/** コロプレス(overlayPane=z400)の下・タイル(z200)の上に敷く専用 pane 名。 */
const HEAT_PANE = 'sighting-heat'

export function SightingHeatLayer({ turn, maxTurns }: { turn: number; maxTurns: number }) {
  const map = useMap()

  useEffect(() => {
    let pane = map.getPane(HEAT_PANE)
    if (!pane) {
      pane = map.createPane(HEAT_PANE)
      pane.style.zIndex = '350'
      pane.style.pointerEvents = 'none'
    }

    const points = sightingsForTurn(turn, maxTurns).map(
      (s) => [s.lat, s.lon, 1] as [number, number, number],
    )
    const layer = L.heatLayer(points, {
      radius: 26,
      blur: 14, // 小さいほど輪郭がくっきり
      max: 3, // 低いほど少ない重なりで飽和＝色が濃く出る
      minOpacity: 0.45, // 下限不透明度を上げてくっきり見せる
      gradient: { 0.2: '#3b82f6', 0.4: '#22d3ee', 0.6: '#facc15', 0.8: '#f97316', 1: '#ef4444' },
    })
    layer.addTo(map)

    // canvas を専用 pane へ移して背面化。
    const canvas = (layer as unknown as { _canvas?: HTMLCanvasElement })._canvas
    if (canvas && pane) pane.appendChild(canvas)

    return () => {
      // onRemove は overlayPane から removeChild するため、消す前に戻しておく。
      if (canvas) map.getPanes().overlayPane.appendChild(canvas)
      layer.remove()
    }
  }, [map, turn, maxTurns])

  return null
}
