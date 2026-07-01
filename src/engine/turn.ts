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
  return game.instructionPoints >= a.instructionPointCost
}

/**
 * 施策の地区固有の発動条件を満たすか（指示ポイントの余力は canAfford が別途判定）。
 * 緊急銃猟は市街遭遇率が閾値以上のときのみ発動可。他施策は常に true。
 */
export function canActivateAction(
  game: GameState,
  districtId: DistrictId,
  kind: ActionKind,
  model: RiskModel,
): boolean {
  const ds = game.districts[districtId]
  if (!ds) return false
  if (kind === 'emergency-shooting') {
    return ds.urbanEncounterRate >= model.params.actionEffects.emergencyUrbanThreshold
  }
  return true
}

/**
 * 対策コマンドを1つ適用した新しいゲーム状態を返す。
 * リソース不足・地区不在・発動条件未達の場合は状態を変えずに返す（呼び出し側で canAfford を確認推奨）。
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
  if (!canActivateAction(game, districtId, kind, model)) return game

  const a = ACTIONS[kind]
  const fx = model.params.actionEffects
  let next: DistrictState = ds

  switch (kind) {
    case 'mowing':
      next = { ...ds, mowingBlockTurns: fx.mowingBlockTurns }
      break
    case 'electric-fence':
      next = { ...ds, electricFenceTurns: fx.electricFenceTurns }
      break
    case 'attractant-removal':
      next = {
        ...ds,
        intervention: {
          satoyama: fx.attractantSatoyamaIntervention,
          urban: fx.attractantUrbanIntervention,
        },
        interventionTurns: fx.attractantInterventionTurns,
      }
      break
    case 'box-trap':
      next = { ...ds, trapTurns: fx.trapTurns }
      break
    case 'patrol':
      next = { ...ds, patrolTurns: fx.patrolTurns }
      break
    case 'hazing': {
      const cut = fx.hazingBaseFraction * Math.pow(fx.hazingDecayBase, ds.hazingHabituation)
      next = {
        ...ds,
        satoyamaEncounterRate: ds.satoyamaEncounterRate * (1 - cut),
        urbanEncounterRate: ds.urbanEncounterRate * (1 - cut),
        hazingHabituation: ds.hazingHabituation + 1,
      }
      break
    }
    case 'emergency-shooting': {
      const shotDistrict: DistrictState = {
        ...ds,
        urbanEncounterRate: ds.urbanEncounterRate * fx.emergencyUrbanFactor,
      }
      return {
        ...game,
        instructionPoints: game.instructionPoints - a.instructionPointCost,
        dissatisfaction: clamp(game.dissatisfaction + fx.emergencyDissatisfaction, 0, 100),
        districts: { ...game.districts, [districtId]: shotDistrict },
      }
    }
  }

  return {
    ...game,
    instructionPoints: game.instructionPoints - a.instructionPointCost,
    districts: { ...game.districts, [districtId]: next },
  }
}

// ───────────────────────────────────────────────────────────
// §5.3 遭遇フェーズ
// ───────────────────────────────────────────────────────────

export type EncounterEventKind = 'satoyama' | 'urban' | 'fence-block' | 'trap-capture'

export interface EncounterEvent {
  districtId: DistrictId
  kind: EncounterEventKind
  message: string
  /** この出没で加算された不満度（電気柵で防いだ場合は 0）。 */
  dissatisfactionDelta: number
  /** 出没を引き起こした遭遇率(0〜100)。里山/電気柵は里山遭遇率、市街は市街遭遇率。 */
  rate: number
}

export interface EncounterResult {
  game: GameState
  events: EncounterEvent[]
}

/** 各地区の「次ターンの遭遇率（里山・市街）」。乱数・出没判定を含まない。 */
export interface ProjectedRate {
  satoyama: number
  urban: number
}

/**
 * 遭遇率の上昇だけを計算する純関数（乱数・出没判定なし）。
 * resolveEncounterPhase の手順①里山更新（草刈り遮断考慮）／②市街決壊更新 と同一。
 * 予測表示と確定処理の単一の真実源。
 */
export function projectEncounterRates(
  game: GameState,
  stage: StageDef,
  model: RiskModel,
): Record<DistrictId, ProjectedRate> {
  // 隣接流入は同時性を保つため「前ターン（=現在）の里山遭遇率」を参照する
  const prevSatoyama: Record<DistrictId, number> = {}
  // ソフト方向バイアス用：地区の里山率（静的）を id 引きできるマップ
  const satoyamaRatios: Record<DistrictId, number> = {}
  for (const d of stage.districts) {
    prevSatoyama[d.id] = game.districts[d.id].satoyamaEncounterRate
    satoyamaRatios[d.id] = d.satoyamaRatio
  }

  // ① 里山遭遇率の更新
  const newSatoyama: Record<DistrictId, number> = {}
  for (const def of stage.districts) {
    const ds = game.districts[def.id]
    // 広域草刈りが有効な間は、山林直接流入(第1項)・隣接移動(第2項)の両方をカット率ぶん弱める。
    const mowing = ds.mowingBlockTurns > 0
    const influxFactor = mowing ? 1 - model.params.actionEffects.mowingInfluxCutRate : 1
    const rise = model.satoyamaRise({
      district: def,
      activeness: game.activeness,
      neighborSatoyamaRates: prevSatoyama,
      neighborSatoyamaRatios: satoyamaRatios,
      humanIntervention: ds.intervention.satoyama,
      mountainInfluxFactor: influxFactor,
      neighborInfluxFactor: influxFactor,
      forestInfluxFactor: ds.forestInfluxFactor,
    })
    newSatoyama[def.id] = clamp(prevSatoyama[def.id] + rise, 0, 100)
  }

  // ② 市街遭遇率の更新（決壊モデル、新しい里山遭遇率を使う）
  const result: Record<DistrictId, ProjectedRate> = {}
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
    result[def.id] = { satoyama, urban }
  }
  return result
}

/**
 * 遭遇フェーズを解決し、更新後の状態と発生イベントを返す。
 * 1) projectEncounterRates で里山・市街遭遇率を確定（予測と同一計算）
 * 2) 出現判定 → 不満度加算（電気柵は里山出現を1度だけ無効化）
 */
export function resolveEncounterPhase(
  game: GameState,
  stage: StageDef,
  model: RiskModel,
  rng: () => number = Math.random,
): EncounterResult {
  const projected = projectEncounterRates(game, stage, model)

  const events: EncounterEvent[] = []
  const newDistricts: Record<DistrictId, DistrictState> = {}
  let dissatisfaction = game.dissatisfaction

  for (const def of stage.districts) {
    const ds = game.districts[def.id]
    const satoyama = projected[def.id].satoyama
    const urban = projected[def.id].urban

    const fenceActive = ds.electricFenceTurns > 0
    let fenceConsumed = false
    const trapActive = ds.trapTurns > 0
    let trapConsumed = false

    const nextInterventionTurns = Math.max(0, ds.interventionTurns - 1)
    const interventionActive = nextInterventionTurns > 0
    const nextIntervention = interventionActive ? ds.intervention : { satoyama: 0, urban: 0 }

    const patrolActive = ds.patrolTurns > 0
    const dmgFactor = patrolActive ? model.params.actionEffects.patrolDamageFactor : 1

    const satoyamaHit = rng() < model.occurrenceProbability(satoyama)
    const urbanHit = rng() < model.occurrenceProbability(urban)

    // 里山出現（箱わなが電気柵より優先。捕獲成立なら電気柵は消費しない）
    if (satoyamaHit) {
      if (trapActive) {
        trapConsumed = true // 箱わな優先：捕獲。電気柵は温存
        events.push({
          districtId: def.id,
          kind: 'trap-capture',
          message: `${def.name}：箱わなで捕獲（人里に出る前に確保）`,
          dissatisfactionDelta: 0,
          rate: satoyama,
        })
      } else if (fenceActive) {
        fenceConsumed = true // §5.2-3 電気柵が1度だけ無効化。発揮したら即失効
        events.push({
          districtId: def.id,
          kind: 'fence-block',
          message: `${def.name}：電気柵が里山の遭遇を防いだ`,
          dissatisfactionDelta: 0,
          rate: satoyama,
        })
      } else {
        const dmg = model.params.damage.satoyama * dmgFactor
        dissatisfaction += dmg
        events.push({
          districtId: def.id,
          kind: 'satoyama',
          message: `${def.name}：里山でクマ出没（不満度+${dmg}）`,
          dissatisfactionDelta: dmg,
          rate: satoyama,
        })
      }
    }

    // 市街出現
    if (urbanHit) {
      const dmgU = model.params.damage.urban * dmgFactor
      dissatisfaction += dmgU
      events.push({
        districtId: def.id,
        kind: 'urban',
        message: `${def.name}：市街地でクマ出没（不満度+${dmgU}）`,
        dissatisfactionDelta: dmgU,
        rate: urban,
      })
    }

    // 遭遇率はこの週の値のまま保存（遭遇時の%を確認できるように）。
    // 遭遇補正（減衰）は翌週開始時に applySightingDecay で適用する（遅延）。
    newDistricts[def.id] = {
      ...ds,
      satoyamaEncounterRate: satoyama,
      urbanEncounterRate: urban,
      // 発揮したら即0（消滅）。未発揮なら毎ターン減って4Tで失効。
      electricFenceTurns: fenceConsumed ? 0 : Math.max(0, ds.electricFenceTurns - 1),
      mowingBlockTurns: Math.max(0, ds.mowingBlockTurns - 1),
      pendingDecaySatoyama: satoyamaHit,
      pendingDecayUrban: urbanHit,
      // 誘引物の除去：残ターンを消費し、0になったら中立(0,0)へ戻す。
      interventionTurns: nextInterventionTurns,
      intervention: nextIntervention,
      // 箱わな：捕獲成立で即0（消費）。未発揮なら毎ターン減る。
      trapTurns: trapConsumed ? 0 : Math.max(0, ds.trapTurns - 1),
      // 捕獲成立で山林直接流入(第1項)の恒久係数を下限クランプしつつ下げる。
      forestInfluxFactor: trapConsumed
        ? Math.max(model.params.actionEffects.trapForestFloor, ds.forestInfluxFactor * model.params.actionEffects.trapForestFactor)
        : ds.forestInfluxFactor,
      // パトロール：毎ターン減って失効。
      patrolTurns: Math.max(0, ds.patrolTurns - 1),
      // 追い払い：慣れ(habituation)は使わなければ毎ターン少しずつ回復する。
      hazingHabituation: Math.max(0, ds.hazingHabituation - model.params.actionEffects.hazingRecovery),
    }
  }

  return {
    game: { ...game, districts: newDistricts, dissatisfaction: clamp(dissatisfaction, 0, 100) },
    events,
  }
}

/**
 * 前週に出没した地区の遭遇率を減衰させる（遭遇補正の遅延適用）。
 * 翌週開始時に1度だけ呼び、pendingDecay フラグを消費する。
 */
export function applySightingDecay(game: GameState, model: RiskModel): GameState {
  const factor = model.params.sightedRateFactor
  const districts: Record<DistrictId, DistrictState> = {}
  for (const [id, d] of Object.entries(game.districts)) {
    districts[id] = {
      ...d,
      satoyamaEncounterRate: d.pendingDecaySatoyama
        ? d.satoyamaEncounterRate * factor
        : d.satoyamaEncounterRate,
      urbanEncounterRate: d.pendingDecayUrban ? d.urbanEncounterRate * factor : d.urbanEncounterRate,
      pendingDecaySatoyama: false,
      pendingDecayUrban: false,
    }
  }
  return { ...game, districts }
}
