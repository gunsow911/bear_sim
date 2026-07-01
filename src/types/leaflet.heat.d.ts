/**
 * leaflet.heat の最小アンビエント型宣言（公式 @types なし）。
 * L.heatLayer(latlngs, options) を提供する。latlngs は [lat, lng] か [lat, lng, intensity]。
 */
import 'leaflet'

declare module 'leaflet' {
  interface HeatMapOptions {
    minOpacity?: number
    maxZoom?: number
    max?: number
    radius?: number
    blur?: number
    gradient?: Record<number, string>
  }

  type HeatLatLngTuple = [number, number] | [number, number, number]

  interface HeatLayer extends Layer {
    setLatLngs(latlngs: HeatLatLngTuple[]): this
    addLatLng(latlng: HeatLatLngTuple): this
    setOptions(options: HeatMapOptions): this
    redraw(): this
  }

  function heatLayer(latlngs: HeatLatLngTuple[], options?: HeatMapOptions): HeatLayer
}

declare module 'leaflet.heat'
