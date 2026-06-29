/**
 * 数理モデル（spec.md §4.3 / §4.4）の純関数群。
 * フレームワーク非依存。UI / store から独立しており、Vitest で単体テスト可能。
 *
 * ⚠️ Step 1（足場）時点では「数式の骨格」を提供する。係数のバランス調整と
 *    §4.5「囲まれた市街地」シナリオの網羅的検証は Step 2（TDD）で行う。
 */

import type { Adjacency, DistrictDef, DistrictFeature } from '@/types'

/** 数理モデルのチューニング係数。バランス調整の単一の入口。 */
export interface ModelCoefficients {
  /** §4.3 全体スケール係数 S。 */
  scale: number
  /** §4.4 防波堤の決壊係数（この閾値を超えた里山遭遇率だけが市街へ溢れる）。 */
  breachThreshold: number
  /** 隣接の基礎移動しやすさ。 */
  baseMobility: number
  /** 🌊 水系接続を両地区が共有する場合の加算。 */
  waterBonus: number
  /** 🌲 グリーン回廊の加算。 */
  greenCorridorBonus: number
  /** 🚧 幹線道路の減算（移動しにくくなる）。 */
  trunkRoadPenalty: number
}

export const DEFAULT_COEFFICIENTS: ModelCoefficients = {
  scale: 0.5,
  breachThreshold: 50,
  baseMobility: 0.2,
  waterBonus: 0.15,
  greenCorridorBonus: 0.25,
  trunkRoadPenalty: 0.3,
}

/**
 * §4.2-③ 隣接境界の「移動しやすさ」係数を地区特徴から算出する。
 * green-corridor / water で増幅、trunk-road で減衰。下限 0。
 */
export function computeMobility(
  adjacency: Adjacency,
  coeff: ModelCoefficients = DEFAULT_COEFFICIENTS,
): number {
  let mobility = coeff.baseMobility
  for (const feature of adjacency.features) {
    mobility += featureModifier(feature, coeff)
  }
  return Math.max(0, mobility)
}

function featureModifier(feature: DistrictFeature, coeff: ModelCoefficients): number {
  switch (feature) {
    case 'water':
      return coeff.waterBonus
    case 'green-corridor':
      return coeff.greenCorridorBonus
    case 'trunk-road':
      return -coeff.trunkRoadPenalty
  }
}

/** §4.3 里山遭遇率の上昇度を計算するための入力。 */
export interface SatoyamaRiseInput {
  district: DistrictDef
  /** §4.2-① 全地区共通の活発度。 */
  activeness: number
  /** 隣接地区の「現在の里山遭遇率」を id 引きできるマップ。 */
  neighborSatoyamaRates: Record<string, number>
  /** §4.3 人間の介入(里山)。負で抑制。 */
  humanIntervention: number
  coeff?: ModelCoefficients
}

/**
 * §4.3 里山遭遇率の上昇度
 *   = S * {(活発度 * 生息密度) / 里山市街比}        … 山林隣接地区のみ
 *   + Σ(移動しやすさ * 隣接の里山遭遇率)
 *   + 人間の介入
 */
export function satoyamaRise(input: SatoyamaRiseInput): number {
  const coeff = input.coeff ?? DEFAULT_COEFFICIENTS
  const { district, activeness, neighborSatoyamaRates, humanIntervention } = input

  // 第1項：山林からの直接流入（山林隣接地区のみ）
  const directInflux = district.mountainAdjacent
    ? coeff.scale * ((activeness * district.baseDensity) / district.satoyamaUrbanRatio)
    : 0

  // 第2項：隣接地区からの侵入（移動しやすさ × 隣接の里山遭遇率の総和）
  let neighborInflux = 0
  for (const adj of district.adjacencies) {
    const neighborRate = neighborSatoyamaRates[adj.to] ?? 0
    neighborInflux += computeMobility(adj, coeff) * neighborRate
  }

  // 第3項：人間の介入
  return directInflux + neighborInflux + humanIntervention
}

/** §4.4 市街遭遇率の上昇度を計算するための入力。 */
export interface UrbanRiseInput {
  district: DistrictDef
  /** この地区の現在の里山遭遇率。 */
  satoyamaEncounterRate: number
  /** §4.4 人間の介入(市街)。負で抑制。 */
  humanIntervention: number
  coeff?: ModelCoefficients
}

/**
 * §4.4 市街遭遇率の上昇度（防波堤決壊モデル）
 *   = max(0, 里山遭遇率 - 決壊係数) * (人間の介入 / 里山市街比)
 *
 * 里山遭遇率が決壊係数以下なら 0（クマは里山で引き返す）。
 * 里山市街比が小さい都市型地区ほど分母が小さく、決壊時に乗算でバーストする。
 */
export function urbanRise(input: UrbanRiseInput): number {
  const coeff = input.coeff ?? DEFAULT_COEFFICIENTS
  const { district, satoyamaEncounterRate, humanIntervention } = input

  const overflow = Math.max(0, satoyamaEncounterRate - coeff.breachThreshold)
  if (overflow === 0) return 0

  return overflow * (humanIntervention / district.satoyamaUrbanRatio)
}
