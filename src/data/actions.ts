/**
 * §5.2 対策コマンドの定義。コスト等は仕様の例に基づく暫定値。
 * 効果量（遭遇率への影響度）は RiskModel.params.actionEffects 側で管理する。
 */

import type { ActionDef, ActionKind } from '@/types'

export const ACTIONS: Record<ActionKind, ActionDef> = {
  mowing: {
    kind: 'mowing',
    name: '広域草刈り',
    budgetCost: 0, // 万円
    instructionPointCost: 1,
    description: '集落と山林の境界を刈り払い、見通しを良くする（緩衝帯整備）。数ターン流入を遮断する。',
  },
  'clean-up': {
    kind: 'clean-up',
    name: 'クリーン作戦',
    budgetCost: 10, // 万円
    instructionPointCost: 1,
    description: '放置果樹や生ゴミ（誘引物）を一掃し、遭遇率を永続的に下げる。',
  },
  'electric-fence': {
    kind: 'electric-fence',
    name: '電気柵の設置',
    budgetCost: 30, // 万円
    instructionPointCost: 1,
    description: '農地に侵入防止柵を張り、その地区の里山の遭遇を1度だけ無効化する。',
  },
}

export const ACTION_LIST: ActionDef[] = Object.values(ACTIONS)
