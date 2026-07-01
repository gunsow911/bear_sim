import { describe, it, expect } from 'vitest'
import { sightingsForTurn, windowCenterDoy, dayOfYear } from './sightingWindow'
import type { Sighting } from './bearInsight'

const S = (month: number, day: number): Sighting => ({ lat: 34, lon: 131.5, month, day })

describe('dayOfYear', () => {
  it('7/1 < 8/1 < 9/1 < 10/1 の順で増える', () => {
    expect(dayOfYear(7, 1)).toBeLessThan(dayOfYear(8, 1))
    expect(dayOfYear(8, 1)).toBeLessThan(dayOfYear(9, 1))
    expect(dayOfYear(9, 1)).toBeLessThan(dayOfYear(10, 1))
  })
})

describe('windowCenterDoy', () => {
  it('turn1 は 7月中旬、turn16 は 10月中旬', () => {
    expect(windowCenterDoy(1, 16)).toBe(dayOfYear(7, 15))
    expect(windowCenterDoy(16, 16)).toBe(dayOfYear(10, 15))
  })
  it('ターン進行で中心が単調に後ろへ動く', () => {
    let prev = -Infinity
    for (let t = 1; t <= 16; t++) {
      const c = windowCenterDoy(t, 16)
      expect(c).toBeGreaterThanOrEqual(prev)
      prev = c
    }
  })
})

describe('sightingsForTurn（ローリング月窓）', () => {
  const data: Sighting[] = [S(7, 15), S(8, 15), S(9, 15), S(10, 15)]

  it('turn1（7月中旬中心）は7月の点を含み、10月の点を含まない', () => {
    const got = sightingsForTurn(1, 16, data)
    expect(got).toContainEqual(S(7, 15))
    expect(got).not.toContainEqual(S(10, 15))
  })

  it('turn16（10月中旬中心）は10月の点を含み、7月の点を含まない', () => {
    const got = sightingsForTurn(16, 16, data)
    expect(got).toContainEqual(S(10, 15))
    expect(got).not.toContainEqual(S(7, 15))
  })

  it('窓の半幅±15日：中心から離れた点は除外される', () => {
    // turn1 中心=7/15。7/1(=-14日)は含む、8/15(=+31日)は含まない。
    const got = sightingsForTurn(1, 16, [S(7, 1), S(8, 15)])
    expect(got).toContainEqual(S(7, 1))
    expect(got).not.toContainEqual(S(8, 15))
  })

  it('既定引数で実データ SIGHTINGS を対象にし、常に配列を返す', () => {
    const got = sightingsForTurn(8, 16)
    expect(Array.isArray(got)).toBe(true)
  })
})
