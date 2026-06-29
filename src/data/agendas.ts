import type { Agenda, GameState } from '@/types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export const AGENDAS: Agenda[] = [
  {
    id: 'emergency-budget',
    name: '緊急予算の確保',
    description:
      '相次ぐ出没を受け、臨時議会が招集されました。クマ対策の緊急性を訴え、補正予算が可決。現場に回せる資金にいくらか余裕が生まれます。',
    effect: '予算 +10万円',
    apply: (g): GameState => ({ ...g, budget: g.budget + 100_000 }),
  },
  {
    id: 'caution-alert',
    name: '注意喚起の徹底',
    description:
      '防災無線と回覧板で「生ゴミは前夜に出さない」「庭の柿は早めに収穫を」と全戸へ呼びかけました。人里の“ごちそう”を減らし、降りてくる動機をそぎます。',
    effect: '活発度 -10',
    apply: (g): GameState => ({ ...g, activeness: Math.max(0, g.activeness - 10) }),
  },
  {
    id: 'mobilize-staff',
    name: '人員動員',
    description:
      '地元猟友会と市の応援職員に協力を要請。今週はパトロールや対策に動かせる手が一段と増えます。',
    effect: '指示ポイント +1',
    apply: (g): GameState => ({ ...g, instructionPoints: g.instructionPoints + 1 }),
  },
  {
    id: 'awareness',
    name: '啓発活動',
    description:
      '公民館でクマの生態と遭遇時の対処を伝える住民説明会を開催。正しい知識が過度な不安をやわらげ、地域は落ち着きを取り戻します。',
    effect: '不満度 -5',
    apply: (g): GameState => ({ ...g, dissatisfaction: Math.max(0, g.dissatisfaction - 5) }),
  },
  {
    id: 'aversive-release',
    name: '学習放獣の実施',
    description:
      '住民のイノシシ罠にクマが誤ってかかってしまいました。県の専門チームと連携し、麻酔をかけて山奥へ運び、学習放獣を迅速に実施します。',
    effect: '活発度 -15',
    realTerms: ['学習放獣'],
    apply: (g): GameState => ({ ...g, activeness: Math.max(0, g.activeness - 15) }),
  },
  {
    id: 'attractant-removal',
    name: '誘引物除去キャンペーン',
    description:
      '集落総出の一斉清掃。誰も採らなくなった柿や栗、屋外の生ゴミを片付ける誘引物除去を、地域ぐるみで進めました。里山へ降りてくる足が遠のきます。',
    effect: '全地区の里山遭遇率 -6',
    realTerms: ['誘引物除去'],
    apply: (g): GameState => {
      const districts = Object.fromEntries(
        Object.entries(g.districts).map(([id, d]) => [
          id,
          { ...d, satoyamaEncounterRate: clamp(d.satoyamaEncounterRate - 6, 0, 100) },
        ]),
      )
      return { ...g, districts }
    },
  },
]
