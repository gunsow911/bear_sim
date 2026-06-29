import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { wrapTerms } from './wrapTerms'

export function AgendaCards() {
  const phase = useGameStore((s) => s.game?.phase)
  const choices = useGameStore((s) => s.agendaChoices)
  const selected = useGameStore((s) => s.selectedAgendaId)
  const tentative = useGameStore((s) => s.tentativeAgendaId)
  const currentEvent = useGameStore((s) => s.currentEvent)
  const selectAgenda = useGameStore((s) => s.selectAgenda)
  const confirmAgenda = useGameStore((s) => s.confirmAgenda)

  // イベントモーダルが出ている間は隠す。議題フェーズ・未確定の時だけ表示。
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
              今週の方針を1つ選び、「決定」で可決する
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {choices.map((a) => {
                const isTentative = a.id === tentative
                return (
                  <button
                    key={a.id}
                    onClick={() => selectAgenda(a.id)}
                    aria-pressed={isTentative}
                    className={`flex flex-col rounded-lg border p-3 text-left transition ${
                      isTentative
                        ? 'border-risk-safe bg-panel-light ring-2 ring-risk-safe'
                        : 'border-panel-border bg-panel hover:border-risk-safe hover:bg-panel-light'
                    }`}
                  >
                    <span className="mb-1 font-bold">{a.name}</span>
                    <span className="text-xs leading-relaxed text-slate-300">
                      {a.realTerms?.length ? wrapTerms(a.description, a.realTerms) : a.description}
                    </span>
                    <span className="mt-2 text-xs font-bold text-risk-safe">効果：{a.effect}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex justify-center">
              <button
                disabled={!tentative}
                onClick={confirmAgenda}
                className="rounded-lg bg-risk-safe px-8 py-2 font-bold text-panel transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                決定
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
