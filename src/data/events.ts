import type { GameState, RandomEvent } from '@/types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export const EVENTS: RandomEvent[] = [
  {
    id: 'acorn-failure',
    name: 'ドングリの大凶作',
    description:
      'ブナやナラの実りが記録的な不作となりました。いわゆるドングリ凶作の年です。山の食料が尽き、クマたちは餌を求めて次々と人里へ下りはじめています。',
    effect: '活発度 +10',
    weight: 3,
    realTerms: ['ドングリ凶作'],
    apply: (g): GameState => ({ ...g, activeness: clamp(g.activeness + 10, 0, 100) }),
  },
  {
    id: 'sightings-surge',
    name: '出没通報の多発',
    description:
      '「畑にクマがいた」「通学路で見かけた」——役場の電話が朝から鳴りやみません。各地で目撃情報が相次ぎ、住民の警戒も高まっています。',
    effect: '活発度 +5',
    weight: 3,
    apply: (g): GameState => ({ ...g, activeness: clamp(g.activeness + 5, 0, 100) }),
  },
  {
    id: 'pre-hibernation',
    name: '冬眠前の荒食い',
    description:
      '冬ごもりを控え、クマたちは脂肪を蓄えようと貪欲に動き回る季節に入りました。行動範囲が広がり、人里への接近も増えています。',
    effect: '活発度 +8',
    weight: 2,
    apply: (g): GameState => ({ ...g, activeness: clamp(g.activeness + 8, 0, 100) }),
  },
  {
    id: 'volunteer',
    name: 'ボランティアの来援',
    description:
      '報道を見た地域の有志や学生たちが「力になりたい」と集まってくれました。動かせる人手が増え、対策本部の士気も上がります。',
    effect: '指示 +1',
    weight: 2,
    apply: (g): GameState => ({ ...g, instructionPoints: g.instructionPoints + 1 }),
  },
]
