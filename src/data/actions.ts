/**
 * §5.2 対策コマンドの定義。コスト等は仕様の例に基づく暫定値。
 * 効果量（遭遇率への影響度）は RiskModel.params.actionEffects 側で管理する。
 */

import type { ActionDef, ActionKind } from '@/types'

export const ACTIONS: Record<ActionKind, ActionDef> = {
  mowing: {
    kind: 'mowing',
    name: '広域草刈り',
    budgetCost: 0,
    instructionPointCost: 1,
    description: '指定地区の流入を数ターン遮断する（時間稼ぎ）。',
  },
  'clean-up': {
    kind: 'clean-up',
    name: 'クリーン作戦',
    budgetCost: 100_000,
    instructionPointCost: 1,
    description: '放置果樹や生ゴミを一掃し、遭遇率を永続的に減少させる（根本解決）。',
  },
  'electric-fence': {
    kind: 'electric-fence',
    name: '電気柵の設置',
    budgetCost: 300_000,
    instructionPointCost: 1,
    description: '農地に電気柵を張る。その地区の里山の遭遇を1度だけ無効化する。',
  },
}

export const ACTION_LIST: ActionDef[] = Object.values(ACTIONS)
