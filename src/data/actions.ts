/**
 * §5.2 対策コマンドの定義。コスト等は仕様の例に基づく暫定値。
 * 効果量（遭遇率への影響度）は RiskModel.params.actionEffects 側で管理する。
 * flavor / effectLabel は表示専用（マスキング維持のため数値は出さない）。
 */

import type { ActionDef, ActionKind } from '@/types'

export const ACTIONS: Record<ActionKind, ActionDef> = {
  mowing: {
    kind: 'mowing',
    name: '広域草刈り',
    instructionPointCost: 1,
    flavor:
      '集落と山林の境界を一斉に刈り払い、見通しを確保。やぶに隠れて里へ下りる"けものみち"を細くし、山林からも隣接地区からもこの地区への流入を鈍らせます。',
    effectLabel: 'この地区への流入を約半分に抑える',
  },
  'electric-fence': {
    kind: 'electric-fence',
    name: '電気柵の設置',
    instructionPointCost: 1,
    flavor:
      '農地のまわりに侵入防止柵を張りめぐらせます。里山から下りてくる出没を一度だけ確実に食い止めます。',
    effectLabel: '数ターン以内の里山の出没を1回だけ防ぐ',
  },
}

export const ACTION_LIST: ActionDef[] = Object.values(ACTIONS)
