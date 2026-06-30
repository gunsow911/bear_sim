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
  intervention: { satoyama: 0, urban: 1 },
  electricFenceActive: false,
  mowingBlockTurns: 0,
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

  it('広域草刈りを適用すると隣接流入が断たれ予測里山が下がる', () => {
    // city は山林非隣接なので里山遭遇率の上昇は隣接(mt)流入のみ。草刈りで遮断され下がる。
    const game = makeGame(
      { satoyamaEncounterRate: 80 },
      { satoyamaEncounterRate: 30 },
    )
    const base = projectEncounterRates(game, stage, defaultRiskModel).city.satoyama
    const mowed = applyAction(game, 'city', 'mowing', defaultRiskModel)
    const withMow = projectEncounterRates(mowed, stage, defaultRiskModel).city.satoyama
    expect(withMow).toBeLessThan(base)
  })

  it('クリーン作戦を適用すると予測里山が下がる', () => {
    // mt の初期遭遇率を低めに設定し、clean-up の -12 介入効果が clamp に消されないようにする
    const game = makeGame({ satoyamaEncounterRate: 60 }, { satoyamaEncounterRate: 30 })
    const base = projectEncounterRates(game, stage, defaultRiskModel).mt.satoyama
    const cleaned = applyAction(game, 'mt', 'clean-up', defaultRiskModel)
    const after = projectEncounterRates(cleaned, stage, defaultRiskModel).mt.satoyama
    expect(after).toBeLessThan(base)
  })
})
