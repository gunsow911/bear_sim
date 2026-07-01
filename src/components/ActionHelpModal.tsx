import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { ACTIONS } from '@/data/actions'

/**
 * 施策ヘルプモーダル。施策バーの「？」から開き、現実の施策の解説とゲーム的な効果を示す。
 * マスキング維持のため gameEffectDesc に数値は出さない（データ側の責務）。
 */
export function ActionHelpModal() {
  const kind = useGameStore((s) => s.helpActionKind)
  const close = useGameStore((s) => s.closeActionHelp)
  const action = kind ? ACTIONS[kind] : null

  useEffect(() => {
    if (!action) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [action, close])

  return (
    <AnimatePresence>
      {action && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            className="w-full max-w-md rounded-xl border border-panel-border bg-panel-light p-6 shadow-2xl"
            initial={{ scale: 0.9, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-xl font-bold">{action.name}</h2>
              <button
                aria-label="閉じる"
                onClick={close}
                className="shrink-0 text-slate-400 transition hover:text-slate-100"
              >
                ✕
              </button>
            </div>
            <section className="mb-4">
              <p className="mb-1 text-xs font-bold text-slate-400">現実の施策</p>
              <p className="text-sm leading-relaxed text-slate-200">{action.realWorldDesc}</p>
            </section>
            <section>
              <p className="mb-1 text-xs font-bold text-risk-safe">ゲーム的な効果</p>
              <p className="text-sm leading-relaxed text-slate-200">{action.gameEffectDesc}</p>
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
