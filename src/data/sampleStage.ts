/**
 * 開発用サンプルステージ（山口市を模した 4 地区）。
 * spec.md §4.5「囲まれた市街地」の構造を体現する：
 *   中心部（里山/市街比が極小・山林非隣接）を、里山地区が取り囲む。
 *
 * ⚠️ パラメータは暫定値。実データ（YPくまっぷ・国土数値情報）由来の値は
 *    データ整備パイプラインで後から差し替える（Step 3 以降）。
 */

import type { StageDef } from '@/types'

export const sampleStage: StageDef = {
  id: 'yamaguchi-city',
  name: '山口市',
  initialBudget: 1_000_000, // 100万円
  maxTurns: 14,
  districts: [
    {
      id: 'tokuji',
      name: '徳地地区',
      baseDensity: 8,
      satoyamaUrbanRatio: 9.0, // 里山が広い
      mountainAdjacent: true,
      features: ['green-corridor'],
      adjacencies: [
        { to: 'ato', features: ['green-corridor'] },
        { to: 'miyano', features: ['water'] },
      ],
    },
    {
      id: 'ato',
      name: '阿東地区',
      baseDensity: 9,
      satoyamaUrbanRatio: 8.0,
      mountainAdjacent: true,
      features: ['green-corridor', 'water'],
      adjacencies: [
        { to: 'tokuji', features: ['green-corridor'] },
        { to: 'miyano', features: ['green-corridor'] },
      ],
    },
    {
      id: 'miyano',
      name: '宮野地区',
      baseDensity: 6,
      satoyamaUrbanRatio: 4.0,
      mountainAdjacent: true,
      features: ['water'],
      adjacencies: [
        { to: 'tokuji', features: ['water'] },
        { to: 'ato', features: ['green-corridor'] },
        { to: 'center', features: ['trunk-road'] }, // 幹線道路で中心部への流入を抑制
      ],
    },
    {
      id: 'center',
      name: '中心部',
      baseDensity: 2,
      satoyamaUrbanRatio: 0.3, // 極小：決壊時に市街遭遇率がバースト
      mountainAdjacent: false, // 山林非隣接 → 第1項は 0
      features: [],
      adjacencies: [{ to: 'miyano', features: ['trunk-road'] }],
    },
  ],
}
