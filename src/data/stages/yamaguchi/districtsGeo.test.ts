import { describe, it, expect } from 'vitest'
import { districtsGeo } from './districtsGeo'

const EXPECTED_IDS = [
  'ato', 'tokuji', 'miyano', 'niho', 'ouchi', 'yoshiki', 'center', 'ogori', 'nanbu', 'ajisu',
]

describe('districtsGeo（生成境界）', () => {
  it('Feature 数がちょうど10', () => {
    expect(districtsGeo.features).toHaveLength(10)
  })

  it('districtId 集合が10地区設計と一致する', () => {
    const ids = districtsGeo.features.map((f) => f.properties.districtId).sort()
    expect(ids).toEqual([...EXPECTED_IDS].sort())
  })

  it('各 Feature が name とジオメトリを持つ', () => {
    for (const f of districtsGeo.features) {
      expect(f.properties.name.length).toBeGreaterThan(0)
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry.type)
    }
  })
})
