/**
 * 差し替え可能な「リスクモデル」。
 */

import {
  DEFAULT_COEFFICIENTS,
  satoyamaRise as satoyamaRiseFormula,
  urbanRise as urbanRiseFormula,
  type ModelCoefficients,
  type SatoyamaRiseInput,
  type UrbanRiseInput,
} from './encounter'

/** 数式以外の数理パラメータ（出現・被害・対策効果）。すべて仮。 */
export interface RiskModelParams {
  /** 出現確率の基礎係数（遭遇率/100 に掛ける）。 */
  occurrenceSensitivity: number
  /**
   * 出現確率カーブのべき指数。>1 で低い遭遇率の出没を強く抑制し、高い遭遇率はほぼ維持する
   * （「複数の偶然が重ならないと出没しない」感を出す）。1 なら遭遇率がそのまま確率。
   */
  occurrenceExponent: number
  /** 出没した地区の遭遇率に掛ける倍率。出没で遭遇率が一旦下がり、連続出没を緩和する（小さいほど強く減衰）。 */
  sightedRateFactor: number
  /** 出現時の不満度加算（§5.3）。 */
  damage: { satoyama: number; urban: number }
  /** §5.2 対策コマンドの効果量。 */
  actionEffects: {
    /** 広域草刈り：山林→里山流入をカットするターン数。 */
    mowingBlockTurns: number
    /** 広域草刈り：流入のカット率（0〜1）。山林直接流入(第1項)・隣接移動(第2項)の両方に適用。 */
    mowingInfluxCutRate: number
    /** 電気柵：有効ターン数（この間の里山遭遇を1度だけ無効化。発揮で即失効）。 */
    electricFenceTurns: number
  }
}

/** ゲームエンジンが依存する数理モデルの境界面。 */
export interface RiskModel {
  id: string
  coefficients: ModelCoefficients
  params: RiskModelParams
  /** §4.3 里山遭遇率の上昇度。 */
  satoyamaRise(input: Omit<SatoyamaRiseInput, 'coeff'>): number
  /** §4.4 市街遭遇率の上昇度。 */
  urbanRise(input: Omit<UrbanRiseInput, 'coeff'>): number
  /** 遭遇率(0-100) → そのターンに出現する確率(0-1)。 */
  occurrenceProbability(rate: number): number
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** パラメータからリスクモデルを組み立てるファクトリ。差し替えの基本手段。 */
export function createRiskModel(
  id: string,
  coefficients: ModelCoefficients,
  params: RiskModelParams,
): RiskModel {
  return {
    id,
    coefficients,
    params,
    satoyamaRise: (input) => satoyamaRiseFormula({ ...input, coeff: coefficients }),
    urbanRise: (input) => urbanRiseFormula({ ...input, coeff: coefficients }),
    occurrenceProbability: (rate) =>
      clamp01(Math.pow(clamp01((rate / 100) * params.occurrenceSensitivity), params.occurrenceExponent)),
  }
}

/** 標準モデル */
export const defaultRiskModel: RiskModel = createRiskModel('default', DEFAULT_COEFFICIENTS, {
  occurrenceSensitivity: 1,
  occurrenceExponent: 1.5, // 低い遭遇率の出没を抑制（>1）
  sightedRateFactor: 0.5, // 出没した地区の遭遇率に掛ける倍率

  damage: { satoyama: 10, urban: 30 },
  actionEffects: {
    mowingBlockTurns: 2,
    mowingInfluxCutRate: 0.5, // 山林→里山流入を50%カット
    electricFenceTurns: 4, // 電気柵は4ターン有効
  },
})

/**
 * エンジンが実際に使うモデル。
 * 差し替えるときはここを別モデルに変更するだけ（例: createRiskModel('v2', ...)）。
 */
export const activeRiskModel: RiskModel = defaultRiskModel
