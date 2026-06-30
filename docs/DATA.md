# データ整備ガイド（地区境界 GeoJSON ＆ パラメータ）

地図に表示する**地区境界 GeoJSON** と、数理モデル用の**地区パラメータ**をどこから取得し、
どう加工してゲームに組み込むかをまとめる。

現状は `src/data/stages/yamaguchi/districtsGeo.ts` に【プレースホルダ】の仮ポリゴンが入っている。
下記の手順で実データに差し替えると、地図がそのまま実地図になる。

---

## 1. データ契約（この形を満たせば差し替え可能）

`src/data/stages/yamaguchi/districtsGeo.ts` がエクスポートする GeoJSON は次を満たすこと：

- `FeatureCollection`
- 各 `Feature.properties.districtId` が `src/data/stages/yamaguchi/stage.ts` の地区 id と一致
  （山口市サンプルなら `tokuji` / `ato` / `miyano` / `center`）
- 各 `Feature.properties.name` は表示名
- `geometry` は `Polygon` または `MultiPolygon`、座標は `[経度, 緯度]`（WGS84）

> パラメータ（生息密度・里山市街比など）は `stages/yamaguchi/stage.ts` 側に持つ。GeoJSON は境界だけでよい。

---

## 2. 境界データの入手先

### A. 市区町村まるごとの境界（19市町ステージの外形）
- **国土数値情報 行政区域データ N03**
  https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2024.html
  → ダウンロード画面で「山口県」を選択（GeoJSON 提供あり）
- もしくは **smartnews-smri/japan-topography**（GitHub・直リンクで取得可）
  https://github.com/smartnews-smri/japan-topography
  → `data/municipality/geojson/` 配下に都道府県別の市区町村 GeoJSON

### B. 市町を 3〜5 地区に分割する境界（本ゲームの「地区」）
山口市の「徳地/阿東/宮野/中心部」のような地区は、市区町村より細かい。次のいずれか：

- **旧市町村界（歴史的行政区域データセット）** ※合併前の町に対応
  https://geoshape.ex.nii.ac.jp/city/
  → 徳地地区＝旧徳地町、阿東地区＝旧阿東町 のように対応づけられる
- **e-Stat 小地域（国勢調査の境界）** ※大字・町丁目レベルで自由に束ねる
  https://www.e-stat.go.jp/gis
  → 宮野・中心部のような旧山口市内の分割に使う

> 実装方針：A で市町外形を、B で内部分割を取得し、QGIS 等で「地区」単位にディゾルブ（融合）して
> `districtId` を属性付与する。

---

## 3. 加工（簡略化）

ゲーム用途では高精度ポリゴンは不要。配信サイズ削減のため簡略化する。

```bash
# mapshaper（CLI）。-simplify で頂点を間引き、属性 districtId/name を残す
npx mapshaper input.geojson \
  -simplify 5% keep-shapes \
  -each 'districtId="tokuji", name="徳地地区"' \   # 地区ごとに付与
  -o format=geojson output.geojson
```

加工後の GeoJSON を `src/data/districtsGeo.ts` の `districtsGeo` に貼り付ける
（または `public/data/*.geojson` に置いて fetch する方式に変更してもよい）。

---

## 4. パラメータ（数理モデル用）

`sampleStage.ts` の各地区パラメータの算出元。いずれも【仮値】を実データ由来に置換できる。

| パラメータ | ソース | 算出方法の例 |
| :-- | :-- | :-- |
| baseDensity（ベース生息密度） | YPくまっぷ（県警 熊出没オープンデータ） | 過去N年の出没点を地区ポリゴンで集計し正規化 |
| satoyamaUrbanRatio（里山/市街比） | 国土数値情報 土地利用細分メッシュ | (森林+農地面積) / 宅地面積 |
| mountainAdjacent（山林隣接） | 国土数値情報（森林地域）と地区境界の重なり | 山林ポリゴンと接していれば true |
| 地区特徴（水系/グリーン回廊/幹線道路） | 国土数値情報（河川・鉄道・高速道路） | 境界線と各インフラの交差を判定 |

> baseDensity と「人間の介入」はプレイヤーには非表示（UIでマスキング）。
> 内部計算にのみ使うため、おおまかな相対値でよい。

---

## 5. 必要になったら依頼してほしいこと

実データ取り込みを進める場合、以下があると私（実装側）で組み込めます：

1. 対象ステージ（まずは1市町。例：山口市）
2. その市町の**地区分割の定義**（どの旧市町村／小地域を、どの地区 id に束ねるか）
3. 取得済みの GeoJSON ファイル（A/B のいずれか）。大きければ簡略化前でも可

上記をもらえれば、`districtsGeo.ts` と `sampleStage.ts` を実データで更新します。

---

## 6. 採用方針：山口市 × e-Stat 小地域（確定）

### 6.1 GeoJSON はどこで手に入るか
e-Stat は GeoJSON を直接配布していない。**Shapefile（または KML）でダウンロード → GeoJSON に変換**する。

**ダウンロード手順（e-Stat 境界データ）**
1. https://www.e-stat.go.jp/gis → 「**境界データダウンロード**」
2. 統計調査：**国勢調査** → 年次：**2020年（令和2年）**
3. 境界種別：**小地域（町丁・字等別）**
4. データ形式：**世界測地系緯度経度・Shape形式**（KML でも可）
5. 都道府県：**山口県** → 市区町村：**山口市（コード 35203）** をダウンロード
   - 取得ファイル例：`A002005212020DDSWC35203.zip`

**GeoJSON へ変換（属性は Shift_JIS なので encoding 指定が必須）**
```bash
unzip A002005212020DDSWC35203.zip -d yamaguchi
# 字名(S_NAME)などを文字化けさせないため encoding=shift_jis
npx mapshaper yamaguchi/*.shp encoding=shift_jis \
  -o format=geojson yamaguchi_koaza.geojson
```
この時点では「町丁・字」が数百ポリゴンある状態（＝まだ4地区になっていない）。

### 6.2 4地区へのディゾルブ（束ね）
小地域を `tokuji / ato / miyano / center` の4地区に融合する。各小地域の `S_NAME`（字名）や
`KEY_CODE` を見て、どの地区に属するかの**対応表**を決める。

```bash
# 例：district 属性を字名ベースで付与してから dissolve
npx mapshaper yamaguchi_koaza.geojson \
  -each 'district = (/^徳地/.test(S_NAME) ? "tokuji" : /^阿東|^地福|^生雲/.test(S_NAME) ? "ato" : /^宮野/.test(S_NAME) ? "miyano" : "center")' \
  -dissolve district copy-fields=district \
  -each 'districtId=district, name=({tokuji:"徳地地区",ato:"阿東地区",miyano:"宮野地区",center:"中心部"})[district]' \
  -simplify 8% keep-shapes \
  -o format=geojson src/data/yamaguchi.geojson
```
> 上の判定（正規表現）は暫定。実際の字名一覧を見て調整する。

### 6.3 必要な「対応表」
4地区へ束ねるルールが要る。次のいずれかで決められる：
- **旧市町村ベース**：徳地地区＝旧徳地町、阿東地区＝旧阿東町、残りを宮野/中心部に分割
- **字名リストベース**：`yamaguchi_koaza.geojson` の `S_NAME` 一覧から手で割り当て

→ zip をダウンロードして渡してもらえれば、字名一覧を抽出して対応表の素案を作成し、
  `src/data/districtsGeo.ts`（または `public/` 配置）へ反映できる。
