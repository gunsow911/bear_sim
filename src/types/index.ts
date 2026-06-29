/**
 * ゲーム全体の型定義。
 * spec.md の §3（リソース）, §4（環境・数理モデル）, §5（フェーズ）, §6（勝敗）に対応する。
 * これらは UI / 状態管理 / ゲームエンジンの全層で共有される単一の真実源。
 */

// ───────────────────────────────────────────────────────────
// §4.2-③ 地区特徴ラベル（隣接の移動しやすさ補正に使う）
// ───────────────────────────────────────────────────────────

/** 地区特徴ラベル。隣接関係に対して移動しやすさ係数を増幅・減衰させる。 */
export type DistrictFeature =
  | 'water' // 🌊 水系接続：共有する隣接同士で移動しやすさ+補正
  | 'green-corridor' // 🌲 グリーン回廊：山林境界が多く移動しやすさ+補正
  | 'trunk-road' // 🚧 幹線道路：対象隣接からの移動しやすさ-補正

// ───────────────────────────────────────────────────────────
// §4 ステージ（市町）と地区（セクター）の静的定義
//   ── データ層の stages.json / districts.geojson から読み込む不変データ
// ───────────────────────────────────────────────────────────

/** 隣接関係（有向）。from 地区から見た to 地区への接続と、その境界の特徴。 */
export interface Adjacency {
  /** 隣接先の地区 ID */
  to: DistrictId
  /**
   * この境界が持つ特徴ラベル群（§4.2-③）。
   * 移動しやすさ係数の増減に使う（例: green-corridor で増幅、trunk-road で減衰）。
   */
  features: DistrictFeature[]
}

export type DistrictId = string
export type StageId = string

/** 地区（セクター）の静的パラメータ（§4.2）。ゲーム中に変化しない。 */
export interface DistrictDef {
  id: DistrictId
  name: string
  /** §4.2-② ベース生息密度（YPくまっぷ過去データ由来）。 */
  baseDensity: number
  /**
   * §4.2-② 里山/市街比（森林・農地 / 宅地）。
   * 小さいほど都市型で、決壊時に市街遭遇率がバーストする（§4.4）。
   */
  satoyamaUrbanRatio: number
  /** §4.2-② 山林隣接。true の地区のみ活発度の直接流入を受ける（§4.3 第1項）。 */
  mountainAdjacent: boolean
  /** §4.2-③ この地区が持つ特徴ラベル（表示用）。 */
  features: DistrictFeature[]
  /** §4.1 隣接トポロジ（この地区が接する地区群）。 */
  adjacencies: Adjacency[]
}

/** ステージ（市町）の静的定義。 */
export interface StageDef {
  id: StageId
  name: string
  /** §3 自治体規模により異なる初期予算。 */
  initialBudget: number
  /** §6 防衛期間（耐え抜くべきターン数）。 */
  maxTurns: number
  /** §4.1 この市町を構成する 3〜5 地区。 */
  districts: DistrictDef[]
}

// ───────────────────────────────────────────────────────────
// §3 リソース & 動的なゲーム状態
// ───────────────────────────────────────────────────────────

/** 地区ごとの可変状態（ターンごとに変化する）。 */
export interface DistrictState {
  id: DistrictId
  /** §4.3 里山遭遇率（0〜100 を想定）。 */
  satoyamaEncounterRate: number
  /** §4.4 市街遭遇率（0〜100 を想定）。 */
  urbanEncounterRate: number
  /**
   * §4.3/§4.4 人間の介入値。負で遭遇率を抑制、放置で増加。
   * 里山側・市街側で別管理する。
   */
  intervention: {
    satoyama: number
    urban: number
  }
  /** §5.2-3 電気柵による「里山遭遇の1回無効化」が有効か。 */
  electricFenceActive: boolean
  /** §5.2-1 広域草刈りによる流入遮断の残りターン数。 */
  mowingBlockTurns: number
}

/** コア・ループのフェーズ（§2.1）。 */
export type GamePhase =
  | 'agenda' // 議題フェーズ
  | 'action' // 対策フェーズ
  | 'encounter' // 遭遇フェーズ
  | 'gameover'
  | 'victory'

/** ゲーム全体の可変状態。 */
export interface GameState {
  stageId: StageId
  phase: GamePhase
  /** 現在ターン（1 始まり）。 */
  turn: number
  maxTurns: number

  // §3 リソース
  /** 予算（切り崩し型・有限）。 */
  budget: number
  /** 指示ポイント（毎ターン全回復）。 */
  instructionPoints: number
  /** 不満度（蓄積型 HP。100 で敗北）。 */
  dissatisfaction: number

  /** §4.2-① 活発度（全地区共通。季節変動やイベントで上昇）。 */
  activeness: number

  /** 地区 ID → 可変状態。 */
  districts: Record<DistrictId, DistrictState>
}

// ───────────────────────────────────────────────────────────
// §5 フェーズで扱うイベント / 議題 / 対策コマンド
// ───────────────────────────────────────────────────────────

/** §5.1-① 突発ランダムイベント。 */
export interface RandomEvent {
  id: string
  name: string
  description: string
  /** 発生確率（0〜1）。 */
  probability: number
}

/** §5.1-② 本日の議題（コスト無料・純バフ）。 */
export interface Agenda {
  id: string
  name: string
  description: string
}

/** §5.2 対策コマンドの種別。 */
export type ActionKind =
  | 'mowing' // 広域草刈り（予算0・数ターン流入遮断）
  | 'clean-up' // クリーン作戦（10万円・永続減少）
  | 'electric-fence' // 電気柵（30万円・里山遭遇を1度無効化）

/** §5.2 対策コマンドの定義。 */
export interface ActionDef {
  kind: ActionKind
  name: string
  /** 予算コスト（円）。 */
  budgetCost: number
  /** 指示ポイントコスト。 */
  instructionPointCost: number
  description: string
}
