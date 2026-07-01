import { describe, it, expect } from 'vitest'
import { ACTIONS, ACTION_LIST } from './actions'

describe('ACTIONS data', () => {
  it('各施策が flavor / effectLabel を持つ', () => {
    for (const a of ACTION_LIST) {
      expect(a.flavor.length).toBeGreaterThan(0)
      expect(a.effectLabel.length).toBeGreaterThan(0)
    }
  })

  it('全施策の指示ポイントコストは1（予算撤廃後の不変条件）', () => {
    for (const a of ACTION_LIST) {
      expect(a.instructionPointCost).toBe(1)
    }
  })

  it('2種別すべてが定義されている', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(
      ['electric-fence', 'mowing'].sort(),
    )
  })
})
