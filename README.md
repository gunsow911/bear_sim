# 里山防衛対策本部（仮）

山口県の熊出没オープンデータ（県警「YPくまっぷ」等）を活用した、ターン制シミュレーションゲーム。
プレイヤーは対策本部長として地区ごとの「遭遇率」を管理し、棲み分けの本質を直感的に学ぶ。
詳細仕様は [`spec.md`](./spec.md) を参照。

## 技術スタック

- **React + TypeScript + Vite**
- **地図**: Leaflet + react-leaflet ＋ 地理院タイル（淡色地図）
- **状態管理**: Zustand
- **数理モデル**: フレームワーク非依存の純 TS モジュール（`src/engine`）
- **スタイル**: Tailwind CSS / アニメーション: Framer Motion
- **テスト**: Vitest

## ディレクトリ構成

```
src/
  types/      共有型定義（Stage / District / GameState 等, spec §3-§6）
  engine/     数理モデルの純関数（§4.3 里山 / §4.4 市街決壊）+ テスト
  data/       ステージ定義（暫定サンプル）
  store/      Zustand ゲームストア（ターン進行・リソース）
  components/  MapView ほか UI
  test/       テストセットアップ
```

## 開発コマンド

```bash
npm install      # 依存インストール
npm run dev      # 開発サーバ（Vite）
npm test         # Vitest 実行
npm run build    # 型チェック + 本番ビルド
npm run typecheck
```

## 実装状況（ロードマップ）

- [x] **Step 1 足場**: Vite/React/TS/Tailwind/Zustand/Vitest/react-leaflet 導入、型定義、エンジン骨格、地図基盤
- [x] **Step 2 ゲームエンジン**: §4 数理モデル（差し替え可能な RiskModel）・§5.2 対策・§5.3 遭遇判定・§6 勝敗をストアに統合（数値は仮）
- [ ] **Step 3 データ**: 実データ由来の `stages.json` / `districts.geojson`
- [ ] **Step 4 地図UI**: GeoJSON choropleth ＋ クリック選択
- [ ] **Step 5 ダッシュボード/フェーズUI**: 議題カード・対策コマンド・イベント・演出
- [ ] **Step 6 ステージ選択**: 全19市町
- [ ] **Step 7 仕上げ**: ビジュアル調整・デプロイ
