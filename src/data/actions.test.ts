import { describe, it, expect } from 'vitest'
import { ACTIONS, ACTION_LIST } from './actions'

describe('ACTIONS data', () => {
  it('各施策が flavor / effectLabel を持つ', () => {
    for (const a of ACTION_LIST) {
      expect(a.flavor.length).toBeGreaterThan(0)
      expect(a.effectLabel.length).toBeGreaterThan(0)
    }
  })

  it('日常施策の指示ポイントコストは1（予算撤廃後の不変条件）。切り札(箱わな・緊急銃猟)のみコスト2', () => {
    const cost2 = new Set(['box-trap', 'emergency-shooting'])
    for (const a of ACTION_LIST) {
      expect(a.instructionPointCost).toBe(cost2.has(a.kind) ? 2 : 1)
    }
  })

  it('6種別すべてが定義されている', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(
      ['attractant-removal', 'box-trap', 'electric-fence', 'emergency-shooting', 'mowing', 'patrol'].sort(),
    )
  })
})
