import { describe, it, expect } from 'vitest'
import { ACTIONS, ACTION_LIST } from './actions'

describe('ACTIONS data', () => {
  it('各施策が flavor / effectLabel を持つ', () => {
    for (const a of ACTION_LIST) {
      expect(a.flavor.length).toBeGreaterThan(0)
      expect(a.effectLabel.length).toBeGreaterThan(0)
    }
  })

  it('指示ポイントコストは1（日常）または2（切り札）', () => {
    for (const a of ACTION_LIST) {
      expect([1, 2]).toContain(a.instructionPointCost)
    }
  })

  it('7施策すべてが定義されている', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(
      ['attractant-removal', 'box-trap', 'electric-fence', 'emergency-shooting', 'hazing', 'mowing', 'patrol'].sort(),
    )
  })

  it('切り札(箱わな・緊急銃猟)はコスト2', () => {
    expect(ACTIONS['box-trap'].instructionPointCost).toBe(2)
    expect(ACTIONS['emergency-shooting'].instructionPointCost).toBe(2)
  })
})
