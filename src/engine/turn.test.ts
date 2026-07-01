import { describe, it, expect } from 'vitest'
import { projectEncounterRates, resolveEncounterPhase, applyAction } from './turn'
import { defaultRiskModel } from './model'
import type { DistrictState, GameState, StageDef } from '@/types'

const stage: StageDef = {
  id: 's',
  name: 'S',
  maxTurns: 16,
  districts: [
    {
      id: 'mt',
      name: 'Mt',
      baseDensity: 9,
      satoyamaRatio: 0.9,
      mountainAdjacent: true,
      features: ['green-corridor'],
      adjacencies: [{ to: 'city', features: ['green-corridor'] }],
    },
    {
      id: 'city',
      name: 'City',
      baseDensity: 3,
      satoyamaRatio: 0.4,
      mountainAdjacent: false,
      features: ['green-corridor'],
      adjacencies: [{ to: 'mt', features: ['green-corridor'] }],
    },
  ],
}

const dstate = (over: Partial<DistrictState> = {}): DistrictState => ({
  id: 'x',
  satoyamaEncounterRate: 0,
  urbanEncounterRate: 0,
  intervention: { satoyama: 0, urban: 0 },
  electricFenceTurns: 0,
  mowingBlockTurns: 0,
  interventionTurns: 0,
  trapTurns: 0,
  forestInfluxFactor: 1,
  patrolTurns: 0,
  hazingHabituation: 0,
  pendingDecaySatoyama: false,
  pendingDecayUrban: false,
  ...over,
})

const makeGame = (mt: Partial<DistrictState>, city: Partial<DistrictState>): GameState => ({
  stageId: 's',
  phase: 'action',
  turn: 1,
  maxTurns: 16,
  instructionPoints: 3,
  dissatisfaction: 0,
  activeness: 50,
  districts: {
    mt: dstate({ id: 'mt', ...mt }),
    city: dstate({ id: 'city', ...city }),
  },
  milestones: { firstSatoyama: false, firstUrban: false, highDissatisfaction: false },
})

describe('projectEncounterRates', () => {
  it('出没が起きない乱数(rng=()=>1)での resolveEncounterPhase 確定レートと一致する', () => {
    const game = makeGame(
      { satoyamaEncounterRate: 60 },
      { satoyamaEncounterRate: 55, urbanEncounterRate: 10 },
    )
    const projected = projectEncounterRates(game, stage, defaultRiskModel)
    const resolved = resolveEncounterPhase(game, stage, defaultRiskModel, () => 1).game
    for (const id of ['mt', 'city'] as const) {
      expect(projected[id].satoyama).toBeCloseTo(resolved.districts[id].satoyamaEncounterRate)
      expect(projected[id].urban).toBeCloseTo(resolved.districts[id].urbanEncounterRate)
    }
  })

  it('広域草刈りは隣接移動(第2項)も弱める（山林非隣接地区でも予測里山が下がる）', () => {
    // city は山林非隣接なので上昇は隣接(mt)流入のみ。草刈りで第2項が半減し下がる。
    const game = makeGame(
      { satoyamaEncounterRate: 80 },
      { satoyamaEncounterRate: 30 },
    )
    const base = projectEncounterRates(game, stage, defaultRiskModel).city.satoyama
    const mowed = applyAction(game, 'city', 'mowing', defaultRiskModel)
    const withMow = projectEncounterRates(mowed, stage, defaultRiskModel).city.satoyama
    expect(withMow).toBeLessThan(base)
  })

  it('広域草刈りは山林直接流入(第1項)を弱める（mountain地区の予測里山が下がるが0にはしない）', () => {
    const game = makeGame({ satoyamaEncounterRate: 40 }, { satoyamaEncounterRate: 0 })
    const base = projectEncounterRates(game, stage, defaultRiskModel).mt.satoyama
    const mowed = applyAction(game, 'mt', 'mowing', defaultRiskModel)
    const after = projectEncounterRates(mowed, stage, defaultRiskModel).mt.satoyama
    expect(after).toBeLessThan(base)
  })

  it('電気柵は4T有効で、里山出没を1度防ぐと即失効する', () => {
    // 必ず出没する乱数(rng=()=>0)。mt に電気柵を張り、1度は防いで柵は0に。
    const game = applyAction(makeGame({ satoyamaEncounterRate: 90 }, {}), 'mt', 'electric-fence', defaultRiskModel)
    expect(game.districts.mt.electricFenceTurns).toBe(4)
    const r1 = resolveEncounterPhase(game, stage, defaultRiskModel, () => 0)
    expect(r1.events.some((e) => e.districtId === 'mt' && e.kind === 'fence-block')).toBe(true)
    expect(r1.game.districts.mt.electricFenceTurns).toBe(0) // 発揮で即失効
  })

  it('電気柵は出没しなければ毎ターン減って4Tで失効する', () => {
    // 出没しない乱数(rng=()=>1)で1ターン解決すると 4→3 に減る。
    const game = applyAction(makeGame({ satoyamaEncounterRate: 10 }, {}), 'mt', 'electric-fence', defaultRiskModel)
    const after = resolveEncounterPhase(game, stage, defaultRiskModel, () => 1).game
    expect(after.districts.mt.electricFenceTurns).toBe(3)
  })

  it('介入項は毎ターン変化しない（放置ドリフト廃止・保留中）', () => {
    // 出没なし(rng=()=>1)で1ターン解決しても intervention は初期値のまま。
    const game = makeGame(
      { satoyamaEncounterRate: 20 },
      { satoyamaEncounterRate: 20 },
    )
    const after = resolveEncounterPhase(game, stage, defaultRiskModel, () => 1).game
    for (const id of ['mt', 'city'] as const) {
      expect(after.districts[id].intervention).toEqual({ satoyama: 0, urban: 0 })
    }
  })
})
