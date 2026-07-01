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
   * §4.3/§4.4 人間の介入値。負で遭遇率を抑制する上昇式の項。
   * 里山・市街とも加算項（負で抑制、中立0）。
   */
  intervention: {
    satoyama: number
    urban: number
  }
  /**
   * §5.2-3 電気柵の残り有効ターン数（>0 で有効）。
   * 里山遭遇を1度だけ無効化し、発揮すると即座に0（消滅）。未発揮なら毎ターン減って失効。
   */
  electricFenceTurns: number
  /** §5.2-1 広域草刈りによる山林→里山流入カットの残りターン数。 */
  mowingBlockTurns: number
  /** 誘引物除去の持続残ターン（>0で intervention が有効）。0で intervention を中立へ戻す。 */
  interventionTurns: number
  /** 箱わな待ち伏せの残ターン（>0で有効）。捕獲成立で即0。 */
  trapTurns: number
  /** 山林直接流入(第1項)の恒久係数（初期1.0）。箱わな捕獲成立で ×trapForestFactor（下限クランプ）。 */
  forestInfluxFactor: number
  /** パトロール巡回の残ターン（>0の間、出没時の不満加算を軽減）。 */
  patrolTurns: number
  /** 追い払いの慣れ（隠し。使用で増え、不使用で回復。大きいほど追い払いが効かない）。 */
  hazingHabituation: number
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

  /** 一度きりの節目フレーバーを表示済みか（ゲームごとにリセット）。 */
  milestones: {
    /** 初の里山出没（被害発生）を表示済み。 */
    firstSatoyama: boolean
    /** 初の市街地出没を表示済み。 */
    firstUrban: boolean
    /** 不満度が初めて 80% 以上に達したことを表示済み。 */
    highDissatisfaction: boolean
  }
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
  | 'electric-fence' // 電気柵（里山遭遇を1度無効化）
  | 'attractant-removal' // 誘引物の除去（数ターン里山・市街の上昇を抑制）
  | 'box-trap' // 箱わなによる捕獲（待ち伏せ→捕獲で里山出没を無効化し、山林直接流入を恒久ダウン）
  | 'emergency-shooting' // 緊急銃猟（市街決壊時のみ発動可。市街遭遇率を即時に叩き落とすが不満が少し上がる）
  | 'patrol' // パトロール（巡回中の地区は出没時の不満加算を軽減）
  | 'hazing' // 追い払い（即時に遭遇率を薄く下げるが、繰り返すほど慣れて効果が逓減）

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
  /** flavor 内で用語ツールチップ対象となる現実用語（議題の realTerms と同様。任意）。 */
  realTerms?: string[]
  /** ヘルプモーダル：現実の施策の解説（教育的。ゲーム数値は含めない）。 */
  realWorldDesc: string
}

/** UI 上で予約中（実行前）の施策。地区とコマンド種別の組。 */
export interface PendingAction {
  districtId: DistrictId
  kind: ActionKind
}
