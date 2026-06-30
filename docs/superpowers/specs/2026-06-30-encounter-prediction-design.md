# 来週予測の表示 設計書

作成日: 2026-06-30

## 目的

行動フェーズで、各地区の遭遇率が**来週どこまで上がるか（予測値）**を、いま予約中の施策を
反映した形で見せる。現状は「上昇 → 判定」順のため、プレイヤーは判定に使われる上昇後の
値を見ずに行動を決めており、急騰時に不意打ちになりやすい。予測表示でこの予告性・予測
可能性を補い、施策の効果を事前に検討できるようにする。

順序自体（上昇 → 判定）は変更しない。予測表示のみを追加する。

## スコープ

- 対象: 詳細パネル（`DistrictDetail`）の「里山遭遇率 / 市街遭遇率」メーター。
- 行動フェーズ（`phase === 'action'`）でのみ予測を表示。他フェーズは現状のまま。
- 予測は**予約中の施策（`pendingActions`）を反映**する。予約の追加/解除で即更新。
- **地図（`MapView`）は変更しない**（予測色は付けない）。

### スコープ外
- 地図の予測着色 / 別パネルでの予測表示。
- 数理モデル・係数・ターン順序の変更。
- 出没（hit）の予測（確率は出すが乱数判定はしない。予測するのは率のみ）。

## 中核：予測は確定処理と同じ計算を共有する

予測値が実際の確定値とズレないよう、`resolveEncounterPhase` から乱数・出没判定・状態
組み立てを除いた「遭遇率の上昇だけを計算する純関数」を抽出する。

```ts
// src/engine/turn.ts
export interface ProjectedRate { satoyama: number; urban: number }

/**
 * 各地区の「次ターンの遭遇率（里山・市街）」を、乱数・出没判定なしで算出する純関数。
 * resolveEncounterPhase の手順①里山更新（草刈り遮断考慮）／②市街決壊更新 と同一。
 */
export function projectEncounterRates(
  game: GameState,
  stage: StageDef,
  model: RiskModel,
): Record<DistrictId, ProjectedRate>
```

- `resolveEncounterPhase` 自身もこの関数を呼ぶようにリファクタし、計算の単一の真実源にする
  （予測 == 確定 を構造的に保証）。
- 算出内容（現行ロジックと同一）:
  - 里山: `prev = 現在の satoyamaEncounterRate`、`neighborRates = mowingBlockTurns>0 ? {} : prevSatoyamaの全地区マップ`、
    `new = clamp(prev + model.satoyamaRise({district, activeness, neighborSatoyamaRates, humanIntervention: intervention.satoyama}), 0, 100)`。
  - 市街: `new = clamp(現在の urbanEncounterRate + model.urbanRise({district, satoyamaEncounterRate: 上で求めた里山new, humanIntervention: intervention.urban}), 0, 100)`。
- 隣接流入は現行どおり「前ターン（=現在）の里山遭遇率」を同時参照する。

## 予測導出（施策反映）

詳細パネルは、`commitActions` と同じ前処理を純粋に再現して予測を得る。

1. 現在の `game` に、予約中の `pendingActions` を `applyAction(game, p.districtId, p.kind, model)` で
   順に適用 → 仮想状態 `gameAfterActions`。
2. `projectEncounterRates(gameAfterActions, stage, model)` → 全地区の予測。
3. 選択地区 `selectedDistrictId` の予測値をメーターに渡す。

施策ごとの予測への効き方（仕様どおり。実装で新たに分岐しない）:

| 施策 | 予測への反映 |
| :-- | :-- |
| 広域草刈り（mowing） | `mowingBlockTurns>0` で隣接流入が断たれ、予測**里山が下がる** |
| クリーン作戦（clean-up） | `intervention.satoyama -12` / `urban factor -0.3` で予測**里山・市街が下がる** |
| 電気柵（electric-fence） | 出没を1回防ぐ対策で**遭遇率（率）は変えない** → 予測値は不変（UIに注記） |

計算は純粋・低コスト（10地区）。React の `useMemo`（依存: `game`, `stage`, `pendingActions`）で算出する。

## 表示（詳細パネルのメーター）

`Meter` に任意の予測値プロパティを追加する。

```ts
function Meter(props: { label: string; value: number; predicted?: number; max?: number })
```

- `predicted` 未指定（行動フェーズ以外）: 現状と完全に同じ表示。
- `predicted` 指定時:
  - ラベル右の数値を `現在 → 予測` 形式に。例: `45 → 63`。予測数値は予測値のリスク色
    （既存 `riskColor`）。`Math.round` 表示。
  - バー上に**予測位置のゴースト目盛り**（予測% の位置に縦線/半透明セグメント）を重ねる。
  - 予測 < 現在（施策で下がる）でも同形式。矢印は上下どちらも `→` で可（増減は数値で判る）。
  - 予測 == 現在（decay 等で同値）の時も `現在 → 予測` を出してよい（特別扱い不要）。
- 適用箇所: `里山遭遇率` と `市街遭遇率` の2メーター。`game.phase === 'action'` のときだけ
  `predicted` を渡す。
- 電気柵だけを予約しても率は動かないため、パネルに小さく「⚡電気柵は遭遇率を下げず、
  出没を1回防ぎます」の注記を表示（誤解防止。常時か、電気柵予約時のみ）。

## 実装単位（ファイル）

- `src/engine/turn.ts`: `ProjectedRate` 型と `projectEncounterRates` を追加。`resolveEncounterPhase`
  を同関数利用へリファクタ。
- `src/App.tsx`: `Meter` に `predicted?` を追加。`DistrictDetail` で予測 `useMemo` を算出し、
  行動フェーズ時に2メーターへ渡す。電気柵の注記を追加。
- `MapView` 等その他は変更なし。

## テスト

`src/engine/turn.test.ts`（新規。既存テストの規約に合わせ `vitest`）:

- **不変条件**: 任意の `game`/`stage` で、`projectEncounterRates` の各地区の
  `{satoyama, urban}` が、固定乱数（`rng = () => 1`＝出没なし）で実行した
  `resolveEncounterPhase` 後の `satoyamaEncounterRate`/`urbanEncounterRate` と一致する。
  - 注: `resolveEncounterPhase` は出没時に `pendingDecay` を立てるが減衰は翌ターン適用なので、
    `rng=()=>1`（出没なし）なら確定レート＝予測レート。neglectDrift は intervention に
    かかり当ターンの率には影響しない。
- **草刈りの反映**: ある地区に `mowing` を適用した `game'` の予測里山 < 未適用の予測里山
  （隣接流入が断たれる地区で）。
- **クリーン作戦の反映**: `clean-up` 適用で予測里山が下がる。

`npm run typecheck` / `npm test` / `npm run build` が通ること。手動で行動フェーズの
メーターに `現在 → 予測` とゴースト目盛りが出ること、予約の増減で更新されることを目視。

## 受け入れ条件

- 行動フェーズの詳細パネルで、選択地区の里山/市街メーターに「現在 → 予測」とゴースト
  目盛りが表示される。
- 草刈り/クリーン作戦を予約すると予測値が下がり、解除で戻る。電気柵では予測値は変わらない。
- 予測値が `resolveEncounterPhase`（乱数で出没が起きなかった場合）の確定値と一致する。
- 地図・他フェーズの表示は従来どおり。typecheck/test/build が緑。
