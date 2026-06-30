# 予算リソース撤廃 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 予算リソースを完全撤廃し、施策の制約を「指示ポイント（手数）」一本に集約する。全施策は指示P1のまま。悩みどころは「どの地区にどれだけ手数を割くか」。

**Architecture:** budget は GameState / StageDef / ActionDef から削除。施策コストは指示Pのみ（applyAction / canAfford / canStage から budget 判定を除去）。予算を増やしていた議題・イベントは指示P系へ差し替え。効果の強度（mowingBlockTurns 等の数値）は今回は変更しない（別パスで実プレイ調整）。

**Tech Stack:** React 18 + TypeScript, Zustand, framer-motion, Tailwind, Vitest。

## Global Constraints

- 残す管理リソースは **指示ポイント・不満度・活発度** の3つ（予算を全撤廃）。
- 全施策は指示P1（据え置き）。INSTRUCTION_POINTS_PER_TURN = 3（据え置き）。
- 効果の強度（actionEffects の数値、damage 等）は変更しない。
- 差し替え方針（確定）: 議題「緊急予算の確保」→「広域連携の応援要請」(指示P +2)。イベント「ボランティアの来援」→ 指示P +1。
- マスキング維持（数値の効果量は出さない）。
- `src/engine/encounter.ts` には触れない（無関係な未コミット変更が作業ツリーにあるため、stage しない）。
- 各タスクのコミット末で `npm run typecheck` と `npx vitest run` が成功すること。

## File Structure / 影響範囲（grep 済み）

| ファイル | 変更 |
|---|---|
| src/data/agendas.ts | emergency-budget を指示P+2札へ差し替え（Task 1）|
| src/data/events.ts | volunteer の効果を指示P+1へ差し替え（Task 1）|
| src/data/messages.ts | 開幕文の「予算と人手」→「手数」へ（Task 1）|
| src/types/index.ts | GameState.budget / StageDef.initialBudget / ActionDef.budgetCost 削除（Task 2）|
| src/data/sampleStage.ts | initialBudget 削除（Task 2）|
| src/data/actions.ts | budgetCost ×3 削除（Task 2）|
| src/engine/turn.ts | canAfford / applyAction の budget 判定・消費を削除（Task 2）|
| src/store/gameStore.ts | createInitialGameState の budget・reservedBudget・canStage の budget 判定を削除（Task 2）|
| src/App.tsx | Hud の予算表示と reservedBudget、ActionBar の costLabel を指示Pのみへ（Task 2）|
| src/components/ActionDetailCard.tsx | コスト表記を指示Pのみへ（Task 2）|
| src/store/gameStore.test.ts | budget 関連アサーション削除・指示Pベースへ書き換え（Task 2）|
| spec.md | §intro/§2.1/§3/§5.2/§6 の予算記述を更新（Task 3）|

---

## Task 1: 予算を増やす議題・イベント・文言を指示P系へ差し替え

予算がまだ存在する状態で行うため単体で緑。

**Files:**
- Modify: `src/data/agendas.ts`（emergency-budget エントリ）
- Modify: `src/data/events.ts`（volunteer エントリ）
- Modify: `src/data/messages.ts`（開幕文）

- [ ] **Step 1: agendas.ts の emergency-budget を差し替え**

`src/data/agendas.ts` の `emergency-budget` オブジェクト（id/name/description/effect/apply）を丸ごと次へ置換:

```ts
  {
    id: 'reinforcement-request',
    name: '広域連携の応援要請',
    description:
      '近隣自治体と県へ広域連携を要請。応援職員と猟友会の手が加わり、今週は動かせる人手が大きく増えます。',
    effect: '指示ポイント +2',
    apply: (g): GameState => ({ ...g, instructionPoints: g.instructionPoints + 2 }),
  },
```

- [ ] **Step 2: events.ts の volunteer の効果を指示P+1へ**

`src/data/events.ts` の `volunteer` エントリの `effect` と `apply` を置換（description はそのまま活かせるが「寄付」は手数寄りに微修正）:

```ts
  {
    id: 'volunteer',
    name: 'ボランティアの来援',
    description:
      '報道を見た地域の有志や学生たちが「力になりたい」と集まってくれました。動かせる人手が増え、対策本部の士気も上がります。',
    effect: '指示ポイント +1',
    weight: 2,
    apply: (g): GameState => ({ ...g, instructionPoints: g.instructionPoints + 1 }),
  },
```

- [ ] **Step 3: messages.ts の開幕文から「予算」を外す**

`src/data/messages.ts:17` の一節を次へ置換（前後の引用符・改行はそのまま）:

```
      '限られた人手（手数）をどう配るかは、すべてあなたの采配次第です。',
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npx vitest run`
Expected: PASS（13テスト維持）

- [ ] **Step 5: Commit**

```bash
git add src/data/agendas.ts src/data/events.ts src/data/messages.ts
git commit -m "feat: 予算を増やす議題・イベントを指示P系へ差し替え（予算撤廃の前処理）"
```

---

## Task 2: 予算リソースの本体撤廃（アトミック）

部分的な削除はコンパイルが通らないため、この Task は1コミットで全削除して緑にする。

**Files:**
- Modify: `src/types/index.ts`, `src/data/sampleStage.ts`, `src/data/actions.ts`,
  `src/engine/turn.ts`, `src/store/gameStore.ts`, `src/App.tsx`,
  `src/components/ActionDetailCard.tsx`, `src/store/gameStore.test.ts`

- [ ] **Step 1: types/index.ts — budget 系フィールドを削除**

1. `GameState` から次の2行（コメント＋フィールド）を削除:
```ts
  /** 予算（万円。切り崩し型・有限。最小単位は万で端数は出さない）。 */
  budget: number
```
2. `StageDef` から次の2行を削除:
```ts
  /** §3 自治体規模により異なる初期予算（万円）。 */
  initialBudget: number
```
3. `ActionDef` から次の2行を削除:
```ts
  /** 予算コスト（万円）。 */
  budgetCost: number
```
4. `ActionKind` の mowing 行コメントを修正:
```ts
  | 'mowing' // 広域草刈り（数ターン流入遮断）
```

- [ ] **Step 2: sampleStage.ts — initialBudget を削除**

`src/data/sampleStage.ts` の行 `  initialBudget: 100, // 100万円（万円単位）` を削除する。

- [ ] **Step 3: actions.ts — budgetCost を削除**

3施策それぞれから `budgetCost: ...,`（コメント含む）の行を削除する。`instructionPointCost: 1` は残す。

- [ ] **Step 4: engine/turn.ts — budget 判定・消費を削除**

1. `canAfford` を次へ置換:
```ts
export function canAfford(game: GameState, kind: ActionKind): boolean {
  const a = ACTIONS[kind]
  return game.instructionPoints >= a.instructionPointCost
}
```
2. `applyAction` の return オブジェクトから budget 行を削除（`budget: game.budget - a.budgetCost,` を消す）。`instructionPoints` の消費行は残す。結果は:
```ts
  return {
    ...game,
    instructionPoints: game.instructionPoints - a.instructionPointCost,
    districts: { ...game.districts, [districtId]: next },
  }
```

- [ ] **Step 5: gameStore.ts — budget の初期化・reservedBudget・canStage 判定を削除**

1. `createInitialGameState` の return から `budget: stage.initialBudget,` を削除。
2. `GameStore` interface から次を削除:
```ts
  /** 予約合計の予算（万円）。 */
  reservedBudget: () => number
```
3. 実装の `reservedBudget` メソッドを削除:
```ts
  reservedBudget: () =>
    get().pendingActions.reduce((sum, p) => sum + ACTIONS[p.kind].budgetCost, 0),
```
4. `canStage` を次へ置換（budget 判定を除去し指示Pのみ）:
```ts
  canStage: (kind) => {
    const { game, selectedDistrictId } = get()
    if (!game || game.phase !== 'action' || !selectedDistrictId) return false
    // 既に当該地区へ予約済みなら、OFF にできるよう常に許可
    if (get().isStaged(selectedDistrictId, kind)) return true
    const a = ACTIONS[kind]
    const pointsLeft = game.instructionPoints - get().reservedPoints()
    return pointsLeft >= a.instructionPointCost
  },
```
5. `commitActions` 内のコメント `// 1) 予約を配列順に適用（予算・指示Pを実消費）` を `// 1) 予約を配列順に適用（指示Pを実消費）` に修正。

- [ ] **Step 6: App.tsx — Hud の予算表示と ActionBar の costLabel を更新**

1. `Hud` から `reservedBudget` セレクタと `resB` を削除し、予算表示 `<span>` を丸ごと削除:
   - 削除: `const reservedBudget = useGameStore((s) => s.reservedBudget)`
   - 削除: `const resB = reservedBudget()`
   - 削除する span:
```tsx
        <span>
          予算 <b>{game.budget.toLocaleString()}</b> 万円
          {resB > 0 && <span className="ml-1 text-risk-warn">(−{resB})</span>}
        </span>
```
   `resP`（reservedPoints）と指示P表示はそのまま残す。
2. `ActionBar` の `costLabel` 定義を、全施策が指示P1である前提の簡潔表記へ置換:
```tsx
          const costLabel = `指示P${a.instructionPointCost}`
```
   （`a.budgetCost` への参照を除去する。三項演算子を上記1行に置き換える。）

- [ ] **Step 7: ActionDetailCard.tsx — コスト表記を指示Pのみへ**

`src/components/ActionDetailCard.tsx` の `cost` 定義を置換（`budgetCost` 参照を除去）:
```tsx
  const cost = `指示P${action.instructionPointCost}`
```

- [ ] **Step 8: gameStore.test.ts — budget 関連を削除・指示Pベースへ書き換え**

1. 「toggleAction で選択地区に予約が追加される」から `expect(s().reservedBudget()).toBe(10)` の行を削除（`reservedPoints` 等の他アサーションは残す）。
2. 「同じ施策を再 toggle すると予約が外れる」から `expect(s().reservedBudget()).toBe(0)` の行を削除。
3. 「残予算が足りない施策は canStage=false（予算が縛りになる場合）」テスト（`it(...)` ブロック全体）を削除する（予算が無くなり指示P枯渇テストと重複するため）。
4. 「予約済みの施策は残予算0でも canStage=true（トグルOFFを許可）」テストを、指示P枯渇下のバイパス検証へ全置換:
```ts
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
    expect(s().canStage('clean-up')).toBe(false)
  })
```
5. commit テスト「予約を順に適用して…」の budget アサーション `expect(g.budget).toBe(60) // 100 - 40` を削除し、指示P検証を残す（`expect(g.instructionPoints).toBe(1)`。clean-up + electric-fence = 指示P2 消費、3→1）。「予約0件でも commit でき…」の `expect(s().game!.budget).toBe(100) // 消費なし` を削除。「closeActionModal は予約・リソースを変えない」の `expect(s().game!.budget).toBe(100) // 未消費のまま` を削除（pendingActions が変わらない検証は残す）。
6. その他 budget を参照する箇所が残っていないこと（`grep -n budget src/store/gameStore.test.ts` が空）を確認。

- [ ] **Step 9: Verify（全削除後に緑）**

Run: `grep -rn "budget\|Budget\|initialBudget\|budgetCost" src/ || echo "no budget refs"`
Expected: コード/テストから budget 参照が消えている（`src/engine/encounter.ts` は対象外。grep に出なければ可）。

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: typecheck PASS、テスト全数 PASS、build 成功。

- [ ] **Step 10: Commit**

```bash
git add src/types/index.ts src/data/sampleStage.ts src/data/actions.ts src/engine/turn.ts src/store/gameStore.ts src/App.tsx src/components/ActionDetailCard.tsx src/store/gameStore.test.ts
git commit -m "feat: 予算リソースを撤廃し施策の制約を指示ポイント一本に集約"
```

注: `src/engine/encounter.ts` は stage しないこと（無関係な未コミット変更）。

---

## Task 3: spec.md の予算記述を更新

コードに依存しない独立タスク。

**Files:** Modify `spec.md`

- [ ] **Step 1: §intro（3行目）**

「プレイヤーは対策本部長となり、有限の予算と手数を駆使して、」→「プレイヤーは対策本部長となり、限られた手数（指示ポイント）を駆使して、」

- [ ] **Step 2: §2.1（18行目）**

「**【対策フェーズ】**: 「指示ポイント」と「予算」を消費し、各地区へマクロな施策を指示。」→「**【対策フェーズ】**: 「指示ポイント」を消費し、各地区へマクロな施策を指示。」

- [ ] **Step 3: §3 リソース表**

予算の行（`| 予算 | 切り崩し型（有限） | … |`）を表から削除する。冒頭の説明文「プレイヤーが管理するリソースは以下の3つのみ。…」はそのまま（指示ポイント・不満度の2行 ＋ 別途管理の活発度で整合。文言が「3つ」と齟齬する場合は「以下のとおり」に緩めてよい）。

- [ ] **Step 4: §5.2（111・113〜115行目）**

- 111行目「プレイヤーが「予算」と「指示ポイント」を消費し、」→「プレイヤーが「指示ポイント」を消費し、」
- 各対策の「（予算：0円）」「（予算：10万円）」「（予算：30万円）」表記を削除（施策名のみ、または「（指示P1）」に統一）。

- [ ] **Step 5: §6（127行目）**

予算0に関する段落「予算が0になっても即敗北にはならないが、…破滅へ向かう。」を削除、または「手数（指示ポイント）には限りがあり、毎ターンすべての地区に手が回るわけではない。優先順位を誤れば市街地まで一気に決壊し、破滅へ向かう。」へ置換する。

- [ ] **Step 6: Commit**

```bash
git add spec.md
git commit -m "docs: 仕様書から予算リソースの記述を撤廃し指示ポイント一本に更新"
```

---

## Self-Review

- 撤廃対象（grep 済み）: types/sampleStage/actions/engine/store/App/ActionDetailCard/store-test/agendas/events/messages/spec を全タスクでカバー。✓
- 緑の連続性: Task1（データ差し替え=budget存続下で緑）→ Task2（アトミック全削除で緑）→ Task3（docのみ）。✓
- 効果数値は不変（actionEffects/damage に触れない）。✓
- encounter.ts 不触。✓
- 議題/イベント差し替えは指示P系（手数中心の設計に整合）。✓
