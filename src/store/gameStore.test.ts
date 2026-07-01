import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from './gameStore'
import { yamaguchiStage } from '@/data/stages'

const s = () => useGameStore.getState()

describe('gameStore 予約（pendingActions）', () => {
  beforeEach(() => {
    s().reset()
    s().startStage(yamaguchiStage) // turn1 → phase 'action', selected = 'ato'
  })

  it('toggleAction で選択地区に予約が追加される', () => {
    s().toggleAction('electric-fence')
    expect(s().pendingActions).toEqual([{ districtId: 'ato', kind: 'electric-fence' }])
    expect(s().reservedPoints()).toBe(1)
    expect(s().isStaged('ato', 'electric-fence')).toBe(true)
  })

  it('同じ施策を再 toggle すると予約が外れる（冪等トグル）', () => {
    s().toggleAction('electric-fence')
    s().toggleAction('electric-fence')
    expect(s().pendingActions).toEqual([])
    expect(s().isStaged('ato', 'electric-fence')).toBe(false)
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

  it('指示P枯渇下でも予約済みの施策は canStage=true（トグルOFFを許可）', () => {
    s().selectDistrict('ato')
    s().toggleAction('mowing') // IP1
    s().selectDistrict('tokuji')
    s().toggleAction('mowing') // IP2
    s().selectDistrict('miyano')
    s().toggleAction('mowing') // IP3（= INSTRUCTION_POINTS_PER_TURN）
    // 予約済みの地区へ戻れば、残指示P0でもトグルOFFできるよう true
    s().selectDistrict('ato')
    expect(s().canStage('mowing')).toBe(true)
    // 未予約の種別は残指示P0で false
    expect(s().canStage('electric-fence')).toBe(false)
  })
})

describe('gameStore commitActions', () => {
  beforeEach(() => {
    s().reset()
    s().startStage(yamaguchiStage)
  })

  it('予約を順に適用してリソースを実消費し、遭遇解決後に予約をクリアする', () => {
    s().selectDistrict('ato')
    s().toggleAction('electric-fence') // 指示P1
    s().selectDistrict('tokuji')
    s().toggleAction('electric-fence') // 指示P1

    s().commitActions()

    const g = s().game!
    expect(g.instructionPoints).toBe(1) // 3 - 2
    expect(s().pendingActions).toEqual([])
    expect(s().actionModalOpen).toBe(false)
    expect(g.phase).toBe('encounter') // 不満度0 < 100
  })

  it('予約0件でも commit でき、遭遇フェーズへ進む', () => {
    s().commitActions()
    expect(s().game!.phase).toBe('encounter')
  })

  it('openActionModal / closeActionModal でフラグが切り替わる', () => {
    s().openActionModal()
    expect(s().actionModalOpen).toBe(true)
    s().closeActionModal()
    expect(s().actionModalOpen).toBe(false)
  })

  it('closeActionModal は予約・リソースを変えない（戻る相当）', () => {
    s().toggleAction('electric-fence')
    s().openActionModal()
    s().closeActionModal()
    expect(s().pendingActions).toEqual([{ districtId: 'ato', kind: 'electric-fence' }])
  })
})

describe('gameStore 節目メッセージ', () => {
  beforeEach(() => {
    s().reset()
    s().startStage(yamaguchiStage)
  })

  it('不満度が80%以上になると一度だけ節目メッセージを表示しフラグが立つ', () => {
    const g = s().game!
    // 活発度0で遭遇率の上昇・出没を抑え、不満度80を決定的に保つ
    useGameStore.setState({ game: { ...g, dissatisfaction: 80, activeness: 0 } })
    s().commitActions()
    expect(s().game!.dissatisfaction).toBe(80)
    expect(s().game!.milestones.highDissatisfaction).toBe(true)
    expect(s().messages.map((m) => m.id)).toContain('milestone-high-dissatisfaction')
  })

  it('不満度が80%未満なら節目メッセージは出ない', () => {
    const g = s().game!
    useGameStore.setState({ game: { ...g, dissatisfaction: 0, activeness: 0 } })
    s().commitActions()
    expect(s().game!.milestones.highDissatisfaction).toBe(false)
    expect(s().messages).toEqual([])
  })
})
