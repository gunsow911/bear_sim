# 施策ヘルプモーダル＋状態バッジ＋コスト昇順並び Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 各施策にヘルプボタン→モーダル（現実の施策の解説＋ゲーム的な効果）を設けてホバー詳細を置き換え、地区詳細に残る3施策の状態バッジを追加し、施策バーを日常5→切り札2の順に並べ替える。

**Architecture:** データ層（`ActionDef` に2解説フィールド追加＋`ACTIONS` 定義順の並べ替え）、状態層（Zustand ストアに help モーダルの開閉状態）、UI 層（新規 `ActionHelpModal`、`ActionBar` の「？」ボタン化とホバー撤去、`DistrictDetail` の状態バッジ追加）の3層。モーダルは既存 `EventModal` の framer-motion 様式を踏襲。

**Tech Stack:** TypeScript, React, Zustand, framer-motion, Vitest。テスト実行は `npm test` / `npx vitest run <path>`。型は `npx tsc --noEmit`、ビルドは `npm run build`。

## Global Constraints

- 数値マスキング維持：モーダルの `gameEffectDesc` に内部パラメータ・数値を出さない（質的説明のみ）。`realWorldDesc` は現実解説でゲーム数値を含めない。施策ボタン上も日常(指示1)コストは非表示、切り札(指示2)のみ「指示2」明示。
- 既存パターン踏襲：モーダルは `EventModal`（`fixed inset-0 z-[1000] … bg-black/60` の framer-motion オーバーレイ＋`bg-panel-light` カード）と同形。状態バッジは既存 ⚡電気柵/✂️草刈り と同じ見た目（`rounded … px-2 py-0.5 text-xs`）。
- 管理リソースを増やさない。追い払いの慣れ（`hazingHabituation`）は UI 非表示のまま。
- 施策の並びは `ACTIONS` の定義順の並べ替えで実現（render 時ソートはしない）。適用順の `commitActions`（切り札を先に）ロジックは変更しない。

---

## File Structure

- `src/types/index.ts` — `ActionDef` に `realWorldDesc` / `gameEffectDesc`（必須）を追加。
- `src/data/actions.ts` — 7施策に2解説フィールドを記述し、`ACTIONS` の定義順を日常5→切り札2へ。
- `src/store/gameStore.ts` — `helpActionKind` state ＋ `openActionHelp`/`closeActionHelp`。
- `src/components/ActionHelpModal.tsx` — 新規。ヘルプモーダル本体。
- `src/components/ActionDetailCard.tsx` — 削除（ホバー撤去で未使用化）。
- `src/App.tsx` — `ActionBar`（「？」ボタン・ホバー撤去・`ActionDetailCard` import 除去・`<ActionHelpModal/>` マウント）、`DistrictDetail`（状態バッジ3種）。
- テスト：`src/data/actions.test.ts`（解説フィールド非空）、`src/store/gameStore.test.ts`（help state）。

---

## Task 1: `ActionDef` に解説フィールド追加・7施策記述・定義順並べ替え

**Files:**
- Modify: `src/types/index.ts`（`ActionDef` に2フィールド）
- Modify: `src/data/actions.ts`（7施策に記述＋並べ替え）
- Test: `src/data/actions.test.ts`

**Interfaces:**
- Produces: `ActionDef.realWorldDesc: string` / `ActionDef.gameEffectDesc: string`（必須）。`ACTION_LIST = Object.values(ACTIONS)` の順が `mowing → electric-fence → attractant-removal → patrol → hazing → box-trap → emergency-shooting`。

- [ ] **Step 1: 失敗テストを書く**

`src/data/actions.test.ts` の `describe('ACTIONS data', …)` 内に追記：

```ts
  it('各施策が realWorldDesc / gameEffectDesc を持つ', () => {
    for (const a of ACTION_LIST) {
      expect(a.realWorldDesc.length).toBeGreaterThan(0)
      expect(a.gameEffectDesc.length).toBeGreaterThan(0)
    }
  })

  it('施策バーの並びは日常5→切り札2（コスト昇順のグルーピング）', () => {
    expect(ACTION_LIST.map((a) => a.kind)).toEqual([
      'mowing', 'electric-fence', 'attractant-removal', 'patrol', 'hazing',
      'box-trap', 'emergency-shooting',
    ])
  })
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/data/actions.test.ts`
Expected: FAIL（`realWorldDesc` が型に無く TS エラー、または並び順が現行の box-trap/emergency-shooting が中央にある順と不一致）

- [ ] **Step 3: `ActionDef` に2フィールドを追加**

`src/types/index.ts` の `ActionDef` インターフェース、`effectLabel` の下に追記：

```ts
  /** ヘルプモーダル：現実の施策の解説（教育的。ゲーム数値は含めない）。 */
  realWorldDesc: string
  /** ヘルプモーダル：ゲーム的な効果の説明（質的。数値マスキング維持）。 */
  gameEffectDesc: string
```

- [ ] **Step 4: `ACTIONS` に記述を追加し定義順を並べ替える**

`src/data/actions.ts` の `ACTIONS` を、次の**キー順**（`mowing`→`electric-fence`→`attractant-removal`→`patrol`→`hazing`→`box-trap`→`emergency-shooting`）に並べ替え、各エントリに `realWorldDesc` と `gameEffectDesc` を追加する。既存の `kind`/`name`/`instructionPointCost`/`flavor`/`effectLabel`/`realTerms` はそのまま維持し、以下の2フィールドだけ足す：

```ts
  // mowing
  realWorldDesc:
    '集落と山林の境界に茂った藪を刈り払い、見通しのよい緩衝帯をつくる生息環境管理の手法です。クマが身を隠して里へ下りる“けものみち”を断ち、人里に近づきにくくします。',
  gameEffectDesc:
    '対象の地区に数ターンのあいだ効き、山からの直接の流入と、隣の地区からの移動流入の両方を鈍らせます。危険が高まる前に打っておく“先行投資”型の対策です。',

  // electric-fence
  realWorldDesc:
    '農地や養蜂場のまわりに電気柵を張りめぐらせ、クマの侵入を物理的に防ぐ被害防止対策です。除去しきれない誘引物を守るのに使われます。',
  gameEffectDesc:
    '対象の地区の里山の出没を一度だけ確実に食い止める“盾”です。防いだ時点で失効します。決壊してからでは間に合わないので、危ないと見たら早めに張っておきます。',

  // attractant-removal
  realWorldDesc:
    '放置された柿や栗、屋外の生ゴミなど、クマを人里へ引き寄せる誘引物を地域ぐるみで取り除く根本対策です。第5期計画でも重点に位置づけられています。',
  gameEffectDesc:
    '対象の地区で、里山・市街どちらの出没圧もしばらくのあいだ抑え続けます。すぐ劇的には効きませんが、じわじわと長く効くのが持ち味です。',

  // patrol
  realWorldDesc:
    'クマレンジャーや鳥獣専門指導員が地区を巡回し、早期発見・現場対応・住民への助言にあたります。山口県では最も多く行われている対策です。',
  gameEffectDesc:
    '巡回しているあいだ、その地区でクマが出没しても住民の不安（不満）の広がりを抑えます。出没そのものは防ぎませんが、被害の“痛み”を和らげるダメージコントロールです。',

  // hazing
  realWorldDesc:
    '花火・犬・爆音機などでクマを山へ追い返す対策です。すぐ効きますが、同じ手を繰り返すとクマが慣れてしまい、だんだん通用しなくなります。',
  gameEffectDesc:
    '対象の地区の出没を今すぐ薄く抑えます。ただし同じ地区で繰り返すほど慣れて効きが落ち、しばらく使わないと再び効くようになります。根本対策と組み合わせて使います。',

  // box-trap
  realWorldDesc:
    '排除地域に箱わなを設置し、里に通う個体を捕獲する個体群管理の手法です。個体群を守るため、年間の捕獲上限のもとで慎重に運用されます。',
  gameEffectDesc:
    '仕掛けて待ち伏せ、かかれば人里に出る前に捕らえます。捕獲できると、以後その地区に降りてくる圧そのものが恒久的に和らぎます。人手がかかり、指示を2つ使います。',

  // emergency-shooting
  realWorldDesc:
    '市街地などでクマが人に緊急の危険を及ぼす際、市町村の判断で銃による捕獲を実施できる制度です（2024年の鳥獣保護管理法改正で創設）。',
  gameEffectDesc:
    '市街地に出没が起きてはじめて発動できる“最後の防衛線”です。市街の危険を即座に断ち切りますが、発砲は住民を動揺させ不満が上がります。指示を2つ使います。',
```

> 実装メモ：各コメント（`// mowing` 等）の2フィールドを、対応する既存エントリの中に差し込む。エントリ全体の順序を上記キー順に並べ替えること（`box-trap`/`emergency-shooting` を末尾へ移動）。

- [ ] **Step 5: テスト緑を確認**

Run: `npx vitest run src/data/actions.test.ts && npx tsc --noEmit`
Expected: PASS（解説フィールド非空・並び順一致・型エラーなし）

- [ ] **Step 6: 全テスト＋コミット**

Run: `npm test`

```bash
git add src/types/index.ts src/data/actions.ts src/data/actions.test.ts
git commit -m "feat: 施策に現実解説/ゲーム効果の説明を追加し、バー並びを日常→切り札順に"
```

---

## Task 2: ストアに help モーダルの開閉状態

**Files:**
- Modify: `src/store/gameStore.ts`
- Test: `src/store/gameStore.test.ts`

**Interfaces:**
- Consumes: `ActionKind`（既存）
- Produces: `helpActionKind: ActionKind | null`（初期 null）／`openActionHelp(kind: ActionKind): void`／`closeActionHelp(): void`

- [ ] **Step 1: 失敗テストを書く**

`src/store/gameStore.test.ts` の末尾に追記：

```ts
describe('gameStore 施策ヘルプモーダル', () => {
  beforeEach(() => {
    s().reset()
    s().startStage(yamaguchiStage)
  })

  it('openActionHelp で helpActionKind がセットされ、closeActionHelp で null に戻る', () => {
    expect(s().helpActionKind).toBe(null)
    s().openActionHelp('box-trap')
    expect(s().helpActionKind).toBe('box-trap')
    s().closeActionHelp()
    expect(s().helpActionKind).toBe(null)
  })
})
```

- [ ] **Step 2: テスト失敗を確認**

Run: `npx vitest run src/store/gameStore.test.ts -t '施策ヘルプモーダル'`
Expected: FAIL（`openActionHelp is not a function`）

- [ ] **Step 3: ストアに state と操作を追加**

`src/store/gameStore.ts` の `GameStore` インターフェースに追記（`actionModalOpen` 付近）：

```ts
  /** ヘルプモーダルで説明中の施策。null = 非表示。 */
  helpActionKind: ActionKind | null
  /** 指定施策のヘルプモーダルを開く。 */
  openActionHelp: (kind: ActionKind) => void
  /** ヘルプモーダルを閉じる。 */
  closeActionHelp: () => void
```

`create<GameStore>(...)` の初期値群（`actionModalOpen: false` の近く）に `helpActionKind: null,` を追加し、アクション実装（`openActionModal` の近く）に追記：

```ts
  openActionHelp: (kind) => set({ helpActionKind: kind }),
  closeActionHelp: () => set({ helpActionKind: null }),
```

`reset` の `set({...})` にも `helpActionKind: null,` を加える（他のUI状態リセットと揃える）。

- [ ] **Step 4: テスト緑を確認**

Run: `npx vitest run src/store/gameStore.test.ts -t '施策ヘルプモーダル' && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 全テスト＋コミット**

Run: `npm test`

```bash
git add src/store/gameStore.ts src/store/gameStore.test.ts
git commit -m "feat: ストアに施策ヘルプモーダルの開閉状態を追加"
```

---

## Task 3: ヘルプモーダル本体＋施策バーの「？」ボタン化＋ホバー撤去

**Files:**
- Create: `src/components/ActionHelpModal.tsx`
- Delete: `src/components/ActionDetailCard.tsx`
- Modify: `src/App.tsx`（`ActionBar` 改修・`<ActionHelpModal/>` マウント・`ActionDetailCard` import 除去）

**Interfaces:**
- Consumes: Task 1 の `ActionDef.realWorldDesc`/`gameEffectDesc`、Task 2 の `helpActionKind`/`openActionHelp`/`closeActionHelp`。

- [ ] **Step 1: `ActionHelpModal` を作成**

`src/components/ActionHelpModal.tsx` を新規作成：

```tsx
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { ACTIONS } from '@/data/actions'

/**
 * 施策ヘルプモーダル。施策バーの「？」から開き、現実の施策の解説とゲーム的な効果を示す。
 * マスキング維持のため gameEffectDesc に数値は出さない（データ側の責務）。
 */
export function ActionHelpModal() {
  const kind = useGameStore((s) => s.helpActionKind)
  const close = useGameStore((s) => s.closeActionHelp)
  const action = kind ? ACTIONS[kind] : null

  useEffect(() => {
    if (!action) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [action, close])

  return (
    <AnimatePresence>
      {action && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="w-full max-w-md rounded-xl border border-panel-border bg-panel-light p-6 shadow-2xl"
            initial={{ scale: 0.9, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-xl font-bold">{action.name}</h2>
              <button
                aria-label="閉じる"
                onClick={close}
                className="shrink-0 text-slate-400 transition hover:text-slate-100"
              >
                ✕
              </button>
            </div>
            <section className="mb-4">
              <p className="mb-1 text-xs font-bold text-slate-400">現実の施策</p>
              <p className="text-sm leading-relaxed text-slate-200">{action.realWorldDesc}</p>
            </section>
            <section>
              <p className="mb-1 text-xs font-bold text-risk-safe">ゲーム的な効果</p>
              <p className="text-sm leading-relaxed text-slate-200">{action.gameEffectDesc}</p>
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: `ActionBar` を「？」ボタン化しホバーを撤去**

`src/App.tsx` の `ActionBar` を次のように書き換える。

(a) `activeKind` state と `useState` によるホバー管理・`clearIf`・`activeAction` を削除し、`openActionHelp` を購読する：

```tsx
function ActionBar() {
  const toggleAction = useGameStore((s) => s.toggleAction)
  const canStage = useGameStore((s) => s.canStage)
  const isStaged = useGameStore((s) => s.isStaged)
  const selectedId = useGameStore((s) => s.selectedDistrictId)
  const game = useGameStore((s) => s.game)
  const openActionHelp = useGameStore((s) => s.openActionHelp)
  if (!game || !selectedId) return null

  return (
    <div className="border-t border-panel-border pt-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ACTION_LIST.map((a) => {
          const staged = isStaged(selectedId, a.kind)
          const enabled = canStage(a.kind)
          return (
            <div key={a.kind} className="relative shrink-0">
              <button
                disabled={!enabled}
                aria-pressed={staged}
                onClick={() => toggleAction(a.kind)}
                className={`flex w-44 flex-col rounded-lg border px-3 py-2 pr-7 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
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
                {a.instructionPointCost === 0 && (
                  <span className="text-xs font-bold text-risk-safe">無料</span>
                )}
                {a.instructionPointCost >= 2 && (
                  <span className="text-xs font-bold text-amber-300">指示{a.instructionPointCost}</span>
                )}
              </button>
              <button
                aria-label={`${a.name}の説明`}
                onClick={() => openActionHelp(a.kind)}
                className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-panel-border bg-panel text-xs text-slate-300 transition hover:bg-panel-light hover:text-slate-100"
              >
                ？
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

要点：
- 施策トグルは `<button>`、「？」は**その兄弟**の別 `<button>`（ネストしない＝HTML 妥当）。ラッパ `div` は `relative shrink-0`。「？」は `absolute right-1 top-1 z-10`。
- トグルボタンに `pr-7` を足し、`effectLabel` が「？」の下に潜らないようにする。
- 「？」は `disabled` にしない（非活性な緊急銃猟でも説明を読めるように）。
- 末尾にあった `ActionDetailCard` ポップオーバーのブロックと、外側 `relative` は削除（ラッパは各アイテム側に移動）。

(b) `ActionBar` で使わなくなった `useState` import が App.tsx 内の他箇所で未使用なら除去（他で使っていれば残す）。`ActionKind` の import は「？」の型で引き続き使う場合は残す（未使用なら tsc が指摘）。

- [ ] **Step 3: `ActionDetailCard` を削除し import を除去、モーダルをマウント**

- `src/components/ActionDetailCard.tsx` を削除する（`git rm`）。
- `src/App.tsx` 冒頭の `import { ActionDetailCard } from '@/components/ActionDetailCard'` を削除。
- `import { ActionHelpModal } from '@/components/ActionHelpModal'` を他モーダル import（`EventModal` 付近）に追加。
- 他モーダルのマウント箇所（`<EventModal />` / `<MessageModal />` の並び）に `<ActionHelpModal />` を追加。

- [ ] **Step 4: 型・ビルド確認**

Run: `npx tsc --noEmit && npm run build`
Expected: 型エラーなし・ビルド成功（未使用 import が残っていれば tsc で検出→除去）。

- [ ] **Step 5: 全テスト＋コミット**

Run: `npm test`（既存テスト緑を確認）

```bash
git add src/components/ActionHelpModal.tsx src/App.tsx
git rm src/components/ActionDetailCard.tsx
git commit -m "feat: 施策ヘルプモーダルと「？」ボタンを追加しホバー詳細を撤去"
```

- [ ] **Step 6: 手動確認（推奨・任意）**

`npm run dev` で対策フェーズに入り、施策バーの各ボタン右上の「？」でモーダルが開くこと、施策トグルは「？」と独立に動くこと、非活性の緊急銃猟でも「？」でモーダルが開き発動条件が読めることを目視。

---

## Task 4: 地区詳細の状態バッジ（罠・誘引物・巡回）

**Files:**
- Modify: `src/App.tsx`（`DistrictDetail` の「状態」領域）

**Interfaces:**
- Consumes: `DistrictState.trapTurns` / `interventionTurns` / `patrolTurns`（既存）

- [ ] **Step 1: バッジを追加し空表示条件を更新**

`src/App.tsx` の `DistrictDetail`「状態」領域、`mowingBlockTurns` バッジの直後・「対策の効果なし」条件の直前に3バッジを挿入：

```tsx
              {ds.trapTurns > 0 && (
                <span className="rounded bg-risk-safe/20 px-2 py-0.5 text-xs text-risk-safe">
                  🪤 箱わな 待機 残り{ds.trapTurns}T
                </span>
              )}
              {ds.interventionTurns > 0 && (
                <span className="rounded bg-risk-warn/20 px-2 py-0.5 text-xs text-risk-warn">
                  🍎 誘引物除去 残り{ds.interventionTurns}T
                </span>
              )}
              {ds.patrolTurns > 0 && (
                <span className="rounded bg-slate-500/30 px-2 py-0.5 text-xs text-slate-200">
                  🚓 パトロール 残り{ds.patrolTurns}T
                </span>
              )}
```

「対策の効果なし」の条件を5種すべて0のときに更新：

```tsx
              {ds.electricFenceTurns === 0 &&
                ds.mowingBlockTurns === 0 &&
                ds.trapTurns === 0 &&
                ds.interventionTurns === 0 &&
                ds.patrolTurns === 0 && (
                  <span className="text-xs text-slate-500">対策の効果なし</span>
                )}
```

- [ ] **Step 2: 型・ビルド確認**

Run: `npx tsc --noEmit && npm run build`
Expected: 型エラーなし・ビルド成功。

- [ ] **Step 3: 全テスト＋コミット**

Run: `npm test`

```bash
git add src/App.tsx
git commit -m "feat: 地区詳細に箱わな・誘引物・パトロールの状態バッジを追加"
```

- [ ] **Step 4: 手動確認（推奨・任意）**

`npm run dev` で箱わな/誘引物除去/パトロールを予約→コミットし、対象地区の「状態」にそれぞれのバッジと残ターンが出ること、いずれも無い地区で「対策の効果なし」が出ることを目視。

---

## Self-Review

**Spec coverage:**
- A. `ActionDef` 拡張＋7施策記述 → Task 1。
- B. ヘルプモーダル（新規コンポーネント・ストア state） → Task 2（state）＋ Task 3（component/mount）。
- C. 施策バー：並べ替え → Task 1（ACTIONS 定義順）、「？」ボタン・ホバー撤去・ActionDetailCard 削除 → Task 3。
- D. 状態バッジ3種＋空条件更新 → Task 4。
- E. 緊急銃猟の非活性理由＝モーダル内のみ → Task 1（`gameEffectDesc` に発動条件を記載）＋「？」が disabled でないこと（Task 3）。
- テスト（解説非空／help state） → Task 1／Task 2。UI 目視 → Task 3/4 の手動確認。

**Placeholder scan:** プレースホルダなし。全コードブロックは実体。解説文は7施策すべて確定文言。

**Type consistency:** `realWorldDesc`/`gameEffectDesc`（Task 1 定義 → Task 3 モーダルで参照）、`helpActionKind`/`openActionHelp`/`closeActionHelp`（Task 2 定義 → Task 3 で参照）、`trapTurns`/`interventionTurns`/`patrolTurns`（既存 `DistrictState` → Task 4 参照）一致。

**既知の注意（実装者向け）:**
- Task 3 は `ActionBar` を単一 `<button>` から「ラッパ div＋トグル button＋？ button（兄弟）」へ再構成する。button のネストは HTML 不正なので必ず兄弟にする。
- `ActionDetailCard` 削除後、App.tsx に未使用 import が残ると `tsc`/build が失敗するので確実に除去する（`useState`/`ActionKind` が他所で使われていれば残す）。
