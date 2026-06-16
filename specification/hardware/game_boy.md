# ゲームボーイ グラフィック仕様

## 1. 対象と目的

本書は、初代Game Boy の `DMG mode` に従った減色画像生成を行うための、実装直結仕様である。

このファイルでは次を満たすことを目的とする。

- DMGの4階調制約に従った減色ができる
- BG/Window/OBJ のパレット構造を踏まえて最終画像を再構成できる
- `8x8 / 8x16` OBJ、`40 total / 10 per line` 制約、DMG特有の優先順位を正しく扱える
- 「これを知っておけば完全実装できる」レベルまで、内部データモデルと処理順を明示する

対象は `Original Game Boy` および `DMG compatibility mode` 相当の表示仕様である。CGB専用拡張は対象外。

## 2. 出典

- Pan Docs `Specifications`
- Pan Docs `Palettes`
- Pan Docs `Tile Maps`
- Pan Docs `Tile Data`
- Pan Docs `OAM`
- Pan Docs `LCD Control`
- Pan Docs `Scrolling`
- Pan Docs `Rendering overview`

URLは文末の「出典URL」にまとめる。

## 3. 実装対象としての前提

### 3.1 画面サイズ

- 可視解像度は `160x144`
- 1タイルは `8x8`
- BGマップは `32x32 tiles = 256x256 pixels`
- 可視画面は `256x256` BGマップから `160x144` を切り出す

### 3.2 レイヤ

描画要素は次の3つ。

- BG
- Window
- OBJ

減色ツール初版では、BGとWindowを同一のBG系レイヤとして扱って差し支えない。Windowは独立スクロールしないが、タイルデータとパレット体系はBGと同じである。

### 3.3 ツールの責務

この減色ツールは少なくとも次を出力できる必要がある。

- 減色後BG画像
- 使用BG階調マッピング
- 使用OBJ階調マッピング
- OBJ候補の位置、サイズ、パレット、priority 情報
- 10 sprites/scanline 違反警告

## 4. 色仕様

### 4.1 4階調

Pan Docs `Palettes` によると、DMGの基本色IDは `0..3` の4階調であり、対応は次。

- `0`: White
- `1`: Light gray
- `2`: Dark gray
- `3`: Black

### 4.2 実機表示色

Pan Docs `Specifications` では、DMGは `4 shades of green`、Pocketは `4 shades of gray` と整理されている。

減色ツールとして重要なのは:

- ハード制約としては `4階調`
- 見た目プリセットとしては `緑液晶風` と `中立グレー` を分ける

### 4.3 ツールの内部色表現

内部では次で十分。

```js
type DmgShade = 0 | 1 | 2 | 3;
```

RGBで持つ必要はない。入力画像からいったん輝度ベースで `0..3` へ量子化し、表示時に見た目プリセットへ変換する。

### 4.4 見た目プリセット

UIでは少なくとも次を持つとよい。

- `DMG green`
- `neutral gray`

重要:

- これは表示テーマであり、ハード制約とは別
- 実機制約判定は常に `0..3` の階調IDで行う

## 5. パレット仕様

### 5.1 BGP

Pan Docs `Palettes` によると、`FF47 BGP` は BG と Window の色インデックス `0..3` に対して、どの階調を割り当てるかを指定する。

言い換えると:

- BG/Windowは `1パレット x 4色`
- ただし「4色の自由選択」ではなく、「4階調の並べ替え」

### 5.2 OBP0 / OBP1

Pan Docs `Palettes` によると、`FF48-FF49 OBP0, OBP1` は OBJ用の2パレットを定義する。

重要点:

- OBJ palette は `2本`
- 各OBJ palette は `3 visible colors + transparent`
- color index 0 は transparent なので、OBP の下位2bitは無視される

### 5.3 減色ツールでのモデル化

内部保持は次でよい。

```js
type DmgBgPalette = [DmgShade, DmgShade, DmgShade, DmgShade];
type DmgObjPalette = [DmgShade, DmgShade, DmgShade, DmgShade]; // index 0 is transparent

type DmgPaletteSet = {
  bg: DmgBgPalette;
  obj0: DmgObjPalette;
  obj1: DmgObjPalette;
};
```

### 5.4 実効色数の考え方

DMGはしばしば「4色機」とまとめられるが、静止画変換では次の見方が正しい。

- BG/Windowは同時に4階調
- OBJは2パレット持てるが、各OBJはそのどちらか一方
- ただし各OBJで color 0 は透明

つまり、BGとOBJを完全独立にはできず、「4階調の中でBGとOBJをどう役割分担するか」が本質となる。

## 6. タイルデータ仕様

### 6.1 VRAM Tile Data

Pan Docs `Tile Data` によると:

- タイルデータは `$8000-$97FF`
- `384 tiles`
- 1タイル `16 bytes`
- `8x8 pixels`
- `2 bits per pixel`

### 6.2 1画素の色番号

各画素は `0..3` の color index を持つ。

重要点:

- BG/Windowでは 0..3 全て使用可
- OBJでは color 0 は透明

### 6.3 BG/Window の tile addressing

Pan Docs `Tile Data`, `LCD Control` によると:

- BG/Windowは `LCDC bit 4` により
  - `$8000 method` (unsigned)
  - `$8800 method` (signed)
  を切り替える

### 6.4 OBJ の tile addressing

- OBJは常に `$8000 addressing`
- unsigned indexing

### 6.5 減色ツールでの扱い

静止画変換では tile addressing の差よりも、最終的な `8x8 / 2bpp` タイル内容が重要。

したがって内部では:

- `tileBitmap(8x8, 2bpp)`

を保持し、書き出し時に tile ID と addressing mode を解決すればよい。

## 7. BG / Window マップ仕様

### 7.1 タイルマップ本体

Pan Docs `Tile Maps` によると:

- BG/Window用 tile map は2面
- `$9800-$9BFF`
- `$9C00-$9FFF`
- 各マップは `32x32 tiles`

### 7.2 可視範囲

- BGマップ全体は `256x256`
- 可視画面は `160x144`
- `SCX`, `SCY` で切り出す

### 7.3 DMGに属性マップはない

重要なGBCとの差分:

- DMGには `tileごとのBG palette attribute` は存在しない
- BG全体で使うパレットは `BGP 1本`

このため、BGの階調割り当てはタイル単位でも領域単位でもなく `画面全体で共通`。

### 7.4 BG減色実装ルール

DMG BGでは、画面全体で同じ4階調を使う。

したがって:

1. 入力画像全体を `4階調` へ量子化する
2. BGPでその `0..3` の見た目を並べ替える

で成立する。

GBCやファミコンのような「複数パレット共有最適化」は不要。

### 7.5 Window

Windowは:

- BGと同じ tile data / palette を使う
- scrollしない
- 別 tile map を使える
- `WX, WY` で位置を指定

静止画減色では、Window専用に分離しないなら BG系レイヤの一部としてまとめてよい。

## 8. OBJ仕様

### 8.1 総数とサイズ

Pan Docs `Specifications`, `OAM` によると:

- OBJ最大 `40`
- 1走査線最大 `10`
- サイズは `8x8` または `8x16`

### 8.2 OAMエントリ

1OBJは4バイト。

1. Y position
2. X position
3. Tile index
4. Attributes

### 8.3 座標表現

Pan Docs `OAM` によると:

- 表示Y = `storedY - 16`
- 表示X = `storedX - 8`

ユーザー向け内部座標は、正規化されたスクリーン座標で保持すべき。

### 8.4 8x16 OBJ

Pan Docs `OAM` によると:

- 8x16時、tile index の最下位bitは無視
- 上半分は `NN & $FE`
- 下半分は `NN | $01`

よって、`1 obj = 縦2タイル`。

### 8.5 OBJ属性ビット

Pan Docs `OAM` によると、DMGで重要なのは次。

- bit 7: Priority
- bit 6: Y flip
- bit 5: X flip
- bit 4: OBJ palette (`0 = OBP0`, `1 = OBP1`)

### 8.6 OBJパレット選択単位

各OBJは:

- `OBP0`
- `OBP1`

のどちらか一方を使う。

## 9. 優先順位仕様

### 9.1 走査線選抜優先

Pan Docs `OAM` によると:

- 各走査線でOAMを先頭から走査
- 条件に合う最初の10OBJだけが、その走査線で描画対象になる

### 9.2 OBJ同士の前後

DMGでは、Pan Docs `OAM` によると次で決まる。

- X座標が小さいOBJのほうが優先
- X座標が同じなら OAMで早いほうが優先

これは CGB mode と異なるので注意。

### 9.3 BG vs OBJ priority

Pan Docs `OAM` によると、OBJ attribute の priority bit は:

- `0`: OBJがBG/Window color indices 1–3 の前に出る
- `1`: BG/Window color indices 1–3 がOBJの前に出る

重要な例外:

- BG color index が `0` のときは、OBJが見える
- つまり BGの白だから常に前、ではなく、`BG color index` が本質

### 9.4 DMGの実際の合成手順

各ピクセルで次を行う。

1. その位置のBG/Window color index を求める
2. その位置に重なるOBJの中から、DMGの優先規則で最前面の non-zero OBJ pixel を決める
3. OBJ pixel が無ければBGを出す
4. OBJ priority bit = 0 なら OBJを出す
5. OBJ priority bit = 1 の場合:
   BG color index = 0 なら OBJを出す
   BG color index = 1..3 なら BGを出す

### 9.5 "BG over OBJ" の非直感的挙動

Pan Docs `OAM` にあるとおり、priority bit は OBJ同士の優先決定には使われない。

流れは:

1. まずOBJ同士で勝者を決める
2. その勝者OBJの priority bit を見て BG と比較する

そのため:

- 背後priorityのOBJが、前景priorityの別OBJをマスクする

ことがある。

## 10. スクロール仕様

### 10.1 BG viewport

Pan Docs `Scrolling` によると:

- `SCX`, `SCY` は `256x256` BGマップ上の `160x144` viewport の左上を指定
- `0..255`
- wraparound する

### 10.2 実装への意味

静止画減色では通常:

- 可視画像だけ扱う
- BG全体マップは扱わない

ので、初版では `SCX=0, SCY=0` の固定1画面としてよい。

## 11. LCDCで効く表示仕様

Pan Docs `LCD Control` に基づき、DMG減色ツールで重要なLCDCビットは次。

- bit 6: Window tile map selection
- bit 5: Window enable
- bit 4: BG/Window tile data addressing mode
- bit 3: BG tile map selection
- bit 2: OBJ size `8x8 / 8x16`
- bit 1: OBJ enable
- bit 0: BG/Window enable

### 11.1 LCDC.0 の意味

DMGでは:

- `LCDC.0 = 0` で BG/Window は白一色になり、Window enable も無視される
- OBJのみ表示可能

これはCGB modeの「master priority」と意味が違う。

### 11.2 減色ツールへの意味

初版では通常 `LCDC.0 = 1` 前提でよい。

ただし、OBJ-only preview を将来用意するならこのビット相当のモードがあると便利。

## 12. レンダリングタイミングのうち、減色ツールに必要な部分

### 12.1 フレーム構造

Pan Docs `Rendering overview` によると:

- 1フレーム `154 scanlines`
- 可視走査線 `144`
- 約 `59.7 fps`

### 12.2 PPU modes

- Mode 2: OAM scan
- Mode 3: Drawing pixels
- Mode 0: HBlank
- Mode 1: VBlank

静止画減色ツールではタイミング精密再現は不要。

### 12.3 実装への影響

構造上の制約として反映すべきもの:

- 1走査線最大10OBJ
- BG/Window/OBJ priority は pixel単位
- 8ピクセルタイル境界でフェッチが進む

## 13. Game Boy 減色ツールの完全実装ルール

### 13.1 データモデル

```js
type DmgShade = 0 | 1 | 2 | 3;

type DmgBgPalette = [DmgShade, DmgShade, DmgShade, DmgShade];
type DmgObjPalette = [DmgShade, DmgShade, DmgShade, DmgShade]; // color 0 transparent

type BgTileAssignment = {
  tileX: number;
  tileY: number;
  pixels2bpp: Uint8Array; // 64 entries, 0..3
};

type ObjCandidate = {
  oamIndex: number;
  x: number;
  y: number;
  width: 8;
  height: 8 | 16;
  paletteIndex: 0 | 1; // OBP0 or OBP1
  priority: boolean;
  flipX: boolean;
  flipY: boolean;
  pixels2bpp: Uint8Array;
};
```

### 13.2 入力画像からの処理順

1. 入力画像を `160x144` 基準へ整える
2. 画像を `4階調` へ量子化する
3. BG/Windowの全体を `1 x 4色` で表現する
4. BGで表現不能な前景候補をOBJ候補として抽出する
5. OBJ候補を `8x8` または `8x16` にまとめる
6. 各OBJを `OBP0` または `OBP1` へ割り当てる
7. 1走査線10OBJ制限と総数40OBJ制限を検査する
8. DMG priority ルールで最終画を合成する

### 13.3 BG減色ルール

BG側は常に `4階調固定`。

よって:

- GBCのような8パレット最適化は不要
- ファミコンのような属性領域制約も不要

DMGでのBG処理本体は「入力画像を4階調へどう落とすか」である。

### 13.4 OBJ減色ルール

各OBJについて:

- visible colors は最大3
- color 0 は透明
- パレットは `OBP0` か `OBP1`

したがって、OBJ抽出時には

- `transparent + 3 visible shades`

として評価すること。

### 13.5 最終合成ルール

各ピクセルで次を行う。

1. BG/Window の color index を求める
2. その位置の最前面OBJ pixel を DMG priority 規則で求める
3. OBJ pixel が無ければBGを出す
4. OBJ priority = front なら OBJを出す
5. OBJ priority = back の場合:
   BG color index = 0 なら OBJを出す
   BG color index = 1..3 なら BGを出す

### 13.6 制約検査

最低限次をチェックする。

- `bgShadeOverflow`: BGが4階調に収まらない
- `objPaletteOverflow`: 2OBJパレットで割り当て不能
- `objColorOverflow`: 1OBJあたり visible 3色超過
- `scanlineObjOverflow`: 1走査線10OBJ超過
- `oamObjOverflow`: 総OBJ数40超過

## 14. 初版で割り切ってよい項目

初版では簡略化してよいもの:

- mid-scanline LCDC変更
- exact mode timing
- Window専用の別最適化
- 実機液晶残像やコントラスト差

ただし、以下は割り切ってはいけない。

- BG `1 x 4色`
- OBJ `2 x 3色 + transparent`
- OBJ `8x8 / 8x16`
- 40 OBJ / 10 per scanline
- DMGでは OBJ同士の優先が `X座標優先 + 同値ならOAM順`
- OBJ priority bit の本当の挙動
- `LCDC.0 = 0` で BG/Window が消えること

## 15. ツールUIに必要な表示項目

- BGパレット `BGP`
- OBJパレット `OBP0`, `OBP1`
- OBJ矩形オーバーレイ
- OBJ priority オーバーレイ
- scanline overflow ヒートマップ
- `8x8 / 8x16` モード切替
- `DMG green` / `neutral gray` 表示切替

## 16. 実装チェックリスト

以下を満たせれば、DMG向け減色実装は仕様的に成立している。

1. 入力画像を `4階調` に量子化できる
2. BG/Window を `1 x 4色` として扱える
3. `BGP` の並べ替え表現を持てる
4. OBJを `transparent + 3 visible shades` として評価できる
5. `OBP0` と `OBP1` にOBJを割り当てられる
6. OBJを `8x8 / 8x16` で生成できる
7. DMGのOBJ同士優先を再現できる
8. BG/OBJ priority を正しく合成できる
9. 1走査線10OBJ制約を警告できる
10. 総OBJ数40制約を警告できる
11. BGパレット、OBJパレット、最終画を同時表示できる

## 17. 出典URL

- https://gbdev.io/pandocs/Specifications.html
- https://gbdev.io/pandocs/Palettes.html
- https://gbdev.io/pandocs/Tile_Maps.html
- https://gbdev.io/pandocs/Tile_Data.html
- https://gbdev.io/pandocs/OAM.html
- https://gbdev.io/pandocs/LCDC.html
- https://gbdev.io/pandocs/Scrolling.html
- https://gbdev.io/pandocs/Rendering.html
