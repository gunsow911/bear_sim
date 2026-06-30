import { describe, it, expect } from 'vitest'
import { urbanRise, DEFAULT_COEFFICIENTS, type ModelCoefficients } from './encounter'
import type { DistrictDef } from '@/types'

const district = (satoyamaRatio: number): DistrictDef => ({
  id: 'x',
  name: 'X',
  baseDensity: 3,
  satoyamaRatio,
  mountainAdjacent: false,
  features: [],
  adjacencies: [],
})

describe('urbanRise（市街決壊モデル）', () => {
  it('里山遭遇率が決壊閾値以下なら 0（クマは里山で引き返す）', () => {
    expect(
      urbanRise({
        district: district(0.42),
        satoyamaEncounterRate: DEFAULT_COEFFICIENTS.breachThreshold,
        humanIntervention: 1,
      }),
    ).toBe(0)
  })

  it('決壊スケール係数で上昇度が線形に抑制される', () => {
    const input = {
      district: district(0.42),
      satoyamaEncounterRate: 70,
      humanIntervention: 1,
    }
    const soft: ModelCoefficients = { ...DEFAULT_COEFFICIENTS, urbanBreachScale: 0.5 }
    const hard: ModelCoefficients = { ...DEFAULT_COEFFICIENTS, urbanBreachScale: 1 }
    expect(urbanRise({ ...input, coeff: soft })).toBeCloseTo(
      urbanRise({ ...input, coeff: hard }) * 0.5,
    )
  })

  it('既定係数では overflow×scale×(介入/里山率)（中心市街の半減を確認）', () => {
    // overflow=20, scale=0.5, 介入=1, 里山率=0.42 → 20*0.5/0.42 ≈ 23.8
    const rise = urbanRise({
      district: district(0.42),
      satoyamaEncounterRate: 70,
      humanIntervention: 1,
    })
    expect(rise).toBeCloseTo((20 * DEFAULT_COEFFICIENTS.urbanBreachScale) / 0.42)
    expect(rise).toBeLessThan(30) // 旧式(=47.6)より明確に緩い
  })

  it('里山率が小さい都市型ほど決壊が大きい（分母効果は維持）', () => {
    const urban = urbanRise({ district: district(0.42), satoyamaEncounterRate: 80, humanIntervention: 1 })
    const rural = urbanRise({ district: district(0.9), satoyamaEncounterRate: 80, humanIntervention: 1 })
    expect(urban).toBeGreaterThan(rural)
  })
})
