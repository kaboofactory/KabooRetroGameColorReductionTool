# ゲームギア グラフィック仕様

## 1. 対象と目的

本書は、Sega Game Gear の表示制約に従った減色画像生成を行うための、実装直結仕様である。

このファイルでは次を満たすことを目的とする。

- Game Gear の色数、BG、Sprite制約に従った減色ができる
- SMS派生として共通化できる部分と、Game Gear 固有差分を分けて実装できる
- `160x144` 可視画面、`4096 colors`, `32 colors on-screen`, `8 sprites per scanline` を踏まえて最終画像を再構成できる
- 「これを知っておけば完全実装できる」レベルまで、内部データモデルと処理順を明示する

対象は通常の Game Gear 表示モードを前提とする。TV TunerやMaster Gear Converterによる特殊表示は対象外。

## 2. 出典

- Game Gear technical specifications
- SMS Power `VDP Registers`
- Rodrigo Copetti `Sega Master System Architecture | A Practical Analysis`

Game Gear のVDPはSMS系であり、レジスタ構成やMode 4系の考え方は SMS をベースに読むのが妥当である。

URLは文末の「出典URL」にまとめる。

## 3. 実装対象としての前提

### 3.1 画面サイズ

- 可視解像度は `160x144`
- タイルサイズは `8x8`
- よって可視領域は `20x18 tiles`

### 3.2 SMSとの関係

Game Gear はハードウェアの多くを Master System から派生させている。

減色ツール実装上は、次の理解でよい。

- レイヤ構成は `BG + Sprite`
- タイルベース描画
- Sprite制限やVRAMレイアウトの基本構造はSMS系
- 大きな差分は `色空間` と `可視解像度`

### 3.3 ツールの責務

この減色ツールは少なくとも次を出力できる必要がある。

- 減色後BG画像
- BGタイルごとの priority / flip 情報
- 使用BGパレット一覧
- 使用Spriteパレット一覧
- Sprite候補の位置、サイズ、priority 情報
- 8 sprites/scanline 違反警告

## 4. 色仕様

### 4.1 色空間

Game Gear の技術仕様として広く確認できる値は次。

- `4096-color palette`
- `32 colors on-screen`

4096色であることから、実装上の内部色空間は `RGB444` として扱うのが自然。

```js
type GgColor = {
  r: number; // 0..15
  g: number; // 0..15
  b: number; // 0..15
};
```

### 4.2 同時表示32色の意味

SMSと同様、Game Gear も初版ツールでは次の形で扱うのが安定する。

- BG palette line: 16 colors
- Sprite palette line: 16 colors

つまり:

- `bgPalette[16]`
- `spritePalette[16]`

を別々に持つ。

### 4.3 backdrop / overscan color

SMS Power `VDP Registers` の `$07` は `SMS2 / GG` 系でも backdrop/overscan color の選択に関係する。

減色ツール内部では少なくとも次を持つ。

- `backdropColorIndex`

初版では sprite palette 側の1色として扱えばよい。

## 5. タイル仕様

### 5.1 タイル基本構造

Game Gear は SMS系 Mode 4 ベースとして、次のタイル仕様で扱う。

- タイルは `8x8`
- 1画素は `4 bits`
- 1タイルは `32 bytes`
- 1画素の色番号は `0..15`

### 5.2 タイル総数

SMS系VDPのVRAMは `16 KB`。SMSの標準構成では実用上 `最大448 tiles` を置く設計が一般的である。

Game Gear でも初版実装は同じ上限モデルで問題ない。

### 5.3 減色ツールでの内部表現

```js
type GgTile = {
  pixels4bpp: Uint8Array; // 64 entries, 0..15
};
```

## 6. BG仕様

### 6.1 BGの考え方

Game Gear のBGは SMS系と同じく、タイルマップをスクロールして表示する構造として扱う。

ただし、静止画減色ツール初版では、可視画面 `160x144` のみを直接扱えばよい。

### 6.2 BGタイル属性

SMS系資料に基づき、BG entry には少なくとも次を持たせる。

- tile index
- horizontal flip
- vertical flip
- priority bit
- palette line

### 6.3 初版実装方針

初版ではBGは次で固定する。

- BGは `bgPalette[16]` を使う
- タイルごとの palette line 切替は高度機能として保留

つまり、まずは `BG 16色共有` モデルとして成立させる。

### 6.4 BG priority

BG tile の priority bit は、Spriteより前に出すかどうかの判定に使う。

減色ツールではタイル単位で次を保持する。

- `priority: boolean`

### 6.5 BG flip

BG entry は:

- horizontal flip
- vertical flip

を持つ。

タイル再利用最適化に有効なので、内部でも保持すべき。

## 7. Sprite仕様

### 7.1 総数とサイズ

Game Gear は SMS系と同じ方針で次を採用する。

- Sprite総数 `64`
- サイズ `8x8` または `8x16`
- 1走査線最大 `8 sprites`

技術資料全体としても、Game Gear は SMS派生Sprite制約で扱うのが自然である。

### 7.2 Sprite Attribute Table

SMS Power `VDP Registers` の `$05` は `SMS2 / GG` を含む VDP種別で Sprite Attribute Table base を示している。

減色ツールでは、内部的に SAT の物理アドレスそのものよりも:

- sprite index
- x
- y
- tile index

を保持できればよい。

### 7.3 Sprite pattern base

SMS Power `Register $06` によると、`SMS2 / GG` 系でも sprite pattern generator base の概念がある。

減色ツールでは、実タイル内容を内部保持し、基底アドレスは書き出し時に解決する。

### 7.4 Sprite palette

初版では:

- Spriteは `spritePalette[16]` を使う
- 透明indexを1つ持つ

として設計するのが現実的。

### 7.5 Sprite優先

SMS系仕様として、重なったspriteは SAT順で早いものを前に出す。

減色ツールでは次を持つ。

- `satIndex`

## 8. スクロール仕様

### 8.1 X/Y scroll

SMS Power の `$08`, `$09` は `Background X Scroll`, `Background Y Scroll`。

Game Gear でも同系統として扱ってよい。

### 8.2 実装への意味

静止画減色ツールの初版では:

- `scrollX = 0`
- `scrollY = 0`

固定でよい。

将来、BGマップ全体出力をする場合にのみ拡張する。

## 9. 走査線制約

### 9.1 総数制約

- 全sprite総数 `64`

### 9.2 走査線制約

- 1走査線 `8 sprites`

### 9.3 実装への意味

各sprite候補のY範囲を調べ、各走査線で個数を数える。

判定ルール:

- `8x8` -> 高さ8行
- `8x16` -> 高さ16行
- 9個目以降は `drop` 扱い警告

### 9.4 警告

- `scanlineSpriteOverflow`
- `satSpriteOverflow`

を出す。

## 10. レンダリングとpriority

### 10.1 レイヤ合成

Game Gear でも最終画は BG と Sprite の2層で考えればよい。

各ピクセルで:

1. BG pixel を求める
2. その位置の最前面sprite pixel を SAT順で求める
3. BG priority が false なら sprite 優先
4. BG priority が true なら BG 優先

のモデルでよい。

### 10.2 左端マスク

SMS系の左端マスク挙動は将来の高度再現項目として持てるが、Game Gear初版では必須ではない。

## 11. Game Gear 減色ツールの完全実装ルール

### 11.1 データモデル

```js
type GgColor = { r: number; g: number; b: number }; // 0..15

type GgPaletteLine = [
  GgColor, GgColor, GgColor, GgColor,
  GgColor, GgColor, GgColor, GgColor,
  GgColor, GgColor, GgColor, GgColor,
  GgColor, GgColor, GgColor, GgColor
];

type GgBgTileAssignment = {
  tileX: number;
  tileY: number;
  tileIndex: number;
  priority: boolean;
  flipX: boolean;
  flipY: boolean;
  pixels4bpp: Uint8Array; // 64 entries, 0..15
};

type GgSpriteCandidate = {
  satIndex: number;
  x: number;
  y: number;
  width: 8;
  height: 8 | 16;
  pixels4bpp: Uint8Array;
};
```

### 11.2 入力画像からの処理順

1. 入力画像を `160x144` 基準へ整える
2. 画像を `RGB444` に量子化する
3. `bgPalette[16]` と `spritePalette[16]` を最適化する
4. 画像を `8x8` タイルへ分割する
5. BGに置くタイルとSprite候補を分離する
6. BGタイルへ `priority / flip / tile reuse` を割り当てる
7. Sprite候補を `8x8` または `8x16` にまとめる
8. 1走査線8sprite制約と総数64制約を検査する
9. BG + Sprite を priority付きで合成する

### 11.3 BG減色ルール

初版では BG は `bgPalette[16]` のみを使う。

よって:

- BGタイル1枚ごとの色番号は `0..15`
- 全BGタイルが同じ16色集合を共有

### 11.4 Sprite減色ルール

初版では Sprite は `spritePalette[16]` のみを使う。

よって:

- Sprite画素は `0..15`
- 透明indexを1つ決める
- 全Spriteが同じ16色集合を共有

### 11.5 最終合成ルール

各ピクセルで次を行う。

1. BG pixel の color index と priority を求める
2. その位置の最前面sprite pixel を SAT順で求める
3. sprite pixel が無ければ BG
4. BG priority = false なら sprite
5. BG priority = true なら BG

## 12. 初版で割り切ってよい項目

初版では簡略化してよいもの:

- SMS互換表示の厳密再現
- palette line をまたぐ高度利用
- line interrupt を使ったラスターテクニック
- 左端マスクの厳密再現

ただし、以下は割り切ってはいけない。

- `160x144`
- `RGB444`
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

以下を満たせれば、Game Gear向け減色実装は仕様的に成立している。

1. 入力画像を `RGB444` に量子化できる
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

- https://en.wikipedia.org/wiki/Game_Gear
- https://www.smspower.org/Development/VDPRegisters
- https://www.copetti.org/writings/consoles/master-system/
