# 遭遇率上昇モデルの整理：放置ドリフト廃止・クリーン作戦削除・介入項の保留

日付: 2026-07-01

## 背景と意図

遭遇率の上昇（rise）は自然圧（季節・活発度）が担うべきで、そこに「人間の介入項」を
上昇要因として混ぜる必要はない。人間の介入は、上昇式に足し引きする独立項ではなく、
他の係数やレイヤー（活発度・議題・施策）の変化として表現する。

現状、人間の介入項 `intervention`（里山=加算項、市街=乗算係数）を動かしているのは
**クリーン作戦（施策）** と **放置ドリフト（neglectDrift）** の2つだけ。この2つを
所定のレイヤーへ移し、介入項自体は式に残したまま当面ゼロ（中立）で保留する。

## 決定事項

1. **放置ドリフトを廃止** — 対策しないと遭遇率がじわじわ上がる圧は、活発度
   （季節カーブ + ランダムイベント）に一本化する。`intervention` 経由の毎ターン
   自然増は撤去する。

2. **クリーン作戦（clean-up）を施策から削除** — 概念は既存の議題「誘引物除去」
   （全地区の里山遭遇率 -6）に集約する。重複する新規議題は追加しない。

3. **介入項（intervention）は保留** — 上昇式（`satoyamaRise` の加算項、`urbanRise`
   の乗算係数）と `DistrictState.intervention`、初期値（satoyama=0 / urban=1）は
   そのまま残す。駆動源を全て外すので当面ゼロ固定＝中立。後日「定常業務」を表す
   施策で再駆動する余地を残す。

## 中立性の確認

- `satoyamaRise`: `humanIntervention = 0` → 加算項がゼロで上昇度に影響しない。
- `urbanRise`: `humanIntervention = 1` → `urbanBreachScale × overflow / satoyamaRatio`。
  乗数が1なので市街決壊の挙動は変わらない。

## 変更対象

| ファイル | 変更 |
|---|---|
| `src/types/index.ts` | `ActionKind` から `'clean-up'` を削除。`DistrictState.intervention` の
「放置で増加」コメントを実態（保留）に合わせて更新 |
| `src/data/actions.ts` | `ACTIONS` から `clean-up` 定義を削除 |
| `src/engine/model.ts` | `RiskModelParams.actionEffects` から `cleanUpSatoyamaDelta` /
`cleanUpUrbanFactorDelta` を削除。`neglectDrift` フィールドと既定値を削除 |
| `src/engine/turn.ts` | `applyAction` の `clean-up` case を削除。`resolveEncounterPhase`
の intervention 毎ターン加算ブロックを削除（intervention はそのまま引き継ぐ） |
| テスト | `turn.test.ts` / `actions.test.ts` / `encounter.test.ts` の clean-up /
neglectDrift 依存箇所を更新 |

`ACTION_LIST` は `Object.values(ACTIONS)` 由来のため、UI コンポーネントは無改修で
clean-up が消える（ハードコード参照なし）。

## スコープ外

- 「定常業務」を表す新しい施策の設計（介入項の再駆動）。別タスク。
- 議題・活発度カーブの数値バランス調整。
