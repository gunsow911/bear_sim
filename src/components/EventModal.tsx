import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { wrapTerms } from './wrapTerms'

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
            <p className="mb-3 leading-relaxed text-slate-200">
              {event.realTerms?.length ? wrapTerms(event.description, event.realTerms) : event.description}
            </p>
            <p className="mb-5 text-sm font-bold text-risk-warn">効果：{event.effect}</p>
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
