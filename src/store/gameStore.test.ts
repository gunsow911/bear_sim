import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from './gameStore'
import { sampleStage } from '@/data/sampleStage'

const s = () => useGameStore.getState()

describe('gameStore 予約（pendingActions）', () => {
  beforeEach(() => {
    s().reset()
    s().startStage(sampleStage) // turn1 → phase 'action', selected = 'ato'
  })

  it('toggleAction で選択地区に予約が追加される', () => {
    s().toggleAction('clean-up')
    expect(s().pendingActions).toEqual([{ districtId: 'ato', kind: 'clean-up' }])
    expect(s().reservedBudget()).toBe(10)
    expect(s().reservedPoints()).toBe(1)
    expect(s().isStaged('ato', 'clean-up')).toBe(true)
  })

  it('同じ施策を再 toggle すると予約が外れる（冪等トグル）', () => {
    s().toggleAction('clean-up')
    s().toggleAction('clean-up')
    expect(s().pendingActions).toEqual([])
    expect(s().reservedBudget()).toBe(0)
    expect(s().isStaged('ato', 'clean-up')).toBe(false)
  })

  it('別地区には同種別を別々に予約できる', () => {
    s().toggleAction('mowing')
    s().selectDistrict('tokuji')
    s().toggleAction('mowing')
    expect(s().pendingActions).toEqual([
      { districtId: 'ato', kind: 'mowing' },
      { districtId: 'tokuji', kind: 'mowing' },
    ])
  })

  it('removeAction で任意の予約を解除できる', () => {
    s().selectDistrict('ato')
    s().toggleAction('mowing')
    s().removeAction('ato', 'mowing')
    expect(s().pendingActions).toEqual([])
  })

  it('指示ポイントを使い切ると未予約の施策は canStage=false', () => {
    s().toggleAction('mowing') // ato, IP1
    s().selectDistrict('tokuji')
    s().toggleAction('mowing') // IP2
    s().selectDistrict('miyano')
    s().toggleAction('mowing') // IP3（= INSTRUCTION_POINTS_PER_TURN）
    s().selectDistrict('center')
    expect(s().reservedPoints()).toBe(3)
    expect(s().canStage('mowing')).toBe(false)
  })

  it('残予算が足りない施策は canStage=false（予算が縛りになる場合）', () => {
    const g = s().game!
    useGameStore.setState({ game: { ...g, budget: 20 } })
    expect(s().canStage('electric-fence')).toBe(false) // 30万 > 20万
    expect(s().canStage('clean-up')).toBe(true) // 10万 <= 20万
    expect(s().canStage('mowing')).toBe(true) // 0万
  })

  it('予約済みの施策は残予算0でも canStage=true（トグルOFFを許可）', () => {
    const g = s().game!
    s().selectDistrict('ato')
    useGameStore.setState({ game: { ...g, budget: 10 } }) // clean-up を1つ予約できる
    s().toggleAction('clean-up') // 予約成立（budget 10 >= 10）
    useGameStore.setState({ game: { ...s().game!, budget: 0 } }) // 予算を使い切った状態に
    // 予約済みなので残予算0でもトグルOFFできるよう canStage は true
    expect(s().canStage('clean-up')).toBe(true)
    // 未予約・コスト>0 の電気柵は残予算0で false
    expect(s().canStage('electric-fence')).toBe(false)
  })
})

describe('gameStore commitActions', () => {
  beforeEach(() => {
    s().reset()
    s().startStage(sampleStage)
  })

  it('予約を順に適用してリソースを実消費し、遭遇解決後に予約をクリアする', () => {
    s().selectDistrict('ato')
    s().toggleAction('clean-up') // 10万 / 指示P1
    s().selectDistrict('tokuji')
    s().toggleAction('electric-fence') // 30万 / 指示P1
    expect(s().reservedBudget()).toBe(40)

    s().commitActions()

    const g = s().game!
    expect(g.budget).toBe(60) // 100 - 40
    expect(g.instructionPoints).toBe(1) // 3 - 2
    expect(s().pendingActions).toEqual([])
    expect(s().actionModalOpen).toBe(false)
    expect(g.phase).toBe('encounter') // 不満度0 < 100
  })

  it('予約0件でも commit でき、遭遇フェーズへ進む', () => {
    s().commitActions()
    expect(s().game!.phase).toBe('encounter')
    expect(s().game!.budget).toBe(100) // 消費なし
  })

  it('openActionModal / closeActionModal でフラグが切り替わる', () => {
    s().openActionModal()
    expect(s().actionModalOpen).toBe(true)
    s().closeActionModal()
    expect(s().actionModalOpen).toBe(false)
  })

  it('closeActionModal は予約・リソースを変えない（戻る相当）', () => {
    s().toggleAction('clean-up')
    s().openActionModal()
    s().closeActionModal()
    expect(s().pendingActions).toEqual([{ districtId: 'ato', kind: 'clean-up' }])
    expect(s().game!.budget).toBe(100) // 未消費のまま
  })
})
