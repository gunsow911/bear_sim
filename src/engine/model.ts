/**
 * 差し替え可能な「リスクモデル」。
 *
 * ⚠️ 数式・係数・出現確率・被害量はすべて【仮】。
 *    モデルを差し替えるには `createRiskModel(...)` に別の数値を渡すか、
 *    RiskModel インターフェースを満たす独自オブジェクトを作り、
 *    `activeRiskModel` の代入先を変えるだけでよい（エンジン側は無改修）。
 */

import {
  DEFAULT_COEFFICIENTS,
  satoyamaRise as satoyamaRiseFormula,
  urbanRise as urbanRiseFormula,
  type ModelCoefficients,
  type SatoyamaRiseInput,
  type UrbanRiseInput,
} from './encounter'

/** 数式以外の数理パラメータ（出現・被害・対策効果・放置増）。すべて仮。 */
export interface RiskModelParams {
  /** 出現確率 = clamp01(rate/100 * occurrenceSensitivity)。 */
  occurrenceSensitivity: number
  /** 出現時の不満度加算（§5.3）。 */
  damage: { satoyama: number; urban: number }
  /** §5.2 対策コマンドの効果量。 */
  actionEffects: {
    /** 広域草刈り：流入を遮断するターン数。 */
    mowingBlockTurns: number
    /** クリーン作戦：人間の介入(里山)への加算（永続・負で抑制）。 */
    cleanUpSatoyamaDelta: number
    /** クリーン作戦：人間の介入(市街)係数への加算（負で抑制）。 */
    cleanUpUrbanFactorDelta: number
  }
  /** 放置時の自然増（毎ターン intervention に加算）。 */
  neglectDrift: { satoyama: number; urban: number }
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
    occurrenceProbability: (rate) => clamp01((rate / 100) * params.occurrenceSensitivity),
  }
}

/** 標準モデル（仮の数値）。 */
export const defaultRiskModel: RiskModel = createRiskModel('default', DEFAULT_COEFFICIENTS, {
  occurrenceSensitivity: 1,
  damage: { satoyama: 10, urban: 30 },
  actionEffects: {
    mowingBlockTurns: 3,
    cleanUpSatoyamaDelta: -12,
    cleanUpUrbanFactorDelta: -0.3,
  },
  neglectDrift: { satoyama: 1, urban: 0.02 },
})

/**
 * エンジンが実際に使うモデル。
 * 差し替えるときはここを別モデルに変更するだけ（例: createRiskModel('v2', ...)）。
 */
export const activeRiskModel: RiskModel = defaultRiskModel
