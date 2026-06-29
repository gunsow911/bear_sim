/**
 * 山口市ステージ。地区分割は e-Stat 小地域（国勢調査）由来。
 *   地区: 阿東 / 徳地 / 宮野 / 中心部 / 小郡 / 秋穂 / 阿知須（7地区）
 *   隣接トポロジは生成ジオメトリ（src/data/districtsGeo.ts）の共有境界から算出した実隣接。
 *
 * ⚠️ baseDensity / satoyamaRatio / mountainAdjacent / 地区特徴 は【仮値】。
 *    実データ（YPくまっぷ・土地利用統計）由来の値に差し替え予定（docs/DATA.md）。
 *    境界 GeoJSON とは districtId で対応する。
 */

import type { StageDef } from '@/types'

export const sampleStage: StageDef = {
  id: 'yamaguchi-city',
  name: '山口市',
  initialBudget: 1_000_000, // 100万円
  maxTurns: 14,
  districts: [
    {
      id: 'ato',
      name: '阿東地区',
      baseDensity: 9,
      satoyamaRatio: 0.90, // 北部山間、里山が広い
      mountainAdjacent: true,
      features: ['green-corridor'],
      adjacencies: [
        { to: 'tokuji', features: ['green-corridor'] },
        { to: 'center', features: ['green-corridor'] },
      ],
    },
    {
      id: 'tokuji',
      name: '徳地地区',
      baseDensity: 9,
      satoyamaRatio: 0.90, // 東部山間
      mountainAdjacent: true,
      features: ['green-corridor', 'water'],
      adjacencies: [
        { to: 'ato', features: ['green-corridor'] },
        { to: 'center', features: ['green-corridor'] },
      ],
    },
    {
      id: 'miyano',
      name: '宮野地区',
      baseDensity: 6,
      satoyamaRatio: 0.78, // 中心北の里山バッファ
      mountainAdjacent: true,
      features: ['water'],
      adjacencies: [{ to: 'center', features: ['water'] }],
    },
    {
      id: 'center',
      name: '中心部',
      baseDensity: 3,
      satoyamaRatio: 0.44, // 旧山口市の市街中心。全地区と接するハブ
      mountainAdjacent: false,
      features: [],
      adjacencies: [
        { to: 'ato', features: ['green-corridor'] },
        { to: 'tokuji', features: ['green-corridor'] },
        { to: 'miyano', features: ['water'] },
        { to: 'ogori', features: ['trunk-road'] },
        { to: 'akiho', features: ['water'] },
        { to: 'ajisu', features: ['trunk-road'] },
      ],
    },
    {
      id: 'ogori',
      name: '小郡地区',
      baseDensity: 2,
      satoyamaRatio: 0.41, // 新山口駅周辺の市街・交通要衝
      mountainAdjacent: false,
      features: ['trunk-road'],
      adjacencies: [{ to: 'center', features: ['trunk-road'] }],
    },
    {
      id: 'akiho',
      name: '秋穂地区',
      baseDensity: 3,
      satoyamaRatio: 0.60, // 南部沿岸
      mountainAdjacent: false,
      features: ['water'],
      adjacencies: [{ to: 'center', features: ['water'] }],
    },
    {
      id: 'ajisu',
      name: '阿知須地区',
      baseDensity: 3,
      satoyamaRatio: 0.57, // 南西沿岸
      mountainAdjacent: false,
      features: ['water'],
      adjacencies: [{ to: 'center', features: ['trunk-road'] }],
    },
  ],
}
