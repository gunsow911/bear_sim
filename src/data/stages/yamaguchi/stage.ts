/**
 * 山口市ステージ（10地区）。地区分割は e-Stat 小地域（国勢調査）由来。
 *   山間(供給源): 阿東 / 徳地
 *   里山バッファ: 宮野 / 仁保・小鯖
 *   住宅縁辺  : 大内 / 吉敷
 *   市街核    : 湯田・大殿(中心市街) / 小郡
 *   沿岸後方  : 秋穂・嘉川(南部平野) / 阿知須
 *
 * ⚠️ baseDensity / satoyamaRatio / mountainAdjacent / features は【仮値】。
 *    実データ（YPくまっぷ・土地利用統計）由来の値に差し替え予定（docs/DATA.md）。
 *    境界 GeoJSON とは districtId で対応する。
 *    隣接(adjacencies)は生成ジオメトリの実接触（境界最短距離<150m）から作成。
 *    features ラベル(water/green-corridor/trunk-road)は地形に基づき付与。
 */

import type { StageDef } from '@/types'

export const yamaguchiStage: StageDef = {
  id: 'yamaguchi-city',
  name: '山口市',
  maxTurns: 16, // 初夏(6月)〜初秋(9月)の4か月＝16週
  districts: [
    {
      id: 'ato',
      name: '阿東地区',
      baseDensity: 9,
      satoyamaRatio: 0.92, // 北部山間・供給源
      mountainAdjacent: true,
      features: ['green-corridor'],
      adjacencies: [
        { to: 'tokuji', features: ['green-corridor'] },
        { to: 'niho', features: ['green-corridor'] },
        { to: 'miyano', features: ['green-corridor'] },
      ],
    },
    {
      id: 'tokuji',
      name: '徳地地区',
      baseDensity: 9,
      satoyamaRatio: 0.92, // 東部山間・供給源
      mountainAdjacent: true,
      features: ['green-corridor', 'water'],
      adjacencies: [
        { to: 'ato', features: ['green-corridor'] },
        { to: 'niho', features: ['green-corridor'] },
      ],
    },
    {
      id: 'miyano',
      name: '宮野地区',
      baseDensity: 6,
      satoyamaRatio: 0.78, // 北の里山バッファ
      mountainAdjacent: true,
      features: ['water'],
      adjacencies: [
        { to: 'ato', features: ['green-corridor'] },
        { to: 'niho', features: ['green-corridor'] },
        { to: 'ouchi', features: ['green-corridor'] },
        { to: 'center', features: ['water'] },
      ],
    },
    {
      id: 'niho',
      name: '仁保・小鯖地区',
      baseDensity: 7,
      satoyamaRatio: 0.82, // 北東里山・熊回廊
      mountainAdjacent: true,
      features: ['green-corridor', 'water'],
      adjacencies: [
        { to: 'ato', features: ['green-corridor'] },
        { to: 'tokuji', features: ['green-corridor'] },
        { to: 'miyano', features: ['green-corridor'] },
        { to: 'ouchi', features: ['green-corridor'] },
        { to: 'nanbu', features: ['green-corridor'] },
      ],
    },
    {
      id: 'ouchi',
      name: '大内地区',
      baseDensity: 5,
      satoyamaRatio: 0.62, // 北東の住宅・里山縁辺＝侵入の接点
      mountainAdjacent: true,
      features: ['green-corridor', 'trunk-road'],
      adjacencies: [
        { to: 'miyano', features: ['green-corridor'] },
        { to: 'niho', features: ['green-corridor'] },
        { to: 'center', features: ['trunk-road'] },
        { to: 'nanbu', features: ['trunk-road'] },
      ],
    },
    {
      id: 'yoshiki',
      name: '吉敷地区',
      baseDensity: 4,
      satoyamaRatio: 0.58, // 西の住宅・里山縁辺
      mountainAdjacent: true,
      features: ['green-corridor'],
      adjacencies: [
        { to: 'center', features: ['trunk-road'] },
        { to: 'ogori', features: ['trunk-road'] },
      ],
    },
    {
      id: 'center',
      name: '湯田・大殿地区',
      baseDensity: 3,
      satoyamaRatio: 0.42, // 旧山口の市街核。多地区と接するハブ
      mountainAdjacent: false,
      features: ['water', 'trunk-road'],
      adjacencies: [
        { to: 'miyano', features: ['water'] },
        { to: 'ouchi', features: ['trunk-road'] },
        { to: 'yoshiki', features: ['trunk-road'] },
        { to: 'ogori', features: ['trunk-road'] },
        { to: 'nanbu', features: ['water'] },
      ],
    },
    {
      id: 'ogori',
      name: '小郡地区',
      baseDensity: 2,
      satoyamaRatio: 0.4, // 新山口駅の交通市街
      mountainAdjacent: false,
      features: ['trunk-road'],
      adjacencies: [
        { to: 'center', features: ['trunk-road'] },
        { to: 'yoshiki', features: ['trunk-road'] },
        { to: 'nanbu', features: ['trunk-road'] },
      ],
    },
    {
      id: 'nanbu',
      name: '秋穂・嘉川地区',
      baseDensity: 3,
      satoyamaRatio: 0.55, // 干拓・沿岸平野＝後方の安全地帯
      mountainAdjacent: false,
      features: ['water'],
      adjacencies: [
        { to: 'niho', features: ['green-corridor'] },
        { to: 'ouchi', features: ['trunk-road'] },
        { to: 'center', features: ['water'] },
        { to: 'ogori', features: ['trunk-road'] },
        { to: 'ajisu', features: ['water'] },
      ],
    },
    {
      id: 'ajisu',
      name: '阿知須地区',
      baseDensity: 3,
      satoyamaRatio: 0.57, // 南西沿岸
      mountainAdjacent: false,
      features: ['water'],
      adjacencies: [{ to: 'nanbu', features: ['water'] }],
    },
  ],
}
