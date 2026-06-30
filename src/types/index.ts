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
   * §4.2-② 里山率（里山が占める割合, 0〜1）。0=全市街 / 1=全里山。
   * 小さい（都市型）ほど §4.4 の分母が小さくなり、決壊時に市街遭遇率がバーストする。
   */
  satoyamaRatio: number
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
  /** 今週出没したため、翌週開始時に里山遭遇率を減衰させる（遭遇補正の遅延適用）。 */
  pendingDecaySatoyama: boolean
  /** 今週出没したため、翌週開始時に市街遭遇率を減衰させる。 */
  pendingDecayUrban: boolean
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
  /** 指示ポイント（毎ターン全回復）。 */
  instructionPoints: number
  /** 不満度（蓄積型 HP。100 で敗北）。 */
  dissatisfaction: number

  /** 活発度（全地区共通。季節変動やイベントで上昇）。 */
  activeness: number

  /** 地区 ID → 可変状態。 */
  districts: Record<DistrictId, DistrictState>
}

// ───────────────────────────────────────────────────────────
// §5 フェーズで扱うイベント / 議題 / 対策コマンド
// ───────────────────────────────────────────────────────────

/** §5.1-① 突発ランダムイベント。apply は全体/即時の状態変更。 */
export interface RandomEvent {
  id: string
  name: string
  /** フレーバー文（状況描写）。現実用語を含めるとツールチップ対象になる。 */
  description: string
  /** 効果の端的な表記（例: 「活発度 +40」）。フレーバーとは別に明示する。 */
  effect: string
  /** 1件として抽選される相対的な重み（rollEvent 内で正規化）。 */
  weight: number
  /** 説明文中で用語ツールチップ対象となる現実用語。 */
  realTerms?: string[]
  apply: (game: GameState) => GameState
}

/** §5.1-② 本日の議題（コスト無料・純バフ）。 */
export interface Agenda {
  id: string
  name: string
  /** フレーバー文（状況描写）。現実用語を含めるとツールチップ対象になる。 */
  description: string
  /** 効果の端的な表記（例: 「活発度 -15」）。フレーバーとは別に明示する。 */
  effect: string
  realTerms?: string[]
  apply: (game: GameState) => GameState
}

/** 汎用メッセージウインドウ用の1ページ分のメッセージ（状況説明・ヒント等）。 */
export interface GameMessage {
  id: string
  /** 見出し前に置く絵文字など（任意）。 */
  icon?: string
  title: string
  /** 本文。改行(\n)はそのまま表示される。 */
  body: string
}

/** §5.2 対策コマンドの種別。 */
export type ActionKind =
  | 'mowing' // 広域草刈り（数ターン流入遮断）
  | 'clean-up' // クリーン作戦（永続減少）
  | 'electric-fence' // 電気柵（里山遭遇を1度無効化）

/** §5.2 対策コマンドの定義。 */
export interface ActionDef {
  kind: ActionKind
  name: string
  /** 指示ポイントコスト。 */
  instructionPointCost: number
  /** ナラティブな状況描写文（議題と同テイスト）。 */
  flavor: string
  /** 質的な効果（例「この地区の里山の出没を1回だけ防ぐ」）。数値は出さない。 */
  effectLabel: string
  /** 持続（例「次の出没を1回」「永続」「約3週間」）。表示用テキストで数理パラメータと自動連動はしない。 */
  duration: string
  /** flavor 内で用語ツールチップ対象となる現実用語（議題の realTerms と同様。任意）。 */
  realTerms?: string[]
}

/** UI 上で予約中（実行前）の施策。地区とコマンド種別の組。 */
export interface PendingAction {
  districtId: DistrictId
  kind: ActionKind
}
