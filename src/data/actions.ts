/**
 * §5.2 対策コマンドの定義。コスト等は仕様の例に基づく暫定値。
 * 効果量（遭遇率への影響度）は RiskModel.params.actionEffects 側で管理する。
 * flavor / effectLabel / duration は表示専用（マスキング維持のため数値は出さない）。
 */

import type { ActionDef, ActionKind } from '@/types'

export const ACTIONS: Record<ActionKind, ActionDef> = {
  mowing: {
    kind: 'mowing',
    name: '広域草刈り',
    instructionPointCost: 1,
    flavor:
      '集落と山林の境界を一斉に刈り払い、見通しを確保。やぶに隠れて里へ下りる"けものみち"をしばらく断ちます。',
    effectLabel: '山林・隣接からのこの地区への流入をせき止める',
    duration: '約2週間',
  },
  'clean-up': {
    kind: 'clean-up',
    name: 'クリーン作戦',
    instructionPointCost: 1,
    flavor:
      '放置果樹や生ゴミ（誘引物）を地域ぐるみで一掃。里へ下りてくる動機そのものを恒久的にそぎます。',
    effectLabel: 'この地区の出没しやすさを永続的に下げる',
    duration: '永続',
    realTerms: ['誘引物'],
  },
  'electric-fence': {
    kind: 'electric-fence',
    name: '電気柵の設置',
    instructionPointCost: 1,
    flavor:
      '農地のまわりに侵入防止柵を張りめぐらせます。次に里山から下りてくる出没を、一度だけ確実に食い止めます。',
    effectLabel: 'この地区の里山の出没を1回だけ防ぐ',
    duration: '次の出没を1回',
  },
}

export const ACTION_LIST: ActionDef[] = Object.values(ACTIONS)
