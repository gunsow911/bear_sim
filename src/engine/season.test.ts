import { describe, it, expect } from 'vitest'
import { seasonalActiveness, applySeasonalActiveness } from './season'
import type { GameState } from '@/types'

describe('seasonalActiveness（べき乗カーブ 10→100）', () => {
  it('turn1=開始値10、turn16=ピーク100', () => {
    expect(seasonalActiveness(1, 16)).toBe(10)
    expect(seasonalActiveness(16, 16)).toBe(100)
  })

  it('単調非減少（秋の荒食いへ向け一本調子。季節では下がらない）', () => {
    const curve = Array.from({ length: 16 }, (_, i) => seasonalActiveness(i + 1, 16))
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1])
    }
    expect(Math.min(...curve)).toBe(curve[0])
    expect(Math.max(...curve)).toBe(curve[curve.length - 1])
  })

  it('前半から増加する（序盤の平坦なプラトーがない）', () => {
    // turn1→turn5 で明確に増える（べき乗ランプ化の意図）。
    expect(seasonalActiveness(5, 16)).toBeGreaterThan(seasonalActiveness(1, 16))
  })

  it('0〜100 に収まる', () => {
    for (let t = 1; t <= 16; t++) {
      const v = seasonalActiveness(t, 16)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })
})

describe('applySeasonalActiveness', () => {
  const game = (turn: number, activeness: number): GameState =>
    ({ turn, maxTurns: 16, activeness } as GameState)

  it('前週比の増分を現在の活発度へ加算する', () => {
    const delta = seasonalActiveness(16, 16) - seasonalActiveness(15, 16)
    const next = applySeasonalActiveness(game(16, 50))
    expect(next.activeness).toBe(50 + delta)
  })

  it('クランプで 0〜100 を超えない', () => {
    const next = applySeasonalActiveness(game(16, 100))
    expect(next.activeness).toBeLessThanOrEqual(100)
  })
})
