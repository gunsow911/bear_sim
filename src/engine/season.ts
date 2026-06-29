/**
 * 季節による活発度カーブ（純関数）。
 *
 * 盛夏→晩秋（クライマックス）に向けてクマの活発度が高まる現実（冬眠前の荒食い期が
 * 最危険）を表現する。終盤を“最も活発”にするため、後半ほど加速する単調増加カーブ。
 *
 * ⚠️ 係数は【仮】。バランス調整はここで行う。
 */

import type { GameState } from '@/types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** カーブのパラメータ（仮）。 */
const SEASON_LOW = 10 // 初週（盛夏）の基準活発度
const SEASON_HIGH = 80 // 最終週（晩秋・荒食い期）の基準活発度
const SEASON_EXP = 1.8 // >1 で終盤に向けて加速

/**
 * ターン（1始まり）に対する「季節基準の活発度」(0〜100)。
 * turn=1 で SEASON_LOW、turn=maxTurns で SEASON_HIGH。
 */
export function seasonalActiveness(turn: number, maxTurns: number): number {
  if (maxTurns <= 1) return SEASON_HIGH
  const frac = clamp((turn - 1) / (maxTurns - 1), 0, 1)
  return Math.round(SEASON_LOW + (SEASON_HIGH - SEASON_LOW) * Math.pow(frac, SEASON_EXP))
}

/**
 * 週の進行に伴う季節の押し上げを活発度へ反映する。
 * 前週比の増分を加算するため、プレイヤーの抑制（注意喚起・学習放獣）やイベントの
 * 上振れは活発度に積み重なり、季節の圧力はじわじわ効き続ける。
 */
export function applySeasonalActiveness(game: GameState): GameState {
  const delta =
    seasonalActiveness(game.turn, game.maxTurns) -
    seasonalActiveness(game.turn - 1, game.maxTurns)
  return { ...game, activeness: clamp(game.activeness + delta, 0, 100) }
}
