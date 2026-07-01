import { describe, it, expect } from 'vitest'
import { projectEncounterRates, resolveEncounterPhase, applyAction, canActivateAction } from './turn'
import { defaultRiskModel } from './model'
import { ACTIONS } from '@/data/actions'
import type { ActionKind, DistrictId, DistrictState, GameState, StageDef } from '@/types'

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

describe('箱わなによる捕獲', () => {
  it('待ち伏せ中に里山出没が起きると捕獲に置換され、不満は増えず forestInfluxFactor が下がる', () => {
    const game = applyAction(makeGame({ satoyamaEncounterRate: 90 }, {}), 'mt', 'box-trap', defaultRiskModel)
    expect(game.districts.mt.trapTurns).toBe(defaultRiskModel.params.actionEffects.trapTurns)
    // mt の里山ロールだけ必ず出没させ、残り（mt市街／隣接流入で押し上がる city 各ロール）は出没させない。
    // rng は districts の順に satoyamaHit→urbanHit で呼ばれる（mt→city）。
    let call = 0
    const rng = () => (call++ === 0 ? 0 : 1)
    const r = resolveEncounterPhase(game, stage, defaultRiskModel, rng)
    expect(r.events.some((e) => e.districtId === 'mt' && e.kind === 'trap-capture')).toBe(true)
    expect(r.game.dissatisfaction).toBe(0)
    expect(r.game.districts.mt.trapTurns).toBe(0) // 捕獲で消費
    expect(r.game.districts.mt.forestInfluxFactor).toBeCloseTo(0.7)
  })

  it('同地区で箱わなと電気柵が有効なら箱わなが優先し、電気柵は温存される', () => {
    let g = applyAction(makeGame({ satoyamaEncounterRate: 90 }, {}), 'mt', 'box-trap', defaultRiskModel)
    g = applyAction(g, 'mt', 'electric-fence', defaultRiskModel)
    const r = resolveEncounterPhase(g, stage, defaultRiskModel, () => 0)
    expect(r.events.some((e) => e.districtId === 'mt' && e.kind === 'trap-capture')).toBe(true)
    expect(r.events.some((e) => e.districtId === 'mt' && e.kind === 'fence-block')).toBe(false)
    expect(r.game.districts.mt.electricFenceTurns).toBe(3) // 温存（4→未消費で毎ターン減=3）
  })

  it('forestInfluxFactor は下限でクランプされる', () => {
    let g = makeGame({ satoyamaEncounterRate: 90, forestInfluxFactor: 0.35 }, {})
    g = applyAction(g, 'mt', 'box-trap', defaultRiskModel)
    const r = resolveEncounterPhase(g, stage, defaultRiskModel, () => 0)
    expect(r.game.districts.mt.forestInfluxFactor).toBeCloseTo(0.3) // 0.35×0.7=0.245 → 下限0.3
  })
})

describe('緊急銃猟', () => {
  it('市街遭遇率が閾値未満なら発動できない（状態不変）', () => {
    const game = makeGame({}, { urbanEncounterRate: 10 }) // 閾値30未満
    expect(canActivateAction(game, 'city', 'emergency-shooting', defaultRiskModel)).toBe(false)
    const after = applyAction(game, 'city', 'emergency-shooting', defaultRiskModel)
    expect(after).toEqual(game)
  })

  it('閾値以上なら市街遭遇率を大きく下げ、不満が少し上がる', () => {
    const game = makeGame({}, { urbanEncounterRate: 60 })
    expect(canActivateAction(game, 'city', 'emergency-shooting', defaultRiskModel)).toBe(true)
    const after = applyAction(game, 'city', 'emergency-shooting', defaultRiskModel)
    expect(after.districts.city.urbanEncounterRate).toBeCloseTo(60 * 0.2)
    expect(after.dissatisfaction).toBe(defaultRiskModel.params.actionEffects.emergencyDissatisfaction)
    expect(after.instructionPoints).toBe(game.instructionPoints - 2)
  })
})

describe('誘引物の除去', () => {
  it('里山・市街の予測上昇を下げ、N ターンで中立へ戻る', () => {
    const game = makeGame({ satoyamaEncounterRate: 50 }, { satoyamaEncounterRate: 40, urbanEncounterRate: 40 })
    const before = projectEncounterRates(game, stage, defaultRiskModel).mt.satoyama
    const applied = applyAction(game, 'mt', 'attractant-removal', defaultRiskModel)
    expect(applied.districts.mt.intervention.satoyama).toBeLessThan(0)
    expect(applied.districts.mt.intervention.urban).toBeLessThan(0)
    const after = projectEncounterRates(applied, stage, defaultRiskModel).mt.satoyama
    expect(after).toBeLessThan(before)
    // 有効ターンを消費すると中立へ戻る
    let g = applied
    for (let i = 0; i < defaultRiskModel.params.actionEffects.attractantInterventionTurns; i++) {
      g = resolveEncounterPhase(g, stage, defaultRiskModel, () => 1).game
    }
    expect(g.districts.mt.intervention).toEqual({ satoyama: 0, urban: 0 })
    expect(g.districts.mt.interventionTurns).toBe(0)
  })
})

describe('パトロール', () => {
  it('巡回中の地区は出没時の不満加算が軽減される', () => {
    const patrolled = applyAction(makeGame({ satoyamaEncounterRate: 90 }, {}), 'mt', 'patrol', defaultRiskModel)
    expect(patrolled.districts.mt.patrolTurns).toBe(defaultRiskModel.params.actionEffects.patrolTurns)
    const r = resolveEncounterPhase(patrolled, stage, defaultRiskModel, () => 0) // 必ず出没
    const ev = r.events.find((e) => e.districtId === 'mt' && e.kind === 'satoyama')
    expect(ev?.dissatisfactionDelta).toBeCloseTo(defaultRiskModel.params.damage.satoyama * 0.5)
  })
})

describe('追い払い', () => {
  it('遭遇率を即時に下げ、慣れが増える', () => {
    const game = makeGame({ satoyamaEncounterRate: 50 }, {})
    const after = applyAction(game, 'mt', 'hazing', defaultRiskModel)
    expect(after.districts.mt.satoyamaEncounterRate).toBeCloseTo(50 * (1 - 0.3)) // 慣れ0で30%カット
    expect(after.districts.mt.hazingHabituation).toBe(1)
  })

  it('繰り返すほど効果が逓減する（2回目のカットは小さい）', () => {
    let g = makeGame({ satoyamaEncounterRate: 100 }, {})
    const first = 100 - applyAction(g, 'mt', 'hazing', defaultRiskModel).districts.mt.satoyamaEncounterRate
    g = makeGame({ satoyamaEncounterRate: 100, hazingHabituation: 1 }, {})
    const second = 100 - applyAction(g, 'mt', 'hazing', defaultRiskModel).districts.mt.satoyamaEncounterRate
    expect(second).toBeLessThan(first)
  })

  it('不使用の地区は慣れが毎ターン回復する', () => {
    const game = makeGame({ satoyamaEncounterRate: 10, hazingHabituation: 2 }, {})
    const after = resolveEncounterPhase(game, stage, defaultRiskModel, () => 1).game
    expect(after.districts.mt.hazingHabituation).toBeCloseTo(1.5) // 2 - 0.5
  })
})

describe('commitActions のコスト降順適用（切り札→日常）', () => {
  // gameStore.commitActions の適用ループを再現する（切り札=コスト2 を日常=コスト1 より先に安定ソート）。
  // ストアの commitActions は resolveEncounterPhase を Math.random で回すため、
  // 非決定的な出没ノイズを避けてここでは rng を注入できるエンジン層で回帰を固定する。
  const applyOrdered = (
    game: GameState,
    pending: { districtId: DistrictId; kind: ActionKind }[],
  ): GameState => {
    const ordered = [...pending].sort(
      (a, b) => ACTIONS[b.kind].instructionPointCost - ACTIONS[a.kind].instructionPointCost,
    )
    let applied = game
    for (const p of ordered) {
      applied = applyAction(applied, p.districtId, p.kind, defaultRiskModel)
    }
    return applied
  }

  it('同地区に「追い払い→緊急銃猟」を予約しても、切り札が先に評価され不発しない', () => {
    // ターン開始時点の市街遭遇率40は閾値30超。追い払いが先だと 40*0.7=28<30 で緊急銃猟が不発になる。
    const game = makeGame({}, { urbanEncounterRate: 40 })
    const applied = applyOrdered(game, [
      { districtId: 'city', kind: 'hazing' }, // staging 順は追い払いが先
      { districtId: 'city', kind: 'emergency-shooting' },
    ])

    // 緊急銃猟(×0.2)→追い払い(×0.7)の順で適用されるので 40*0.2*0.7=5.6（不発なら28のまま）。
    expect(applied.districts.city.urbanEncounterRate).toBeCloseTo(40 * 0.2 * 0.7)
    // 緊急銃猟が実際に発火：不満度 +emergencyDissatisfaction、指示P -3(=2+1)。
    expect(applied.dissatisfaction).toBe(defaultRiskModel.params.actionEffects.emergencyDissatisfaction)
    expect(applied.instructionPoints).toBe(game.instructionPoints - 3)
  })

  it('（対照）配列順そのまま適用だと緊急銃猟が不発になることを確認', () => {
    // ソートを行わず staging 順（追い払い→緊急銃猟）で適用すると、閾値割れで緊急銃猟が no-op になる。
    const game = makeGame({}, { urbanEncounterRate: 40 })
    let applied = game
    for (const p of [
      { districtId: 'city' as DistrictId, kind: 'hazing' as ActionKind },
      { districtId: 'city' as DistrictId, kind: 'emergency-shooting' as ActionKind },
    ]) {
      applied = applyAction(applied, p.districtId, p.kind, defaultRiskModel)
    }
    expect(applied.districts.city.urbanEncounterRate).toBeCloseTo(40 * 0.7) // 28 のまま
    expect(applied.dissatisfaction).toBe(0) // 緊急銃猟が発火していない
    expect(applied.instructionPoints).toBe(game.instructionPoints - 1) // 追い払い分のみ消費
  })
})
