import { describe, it, expect } from 'vitest'
import { yamaguchiStage } from './stage'
import { districtsGeo } from './districtsGeo'

describe('yamaguchiStage（9地区ステージ定義）', () => {
  const ids = yamaguchiStage.districts.map((d) => d.id)

  it('地区数が9', () => {
    expect(yamaguchiStage.districts).toHaveLength(9)
  })

  it('district id が districtsGeo の districtId と1:1一致', () => {
    const geoIds = districtsGeo.features.map((f) => f.properties.districtId).sort()
    expect([...ids].sort()).toEqual(geoIds)
  })

  it('全 adjacency.to が実在地区を指す', () => {
    const set = new Set(ids)
    for (const d of yamaguchiStage.districts) {
      for (const a of d.adjacencies) expect(set.has(a.to)).toBe(true)
    }
  })

  it('隣接は双方向対称（A→B があれば B→A もある）', () => {
    const has = (from: string, to: string) =>
      yamaguchiStage.districts
        .find((d) => d.id === from)!
        .adjacencies.some((a) => a.to === to)
    for (const d of yamaguchiStage.districts) {
      for (const a of d.adjacencies) {
        expect(has(a.to, d.id)).toBe(true)
      }
    }
  })

  it('satoyamaRatio は 0〜1、baseDensity は正', () => {
    for (const d of yamaguchiStage.districts) {
      expect(d.satoyamaRatio).toBeGreaterThan(0)
      expect(d.satoyamaRatio).toBeLessThanOrEqual(1)
      expect(d.baseDensity).toBeGreaterThan(0)
    }
  })
})
