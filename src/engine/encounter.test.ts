import { describe, it, expect } from 'vitest'
import { urbanRise, satoyamaRise, DEFAULT_COEFFICIENTS, type ModelCoefficients } from './encounter'
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

  it('既定係数では overflow×scale×(介入/里山率)（旧式より明確に緩い）', () => {
    // overflow=20, 介入=1, 里山率=0.42 → 20*scale/0.42
    const rise = urbanRise({
      district: district(0.42),
      satoyamaEncounterRate: 70,
      humanIntervention: 1,
    })
    expect(rise).toBeCloseTo((20 * DEFAULT_COEFFICIENTS.urbanBreachScale) / 0.42)
    expect(rise).toBeLessThan(20 / 0.42) // 旧式(scale=1=47.6)より明確に緩い
  })

  it('里山率が小さい都市型ほど決壊が大きい（分母効果は維持）', () => {
    const urban = urbanRise({ district: district(0.42), satoyamaEncounterRate: 80, humanIntervention: 1 })
    const rural = urbanRise({ district: district(0.9), satoyamaEncounterRate: 80, humanIntervention: 1 })
    expect(urban).toBeGreaterThan(rural)
  })
})

describe('satoyamaRise（隣接里山遭遇率の流入補正）', () => {
  // mountainAdjacent=false → 直接流入0。隣接(green-corridor, 遭遇率80)からの流入のみ。
  const rise = (coeff?: ModelCoefficients) =>
    satoyamaRise({
      district: {
        id: 'c',
        name: 'C',
        baseDensity: 3,
        satoyamaRatio: 0.5,
        mountainAdjacent: false,
        features: [],
        adjacencies: [{ to: 'n', features: ['green-corridor'] }],
      },
      activeness: 50,
      neighborSatoyamaRates: { n: 80 },
      humanIntervention: 0,
      coeff,
    })

  it('neighborInfluxScale で隣接流入が線形に抑制される', () => {
    const full = rise({ ...DEFAULT_COEFFICIENTS, neighborInfluxScale: 1 })
    const half = rise({ ...DEFAULT_COEFFICIENTS, neighborInfluxScale: 0.5 })
    expect(half).toBeCloseTo(full * 0.5)
  })

  it('既定係数では隣接流入が補正で旧式(scale=1)より緩い', () => {
    // mobility(green-corridor)=baseMobility0.2+greenCorridor0.25=0.45、隣接80 → 0.45*80=36
    const r = rise()
    expect(r).toBeCloseTo(0.45 * 80 * DEFAULT_COEFFICIENTS.neighborInfluxScale)
    expect(r).toBeLessThan(0.45 * 80)
  })

  it('ソフト方向バイアス：下流(市街)は上流(森林)から全量流入、逆流は backflowScale 倍', () => {
    const coeff = DEFAULT_COEFFICIENTS
    const edge = (id: string): DistrictDef['adjacencies'] => [{ to: id, features: ['green-corridor'] }]
    // 市街(里山率0.4)が森林隣接(0.9, 遭遇率80)から受ける流入＝下り方向で全量
    const urbanFromForest = satoyamaRise({
      district: { id: 'u', name: 'U', baseDensity: 3, satoyamaRatio: 0.4, mountainAdjacent: false, features: [], adjacencies: edge('f') },
      activeness: 50,
      neighborSatoyamaRates: { f: 80 },
      neighborSatoyamaRatios: { f: 0.9 },
      humanIntervention: 0,
    })
    // 森林(0.9)が市街隣接(0.4, 遭遇率80)から受ける逆流＝上り方向で弱まる
    const forestFromUrban = satoyamaRise({
      district: { id: 'f', name: 'F', baseDensity: 3, satoyamaRatio: 0.9, mountainAdjacent: false, features: [], adjacencies: edge('u') },
      activeness: 50,
      neighborSatoyamaRates: { u: 80 },
      neighborSatoyamaRatios: { u: 0.4 },
      humanIntervention: 0,
    })
    expect(urbanFromForest).toBeGreaterThan(forestFromUrban)
    expect(forestFromUrban).toBeCloseTo(urbanFromForest * coeff.backflowScale)
  })

  it('neighborSatoyamaRatios 省略時は方向バイアスなし（全量流入）', () => {
    const base: DistrictDef = { id: 'c', name: 'C', baseDensity: 3, satoyamaRatio: 0.5, mountainAdjacent: false, features: [], adjacencies: [{ to: 'n', features: ['green-corridor'] }] }
    const withoutRatios = satoyamaRise({ district: base, activeness: 50, neighborSatoyamaRates: { n: 80 }, humanIntervention: 0 })
    // 下流(0.4)からの逆流でも、ratios を渡さなければ全量（＝上流0.6と同値）
    const asUpstream = satoyamaRise({ district: base, activeness: 50, neighborSatoyamaRates: { n: 80 }, neighborSatoyamaRatios: { n: 0.6 }, humanIntervention: 0 })
    expect(withoutRatios).toBeCloseTo(asUpstream)
  })

  it('blockMountainInflux で山林→里山の直接流入(第1項)が断たれる', () => {
    const mt = {
      id: 'm',
      name: 'M',
      baseDensity: 9,
      satoyamaRatio: 0.9,
      mountainAdjacent: true,
      features: [],
      adjacencies: [],
    }
    const base = satoyamaRise({ district: mt, activeness: 50, neighborSatoyamaRates: {}, humanIntervention: 0 })
    const blocked = satoyamaRise({
      district: mt,
      activeness: 50,
      neighborSatoyamaRates: {},
      humanIntervention: 0,
      blockMountainInflux: true,
    })
    expect(base).toBeGreaterThan(0)
    expect(blocked).toBe(0)
  })
})
