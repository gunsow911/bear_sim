/**
 * 汎用メッセージウインドウ。
 * store の messages（複数ページ）を messageIndex で1枚ずつ表示し、
 * 「戻る／次へ／閉じる」で送る。状況説明・チュートリアル・節目の演出に汎用利用する。
 */

import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'

export function MessageModal() {
  const messages = useGameStore((s) => s.messages)
  const index = useGameStore((s) => s.messageIndex)
  const next = useGameStore((s) => s.nextMessage)
  const prev = useGameStore((s) => s.prevMessage)

  const current = messages[index]
  const multi = messages.length > 1
  const hasPrev = index > 0
  const hasNext = index < messages.length - 1

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            key={current.id}
            className="w-full max-w-lg rounded-xl border border-panel-border bg-panel-light p-6 shadow-2xl"
            initial={{ scale: 0.92, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
          >
            <h2 className="mb-3 text-xl font-bold">
              {current.icon ? `${current.icon} ` : ''}
              {current.title}
            </h2>
            <p className="mb-6 whitespace-pre-line leading-relaxed text-slate-200">
              {current.body}
            </p>
            <div className="flex items-center justify-between gap-3">
              {/* 戻る（複数ページ時のみ。先頭では無効） */}
              {multi ? (
                <button
                  disabled={!hasPrev}
                  onClick={prev}
                  className="rounded-lg border border-panel-border px-4 py-2 text-sm transition hover:bg-panel disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ← 戻る
                </button>
              ) : (
                <span />
              )}

              {/* ページ表記（複数ページ時のみ） */}
              <span className="text-xs text-slate-500">
                {multi ? `${index + 1} / ${messages.length}` : ''}
              </span>

              <button
                onClick={next}
                className="rounded-lg bg-risk-safe px-6 py-2 font-bold text-panel transition hover:brightness-110"
              >
                {hasNext ? '次へ →' : '閉じる'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
