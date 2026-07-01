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

describe('urbanRise（決壊ソフト化 + 市街直接侵入）', () => {
  it('C: 閾値以下でも市街はわずかに上がる（ハードな0ゲートを廃止＝過敏化）', () => {
    // 従来は閾値以下で厳密に0だった。今は softplus + 直接項で小さく正になる。
    const rise = urbanRise({ district: district(0.42), satoyamaEncounterRate: 30, humanIntervention: 1 })
    expect(rise).toBeGreaterThan(0)
  })

  it('A: 閾値以下では市街度が高い地区ほど市街上昇が大きい（都市部は直接出没しやすい）', () => {
    const s = 30 // 閾値50未満
    const urban = urbanRise({ district: district(0.4), satoyamaEncounterRate: s, humanIntervention: 1 })
    const rural = urbanRise({ district: district(0.9), satoyamaEncounterRate: s, humanIntervention: 1 })
    expect(urban).toBeGreaterThan(rural)
  })

  it('里山遭遇率が上がるほど市街上昇も単調に増える', () => {
    const d = district(0.42)
    const low = urbanRise({ district: d, satoyamaEncounterRate: 20, humanIntervention: 1 })
    const mid = urbanRise({ district: d, satoyamaEncounterRate: 45, humanIntervention: 1 })
    const high = urbanRise({ district: d, satoyamaEncounterRate: 80, humanIntervention: 1 })
    expect(mid).toBeGreaterThan(low)
    expect(high).toBeGreaterThan(mid)
  })

  it('大きな超過では決壊項が支配的（従来どおり線形に漸近）', () => {
    // s≫閾値では softplus(s−50)≈(s−50)。直接項ぶんを差し引くと従来式に一致。
    const s = 90
    const d = district(0.42)
    const rise = urbanRise({ district: d, satoyamaEncounterRate: s, humanIntervention: 1 })
    const directTerm = DEFAULT_COEFFICIENTS.urbanDirectScale * s * (1 - 0.42)
    const breachApprox = (DEFAULT_COEFFICIENTS.urbanBreachScale * (s - 50)) / 0.42
    expect(rise - directTerm).toBeCloseTo(breachApprox, 1)
  })

  it('urbanBreachScale=0 でも直接項だけで市街は上がる（決壊非依存の経路）', () => {
    const coeff: ModelCoefficients = { ...DEFAULT_COEFFICIENTS, urbanBreachScale: 0 }
    const rise = urbanRise({ district: district(0.4), satoyamaEncounterRate: 40, humanIntervention: 1, coeff })
    expect(rise).toBeCloseTo(DEFAULT_COEFFICIENTS.urbanDirectScale * 40 * (1 - 0.4))
  })

  it('里山率が小さい都市型ほど市街上昇が大きい（分母効果＋市街度の両方で維持）', () => {
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

  it('活発度0でも山林直接流入(第1項)は途絶えない（下限クランプ）', () => {
    const mt: DistrictDef = {
      id: 'm', name: 'M', baseDensity: 9, satoyamaRatio: 0.9,
      mountainAdjacent: true, features: [], adjacencies: [],
    }
    const zero = satoyamaRise({ district: mt, activeness: 0, neighborSatoyamaRates: {}, humanIntervention: 0 })
    // 活発度0でも下限(minForestActiveness)ぶんの流入が残る
    expect(zero).toBeCloseTo(
      DEFAULT_COEFFICIENTS.scale * (DEFAULT_COEFFICIENTS.minForestActiveness * 9) / 0.9,
    )
    expect(zero).toBeGreaterThan(0)
    // 遮断中は活発度に関係なく0
    const blocked = satoyamaRise({ district: mt, activeness: 0, neighborSatoyamaRates: {}, humanIntervention: 0, blockMountainInflux: true })
    expect(blocked).toBe(0)
  })

  it('活発度が下限以上なら従来どおり活発度に比例（高活発度側の較正は不変）', () => {
    const mt: DistrictDef = {
      id: 'm', name: 'M', baseDensity: 9, satoyamaRatio: 0.9,
      mountainAdjacent: true, features: [], adjacencies: [],
    }
    const a = satoyamaRise({ district: mt, activeness: 40, neighborSatoyamaRates: {}, humanIntervention: 0 })
    const b = satoyamaRise({ district: mt, activeness: 80, neighborSatoyamaRates: {}, humanIntervention: 0 })
    expect(b).toBeCloseTo(a * 2) // 下限(8)以上では線形
  })
})
