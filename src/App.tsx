/**
 * アプリのルート。Step 1（足場）の最小ダッシュボード：
 *   - 未開始: スタート画面
 *   - 開始後: HUD + 地図 + 地区リスト + フェーズ送り
 *
 * 各パネルの本実装（メーター演出・議題カード・対策コマンド）は Step 5 で行う。
 */

import { useEffect } from 'react'
import { AgendaCards } from '@/components/AgendaCards'
import { EncounterReveal } from '@/components/EncounterReveal'
import { EventModal } from '@/components/EventModal'
import { MessageModal } from '@/components/MessageModal'
import { MapView } from '@/components/MapView'
import { ACTION_LIST } from '@/data/actions'
import { sampleStage } from '@/data/sampleStage'
import { useGameStore } from '@/store/gameStore'
import { applyTheme, DEFAULT_THEME } from '@/theme/themes'
import type { DistrictFeature } from '@/types'

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
        onClick={() => startStage(sampleStage)}
      >
        {sampleStage.name}で開始
      </button>
    </div>
  )
}

function Hud() {
  const game = useGameStore((s) => s.game)
  if (!game) return null
  return (
    <header className="flex items-center justify-between gap-4 border-b border-panel-border bg-panel-light px-4 py-2">
      <div className="flex gap-6 text-sm">
        <span>
          <b>{seasonLabel(game.turn)}</b>
          <span className="ml-2 text-slate-400">あと{game.maxTurns - game.turn + 1}週</span>
        </span>
        <span>
          予算 <b>{Math.round(game.budget / 10000).toLocaleString()}</b> 万円
        </span>
        <span>
          指示P <b>{game.instructionPoints}</b>
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
  return <span></span>
}

/** 遭遇率に応じた警戒色クラスを返す。 */
function riskColor(rate: number): string {
  if (rate >= 75) return 'text-risk-critical'
  if (rate >= 50) return 'text-risk-danger'
  if (rate >= 25) return 'text-risk-warn'
  return 'text-risk-safe'
}

/** ラベル付きのメーターバー。 */
function Meter({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={`font-bold ${riskColor(value)}`}>{value.toFixed(0)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-panel">
        <div
          className="h-full rounded bg-current transition-all"
          style={{ width: `${pct}%` }}
        />
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
  if (!stage || !game) return null

  const districts = stage.districts
  const idx = districts.findIndex((d) => d.id === selectedId)
  const prevId = idx >= 0 ? districts[(idx - 1 + districts.length) % districts.length].id : null
  const nextId = idx >= 0 ? districts[(idx + 1) % districts.length].id : null

  const def = stage.districts.find((d) => d.id === selectedId)
  const ds = selectedId ? game.districts[selectedId] : undefined
  const pct = def ? landComposition(def.satoyamaRatio) : { satoyama: 0, urban: 0 }

  return (
    <section className="flex flex-col gap-3 border-t border-panel-border bg-panel-light px-4 py-3">
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
            <Meter label="里山遭遇率" value={ds.satoyamaEncounterRate} />
            <Meter label="市街遭遇率" value={ds.urbanEncounterRate} />
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
          </div>
        </div>
      )}

      {def && ds && <ActionBar />}
    </section>
  )
}

/** §5.2 対策コマンドのバー。選択中の地区に対して実行する（対策フェーズのみ有効）。 */
function ActionBar() {
  const applyAction = useGameStore((s) => s.applyAction)
  const canApply = useGameStore((s) => s.canApply)
  const game = useGameStore((s) => s.game)
  if (!game) return null

  return (
    <div className="flex flex-wrap gap-2 border-t border-panel-border pt-3">
      {ACTION_LIST.map((a) => {
        const enabled = canApply(a.kind)
        return (
          <button
            key={a.kind}
            disabled={!enabled}
            title={a.description}
            onClick={() => applyAction(a.kind)}
            className="rounded-lg border border-panel-border bg-panel px-3 py-2 text-left text-sm transition hover:bg-panel-light disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="font-bold">{a.name}</span>
            <span className="ml-2 text-xs text-slate-400">
              {a.budgetCost > 0 ? `${(a.budgetCost / 10000).toFixed(0)}万円` : '予算0'} / 指示
              {a.instructionPointCost}
            </span>
          </button>
        )
      })}
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
