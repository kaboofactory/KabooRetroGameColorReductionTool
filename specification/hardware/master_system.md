# セガ・マスターシステム グラフィック仕様

## 1. 対象と目的

本書は、Sega Master System / Mark III の `Mode 4` に従った減色画像生成を行うための、実装直結仕様である。

このファイルでは次を満たすことを目的とする。

- SMSの色数、BG、Sprite制約に従った減色ができる
- BG palette line と sprite palette line を分けて扱える
- タイル属性、priority、flip、sprite制限を踏まえて最終画像を再構成できる
- 「これを知っておけば完全実装できる」レベルまで、内部データモデルと処理順を明示する

対象は `Mode 4` を前提とする。Mode 0-3 の TMS9918互換モードは対象外。

## 2. 出典

- Rodrigo Copetti `Sega Master System Architecture | A Practical Analysis`
- SMS Power `VDP Registers`
- Sega Master System technical specifications

URLは文末の「出典URL」にまとめる。

## 3. 実装対象としての前提

### 3.1 画面サイズ

- 標準表示解像度は `256x192`
- 後期VDPでは `256x224`, `256x240` もあるが、初版は `256x192` 固定でよい
- 1タイルは `8x8`
- 可視範囲は `32x24 tiles = 256x192`

### 3.2 レイヤ

描画上の主な要素は次の2つ。

- BG
- Sprite

Windowレイヤのような独立面はない。BGのタイル属性とSprite優先を組み合わせて見た目を作る。

### 3.3 ツールの責務

この減色ツールは少なくとも次を出力できる必要がある。

- 減色後BG画像
- BGタイルごとの palette line / priority / flip 情報
- 使用BGパレット一覧
- 使用Spriteパレット一覧
- Sprite候補の位置、サイズ、priority 情報
- 8 sprites/scanline 違反警告

## 4. 色仕様

### 4.1 色空間

Master System は `64 colors` を持ち、通常 `32 colors on-screen`。

Copetti と公開技術仕様に基づく理解として:

- 1色は `RGB222` 相当
- 各成分 `0..3`

したがって内部色表現は次でよい。

```js
type SmsColor = {
  r: number; // 0..3
  g: number; // 0..3
  b: number; // 0..3
};
```

### 4.2 CRAM

Copetti によると:

- CRAM は `2 palettes of 16 colours each`
- 各entryは `6 bits`
- 合計 `32 entries`

これは実装上、次の2本の palette line として扱える。

- BG palette line: 16 colors
- Sprite palette line: 16 colors

### 4.3 同時表示32色の意味

SMSでは「32 colors on-screen」と言っても、完全自由な32色ではなく:

- BG側で使う16色
- Sprite側で使う16色

の2組に分かれていると考えるのが実装しやすい。

減色ツールでは次を本制約として扱う。

- `bgPalette[16]`
- `spritePalette[16]`

### 4.4 backdrop / overscan color

SMS Power `VDP Registers` の Register `$07` によると、Mode 4 では backdrop/overscan color は sprite palette から選ばれる。

減色ツールでは内部的に少なくとも次を持つ。

- `backdropColorIndex`

初版ではこれを sprite palette 側の1色として扱えばよい。

## 5. タイル仕様

### 5.1 タイル基本構造

Copetti によると:

- Mode 4 は tile-based
- タイルは `8x8`
- 1タイルは `32 bytes`
- 1画素は `4 bits`

よって1タイルは `64 pixels x 4bpp = 256 bits = 32 bytes`。

### 5.2 タイル色番号

1画素は `0..15` の color index を持つ。

この color index は、そのタイルが使う palette line の中の1色を指す。

### 5.3 タイル格納数

Copetti によると、Character generator は `14 KB` で、標準構成では最大 `448 tiles` を置ける。

減色ツールでは初版で次を前提にするとよい。

- タイル総数上限は `448`

### 5.4 減色ツールでの内部表現

```js
type SmsTile = {
  pixels4bpp: Uint8Array; // 64 entries, 0..15
};
```

## 6. BG仕様

### 6.1 Screen map

Copetti によると:

- BGの screen map は `1.75 KB`
- `32x28 tiles = 896 entries`
- 可視なのは `32x24 = 768 entries`

この「画面より縦に大きい」構造でスクロールを成立させている。

### 6.2 BGエントリ属性

Copetti によると、各BG entry は2bytesで、少なくとも次を含む。

- tile index
- horizontal flip
- vertical flip
- priority bit
- colour palette used

減色ツールで重要なのは最後の2つ。

### 6.3 palette line の意味

Copetti の `the colour palette used` は、実装上は

- BG palette line
- Sprite palette line

のどちらを使うかではなく、Mode 4 の tile attribute に含まれる `palette select bit` として扱う必要がある。

この仕様を減色ツールでは次のように固定する。

- BGタイルは `paletteLine = 0 or 1` を持つ
- ただし通常のBGは主に BG側 palette line を使う
- 実装上は「タイルごとに使う16色集合を選べる」ではなく、「VDPが持つ2本の16色線のどちらを参照するか」として扱う

初版では可読性のため:

- `paletteLine 0 = BG palette`
- `paletteLine 1 = Sprite palette`

と明示してもよいが、BGがSprite palette lineを参照する実機挙動を完全に禁止するかどうかは初版方針で固定する必要がある。

### 6.4 初版実装方針

減色ツール初版では、混乱を避けるため BGは次で固定する。

- BGは `bgPalette[16]` を使う
- Spriteは `spritePalette[16]` を使う

つまり、実機の palette select bit を一般化しすぎず、まずは `BG 16色 + Sprite 16色` モデルとして成立させる。

必要なら後で「BGがsprite palette lineを使う高度モード」を追加する。

### 6.5 BG priority

Copetti によると BG tile entry には priority bit があり、tile の一部または全部を sprite より前に描ける。

減色ツールでは、タイル単位で次を保持する。

- `priority: boolean`

### 6.6 BG flip

各BG entry は:

- horizontal flip
- vertical flip

を持つ。

減色ツールでは、tile reuse 最適化のためにも保持すべき。

## 7. Sprite仕様

### 7.1 総数とサイズ

Copetti によると:

- Sprite総数は `64`
- サイズは `8x8` または `8x16`
- 1走査線最大 `8 sprites`

### 7.2 Sprite Attribute Table

Copetti と SMS Power によると:

- Sprite Attribute Table は `256 bytes`
- 64 sprites 分の属性を持つ

### 7.3 Sprite pattern base

SMS Power `Register $06` によると、sprite pattern generator table は `$0000` または `$2000` を基点にできる。

減色ツールでは内部的にタイルそのものを持てばよく、基底アドレスは書き出し時に解決すればよい。

### 7.4 Sprite優先

Copetti によると:

- 複数spritesが重なる場合、リストで先のものが前

減色ツールでは、少なくとも次を持つ。

- `satIndex`

### 7.5 Sprite palette

Spriteは `spritePalette[16]` を参照する。

初版では:

- 各sprite pixel の色番号は `0..15`
- 透明色の扱いは実装時に0番か別フラグで管理

とするのが扱いやすい。

注記:

- SMS資料では Sprite透明の厳密な扱いがNES/GBほど説明的ではない
- ツールでは「透明indexを1つ持つ」設計に固定したほうが実装は安定する

初版では `color index 0 transparent` として統一するのが現実的。

## 8. スクロール仕様

### 8.1 BG scroll

SMS Power `Register $08`, `$09` によると:

- `$08`: Background X Scroll
- `$09`: Background Y Scroll

ともに8bit値。

### 8.2 可視領域との関係

Copetti によると:

- screen map は画面より大きい
- 可視領域を選択して scroll する

静止画減色ツールの初版では:

- `scrollX = 0`
- `scrollY = 0`

の固定画面前提でよい。

## 9. 走査線制約

### 9.1 総数制約

- 全sprite総数 `64`

### 9.2 走査線制約

- 1走査線 `8 sprites`

### 9.3 実装への意味

sprite候補について、それぞれが覆うY範囲を調べ、各走査線ごとに個数を数える必要がある。

判定ルール:

- `8x8` -> 高さ8行
- `8x16` -> 高さ16行
- 1行に9個目以降は `drop` 扱い警告

### 9.4 警告

- `scanlineSpriteOverflow`
- `satSpriteOverflow`

を出す。

## 10. レンダリングとpriority

### 10.1 レイヤ合成

Copetti によると、最終画は BG と Sprite の2層を VDP が合成する。

減色ツールでは各ピクセルで:

1. BG pixel を求める
2. その位置の最前面sprite pixel を SAT順で求める
3. BG tile priority が false なら sprite 優先
4. BG tile priority が true なら BG 優先

といったモデルでよい。

### 10.2 左端マスク

Copetti は、横スクロールのゴミを隠すために左端8pxをマスクできると述べている。

減色ツール初版では必須ではないが、将来のプレビュー設定として有用。

## 11. Master System 減色ツールの完全実装ルール

### 11.1 データモデル

```js
type SmsColor = { r: number; g: number; b: number }; // 0..3

type SmsPaletteLine = [
  SmsColor, SmsColor, SmsColor, SmsColor,
  SmsColor, SmsColor, SmsColor, SmsColor,
  SmsColor, SmsColor, SmsColor, SmsColor,
  SmsColor, SmsColor, SmsColor, SmsColor
];

type SmsBgTileAssignment = {
  tileX: number;
  tileY: number;
  tileIndex: number;
  paletteLine: 0 | 1;
  priority: boolean;
  flipX: boolean;
  flipY: boolean;
  pixels4bpp: Uint8Array; // 64 entries, 0..15
};

type SmsSpriteCandidate = {
  satIndex: number;
  x: number;
  y: number;
  width: 8;
  height: 8 | 16;
  pixels4bpp: Uint8Array;
};
```

### 11.2 入力画像からの処理順

1. 入力画像を `256x192` 基準へ整える
2. 画像を `RGB222` に量子化する
3. `bgPalette[16]` と `spritePalette[16]` を最適化する
4. 画像を `8x8` タイルへ分割する
5. BGに置くタイルとSprite候補を分離する
6. BGタイルへ `priority / flip / tile reuse` を割り当てる
7. Sprite候補を `8x8` または `8x16` へまとめる
8. 1走査線8sprite制約と総数64制約を検査する
9. BG + Sprite を priority 付きで合成する

### 11.3 BG減色ルール

初版では BGは `bgPalette[16]` のみを使う。

よって:

- BGタイル1枚ごとの色番号は `0..15`
- 全BGタイルが同じ16色集合を共有

### 11.4 Sprite減色ルール

初版では Spriteは `spritePalette[16]` のみを使う。

よって:

- sprite画素は `0..15`
- 透明indexを1つ決める
- 全spriteが同じ16色集合を共有

### 11.5 最終合成ルール

各ピクセルで次を行う。

1. BG pixel の color index と priority を求める
2. その位置の最前面sprite pixel を SAT順で求める
3. sprite pixel が無ければ BG
4. BG priority = false なら sprite
5. BG priority = true なら BG

初版ではこのルールで十分。

## 12. 初版で割り切ってよい項目

初版では簡略化してよいもの:

- 224/240 line mode
- palette line をまたぐ高度利用
- mid-frame palette changes
- line interrupt を使ったラスターテクニック
- 左端マスクの厳密再現

ただし、以下は割り切ってはいけない。

- `RGB222`
- `32 colors on-screen`
- `BG 16色 + Sprite 16色` の分離
- `8x8 / 8x16` sprites
- `64 total / 8 per scanline`
- BG tile priority
- BG/Sprite の SAT順

## 13. ツールUIに必要な表示項目

- BG palette line
- Sprite palette line
- BGタイルごとの priority / flip オーバーレイ
- Sprite矩形オーバーレイ
- scanline overflow ヒートマップ
- `8x8 / 8x16` モード切替

## 14. 実装チェックリスト

以下を満たせれば、SMS向け減色実装は仕様的に成立している。

1. 入力画像を `RGB222` に量子化できる
2. BG palette 16色を生成できる
3. Sprite palette 16色を生成できる
4. BGタイルを `8x8 / 4bpp` で表現できる
5. BG entry の `priority / flip` を保持できる
6. Spriteを `8x8 / 8x16` で生成できる
7. SAT順の前後関係を再現できる
8. BG priority つきでBG/Spriteを合成できる
9. 1走査線8sprites制約を警告できる
10. 総sprite数64制約を警告できる
11. BG palette、Sprite palette、最終画を同時表示できる

## 15. 出典URL

- https://www.copetti.org/writings/consoles/master-system/
- https://www.smspower.org/Development/VDPRegisters
- https://en.wikipedia.org/wiki/Master_System
