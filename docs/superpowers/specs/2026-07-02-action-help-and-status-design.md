# 施策ヘルプモーダル＋状態バッジ＋コスト昇順並び

日付: 2026-07-02

## 背景と意図

7施策（日常5＋切り札2）に拡張したが、UI に2つの申し送りがある：

1. 施策の"仕掛け済み"状態（箱わな待機・誘引物除去・パトロール）が地区詳細に出ず、
   プレイヤーが「何を仕掛けたか」を確認できない（電気柵・草刈りは既に表示済み）。
2. 施策の詳細説明がマウスオーバー（`ActionDetailCard` ポップオーバー）依存で、タッチ端末に弱く、
   現実の施策の教育的解説も薄い。

本改修で、(A) 各施策に**ヘルプボタン→モーダル**（現実の施策の解説＋ゲーム的な効果）を設け、
ホバー詳細を置き換える。(B) 地区「状態」に**残る3施策の状態バッジ**を追加する。
あわせて (C) 施策バーを**コスト昇順**（軽い日常→重い切り札）で並べる。

## 設計の軸

- **数値マスキング維持**：モーダルの `gameEffectDesc` に内部パラメータ・数値を出さない（質的説明のみ）。
  `realWorldDesc` は教育的な現実解説（ゲーム数値は含めない）。
- **既存パターン踏襲**：モーダルは `EventModal`（framer-motion オーバーレイ＋`bg-panel-light`）様式。
  状態バッジは既存の ⚡電気柵/✂️草刈り バッジと同じ見た目。
- **管理リソースを増やさない**。追い払いの慣れ（`hazingHabituation`）は非表示のまま。

## 変更詳細

### A. データ：`ActionDef` 拡張（`src/types/index.ts`, `src/data/actions.ts`）

`ActionDef` に2フィールドを追加（必須）：

```ts
  /** ヘルプモーダル：現実の施策の解説（教育的。ゲーム数値は含めない）。 */
  realWorldDesc: string
  /** ヘルプモーダル：ゲーム的な効果の説明（質的。数値マスキング維持）。 */
  gameEffectDesc: string
```

7施策すべてに記述する。要点（本文は実装時に自然な日本語で肉付け）：

| 施策 | realWorldDesc（現実） | gameEffectDesc（ゲーム効果） |
|---|---|---|
| 緩衝帯の刈り払い | 集落と山林境界の藪を刈り、見通しを確保して緩衝帯をつくる生息環境管理。移動経路(けものみち)を断つ。 | 数ターンの間、この地区への流入（山林直接・隣接移動の両方）を鈍らせる先行投資型。 |
| 誘引物の除去 | 放置果樹(カキ・クリ)・生ゴミなど、クマを人里へ引き寄せる誘引物を取り除く根本対策。第5期の重点。 | しばらくの間、この地区の里山・市街どちらの出没圧も持続的に抑える。効きは緩やかだが続く。 |
| 電気柵の設置 | 農地・養蜂場を電気柵で囲い、侵入を物理的に防ぐ被害防止対策。 | この地区の里山出没を一度だけ確実に無効化する“盾”。発揮すると失効する。 |
| パトロール | クマレンジャーや鳥獣専門指導員が巡回し、早期発見・現場対応・住民の不安緩和にあたる。山口県で最も多い対策。 | しばらくの間、この地区で出没が起きても住民の不安（不満）の広がりを抑えるダメコン。出没自体は防がない。 |
| 追い払い | 花火・犬・爆音機でクマを山へ追い返す。即効性はあるが、繰り返すとクマが慣れて効きにくくなる。 | この地区の出没を今すぐ薄く抑える。ただし同じ地区で繰り返すと慣れて効果が落ち、しばらく使わないと戻る。 |
| 箱わなによる捕獲 | 排除地域に箱わなを設置し、里へ通う個体を捕獲する個体群管理。年間の捕獲上限のもとで運用される。 | 待ち伏せ。かかれば人里に出る前に捕らえ、以後この地区に降りてくる圧そのものを恒久的に和らげる。人手（指示2）が要る。 |
| 緊急銃猟 | 市街地等でクマが緊急の危険を及ぼす際、市町村の判断で銃猟を実施できる制度（2024年法改正で創設）。 | **市街に出没が起きてから**発動できる最後の防衛線。市街の危険を即座に断ち切るが、発砲で住民が動揺する（不満が上がる）。指示2。 |

### B. ヘルプモーダル（新規 `src/components/ActionHelpModal.tsx`）

- ストア（`gameStore.ts`）に状態と操作を追加：
  ```ts
  helpActionKind: ActionKind | null
  openActionHelp: (kind: ActionKind) => void   // set({ helpActionKind: kind })
  closeActionHelp: () => void                   // set({ helpActionKind: null })
  ```
- `EventModal` と同形の framer-motion オーバーレイ（`fixed inset-0 z-[1000] … bg-black/60`）。
  本文＝施策名（見出し）／「現実の施策」節（`realWorldDesc`）／「ゲーム的な効果」節（`gameEffectDesc`）。
  背景クリック・「×」ボタン・Esc で閉じる（`closeActionHelp`）。
- `<App>` に `<ActionHelpModal />` をマウント（他モーダルと同じ階層）。

### C. 施策バー（`src/App.tsx` `ActionBar` 改修）

- **並び順**：`[...ACTION_LIST].sort((a, b) => a.instructionPointCost - b.instructionPointCost)`
  でコスト昇順に描画（安定ソートで同コスト内は現行順＝日常5→切り札2）。
  ※ これは表示順のみ。`commitActions` の適用順（切り札を先に＝コスト降順）とは独立。
- 各ボタンの右上に小さな「？」アイコンボタンを追加：`onClick` で
  `e.stopPropagation()` → `openActionHelp(a.kind)`（予約トグルを発火させない）。
  `aria-label="{施策名}の説明"`。
- ボタン本体（名称＋`effectLabel`＋コストバッジ）は現状維持。クリックで従来通り予約トグル。
- **ホバー詳細を撤去**：`activeKind` state と `onMouseEnter/Leave/Focus/Blur`、
  末尾の `ActionDetailCard` ポップオーバーを削除。
- `src/components/ActionDetailCard.tsx` は他で未使用になるため**削除**（import も除去）。

### D. 状態バッジ（`src/App.tsx` `DistrictDetail` の「状態」領域）

既存の電気柵・草刈りバッジに続けて、残り3施策のバッジを追加（同じ見た目）：

```tsx
{ds.trapTurns > 0 && (<span …>🪤 箱わな 待機 残り{ds.trapTurns}T</span>)}
{ds.interventionTurns > 0 && (<span …>🍎 誘引物除去 残り{ds.interventionTurns}T</span>)}
{ds.patrolTurns > 0 && (<span …>🚓 パトロール 残り{ds.patrolTurns}T</span>)}
```

「対策の効果なし」の空表示条件を、5種すべて（electricFence/mowing/trap/intervention/patrol）が
0 のときに更新する。追い払いの慣れ（`hazingHabituation`）は表示しない。

### E. 緊急銃猟の非活性理由

ボタンはグレーアウト（`disabled`）のまま。理由の明示は**ヘルプモーダルの `gameEffectDesc`**
（「市街に出没が起きてから発動できる」）で行い、ボタン上には別途出さない。

## テスト

- `src/data/actions.test.ts`：全 `ACTION_LIST` の各要素が `realWorldDesc` / `gameEffectDesc` を
  非空で持つことを検証（既存の flavor/effectLabel テストと同形で追加）。
- `src/store/gameStore.test.ts`：`openActionHelp(kind)` で `helpActionKind` がその kind になり、
  `closeActionHelp()` で null に戻ることを検証。
- 施策バーのコスト昇順・「？」→モーダル・状態バッジの見た目は**実機目視**
  （本プロジェクトの UI 検証慣習に従う）。

## 変更対象

| ファイル | 変更 |
|---|---|
| `src/types/index.ts` | `ActionDef` に `realWorldDesc` / `gameEffectDesc`（必須）を追加 |
| `src/data/actions.ts` | 7施策すべてに `realWorldDesc` / `gameEffectDesc` を記述 |
| `src/components/ActionHelpModal.tsx` | 新規。ヘルプモーダル本体 |
| `src/components/ActionDetailCard.tsx` | 削除（未使用化） |
| `src/store/gameStore.ts` | `helpActionKind` state ＋ `openActionHelp`/`closeActionHelp` |
| `src/App.tsx` | `ActionBar`：コスト昇順並び・「？」ボタン・ホバー撤去。`DistrictDetail`：状態バッジ3種追加。`<ActionHelpModal/>` マウント。`ActionDetailCard` import 除去 |
| `src/data/actions.test.ts` | `realWorldDesc`/`gameEffectDesc` 非空テスト |
| `src/store/gameStore.test.ts` | help モーダル state のテスト |

## 非目標（YAGNI）

- 追い払いの慣れ度のUI可視化はしない（隠しのまま）。
- モーダルからの予約トグル操作は設けない（予約はボタン本体クリックのまま）。
- 施策の並び順のユーザ設定・並べ替えUIは作らない（コスト昇順固定）。

## 確定事項（このセッションで決定）

- ヘルプは各施策ボタンの「？」→モーダル。ボタン本体はクリックで予約トグル（現状維持）。
- モーダルは2セクション（現実の施策／ゲーム的な効果）。
- 状態バッジは 罠・誘引物・巡回 を追加（慣れは非表示）。
- 緊急銃猟の非活性理由はモーダル内のみ。
- 施策バーはコスト昇順並び（表示のみ／適用順とは独立）。
- ホバー詳細（ActionDetailCard）は撤去・ファイル削除。
