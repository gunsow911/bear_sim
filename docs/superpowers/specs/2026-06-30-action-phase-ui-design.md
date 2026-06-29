# 施策フェーズ UI改善 設計

作成日: 2026-06-30

## 背景と課題

施策フェーズ（`phase === 'action'`、内部名は「対策コマンド」）では、`ActionBar`（`src/App.tsx`）が
広域草刈り / クリーン作戦 / 電気柵 の3ボタンを表示する。現状の問題は次の3点。

1. **効果がわかりにくい** — ボタンの `title` ツールチップに簡素な機能説明があるだけで、
   「実行すると何が起こるか」が直感的に伝わらない。
2. **キャンセルできない** — ボタンを押すと選択地区へ**即時適用**され、予算・指示Pがその場で
   引かれて取り消せない（`gameStore.applyAction` → `applyActionEngine`）。
3. **フレーバー文がない** — 議題（`Agenda`）には豊富なナラティブ文があるが、施策にはない。

本改修はこの3点を、既存のマスキング方針（ベース生息密度・介入値・遭遇率の内部変動は
プレイヤーに見せない）を保ったまま解消する。

議題フロー（`AgendaCards`）と遭遇結果カード（`EncounterReveal`）は変更しない。

## 決定事項（ブレインストーミングでの合意）

- **予約UI**: トグル ＋ 「今週の施策」一覧 ＋ 確認モーダル。
- **効果表示**: 質的ラベル＋持続のみ。数値は出さない（マスキング維持）。
  施策は常に選択地区1つだけが対象のため、**範囲（scope）は表示しない**。
- **フレーバー**: 施策バーのボタンをホバー／フォーカスすると詳細カードをポップオーバー表示
  （flavor ＋ 効果 ＋ 持続 ＋ コスト）。

## データモデル変更

### `ActionDef`（`src/types/index.ts`）

既存の `description`（簡素な機能説明）に代えて、以下を追加する。

```ts
export interface ActionDef {
  kind: ActionKind
  name: string
  budgetCost: number          // 万円
  instructionPointCost: number
  /** ナラティブな状況描写文（議題と同テイスト）。 */
  flavor: string
  /** 質的な効果（例「この地区の里山の出没を1回だけ防ぐ」）。数値は出さない。 */
  effectLabel: string
  /** 持続（例「次の出没を1回」「永続」「約3週間」）。 */
  duration: string
  /** flavor 内で用語ツールチップ対象となる現実用語（議題の realTerms と同様。任意）。 */
  realTerms?: string[]
}
```

`description` は削除する（参照箇所は `ActionBar` の `title` のみ）。
flavor は議題カードと同じく `wrapTerms(flavor, realTerms)` を通して用語ツールチップ化する
（詳細カードのポップオーバー内）。

### `src/data/actions.ts`

各施策に `flavor` / `effectLabel` / `duration` を付与する。`duration` の文言は
`defaultRiskModel.params.actionEffects` の挙動と齟齬が出ないようにする
（草刈りは `mowingBlockTurns: 3` → 「約3週間」、電気柵は1回無効化 → 「次の出没を1回」、
クリーン作戦は永続減少 → 「永続」）。`duration` はあくまで表示用テキストであり、
数理パラメータと自動連動はしない（コメントで明示）。

文案（初版・調整可）:

| kind | effectLabel | duration | flavor 方向性 |
|---|---|---|---|
| mowing | この地区への流入をしばらくせき止める | 約3週間 | 集落と山林の境界を刈り払い、見通しを確保。けものみちを断つ。 |
| clean-up | この地区の出没しやすさを永続的に下げる | 永続 | 放置果樹や生ゴミ（誘引物）を一掃。降りてくる動機を恒久的にそぐ。 |
| electric-fence | この地区の里山の出没を1回だけ防ぐ | 次の出没を1回 | 農地に侵入防止柵。次の里山出没を1度だけ無効化する。 |

## 予約（ステージング）化

### ストア（`src/store/gameStore.ts`）

施策は確定前の UI 状態として保持し、`GameState` には載せない。

- 新規 state: `pendingActions: { districtId: DistrictId; kind: ActionKind }[]`
- `applyAction(kind)` を **`toggleAction(kind)`** に置き換える。
  選択地区に対し、未予約なら追加、予約済みなら除去する。
  - 制約: 1地区につき各種別は1つまで（トグル）。別種別の併用可。同種別を別地区に可。
- 予約解除用: `removeAction(districtId, kind)`（一覧チップの × から呼ぶ）。
- 予約状態の照会: `isStaged(districtId, kind): boolean`。
- 予約消費リソース（派生値・セレクタ）:
  - `reservedBudget = Σ ACTIONS[kind].budgetCost`
  - `reservedPoints = Σ ACTIONS[kind].instructionPointCost`
- `canStage(kind)`: `phase === 'action'` かつ
  `(budget - reservedBudget) >= cost` かつ `(instructionPoints - reservedPoints) >= cost`。
  既に当該地区へ予約済みなら（トグルOFFは常に可なので）`true`。
- 実消費は実行時まで遅延。キャンセル＝予約除去で予約分が自動的に戻る
  （実際には引いていないため、派生値の再計算だけで戻る）。

### 解決順序

`advancePhase` の `action` 分岐を、確認モーダルの「実行」から呼ぶ commit 処理に変更する。

1. 「クマの行動へ →」押下 → **確認モーダルを開くだけ**（フェーズは `action` のまま）。
2. モーダル「実行」 → `pendingActions` を順に `applyActionEngine(game, districtId, kind, model)` で畳み込み、
   予算・指示Pを実消費。
3. 続いて `resolveEncounterPhase` で**遭遇判定**。
4. `pendingActions` をクリアし、`phase` を `encounter`（または敗北なら `gameover`）へ。

リセット（`reset`）・ターン開始（`beginTurn`）でも `pendingActions: []` を保証する。

## UI 構成（`src/App.tsx` ほか）

### 施策バー `ActionBar`

- 各施策はトグルボタン。選択地区に予約済みなら `✓` とハイライト（ring）。
- `canStage` が偽（残予算/残指示P不足）の種別は無効化（`disabled` + 減光）。
  ただし当該地区に予約済みの場合はOFFにできるよう常に有効。
- **詳細カードのポップオーバー**: ホバー／フォーカスで、その施策の
  flavor ＋ 効果（effectLabel）＋ 持続（duration）＋ コスト を表示。
  タッチ端末（hover 不可）向けに、ボタン自体が常時 `effectLabel` とコストを
  コンパクト表示してカバーする（flavor はホバー/フォーカスの進化的強化）。

### 「今週の施策」チップバー

- 配置: **地区詳細パネル（`DistrictDetail`）の上部に薄いバー**。
- 全地区の予約を `地区名：施策名 ×` のチップで横並び一覧（横スクロール可）。
- `×` でどこからでも解除（`removeAction`）。
- 施策フェーズかつ予約1件以上のときのみ表示。

### HUD（`Hud`）リソース表示

- 予算・指示Pは予約分を引いた残りが伝わる表記にする。
  例: `予算 120万 (−30)` / `指示P 1 (−2)`。
  本体の数値は実残高（未消費）、`(−X)` は予約合計。実行時に本体が減る。

### 確認モーダル `ActionConfirmModal`（新規・`src/components/`）

- 「クマの行動へ →」押下で開く。`AgendaCards` / `EncounterReveal` と同じ
  framer-motion オーバーレイのテイストに合わせる。
- 予約を**地区ごとにグルーピング**して、施策名＋効果ラベルを再掲。
- ボタン: `[戻る]`（閉じて施策フェーズ継続）/ `[実行]`（commit → 遭遇判定へ）。
- 予約0件のとき: 「今週は施策を実行しません」＋ `[戻る]` `[このまま進む]`。

### `PhaseControl`

- 施策フェーズの「クマの行動へ →」は直接 `advancePhase` せず、確認モーダルを開く
  （store にモーダル開閉 state を持たせるか、`App` ローカル state とするかは実装時に決定。
  他フェーズの遷移は従来どおり）。

## 変更ファイル一覧

| ファイル | 変更 |
|---|---|
| `src/types/index.ts` | `ActionDef` に flavor/effectLabel/duration 追加、description 削除 |
| `src/data/actions.ts` | 各施策に flavor/effectLabel/duration を付与 |
| `src/store/gameStore.ts` | pendingActions、toggleAction/removeAction/isStaged、reserved セレクタ、canStage、commit順序、確認モーダル state |
| `src/App.tsx` | ActionBar 改修（トグル＋ポップオーバー）、予約チップバー、HUD 予約表示、PhaseControl |
| `src/components/ActionConfirmModal.tsx` | 新規・確認モーダル |

## テスト方針

- エンジン純関数（`applyAction` / `resolveEncounterPhase`）は不変のため既存テストは維持。
- ストアのテスト（あれば）に以下を追加:
  - `toggleAction` で予約の追加・除去、同種別トグルの冪等性。
  - 残リソース不足時に `canStage` が偽。
  - commit で全予約が順に適用され、予算・指示Pが正しく実消費される。
  - commit 後に `pendingActions` がクリアされる。
  - 確認モーダルの「戻る」で状態が変わらない（予約・リソースとも温存）。

## 非対象（YAGNI）

- 施策の効果の数値プレビュー（マスキング方針により不採用）。
- 議題フローと遭遇結果カードの変更。
- 施策の実行順の並べ替えUI（適用は配列順で十分）。
