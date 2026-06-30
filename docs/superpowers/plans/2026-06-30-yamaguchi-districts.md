# 山口市ステージ 地区選定（9地区）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 山口市の e-Stat 小地域 Shapefile から、里山→市街グラデーションを表す9地区を生成し、ステージ定義（境界 GeoJSON＋パラメータ＋隣接）を9地区に作り替える。

**Architecture:** ビルドスクリプト `scripts/build-geojson.mjs` の地区分けルール（S_NAME プレフィックス→districtId）を9地区に書き換えて `src/data/districtsGeo.ts` を再生成。`src/data/sampleStage.ts` を9地区の DistrictDef に書き換え（baseDensity 等は勾配に沿った仮値、adjacencies は地理に基づき手書き）。両者を `districtId` で1:1に一致させる。

**Tech Stack:** Node + mapshaper（CLI/API、Shift_JIS Shapefile）, TypeScript, Vitest。

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-06-30-yamaguchi-districts-design.md`（9地区表が正）。
- 9地区の `districtId`: `ato` / `tokuji` / `miyano` / `niho` / `ouchi` / `center` / `ogori` / `nanbu` / `ajisu`。
- データ契約: 各 GeoJSON Feature の `properties.districtId` が `sampleStage.ts` の `districts[].id` と1:1一致。`properties.name` は表示名。座標は `[経度, 緯度]`（WGS84）。
- `src/data/districtsGeo.ts` は**自動生成物**。手で編集せず、必ず `npm run build:geojson` で再生成する。
- baseDensity / satoyamaRatio / mountainAdjacent / features は**仮値**（実データ化はスコープ外）。
- 入力 Shapefile: `data_raw/yamaguchi/r2kb35203.shp`（属性 Shift_JIS、4,430 基本単位区、字名は `S_NAME`）。
- 既存テスト（`gameStore.test.ts`）は `ato` / `tokuji` / `miyano` / `center` を参照。これらは新設計でも存続するので壊さないこと。
- テストは Vitest。データ系テストは `import { describe, it, expect } from 'vitest'`、対象を相対 import（`./xxx`）または `@/` で。

---

### Task 1: build-geojson の地区分けルールを9地区に更新し再生成

**Files:**
- Modify: `scripts/build-geojson.mjs`（`DISTRICT_RULE` / `DISTRICT_NAMES` / `ORDER`）
- Generate: `src/data/districtsGeo.ts`（`npm run build:geojson` の出力）
- Test: `src/data/districtsGeo.test.ts`（新規）

**Interfaces:**
- Consumes: 入力 Shapefile（上記）。
- Produces: `districtsGeo`（`FeatureCollection<Polygon|MultiPolygon, {districtId, name}>`）。`districtId` は9種（Global Constraints の集合）。後続 Task 2 がこの `districtId` 集合と一致させる。

- [ ] **Step 1: 失敗するテストを書く**

`src/data/districtsGeo.test.ts` を新規作成:

```ts
import { describe, it, expect } from 'vitest'
import { districtsGeo } from './districtsGeo'

const EXPECTED_IDS = [
  'ato', 'tokuji', 'miyano', 'niho', 'ouchi', 'center', 'ogori', 'nanbu', 'ajisu',
]

describe('districtsGeo（生成境界）', () => {
  it('Feature 数がちょうど9', () => {
    expect(districtsGeo.features).toHaveLength(9)
  })

  it('districtId 集合が9地区設計と一致する', () => {
    const ids = districtsGeo.features.map((f) => f.properties.districtId).sort()
    expect(ids).toEqual([...EXPECTED_IDS].sort())
  })

  it('各 Feature が name とジオメトリを持つ', () => {
    for (const f of districtsGeo.features) {
      expect(f.properties.name.length).toBeGreaterThan(0)
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry.type)
    }
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- districtsGeo`
Expected: FAIL（現 `districtsGeo.ts` は旧7地区＝`center` 等7件で、`niho`/`ouchi`/`nanbu` が無く Feature 数も9でない）。

- [ ] **Step 3: build-geojson.mjs のルールを9地区へ書き換える**

`scripts/build-geojson.mjs` の `DISTRICT_RULE` / `DISTRICT_NAMES` / `ORDER` を次に置換:

```js
// ── 地区分けルール（字名 S_NAME → districtId）。上から順に評価。
const DISTRICT_RULE = `
  /^阿東/.test(S_NAME) ? 'ato'
  : /^徳地/.test(S_NAME) ? 'tokuji'
  : /^宮野/.test(S_NAME) ? 'miyano'
  : /^(仁保|小鯖)/.test(S_NAME) ? 'niho'
  : /^(大内|吉敷)/.test(S_NAME) ? 'ouchi'
  : /^小郡/.test(S_NAME) ? 'ogori'
  : /^阿知須/.test(S_NAME) ? 'ajisu'
  : /^(名田島|佐山|嘉川|陶|鋳銭司|秋穂二島|秋穂)/.test(S_NAME) ? 'nanbu'
  : 'center'
`.replace(/\s+/g, ' ').trim()

const DISTRICT_NAMES = {
  ato: '阿東地区',
  tokuji: '徳地地区',
  miyano: '宮野地区',
  niho: '仁保・小鯖地区',
  ouchi: '大内・吉敷地区',
  center: '中心市街',
  ogori: '小郡地区',
  nanbu: '南部平野地区',
  ajisu: '阿知須地区',
}

// 出力の地区並び順（凡例・リストの並び＝里山→市街の勾配順）
const ORDER = ['ato', 'tokuji', 'miyano', 'niho', 'ouchi', 'center', 'ogori', 'nanbu', 'ajisu']
```

- [ ] **Step 4: 再生成して人口・面積を検算する**

Run: `npm run build:geojson`
Expected: コンソールに `地区数=9` と9地区の `districtId (name)` が並ぶ。

続けて規模を検算（設計書の目安と大きく乖離していないか、特に `center` が再び全体の7割になっていないか）。スクラッチに使い捨て集計を書いて実行:

```bash
cat > scripts/_verify.mjs <<'EOF'
import { readFileSync } from 'node:fs'
import mapshaper from 'mapshaper'
const out = '/tmp/_v.json'
await mapshaper.runCommands(`-i data_raw/yamaguchi/r2kb35203.shp encoding=shift_jis -filter-fields S_NAME,JINKO,AREA -o ${out} format=geojson`)
const rows = JSON.parse(readFileSync(out,'utf8')).features.map(f=>f.properties)
const R = s =>
  /^阿東/.test(s)?'ato':/^徳地/.test(s)?'tokuji':/^宮野/.test(s)?'miyano'
  :/^(仁保|小鯖)/.test(s)?'niho':/^(大内|吉敷)/.test(s)?'ouchi':/^小郡/.test(s)?'ogori'
  :/^阿知須/.test(s)?'ajisu':/^(名田島|佐山|嘉川|陶|鋳銭司|秋穂二島|秋穂)/.test(s)?'nanbu':'center'
const g={}; let tp=0
for(const r of rows){const k=R(r.S_NAME); g[k]??={pop:0,area:0}; g[k].pop+=r.JINKO||0; g[k].area+=r.AREA||0; tp+=r.JINKO||0}
for(const[k,v] of Object.entries(g)) console.log(k.padEnd(8),'pop='+String(v.pop).padStart(6),'km2='+(v.area/1e6).toFixed(1).padStart(6),'%pop='+(100*v.pop/tp).toFixed(1))
EOF
node scripts/_verify.mjs 2>&1 | grep -v '^\['; rm scripts/_verify.mjs
```

Expected（目安）: `center` の `%pop` がおおむね 40% 前後（旧 center の 約68% から大幅低下）。`niho` が pop ~6千 で出る（出ない＝仁保/小鯖が S_NAME と不一致なのでルール要調整）。9地区すべてが pop>0。
乖離や `niho` 欠落があれば `DISTRICT_RULE` を調整（実 S_NAME 例: `仁保上郷`/`仁保中郷`/`小鯖` 等を確認）し、Step 3〜4 を繰り返す。

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- districtsGeo`
Expected: PASS（3 it すべて緑）。

- [ ] **Step 6: コミット**

```bash
git add scripts/build-geojson.mjs src/data/districtsGeo.ts src/data/districtsGeo.test.ts
git commit -m "feat: 地区境界を9地区(里山勾配)で再生成しビルドルールを更新"
```

---

### Task 2: sampleStage を9地区に書き換える（パラメータ仮値＋隣接手書き）

**Files:**
- Modify: `src/data/sampleStage.ts`（`districts` 全面置換）
- Test: `src/data/sampleStage.test.ts`（新規）

**Interfaces:**
- Consumes: `districtsGeo`（Task 1 の `districtId` 集合）, 型 `StageDef`/`DistrictDef`（`@/types`）。
- Produces: `sampleStage: StageDef`。`districts[].id` が `districtsGeo` の `districtId` と1:1。各 `adjacencies[].to` は実在する地区 id で、双方向対称。

- [ ] **Step 1: 失敗するテストを書く**

`src/data/sampleStage.test.ts` を新規作成:

```ts
import { describe, it, expect } from 'vitest'
import { sampleStage } from './sampleStage'
import { districtsGeo } from './districtsGeo'

describe('sampleStage（9地区ステージ定義）', () => {
  const ids = sampleStage.districts.map((d) => d.id)

  it('地区数が9', () => {
    expect(sampleStage.districts).toHaveLength(9)
  })

  it('district id が districtsGeo の districtId と1:1一致', () => {
    const geoIds = districtsGeo.features.map((f) => f.properties.districtId).sort()
    expect([...ids].sort()).toEqual(geoIds)
  })

  it('全 adjacency.to が実在地区を指す', () => {
    const set = new Set(ids)
    for (const d of sampleStage.districts) {
      for (const a of d.adjacencies) expect(set.has(a.to)).toBe(true)
    }
  })

  it('隣接は双方向対称（A→B があれば B→A もある）', () => {
    const has = (from: string, to: string) =>
      sampleStage.districts
        .find((d) => d.id === from)!
        .adjacencies.some((a) => a.to === to)
    for (const d of sampleStage.districts) {
      for (const a of d.adjacencies) {
        expect(has(a.to, d.id)).toBe(true)
      }
    }
  })

  it('satoyamaRatio は 0〜1、baseDensity は正', () => {
    for (const d of sampleStage.districts) {
      expect(d.satoyamaRatio).toBeGreaterThan(0)
      expect(d.satoyamaRatio).toBeLessThanOrEqual(1)
      expect(d.baseDensity).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- sampleStage`
Expected: FAIL（現 `sampleStage` は7地区＝`地区数が9` と `1:1一致` が落ちる）。

- [ ] **Step 3:（任意・スクラッチ）実接触ペアを確認して隣接の下書きにする**

隣接を地理に整合させるため、生成ポリゴンの実接触ペアを一度だけ確認する（成果物には残さない）。共有頂点が2点以上あるペアを隣接とみなす:

```bash
cat > scripts/_adj.mjs <<'EOF'
import { readFileSync } from 'node:fs'
import { districtsGeo } from '../src/data/districtsGeo.ts'  // ts 直 import 不可なら下記 JSON 方式
EOF
# ↑ .ts 直 import は node 単体で不可。簡易には districtsGeo を JSON 化して読む:
node --experimental-strip-types - <<'EOF' 2>/dev/null || true
EOF
```

簡便法（推奨）: ブラウザの地図（`npm run dev`）で9地区を目視し、接する地区を列挙する。
または mapshaper で `-innerlines` を出力して共有境界を可視化する。
ここで得た「どの地区とどの地区が接するか」を Step 4 の `adjacencies` に反映する。

> このステップは下書き用。コミット対象のコードは生成しない。判断材料が得られたら次へ。

- [ ] **Step 4: sampleStage.ts を9地区に全面置換**

`src/data/sampleStage.ts` の先頭コメントと `export const sampleStage` を次で置換する。
`maxTurns` は現行どおり16。パラメータは勾配に沿った仮値（山間=高密度・高里山率、市街=低密度・低里山率）。隣接の `features` は地形に応じ手書き（山地境界=green-corridor、河川/海=water、幹線道路=trunk-road）。

```ts
/**
 * 山口市ステージ（9地区）。地区分割は e-Stat 小地域（国勢調査）由来。
 *   山間(供給源): 阿東 / 徳地
 *   里山バッファ: 宮野 / 仁保・小鯖
 *   住宅縁辺  : 大内・吉敷
 *   市街核    : 中心市街 / 小郡
 *   沿岸後方  : 南部平野 / 阿知須
 *
 * ⚠️ baseDensity / satoyamaRatio / mountainAdjacent / features は【仮値】。
 *    実データ（YPくまっぷ・土地利用統計）由来の値に差し替え予定（docs/DATA.md）。
 *    境界 GeoJSON とは districtId で対応する。隣接は地理に基づく手書き。
 */

import type { StageDef } from '@/types'

export const sampleStage: StageDef = {
  id: 'yamaguchi-city',
  name: '山口市',
  maxTurns: 16, // 初夏(6月)〜初秋(9月)の4か月＝16週
  districts: [
    {
      id: 'ato',
      name: '阿東地区',
      baseDensity: 9,
      satoyamaRatio: 0.92, // 北部山間・供給源
      mountainAdjacent: true,
      features: ['green-corridor'],
      adjacencies: [
        { to: 'tokuji', features: ['green-corridor'] },
        { to: 'miyano', features: ['green-corridor'] },
      ],
    },
    {
      id: 'tokuji',
      name: '徳地地区',
      baseDensity: 9,
      satoyamaRatio: 0.92, // 東部山間・供給源
      mountainAdjacent: true,
      features: ['green-corridor', 'water'],
      adjacencies: [
        { to: 'ato', features: ['green-corridor'] },
        { to: 'niho', features: ['green-corridor'] },
      ],
    },
    {
      id: 'miyano',
      name: '宮野地区',
      baseDensity: 6,
      satoyamaRatio: 0.78, // 北の里山バッファ
      mountainAdjacent: true,
      features: ['water'],
      adjacencies: [
        { to: 'ato', features: ['green-corridor'] },
        { to: 'niho', features: ['green-corridor'] },
        { to: 'center', features: ['water'] },
      ],
    },
    {
      id: 'niho',
      name: '仁保・小鯖地区',
      baseDensity: 7,
      satoyamaRatio: 0.82, // 北東里山・熊回廊
      mountainAdjacent: true,
      features: ['green-corridor', 'water'],
      adjacencies: [
        { to: 'tokuji', features: ['green-corridor'] },
        { to: 'miyano', features: ['green-corridor'] },
        { to: 'ouchi', features: ['green-corridor'] },
        { to: 'center', features: ['water'] },
      ],
    },
    {
      id: 'ouchi',
      name: '大内・吉敷地区',
      baseDensity: 5,
      satoyamaRatio: 0.62, // 里山に接する住宅地＝侵入の接点
      mountainAdjacent: true,
      features: ['green-corridor', 'trunk-road'],
      adjacencies: [
        { to: 'niho', features: ['green-corridor'] },
        { to: 'center', features: ['trunk-road'] },
      ],
    },
    {
      id: 'center',
      name: '中心市街',
      baseDensity: 3,
      satoyamaRatio: 0.42, // 旧山口の市街核。多地区と接するハブ
      mountainAdjacent: false,
      features: ['water', 'trunk-road'],
      adjacencies: [
        { to: 'miyano', features: ['water'] },
        { to: 'niho', features: ['water'] },
        { to: 'ouchi', features: ['trunk-road'] },
        { to: 'ogori', features: ['trunk-road'] },
        { to: 'nanbu', features: ['water'] },
      ],
    },
    {
      id: 'ogori',
      name: '小郡地区',
      baseDensity: 2,
      satoyamaRatio: 0.40, // 新山口駅の交通市街
      mountainAdjacent: false,
      features: ['trunk-road'],
      adjacencies: [
        { to: 'center', features: ['trunk-road'] },
        { to: 'nanbu', features: ['trunk-road'] },
      ],
    },
    {
      id: 'nanbu',
      name: '南部平野地区',
      baseDensity: 3,
      satoyamaRatio: 0.55, // 干拓・沿岸平野＝後方の安全地帯
      mountainAdjacent: false,
      features: ['water'],
      adjacencies: [
        { to: 'center', features: ['water'] },
        { to: 'ogori', features: ['trunk-road'] },
        { to: 'ajisu', features: ['water'] },
      ],
    },
    {
      id: 'ajisu',
      name: '阿知須地区',
      baseDensity: 3,
      satoyamaRatio: 0.57, // 南西沿岸
      mountainAdjacent: false,
      features: ['water'],
      adjacencies: [{ to: 'nanbu', features: ['water'] }],
    },
  ],
}
```

> Step 3 で確認した実接触に合わせ、上記 `adjacencies` の `to` を増減してよい。
> ただし対称性（A→B があれば B→A）を必ず保つこと（テストで検証される）。

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- sampleStage`
Expected: PASS（5 it すべて緑）。

- [ ] **Step 6: コミット**

```bash
git add src/data/sampleStage.ts src/data/sampleStage.test.ts
git commit -m "feat: ステージ定義を9地区(山間→沿岸の勾配)に再構成し隣接を再設計"
```

---

### Task 3: 全体検証（型・テスト・ビルド・地図表示）

**Files:**
- Verify only（必要時のみ `src/store/gameStore.test.ts` を修正）

**Interfaces:**
- Consumes: Task 1/2 の成果物すべて。

- [ ] **Step 1: 型チェック**

Run: `npm run typecheck`
Expected: エラー 0。`DistrictId` は `string` 別名なので新 id でも型は通る想定。

- [ ] **Step 2: 全テスト**

Run: `npm test`
Expected: 全 suite PASS。`gameStore.test.ts` は `ato`/`tokuji`/`miyano`/`center` のみ参照し、いずれも存続するので緑のはず。落ちた場合は参照地区が新設計に存在するか確認し、テスト側を新 id（存続 id）へ最小修正する。

- [ ] **Step 3: 本番ビルド**

Run: `npm run build`
Expected: `tsc -b` 通過＋ Vite ビルド成功。

- [ ] **Step 4: 地図表示の目視確認**

Run: `npm run dev`（起動後ブラウザで開く）
Expected: 地図に9地区が表示され、各地区をクリックで選択できる。`niho`/`ouchi`/`nanbu` が分かれて見え、`center` が旧 center より小さくなっている。全域オートフィットが働く。

> 自動テスト対象外の目視確認。崩れがあれば該当 Task に戻る。

- [ ] **Step 5: 仕上げコミット（変更があれば）**

```bash
git add -A
git commit -m "chore: 9地区移行の検証反映（テスト/型/ビルド）"
```

---

## Self-Review

- **Spec coverage**:
  - 9地区の粒度・分割方針 → Task 1（ルール）＋ Task 2（定義）。
  - データ契約（districtId 1:1, name, WGS84）→ Task 1 Step1 テスト＋ Task 2 Step1 テスト。
  - 分割の実装方針（DISTRICT_RULE 骨子）→ Task 1 Step3 にそのまま反映。
  - 残課題（center 残余の精査・仁保/小鯖プレフィックス検算）→ Task 1 Step4 の検算で担保。
  - 隣接=手書き（spec 更新済）→ Task 2 Step3/4。
  - 受け入れ条件（Feature 数9・規模乖離なし・1:1・地図表示）→ Task 1 Step4/5・Task 3。
  - スコープ外（パラメータ実データ化・全19市町）→ 計画に含めていない。
- **Placeholder scan**: 各コード手順に実コードを記載。TBD なし。Task 2 Step3 はスクラッチの下書き手順で、コミット対象コードは生成しない旨を明記。
- **Type consistency**: `districtId` 集合（9種）は全 Task・全テストで同一文字列。`sampleStage` の id とテストの `EXPECTED_IDS`/`geoIds` が一致。`Adjacency`/`DistrictDef` のフィールド名（`to`/`features`/`satoyamaRatio`/`baseDensity`/`mountainAdjacent`/`adjacencies`）は `src/types/index.ts` の定義に一致。
