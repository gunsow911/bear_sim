/**
 * アプリのルート。Step 1（足場）の最小ダッシュボード：
 *   - 未開始: スタート画面
 *   - 開始後: HUD + 地図 + 地区リスト + フェーズ送り
 *
 * 各パネルの本実装（メーター演出・議題カード・対策コマンド）は Step 5 で行う。
 */

import { useEffect, useMemo, useState } from 'react'
import { ActionDetailCard } from '@/components/ActionDetailCard'
import { AgendaCards } from '@/components/AgendaCards'
import { EncounterReveal } from '@/components/EncounterReveal'
import { EventModal } from '@/components/EventModal'
import { MessageModal } from '@/components/MessageModal'
import { ActionConfirmModal } from '@/components/ActionConfirmModal'
import { MapView } from '@/components/MapView'
import { ACTION_LIST, ACTIONS } from '@/data/actions'
import { yamaguchiStage } from '@/data/stages'
import { useGameStore } from '@/store/gameStore'
import { applyTheme, DEFAULT_THEME } from '@/theme/themes'
import { applyAction, projectEncounterRates } from '@/engine/turn'
import { activeRiskModel } from '@/engine/model'
import type { ActionKind, DistrictFeature } from '@/types'

const FEATURE_LABEL: Record<DistrictFeature, { icon: string; name: string }> = {
  water: { icon: '🌊', name: '水系接続' },
  'green-corridor': { icon: '🌲', name: 'グリーン回廊' },
  'trunk-road': { icon: '🚧', name: '幹線道路' },
}

/** ゲーム開始月（盛夏）。ターンを「N月M週」表記に変換する起点。8月→11月の4か月。 */
const START_MONTH = 8
function seasonLabel(turn: number): string {
  const month = START_MONTH + Math.floor((turn - 1) / 4)
  const week = ((turn - 1) % 4) + 1
  return `${month}月${week}週`
}

function StartScreen() {
  const startStage = useGameStore((s) => s.startStage)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold tracking-wide">里山防衛対策本部</h1>
      <p className="max-w-md text-slate-300">
        山口県熊害対策シミュレーター。地区ごとの遭遇率を管理し、棲み分けの本質を学ぶ。
      </p>
      <button
        className="rounded-lg bg-risk-safe px-6 py-3 font-bold text-panel transition hover:brightness-110"
        onClick={() => startStage(yamaguchiStage)}
      >
        {yamaguchiStage.name}で開始
      </button>
    </div>
  )
}

function Hud() {
  const game = useGameStore((s) => s.game)
  // 派生値（予約合計）を直接購読し、予約の増減で確実に再レンダリングさせる。
  const resP = useGameStore((s) => s.reservedPoints())
  if (!game) return null
  return (
    <header className="flex items-center justify-between gap-4 border-b border-panel-border bg-panel-light px-4 py-2">
      <div className="flex gap-6 text-sm">
        <span>
          <b>{seasonLabel(game.turn)}</b>
          <span className="ml-2 text-slate-400">あと{game.maxTurns - game.turn + 1}週</span>
        </span>
        <span title="今週使える指示（残り / 今週の総数）">
          指示 <b className={resP > 0 ? 'text-risk-warn' : ''}>{game.instructionPoints - resP}</b>
          <span className="text-slate-400">/{game.instructionPoints}</span>
        </span>
        <span>
          不満度 <b className={game.dissatisfaction >= 70 ? 'text-risk-critical' : ''}>
            {game.dissatisfaction}%
          </b>
        </span>
        <span>
          活発度 <b>{game.activeness}</b>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <PhaseControl />
      </div>
    </header>
  )
}

/** フェーズ送り／リスタートのボタン（画面右上）。文脈に応じたラベルを表示。 */
function PhaseControl() {
  const game = useGameStore((s) => s.game)
  const advancePhase = useGameStore((s) => s.advancePhase)
  const openActionModal = useGameStore((s) => s.openActionModal)
  const commitActions = useGameStore((s) => s.commitActions)
  // 派生値（予約合計）を直接購読し、予約の増減で再レンダリングさせる。
  const resP = useGameStore((s) => s.reservedPoints())
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
    // 指示を使い切っていればそのまま進行。残っていれば使い残し警告モーダルを開く。
    const remaining = game.instructionPoints - resP
    return (
      <button
        className="rounded-lg bg-risk-warn px-5 py-1.5 font-bold text-panel transition hover:brightness-110"
        onClick={() => (remaining > 0 ? openActionModal() : commitActions())}
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
  return <span></span>
}

/** 遭遇率に応じた警戒色クラスを返す。 */
function riskColor(rate: number): string {
  if (rate >= 75) return 'text-risk-critical'
  if (rate >= 50) return 'text-risk-danger'
  if (rate >= 25) return 'text-risk-warn'
  return 'text-risk-safe'
}

/** ラベル付きのメーターバー。predicted 指定時は「現在 → 予測」とゴースト目盛りを表示。 */
function Meter({
  label,
  value,
  predicted,
  max = 100,
}: {
  label: string
  value: number
  predicted?: number
  max?: number
}) {
  const pct = Math.min(100, (value / max) * 100)
  const predPct =
    predicted === undefined ? null : Math.min(100, Math.max(0, (predicted / max) * 100))
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-bold">
          <span className={riskColor(value)}>{value.toFixed(0)}</span>
          {predicted !== undefined && (
            <>
              <span className="mx-1 text-slate-500">→</span>
              <span className={riskColor(predicted)} title="来週の予測遭遇率">
                {predicted.toFixed(0)}
              </span>
            </>
          )}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded bg-panel">
        <div className="h-full rounded bg-current transition-all" style={{ width: `${pct}%` }} />
        {predPct !== null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-slate-200"
            style={{ left: `calc(${predPct}% - 1px)` }}
            title="来週の予測位置"
          />
        )}
      </div>
    </div>
  )
}

/**
 * 里山率（0〜1）を里山/市街の割合(%)に変換する。
 * 例: 0.8 → 里山80% / 市街20%。
 */
function landComposition(satoyamaRatio: number): { satoyama: number; urban: number } {
  const satoyama = Math.round(satoyamaRatio * 100)
  return { satoyama, urban: 100 - satoyama }
}

/**
 * 画面下部の地区詳細パネル。選択中の地区の情報を表示。
 * ※ ベース生息密度・人間の介入による変動はプレイヤーには非表示（マスキング）。
 */
function DistrictDetail() {
  const stage = useGameStore((s) => s.stage)
  const game = useGameStore((s) => s.game)
  const selectedId = useGameStore((s) => s.selectedDistrictId)
  const selectDistrict = useGameStore((s) => s.selectDistrict)
  const pending = useGameStore((s) => s.pendingActions)
  const removeAction = useGameStore((s) => s.removeAction)
  if (!stage || !game) return null

  // 予約中の施策を反映した「来週予測」（行動フェーズのみ）。commitActions と同じ前処理。
  const predicted = useMemo(() => {
    if (!stage || !game || game.phase !== 'action') return null
    let g = game
    for (const p of pending) g = applyAction(g, p.districtId, p.kind, activeRiskModel)
    return projectEncounterRates(g, stage, activeRiskModel)
  }, [stage, game, pending])
  const pred = selectedId ? predicted?.[selectedId] : undefined

  const districts = stage.districts
  const idx = districts.findIndex((d) => d.id === selectedId)
  const prevId = idx >= 0 ? districts[(idx - 1 + districts.length) % districts.length].id : null
  const nextId = idx >= 0 ? districts[(idx + 1) % districts.length].id : null

  const def = stage.districts.find((d) => d.id === selectedId)
  const ds = selectedId ? game.districts[selectedId] : undefined
  const pct = def ? landComposition(def.satoyamaRatio) : { satoyama: 0, urban: 0 }

  return (
    <section className="flex flex-col gap-3 border-t border-panel-border bg-panel-light px-4 py-3">
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
      {!def || !ds ? (
        <p className="text-sm text-slate-400">地区を選択すると詳細が表示されます。</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* 見出し + 特徴ラベル */}
          <div>
            <div className="flex items-center gap-2">
              <button
                aria-label="前の地区"
                onClick={() => prevId && selectDistrict(prevId)}
                className="shrink-0 rounded border border-panel-border bg-panel px-2 py-0.5 text-sm transition hover:bg-panel-light"
              >
                ‹
              </button>
              <h2
                className="min-w-0 flex-1 truncate text-center text-lg font-bold"
                title={def.name}
              >
                {def.name}
              </h2>
              <button
                aria-label="次の地区"
                onClick={() => nextId && selectDistrict(nextId)}
                className="shrink-0 rounded border border-panel-border bg-panel px-2 py-0.5 text-sm transition hover:bg-panel-light"
              >
                ›
              </button>
            </div>
            {def.mountainAdjacent && (
              <div className="mt-1">
                <span className="rounded bg-panel px-2 py-0.5 text-xs" title="山林隣接">
                  ⛰️ 山林隣接
                </span>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              {def.features.length === 0 ? (
                <span className="text-xs text-slate-500">特徴ラベルなし</span>
              ) : (
                def.features.map((f) => (
                  <span
                    key={f}
                    className="rounded bg-panel px-2 py-0.5 text-xs"
                    title={FEATURE_LABEL[f].name}
                  >
                    {FEATURE_LABEL[f].icon} {FEATURE_LABEL[f].name}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* 土地構成（里山/市街比を%表示）+ 遭遇率メーター をグルーピング */}
          <div className="flex flex-col justify-center gap-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-slate-400">土地構成</span>
                <span>
                  <span className="font-bold text-risk-safe">里山 {pct.satoyama}%</span>
                  <span className="text-slate-500"> / </span>
                  <span className="font-bold">市街 {pct.urban}%</span>
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded bg-panel" title="里山 / 市街の割合">
                <div className="bg-risk-safe" style={{ width: `${pct.satoyama}%` }} />
                <div className="bg-slate-500" style={{ width: `${pct.urban}%` }} />
              </div>
            </div>
            <Meter label="里山遭遇率" value={ds.satoyamaEncounterRate} predicted={pred?.satoyama} />
            <Meter label="市街遭遇率" value={ds.urbanEncounterRate} predicted={pred?.urban} />
          </div>

          {/* 状態（対策の効果） */}
          <div className="flex flex-col justify-center text-sm">
            <p className="mb-1 text-xs text-slate-400">状態</p>
            <div className="flex flex-wrap gap-1">
              {ds.electricFenceActive && (
                <span className="rounded bg-risk-safe/20 px-2 py-0.5 text-xs text-risk-safe">
                  ⚡ 電気柵 有効
                </span>
              )}
              {ds.mowingBlockTurns > 0 && (
                <span className="rounded bg-risk-warn/20 px-2 py-0.5 text-xs text-risk-warn">
                  ✂️ 草刈り遮断 残り{ds.mowingBlockTurns}T
                </span>
              )}
              {!ds.electricFenceActive && ds.mowingBlockTurns === 0 && (
                <span className="text-xs text-slate-500">対策の効果なし</span>
              )}
            </div>
            {game.phase === 'action' && (
              <p className="mt-2 text-[10px] leading-snug text-slate-500">
                ⚡電気柵は遭遇率（予測値）を下げず、出没を1回だけ防ぎます。
              </p>
            )}
          </div>
        </div>
      )}

      {def && ds && <ActionBar />}
    </section>
  )
}

/**
 * §5.2 施策バー。選択中の地区に対し予約／解除をトグルする（対策フェーズのみ有効）。
 * ボタンは折り返さず横1段のレール（overflow-x-auto）にして、施策が増えてもパネルが縦に伸びない。
 * レールは縦方向もクリップするため、詳細カードはレールの外（ラッパー直下の絶対配置）に
 * 1枚だけ置き、ホバー／フォーカス中の施策の内容を上方向に表示する（クリップ回避）。
 */
function ActionBar() {
  const toggleAction = useGameStore((s) => s.toggleAction)
  const canStage = useGameStore((s) => s.canStage)
  const isStaged = useGameStore((s) => s.isStaged)
  const selectedId = useGameStore((s) => s.selectedDistrictId)
  const game = useGameStore((s) => s.game)
  // ホバー／フォーカス中の施策（詳細カード表示用）。
  const [activeKind, setActiveKind] = useState<ActionKind | null>(null)
  if (!game || !selectedId) return null

  const activeAction = activeKind ? ACTIONS[activeKind] : null
  // 別ボタンへ移った時の取りこぼしを防ぐため、現在表示中の施策のときだけ解除する。
  const clearIf = (kind: ActionKind) => setActiveKind((k) => (k === kind ? null : k))

  return (
    <div className="relative border-t border-panel-border pt-3">
      {/* 横スクロールのレール（1段固定）。ボタンは固定幅で縮まずに横へ流れる。 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ACTION_LIST.map((a) => {
          const staged = isStaged(selectedId, a.kind)
          const enabled = canStage(a.kind)
          // 施策は一律1指示なのでコストは表示しない。バフ等で0になったときだけ「無料」を明示。
          const free = a.instructionPointCost === 0
          return (
            <button
              key={a.kind}
              disabled={!enabled}
              aria-pressed={staged}
              onClick={() => toggleAction(a.kind)}
              onMouseEnter={() => setActiveKind(a.kind)}
              onMouseLeave={() => clearIf(a.kind)}
              onFocus={() => setActiveKind(a.kind)}
              onBlur={() => clearIf(a.kind)}
              className={`flex w-44 shrink-0 flex-col rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
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
              {free && <span className="text-xs font-bold text-risk-safe">無料</span>}
            </button>
          )
        })}
      </div>
      {/* 詳細カード：レールの外・絶対配置で上方向に開く（横スクロールにクリップされない）。
          タッチ端末（hover 不可）はボタンの常時表示（効果ラベル＋コスト）でカバー。 */}
      {activeAction && (
        <div className="pointer-events-none absolute bottom-full left-0 z-[600] mb-2">
          <ActionDetailCard action={activeAction} />
        </div>
      )}
    </div>
  )
}

function Dashboard() {
  return (
    <div className="flex h-full flex-col">
      <Hud />
      <main className="relative min-h-0 flex-1">
        <AgendaCards />
        <EncounterReveal />
        <ActionConfirmModal />
        <MapView />
      </main>
      <DistrictDetail />
    </div>
  )
}

export default function App() {
  const game = useGameStore((s) => s.game)
  useEffect(() => {
    applyTheme(DEFAULT_THEME)
  }, [])
  return (
    <div className="h-full">
      {game ? <Dashboard /> : <StartScreen />}
      <EventModal />
      <MessageModal />
    </div>
  )
}
