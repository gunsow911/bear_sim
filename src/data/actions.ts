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
  'attractant-removal': {
    kind: 'attractant-removal',
    name: '誘引物の除去',
    instructionPointCost: 1,
    flavor:
      '放置された柿や栗、屋外の生ゴミを片付ける誘引物除去を地域ぐるみで進めます。里山でも市街でも、クマが人里へ通う"動機"そのものを、しばらくの間そぎ続けます。',
    effectLabel: 'この地区の里山・市街の出没圧をしばらく抑え続ける',
    realTerms: ['誘引物除去'],
  },
  'box-trap': {
    kind: 'box-trap',
    name: '箱わなによる捕獲',
    instructionPointCost: 2,
    flavor:
      '排除地域に箱わなを仕掛け、里へ通う個体を待ち受けます。かかれば人里に出る前に捕らえられ、以後その地区に降りてくる圧そのものが和らぎます。ただし人手と手間がかかります。',
    effectLabel: 'この地区に来た個体を捕らえ、以後の里山の出没圧を和らげる（人手が要る）',
    realTerms: ['個体数管理'],
  },
  'emergency-shooting': {
    kind: 'emergency-shooting',
    name: '緊急銃猟',
    instructionPointCost: 2,
    flavor:
      '市街地に居座る個体へ、市町の判断で緊急の銃猟を実施します。決壊した市街の危険を即座に断ち切りますが、発砲は住民を動揺させ、事故の恐れもあります。',
    effectLabel: '市街に出た個体を緊急排除する（住民は動揺する）',
    realTerms: ['緊急銃猟'],
  },
  patrol: {
    kind: 'patrol',
    name: 'パトロール',
    instructionPointCost: 1,
    flavor:
      'クマレンジャーと鳥獣専門指導員がこの地区を巡回します。すぐ駆けつける体制が保たれ、万一クマが出ても住民は落ち着いていられます。',
    effectLabel: 'しばらくの間、この地区で出没が起きても住民の不安が広がりにくくなる',
    realTerms: ['クマレンジャー'],
  },
  hazing: {
    kind: 'hazing',
    name: '追い払い',
    instructionPointCost: 1,
    flavor:
      '花火や犬、爆音機でクマを山へ追い返します。すぐ効きますが、同じ手を続けるとクマは慣れてしまい、だんだん通用しなくなります。',
    effectLabel: 'この地区の出没を今すぐ薄く抑える（繰り返すと慣れて効かなくなる）',
    realTerms: ['追い払い'],
  },
}

export const ACTION_LIST: ActionDef[] = Object.values(ACTIONS)
