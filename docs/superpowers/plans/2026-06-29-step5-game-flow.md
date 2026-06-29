# Step 5 ゲームフロー実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1ターンの流れ（議題＝突発イベント通知＋アジェンダ選択 → 対策 → 遭遇の地図演出）を確定させ、熊害の現実知識を用語ツールチップで啓蒙する。

**Architecture:** 数理は既存 `RiskModel` 据え置き。議題/イベントは「モデルに依らない純粋な状態変更 `apply(game)=>game`」として `engine/agenda.ts` に実装。フェーズ進行は `gameStore` が制御し、画面にはフェーズ名を出さず「第X週」と単一の文脈ボタンのみ見せる。UI は既存 `App.tsx` のダッシュボードに EventModal / AgendaCards / EncounterReveal / GlossaryTerm を足す。

**Tech Stack:** React 18 + TS + Vite / Zustand / react-leaflet (Leaflet) / Framer Motion / Tailwind。

## Global Constraints
- **ロジックとUIの完全分離（最重要）**：
  - `src/engine/**` と `src/data/**` は **純粋な TS**。React / DOM / `framer-motion` / `leaflet` / `@/components` / `@/store` を **import しない**。ゲームのルール・状態遷移・効果適用（agenda/event の `apply`、抽選、遭遇解決）はすべてここに置く。
  - `src/store/**`（Zustand）は **エンジンを呼ぶだけの橋渡し**。ルール計算そのものは書かず、`engine` の純関数に委譲する。
  - `src/components/**` と `App.tsx` は **表示専用**。ゲームルールの計算をしない（presentation 用の派生のみ可：色分け・重心・%表示など）。
  - 依存方向は一方向：`components → store → engine → data/types`。逆流させない。
- 検証はユニットテストではなく **`npx tsc -b`（型チェック）・`npm run build`（本番ビルド）・dev配信(curl 200)・目視** で行う（既存ワークフロー踏襲）。
- **フェーズ名（議題/対策/遭遇）はUIに出さない**。プレイヤーには「第X週 / 14」と文脈的操作のみ。
- ツールチップは **現実の熊害用語に限定**。ゲーム内部用語（活発度・里山遭遇率・決壊係数）には付けない。
- アジェンダ/イベント効果は v1 では **全体/即時の純バフ（状態変更）に統一**（対象選択UI・turnModifier は持たない）。
- 既存の対策コマンド・遭遇解決・勝敗判定（`engine/turn.ts`）はそのまま活用。
- dev サーバは起動済み（`http://localhost:5173/`）。型チェックは `npx tsc -b`。

---

## ファイル構成
- 追加 `src/data/glossary.ts` — 現実の熊害用語→解説。
- 追加 `src/data/agendas.ts` — アジェンダ定義（純バフ）。
- 追加 `src/data/events.ts` — 突発イベント定義（確率＋純バフ）。
- 追加 `src/engine/agenda.ts` — 抽選・適用の純関数（`rollEvent` / `pickAgendas` / `applyAgenda` / `applyEvent`）。
- 追加 `src/components/GlossaryTerm.tsx` — 用語ホバーツールチップ。
- 追加 `src/components/EventModal.tsx` — 突発イベント通知モーダル。
- 追加 `src/components/AgendaCards.tsx` — アジェンダ3枚選択パネル。
- 追加 `src/components/EncounterReveal.tsx` — 遭遇結果サマリー（既存 EventLog を置換）。
- 修正 `src/types/index.ts` — `Agenda`/`RandomEvent` を効果付きに拡張。
- 修正 `src/store/gameStore.ts` — ターン開始抽選・アジェンダ選択・イベント破棄・フェーズ進行改修。
- 修正 `src/components/MapView.tsx` — 遭遇時に出没地区へ🐻マーカー＋強調。
- 修正 `src/App.tsx` — HUD（週表記・フェーズ名撤去・文脈ボタン）、新コンポーネント結線、EventLog 撤去。

---

## Task 1: 現実用語の用語集 + GlossaryTerm ツールチップ

**Files:**
- Create: `src/data/glossary.ts`
- Create: `src/components/GlossaryTerm.tsx`

**Interfaces:**
- Produces: `GLOSSARY: Record<string, GlossaryEntry>`（`GlossaryEntry = { term: string; description: string }`）、`GlossaryTerm`（props: `{ term: string; children?: ReactNode }`）。

- [ ] **Step 1: 用語集データを作成**

`src/data/glossary.ts`:
```ts
/** 現実の熊害対策に関する用語と解説（啓蒙用）。ゲーム内部用語は含めない。 */
export interface GlossaryEntry {
  term: string
  description: string
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  学習放獣: {
    term: '学習放獣',
    description:
      '捕獲したクマに痛みや恐怖など不快な経験を与えてから放し、「人里は危険」と学習させて再出没を抑える手法。',
  },
  誘引物除去: {
    term: '誘引物除去',
    description:
      '放置された果樹・生ゴミ・収穫残さなど、クマを人里へ引き寄せる餌（誘引物）を取り除く根本対策。',
  },
  緩衝帯整備: {
    term: '緩衝帯整備',
    description:
      '集落と山林の境界の藪を刈り払い、見通しの良い緩衝帯をつくってクマが近づきにくくする対策。',
  },
  ゾーニング管理: {
    term: 'ゾーニング管理',
    description:
      '地域を「人の生活圏」「緩衝地帯」「クマの生息地」に区分し、区域ごとに対応を変える棲み分けの考え方。',
  },
  個体数管理: {
    term: '個体数管理',
    description:
      '出没や被害の状況に応じて捕獲数を調整し、地域全体のクマの個体数を適正な水準に保つ取り組み。',
  },
  YPくまっぷ: {
    term: 'YPくまっぷ',
    description:
      '山口県警等が公開するクマ出没のオープンデータ/地図。本ゲームの地区パラメータの基礎データ。',
  },
  ドングリ凶作: {
    term: 'ドングリ凶作',
    description:
      'ブナ・ナラ類の堅果（ドングリ）が不作の年。山の餌が不足し、クマが餌を求めて人里へ降りやすくなる。',
  },
  侵入防止柵: {
    term: '侵入防止柵',
    description: '電気柵などで農地や集落への侵入経路を物理的に遮断する対策。',
  },
}
```

- [ ] **Step 2: GlossaryTerm コンポーネントを作成**

`src/components/GlossaryTerm.tsx`（ホバーで解説を表示。点線下線で用語を示す）:
```tsx
import { useState, type ReactNode } from 'react'
import { GLOSSARY } from '@/data/glossary'

export function GlossaryTerm({ term, children }: { term: string; children?: ReactNode }) {
  const entry = GLOSSARY[term]
  const [show, setShow] = useState(false)
  if (!entry) return <>{children ?? term}</>
  return (
    <span
      className="relative cursor-help underline decoration-dotted underline-offset-2"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children ?? term}
      {show && (
        <span className="absolute bottom-full left-0 z-50 mb-1 w-64 rounded border border-panel-border bg-panel p-2 text-xs font-normal leading-relaxed text-fg shadow-lg">
          <b className="text-risk-safe">{entry.term}</b>
          <br />
          {entry.description}
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 3: 型チェック**

Run: `npx tsc -b`
Expected: エラーなし（exit 0）。

- [ ] **Step 4: コミット**

```bash
git add src/data/glossary.ts src/components/GlossaryTerm.tsx
git commit -m "feat: add real-world bear glossary and hover tooltip"
```

---

## Task 2: アジェンダ＆イベントの型とデータ

**Files:**
- Modify: `src/types/index.ts`（`Agenda` / `RandomEvent` を拡張）
- Create: `src/data/agendas.ts`
- Create: `src/data/events.ts`

**Interfaces:**
- Consumes: `GameState`（`@/types`）。
- Produces:
  - `Agenda = { id; name; description; realTerms?: string[]; apply: (g: GameState) => GameState }`
  - `RandomEvent = { id; name; description; probability; realTerms?: string[]; apply: (g: GameState) => GameState }`
  - `AGENDAS: Agenda[]`、`EVENTS: RandomEvent[]`

- [ ] **Step 1: 型を拡張**

`src/types/index.ts` の既存 `RandomEvent` / `Agenda` を置換:
```ts
/** §5.1-① 突発ランダムイベント。effect は全体/即時の状態変更。 */
export interface RandomEvent {
  id: string
  name: string
  description: string
  /** 1件として抽選される相対的な重み（rollEvent 内で正規化）。 */
  weight: number
  /** 説明文中で用語ツールチップ対象となる現実用語。 */
  realTerms?: string[]
  apply: (game: GameState) => GameState
}

/** §5.1-② 本日の議題（コスト無料・純バフ）。 */
export interface Agenda {
  id: string
  name: string
  description: string
  realTerms?: string[]
  apply: (game: GameState) => GameState
}
```
（`GameState` は同ファイル内で既に定義済み。`apply` から参照可能。）

- [ ] **Step 2: 小さなヘルパで clamp しつつ純バフを書く（agendas）**

`src/data/agendas.ts`:
```ts
import type { Agenda, GameState } from '@/types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export const AGENDAS: Agenda[] = [
  {
    id: 'emergency-budget',
    name: '緊急予算の確保',
    description: '補正予算を組み、対策費を上積みする。（予算 +10万円）',
    apply: (g): GameState => ({ ...g, budget: g.budget + 100_000 }),
  },
  {
    id: 'caution-alert',
    name: '注意喚起の徹底',
    description: '住民へ広報し、餌付けや生ゴミ放置を抑える。（活発度 -10）',
    apply: (g): GameState => ({ ...g, activeness: Math.max(0, g.activeness - 10) }),
  },
  {
    id: 'mobilize-staff',
    name: '人員動員',
    description: '今週は動ける人手が増える。（指示ポイント +1）',
    apply: (g): GameState => ({ ...g, instructionPoints: g.instructionPoints + 1 }),
  },
  {
    id: 'awareness',
    name: '啓発活動',
    description: '正しい知識を広め、住民の不安をやわらげる。（不満度 -5）',
    apply: (g): GameState => ({ ...g, dissatisfaction: Math.max(0, g.dissatisfaction - 5) }),
  },
  {
    id: 'aversive-release',
    name: '学習放獣の実施',
    description:
      '捕獲individualに不快な経験を与えて放ち、人里を避けるよう学習させる。（活発度 -15）',
    realTerms: ['学習放獣'],
    apply: (g): GameState => ({ ...g, activeness: Math.max(0, g.activeness - 15) }),
  },
  {
    id: 'attractant-removal',
    name: '誘引物除去キャンペーン',
    description:
      '放置果樹や生ゴミを地域ぐるみで片付ける。全地区の里山リスクを少し下げる。',
    realTerms: ['誘引物除去'],
    apply: (g): GameState => {
      const districts = Object.fromEntries(
        Object.entries(g.districts).map(([id, d]) => [
          id,
          {
            ...d,
            satoyamaEncounterRate: clamp(d.satoyamaEncounterRate - 6, 0, 100),
          },
        ]),
      )
      return { ...g, districts }
    },
  },
]
```
> 注: `aversive-release` の説明文に紛れた英単語があれば日本語へ直す（実装時に「個体」と表記）。

- [ ] **Step 3: events を書く**

`src/data/events.ts`:
```ts
import type { GameState, RandomEvent } from '@/types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export const EVENTS: RandomEvent[] = [
  {
    id: 'acorn-failure',
    name: 'ドングリの大凶作',
    description:
      '山の堅果が記録的な不作。餌を求めてクマが人里へ降りやすくなっている。（活発度 +40）',
    weight: 3,
    realTerms: ['ドングリ凶作'],
    apply: (g): GameState => ({ ...g, activeness: clamp(g.activeness + 40, 0, 100) }),
  },
  {
    id: 'sightings-surge',
    name: '出没通報の多発',
    description: '各地で目撃情報が相次いでいる。（活発度 +15）',
    weight: 3,
    apply: (g): GameState => ({ ...g, activeness: clamp(g.activeness + 15, 0, 100) }),
  },
  {
    id: 'pre-hibernation',
    name: '冬眠前の荒食い',
    description: '冬ごもりに備え、クマが活発に採食する時期。（活発度 +20）',
    weight: 2,
    apply: (g): GameState => ({ ...g, activeness: clamp(g.activeness + 20, 0, 100) }),
  },
  {
    id: 'volunteer',
    name: 'ボランティアの来援',
    description: '地域の有志が対策に協力してくれた。（予算 +5万円）',
    weight: 2,
    apply: (g): GameState => ({ ...g, budget: g.budget + 50_000 }),
  },
]
```

- [ ] **Step 4: 型チェック + コミット**

Run: `npx tsc -b`（exit 0）
```bash
git add src/types/index.ts src/data/agendas.ts src/data/events.ts
git commit -m "feat: add agenda/event data with pure-buff effects"
```

---

## Task 3: 抽選・適用エンジン（純関数）

**Files:**
- Create: `src/engine/agenda.ts`
- Modify: `src/engine/index.ts`（re-export 追加）

**Interfaces:**
- Consumes: `AGENDAS`/`EVENTS`（`@/data/...`）、`Agenda`/`RandomEvent`/`GameState`（`@/types`）。
- Produces:
  - `rollEvent(rng?: () => number, eventChance?: number): RandomEvent | null`
  - `pickAgendas(rng?: () => number, count?: number): Agenda[]`
  - `applyAgenda(game, agenda): GameState`（= `agenda.apply(game)`）
  - `applyEvent(game, event): GameState`（= `event.apply(game)`）

- [ ] **Step 1: engine/agenda.ts を作成**

```ts
/**
 * 議題フェーズ（§5.1）の抽選・適用。純関数。乱数は rng で注入可能。
 * 効果自体は各 Agenda/RandomEvent の apply(game)=>game に委譲。
 */
import { AGENDAS } from '@/data/agendas'
import { EVENTS } from '@/data/events'
import type { Agenda, GameState, RandomEvent } from '@/types'

/** 毎ターン開始時に約 eventChance の確率で1件抽選。発生しなければ null。 */
export function rollEvent(
  rng: () => number = Math.random,
  eventChance = 0.35,
): RandomEvent | null {
  if (rng() >= eventChance) return null
  const total = EVENTS.reduce((s, e) => s + e.weight, 0)
  let r = rng() * total
  for (const e of EVENTS) {
    r -= e.weight
    if (r < 0) return e
  }
  return EVENTS[EVENTS.length - 1] ?? null
}

/** プールから重複なく count 枚（既定3枚）を抽選。 */
export function pickAgendas(rng: () => number = Math.random, count = 3): Agenda[] {
  const pool = [...AGENDAS]
  // Fisher–Yates シャッフル
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(count, pool.length))
}

export function applyAgenda(game: GameState, agenda: Agenda): GameState {
  return agenda.apply(game)
}

export function applyEvent(game: GameState, event: RandomEvent): GameState {
  return event.apply(game)
}
```

- [ ] **Step 2: engine/index.ts に re-export 追加**

`src/engine/index.ts` に追記:
```ts
export * from './agenda'
```

- [ ] **Step 3: 型チェック + コミット**

Run: `npx tsc -b`（exit 0）
```bash
git add src/engine/agenda.ts src/engine/index.ts
git commit -m "feat: add agenda/event roll+apply engine functions"
```

---

## Task 4: ストアのターンフロー改修

**Files:**
- Modify: `src/store/gameStore.ts`

**Interfaces:**
- Consumes: `rollEvent`/`pickAgendas`/`applyAgenda`/`applyEvent`（`@/engine/agenda`）、既存 `resolveEncounterPhase`/`activeRiskModel`。
- Produces（store に追加）: `currentEvent: RandomEvent | null`、`agendaChoices: Agenda[]`、`selectedAgendaId: string | null`、`chooseAgenda(id: string): void`、`dismissEvent(): void`。`startStage`/`advancePhase`/`reset` を改修。

- [ ] **Step 1: import と state を追加**

`gameStore.ts` の import に追加:
```ts
import { pickAgendas, rollEvent, applyAgenda, applyEvent } from '@/engine/agenda'
import type { Agenda, RandomEvent } from '@/types'
```
`GameStore` インターフェースに追加:
```ts
  currentEvent: RandomEvent | null
  agendaChoices: Agenda[]
  selectedAgendaId: string | null
  chooseAgenda: (id: string) => void
  dismissEvent: () => void
```

- [ ] **Step 2: ターン開始ロジックを内部ヘルパに切り出す**

`gameStore.ts` 内（`create` の外）に追加:
```ts
/** 週の開始：イベント抽選＆即適用、アジェンダ3枚抽選。返り値で state を組む。 */
function beginTurn(game: GameState): {
  game: GameState
  currentEvent: RandomEvent | null
  agendaChoices: Agenda[]
  selectedAgendaId: null
} {
  const event = rollEvent()
  const next = event ? applyEvent(game, event) : game
  return {
    game: { ...next, phase: 'agenda' },
    currentEvent: event,
    agendaChoices: pickAgendas(),
    selectedAgendaId: null,
  }
}
```

- [ ] **Step 3: startStage / reset を改修し、初期ターンを開始**

`startStage` を改修:
```ts
  startStage: (stage) => {
    const base = createInitialGameState(stage)
    set({
      stage,
      selectedDistrictId: stage.districts[0]?.id ?? null,
      lastEvents: [],
      ...beginTurn(base),
    })
  },
```
`reset` を改修（新フィールドも初期化）:
```ts
  reset: () =>
    set({
      stage: null,
      game: null,
      selectedDistrictId: null,
      lastEvents: [],
      currentEvent: null,
      agendaChoices: [],
      selectedAgendaId: null,
    }),
```
`create` 直後の初期値にも追加: `currentEvent: null, agendaChoices: [], selectedAgendaId: null,`

- [ ] **Step 4: chooseAgenda / dismissEvent を実装**

```ts
  dismissEvent: () => set({ currentEvent: null }),

  chooseAgenda: (id) =>
    set((state) => {
      const { game, agendaChoices, selectedAgendaId } = state
      if (!game || selectedAgendaId) return state
      const agenda = agendaChoices.find((a) => a.id === id)
      if (!agenda) return state
      return {
        game: { ...applyAgenda(game, agenda), phase: 'action' },
        selectedAgendaId: id,
      }
    }),
```

- [ ] **Step 5: advancePhase を新フローへ改修**

`advancePhase` の `switch` を次に置換:
```ts
      switch (game.phase) {
        case 'agenda':
          // アジェンダ選択は chooseAgenda で行うため、ここでは進めない
          return state

        case 'action': {
          const { game: resolved, events } = resolveEncounterPhase(game, stage, activeRiskModel)
          const phase = resolved.dissatisfaction >= 100 ? 'gameover' : 'encounter'
          return { game: { ...resolved, phase }, lastEvents: events }
        }

        case 'encounter': {
          const nextTurn = game.turn + 1
          if (nextTurn > game.maxTurns) {
            return { game: { ...game, phase: 'victory' } }
          }
          return {
            lastEvents: [],
            ...beginTurn({
              ...game,
              turn: nextTurn,
              instructionPoints: 3, // INSTRUCTION_POINTS_PER_TURN
            }),
          }
        }

        default:
          return state
      }
```
> `INSTRUCTION_POINTS_PER_TURN` 定数が既にあるためリテラル 3 ではなく定数を使う。

- [ ] **Step 6: 型チェック + 配信確認 + コミット**

Run: `npx tsc -b`（exit 0）
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/src/store/gameStore.ts`（200）
```bash
git add src/store/gameStore.ts
git commit -m "feat: turn flow with event roll and agenda selection in store"
```

---

## Task 5: EventModal（突発イベント通知）

**Files:**
- Create: `src/components/EventModal.tsx`

**Interfaces:**
- Consumes: `useGameStore`（`currentEvent`, `dismissEvent`）、`GlossaryTerm`。
- Produces: `EventModal`（props なし）。

- [ ] **Step 1: コンポーネント作成（Framer Motion でフェード、用語をラップ）**

```tsx
import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { GlossaryTerm } from './GlossaryTerm'

export function EventModal() {
  const event = useGameStore((s) => s.currentEvent)
  const dismiss = useGameStore((s) => s.dismissEvent)

  return (
    <AnimatePresence>
      {event && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-md rounded-xl border border-panel-border bg-panel-light p-6 shadow-2xl"
            initial={{ scale: 0.9, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
          >
            <p className="mb-1 text-xs text-risk-warn">突発事態</p>
            <h2 className="mb-3 text-xl font-bold">{event.name}</h2>
            <p className="mb-5 leading-relaxed text-slate-200">
              {event.realTerms?.length ? wrapTerms(event.description, event.realTerms) : event.description}
            </p>
            <div className="flex justify-end">
              <button
                className="rounded-lg bg-risk-warn px-5 py-2 font-bold text-panel transition hover:brightness-110"
                onClick={dismiss}
              >
                対応する
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** 説明文中の現実用語を GlossaryTerm でラップする。 */
function wrapTerms(text: string, terms: string[]) {
  // terms の最初の出現で分割し、用語部分をラップ。単純な逐次置換。
  const parts: (string | JSX.Element)[] = [text]
  terms.forEach((term, ti) => {
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      if (typeof seg !== 'string') continue
      const idx = seg.indexOf(term)
      if (idx === -1) continue
      parts.splice(
        i,
        1,
        seg.slice(0, idx),
        <GlossaryTerm key={`${ti}-${i}`} term={term} />,
        seg.slice(idx + term.length),
      )
      break
    }
  })
  return parts
}
```
> `wrapTerms` は Task 6 でも使うため、実装時は `src/components/wrapTerms.tsx`（`export function wrapTerms`）に切り出して両者から import する（DRY）。本タスクでまず切り出す。

- [ ] **Step 2: wrapTerms を共有モジュールへ切り出す**

`src/components/wrapTerms.tsx` を作成し上記 `wrapTerms` を移動、`GlossaryTerm` を import。`EventModal` は `import { wrapTerms } from './wrapTerms'`。

- [ ] **Step 3: 型チェック + コミット**

Run: `npx tsc -b`（exit 0）
```bash
git add src/components/EventModal.tsx src/components/wrapTerms.tsx
git commit -m "feat: event notification modal with term tooltips"
```

---

## Task 6: AgendaCards（アジェンダ3枚選択）

**Files:**
- Create: `src/components/AgendaCards.tsx`

**Interfaces:**
- Consumes: `useGameStore`（`game.phase`, `agendaChoices`, `selectedAgendaId`, `currentEvent`, `chooseAgenda`）、`wrapTerms`。
- Produces: `AgendaCards`（props なし）。議題フェーズかつイベント未確認でない時に表示。

- [ ] **Step 1: コンポーネント作成**

```tsx
import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { wrapTerms } from './wrapTerms'

export function AgendaCards() {
  const phase = useGameStore((s) => s.game?.phase)
  const choices = useGameStore((s) => s.agendaChoices)
  const selected = useGameStore((s) => s.selectedAgendaId)
  const currentEvent = useGameStore((s) => s.currentEvent)
  const choose = useGameStore((s) => s.chooseAgenda)

  // イベントモーダルが出ている間は隠す。議題フェーズ・未選択の時だけ表示。
  const open = phase === 'agenda' && !selected && !currentEvent && choices.length > 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-x-0 top-0 z-[500] flex justify-center p-4"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
        >
          <div className="w-full max-w-3xl rounded-xl border border-panel-border bg-panel-light/95 p-4 shadow-2xl backdrop-blur">
            <p className="mb-3 text-center text-sm font-bold text-slate-300">
              今週の方針を1つ選ぶ
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {choices.map((a) => (
                <button
                  key={a.id}
                  onClick={() => choose(a.id)}
                  className="flex flex-col rounded-lg border border-panel-border bg-panel p-3 text-left transition hover:border-risk-safe hover:bg-panel-light"
                >
                  <span className="mb-1 font-bold">{a.name}</span>
                  <span className="text-xs leading-relaxed text-slate-300">
                    {a.realTerms?.length ? wrapTerms(a.description, a.realTerms) : a.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: 型チェック + コミット**

Run: `npx tsc -b`（exit 0）
```bash
git add src/components/AgendaCards.tsx
git commit -m "feat: agenda selection cards"
```

---

## Task 7: HUD 改修（週表記・フェーズ名撤去・文脈ボタン）

**Files:**
- Modify: `src/App.tsx`（`Hud`, `PhaseControl`, `PHASE_LABEL` 撤去）

**Interfaces:**
- Consumes: `useGameStore`（`game`, `advancePhase`, `reset`）。
- Produces: 変更後の `Hud` と `PhaseControl`。

- [ ] **Step 1: PHASE_LABEL を撤去し Hud を週表記に**

`App.tsx` の `PHASE_LABEL` 定義と、`Hud` 内のフェーズ表示 `<span>{PHASE_LABEL[game.phase]}</span>` を削除。`Hud` の左側ステータスのターン表記を週に変更:
```tsx
        <span>
          第 <b>{game.turn}</b> 週 / {game.maxTurns}
        </span>
```
`Hud` 右側は `PhaseControl` のみ残す:
```tsx
      <div className="flex items-center gap-3">
        <PhaseControl />
      </div>
```

- [ ] **Step 2: PhaseControl を文脈ボタン化**

`PhaseControl` を次へ置換（フェーズ名は出さず、行動を促す文言）:
```tsx
function PhaseControl() {
  const game = useGameStore((s) => s.game)
  const advancePhase = useGameStore((s) => s.advancePhase)
  const reset = useGameStore((s) => s.reset)
  if (!game) return null

  if (game.phase === 'victory' || game.phase === 'gameover') {
    return (
      <button
        className="rounded-lg bg-risk-safe px-5 py-1.5 font-bold text-panel transition hover:brightness-110"
        onClick={reset}
      >
        もう一度
      </button>
    )
  }
  if (game.phase === 'action') {
    return (
      <button
        className="rounded-lg bg-risk-warn px-5 py-1.5 font-bold text-panel transition hover:brightness-110"
        onClick={advancePhase}
      >
        クマの行動へ →
      </button>
    )
  }
  if (game.phase === 'encounter') {
    return (
      <button
        className="rounded-lg bg-risk-warn px-5 py-1.5 font-bold text-panel transition hover:brightness-110"
        onClick={advancePhase}
      >
        次の週へ →
      </button>
    )
  }
  // agenda フェーズ：アジェンダ選択待ち（ボタンなし）
  return <span className="text-xs text-slate-400">今週の方針を選んでください</span>
}
```

- [ ] **Step 3: 型チェック（未使用 import 含む）+ コミット**

Run: `npx tsc -b`（exit 0。`PHASE_LABEL`/`GamePhase` の未使用が出たら除去）
```bash
git add src/App.tsx
git commit -m "feat: week-based HUD and contextual phase button"
```

---

## Task 8: EncounterReveal（遭遇サマリー）＋ 地図の出没マーカー

**Files:**
- Create: `src/components/EncounterReveal.tsx`
- Modify: `src/App.tsx`（`EventLog` を `EncounterReveal` に置換）
- Modify: `src/components/MapView.tsx`（遭遇時の出没地区へ🐻マーカー＋強調）

**Interfaces:**
- Consumes: `useGameStore`（`lastEvents`, `game.phase`, `game.dissatisfaction`）、`EncounterEvent`（`@/engine/turn`）、`districtsGeo`。
- Produces: `EncounterReveal`。MapView は内部で `lastEvents` を参照（props 追加なし）。

- [ ] **Step 1: EncounterReveal を作成（既存 EventLog を移植・強化）**

```tsx
import { useGameStore } from '@/store/gameStore'

export function EncounterReveal() {
  const events = useGameStore((s) => s.lastEvents)
  const phase = useGameStore((s) => s.game?.phase)
  if (phase !== 'encounter' && phase !== 'gameover') return null

  return (
    <div className="border-b border-panel-border bg-panel px-4 py-1.5 text-sm">
      {events.length === 0 ? (
        <span className="text-risk-safe">今週の出没：なし 🐾</span>
      ) : (
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {events.map((e, i) => (
            <span
              key={i}
              className={
                e.kind === 'urban'
                  ? 'text-risk-critical'
                  : e.kind === 'satoyama'
                    ? 'text-risk-danger'
                    : 'text-risk-safe'
              }
            >
              {e.message}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: App.tsx の EventLog を置換**

`App.tsx` から `EventLog` 関数定義を削除し、`Dashboard` 内の `<EventLog />` を `<EncounterReveal />` に置換、`import { EncounterReveal } from '@/components/EncounterReveal'` を追加。

- [ ] **Step 3: MapView に出没マーカーを追加**

`MapView.tsx` で `lastEvents` と `game.phase` を購読し、遭遇フェーズに出没地区へ🐻マーカーを置く。各地区の重心は `districtsGeo` から概算。
```tsx
import { GeoJSON, MapContainer, Marker, TileLayer } from 'react-leaflet'
import L from 'leaflet'
// ... 既存 import に加えて
```
MapView コンポーネント内に追加:
```tsx
  const lastEvents = useGameStore((s) => s.lastEvents)
  const phase = useGameStore((s) => s.game?.phase)

  // 出没（里山/市街）があった地区 id の集合
  const sightedIds = new Set(
    (phase === 'encounter' || phase === 'gameover'
      ? lastEvents
      : []
    )
      .filter((e) => e.kind !== 'fence-block')
      .map((e) => e.districtId),
  )

  // 地区重心（座標平均）の概算
  const centroidOf = (districtId: string): [number, number] | null => {
    const f = districtsGeo.features.find((ff) => ff.properties.districtId === districtId)
    if (!f) return null
    let sx = 0, sy = 0, n = 0
    const walk = (node: unknown): void => {
      if (!Array.isArray(node)) return
      if (typeof node[0] === 'number') {
        sx += node[0] as number; sy += node[1] as number; n++
        return
      }
      for (const c of node) walk(c)
    }
    walk(f.geometry.coordinates)
    return n ? [sy / n, sx / n] : null
  }

  const bearIcon = L.divIcon({
    className: '',
    html: '<div style="font-size:22px;line-height:1">🐻</div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
```
`<GeoJSON .../>` の後にマーカー描画を追加:
```tsx
      {[...sightedIds].map((id) => {
        const c = centroidOf(id)
        return c ? <Marker key={id} position={c} icon={bearIcon} /> : null
      })}
```

- [ ] **Step 4: 型チェック + 本番ビルド + コミット**

Run: `npx tsc -b`（exit 0）
Run: `npm run build`（成功）
```bash
git add src/components/EncounterReveal.tsx src/components/MapView.tsx src/App.tsx
git commit -m "feat: encounter summary and bear sighting markers on map"
```

---

## Task 9: 結線・対策ボタンの現実用語ラップ・通し確認

**Files:**
- Modify: `src/App.tsx`（`EventModal`/`AgendaCards` を結線、ActionBar の現実用語をツールチップ化）
- Modify: `src/data/actions.ts`（説明文に現実用語を含めて関連付け）

**Interfaces:**
- Consumes: `EventModal`, `AgendaCards`。

- [ ] **Step 1: App.tsx に EventModal / AgendaCards を結線**

`App.tsx` の `App` ルートに `EventModal` を常設（ダッシュボード表示中）。`Dashboard` の地図エリア（`<main>` を `relative` に）に `AgendaCards` を重ねる:
```tsx
        <main className="relative min-w-0 flex-1">
          <AgendaCards />
          <MapView />
        </main>
```
`App` 内（`game ? <Dashboard/> : <StartScreen/>` の外側）で:
```tsx
  return (
    <div className="h-full">
      {game ? <Dashboard /> : <StartScreen />}
      <EventModal />
    </div>
  )
```
import 追加: `EventModal`, `AgendaCards`。

- [ ] **Step 2: 対策の説明に現実用語を入れ、ActionBar でラップ**

`src/data/actions.ts` の `description` を現実用語入りに調整（例）:
- 広域草刈り: 「集落と山林の境界を刈り払い、緩衝帯整備で見通しを良くする。数ターン流入を遮断。」
- クリーン作戦: 「放置果樹や生ゴミの誘引物除去で、遭遇率を永続的に下げる。」
- 電気柵の設置: 「侵入防止柵を張り、その地区の里山の遭遇を1度だけ無効化する。」

`App.tsx` の `ActionBar` で各ボタンの説明 title をやめ、ツールチップ用に現実用語を `GlossaryTerm` でラップした小さな説明を表示（任意：ボタン下に1行）。最小実装としては、対策名の近くに現実用語チップを置く:
```tsx
// ActionBar 内、各ボタンの説明行に対応する現実用語があれば添える
```
> v1 ではボタンの `title` 属性を現実用語の短い対応（例: 「現実では緩衝帯整備」）にするだけでも可。凝りすぎない。

- [ ] **Step 3: 通し確認（目視）**

Run: `npx tsc -b`（exit 0）/ `npm run build`（成功）
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/`（200）
目視（http://localhost:5173/）:
- スタート → 第1週開始、約35%でイベントモーダル、アジェンダ3枚が出る
- アジェンダ選択 → 対策操作が解放、右上「クマの行動へ」
- クマの行動 → 地図に🐻マーカー＋上部サマリー、遭遇率の色更新、右上「次の週へ」
- 不満度100で「もう一度」、第14週完走で防衛成功
- イベント/アジェンダの現実用語にマウスオーバーで解説が出る

- [ ] **Step 4: コミット**

```bash
git add src/App.tsx src/data/actions.ts
git commit -m "feat: wire event/agenda UI and real-term tooltips into dashboard"
```

---

## Self-Review（プラン作成者によるチェック結果）
- **Spec coverage:** ターン進行（週・文脈ボタン・フェーズ名非表示）=T4,T7／突発イベント通知=T2,T3,T5／アジェンダ選択=T2,T3,T6／遭遇地図演出＋サマリー=T8／用語ツールチップ（現実用語限定）=T1,T5,T6,T9／コンテンツ=T2。全項目に対応タスクあり。
- **Placeholder scan:** 各コード手順は実コードを記載。T9 Step2 は「最小実装でも可」と幅を持たせたが、具体策（title 属性に現実用語）を明示済み。
- **Type consistency:** `RandomEvent` は `weight`（`probability` ではなく）に統一（rollEvent と一致）。`apply(game)=>GameState` を全効果で統一。store の新フィールド名（`currentEvent`/`agendaChoices`/`selectedAgendaId`）はタスク間で一致。
- **既知の調整点:** `agendas.ts` の学習放獣説明に紛れた英単語は実装時に日本語化（「個体」）。`INSTRUCTION_POINTS_PER_TURN` 定数を流用。
