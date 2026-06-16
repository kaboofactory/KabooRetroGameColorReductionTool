# ゲームボーイカラー グラフィック仕様

## 1. 対象と目的

本書は、Game Boy Color の `CGB mode` に従った減色画像生成を行うための、実装直結仕様である。

このファイルでは次を満たすことを目的とする。

- CGBのBG/Window/OBJ制約に従った減色ができる
- BGパレットとOBJパレットを分離して生成できる
- タイルごとのパレット割り当てを正しく行える
- VRAM bank, tile attribute, OBJ priority を踏まえて最終画像を再構成できる
- 「これを知っておけば完全実装できる」レベルまで、内部データモデルと処理順を明示する

対象は `Game Boy Color 専用ソフト` または `CGB modeで動作するソフト` を前提とする。DMG互換モードは対象外。

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
- 可視画面はその `256x256` BGマップの一部を切り出して表示する

### 3.2 レイヤ

描画上の主な要素は次の3つ。

- BG
- Window
- OBJ

減色ツールとしては、まず BG と OBJ を中心に実装すればよい。Window は BGと同じタイルデータ・パレット体系を使うため、構造としてはBGと一体で扱える。

### 3.3 ツールの責務

この減色ツールは少なくとも次を出力できる必要がある。

- 減色後BG画像
- BGタイルごとの palette index
- 使用BGパレット一覧
- 使用OBJパレット一覧
- OBJ候補の位置、サイズ、パレット、priority 情報
- 10 sprites/scanline 違反警告

## 4. 色仕様

### 4.1 色空間

- Game Boy Color は `32768 colors (15-bit RGB)` を持つ
- 1色は `RGB555`
- 1成分は `0..31`

Pan Docs `Palettes` にあるとおり、パレットRAM上では各色は little-endian の `16bit` 値として保持される。

### 4.2 減色ツールの内部色表現

減色ツールの内部表現は次で固定する。

```js
type CgbColor = {
  r: number; // 0..31
  g: number; // 0..31
  b: number; // 0..31
};
```

### 4.3 PC画面での見え方

Pan Docs `Palettes` では、CGBの実機液晶上の色は sRGB モニタ上の見え方と一致しないと説明している。

重要点:

- 最大輝度でも真っ白には見えにくい
- 輝度特性は線形ではない
- 原色の混ざり方も sRGB と異なる

### 4.4 ツールの表示方針

減色ツールでは、色の内部制約と画面プレビューを分ける。

- 制約判定: `RGB555` の整数値で行う
- プレビュー: sRGB相当に変換して表示

将来的には次のプレビュー切替が望ましい。

- `raw RGB555 preview`
- `approximate CGB LCD preview`

初版では `raw RGB555 preview` で十分。

## 5. パレット仕様

### 5.1 BGパレット

Pan Docs `Specifications`, `Palettes` によると:

- BGパレット数は `8`
- 1パレットあたり `4 colors`
- 合計 `8 x 4 = 32` 色をBG側で保持できる

BG palette memory は `64 bytes`。

計算:

- `8 palettes`
- `4 colors`
- `2 bytes/color`

### 5.2 OBJパレット

- OBJパレット数は `8`
- 1パレットあたり `4 colors` 分記録される
- ただし `color 0` は常に透明なので、実効的には `3 visible colors + transparent`

OBJ palette memory も `64 bytes`。

### 5.3 BG/OBJの分離

BGとOBJのパレットRAMは完全に別領域である。

減色ツールでは次のように分けて保持する。

```js
type BgPalette = [CgbColor, CgbColor, CgbColor, CgbColor];
type ObjPalette = [CgbColor, CgbColor, CgbColor, CgbColor];

type CgbPaletteSet = {
  bg: [BgPalette, BgPalette, BgPalette, BgPalette, BgPalette, BgPalette, BgPalette, BgPalette];
  obj: [ObjPalette, ObjPalette, ObjPalette, ObjPalette, ObjPalette, ObjPalette, ObjPalette, ObjPalette];
};
```

### 5.4 実効色数の考え方

静止画変換上は、しばしば「GBCは56色同時表示」と説明される。

その根拠は:

- BG `8 x 4 = 32`
- OBJ `8 x 3 = 24` visible
- 合計 `56`

ただし、これは「パレットエントリ上限」であり、画面内で同じ色を複数パレットが共有してもよい。

減色ツールでは、同時色数よりも次の制約を本質として扱う。

- 各BGタイルは8個のBGパレットのどれか1つを使う
- 各OBJは8個のOBJパレットのどれか1つを使う
- OBJの色番号0は透明

## 6. タイルデータ仕様

### 6.1 VRAM Tile Data

Pan Docs `Tile Data` によると:

- タイルデータは `$8000-$97FF`
- 1タイルは `16 bytes`
- `8x8 pixels`
- `2 bits per pixel`
- 1画素の色番号は `0..3`

### 6.2 VRAM bank

CGB mode では VRAM は `16 KiB = 2 x 8 KiB`。

したがって:

- DMG相当の `384 tiles` が
- CGBでは `768 tiles` 相当になる

### 6.3 タイル番号付け

Pan Docs `Tile Data` の重要点:

- OBJは常に `$8000 addressing`
- BG/Windowは `LCDC.4` によって `$8000 method` / `$8800 method` を切り替える

### 6.4 `$8000 method`

- unsigned indexing
- tiles `0..127` は block 0
- tiles `128..255` は block 1

### 6.5 `$8800 method`

- signed indexing
- base pointer は `$9000`
- tile IDs `0..127` は block 2
- tile IDs `128..255` は block 1

### 6.6 減色ツールでの扱い

静止画減色ツールとしては、最終的に必要なのは「各タイルの2bppデータ」である。

したがって内部では、いったん tile ID のアドレッシング方式から切り離して

- `tileBitmap(8x8, 2bpp)`
- `tileBank(0 or 1)`

を保持すればよい。

書き出し時にのみ、`$8000` / `$8800` 方式へマッピングする。

## 7. BG / Window マップ仕様

### 7.1 タイルマップ本体

Pan Docs `Tile Maps` によると:

- BG/Window 用の tile map は2面
- `$9800-$9BFF`
- `$9C00-$9FFF`
- 各マップは `32x32 tiles`

### 7.2 可視範囲

- マップ全体は `256x256`
- 実際に表示されるのは `160x144`
- `SCX`, `SCY` で切り出し位置を指定する

### 7.3 BG Map Attributes

CGB mode では、VRAM Bank 1 に対応する属性マップがある。

各タイルエントリごとに1バイトの属性を持ち、bit構造は以下。

- bit 7: BG priority
- bit 6: Y flip
- bit 5: X flip
- bit 4: ignored
- bit 3: VRAM bank
- bit 0-2: BG palette number (`BGP0..7`)

### 7.4 BGパレット選択単位

ファミコンと違い、GBCでは BGパレット選択は `8x8 tile` 単位である。

これは減色ツールにとって非常に重要。

意味:

- 1タイルごとに独立に8個のBGパレットのどれかを選べる
- `16x16` 単位の属性縛りはない

### 7.5 BGパレット実装ルール

したがって、GBC減色では BG側は次の戦略になる。

1. 入力画像を `8x8` タイルへ分割
2. 各タイルで必要な色を集計
3. 全タイルが `8個のBGパレット x 4色` に収まるよう共有パレットを最適化
4. 各タイルへ最適なBGパレットを割り当てる

### 7.6 Window

Window は:

- BGと同じ tile data を共有
- BGと同じ BG palette 系を使う
- 別 tile map を使える
- スクロールしない

静止画減色ツールの初版では、Window を別レイヤ出力しない限り、BGと同じ仕様として扱えばよい。

## 8. OBJ仕様

### 8.1 総数とサイズ

Pan Docs `Specifications`, `OAM` によると:

- OBJは最大 `40`
- 1走査線に表示できるのは最大 `10`
- サイズは `8x8` または `8x16`

### 8.2 OAMエントリ

1OBJは4バイト。

1. Y position
2. X position
3. Tile index
4. Attributes

### 8.3 座標表現

Pan Docs `OAM` によると:

- 表示座標Yは `storedY - 16`
- 表示座標Xは `storedX - 8`

したがって内部モデルでは、ユーザー向けには正規化したスクリーン座標を持ち、書き出し時に加算するのがよい。

### 8.4 8x16 OBJ

8x16時は:

- tile index の最下位bitは無視
- 上半分は `NN & $FE`
- 下半分は `NN | $01`

つまり `1 obj = 縦2タイル`。

### 8.5 OBJ属性ビット

Pan Docs `OAM` によると:

- bit 7: Priority
- bit 6: Y flip
- bit 5: X flip
- bit 4: DMG palette (CGB modeでは無関係)
- bit 3: VRAM bank
- bit 0-2: CGB OBJ palette number (`OBP0..7`)

### 8.6 OBJパレット選択単位

OBJごとに、8個のOBJパレットのどれか1つを選ぶ。

## 9. 優先順位仕様

### 9.1 OBJ選抜優先

Pan Docs `OAM` によると、1走査線に10個を超えるOBJがあるとき、どれが残るかは OAM scan に依存する。

- OAMは先頭から順に走査される
- 条件に合う最初の10個だけがその走査線の候補になる

### 9.2 OBJ同士の前後

Pan Docs `OAM` によると、CGB mode では OBJ同士の優先順位は `OAM内の順序` のみで決まる。

- earlier object in OAM = higher priority

DMGの「X座標が小さいほうが優先」は CGB mode では使わない。

### 9.3 BG vs OBJ priority

Pan Docs `Tile Maps` と `OAM` の重要点:

BG/OBJ優先は3つの情報で決まる。

- BG map attribute bit 7
- LCDC bit 0
- OAM attribute bit 7

規則:

1. BG color index が `0` なら OBJが常に優先
2. それ以外で LCDC bit 0 = `0` なら OBJが優先
3. それ以外で BG attr bit 7 = `0` かつ OAM attr bit 7 = `0` なら OBJが優先
4. それ以外は BG が優先

### 9.4 減色ツールでの扱い

静止画減色では、各OBJ候補に少なくとも次を持たせる。

- `oamIndex`
- `paletteIndex`
- `priority`
- `vramBank`
- `flipH`
- `flipV`

最終合成では:

1. そのピクセル位置で最前面のOBJ画素を OAM順で求める
2. そのOBJ画素とBG画素の priority を比較する
3. Pan Docs のルールに従って可視画素を決める

## 10. スクロール仕様

### 10.1 BG viewport

Pan Docs `Scrolling` によると:

- `SCX`, `SCY` は `160x144` の可視領域の左上座標を `256x256` BGマップ上に指定する
- 値範囲は `0..255`
- wraparound する

### 10.2 実装への意味

静止画変換では通常:

- 可視画像そのものを扱う
- スクロール中の大きなBGマップは扱わない

ので、初版では `SCX=0, SCY=0` の1画面前提でよい。

将来的にBGマップ出力まで行うなら:

- 32x32タイルマップ
- 可視範囲160x144

を別に持つ必要がある。

## 11. LCDCで効く表示仕様

Pan Docs `LCD Control` に基づく、減色ツールで重要なLCDCビットは次。

- bit 6: Window tile map selection
- bit 5: Window enable
- bit 4: BG/Window tile data addressing mode
- bit 3: BG tile map selection
- bit 2: OBJ size `8x8 / 8x16`
- bit 1: OBJ enable
- bit 0: CGB mode では BG/Window master priority

静止画減色の初版で特に重要なのは:

- bit 4
- bit 2
- bit 0

## 12. レンダリングタイミングのうち、減色ツールに必要な部分

### 12.1 フレーム構造

Pan Docs `Rendering overview` によると:

- 1フレーム `154 scanlines`
- 可視走査線 `144`

### 12.2 メモリアクセス制約

PPU mode により VRAM, OAM, CGB palettes へのCPUアクセス可否が変わる。

静止画減色ツールではタイミング精密再現は不要だが、次は知っておくべき。

- Mode 2: OAM scan
- Mode 3: pixel drawing
- Mode 0: HBlank
- Mode 1: VBlank

### 12.3 実装への影響

このツールでは、タイミングそのものではなく構造上の制約として次を反映すればよい。

- 走査線ごとに OBJ候補は最大10
- BG/Window/OBJ priority は pixel単位で決まる
- tile fetch 単位は `8 pixels`

## 13. Game Boy Color 減色ツールの完全実装ルール

### 13.1 データモデル

```js
type CgbColor = { r: number; g: number; b: number }; // 0..31

type BgPalette = [CgbColor, CgbColor, CgbColor, CgbColor];
type ObjPalette = [CgbColor, CgbColor, CgbColor, CgbColor];

type BgTileAssignment = {
  tileX: number;
  tileY: number;
  paletteIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  vramBank: 0 | 1;
  flipX: boolean;
  flipY: boolean;
  priority: boolean;
  pixels2bpp: Uint8Array; // 64 entries, 0..3
};

type ObjCandidate = {
  oamIndex: number;
  x: number;
  y: number;
  width: 8;
  height: 8 | 16;
  paletteIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  vramBank: 0 | 1;
  flipX: boolean;
  flipY: boolean;
  priority: boolean;
  pixels2bpp: Uint8Array;
};
```

### 13.2 入力画像からの処理順

必ず次の順で行う。

1. 入力画像を `160x144` 基準へ整える
2. 画像を `RGB555` に量子化する
3. 画像を `8x8` タイルへ分割する
4. BG候補タイル群の色集合を集計する
5. `8 BG palettes x 4 colors` を最適化する
6. 各BGタイルへ palette index を割り当てる
7. BGで再現不能な領域をOBJ候補へ分離する
8. OBJ候補を `8x8` または `8x16` へまとめる
9. `8 OBJ palettes` を最適化する
10. 各OBJへ palette index, priority, bank を割り当てる
11. 1走査線10OBJ制限と総数40制限を検査する
12. BG + OBJ priority ルールでプレビューを合成する

### 13.3 BGパレット確定ルール

BGでは各 `8x8 tile` が単独で1つのパレットに属する。

各タイルについて:

- 使える色は最大4色
- 使うBGパレットは1つ

よって、ファミコンのような `16x16属性縛り` は不要。

### 13.4 OBJパレット確定ルール

OBJでは各OBJについて:

- 使える visible colors は最大3色
- 色番号0は透明
- 使うOBJパレットは1つ

したがって、OBJ候補タイルを作る際は:

- `transparent + 3 visible colors`

として評価すること。

### 13.5 VRAM bank の扱い

CGBでは BG tile attributes / OBJ attributes に VRAM bank がある。

減色ツールの内部的には:

- bank 0/1 に自由配置できるものとして保持
- 最適化時に bank を後から割り当てる

でよい。

静止画変換だけなら、最初は全て bank 0 に置いても成立する。

ただしタイル総数が増えたときに bank 1 が必要になる。

### 13.6 最終合成ルール

各ピクセルで次を行う。

1. BG/Window 側の color index と priority flag を求める
2. そのピクセル位置で最前面の non-zero OBJ pixel を OAM順で求める
3. BG color index = 0 なら OBJ優先
4. BG color index != 0 で LCDC.0 = 0 なら OBJ優先
5. BG color index != 0 で LCDC.0 = 1 の場合:
   BG attr bit 7 = 0 かつ OAM attr bit 7 = 0 なら OBJ優先
   それ以外は BG優先

### 13.7 制約検査

最低限次をチェックする。

- `bgPaletteOverflow`: BGパレット8組に収まらない
- `bgTileColorOverflow`: 1タイル4色超過
- `objPaletteOverflow`: OBJパレット8組に収まらない
- `objColorOverflow`: 1OBJあたり visible 3色超過
- `scanlineObjOverflow`: 1走査線10OBJ超過
- `oamObjOverflow`: 総OBJ数40超過

## 14. 初版で割り切ってよい項目

初版では簡略化してよいもの:

- mid-scanline register change
- exact mode timing penalties
- Window専用の個別最適化
- 実機液晶の非線形色再現
- DMAタイミング

ただし、以下は割り切ってはいけない。

- RGB555
- BG `8 x 4色`
- OBJ `8 x 3色 + transparent`
- BGのパレット選択が `8x8 tile` 単位
- OBJ `8x8 / 8x16`
- 40 OBJ / 10 per scanline
- CGB mode では OBJ同士の優先が OAM順
- BG attr bit 7 / LCDC.0 / OAM attr bit 7 のpriority関係

## 15. ツールUIに必要な表示項目

- BGパレット8組
- OBJパレット8組
- BGタイルごとの palette index オーバーレイ
- OBJ矩形オーバーレイ
- OBJ priority オーバーレイ
- scanline overflow ヒートマップ
- `8x8 / 8x16` モード切替
- `raw RGB555` / `approx CGB LCD` 表示切替

## 16. 実装チェックリスト

以下を満たせれば、GBC向け減色実装は仕様的に成立している。

1. 入力画像を `RGB555` に量子化できる
2. BGパレット `8 x 4色` を生成できる
3. 各 `8x8` BGタイルへ1つのパレットを割り当てられる
4. BG tile attributes を保持できる
5. OBJパレット `8組` を生成できる
6. 各OBJを `transparent + 3 visible colors` で評価できる
7. OBJを `8x8 / 8x16` で生成できる
8. OAM順優先を再現できる
9. BG/OBJ priority を Pan Docs の規則通りに合成できる
10. 1走査線10OBJ制約を警告できる
11. 総OBJ数40制約を警告できる
12. BGパレット、OBJパレット、最終画を同時表示できる

## 17. 出典URL

- https://gbdev.io/pandocs/Specifications.html
- https://gbdev.io/pandocs/Palettes.html
- https://gbdev.io/pandocs/Tile_Maps.html
- https://gbdev.io/pandocs/Tile_Data.html
- https://gbdev.io/pandocs/OAM.html
- https://gbdev.io/pandocs/LCDC.html
- https://gbdev.io/pandocs/Scrolling.html
- https://gbdev.io/pandocs/Rendering.html
