/**
 * ターン解決の純関数群（フレームワーク非依存）。
 *   - applyAction: §5.2 対策コマンドの適用（リソース消費＋効果）
 *   - resolveEncounterPhase: §5.3 遭遇率の更新・出現判定・被害（不満度）加算
 *
 * 乱数は引数 rng で注入可能（既定 Math.random）。数理は RiskModel に委譲しており、
 * モデルを差し替えても本ファイルは無改修。
 */

import { ACTIONS } from '@/data/actions'
import type {
  ActionKind,
  DistrictId,
  DistrictState,
  GameState,
  StageDef,
} from '@/types'
import type { RiskModel } from './model'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// ───────────────────────────────────────────────────────────
// §5.2 対策コマンド
// ───────────────────────────────────────────────────────────

/** その対策を実行できるリソースがあるか。 */
export function canAfford(game: GameState, kind: ActionKind): boolean {
  const a = ACTIONS[kind]
  return game.budget >= a.budgetCost && game.instructionPoints >= a.instructionPointCost
}

/**
 * 対策コマンドを1つ適用した新しいゲーム状態を返す。
 * リソース不足・地区不在の場合は状態を変えずに返す（呼び出し側で canAfford を確認推奨）。
 */
export function applyAction(
  game: GameState,
  districtId: DistrictId,
  kind: ActionKind,
  model: RiskModel,
): GameState {
  if (!canAfford(game, kind)) return game
  const ds = game.districts[districtId]
  if (!ds) return game

  const a = ACTIONS[kind]
  const fx = model.params.actionEffects
  let next: DistrictState = ds

  switch (kind) {
    case 'mowing':
      next = { ...ds, mowingBlockTurns: fx.mowingBlockTurns }
      break
    case 'clean-up':
      next = {
        ...ds,
        intervention: {
          satoyama: ds.intervention.satoyama + fx.cleanUpSatoyamaDelta,
          urban: Math.max(0, ds.intervention.urban + fx.cleanUpUrbanFactorDelta),
        },
      }
      break
    case 'electric-fence':
      next = { ...ds, electricFenceActive: true }
      break
  }

  return {
    ...game,
    budget: game.budget - a.budgetCost,
    instructionPoints: game.instructionPoints - a.instructionPointCost,
    districts: { ...game.districts, [districtId]: next },
  }
}

// ───────────────────────────────────────────────────────────
// §5.3 遭遇フェーズ
// ───────────────────────────────────────────────────────────

export type EncounterEventKind = 'satoyama' | 'urban' | 'fence-block'

export interface EncounterEvent {
  districtId: DistrictId
  kind: EncounterEventKind
  message: string
}

export interface EncounterResult {
  game: GameState
  events: EncounterEvent[]
}

/**
 * 遭遇フェーズを解決し、更新後の状態と発生イベントを返す。
 * 1) 全地区の里山遭遇率を「前ターン値」を元に同時更新（隣接流入は前ターン値を参照）
 * 2) 市街遭遇率を新しい里山遭遇率を元に更新（§4.4 決壊モデル）
 * 3) 出現判定 → 不満度加算（電気柵は里山出現を1度だけ無効化）
 */
export function resolveEncounterPhase(
  game: GameState,
  stage: StageDef,
  model: RiskModel,
  rng: () => number = Math.random,
): EncounterResult {
  // 隣接流入は同時性を保つため「前ターンの里山遭遇率」を参照する
  const prevSatoyama: Record<DistrictId, number> = {}
  for (const d of stage.districts) {
    prevSatoyama[d.id] = game.districts[d.id].satoyamaEncounterRate
  }

  // 1) 里山遭遇率の更新
  const newSatoyama: Record<DistrictId, number> = {}
  for (const def of stage.districts) {
    const ds = game.districts[def.id]
    // 広域草刈りが有効な間は隣接流入を遮断（時間稼ぎ）
    const neighborRates = ds.mowingBlockTurns > 0 ? {} : prevSatoyama
    const rise = model.satoyamaRise({
      district: def,
      activeness: game.activeness,
      neighborSatoyamaRates: neighborRates,
      humanIntervention: ds.intervention.satoyama,
    })
    newSatoyama[def.id] = clamp(prevSatoyama[def.id] + rise, 0, 100)
  }

  // 2) 市街遭遇率の更新 + 3) 出現判定
  const events: EncounterEvent[] = []
  const newDistricts: Record<DistrictId, DistrictState> = {}
  let dissatisfaction = game.dissatisfaction

  for (const def of stage.districts) {
    const ds = game.districts[def.id]
    const satoyama = newSatoyama[def.id]
    const urban = clamp(
      ds.urbanEncounterRate +
        model.urbanRise({
          district: def,
          satoyamaEncounterRate: satoyama,
          humanIntervention: ds.intervention.urban,
        }),
      0,
      100,
    )

    let fenceActive = ds.electricFenceActive

    const satoyamaHit = rng() < model.occurrenceProbability(satoyama)
    const urbanHit = rng() < model.occurrenceProbability(urban)

    // 里山出現
    if (satoyamaHit) {
      if (fenceActive) {
        fenceActive = false // §5.2-3 電気柵が1度だけ無効化
        events.push({
          districtId: def.id,
          kind: 'fence-block',
          message: `${def.name}：電気柵が里山の遭遇を防いだ`,
        })
      } else {
        dissatisfaction += model.params.damage.satoyama
        events.push({
          districtId: def.id,
          kind: 'satoyama',
          message: `${def.name}：里山でクマ出没（不満度+${model.params.damage.satoyama}）`,
        })
      }
    }

    // 市街出現
    if (urbanHit) {
      dissatisfaction += model.params.damage.urban
      events.push({
        districtId: def.id,
        kind: 'urban',
        message: `${def.name}：市街地でクマ出没（不満度+${model.params.damage.urban}）`,
      })
    }

    // 出没した遭遇率は8割減で保存し、連続出没・詰みを緩和する
    const decay = model.params.sightedRateFactor

    newDistricts[def.id] = {
      ...ds,
      satoyamaEncounterRate: satoyamaHit ? satoyama * decay : satoyama,
      urbanEncounterRate: urbanHit ? urban * decay : urban,
      electricFenceActive: fenceActive,
      mowingBlockTurns: Math.max(0, ds.mowingBlockTurns - 1),
      // 放置時の自然増（対策で打ち消されていなければじわじわ上がる）
      intervention: {
        satoyama: ds.intervention.satoyama + model.params.neglectDrift.satoyama,
        urban: Math.max(0, ds.intervention.urban + model.params.neglectDrift.urban),
      },
    }
  }

  return {
    game: { ...game, districts: newDistricts, dissatisfaction: clamp(dissatisfaction, 0, 100) },
    events,
  }
}
