/**
 * ステージレジストリ。各ステージの定義（StageDef）と地区境界 GeoJSON をひとまとめにする。
 * 新しい市町を追加するときは stages/<id>/ を作り、ここに 1 行追加する。
 */
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { StageDef, StageId } from '@/types'
import { yamaguchiStage } from './yamaguchi/stage'
import {
  districtsGeo as yamaguchiGeo,
  type DistrictFeatureProps,
} from './yamaguchi/districtsGeo'

/** ステージ定義と、その地区境界 GeoJSON の対。 */
export interface StageBundle {
  stage: StageDef
  geo: FeatureCollection<Polygon | MultiPolygon, DistrictFeatureProps>
}

/** 収録ステージ一覧（ステージ選択画面の並び順）。 */
export const STAGES: StageBundle[] = [{ stage: yamaguchiStage, geo: yamaguchiGeo }]

/** stageId からステージ束を引く。未収録なら undefined。 */
export function getStage(id: StageId): StageBundle | undefined {
  return STAGES.find((s) => s.stage.id === id)
}

export { yamaguchiStage }
