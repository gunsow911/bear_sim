import { useGameStore } from '@/store/gameStore'

export function EncounterReveal() {
  const events = useGameStore((s) => s.lastEvents)
  const phase = useGameStore((s) => s.game?.phase)
  if (phase !== 'encounter' && phase !== 'gameover') return null

  return (
    <div className="border-b border-panel-border bg-panel px-4 py-1.5 text-sm">
      {events.length === 0 ? (
        <span className="text-risk-safe">今週の出没：なし 🐾</span>
      ) : (
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {events.map((e, i) => (
            <span
              key={i}
              className={
                e.kind === 'urban'
                  ? 'text-risk-critical'
                  : e.kind === 'satoyama'
                    ? 'text-risk-danger'
                    : 'text-risk-safe'
              }
            >
              {e.message}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
