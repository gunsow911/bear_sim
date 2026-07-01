/**
 * 季節による活発度カーブ（純関数）。
 *
 * ⚠️ 全地区共通の「時間シグナル」。空間シグナルの baseDensity（地区別）とは役割を分離し、
 *    季節性の二重計上を避ける（詳細は docs/DATA.md）。
 *
 * カーブは 7月開始 10 → 最終週 100 の**べき乗カーブ**（単調増加）。序盤からじわっと増え、
 * 終盤の荒食い期（冬眠前の過食）に向けて加速する（SEASON_EXP>1）。
 * ・下がるのはイベント／議題（注意喚起・学習放獣）等の介入時のみ（季節ぶんは常に非減少）。
 * ・YPくまっぷの月別分布は「秋に向け高まる」性格の裏づけに使うが、生データの8月の谷は
 *   ローカルな出没件数の減（＝活動低下ではない。エビデンスは docs/DATA.md）なので採らず、
 *   ゲームの緊張曲線としては単調なべき乗ランプにしている。
 */

import type { GameState } from '@/types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** カーブの端点と曲率（バランス調整の入口）。 */
const START_ACTIVENESS = 10 // 初週（盛夏）の基準
const PEAK_ACTIVENESS = 100 // 最終週（晩秋・荒食い期）の基準
const SEASON_EXP = 2 // >1 で終盤に向けて加速。大きいほど前半が緩く終盤が急

/**
 * ターン（1始まり）に対する「季節基準の活発度」(0〜100)。
 * turn=1 で START(=10)、turn=maxTurns で PEAK(=100)。frac^SEASON_EXP のべき乗ランプ。
 */
export function seasonalActiveness(turn: number, maxTurns: number): number {
  if (maxTurns <= 1) return PEAK_ACTIVENESS
  const frac = clamp((turn - 1) / (maxTurns - 1), 0, 1)
  return Math.round(START_ACTIVENESS + (PEAK_ACTIVENESS - START_ACTIVENESS) * Math.pow(frac, SEASON_EXP))
}

/**
 * 週の進行に伴う季節の押し上げを活発度へ反映する。
 * 前週比の増分を加算するため、プレイヤーの抑制（注意喚起・学習放獣）やイベントの
 * 上振れは活発度に積み重なる。カーブは単調増加なので増分は常に 0 以上
 * （＝季節で下がることはない。下がるのは介入時のみ）。
 */
export function applySeasonalActiveness(game: GameState): GameState {
  const delta =
    seasonalActiveness(game.turn, game.maxTurns) -
    seasonalActiveness(game.turn - 1, game.maxTurns)
  return { ...game, activeness: clamp(game.activeness + delta, 0, 100) }
}
