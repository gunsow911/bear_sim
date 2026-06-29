import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { ACTIONS } from '@/data/actions'
import type { DistrictId } from '@/types'

/** 「クマの行動へ」押下で開く実行確認モーダル。予約を地区ごとに再掲し、実行/戻るを選ぶ。 */
export function ActionConfirmModal() {
  const open = useGameStore((s) => s.actionModalOpen)
  const pending = useGameStore((s) => s.pendingActions)
  const stage = useGameStore((s) => s.stage)
  const closeActionModal = useGameStore((s) => s.closeActionModal)
  const commitActions = useGameStore((s) => s.commitActions)

  const nameOf = (id: DistrictId) => stage?.districts.find((d) => d.id === id)?.name ?? id
  // 地区ごとにグルーピング（出現順を保つ）
  const groups: { districtId: DistrictId; kinds: typeof pending }[] = []
  for (const p of pending) {
    let g = groups.find((x) => x.districtId === p.districtId)
    if (!g) {
      g = { districtId: p.districtId, kinds: [] }
      groups.push(g)
    }
    g.kinds.push(p)
  }
  const empty = pending.length === 0

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
            <h2 className="mb-3 text-center text-lg font-bold">今週の施策</h2>
            {empty ? (
              <p className="mb-4 text-center text-sm text-slate-300">今週は施策を実行しません。</p>
            ) : (
              <ul className="mb-4 space-y-2">
                {groups.map((g) => (
                  <li key={g.districtId} className="rounded-lg border border-panel-border bg-panel p-2">
                    <p className="mb-1 text-sm font-bold">{nameOf(g.districtId)}</p>
                    <ul className="space-y-0.5">
                      {g.kinds.map((p) => (
                        <li key={p.kind} className="flex justify-between gap-2 text-xs">
                          <span className="font-bold">{ACTIONS[p.kind].name}</span>
                          <span className="text-risk-safe">{ACTIONS[p.kind].effectLabel}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-center gap-3">
              <button
                onClick={closeActionModal}
                className="rounded-lg border border-panel-border bg-panel px-6 py-2 text-sm font-bold transition hover:bg-panel-light"
              >
                戻る
              </button>
              <button
                onClick={commitActions}
                className="rounded-lg bg-risk-warn px-6 py-2 text-sm font-bold text-panel transition hover:brightness-110"
              >
                {empty ? 'このまま進む' : '実行'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
