/**
 * 季節による活発度カーブ（純関数）。
 *
 * ⚠️ 全地区共通の「時間シグナル」。空間シグナルの baseDensity（地区別）とは役割を分離し、
 *    季節性の二重計上を避ける（詳細は docs/DATA.md）。
 *
 * カーブは YPくまっぷ（山口県クマ目撃情報・県全域906件）の月別分布（平均=1 に正規化した
 * 月形状）由来。16ターン=7月〜10月の窓に割り当て、7月開始を活発度 10・10月ピークを 80 にスケールする。
 *
 * ⚠️ 生の月形状は8月が谷になるが、これは山口2024-26のローカルな「出没件数」の減であって、
 *    クマの生理的な活動低下ではない（夏も普通に活動。むしろ夏に出没が増える地域もある。
 *    エビデンスと議論は docs/DATA.md）。ゲームの「活発度」は終盤の荒食い期へ向けて単調に
 *    高まる緊張を表すため、夏の谷は累積最大でならし、7月→10月を非減少にする（秋ピークは残す）。
 *    算出は scripts/build-bear-data.mjs。
 */

import type { GameState } from '@/types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * 月形状（平均=1、県全域906件）の生値。7〜10月ぶんのみ使用。
 * ⚠️ scripts/build-bear-data.mjs の印字値。データ更新時はスクリプト再実行して反映する。
 */
const MONTH_SHAPE_RAW: Record<number, number> = { 7: 1.101, 8: 0.835, 9: 1.485, 10: 2.533 }

/**
 * 単調化した月形状。8月の谷（＝ローカルな出没減。上のコメント参照）を累積最大でならし、
 * 7月→10月を非減少にする。10月の荒食いピークはそのまま残る。
 */
const MONTH_SHAPE: Record<number, number> = (() => {
  const out: Record<number, number> = {}
  let running = 0
  for (const m of [7, 8, 9, 10]) {
    running = Math.max(running, MONTH_SHAPE_RAW[m])
    out[m] = running
  }
  return out
})()

/**
 * 月形状を活発度へ写す2点アフィン写像の基準。
 * 7月（開始）→ START_ACTIVENESS、10月（ピーク）→ PEAK_ACTIVENESS に対応づける。
 * 開始を低め(10)にし、終盤(80)へ向けて高まる。イベントで上下の補正が加わる前提。
 */
const START_ACTIVENESS = 10
const PEAK_ACTIVENESS = 80

/** 月形状値 s を活発度へ写す（shape[7]→START、shape[10]→PEAK の線形写像）。 */
function activenessFromShape(s: number): number {
  const s0 = MONTH_SHAPE[7]
  const s1 = MONTH_SHAPE[10]
  return START_ACTIVENESS + ((PEAK_ACTIVENESS - START_ACTIVENESS) * (s - s0)) / (s1 - s0)
}

/** 月位置 pos（7.0〜10.0）に対する月形状を線形補間で返す。 */
function monthShapeAt(pos: number): number {
  const lo = Math.floor(pos)
  const hi = Math.min(lo + 1, 10)
  const t = pos - lo
  return MONTH_SHAPE[lo] + (MONTH_SHAPE[hi] - MONTH_SHAPE[lo]) * t
}

/**
 * ターン（1始まり）に対する「季節基準の活発度」(0〜100)。
 * turn=1 で 7月（開始＝10）、turn=maxTurns で 10月（ピーク＝80）。窓は maxTurns に依らず 7〜10月。
 */
export function seasonalActiveness(turn: number, maxTurns: number): number {
  if (maxTurns <= 1) return PEAK_ACTIVENESS
  const frac = clamp((turn - 1) / (maxTurns - 1), 0, 1)
  const pos = 7 + 3 * frac // 7.0(7月) 〜 10.0(10月)
  return Math.round(activenessFromShape(monthShapeAt(pos)))
}

/**
 * 週の進行に伴う季節の押し上げを活発度へ反映する。
 * 前週比の増分を加算するため、プレイヤーの抑制（注意喚起・学習放獣）やイベントの
 * 上振れは活発度に積み重なる。カーブは単調非減少なので増分は常に 0 以上。
 */
export function applySeasonalActiveness(game: GameState): GameState {
  const delta =
    seasonalActiveness(game.turn, game.maxTurns) -
    seasonalActiveness(game.turn - 1, game.maxTurns)
  return { ...game, activeness: clamp(game.activeness + delta, 0, 100) }
}
