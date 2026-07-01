/**
 * ヒートマップ演出のための「ローリング月窓」フィルタ（純関数）。
 *
 * ゲームの現在ターン（1〜maxTurns、7月〜10月に対応）を暦日位置に写像し、その中心 ±約15日
 * の窓に入る目撃点だけを返す。年は無視し全年（2024〜）を暦日で重ねる（密度確保）。
 * ターン進行でホットゾーンが Jul→Oct と移り、10月に向けて盛り上がる（活発度カーブと連動）。
 */

import { SIGHTINGS, type Sighting } from './bearInsight'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** 各月の1日の通し日（非閏年、index 1..12）。7〜10月のみ使用。 */
const MONTH_START_DOY: Record<number, number> = {
  7: 182, // 7/1
  8: 213, // 8/1
  9: 244, // 9/1
  10: 274, // 10/1
}

/** (月, 日) → 通し日（day-of-year, 非閏年）。 */
export function dayOfYear(month: number, day: number): number {
  return (MONTH_START_DOY[month] ?? 182) + (day - 1)
}

/** 窓の半幅（日）。中心 ±HALF_WINDOW_DAYS を含める。 */
const HALF_WINDOW_DAYS = 15

/** turn1=7/15、turn16=10/15 を中心にするアンカー（各月の中旬）。 */
const WINDOW_START_DOY = dayOfYear(7, 15) // 196
const WINDOW_END_DOY = dayOfYear(10, 15) // 288

/** 現在ターンの窓の中心日（通し日）。 */
export function windowCenterDoy(turn: number, maxTurns: number): number {
  if (maxTurns <= 1) return WINDOW_END_DOY
  const frac = clamp((turn - 1) / (maxTurns - 1), 0, 1)
  return WINDOW_START_DOY + (WINDOW_END_DOY - WINDOW_START_DOY) * frac
}

/**
 * 現在ターンのローリング月窓に入る目撃点を返す。
 * 既定は生成済みの SIGHTINGS（山口市内144点）。テストのため配列を注入できる。
 */
export function sightingsForTurn(
  turn: number,
  maxTurns: number,
  sightings: readonly Sighting[] = SIGHTINGS,
): Sighting[] {
  const center = windowCenterDoy(turn, maxTurns)
  return sightings.filter((s) => Math.abs(dayOfYear(s.month, s.day) - center) <= HALF_WINDOW_DAYS)
}
