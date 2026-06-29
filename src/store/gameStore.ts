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
import type {
  ActionKind,
  DistrictId,
  DistrictState,
  GameState,
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
    activeness: 20, // 初期活発度（暫定）
    districts: initDistrictStates(stage),
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
}

export const useGameStore = create<GameStore>((set, get) => ({
  stage: null,
  game: null,
  selectedDistrictId: null,
  lastEvents: [],

  startStage: (stage) =>
    set({
      stage,
      game: createInitialGameState(stage),
      selectedDistrictId: stage.districts[0]?.id ?? null,
      lastEvents: [],
    }),

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
          return { game: { ...game, phase: 'action' } }

        case 'action': {
          // 遭遇フェーズを解決
          const { game: resolved, events } = resolveEncounterPhase(game, stage, activeRiskModel)
          const phase = resolved.dissatisfaction >= 100 ? 'gameover' : 'encounter'
          return { game: { ...resolved, phase }, lastEvents: events }
        }

        case 'encounter': {
          const nextTurn = game.turn + 1
          if (nextTurn > game.maxTurns) {
            return { game: { ...game, phase: 'victory' } }
          }
          return {
            game: {
              ...game,
              turn: nextTurn,
              phase: 'agenda',
              instructionPoints: INSTRUCTION_POINTS_PER_TURN,
            },
            lastEvents: [],
          }
        }

        default:
          return state // gameover / victory は進行しない
      }
    }),

  reset: () => set({ stage: null, game: null, selectedDistrictId: null, lastEvents: [] }),
}))
