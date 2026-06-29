# 施策フェーズ UI改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 施策（対策コマンド）を「予約 → 確認 → 実行 → 遭遇判定」の流れに変え、フレーバー文・効果ラベル・持続を見せてキャンセル可能にする。

**Architecture:** 施策は確定前の UI 状態 `pendingActions` としてストアに保持し、`GameState` には載せない。「クマの行動へ」で確認モーダルを開き、「実行」で予約を順に `applyActionEngine` へ畳み込んでから `resolveEncounterPhase` を呼ぶ。実消費は実行時まで遅延し、キャンセルは予約除去で自動的に戻る。マスキング方針（数値非表示）は維持し、効果は質的ラベルと持続のみ見せる。

**Tech Stack:** React 18 + TypeScript, Zustand, framer-motion, Tailwind, Vitest。

## Global Constraints

- 数値（介入値・遭遇率・生息密度）はプレイヤーに見せない（マスキング維持）。
- 施策は常に選択地区1つだけが対象。範囲（scope）は表示しない。
- 予算の最小単位は万・端数なし。
- 1ターン付与の指示ポイントは `INSTRUCTION_POINTS_PER_TURN = 3`（既存）。
- 施策コスト（既存）: 草刈り 0万/指示P1、クリーン作戦 10万/指示P1、電気柵 30万/指示P1。
- `sampleStage.initialBudget = 100`（万円）。
- エンジン純関数 `applyAction`（`src/engine/turn.ts`）・`resolveEncounterPhase` は変更しない。
- 議題フロー（`AgendaCards`）と遭遇結果カード（`EncounterReveal`）は変更しない。
- 各コミットで `npm run typecheck` と `npx vitest run` が成功すること（常時グリーン）。
- インクリメンタル戦略: 旧 `applyAction`/`canApply` はUI差し替え（Task 5）まで残し、最後に除去する。

## File Structure

| ファイル | 責務 |
|---|---|
| `src/types/index.ts` | `ActionDef` 拡張、`PendingAction` 型追加 |
| `src/data/actions.ts` | 各施策の flavor/effectLabel/duration/realTerms |
| `src/store/gameStore.ts` | pendingActions、toggle/remove/isStaged、reserved、canStage、commitActions、モーダル開閉、clear |
| `src/store/gameStore.test.ts` | ストアロジックの単体テスト（新規） |
| `src/components/ActionDetailCard.tsx` | 施策の詳細ポップオーバーカード（新規） |
| `src/components/ActionConfirmModal.tsx` | 実行確認モーダル（新規） |
| `src/App.tsx` | ActionBar 改修、予約チップバー、HUD 予約表示、PhaseControl |

---

## Task 1: ActionDef 型と施策データの拡張

**Files:**
- Modify: `src/types/index.ts:174-183`（`ActionDef`）, 型末尾に `PendingAction` 追加
- Modify: `src/data/actions.ts`（全面）
- Test: `src/data/actions.test.ts`

**Interfaces:**
- Produces:
  - `interface ActionDef { kind; name; budgetCost; instructionPointCost; flavor: string; effectLabel: string; duration: string; realTerms?: string[] }`
  - `interface PendingAction { districtId: DistrictId; kind: ActionKind }`
  - `ACTIONS: Record<ActionKind, ActionDef>` / `ACTION_LIST: ActionDef[]`（既存名のまま、フィールド差し替え）

- [ ] **Step 1: Write the failing test**

Create `src/data/actions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ACTIONS, ACTION_LIST } from './actions'

describe('ACTIONS data', () => {
  it('各施策が flavor / effectLabel / duration を持つ', () => {
    for (const a of ACTION_LIST) {
      expect(a.flavor.length).toBeGreaterThan(0)
      expect(a.effectLabel.length).toBeGreaterThan(0)
      expect(a.duration.length).toBeGreaterThan(0)
    }
  })

  it('3種別すべてが定義されている', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(
      ['clean-up', 'electric-fence', 'mowing'].sort(),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/actions.test.ts`
Expected: FAIL（`flavor` 等が未定義のため型/プロパティで失敗、または `description` のみで `flavor.length` が落ちる）

- [ ] **Step 3: Update the `ActionDef` type and add `PendingAction`**

In `src/types/index.ts`, replace the `ActionDef` interface (currently ending with `description: string`) with:

```ts
/** §5.2 対策コマンドの定義。 */
export interface ActionDef {
  kind: ActionKind
  name: string
  /** 予算コスト（万円）。 */
  budgetCost: number
  /** 指示ポイントコスト。 */
  instructionPointCost: number
  /** ナラティブな状況描写文（議題と同テイスト）。 */
  flavor: string
  /** 質的な効果（例「この地区の里山の出没を1回だけ防ぐ」）。数値は出さない。 */
  effectLabel: string
  /** 持続（例「次の出没を1回」「永続」「約3週間」）。表示用テキストで数理パラメータと自動連動はしない。 */
  duration: string
  /** flavor 内で用語ツールチップ対象となる現実用語（議題の realTerms と同様。任意）。 */
  realTerms?: string[]
}
```

Then add, immediately after the `ActionDef` interface (end of file):

```ts
/** UI 上で予約中（実行前）の施策。地区とコマンド種別の組。 */
export interface PendingAction {
  districtId: DistrictId
  kind: ActionKind
}
```

- [ ] **Step 4: Rewrite `src/data/actions.ts`**

Replace the whole file with:

```ts
/**
 * §5.2 対策コマンドの定義。コスト等は仕様の例に基づく暫定値。
 * 効果量（遭遇率への影響度）は RiskModel.params.actionEffects 側で管理する。
 * flavor / effectLabel / duration は表示専用（マスキング維持のため数値は出さない）。
 */

import type { ActionDef, ActionKind } from '@/types'

export const ACTIONS: Record<ActionKind, ActionDef> = {
  mowing: {
    kind: 'mowing',
    name: '広域草刈り',
    budgetCost: 0, // 万円
    instructionPointCost: 1,
    flavor:
      '集落と山林の境界を一斉に刈り払い、見通しを確保。やぶに隠れて里へ下りる“けものみち”をしばらく断ちます。',
    effectLabel: 'この地区への流入をしばらくせき止める',
    duration: '約3週間',
  },
  'clean-up': {
    kind: 'clean-up',
    name: 'クリーン作戦',
    budgetCost: 10, // 万円
    instructionPointCost: 1,
    flavor:
      '放置果樹や生ゴミ（誘引物）を地域ぐるみで一掃。里へ下りてくる動機そのものを恒久的にそぎます。',
    effectLabel: 'この地区の出没しやすさを永続的に下げる',
    duration: '永続',
    realTerms: ['誘引物'],
  },
  'electric-fence': {
    kind: 'electric-fence',
    name: '電気柵の設置',
    budgetCost: 30, // 万円
    instructionPointCost: 1,
    flavor:
      '農地のまわりに侵入防止柵を張りめぐらせます。次に里山から下りてくる出没を、一度だけ確実に食い止めます。',
    effectLabel: 'この地区の里山の出没を1回だけ防ぐ',
    duration: '次の出没を1回',
  },
}

export const ACTION_LIST: ActionDef[] = Object.values(ACTIONS)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/data/actions.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS（`App.tsx` の `title={a.description}` が `description` 削除で失敗する場合は、暫定的に `title={a.flavor}` に置換しておく。Task 5 で最終形に直す）

注: 上記 typecheck が `a.description` で失敗したら、`src/App.tsx` の `ActionBar` 内 `title={a.description}` を `title={a.flavor}` に変更してから再実行する。

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/data/actions.ts src/data/actions.test.ts src/App.tsx
git commit -m "feat: 施策にフレーバー文・効果ラベル・持続を追加し PendingAction 型を定義"
```

---

## Task 2: ストアに予約（pendingActions）と派生セレクタを追加

**Files:**
- Modify: `src/store/gameStore.ts`（state・interface・実装）
- Test: `src/store/gameStore.test.ts`（新規）

**Interfaces:**
- Consumes: `PendingAction`, `ActionKind`, `DistrictId`（types）; `ACTIONS`（data）
- Produces（`GameStore` に追加）:
  - `pendingActions: PendingAction[]`
  - `toggleAction(kind: ActionKind): void` — 選択地区に対し未予約なら追加・予約済みなら除去
  - `removeAction(districtId: DistrictId, kind: ActionKind): void`
  - `isStaged(districtId: DistrictId, kind: ActionKind): boolean`
  - `reservedBudget(): number`
  - `reservedPoints(): number`
  - `canStage(kind: ActionKind): boolean`
- 注: 既存 `applyAction`/`canApply` は残す（Task 5 まで）。

- [ ] **Step 1: Write the failing test**

Create `src/store/gameStore.test.ts`:

```ts
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

  it('予約済みの施策は canStage=true（トグルOFFを常に許可）', () => {
    const g = s().game!
    useGameStore.setState({ game: { ...g, budget: 0 } })
    s().selectDistrict('ato')
    // budget0 でも mowing(0万) は予約できる
    s().toggleAction('mowing')
    expect(s().canStage('mowing')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/gameStore.test.ts`
Expected: FAIL（`toggleAction` 等が未定義）

- [ ] **Step 3: Add state fields and method signatures to the `GameStore` interface**

In `src/store/gameStore.ts`, add to the `GameStore` interface (near `selectedAgendaId` / `applyAction`):

```ts
  /** UI 上で予約中（実行前）の施策一覧。 */
  pendingActions: PendingAction[]
  /** 選択中の地区に対し施策を予約／解除する（対策フェーズのみ）。 */
  toggleAction: (kind: ActionKind) => void
  /** 指定の予約を解除する。 */
  removeAction: (districtId: DistrictId, kind: ActionKind) => void
  /** 指定地区にその施策が予約済みか。 */
  isStaged: (districtId: DistrictId, kind: ActionKind) => boolean
  /** 予約合計の予算（万円）。 */
  reservedBudget: () => number
  /** 予約合計の指示ポイント。 */
  reservedPoints: () => number
  /** その施策を今予約できるか（残リソース・フェーズ）。予約済みなら常に true。 */
  canStage: (kind: ActionKind) => boolean
```

Update the imports at the top to include `PendingAction`:

```ts
import type {
  ActionKind,
  Agenda,
  DistrictId,
  DistrictState,
  GameState,
  PendingAction,
  RandomEvent,
  StageDef,
} from '@/types'
```

Add `ACTIONS` to the data import (alongside existing engine imports):

```ts
import { ACTIONS } from '@/data/actions'
```

- [ ] **Step 4: Initialize state and implement methods**

In the `create<GameStore>(...)` initial state block, add after `tentativeAgendaId: null,`:

```ts
  pendingActions: [],
```

Add the method implementations (place them after `applyAction`):

```ts
  toggleAction: (kind) =>
    set((state) => {
      const { game, selectedDistrictId, pendingActions } = state
      if (!game || game.phase !== 'action' || !selectedDistrictId) return state
      const exists = pendingActions.some(
        (p) => p.districtId === selectedDistrictId && p.kind === kind,
      )
      if (exists) {
        return {
          pendingActions: pendingActions.filter(
            (p) => !(p.districtId === selectedDistrictId && p.kind === kind),
          ),
        }
      }
      if (!get().canStage(kind)) return state
      return { pendingActions: [...pendingActions, { districtId: selectedDistrictId, kind }] }
    }),

  removeAction: (districtId, kind) =>
    set((state) => ({
      pendingActions: state.pendingActions.filter(
        (p) => !(p.districtId === districtId && p.kind === kind),
      ),
    })),

  isStaged: (districtId, kind) =>
    get().pendingActions.some((p) => p.districtId === districtId && p.kind === kind),

  reservedBudget: () =>
    get().pendingActions.reduce((sum, p) => sum + ACTIONS[p.kind].budgetCost, 0),

  reservedPoints: () =>
    get().pendingActions.reduce((sum, p) => sum + ACTIONS[p.kind].instructionPointCost, 0),

  canStage: (kind) => {
    const { game, selectedDistrictId } = get()
    if (!game || game.phase !== 'action' || !selectedDistrictId) return false
    // 既に当該地区へ予約済みなら、OFF にできるよう常に許可
    if (get().isStaged(selectedDistrictId, kind)) return true
    const a = ACTIONS[kind]
    const budgetLeft = game.budget - get().reservedBudget()
    const pointsLeft = game.instructionPoints - get().reservedPoints()
    return budgetLeft >= a.budgetCost && pointsLeft >= a.instructionPointCost
  },
```

- [ ] **Step 5: Clear `pendingActions` on reset and at turn boundaries**

In `beginTurn`, add `pendingActions: []` to **both** returned objects (turn 1 branch and the normal branch), and widen its return type accordingly:

```ts
function beginTurn(game: GameState): {
  game: GameState
  currentEvent: RandomEvent | null
  agendaChoices: Agenda[]
  selectedAgendaId: null
  tentativeAgendaId: null
  pendingActions: PendingAction[]
} {
```

Turn 1 branch return — add `pendingActions: [],`. Normal branch return — add `pendingActions: [],`.

In `reset`, add `pendingActions: [],` to the `set({ ... })` object.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/store/gameStore.test.ts`
Expected: PASS（全7ケース）

- [ ] **Step 7: Typecheck and full test**

Run: `npm run typecheck && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/store/gameStore.ts src/store/gameStore.test.ts
git commit -m "feat: ストアに施策の予約(pendingActions)と canStage を追加"
```

---

## Task 3: 実行コミットと確認モーダルの開閉をストアに追加

**Files:**
- Modify: `src/store/gameStore.ts`
- Test: `src/store/gameStore.test.ts`（追記）

**Interfaces:**
- Consumes: `applyActionEngine`（既存 import `applyAction as applyActionEngine`）, `resolveEncounterPhase`, `activeRiskModel`, `GAMEOVER_MESSAGES`
- Produces（`GameStore` に追加）:
  - `actionModalOpen: boolean`
  - `openActionModal(): void`
  - `closeActionModal(): void`
  - `commitActions(): void` — 予約を順に適用 → 遭遇解決 → 予約クリア → モーダルを閉じ phase を encounter/gameover へ

- [ ] **Step 1: Write the failing test (append to `src/store/gameStore.test.ts`)**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/gameStore.test.ts`
Expected: FAIL（`actionModalOpen` / `commitActions` 等が未定義）

- [ ] **Step 3: Add interface members and initial state**

In the `GameStore` interface, add:

```ts
  /** 実行確認モーダルの開閉。 */
  actionModalOpen: boolean
  /** 確認モーダルを開く（「クマの行動へ」押下時）。 */
  openActionModal: () => void
  /** 確認モーダルを閉じる（「戻る」）。 */
  closeActionModal: () => void
  /** 予約済みの施策をすべて適用し、遭遇フェーズを解決する。 */
  commitActions: () => void
```

In the initial state block, add `actionModalOpen: false,` (next to `pendingActions: []`).

- [ ] **Step 4: Implement the methods**

Add after `commitActions` interface neighbors in the store body (place near `advancePhase`):

```ts
  openActionModal: () => set({ actionModalOpen: true }),

  closeActionModal: () => set({ actionModalOpen: false }),

  commitActions: () =>
    set((state) => {
      const { game, stage, pendingActions } = state
      if (!game || !stage || game.phase !== 'action') return state

      // 1) 予約を配列順に適用（予算・指示Pを実消費）
      let applied = game
      for (const p of pendingActions) {
        applied = applyActionEngine(applied, p.districtId, p.kind, activeRiskModel)
      }

      // 2) 遭遇フェーズの解決
      const { game: resolved, events } = resolveEncounterPhase(applied, stage, activeRiskModel)
      const over = resolved.dissatisfaction >= 100
      return {
        game: { ...resolved, phase: over ? 'gameover' : 'encounter' },
        lastEvents: events,
        dissatisfactionBefore: game.dissatisfaction,
        messages: over ? GAMEOVER_MESSAGES : [],
        messageIndex: 0,
        pendingActions: [],
        actionModalOpen: false,
      }
    }),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/store/gameStore.test.ts`
Expected: PASS（追加4ケース含む全11ケース）

- [ ] **Step 6: Typecheck and full test**

Run: `npm run typecheck && npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/store/gameStore.ts src/store/gameStore.test.ts
git commit -m "feat: 施策の実行コミット(commitActions)と確認モーダル開閉をストアに追加"
```

---

## Task 4: 施策の詳細ポップオーバーカード

**Files:**
- Create: `src/components/ActionDetailCard.tsx`
- Test: なし（表示専用。`npm run build` で検証）

**Interfaces:**
- Consumes: `ActionDef`（types）, `wrapTerms`（`./wrapTerms`）
- Produces: `export function ActionDetailCard({ action }: { action: ActionDef }): JSX.Element`
  — flavor（用語ツールチップ化）＋ 効果 ＋ 持続 ＋ コストを表示する小カード。

- [ ] **Step 1: Create the component**

Create `src/components/ActionDetailCard.tsx`:

```tsx
import type { ActionDef } from '@/types'
import { wrapTerms } from './wrapTerms'

/**
 * 施策の詳細カード。施策バーのボタンにホバー／フォーカスしたときに
 * ポップオーバーとして表示する（flavor ＋ 効果 ＋ 持続 ＋ コスト）。
 * マスキング維持のため数値の効果量は出さず、質的ラベルのみを示す。
 */
export function ActionDetailCard({ action }: { action: ActionDef }) {
  const cost =
    action.budgetCost > 0
      ? `${action.budgetCost}万円 / 指示P${action.instructionPointCost}`
      : `予算0 / 指示P${action.instructionPointCost}`
  return (
    <div className="w-64 rounded-lg border border-panel-border bg-panel-light p-3 text-left shadow-2xl">
      <p className="mb-1 font-bold">{action.name}</p>
      <p className="mb-2 text-xs leading-relaxed text-slate-300">
        {action.realTerms?.length ? wrapTerms(action.flavor, action.realTerms) : action.flavor}
      </p>
      <dl className="space-y-0.5 text-xs">
        <div className="flex gap-2">
          <dt className="shrink-0 text-slate-400">効果</dt>
          <dd className="font-bold text-risk-safe">{action.effectLabel}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-slate-400">持続</dt>
          <dd>{action.duration}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-slate-400">コスト</dt>
          <dd>{cost}</dd>
        </div>
      </dl>
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds and typechecks**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ActionDetailCard.tsx
git commit -m "feat: 施策の詳細ポップオーバーカードを追加"
```

---

## Task 5: ActionBar をトグル化し、HUD 予約表示と PhaseControl を接続

**Files:**
- Modify: `src/App.tsx`（`Hud`, `PhaseControl`, `ActionBar`）
- Modify: `src/store/gameStore.ts`（旧 `applyAction`/`canApply` を除去）
- Test: なし（`npm run typecheck` + `npx vitest run` + 手動チェック）

**Interfaces:**
- Consumes: `toggleAction`, `canStage`, `isStaged`, `reservedBudget`, `reservedPoints`, `openActionModal`, `selectedDistrictId`（store）; `ActionDetailCard`
- 注: この Task で `applyAction`/`canApply` の参照（`ActionBar`）を全廃し、ストアからも除去する。

- [ ] **Step 1: Remove obsolete store methods**

In `src/store/gameStore.ts`, delete the `applyAction` method implementation and its interface declaration (the `/** 選択中の地区に対策コマンドを実行する… */ applyAction: (kind: ActionKind) => void` line and the `applyAction: (kind) => set(...)` block) and the `canApply` method + its interface declaration. （`applyActionEngine` の import は `commitActions` で使うため残す。）

- [ ] **Step 2: Rewrite `ActionBar` in `src/App.tsx`**

Replace the entire `ActionBar` function with:

```tsx
/** §5.2 施策バー。選択中の地区に対し予約／解除をトグルする（対策フェーズのみ有効）。 */
function ActionBar() {
  const toggleAction = useGameStore((s) => s.toggleAction)
  const canStage = useGameStore((s) => s.canStage)
  const isStaged = useGameStore((s) => s.isStaged)
  const selectedId = useGameStore((s) => s.selectedDistrictId)
  const game = useGameStore((s) => s.game)
  if (!game || !selectedId) return null

  return (
    <div className="flex flex-wrap gap-2 border-t border-panel-border pt-3">
      {ACTION_LIST.map((a) => {
        const staged = isStaged(selectedId, a.kind)
        const enabled = canStage(a.kind)
        const costLabel =
          a.budgetCost > 0 ? `${a.budgetCost}万円 / 指示P${a.instructionPointCost}` : `予算0 / 指示P${a.instructionPointCost}`
        return (
          <div key={a.kind} className="group relative">
            <button
              disabled={!enabled}
              aria-pressed={staged}
              onClick={() => toggleAction(a.kind)}
              className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                staged
                  ? 'border-risk-safe bg-panel-light ring-2 ring-risk-safe'
                  : 'border-panel-border bg-panel hover:bg-panel-light'
              }`}
            >
              <span className="font-bold">
                {staged ? '✓ ' : ''}
                {a.name}
              </span>
              <span className="text-xs text-risk-safe">{a.effectLabel}</span>
              <span className="text-xs text-slate-400">{costLabel}</span>
            </button>
            {/* ホバー／フォーカスで詳細カードを表示（タッチ端末はボタンの常時表示でカバー） */}
            <div className="pointer-events-none absolute bottom-full left-0 z-[600] mb-2 hidden group-hover:block group-focus-within:block">
              <ActionDetailCard action={a} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Add the `ActionDetailCard` import**

At the top of `src/App.tsx`, add:

```tsx
import { ActionDetailCard } from '@/components/ActionDetailCard'
```

- [ ] **Step 4: Show reserved resources in the HUD**

In the `Hud` function, replace the 予算 and 指示P `<span>` blocks with reservation-aware versions. Add selectors at the top of `Hud`:

```tsx
function Hud() {
  const game = useGameStore((s) => s.game)
  const reservedBudget = useGameStore((s) => s.reservedBudget)
  const reservedPoints = useGameStore((s) => s.reservedPoints)
  if (!game) return null
  const resB = reservedBudget()
  const resP = reservedPoints()
```

Replace the 予算 span:

```tsx
        <span>
          予算 <b>{game.budget.toLocaleString()}</b> 万円
          {resB > 0 && <span className="ml-1 text-risk-warn">(−{resB})</span>}
        </span>
```

Replace the 指示P span:

```tsx
        <span>
          指示P <b>{game.instructionPoints}</b>
          {resP > 0 && <span className="ml-1 text-risk-warn">(−{resP})</span>}
        </span>
```

- [ ] **Step 5: Wire `PhaseControl` action button to open the modal**

In `PhaseControl`, add the selector and change the `action` branch button to open the modal instead of advancing:

```tsx
function PhaseControl() {
  const game = useGameStore((s) => s.game)
  const advancePhase = useGameStore((s) => s.advancePhase)
  const openActionModal = useGameStore((s) => s.openActionModal)
  const reset = useGameStore((s) => s.reset)
  if (!game) return null
```

Change the `if (game.phase === 'action')` block's button `onClick` from `advancePhase` to `openActionModal`:

```tsx
  if (game.phase === 'action') {
    return (
      <button
        className="rounded-lg bg-risk-warn px-5 py-1.5 font-bold text-panel transition hover:brightness-110"
        onClick={openActionModal}
      >
        クマの行動へ →
      </button>
    )
  }
```

- [ ] **Step 6: Typecheck and full test**

Run: `npm run typecheck && npx vitest run`
Expected: PASS（`applyAction`/`canApply` 参照が残っていればここで検出されるので全て除去する）

- [ ] **Step 7: Manual smoke check**

Run: `npm run dev`、ブラウザで確認:
- 施策ボタンに効果ラベルとコストが常時表示される。
- ボタンにホバー／フォーカスで詳細カード（flavor＋効果＋持続＋コスト）が出る。
- クリックで `✓` が付き、HUD の予算/指示Pに `(−X)` が出る。再クリックで解除。
- 残指示Pが0だと未予約ボタンが無効化される。

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/store/gameStore.ts
git commit -m "feat: 施策バーをトグル予約化しHUDに予約分を表示・確認モーダルへ接続"
```

---

## Task 6: 予約チップバーと実行確認モーダル

**Files:**
- Create: `src/components/ActionConfirmModal.tsx`
- Modify: `src/App.tsx`（`DistrictDetail` に予約チップバー、`Dashboard` にモーダル設置）
- Test: なし（`npm run typecheck` + `npx vitest run` + 手動チェック）

**Interfaces:**
- Consumes: `pendingActions`, `removeAction`, `actionModalOpen`, `closeActionModal`, `commitActions`, `stage`（store）; `ACTIONS`（data）
- Produces: `export function ActionConfirmModal(): JSX.Element | null`

- [ ] **Step 1: Create `ActionConfirmModal`**

Create `src/components/ActionConfirmModal.tsx`:

```tsx
import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { ACTIONS } from '@/data/actions'
import type { DistrictId } from '@/types'

/** 「クマの行動へ」押下で開く実行確認モーダル。予約を地区ごとに再掲し、実行/戻るを選ぶ。 */
export function ActionConfirmModal() {
  const open = useGameStore((s) => s.actionModalOpen)
  const pending = useGameStore((s) => s.pendingActions)
  const stage = useGameStore((s) => s.stage)
  const closeActionModal = useGameStore((s) => s.closeActionModal)
  const commitActions = useGameStore((s) => s.commitActions)

  const nameOf = (id: DistrictId) => stage?.districts.find((d) => d.id === id)?.name ?? id
  // 地区ごとにグルーピング（出現順を保つ）
  const groups: { districtId: DistrictId; kinds: typeof pending }[] = []
  for (const p of pending) {
    let g = groups.find((x) => x.districtId === p.districtId)
    if (!g) {
      g = { districtId: p.districtId, kinds: [] }
      groups.push(g)
    }
    g.kinds.push(p)
  }
  const empty = pending.length === 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-[800] flex items-center justify-center bg-black/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-md rounded-xl border border-panel-border bg-panel-light p-5 shadow-2xl"
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
          >
            <h2 className="mb-3 text-center text-lg font-bold">今週の施策</h2>
            {empty ? (
              <p className="mb-4 text-center text-sm text-slate-300">今週は施策を実行しません。</p>
            ) : (
              <ul className="mb-4 space-y-2">
                {groups.map((g) => (
                  <li key={g.districtId} className="rounded-lg border border-panel-border bg-panel p-2">
                    <p className="mb-1 text-sm font-bold">{nameOf(g.districtId)}</p>
                    <ul className="space-y-0.5">
                      {g.kinds.map((p) => (
                        <li key={p.kind} className="flex justify-between gap-2 text-xs">
                          <span className="font-bold">{ACTIONS[p.kind].name}</span>
                          <span className="text-risk-safe">{ACTIONS[p.kind].effectLabel}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-center gap-3">
              <button
                onClick={closeActionModal}
                className="rounded-lg border border-panel-border bg-panel px-6 py-2 text-sm font-bold transition hover:bg-panel-light"
              >
                戻る
              </button>
              <button
                onClick={commitActions}
                className="rounded-lg bg-risk-warn px-6 py-2 text-sm font-bold text-panel transition hover:brightness-110"
              >
                {empty ? 'このまま進む' : '実行'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Add the 予約チップバー to `DistrictDetail`**

In `src/App.tsx`, inside `DistrictDetail`, add a staged-actions strip at the top of the returned `<section>`. First add selectors near the top of `DistrictDetail`:

```tsx
  const pending = useGameStore((s) => s.pendingActions)
  const removeAction = useGameStore((s) => s.removeAction)
```

Then, immediately inside `<section ...>` (before the `{!def || !ds ? (...) : (...)}` block), insert:

```tsx
      {game.phase === 'action' && pending.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-panel-border pb-2">
          <span className="shrink-0 text-xs text-slate-400">今週の施策</span>
          {pending.map((p) => {
            const dName = stage.districts.find((d) => d.id === p.districtId)?.name ?? p.districtId
            return (
              <span
                key={`${p.districtId}-${p.kind}`}
                className="flex shrink-0 items-center gap-1 rounded-full border border-risk-safe bg-panel px-2 py-0.5 text-xs"
              >
                {dName}：{ACTIONS[p.kind].name}
                <button
                  aria-label="予約を解除"
                  onClick={() => removeAction(p.districtId, p.kind)}
                  className="ml-1 text-slate-400 hover:text-risk-critical"
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
```

Add the `ACTIONS` import to `src/App.tsx` if not present:

```tsx
import { ACTION_LIST, ACTIONS } from '@/data/actions'
```

(置換: 既存の `import { ACTION_LIST } from '@/data/actions'` を上記に変更。)

- [ ] **Step 3: Mount `ActionConfirmModal` in `Dashboard`**

In `src/App.tsx`, add the import:

```tsx
import { ActionConfirmModal } from '@/components/ActionConfirmModal'
```

In `Dashboard`'s `<main>` (alongside `AgendaCards` / `EncounterReveal`), add:

```tsx
        <ActionConfirmModal />
```

- [ ] **Step 4: Typecheck and full test**

Run: `npm run typecheck && npx vitest run`
Expected: PASS

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`、ブラウザで確認:
- 施策を予約すると地区詳細パネル上部に「今週の施策」チップが出る。`×` で解除できる。
- 「クマの行動へ →」で確認モーダルが開き、地区ごとに施策＋効果が並ぶ。
- 「戻る」で施策フェーズに留まり予約は保持。「実行」で予約適用→遭遇結果カードへ。
- 予約0件で「クマの行動へ →」→「今週は施策を実行しません」＋「このまま進む」。

- [ ] **Step 6: Commit**

```bash
git add src/components/ActionConfirmModal.tsx src/App.tsx
git commit -m "feat: 予約チップバーと施策実行の確認モーダルを追加"
```

---

## Task 7: 統合確認とビルド

**Files:** なし（検証のみ）

- [ ] **Step 1: Full check**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: 全て PASS（型エラー・テスト失敗・ビルドエラーなし）

- [ ] **Step 2: 通しプレイ確認**

Run: `npm run dev`。第1週で施策を複数地区に予約→解除→確認モーダル→実行→遭遇結果、までを通しで確認。第2週以降で予約が持ち越されずクリアされていること、議題フローと遭遇結果カードが従来どおり動くことを確認。

- [ ] **Step 3: Commit any final touch-ups**

```bash
git add -A
git commit -m "chore: 施策フェーズUI改善の統合確認"
```

---

## Self-Review

**Spec coverage:**
- 効果がわかりにくい → Task 1（effectLabel/duration）+ Task 4（詳細カード）+ Task 5（ボタン常時表示）+ Task 6（モーダルで再掲）。✓
- キャンセルできない → Task 2（toggle/removeAction）+ Task 3（commit を遅延、遭遇判定の前に適用）+ Task 6（チップ × / モーダル戻る）。✓
- フレーバー文 → Task 1（flavor/realTerms）+ Task 4（wrapTerms で表示）。✓
- 解決順「施策適用→熊出現判定」 → Task 3 `commitActions`（apply ループ後に resolveEncounterPhase）。✓
- マスキング維持（数値非表示） → 効果は質的ラベルのみ、範囲は非表示。✓
- 議題・遭遇カード不変 → 変更ファイルに含めず。✓

**Placeholder scan:** TBD/TODO・曖昧指示なし。各コードステップに完全なコードを記載。✓

**Type consistency:** `pendingActions: PendingAction[]`、`toggleAction`/`removeAction`/`isStaged`/`reservedBudget`/`reservedPoints`/`canStage`/`commitActions`/`openActionModal`/`closeActionModal`/`actionModalOpen` の名称は全タスクで一致。`ActionDef` の `flavor`/`effectLabel`/`duration`/`realTerms` も一致。✓
