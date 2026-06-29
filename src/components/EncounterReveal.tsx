/**
 * 今週の出没結果サマリーカード。
 * 遭遇フェーズ（／ゲームオーバー）で地図上にオーバーレイし、地区ごとの出没を一覧表示する。
 * 主ボタンは「次の週へ」で進行を兼ねる。「地図を見る」で小さなピルに畳めば地図を確認でき、
 * ピルをタップで再展開する。
 */

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/gameStore'
import type { EncounterEventKind } from '@/engine/turn'

const KIND_META: Record<EncounterEventKind, { icon: string; label: string; color: string }> = {
  urban: { icon: '🐻', label: '市街地に出没', color: 'text-risk-critical' },
  satoyama: { icon: '🐾', label: '里山に出没', color: 'text-risk-danger' },
  'fence-block': { icon: '🛡️', label: '電気柵で防いだ', color: 'text-risk-safe' },
}

const WRAP = 'absolute left-1/2 top-4 z-[600] -translate-x-1/2'

export function EncounterReveal() {
  const phase = useGameStore((s) => s.game?.phase)
  const turn = useGameStore((s) => s.game?.turn)
  const events = useGameStore((s) => s.lastEvents)
  const stage = useGameStore((s) => s.stage)
  const after = useGameStore((s) => s.game?.dissatisfaction ?? 0)
  const before = useGameStore((s) => s.dissatisfactionBefore)
  const advancePhase = useGameStore((s) => s.advancePhase)

  const active = phase === 'encounter' || phase === 'gameover'
  const isEncounter = phase === 'encounter'
  const [minimized, setMinimized] = useState(false)
  // 新しい週の結果が来たら展開し直す
  useEffect(() => {
    setMinimized(false)
  }, [turn, phase])

  const nameOf = (id: string) => stage?.districts.find((d) => d.id === id)?.name ?? id
  const summary = events.length === 0 ? '今週は出没なし 🐾' : `今週の出没（${events.length}件）`

  return (
    <AnimatePresence>
      {active && minimized && (
        <motion.button
          key="pill"
          className={`${WRAP} rounded-full border border-panel-border bg-panel-light/95 px-4 py-1.5 text-sm font-bold shadow-lg backdrop-blur transition hover:bg-panel`}
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setMinimized(false)}
        >
          {summary} ▾
        </motion.button>
      )}

      {active && !minimized && (
        <motion.div
          key="card"
          className={`${WRAP} w-[92%] max-w-md rounded-xl border border-panel-border bg-panel-light/95 p-4 shadow-2xl backdrop-blur`}
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
        >
          <h3 className="mb-2 font-bold">{summary}</h3>

          {events.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5 text-sm">
              {events.map((e, i) => {
                const m = KIND_META[e.kind]
                return (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-5 text-center">{m.icon}</span>
                    <span className="w-20 shrink-0 truncate font-bold" title={nameOf(e.districtId)}>
                      {nameOf(e.districtId)}
                    </span>
                    <span className={`flex-1 ${m.color}`}>{m.label}</span>
                    {e.dissatisfactionDelta > 0 && (
                      <span className="shrink-0 font-bold text-risk-critical">
                        不満+{e.dissatisfactionDelta}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-panel-border pt-2">
            <span className="text-xs text-slate-400">
              不満度 {before} <span className="text-slate-500">→</span>{' '}
              <b className={after >= 70 ? 'text-risk-critical' : 'text-fg'}>{after}</b>
            </span>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border border-panel-border px-3 py-1.5 text-sm transition hover:bg-panel"
                onClick={() => setMinimized(true)}
              >
                地図を見る
              </button>
              {isEncounter ? (
                <button
                  className="rounded-lg bg-risk-warn px-5 py-1.5 text-sm font-bold text-panel transition hover:brightness-110"
                  onClick={advancePhase}
                >
                  次の週へ →
                </button>
              ) : (
                <button
                  className="rounded-lg bg-risk-safe px-5 py-1.5 text-sm font-bold text-panel transition hover:brightness-110"
                  onClick={() => setMinimized(true)}
                >
                  閉じる
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
