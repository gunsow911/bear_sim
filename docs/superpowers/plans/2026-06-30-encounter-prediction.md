# 来週予測の表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 行動フェーズの詳細パネルで、予約中の施策を反映した各地区の「来週の遭遇率（予測値）」を里山/市街メーターに併記する。

**Architecture:** `resolveEncounterPhase` から乱数・出没判定を除いた純関数 `projectEncounterRates` を抽出し、確定処理側もそれを使う（予測＝確定を保証）。UI は現在 game に予約施策を `applyAction` で適用した仮想状態へ `projectEncounterRates` を実行して予測を得て、`Meter` に「現在 → 予測」を表示する。地図は変更しない。

**Tech Stack:** React + TypeScript, Zustand, Vitest。数理は `src/engine`（純TS）。

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-06-30-encounter-prediction-design.md`。
- ターン順序（上昇 → 判定）は変更しない。予測表示の追加のみ。
- 予測は `phase === 'action'` のときだけ表示。他フェーズ・地図は従来どおり。
- 予測は予約中 `pendingActions` を反映する（`commitActions` と同じ前処理）。
- 予測値は `resolveEncounterPhase`（出没が起きなかった場合）の確定レートと一致すること。
- 電気柵は遭遇率（率）を変えない（予測値に影響しないのが正しい）。
- 数値表示は `Math.round`／`toFixed(0)`。既存 `riskColor` を予測色にも使う。
- テストは Vitest（`import { describe, it, expect } from 'vitest'`）。

---

### Task 1: engine に projectEncounterRates を抽出し resolveEncounterPhase をリファクタ

**Files:**
- Modify: `src/engine/turn.ts`
- Test: `src/engine/turn.test.ts`（新規）

**Interfaces:**
- Consumes: `RiskModel`（`src/engine/model.ts`）, `GameState`/`StageDef`/`DistrictId`/`DistrictState`（`@/types`）。
- Produces:
  - `export interface ProjectedRate { satoyama: number; urban: number }`
  - `export function projectEncounterRates(game: GameState, stage: StageDef, model: RiskModel): Record<DistrictId, ProjectedRate>`
  - `resolveEncounterPhase` のシグネチャは不変。

- [ ] **Step 1: 失敗するテストを書く**

`src/engine/turn.test.ts` を新規作成:

```ts
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
    const game = makeGame({ satoyamaEncounterRate: 80 }, { satoyamaEncounterRate: 30 })
    const base = projectEncounterRates(game, stage, defaultRiskModel).mt.satoyama
    const cleaned = applyAction(game, 'mt', 'clean-up', defaultRiskModel)
    const after = projectEncounterRates(cleaned, stage, defaultRiskModel).mt.satoyama
    expect(after).toBeLessThan(base)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- turn`
Expected: FAIL（`projectEncounterRates` が export されていない＝import エラー）。

- [ ] **Step 3: projectEncounterRates を実装し resolveEncounterPhase をリファクタ**

`src/engine/turn.ts` の `resolveEncounterPhase` 関数（現在の §5.3 セクション、`export function resolveEncounterPhase(...) { ... }` 全体）を、次の2関数で置き換える。`clamp` ヘルパは同ファイル上部に既存（再定義しない）。

```ts
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
  for (const d of stage.districts) {
    prevSatoyama[d.id] = game.districts[d.id].satoyamaEncounterRate
  }

  // ① 里山遭遇率の更新
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
          dissatisfactionDelta: 0,
          rate: satoyama,
        })
      } else {
        dissatisfaction += model.params.damage.satoyama
        events.push({
          districtId: def.id,
          kind: 'satoyama',
          message: `${def.name}：里山でクマ出没（不満度+${model.params.damage.satoyama}）`,
          dissatisfactionDelta: model.params.damage.satoyama,
          rate: satoyama,
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
        dissatisfactionDelta: model.params.damage.urban,
        rate: urban,
      })
    }

    // 遭遇率はこの週の値のまま保存（遭遇時の%を確認できるように）。
    // 遭遇補正（減衰）は翌週開始時に applySightingDecay で適用する（遅延）。
    newDistricts[def.id] = {
      ...ds,
      satoyamaEncounterRate: satoyama,
      urbanEncounterRate: urban,
      electricFenceActive: fenceActive,
      mowingBlockTurns: Math.max(0, ds.mowingBlockTurns - 1),
      pendingDecaySatoyama: satoyamaHit,
      pendingDecayUrban: urbanHit,
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
```

注意: `mowingBlockTurns` の減算は確定処理側（`resolveEncounterPhase`）のみで行う。
`projectEncounterRates` は予測のため副作用なし（`mowingBlockTurns` を減らさない）。

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- turn`
Expected: PASS（3 it 緑）。

- [ ] **Step 5: 既存スイートとビルドが壊れていないことを確認**

Run: `npm test && npm run typecheck`
Expected: 全テスト緑（既存の gameStore テストも、resolveEncounterPhase の挙動不変なので緑）。typecheck 0。

- [ ] **Step 6: コミット**

```bash
git add src/engine/turn.ts src/engine/turn.test.ts
git commit -m "refactor: 遭遇率上昇を projectEncounterRates に抽出（予測表示の基盤）"
```

---

### Task 2: 詳細パネルのメーターに「現在 → 予測」を表示

**Files:**
- Modify: `src/App.tsx`（`Meter` / `DistrictDetail`）

**Interfaces:**
- Consumes: `projectEncounterRates`（Task 1）, `applyAction`（`src/engine/turn.ts`、既存 export）,
  `activeRiskModel`（`src/engine/model.ts`、既存 export）。
- Produces: UI のみ（外部 API なし）。

- [ ] **Step 1: import を追加する**

`src/App.tsx` の先頭付近の import 群に追記する（既存の import 行はそのまま）。`useMemo` も使う。

```ts
import { useMemo } from 'react'
import { applyAction, projectEncounterRates } from '@/engine/turn'
import { activeRiskModel } from '@/engine/model'
```

> 既に `react` から別の named import がある場合は `useMemo` をそこへ足す。無ければ上記行を追加。

- [ ] **Step 2: Meter に predicted プロパティを追加する**

`src/App.tsx` の `Meter` 関数（現在 `function Meter({ label, value, max = 100 }: { label: string; value: number; max?: number }) { ... }`）を次で置き換える。

```tsx
/** ラベル付きのメーターバー。predicted 指定時は「現在 → 予測」とゴースト目盛りを表示。 */
function Meter({
  label,
  value,
  predicted,
  max = 100,
}: {
  label: string
  value: number
  predicted?: number
  max?: number
}) {
  const pct = Math.min(100, (value / max) * 100)
  const predPct =
    predicted === undefined ? null : Math.min(100, Math.max(0, (predicted / max) * 100))
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-bold">
          <span className={riskColor(value)}>{value.toFixed(0)}</span>
          {predicted !== undefined && (
            <>
              <span className="mx-1 text-slate-500">→</span>
              <span className={riskColor(predicted)} title="来週の予測遭遇率">
                {predicted.toFixed(0)}
              </span>
            </>
          )}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded bg-panel">
        <div className="h-full rounded bg-current transition-all" style={{ width: `${pct}%` }} />
        {predPct !== null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-slate-200"
            style={{ left: `calc(${predPct}% - 1px)` }}
            title="来週の予測位置"
          />
        )}
      </div>
    </div>
  )
}
```

> 既存のバー本体 `<div className="h-full rounded bg-current transition-all" .../>` はそのまま
> 維持し、見た目を変えない。変更点は (1) 数値部に「→ 予測」を追記、(2) バー枠に `relative` を
> 付けて予測位置のゴースト縦線（`absolute`）を重ねる、の2点のみ。

- [ ] **Step 3: DistrictDetail で予測を算出してメーターへ渡す**

`src/App.tsx` の `DistrictDetail` 関数内、`if (!stage || !game) return null` の**後**に予測算出を追加する。

```ts
  // 予約中の施策を反映した「来週予測」（行動フェーズのみ）。commitActions と同じ前処理。
  const predicted = useMemo(() => {
    if (!stage || !game || game.phase !== 'action') return null
    let g = game
    for (const p of pending) g = applyAction(g, p.districtId, p.kind, activeRiskModel)
    return projectEncounterRates(g, stage, activeRiskModel)
  }, [stage, game, pending])
  const pred = selectedId ? predicted?.[selectedId] : undefined
```

そして里山/市街メーターの2行（現在 `<Meter label="里山遭遇率" value={ds.satoyamaEncounterRate} />`
と `<Meter label="市街遭遇率" value={ds.urbanEncounterRate} />`）を次で置き換える。

```tsx
            <Meter label="里山遭遇率" value={ds.satoyamaEncounterRate} predicted={pred?.satoyama} />
            <Meter label="市街遭遇率" value={ds.urbanEncounterRate} predicted={pred?.urban} />
```

- [ ] **Step 4: 電気柵の注記を追加する**

同 `DistrictDetail` の「状態」ブロック（`{/* 状態（対策の効果） */}` の `<div>`）の末尾、
電気柵バッジ群を出している `</div>` の直後（`</div>` で状態ブロックを閉じる前）に、
行動フェーズのみ表示する注記を追加する。

```tsx
            {game.phase === 'action' && (
              <p className="mt-2 text-[10px] leading-snug text-slate-500">
                ⚡電気柵は遭遇率（予測値）を下げず、出没を1回だけ防ぎます。
              </p>
            )}
```

- [ ] **Step 5: 型チェックとビルド、目視確認**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck 0／全テスト緑／build 成功。

続けて目視（`npm run dev`）:
- 行動フェーズで地区を選ぶと里山/市街メーターが「現在 → 予測」表示になり、バーに予測位置の縦線が出る。
- クリーン作戦/広域草刈りを予約すると予測値が下がり、解除で戻る。電気柵予約では予測値は不変。
- encounter/victory/gameover フェーズでは予測併記が出ない（現在値のみ）。

- [ ] **Step 6: コミット**

```bash
git add src/App.tsx
git commit -m "feat: 行動フェーズの遭遇率メーターに来週予測を併記"
```

---

## Self-Review

- **Spec coverage**:
  - 中核 `projectEncounterRates` 抽出＋確定処理リファクタ → Task 1。
  - 予測の施策反映（applyAction → project）→ Task 2 Step 3。
  - メーター「現在 → 予測」＋ゴースト目盛り → Task 2 Step 2/3。
  - 行動フェーズ限定 → Task 2 Step 3（`phase !== 'action'` で null）。
  - 電気柵は率不変＋注記 → Task 1（urbanRise は介入のみ、fence は率に無関係）＋ Task 2 Step 4。
  - 地図変更なし → MapView は触らない（計画に含めない）。
  - 不変条件テスト・草刈り/クリーン反映テスト → Task 1 Step 1。
  - スコープ外（地図・順序・モデル変更）→ 計画に含めない。
- **Placeholder scan**: 各コード手順に実コードを記載。TBD なし。
- **Type consistency**: `projectEncounterRates` の戻り値 `Record<DistrictId, ProjectedRate>`、
  `ProjectedRate { satoyama; urban }` は Task 1 定義と Task 2 使用（`pred?.satoyama`/`pred?.urban`）で一致。
  `applyAction(game, districtId, kind, model)` のシグネチャは既存 export と一致。`Meter` の
  `predicted?: number` は Task 2 Step 2 定義と Step 3 使用で一致。
