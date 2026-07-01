/**
 * 数理モデル（spec.md §4.3 / §4.4）の純関数群。
 * フレームワーク非依存。UI / store から独立しており、Vitest で単体テスト可能。
 */

import type { Adjacency, DistrictDef, DistrictFeature } from '@/types'

/** 数理モデルのチューニング係数。バランス調整の単一の入口。 */
export interface ModelCoefficients {
  /** 全体スケール係数 S。 */
  scale: number
  /**
   * 山林→里山の直接流入(第1項)で使う活発度の下限。
   * 直接流入は max(活発度, この値) を使うため、活発度が0まで抑制されても山からの供給は
   * 途絶えず、下限ぶんのベースラインが残る（クマは常に一定は里へ降りる）。
   * 高活発度側の較正には影響しない（活発度 ≥ 下限 なら従来どおり）。
   */
  minForestActiveness: number
  /** 防波堤の決壊係数（この閾値を超えた里山遭遇率だけが市街へ溢れる）。 */
  breachThreshold: number
  /**
   * 決壊スケール係数（市街遭遇率の上昇度全体に掛ける、0〜1）。
   * 1 で従来の急峻な決壊、小さくするほど決壊が緩やかになる。バランス調整の主ノブ。
   */
  urbanBreachScale: number
  /**
   * 決壊のソフトさ（softplus の幅 k）。ハードな max(0, 里山−閾値) を滑らかにする。
   * 0 で従来の折れ線（角あり）、大きいほど閾値前後がなだらかに立ち上がる。
   */
  breachSoftness: number
  /**
   * 市街への直接侵入係数。決壊を待たず、里山遭遇率 × 市街度(1−里山率) に比例して
   * 市街遭遇率を上げる。市街度が高い（里山率が低い）地区ほど強く効き、「里山→市街」の
   * 順番の縛りを都市部で外す（街なかは直接出没しやすい）。
   */
  urbanDirectScale: number
  /** 隣接の基礎移動しやすさ。 */
  baseMobility: number
  /**
   * 隣接里山遭遇率からの流入に掛ける補正（0〜1）。
   * すべての熊が隣の地区へ移動するわけではないことを表し、里山遭遇率の急騰を抑える。
   * 1 で従来どおり、小さいほど地区間の伝播が緩やか。
   */
  neighborInfluxScale: number
  /**
   * 上流への逆流係数（ソフト方向バイアス、0〜1）。
   * クマは 山林→里山→市街（＝里山率 satoyamaRatio の高い地区→低い地区）へ下る向きに
   * 進みやすい。里山率が自地区以上の隣接（＝上流・森林側）からの流入は全量（×1）、
   * 里山率が自地区より低い隣接（＝下流・市街側）からの逆流はこの係数だけに弱める。
   * 1 で無方向（従来）、0 で逆流ゼロ（完全一方向）。
   */
  backflowScale: number
  /** 🌊 水系接続を両地区が共有する場合の加算。 */
  waterBonus: number
  /** 🌲 グリーン回廊の加算。 */
  greenCorridorBonus: number
  /** 🚧 幹線道路の減算（移動しにくくなる）。 */
  trunkRoadPenalty: number
}

export const DEFAULT_COEFFICIENTS: ModelCoefficients = {
  // 里山率（0〜1）が分母のため、比(0〜∞)時代より分母が小さい。scale を下げて調整。
  scale: 0.1,
  minForestActiveness: 10, // 活発度0でも山林直接流入が残るベースライン。⚠️暫定値・要チューニング
  breachThreshold: 30,
  urbanBreachScale: 0.5, // 市街決壊を緩和（従来=1.0は急峻すぎた）
  breachSoftness: 8, // 決壊閾値前後を softplus で滑らかに（角の二段挙動を解消）
  urbanDirectScale: 0.3, // 市街度に比例した直接侵入。⚠️暫定値・要チューニング
  baseMobility: 0.2,
  // 方向バイアス導入で逆流ぶんが減るため、対称時代(0.4)より引き上げて総流入を補償。
  // ⚠️ 暫定値。挙動を見て要チューニング。
  neighborInfluxScale: 0.8,
  backflowScale: 0.2, // 上流→下流は全量、下流→上流の逆流は 0.2 に弱める（ソフト方向バイアス）
  waterBonus: 0.15,
  greenCorridorBonus: 0.25,
  trunkRoadPenalty: 0.3,
}

/**
 * 隣接境界の「移動しやすさ」係数を地区特徴から算出する。
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
  /**
   * 隣接地区の里山率(satoyamaRatio)を id 引きできるマップ。ソフト方向バイアスに使う。
   * 省略時は方向バイアスなし（全隣接を全量流入＝従来挙動）。
   */
  neighborSatoyamaRatios?: Record<string, number>
  /** §4.3 人間の介入(里山)。負で抑制。 */
  humanIntervention: number
  /**
   * 第1項（山林→里山の直接流入）に掛ける係数（0〜1、既定1）。
   * 広域草刈り中は 1−カット率（例 0.5）を渡して流入を弱める。0 で完全遮断。
   */
  mountainInfluxFactor?: number
  /**
   * 第2項（隣接地区からの移動流入）に掛ける係数（0〜1、既定1）。
   * 広域草刈り中は 1−カット率（例 0.5）を渡して地区間の移動も弱める。
   */
  neighborInfluxFactor?: number
  /** 第1項（山林直接流入）に掛ける恒久係数（0〜1、既定1）。箱わな捕獲で下がる。 */
  forestInfluxFactor?: number
  coeff?: ModelCoefficients
}

/**
 * §4.3 里山遭遇率の上昇度
 *   = S * {(max(活発度, 下限) * 生息密度) / 里山率}          … 山林隣接地区のみ
 *   + 隣接流入補正 * Σ(移動しやすさ * 隣接の里山遭遇率)
 *   + 人間の介入
 *
 * 第2項に neighborInfluxScale を掛け、地区間の伝播（＝里山遭遇率の急騰）を抑える。
 * 全頭が隣へ移動するわけではない、という現実の含意も表す。
 * さらにソフト方向バイアス（backflowScale）で、山林→里山→市街（里山率の高い→低い）方向の
 * 流入を全量、逆向き（下流→上流）の逆流を弱める。
 */
export function satoyamaRise(input: SatoyamaRiseInput): number {
  const coeff = input.coeff ?? DEFAULT_COEFFICIENTS
  const {
    district,
    activeness,
    neighborSatoyamaRates,
    neighborSatoyamaRatios,
    humanIntervention,
    mountainInfluxFactor = 1,
    neighborInfluxFactor = 1,
    forestInfluxFactor = 1,
  } = input

  // 第1項：山林からの直接流入（山林隣接地区のみ）。mountainInfluxFactor で弱める（草刈り＝0.5）。
  // forestInfluxFactor は箱わな捕獲などで下がる恒久係数（DistrictState.forestInfluxFactor）。
  // 活発度は下限 minForestActiveness でクランプ：0まで抑制されてもベースラインは途絶えない。
  const forestActiveness = Math.max(activeness, coeff.minForestActiveness)
  const directInflux = district.mountainAdjacent
    ? coeff.scale * ((forestActiveness * district.baseDensity) / district.satoyamaRatio) * mountainInfluxFactor * forestInfluxFactor
    : 0

  // 第2項：隣接地区からの侵入（移動しやすさ × 隣接の里山遭遇率の総和）に流入補正を掛ける。
  // ソフト方向バイアス：上流(里山率≧自地区)は全量、下流(里山率<自地区)からの逆流は backflowScale 倍。
  let neighborInflux = 0
  for (const adj of district.adjacencies) {
    const neighborRate = neighborSatoyamaRates[adj.to] ?? 0
    const neighborRatio = neighborSatoyamaRatios?.[adj.to]
    const direction =
      neighborRatio === undefined || neighborRatio >= district.satoyamaRatio
        ? 1
        : coeff.backflowScale
    neighborInflux += computeMobility(adj, coeff) * neighborRate * direction
  }

  // 第3項：人間の介入。第2項は neighborInfluxFactor で弱める（草刈り＝0.5）。
  return (
    directInflux + coeff.neighborInfluxScale * neighborInflux * neighborInfluxFactor + humanIntervention
  )
}

/** §4.4 市街遭遇率の上昇度を計算するための入力。 */
export interface UrbanRiseInput {
  district: DistrictDef
  /** この地区の現在の里山遭遇率。 */
  satoyamaEncounterRate: number
  /** §4.4 人間の介入(市街)。加算項（負で抑制、中立0）。 */
  humanIntervention: number
  coeff?: ModelCoefficients
}

/**
 * ソフトプラス。max(0, x) を幅 k で滑らかにした関数。
 * x≫0 で ≈x、x≪0 で ≈0、x=0 で k·ln2。k<=0 なら従来のハードな max(0, x)。
 * 数値安定のため log-sum-exp 形で計算する。
 */
function softplus(x: number, k: number): number {
  if (k <= 0) return Math.max(0, x)
  return Math.max(x, 0) + k * Math.log1p(Math.exp(-Math.abs(x) / k))
}

/**
 * §4.4 市街遭遇率の上昇度（防波堤決壊モデル ＋ 市街直接侵入 ＋ 人間の介入）
 *   = 決壊項  : urbanBreachScale * softplus(里山遭遇率 − 決壊閾値) / 里山率   … C: ソフト化
 *   + 直接項  : urbanDirectScale * 里山遭遇率 * (1 − 里山率)                … A: 直接侵入
 *   + 人間の介入（加算項。負で抑制、中立0）                                   … 里山側 satoyamaRise と対称
 *
 * C（ソフト化）: 従来の max(0, …) の角（0→急上昇の二段挙動）を softplus で滑らかにする。
 *   閾値をわずかに下回っても市街は少しだけ反応し、上回るほど従来どおり線形に立ち上がる。
 * A（直接侵入）: 決壊を待たず、里山遭遇率に比例して市街も上がる。市街度(1−里山率)で重み付けし、
 *   都市部ほど強い（＝街なかは直接出没しやすい）。山間(里山率≒0.9)ではほぼ効かず levee が残る。
 * 里山率が小さい都市型地区ほど、決壊項の分母(1/里山率)と直接項の(1−里山率)の両方で市街が過敏に上がる。
 */
export function urbanRise(input: UrbanRiseInput): number {
  const coeff = input.coeff ?? DEFAULT_COEFFICIENTS
  const { district, satoyamaEncounterRate, humanIntervention } = input
  const s = satoyamaEncounterRate
  const urbanness = 1 - district.satoyamaRatio

  const overflow = softplus(s - coeff.breachThreshold, coeff.breachSoftness)
  const breachTerm = coeff.urbanBreachScale * overflow / district.satoyamaRatio
  const directTerm = coeff.urbanDirectScale * s * urbanness

  // 人間の介入は加算（負で抑制、中立0）。里山側 satoyamaRise と対称。
  return breachTerm + directTerm + humanIntervention
}
