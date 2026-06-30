import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'

/**
 * 指示の使い残し警告モーダル。
 * 「クマの行動へ」を押したとき、指示がまだ残っている場合だけ表示して注意を促す
 * （指示を使い切っているときは PhaseControl 側で即進行し、このモーダルは出さない）。
 * どの地区に何を指示したかの一覧は表示しない（使い残しの確認に専念）。
 */
export function ActionConfirmModal() {
  const open = useGameStore((s) => s.actionModalOpen)
  const game = useGameStore((s) => s.game)
  // 派生値（予約合計）を直接購読し、予約の増減で再レンダリングさせる。
  const resP = useGameStore((s) => s.reservedPoints())
  const closeActionModal = useGameStore((s) => s.closeActionModal)
  const commitActions = useGameStore((s) => s.commitActions)

  // 使い切らずに進もうとしている指示の残数。
  const remaining = game ? game.instructionPoints - resP : 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-[800] flex items-center justify-center bg-black/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-md rounded-xl border border-panel-border bg-panel-light p-5 shadow-2xl"
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
          >
            <h2 className="mb-3 text-center text-lg font-bold">クマの行動へ</h2>
            <div className="mb-5 rounded-lg border border-risk-warn bg-risk-warn/10 px-4 py-3 text-center text-sm text-risk-warn">
              ⚠️ 指示があと <b className="text-base">{remaining}</b> 残っています。
              <br />
              使い切らずにクマの行動へ進みますか？
            </div>
            <div className="flex justify-center gap-3">
              <button
                onClick={closeActionModal}
                className="rounded-lg border border-panel-border bg-panel px-6 py-2 text-sm font-bold transition hover:bg-panel-light"
              >
                戻って指示を出す
              </button>
              <button
                onClick={commitActions}
                className="rounded-lg bg-risk-warn px-6 py-2 text-sm font-bold text-panel transition hover:brightness-110"
              >
                このまま進む
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
