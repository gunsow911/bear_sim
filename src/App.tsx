/**
 * アプリのルート。Step 1（足場）の最小ダッシュボード：
 *   - 未開始: スタート画面
 *   - 開始後: HUD + 地図 + 地区リスト + フェーズ送り
 *
 * 各パネルの本実装（メーター演出・議題カード・対策コマンド）は Step 5 で行う。
 */

import { useEffect, useMemo, useState } from 'react'
import { ActionHelpModal } from '@/components/ActionHelpModal'
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

/** タイトル（アトラクト）画面のシグネチャー: 作戦司令室のレーダースコープ。
 *  外周のブリップ＝熊の脅威、中心＝司令部の照準。スイープが連続回転する。 */
function RadarScope() {
  // 北(上)＝山間の供給源、中心＝市街。脅威は山から里・街へ降りてくる構図。
  const blips = [
    { x: 78, y: 30, hot: true, delay: '0s' }, // 山間・供給源
    { x: 128, y: 42, hot: true, delay: '1.1s' }, // 山間・供給源
    { x: 66, y: 78, hot: false, delay: '0.5s' }, // 里山バッファ
    { x: 140, y: 92, hot: false, delay: '1.7s' },
    { x: 58, y: 122, hot: false, delay: '2.2s' },
    { x: 112, y: 132, hot: false, delay: '0.8s' },
    { x: 150, y: 140, hot: false, delay: '2.6s' },
    { x: 92, y: 160, hot: false, delay: '1.4s' },
  ]
  return (
    <div className="attract-scope" aria-hidden="true">
      <div className="attract-sweep" />
      <svg className="attract-scope-svg" viewBox="0 0 200 200">
        <circle className="attract-ring" cx="100" cy="100" r="92" />
        <circle className="attract-ring" cx="100" cy="100" r="64" />
        <circle className="attract-ring" cx="100" cy="100" r="34" />
        <line className="attract-cross" x1="100" y1="8" x2="100" y2="192" />
        <line className="attract-cross" x1="8" y1="100" x2="192" y2="100" />
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2
          const r1 = i % 6 === 0 ? 84 : 88
          return (
            <line
              key={i}
              className="attract-tick"
              x1={100 + Math.cos(a) * r1}
              y1={100 + Math.sin(a) * r1}
              x2={100 + Math.cos(a) * 92}
              y2={100 + Math.sin(a) * 92}
            />
          )
        })}
        {blips.map((b, i) => (
          <circle
            key={i}
            className={`attract-blip${b.hot ? ' hot' : ''}`}
            cx={b.x}
            cy={b.y}
            r={b.hot ? 3.4 : 2.6}
            style={{ animationDelay: b.delay }}
          />
        ))}
        {/* 中心 ＝ 司令部マーカー（照準レティクル） */}
        <circle className="attract-core-pulse" cx="100" cy="100" r="8" />
        <path className="attract-core" d="M100 90 v6 M100 104 v6 M90 100 h6 M104 100 h6" />
        <rect className="attract-core" x="95" y="95" width="10" height="10" />
      </svg>
    </div>
  )
}

function StartScreen() {
  const startStage = useGameStore((s) => s.startStage)
  const stage = yamaguchiStage
  return (
    <div className="attract">
      <div className="attract-frame">
        <span /><span /><span /><span />
      </div>

      <div className="attract-status attract-mono">
        <span>
          <i className="attract-dot" />
          <span className="attract-online">対策本部 オンライン</span>
        </span>
        <span className="attract-status-meta">
          {stage.name} ／ {stage.districts.length} 地区
          <span className="attract-status-warn"> ／ 熊害警戒中</span>
        </span>
      </div>

      <div className="attract-body">
        <div className="attract-copy">
          <p className="attract-eyebrow attract-mono">Satoyama Defense Operations</p>
          <h1 className="attract-title">里山防衛<br />対策本部</h1>
          <div className="attract-rule" />
          <p className="attract-brief">
            山口県の<b>熊害対策シミュレーター</b>。地区ごとの遭遇率を読み、
            限られた指示で<b>棲み分け</b>を組み立てる。秋までに、街へ降ろさない。
          </p>
          <button
            className="attract-cta attract-mono"
            onClick={() => startStage(stage)}
          >
            <span className="attract-cta-arrow">▶</span>
            <span>{stage.name}で作戦開始</span>
            <span className="attract-cta-tag">START</span>
          </button>
          <p className="attract-hint attract-mono">指示を出して開始</p>
        </div>

        <RadarScope />
      </div>
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
  // 予測は「現在と表示上の差がある」ときだけ見せる（変動なしは線も数値も出さない）。
  const showPred = predicted !== undefined && Math.round(predicted) !== Math.round(value)
  const predPct = showPred ? Math.min(100, Math.max(0, (predicted! / max) * 100)) : null
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-bold">
          <span className={riskColor(value)}>{value.toFixed(0)}</span>
          {showPred && (
            <>
              <span className="mx-1 text-slate-500">→</span>
              <span className={riskColor(predicted!)} title="来週の予測遭遇率">
                {predicted!.toFixed(0)}
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

  // 予約中の施策を反映した「来週予測」（行動フェーズのみ）。commitActions と同じ前処理。
  const predicted = useMemo(() => {
    if (!stage || !game || game.phase !== 'action') return null
    let g = game
    for (const p of pending) g = applyAction(g, p.districtId, p.kind, activeRiskModel)
    return projectEncounterRates(g, stage, activeRiskModel)
  }, [stage, game, pending])

  if (!stage || !game) return null

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
              {ds.electricFenceTurns > 0 && (
                <span className="rounded bg-risk-safe/20 px-2 py-0.5 text-xs text-risk-safe">
                  ⚡ 電気柵 有効 残り{ds.electricFenceTurns}T
                </span>
              )}
              {ds.mowingBlockTurns > 0 && (
                <span className="rounded bg-risk-warn/20 px-2 py-0.5 text-xs text-risk-warn">
                  ✂️ 草刈り 残り{ds.mowingBlockTurns}T
                </span>
              )}
              {ds.electricFenceTurns === 0 && ds.mowingBlockTurns === 0 && (
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

/**
 * 施策バー。選択中の地区に対し予約／解除をトグルする（対策フェーズのみ有効）。
 */
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

/** 画面幅が md(768px) 以上か。左ペインの初期表示・選択時クローズの判定に使う。 */
function isDesktop(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
}

/**
 * 左ペインの地区リスト。各地区の名前・山林隣接・里山/市街遭遇率を並べ、クリックで選択する。
 * onSelect はモバイルで選択後にドロワーを閉じるために呼ぶ。
 */
function DistrictList({ onSelect }: { onSelect?: () => void }) {
  const stage = useGameStore((s) => s.stage)
  const game = useGameStore((s) => s.game)
  const selectedId = useGameStore((s) => s.selectedDistrictId)
  const selectDistrict = useGameStore((s) => s.selectDistrict)
  if (!stage || !game) return null

  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      {stage.districts.map((d) => {
        const ds = game.districts[d.id]
        const selected = d.id === selectedId
        return (
          <li key={d.id}>
            <button
              className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                selected
                  ? 'border-risk-safe bg-panel-light'
                  : 'border-panel-border bg-panel hover:bg-panel-light'
              }`}
              onClick={() => {
                selectDistrict(d.id)
                onSelect?.()
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{d.name}</span>
                {d.mountainAdjacent && <span title="山林隣接">⛰️</span>}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                里山{' '}
                <span className={riskColor(ds.satoyamaEncounterRate)}>
                  {ds.satoyamaEncounterRate.toFixed(0)}
                </span>
                <span className="text-slate-500"> / </span>市街{' '}
                <span className={riskColor(ds.urbanEncounterRate)}>
                  {ds.urbanEncounterRate.toFixed(0)}
                </span>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 左ペイン（地区リスト）。折りたたみ可能。
 * md 以上：静的な左カラム。md 未満：地図に重なるドロワー（バックドロップ付き）で既定は閉。
 */
function DistrictSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeOnMobile = () => {
    if (!isDesktop()) onClose()
  }
  return (
    <>
      {/* モバイルのバックドロップ（md 未満・open 時のみ） */}
      {open && (
        <div
          className="absolute inset-0 z-[440] bg-black/40 md:hidden"
          aria-hidden
          onClick={onClose}
        />
      )}
      <aside
        className={`absolute inset-y-0 left-0 z-[450] flex w-64 max-w-[80%] flex-col border-r border-panel-border bg-panel transition-transform duration-200 md:relative md:z-auto md:max-w-none md:bg-transparent ${
          open ? 'translate-x-0' : '-translate-x-full md:hidden'
        }`}
      >
        <div className="flex items-center justify-between px-3 pt-3">
          <h2 className="text-sm font-bold text-slate-400">地区</h2>
          <button
            aria-label="地区パネルを閉じる"
            onClick={onClose}
            className="rounded border border-panel-border bg-panel px-2 leading-6 text-slate-400 transition hover:bg-panel-light"
          >
            ‹
          </button>
        </div>
        <DistrictList onSelect={closeOnMobile} />
      </aside>
    </>
  )
}

function Dashboard() {
  // 左ペインの開閉。スマホサイズ（md 未満）は既定で閉じる。
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop)
  return (
    <div className="flex h-full flex-col">
      <Hud />
      <div className="relative flex min-h-0 flex-1">
        <DistrictSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="relative min-h-0 min-w-0 flex-1">
          <AgendaCards />
          <EncounterReveal />
          <ActionConfirmModal />
          <MapView />
          {/* 折りたたみ中の再表示タブ（地図の左端・垂直中央＝Leafletズーム操作と干渉しない） */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute left-0 top-1/2 z-[500] -translate-y-1/2 rounded-r-lg border border-l-0 border-panel-border bg-panel/90 px-2 py-3 text-xs text-slate-300 shadow transition hover:bg-panel-light"
            >
              地区 ›
            </button>
          )}
        </main>
      </div>
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
      <ActionHelpModal />
    </div>
  )
}
