import type { ActionDef } from '@/types'
import { wrapTerms } from './wrapTerms'

/**
 * 施策の詳細カード。施策バーのボタンにホバー／フォーカスしたときに
 * ポップオーバーとして表示する（flavor ＋ 効果 ＋ 持続 ＋ コスト）。
 * マスキング維持のため数値の効果量は出さず、質的ラベルのみを示す。
 */
export function ActionDetailCard({ action }: { action: ActionDef }) {
  const cost =
    action.budgetCost > 0
      ? `${action.budgetCost}万円 / 指示P${action.instructionPointCost}`
      : `予算0 / 指示P${action.instructionPointCost}`
  return (
    <div className="w-64 rounded-lg border border-panel-border bg-panel-light p-3 text-left shadow-2xl">
      <p className="mb-1 font-bold">{action.name}</p>
      <p className="mb-2 text-xs leading-relaxed text-slate-300">
        {action.realTerms?.length ? wrapTerms(action.flavor, action.realTerms) : action.flavor}
      </p>
      <dl className="space-y-0.5 text-xs">
        <div className="flex gap-2">
          <dt className="shrink-0 text-slate-400">効果</dt>
          <dd className="font-bold text-risk-safe">{action.effectLabel}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-slate-400">持続</dt>
          <dd>{action.duration}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-slate-400">コスト</dt>
          <dd>{cost}</dd>
        </div>
      </dl>
    </div>
  )
}
