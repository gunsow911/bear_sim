# 対策コマンド7本立て（日常5＋切り札2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 地区指定の対策コマンドを2→7施策に拡張する（誘引物除去・箱わな捕獲・緊急銃猟・パトロール・追い払いを追加）。

**Architecture:** 純関数エンジン（`src/engine`）＋ Zustand ストア（`src/store`）＋ React UI（`src/App.tsx`）の既存3層を踏襲。数理は `RiskModel`（`model.ts`）に集約し、施策効果は `RiskModelParams.actionEffects` のレバー値で管理する。施策の適用は `applyAction`（即時効果）と `resolveEncounterPhase`（遭遇解決時の効果・毎ターン減衰）に分ける。UI は `ACTION_LIST` を map するだけなので、`ACTIONS` に追加すれば自動でボタンが増える。

**Tech Stack:** TypeScript, React, Zustand, Vitest。テストは `*.test.ts`（Vitest）。実行は `npm test`（もしくは `npx vitest run <path>`）。

## Global Constraints

- **数値マスキング維持**：UI 表示文（`ActionDef.flavor` / `effectLabel`）に数値を出さない。質的ラベルのみ。
- **管理リソースは増やさない**：プレイヤーが見張るのは `instructionPoints` と `dissatisfaction` のみ。捕獲枠等の新カウンタは追加しない（内部隠しフラグは可）。
- **既存の挙動を壊さない**：新フィールドはすべて中立既定値（施策未実行なら従来と同一の遭遇率推移）。
- **エンジンは純関数**：`src/engine/*` は乱数を引数 `rng` で注入。`Math.random` を直接呼ばない。
- **コスト**：日常施策＝指示1、切り札（箱わな・緊急銃猟）＝指示2。
- **エンジン非改修の原則**：`turn.ts` はモデルに依存し、レバー値は `model.ts` の `actionEffects` に置く。マジックナンバーを `turn.ts` に直書きしない。

---

## File Structure

- `src/types/index.ts` — `ActionKind` union と `DistrictState` の新フィールド。型の単一の真実源。
- `src/engine/encounter.ts` — `satoyamaRise`（第1項に `forestInfluxFactor`）と `urbanRise`（人間介入を乗算→加算）。
- `src/engine/model.ts` — `RiskModelParams.actionEffects` に全施策のレバー値。
- `src/engine/turn.ts` — `applyAction`（各施策の即時効果）、`resolveEncounterPhase`（捕獲置換・不満軽減・毎ターン減衰）、新ヘルパ `canActivateAction`（緊急銃猟の発動条件）。
- `src/store/gameStore.ts` — `initDistrictStates` 既定値、`canStage` に緊急銃猟の発動条件。
- `src/data/actions.ts` — 5 施策の `ActionDef`。
- `src/data/glossary.ts` — 用語追加（緊急銃猟・クマレンジャー・追い払い）。
- `src/App.tsx` — 施策バーのコスト表示（指示2）・緊急銃猟の非活性表示。
- テスト：`src/engine/encounter.test.ts` / `src/engine/turn.test.ts` / `src/data/actions.test.ts` に追記・修正。

各施策のレバーは `actionEffects` に集約し、`turn.ts` は値を参照するだけにする。

---

## Task 1: 基盤（DistrictState 拡張・市街介入の加算化・既定値中立化）

新フィールドをすべて中立既定で追加し、`urbanRise` の人間介入を乗算→加算に改める。挙動は不変。

**Files:**
- Modify: `src/types/index.ts`（`DistrictState` に5フィールド追加、`intervention.urban` コメント更新）
- Modify: `src/engine/encounter.ts`（`urbanRise` を加算化、`SatoyamaRiseInput` に `forestInfluxFactor` 追加）
- Modify: `src/engine/model.ts`（`RiskModelParams.actionEffects` に全レバー追加）
- Modify: `src/store/gameStore.ts`（`initDistrictStates` に新フィールド・`intervention.urban` を 0 へ）
- Test: `src/engine/encounter.test.ts`（`urbanRise` 呼び出しの `humanIntervention: 1`→`0`、加算挙動の新テスト）
- Test: `src/engine/turn.test.ts`（`dstate` に新フィールド・intervention 期待値を `urban:0` へ）

**Interfaces:**
- Produces:
  - `DistrictState` に `interventionTurns: number`（誘引物の持続、既定0）, `trapTurns: number`（箱わな待ち伏せ、既定0）, `forestInfluxFactor: number`（山林直接流入の恒久係数、既定1）, `patrolTurns: number`（巡回、既定0）, `hazingHabituation: number`（追い払いの慣れ、既定0）
  - `intervention: { satoyama: number; urban: number }` は加算方式（両方とも中立0、負で抑制）
  - `SatoyamaRiseInput.forestInfluxFactor?: number`（既定1、第1項に乗算）
  - `urbanRise` は `breachTerm + directTerm + humanIntervention`（humanIntervention は負で抑制、中立0）
  - `RiskModelParams.actionEffects` に以下を追加：
    ```ts
    attractantInterventionTurns: number
    attractantSatoyamaIntervention: number  // 負値。里山rise加算
    attractantUrbanIntervention: number     // 負値。市街rise加算
    trapTurns: number
    trapForestFactor: number                // 例0.7
    trapForestFloor: number                 // 例0.3
    emergencyUrbanThreshold: number         // 例30
    emergencyUrbanFactor: number            // 例0.2（市街遭遇率に乗算）
    emergencyDissatisfaction: number        // 例5
    patrolTurns: number
    patrolDamageFactor: number              // 例0.5
    hazingBaseFraction: number              // 例0.3（慣れ0のときのカット率）
    hazingDecayBase: number                 // 例0.6（habituation の底）
    hazingRecovery: number                  // 例0.5（毎ターン回復）
    ```

- [ ] **Step 1: `urbanRise` 加算化の失敗テストを書く**

`src/engine/encounter.test.ts` の `describe('urbanRise …')` 内に追記：

```ts
it('人間介入は加算で抑制する（中立0）。負値でriseが下がり、0なら従来どおり', () => {
  const d = district(0.4)
  const neutral = urbanRise({ district: d, satoyamaEncounterRate: 60, humanIntervention: 0 })
  const suppressed = urbanRise({ district: d, satoyamaEncounterRate: 60, humanIntervention: -5 })
  expect(suppressed).toBeCloseTo(neutral - 5)
})
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/engine/encounter.test.ts -t '人間介入は加算'`
Expected: FAIL（現状は乗算なので `neutral - 5` にならない／`humanIntervention:0` だと rise が 0 になる）

- [ ] **Step 3: `urbanRise` を加算方式へ改修**

`src/engine/encounter.ts` の `urbanRise` を差し替え：

```ts
export function urbanRise(input: UrbanRiseInput): number {
  const coeff = input.coeff ?? DEFAULT_COEFFICIENTS
  const { district, satoyamaEncounterRate, humanIntervention } = input
  const s = satoyamaEncounterRate
  const urbanness = 1 - district.satoyamaRatio

  const overflow = softplus(s - coeff.breachThreshold, coeff.breachSoftness)
  const breachTerm = coeff.urbanBreachScale * overflow / district.satoyamaRatio
  const directTerm = coeff.urbanDirectScale * s * urbanness

  // 人間の介入は加算（負で抑制、中立0）。里山側 satoyamaRise と対称。
  return breachTerm + directTerm + humanIntervention
}
```

`UrbanRiseInput.humanIntervention` の doc コメントを「乗算係数(1中立)」→「加算項（負で抑制、中立0）」に更新する。

- [ ] **Step 4: `satoyamaRise` に `forestInfluxFactor` を追加**

`SatoyamaRiseInput` に追記：

```ts
  /** 第1項（山林直接流入）に掛ける恒久係数（0〜1、既定1）。箱わな捕獲で下がる。 */
  forestInfluxFactor?: number
```

`satoyamaRise` の分割代入と第1項を修正：

```ts
    mountainInfluxFactor = 1,
    neighborInfluxFactor = 1,
    forestInfluxFactor = 1,
  } = input
  ...
  const directInflux = district.mountainAdjacent
    ? coeff.scale * ((forestActiveness * district.baseDensity) / district.satoyamaRatio) * mountainInfluxFactor * forestInfluxFactor
    : 0
```

- [ ] **Step 5: 既存 `urbanRise` テストの中立値を 0 に修正**

`src/engine/encounter.test.ts` の `urbanRise({ …, humanIntervention: 1 })` をすべて `humanIntervention: 0` に置換（該当行：18, 24, 25, 31, 32, 33, 45, 55, 60, 61）。相対比較テストなので中立化しても意図は保たれる。

- [ ] **Step 6: `model.ts` に新レバーを追加**

`RiskModelParams.actionEffects` インターフェースに Interfaces 節の全フィールドを追加し、`defaultRiskModel` の `actionEffects` に既定値を入れる：

```ts
    // 既存: mowingBlockTurns, mowingInfluxCutRate, electricFenceTurns
    attractantInterventionTurns: 3,
    attractantSatoyamaIntervention: -8,
    attractantUrbanIntervention: -6,
    trapTurns: 3,
    trapForestFactor: 0.7,
    trapForestFloor: 0.3,
    emergencyUrbanThreshold: 30,
    emergencyUrbanFactor: 0.2,
    emergencyDissatisfaction: 5,
    patrolTurns: 3,
    patrolDamageFactor: 0.5,
    hazingBaseFraction: 0.3,
    hazingDecayBase: 0.6,
    hazingRecovery: 0.5,
```

- [ ] **Step 7: `DistrictState` に5フィールドを追加**

`src/types/index.ts` の `DistrictState` に追記（`intervention` コメントも加算方式に更新）：

```ts
  /** 誘引物除去の持続残ターン（>0で intervention が有効）。0で intervention を中立へ戻す。 */
  interventionTurns: number
  /** 箱わな待ち伏せの残ターン（>0で有効）。捕獲成立で即0。 */
  trapTurns: number
  /** 山林直接流入(第1項)の恒久係数（初期1.0）。箱わな捕獲成立で ×trapForestFactor（下限クランプ）。 */
  forestInfluxFactor: number
  /** パトロール巡回の残ターン（>0の間、出没時の不満加算を軽減）。 */
  patrolTurns: number
  /** 追い払いの慣れ（隠し。使用で増え、不使用で回復。大きいほど追い払いが効かない）。 */
  hazingHabituation: number
```

`intervention` の JSDoc を「里山=加算項/市街=乗算係数」→「里山・市街とも加算項（負で抑制、中立0）」に更新。

- [ ] **Step 8: 既定値を中立で初期化（store とテストヘルパ）**

`src/store/gameStore.ts` の `initDistrictStates` の各 district オブジェクトに追記し、`intervention.urban` を 0 に：

```ts
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
```

`src/engine/turn.test.ts` の `dstate` ヘルパにも同じ5フィールドを追加し、`intervention: { satoyama: 0, urban: 0 }` に変更。さらに「介入項は毎ターン変化しない」テストの期待値を `toEqual({ satoyama: 0, urban: 0 })` に修正。

- [ ] **Step 9: 全テストを実行して緑を確認**

Run: `npm test`
Expected: PASS（新テスト含め全緑。挙動非変更）

- [ ] **Step 10: コミット**

```bash
git add src/types/index.ts src/engine/encounter.ts src/engine/model.ts src/store/gameStore.ts src/engine/encounter.test.ts src/engine/turn.test.ts
git commit -m "refactor: 市街介入を加算化・DistrictState拡張(施策基盤)"
```

---

## Task 2: 誘引物の除去 `attractant-removal`

対象地区の `intervention`（里山・市街とも負）を数ターン駆動し、失効で中立へ戻す。

**Files:**
- Modify: `src/types/index.ts`（`ActionKind` に `'attractant-removal'`）
- Modify: `src/data/actions.ts`（`ActionDef` 追加）
- Modify: `src/engine/turn.ts`（`applyAction` 分岐＋`resolveEncounterPhase` の `interventionTurns` 減衰・中立復帰）
- Test: `src/engine/turn.test.ts`

**Interfaces:**
- Consumes: Task 1 の `interventionTurns` / `actionEffects.attractant*`
- Produces: `applyAction(game, id, 'attractant-removal', model)` が当該地区の `intervention` を負値・`interventionTurns` を設定

- [ ] **Step 1: 失敗テストを書く**

`src/engine/turn.test.ts` に追記：

```ts
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
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/engine/turn.test.ts -t '誘引物の除去'`
Expected: FAIL（`applyAction` が `'attractant-removal'` を未処理＝ intervention 変化なし。型エラーになる場合は Step 3〜4 を先に）

- [ ] **Step 3: `ActionKind` と `ActionDef` を追加**

`src/types/index.ts` の `ActionKind` に `| 'attractant-removal'` を追加。
`src/data/actions.ts` の `ACTIONS` に追記：

```ts
  'attractant-removal': {
    kind: 'attractant-removal',
    name: '誘引物の除去',
    instructionPointCost: 1,
    flavor:
      '放置された柿や栗、屋外の生ゴミを片付ける誘引物除去を地域ぐるみで進めます。里山でも市街でも、クマが人里へ通う"動機"そのものを、しばらくの間そぎ続けます。',
    effectLabel: 'この地区の里山・市街の出没圧をしばらく抑え続ける',
    realTerms: ['誘引物除去'],
  },
```

- [ ] **Step 4: `applyAction` に分岐を追加**

`src/engine/turn.ts` の `applyAction` の `switch (kind)` に追加：

```ts
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
```

- [ ] **Step 5: `resolveEncounterPhase` で毎ターン減衰・中立復帰**

`src/engine/turn.ts` の `resolveEncounterPhase` 内、`newDistricts[def.id] = { ...ds, … }` に以下のフィールドを追加する。まず本体の直前で減衰後の介入を計算：

```ts
    const nextInterventionTurns = Math.max(0, ds.interventionTurns - 1)
    const interventionActive = nextInterventionTurns > 0
    const nextIntervention = interventionActive ? ds.intervention : { satoyama: 0, urban: 0 }
```

`newDistricts[def.id]` の spread に追記：

```ts
      interventionTurns: nextInterventionTurns,
      intervention: nextIntervention,
```

（`mowingBlockTurns` 等と同じブロック内。既存フィールドは維持。）

- [ ] **Step 6: テスト緑を確認**

Run: `npx vitest run src/engine/turn.test.ts -t '誘引物の除去'`
Expected: PASS

- [ ] **Step 7: 全テスト＋コミット**

Run: `npm test`（全緑を確認）

```bash
git add src/types/index.ts src/data/actions.ts src/engine/turn.ts src/engine/turn.test.ts
git commit -m "feat: 誘引物の除去(里山・市街の持続抑制)"
```

---

## Task 3: 箱わなによる捕獲 `box-trap`

待ち伏せ→捕獲で里山出没を無効化し、`forestInfluxFactor` を恒久ダウン。電気柵より優先。

**Files:**
- Modify: `src/types/index.ts`（`ActionKind` に `'box-trap'`、`EncounterEventKind` に `'trap-capture'`）
- Modify: `src/data/actions.ts`（コスト2の `ActionDef`）
- Modify: `src/engine/turn.ts`（`applyAction` 分岐、`projectEncounterRates` で `forestInfluxFactor` 適用、捕獲置換・優先順・`trapTurns` 減衰）
- Test: `src/engine/turn.test.ts`

**Interfaces:**
- Consumes: Task 1 の `trapTurns` / `forestInfluxFactor` / `actionEffects.trap*` / `SatoyamaRiseInput.forestInfluxFactor`
- Produces: 捕獲成立で `EncounterEvent.kind === 'trap-capture'`（`dissatisfactionDelta: 0`）、`forestInfluxFactor` を `max(floor, factor × trapForestFactor)` に更新

- [ ] **Step 1: 失敗テストを書く**

```ts
describe('箱わなによる捕獲', () => {
  it('待ち伏せ中に里山出没が起きると捕獲に置換され、不満は増えず forestInfluxFactor が下がる', () => {
    const game = applyAction(makeGame({ satoyamaEncounterRate: 90 }, {}), 'mt', 'box-trap', defaultRiskModel)
    expect(game.districts.mt.trapTurns).toBe(defaultRiskModel.params.actionEffects.trapTurns)
    const r = resolveEncounterPhase(game, stage, defaultRiskModel, () => 0) // 必ず出没
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
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/engine/turn.test.ts -t '箱わなによる捕獲'`
Expected: FAIL

- [ ] **Step 3: 型と `ActionDef` を追加**

`src/types/index.ts`：`ActionKind` に `| 'box-trap'`、`EncounterEventKind` に `| 'trap-capture'`（`turn.ts` の型定義 `export type EncounterEventKind = 'satoyama' | 'urban' | 'fence-block'` に追加）。
`src/data/actions.ts` に追記：

```ts
  'box-trap': {
    kind: 'box-trap',
    name: '箱わなによる捕獲',
    instructionPointCost: 2,
    flavor:
      '排除地域に箱わなを仕掛け、里へ通う個体を待ち受けます。かかれば人里に出る前に捕らえられ、以後その地区に降りてくる圧そのものが和らぎます。ただし人手と手間がかかります。',
    effectLabel: 'この地区に来た個体を捕らえ、以後の里山の出没圧を和らげる（人手が要る）',
    realTerms: ['個体数管理'],
  },
```

- [ ] **Step 4: `applyAction` 分岐と `projectEncounterRates` の係数適用**

`applyAction` の `switch` に：

```ts
    case 'box-trap':
      next = { ...ds, trapTurns: fx.trapTurns }
      break
```

`projectEncounterRates` の `model.satoyamaRise({...})` 呼び出しに `forestInfluxFactor: ds.forestInfluxFactor` を渡す（`mountainInfluxFactor` 等と同じ位置）。

- [ ] **Step 5: `resolveEncounterPhase` に捕獲置換ロジック（電気柵より前）**

`resolveEncounterPhase` の里山出現ブロックを、捕獲を最優先に判定するよう書き換える。`const fenceActive = …` の下に：

```ts
    const trapActive = ds.trapTurns > 0
    let trapConsumed = false
```

`if (satoyamaHit) { … }` を次の3分岐に：

```ts
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
        fenceConsumed = true
        events.push({ districtId: def.id, kind: 'fence-block', message: `${def.name}：電気柵が里山の遭遇を防いだ`, dissatisfactionDelta: 0, rate: satoyama })
      } else {
        dissatisfaction += model.params.damage.satoyama
        events.push({ districtId: def.id, kind: 'satoyama', message: `${def.name}：里山でクマ出没（不満度+${model.params.damage.satoyama}）`, dissatisfactionDelta: model.params.damage.satoyama, rate: satoyama })
      }
    }
```

`newDistricts[def.id]` の spread に、捕獲成立時の係数ダウンと `trapTurns` 減衰を追記：

```ts
      trapTurns: trapConsumed ? 0 : Math.max(0, ds.trapTurns - 1),
      forestInfluxFactor: trapConsumed
        ? Math.max(model.params.actionEffects.trapForestFloor, ds.forestInfluxFactor * model.params.actionEffects.trapForestFactor)
        : ds.forestInfluxFactor,
```

- [ ] **Step 6: テスト緑を確認**

Run: `npx vitest run src/engine/turn.test.ts -t '箱わなによる捕獲'`
Expected: PASS（3ケースとも）

- [ ] **Step 7: 全テスト＋コミット**

Run: `npm test`

```bash
git add src/types/index.ts src/data/actions.ts src/engine/turn.ts src/engine/turn.test.ts
git commit -m "feat: 箱わなによる捕獲(待ち伏せ→源の恒久ダウン・電気柵より優先)"
```

---

## Task 4: 緊急銃猟 `emergency-shooting`

市街決壊時のみ発動可。市街遭遇率を即時に叩き落とし、不満が少し上がる。

**Files:**
- Modify: `src/types/index.ts`（`ActionKind` に `'emergency-shooting'`）
- Modify: `src/data/actions.ts`（コスト2の `ActionDef`）
- Modify: `src/engine/turn.ts`（`applyAction` 分岐＋発動条件ヘルパ `canActivateAction`）
- Modify: `src/store/gameStore.ts`（`canStage` に発動条件）
- Test: `src/engine/turn.test.ts`

**Interfaces:**
- Consumes: Task 1 の `actionEffects.emergency*`
- Produces: `canActivateAction(game, districtId, kind, model): boolean`（`turn.ts` から export）。`applyAction` は発動条件を満たさない場合は状態を変えずに返す。

- [ ] **Step 1: 失敗テストを書く**

```ts
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
```

`src/engine/turn.test.ts` の import 行に `canActivateAction` を追加：`import { projectEncounterRates, resolveEncounterPhase, applyAction, canActivateAction } from './turn'`

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/engine/turn.test.ts -t '緊急銃猟'`
Expected: FAIL（`canActivateAction` 未定義）

- [ ] **Step 3: 型と `ActionDef` を追加**

`src/types/index.ts`：`ActionKind` に `| 'emergency-shooting'`。
`src/data/actions.ts` に追記：

```ts
  'emergency-shooting': {
    kind: 'emergency-shooting',
    name: '緊急銃猟',
    instructionPointCost: 2,
    flavor:
      '市街地に居座る個体へ、市町の判断で緊急の銃猟を実施します。決壊した市街の危険を即座に断ち切りますが、発砲は住民を動揺させ、事故の恐れもあります。',
    effectLabel: '市街に出た個体を緊急排除する（住民は動揺する）',
    realTerms: ['緊急銃猟'],
  },
```

- [ ] **Step 4: `canActivateAction` ヘルパを追加**

`src/engine/turn.ts` に、`canAfford` の下に新規 export：

```ts
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
```

- [ ] **Step 5: `applyAction` に発動条件ガードと分岐**

`applyAction` の冒頭、`if (!ds) return game` の直後に：

```ts
  if (!canActivateAction(game, districtId, kind, model)) return game
```

`switch` に分岐を追加（`return` で `dissatisfaction` も更新するため、他 case と異なり早期 return）：

```ts
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
```

- [ ] **Step 6: `gameStore.canStage` に発動条件を反映**

`src/store/gameStore.ts` の import に追加：`import { …, canActivateAction } from '@/engine/turn'` と `import { activeRiskModel } from '@/engine/model'`（既存）。
`canStage` の返り値直前に発動条件チェックを追加：

```ts
  canStage: (kind) => {
    const { game, selectedDistrictId } = get()
    if (!game || game.phase !== 'action' || !selectedDistrictId) return false
    if (get().isStaged(selectedDistrictId, kind)) return true
    if (!canActivateAction(game, selectedDistrictId, kind, activeRiskModel)) return false
    const a = ACTIONS[kind]
    const pointsLeft = game.instructionPoints - get().reservedPoints()
    return pointsLeft >= a.instructionPointCost
  },
```

- [ ] **Step 7: テスト緑を確認**

Run: `npx vitest run src/engine/turn.test.ts -t '緊急銃猟'`
Expected: PASS

- [ ] **Step 8: 全テスト＋コミット**

Run: `npm test`

```bash
git add src/types/index.ts src/data/actions.ts src/engine/turn.ts src/store/gameStore.ts src/engine/turn.test.ts
git commit -m "feat: 緊急銃猟(市街決壊時のみ発動可・不満増の切り札)"
```

---

## Task 5: パトロール `patrol`

巡回中の地区は出没しても不満加算が軽減される（遭遇率・確率は不変）。

**Files:**
- Modify: `src/types/index.ts`（`ActionKind` に `'patrol'`）
- Modify: `src/data/actions.ts`（`ActionDef`）
- Modify: `src/engine/turn.ts`（`applyAction` 分岐＋`resolveEncounterPhase` の不満軽減・`patrolTurns` 減衰）
- Test: `src/engine/turn.test.ts`

**Interfaces:**
- Consumes: Task 1 の `patrolTurns` / `actionEffects.patrol*`
- Produces: 巡回中の地区の `satoyama`/`urban` 出没で `dissatisfactionDelta` が `patrolDamageFactor` 倍になる

- [ ] **Step 1: 失敗テストを書く**

```ts
describe('パトロール', () => {
  it('巡回中の地区は出没時の不満加算が軽減される', () => {
    const patrolled = applyAction(makeGame({ satoyamaEncounterRate: 90 }, {}), 'mt', 'patrol', defaultRiskModel)
    expect(patrolled.districts.mt.patrolTurns).toBe(defaultRiskModel.params.actionEffects.patrolTurns)
    const r = resolveEncounterPhase(patrolled, stage, defaultRiskModel, () => 0) // 必ず出没
    const ev = r.events.find((e) => e.districtId === 'mt' && e.kind === 'satoyama')
    expect(ev?.dissatisfactionDelta).toBeCloseTo(defaultRiskModel.params.damage.satoyama * 0.5)
  })
})
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/engine/turn.test.ts -t 'パトロール'`
Expected: FAIL

- [ ] **Step 3: 型と `ActionDef` を追加**

`src/types/index.ts`：`ActionKind` に `| 'patrol'`。
`src/data/actions.ts` に追記：

```ts
  patrol: {
    kind: 'patrol',
    name: 'パトロール',
    instructionPointCost: 1,
    flavor:
      'クマレンジャーと鳥獣専門指導員がこの地区を巡回します。すぐ駆けつける体制が保たれ、万一クマが出ても住民は落ち着いていられます。',
    effectLabel: 'しばらくの間、この地区で出没が起きても住民の不安が広がりにくくなる',
    realTerms: ['クマレンジャー'],
  },
```

- [ ] **Step 4: `applyAction` 分岐**

```ts
    case 'patrol':
      next = { ...ds, patrolTurns: fx.patrolTurns }
      break
```

- [ ] **Step 5: `resolveEncounterPhase` の不満軽減と減衰**

里山/市街の出没ブロックで `dissatisfaction += model.params.damage.*` と `dissatisfactionDelta` を巡回係数で調整する。ブロック冒頭で係数を用意：

```ts
    const patrolActive = ds.patrolTurns > 0
    const dmgFactor = patrolActive ? model.params.actionEffects.patrolDamageFactor : 1
```

里山 else 節（通常出没）と市街節の不満加算を差し替え：

```ts
      // 里山（通常出没）
        const dmg = model.params.damage.satoyama * dmgFactor
        dissatisfaction += dmg
        events.push({ districtId: def.id, kind: 'satoyama', message: `${def.name}：里山でクマ出没（不満度+${dmg}）`, dissatisfactionDelta: dmg, rate: satoyama })
```

```ts
      // 市街
      const dmgU = model.params.damage.urban * dmgFactor
      dissatisfaction += dmgU
      events.push({ districtId: def.id, kind: 'urban', message: `${def.name}：市街地でクマ出没（不満度+${dmgU}）`, dissatisfactionDelta: dmgU, rate: urban })
```

`newDistricts[def.id]` の spread に減衰を追記：

```ts
      patrolTurns: Math.max(0, ds.patrolTurns - 1),
```

- [ ] **Step 6: テスト緑を確認**

Run: `npx vitest run src/engine/turn.test.ts -t 'パトロール'`
Expected: PASS

- [ ] **Step 7: 全テスト＋コミット**

Run: `npm test`

```bash
git add src/types/index.ts src/data/actions.ts src/engine/turn.ts src/engine/turn.test.ts
git commit -m "feat: パトロール(出没時の不満加算を軽減するダメコン)"
```

---

## Task 6: 追い払い `hazing`

即時に遭遇率を薄く下げるが、同地区で繰り返すほど慣れて効果が逓減。不使用で回復。

**Files:**
- Modify: `src/types/index.ts`（`ActionKind` に `'hazing'`）
- Modify: `src/data/actions.ts`（`ActionDef`）
- Modify: `src/engine/turn.ts`（`applyAction` の即時カット＋慣れ加算、`resolveEncounterPhase` の慣れ回復）
- Test: `src/engine/turn.test.ts`

**Interfaces:**
- Consumes: Task 1 の `hazingHabituation` / `actionEffects.hazing*`
- Produces: `applyAction(…, 'hazing', …)` が `satoyama`/`urban` 遭遇率を即時に低下、`hazingHabituation += 1`。カット率 = `hazingBaseFraction × hazingDecayBase^habituation`

- [ ] **Step 1: 失敗テストを書く**

```ts
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
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/engine/turn.test.ts -t '追い払い'`
Expected: FAIL

- [ ] **Step 3: 型と `ActionDef` を追加**

`src/types/index.ts`：`ActionKind` に `| 'hazing'`。
`src/data/actions.ts` に追記：

```ts
  hazing: {
    kind: 'hazing',
    name: '追い払い',
    instructionPointCost: 1,
    flavor:
      '花火や犬、爆音機でクマを山へ追い返します。すぐ効きますが、同じ手を続けるとクマは慣れてしまい、だんだん通用しなくなります。',
    effectLabel: 'この地区の出没を今すぐ薄く抑える（繰り返すと慣れて効かなくなる）',
    realTerms: ['追い払い'],
  },
```

- [ ] **Step 4: `applyAction` の即時カット＋慣れ加算**

`applyAction` の `switch` に：

```ts
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
```

- [ ] **Step 5: `resolveEncounterPhase` の慣れ回復**

`newDistricts[def.id]` の spread に追記：

```ts
      hazingHabituation: Math.max(0, ds.hazingHabituation - model.params.actionEffects.hazingRecovery),
```

- [ ] **Step 6: テスト緑を確認**

Run: `npx vitest run src/engine/turn.test.ts -t '追い払い'`
Expected: PASS（3ケース）

- [ ] **Step 7: 全テスト＋コミット**

Run: `npm test`

```bash
git add src/types/index.ts src/data/actions.ts src/engine/turn.ts src/engine/turn.test.ts
git commit -m "feat: 追い払い(即時カット＋クマの慣れで逓減・不使用で回復)"
```

---

## Task 7: UI（コスト表示・緊急銃猟の非活性）＋用語辞書＋データテスト整備

7施策のボタンを正しく表示し、切り札のコスト2と緊急銃猟の発動可否を見せる。

**Files:**
- Modify: `src/data/actions.test.ts`（コスト＝1固定の前提を撤廃、種別数を実データ連動に）
- Modify: `src/App.tsx`（施策バーのコスト表示）
- Modify: `src/components/ActionDetailCard.tsx`（詳細カードのコスト表示）
- Modify: `src/data/glossary.ts`（用語追加）

**Interfaces:**
- Consumes: Task 2〜6 の `ACTIONS`（7種別）

- [ ] **Step 1: `actions.test.ts` を実データ連動に修正（失敗テスト）**

`src/data/actions.test.ts` を次に差し替える：

```ts
import { describe, it, expect } from 'vitest'
import { ACTIONS, ACTION_LIST } from './actions'

describe('ACTIONS data', () => {
  it('各施策が flavor / effectLabel を持つ', () => {
    for (const a of ACTION_LIST) {
      expect(a.flavor.length).toBeGreaterThan(0)
      expect(a.effectLabel.length).toBeGreaterThan(0)
    }
  })

  it('指示ポイントコストは1（日常）または2（切り札）', () => {
    for (const a of ACTION_LIST) {
      expect([1, 2]).toContain(a.instructionPointCost)
    }
  })

  it('7施策すべてが定義されている', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(
      ['attractant-removal', 'box-trap', 'electric-fence', 'emergency-shooting', 'hazing', 'mowing', 'patrol'].sort(),
    )
  })

  it('切り札(箱わな・緊急銃猟)はコスト2', () => {
    expect(ACTIONS['box-trap'].instructionPointCost).toBe(2)
    expect(ACTIONS['emergency-shooting'].instructionPointCost).toBe(2)
  })
})
```

- [ ] **Step 2: テスト実行（緑を確認）**

Run: `npx vitest run src/data/actions.test.ts`
Expected: PASS（Task 2〜6 で全種別が定義済みのため緑。未実装なら該当タスクを先に）

- [ ] **Step 3: 施策バーにコスト表示を追加**

`src/App.tsx` の施策ボタン内、`free` の分岐（`{free && …無料…}`）の箇所を次に差し替える。コスト2のときは「指示2」を明示、0のときは「無料」：

```tsx
              <span className="text-xs text-risk-safe">{a.effectLabel}</span>
              {a.instructionPointCost === 0 && (
                <span className="text-xs font-bold text-risk-safe">無料</span>
              )}
              {a.instructionPointCost >= 2 && (
                <span className="text-xs font-bold text-amber-300">指示{a.instructionPointCost}</span>
              )}
```

（`free` 変数はこの分岐に置換。未使用になれば削除。）

- [ ] **Step 4: `ActionDetailCard` にコスト表示を追加**

`src/components/ActionDetailCard.tsx` の `free` 分岐の下に、コスト2表示を追加：

```tsx
        {free && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-slate-400">コスト</dt>
            <dd className="font-bold text-risk-safe">無料</dd>
          </div>
        )}
        {action.instructionPointCost >= 2 && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-slate-400">コスト</dt>
            <dd className="font-bold text-amber-300">指示{action.instructionPointCost}（切り札）</dd>
          </div>
        )}
```

- [ ] **Step 5: 用語辞書に追加**

`src/data/glossary.ts` の `GLOSSARY` に3件追記：

```ts
  緊急銃猟: {
    term: '緊急銃猟',
    description:
      '市街地等でクマ等が緊急の危険を及ぼす際、市町村の判断で銃による捕獲を実施できる制度（2024年鳥獣保護管理法改正で創設）。',
  },
  クマレンジャー: {
    term: 'クマレンジャー',
    description:
      'クマの出没時に現場対応や追い払い、住民への助言を行う地域の対応隊。鳥獣専門指導員とともにパトロールを担う。',
  },
  追い払い: {
    term: '追い払い',
    description:
      '花火・犬・爆音機などでクマを人里から山へ追い返す対策。即効性はあるが、繰り返すとクマが慣れて効きにくくなる。',
  },
```

- [ ] **Step 6: 型チェック＋ビルド＋全テスト**

Run: `npx tsc --noEmit && npm test`
Expected: PASS（型エラーなし・全テスト緑）

- [ ] **Step 7: 手動確認（任意だが推奨）**

Run: `npm run dev` でゲームを開始し、地区を選んで施策バーに7ボタンが出ること、箱わな・緊急銃猟に「指示2」が出ること、市街遭遇率が低い地区では緊急銃猟が非活性（`disabled`）になることを目視確認。

- [ ] **Step 8: コミット**

```bash
git add src/data/actions.test.ts src/App.tsx src/components/ActionDetailCard.tsx src/data/glossary.ts
git commit -m "feat: 7施策のUI(コスト2表示・緊急銃猟の発動可否)と用語追加"
```

---

## Self-Review

**Spec coverage（spec の各節 → タスク対応）:**
- 施策1 緩衝帯の刈り払い（既存・変更なし）→ 対応不要（Task 1 で `forestInfluxFactor` 追加時も mowing は不変）
- 施策2 誘引物の除去（里山・市街の加算抑制）→ Task 1（加算化）＋ Task 2
- 施策3 電気柵（現状維持・箱わな優先）→ Task 3（優先順ロジック）
- 施策4 箱わな（待ち伏せ・源恒久ダウン・乗算スタック・下限・山林隣接限定）→ Task 3
- 施策5 緊急銃猟（決壊時のみ・不満増・指示2）→ Task 4
- 施策6 パトロール（不満軽減・確率不触）→ Task 5
- 施策7 追い払い（即時カット・慣れ・回復）→ Task 6
- 市街介入の乗算→加算 → Task 1
- コスト（切り札=2）・UI・用語 → Task 7
- 議題/イベント層（学習放獣・普及啓発・乱獲イベント）→ 本計画の対象外（別スペック）。`非目標` として spec に明記済み。

**Placeholder scan:** プレースホルダなし。各 Step にコード実体あり。レバー値は `model.ts` に集約。

**Type consistency:** `ActionKind`（mowing/electric-fence/attractant-removal/box-trap/emergency-shooting/patrol/hazing）、`EncounterEventKind`（+trap-capture）、`DistrictState`（interventionTurns/trapTurns/forestInfluxFactor/patrolTurns/hazingHabituation）、`canActivateAction` の署名はタスク間で一致。`actionEffects` のフィールド名は Task 1 で定義し Task 2〜6 で参照。

**既知の注意（実装者向け）:**
- Task 3・5・6 は `resolveEncounterPhase` の同一ブロック（里山出没・`newDistricts` spread）を編集する。順に実装すれば競合しないが、各タスクは「自分のフィールドを spread に追記」する差分であることを意識する。最終的に `newDistricts[def.id]` の spread は `electricFenceTurns / mowingBlockTurns / interventionTurns / intervention / trapTurns / forestInfluxFactor / patrolTurns / hazingHabituation / pendingDecay*` を含む。
- `resolveEncounterPhase` は毎ターンの減衰を担うため、Task 実装後に「介入項は毎ターン変化しない」テスト（Task 1 で `urban:0` へ修正済み）が緑であることを再確認する。
