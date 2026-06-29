/**
 * Zustand ゲームストア。エンジン（純関数）と UI の橋渡し。
 * ターン進行・フェーズ遷移・リソース管理・対策コマンドの適用を担う。
 *
 * 数理・解決ロジックは src/engine に委譲。ストアは状態の保持とフェーズ制御に専念する。
 */

import { create } from 'zustand'
import { activeRiskModel } from '@/engine/model'
import {
  applyAction as applyActionEngine,
  canAfford,
  resolveEncounterPhase,
  type EncounterEvent,
} from '@/engine/turn'
import { pickAgendas, rollEvent, applyAgenda, applyEvent } from '@/engine/agenda'
import { applySeasonalActiveness, seasonalActiveness } from '@/engine/season'
import {
  GAMEOVER_MESSAGES,
  OPENING_MESSAGES,
  VICTORY_MESSAGES,
  seasonalMessageForTurn,
} from '@/data/messages'
import type { GameMessage } from '@/types'
import type {
  ActionKind,
  Agenda,
  DistrictId,
  DistrictState,
  GameState,
  RandomEvent,
  StageDef,
} from '@/types'

/** 1 ターンに付与される指示ポイント（§3）。暫定値。 */
const INSTRUCTION_POINTS_PER_TURN = 3

function initDistrictStates(stage: StageDef): Record<DistrictId, DistrictState> {
  const entries = stage.districts.map((d): [DistrictId, DistrictState] => [
    d.id,
    {
      id: d.id,
      satoyamaEncounterRate: 0,
      urbanEncounterRate: 0,
      // 里山は加算項（既定0）、市街は乗算係数（既定1=放置の基準）。
      intervention: { satoyama: 0, urban: 1 },
      electricFenceActive: false,
      mowingBlockTurns: 0,
    },
  ])
  return Object.fromEntries(entries)
}

export function createInitialGameState(stage: StageDef): GameState {
  return {
    stageId: stage.id,
    phase: 'agenda',
    turn: 1,
    maxTurns: stage.maxTurns,
    budget: stage.initialBudget,
    instructionPoints: INSTRUCTION_POINTS_PER_TURN,
    dissatisfaction: 0,
    activeness: seasonalActiveness(1, stage.maxTurns), // 盛夏の基準活発度から開始
    districts: initDistrictStates(stage),
  }
}

/** 週の開始：イベント抽選＆即適用、アジェンダ3枚抽選。返り値で state を組む。 */
function beginTurn(game: GameState): {
  game: GameState
  currentEvent: RandomEvent | null
  agendaChoices: Agenda[]
  selectedAgendaId: null
  tentativeAgendaId: null
} {
  // 第1週は導入として突発イベント・議題を発生させず、すぐ対策フェーズへ。
  if (game.turn === 1) {
    return {
      game: { ...game, phase: 'action' },
      currentEvent: null,
      agendaChoices: [],
      selectedAgendaId: null,
      tentativeAgendaId: null,
    }
  }

  // 季節の押し上げ（前週比の増分）を先に反映してから、突発イベントを抽選・適用する。
  const seasoned = applySeasonalActiveness(game)
  const event = rollEvent()
  const next = event ? applyEvent(seasoned, event) : seasoned
  return {
    game: { ...next, phase: 'agenda' },
    currentEvent: event,
    agendaChoices: pickAgendas(),
    selectedAgendaId: null,
    tentativeAgendaId: null,
  }
}

interface GameStore {
  /** 現在のステージ定義（不変データ）。null = 未選択。 */
  stage: StageDef | null
  /** 可変ゲーム状態。null = ゲーム未開始。 */
  game: GameState | null
  /** UI 上で選択中の地区。 */
  selectedDistrictId: DistrictId | null
  /** 直近の遭遇フェーズで発生したイベント（UI 表示用）。 */
  lastEvents: EncounterEvent[]
  /** 直近の遭遇フェーズ開始時点（解決前）の不満度。結果カードの「20→60」表示用。 */
  dissatisfactionBefore: number
  /** 今週発生した突発イベント。null = 発生なし or 確認済み。 */
  currentEvent: RandomEvent | null
  /** 今週選べるアジェンダ3枚。 */
  agendaChoices: Agenda[]
  /** 確定済みアジェンダの id。null = 未確定。 */
  selectedAgendaId: string | null
  /** 仮選択中（決定前）のアジェンダ id。null = 未選択。 */
  tentativeAgendaId: string | null

  /** ステージを選んでゲームを初期化する。 */
  startStage: (stage: StageDef) => void
  /** 地区を選択する。 */
  selectDistrict: (id: DistrictId | null) => void
  /** 選択中の地区に対策コマンドを実行する（対策フェーズのみ有効）。 */
  applyAction: (kind: ActionKind) => void
  /** その対策を今実行できるか（リソース・フェーズ）。 */
  canApply: (kind: ActionKind) => boolean
  /** 次フェーズへ進む。action→encounter で遭遇を解決する。 */
  advancePhase: () => void
  /** ゲームをリセットする。 */
  reset: () => void
  /** 突発イベントを確認して閉じる。 */
  dismissEvent: () => void
  /** アジェンダを仮選択する（決定前。確定はしない）。 */
  selectAgenda: (id: string) => void
  /** 仮選択中のアジェンダを確定し、対策フェーズへ移行する。 */
  confirmAgenda: () => void
  /** 表示中のメッセージ群（複数ページ）。空なら非表示。 */
  messages: GameMessage[]
  /** 現在表示しているページ番号（0始まり）。 */
  messageIndex: number
  /** メッセージ群を先頭ページから表示する。 */
  showMessages: (msgs: GameMessage[]) => void
  /** 次のページへ。最終ページなら閉じる。 */
  nextMessage: () => void
  /** 前のページへ戻る。 */
  prevMessage: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  stage: null,
  game: null,
  selectedDistrictId: null,
  lastEvents: [],
  dissatisfactionBefore: 0,
  currentEvent: null,
  agendaChoices: [],
  selectedAgendaId: null,
  tentativeAgendaId: null,
  messages: [],
  messageIndex: 0,

  startStage: (stage) => {
    const base = createInitialGameState(stage)
    set({
      stage,
      selectedDistrictId: stage.districts[0]?.id ?? null,
      lastEvents: [],
      ...beginTurn(base),
      messages: OPENING_MESSAGES, // 第1週の指示前に開幕メッセージを表示
      messageIndex: 0,
    })
  },

  selectDistrict: (id) => set({ selectedDistrictId: id }),

  canApply: (kind) => {
    const { game } = get()
    if (!game || game.phase !== 'action') return false
    return canAfford(game, kind)
  },

  applyAction: (kind) =>
    set((state) => {
      const { game, selectedDistrictId } = state
      if (!game || game.phase !== 'action' || !selectedDistrictId) return state
      return { game: applyActionEngine(game, selectedDistrictId, kind, activeRiskModel) }
    }),

  advancePhase: () =>
    set((state) => {
      const { game, stage } = state
      if (!game || !stage) return state

      switch (game.phase) {
        case 'agenda':
          // アジェンダ選択は chooseAgenda で行うため、ここでは進めない
          return state

        case 'action': {
          const { game: resolved, events } = resolveEncounterPhase(game, stage, activeRiskModel)
          const over = resolved.dissatisfaction >= 100
          return {
            game: { ...resolved, phase: over ? 'gameover' : 'encounter' },
            lastEvents: events,
            dissatisfactionBefore: game.dissatisfaction,
            messages: over ? GAMEOVER_MESSAGES : [],
            messageIndex: 0,
          }
        }

        case 'encounter': {
          const nextTurn = game.turn + 1
          if (nextTurn > game.maxTurns) {
            return {
              game: { ...game, phase: 'victory' },
              messages: VICTORY_MESSAGES,
              messageIndex: 0,
            }
          }
          const begun = beginTurn({
            ...game,
            turn: nextTurn,
            instructionPoints: INSTRUCTION_POINTS_PER_TURN,
          })
          const seasonal = seasonalMessageForTurn(nextTurn)
          return {
            lastEvents: [],
            ...begun,
            messages: seasonal ? [seasonal] : [],
            messageIndex: 0,
          }
        }

        default:
          return state // gameover / victory は進行しない
      }
    }),

  reset: () =>
    set({
      stage: null,
      game: null,
      selectedDistrictId: null,
      lastEvents: [],
      dissatisfactionBefore: 0,
      currentEvent: null,
      agendaChoices: [],
      selectedAgendaId: null,
      tentativeAgendaId: null,
      messages: [],
      messageIndex: 0,
    }),

  showMessages: (msgs) => set({ messages: msgs, messageIndex: 0 }),

  nextMessage: () =>
    set((state) =>
      state.messageIndex < state.messages.length - 1
        ? { messageIndex: state.messageIndex + 1 }
        : { messages: [], messageIndex: 0 },
    ),

  prevMessage: () => set((state) => ({ messageIndex: Math.max(0, state.messageIndex - 1) })),

  dismissEvent: () => set({ currentEvent: null }),

  selectAgenda: (id) =>
    set((state) => {
      // 議題フェーズかつ未確定のときだけ仮選択を許可（決定までは適用しない）
      if (!state.game || state.game.phase !== 'agenda' || state.selectedAgendaId) return state
      if (!state.agendaChoices.some((a) => a.id === id)) return state
      return { tentativeAgendaId: id }
    }),

  confirmAgenda: () =>
    set((state) => {
      const { game, agendaChoices, selectedAgendaId, tentativeAgendaId } = state
      if (!game || selectedAgendaId || !tentativeAgendaId) return state
      const agenda = agendaChoices.find((a) => a.id === tentativeAgendaId)
      if (!agenda) return state
      return {
        game: { ...applyAgenda(game, agenda), phase: 'action' },
        selectedAgendaId: tentativeAgendaId,
      }
    }),
}))
