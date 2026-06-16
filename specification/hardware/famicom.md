# ファミリーコンピュータ グラフィック仕様

## 1. 対象と目的

本書は、ファミリーコンピュータ / NES 相当のPPU制約に従った減色画像生成を行うための、実装直結仕様である。

このファイルでは次を満たすことを目的とする。

- BG減色を実機制約どおりに行える
- スプライト候補を実機制約どおりに抽出できる
- BGパレット、スプライトパレット、属性領域、スプライト優先順位まで踏まえて最終画像を再構成できる
- 「ここまで読めば減色ツールを完全実装できる」レベルまで、実装上の判断基準を明示する

対象は主に通常の家庭用 `2C02` 系PPUを前提とする。VS. System や RGB PPU は初版対象外とする。

## 2. 出典

- NESdev Wiki `PPU palettes`
- NESdev Wiki `PPU attribute tables`
- NESdev Wiki `PPU OAM`
- NESdev Wiki `PPU pattern tables`
- NESdev Wiki `PPU nametables`
- NESdev Wiki `PPU rendering`
- NESdev Wiki `PPU scrolling`
- NESdev Wiki `PPU registers`
- NESdev Wiki `Sprite size`
- NESdev Wiki `PPU sprite priority`
- NESdev Wiki `CHR ROM vs. CHR RAM`
- NESdev Wiki `Sprite overflow games`

URLは文末の「出典URL」にまとめる。

## 3. 実装対象としての前提

### 3.1 画面サイズ

- 1ネームテーブルは `256x240` ピクセル
- 可視画面も通常 `256x240` として扱う
- 1タイルは `8x8`
- よって1画面は `32x30` タイル

### 3.2 レイヤ

描画上は次の2レイヤを持つ。

- BG
- Sprite

ファミコンでは、この2レイヤを単純合成するのではなく、以下が効く。

- BG側の属性領域ごとのパレット制約
- スプライトごとのパレット制約
- スプライト同士のOAM順優先
- 各スプライトの「BGの前/後」優先ビット
- 1走査線あたり8スプライト制限

### 3.3 ツールの責務

この減色ツールは次を出力できる必要がある。

- 減色後BG画像
- BG属性領域ごとのパレット割り当て
- 使用BGパレット一覧
- 使用スプライトパレット一覧
- スプライト候補の位置、サイズ、パレット、優先情報
- 8スプライト/走査線違反の警告
- 属性衝突の警告

## 4. 色仕様

### 4.1 マスターパレット

- PPUのパレットRAM内の1バイトは `6bit` の色値で、`64` 通りの出力を参照する
- NESの色は RGB 直値ではなく、複合映像信号の色相・輝度系で定義される
- `2C02` は RGB を直接生成していないので、PC上でのプレビューには `64 -> RGB` の変換テーブルが必要

### 4.2 色コードの意味

NESdev では色値を `VVHHHH` と説明している。

- `VV`: 輝度
- `HHHH`: 色相

補足事項:

- 標準的な黒コードは `$0F`
- `$0D` は "blacker than black" 信号になるため非推奨
- 実機表示色はテレビやデコーダ差で揺れるので、唯一の絶対RGBは存在しない

### 4.3 ツールでのRGB扱い

減色ツールでは、実機色をプレビューするために `64色の固定RGBテーブル` を持つ必要がある。

方針:

- 初版では `2C02` 向けの代表RGBテーブルを1つ採用する
- 内部比較はそのRGB値で行う
- 将来的に `palette preset` を差し替え可能にする

最低限必要なUI:

- `2C02 standard`
- 必要なら `alt composite` を後で追加

### 4.4 実機上の同時色数の考え方

実装上の重要点は次。

- BGは `4パレット x 4色` を持つ
- Spriteも `4パレット x 4色` を持つ
- ただし各パレットの色0には特殊性がある
- BGの色0は実質 `universal background color`
- Spriteの色0は透明

結果として、単純に `32色同時表示` と考えるのは誤りである。

減色ツールでは、同時色数ではなく次を本制約として扱う。

- BG側: `共通色1 + 4つの3色サブパレット`
- Sprite側: `4つの3色サブパレット + 透明`

## 5. BGパレット仕様

### 5.1 パレットRAM構造

NESdev `PPU palettes` にあるとおり、背景4パレットは `$3F00-$3F0F` に相当する構造を持つ。

- BG palette 0: entries `0,1,2,3`
- BG palette 1: entries `0,1,2,3`
- BG palette 2: entries `0,1,2,3`
- BG palette 3: entries `0,1,2,3`

ただし:

- palette 0 の entry 0 は backdrop color
- 各パレットの entry 0 は共有的に扱われる

### 5.2 universal background color

BGでは各サブパレットの色0が独立ではなく、実質1つの共通背景色になる。

減色ツールでは、BG側は次の形でモデル化すること。

- `bgUniversalColor`
- `bgSubPalettes[4][3]`

つまり、UI表示では `4x4色` に見せてもよいが、内部的には

- 共通1色
- 各BGパレット固有3色

として保持すること。

### 5.3 BGで実際に使える色

1つの背景画素は次のどちらかになる。

- 色番号0 -> universal background color
- 色番号1〜3 -> その属性領域に割り当てられたBGサブパレットの固有色

よって、任意の `16x16` 属性領域の中でBGが使える色は最大4色である。

### 5.4 BGパレット実装ルール

減色ツールでは、BGパレット確定を次の順で行う。

1. 画像全体から共通背景色候補を1色選ぶ
2. 画像を `16x16` 属性領域へ分割する
3. 各属性領域に必要な色集合を集計する
4. 全属性領域が、`4個のBGサブパレット` のいずれか1つへ割り当たるよう最適化する
5. その領域で4色に収まらない画素をスプライト候補へ逃がす

重要:

- BGを最初に「全体4色」へ減らしてはいけない
- まず `共通色 + 4サブパレット` を作り、それを属性領域へ割り当てる

## 6. BGタイルと属性領域

### 6.1 ネームテーブル構造

1ネームテーブルは `1024 bytes`。

内訳:

- `960 bytes`: `32x30` タイルのタイル番号
- `64 bytes`: 属性テーブル

ピクセル換算では `256x240`。

### 6.2 タイル単位

BGタイルは `8x8`。

ただし、パレット選択単位は `8x8` ではない。

### 6.3 属性領域単位

属性テーブルは、`16x16` 領域ごとにどのBGパレットを使うかを決める。

これは次を意味する。

- 4つの `8x8` タイル
- すなわち `2x2` タイルのまとまり

が、同じBGサブパレットを共有する。

### 6.4 属性バイトの担当範囲

属性テーブルの1バイトは、`32x32` ピクセル領域を担当する。

その中の4つの `16x16` 領域に対して、それぞれ2bitずつ持つ。

つまり1属性バイトは:

- 左上 `16x16`
- 右上 `16x16`
- 左下 `16x16`
- 右下 `16x16`

の4象限に対してパレット番号 `0..3` を持つ。

### 6.5 実装に必要な変換

座標 `(x, y)` にあるBG画素について、属性領域は次で求める。

- tileX = `floor(x / 8)`
- tileY = `floor(y / 8)`
- attrBlockX = `floor(tileX / 2)`
- attrBlockY = `floor(tileY / 2)`

つまり `16x16` 領域単位。

### 6.6 減色ツールの重要ルール

ファミコンでは、ある `8x8` タイルだけが4色以内でも不十分である。

判定単位は `16x16`。

そのため次のような失敗実装は不可。

- 各 `8x8` タイルを独立に4色化する
- 各 `8x8` タイルに自由にパレットを割り当てる

正しい実装は:

- まず `16x16` ごとに色要求をまとめる
- その領域単位でBGパレットを選ぶ

## 7. CHR / タイルデータ仕様

### 7.1 パターンテーブル

パターンテーブルは BG と Sprite の形状データを保持する領域である。

- 全体アドレス空間: `$0000-$1FFF`
- 2つの `256 tile` セクションに分かれる
- 左半分: `$0000-$0FFF`
- 右半分: `$1000-$1FFF`

### 7.2 1タイルの構造

1タイルは `16 bytes`。

- 前半8バイト: bitplane 0
- 後半8バイト: bitplane 1

1画素の色番号は2bitで決まり、値は `0..3`。

- 0: 背景/透明
- 1: palette color 1
- 2: palette color 2
- 3: palette color 3

### 7.3 BGとSpriteの差

色番号0の意味はレイヤによって異なる。

- BG: universal background color
- Sprite: 透明

これが、同じCHR形状でも BG と Sprite で見え方が変わる理由である。

### 7.4 BG用/スプライト用パターンテーブル選択

PPUCTRLで:

- bit 4: BG用パターンテーブル
- bit 3: `8x8` スプライト用パターンテーブル

を選ぶ。

ただし `8x16` スプライト時は例外がある。

## 8. スプライト仕様

### 8.1 OAM全体

OAMには最大 `64 sprites` を定義できる。

1スプライトあたり4バイト:

1. Y座標
2. タイル番号
3. 属性
4. X座標

### 8.2 スプライトサイズ

スプライトサイズはPPUCTRL bit 5で全体一括指定。

- `0`: `8x8`
- `1`: `8x16`

1枚ずつ別サイズにはできない。

### 8.3 8x8 スプライト

- タイル番号は1タイルを直接指す
- 使うパターンテーブルは PPUCTRL bit 3

### 8.4 8x16 スプライト

8x16では:

- PPUCTRL bit 3 は無視される
- タイル番号の bit 0 が、どちらの pattern table を使うかを決める
- タイル番号の上位7bitが上側タイル番号を決める
- 下半分は次のタイルになる

よって、8x16のスプライトをタイル資産へ変換する場合は、`1 sprite = 縦2タイル` として扱う必要がある。

### 8.5 スプライトパレット

スプライトは `4パレット` を持つ。

属性 byte の bit 0-1 が `palette 4..7` を選ぶとNESdevは説明しているが、減色ツールでは「スプライト4パレット」として扱えばよい。

内部保持は次の形にする。

- `spritePalettes[4][3]`

理由:

- スプライトの色番号0は常に透明
- 実際に見える固有色は各パレット3色

### 8.6 スプライト属性ビット

attribute byte:

- bit 0-1: パレット番号
- bit 5: BGより前か後か
- bit 6: 水平反転
- bit 7: 垂直反転

bit 2-4 は未実装。

### 8.7 Y座標の注意

OAMのYは、描画上の見た目座標と1行ずれる。

NESdev では「表示位置の上端」「描画は1走査線遅延」と説明している。

減色ツールでは、ユーザーに見せる座標は通常のスクリーン座標に正規化してよいが、エクスポート等でOAM相当を出すなら元仕様に戻す必要がある。

### 8.8 上端へのはみ出し

ファミコンではスプライトを画面上端へ半分だけ出すことはできない。

NESdev `PPU OAM` と `Sprite size` の注意は、ツールでも重要。

したがって:

- 画面最上部に一部だけ出るスプライト表現はそのまま再現できない
- 必要ならBGへ戻すか、画面内に完全に入るよう再配置する

## 9. スプライト数制約

### 9.1 総数制約

- OAM全体で `64 sprites`

### 9.2 走査線制約

- 1走査線に描画されるスプライトは最大 `8`

これは実装で最重要の一つ。

### 9.3 走査線制約の本当の意味

PPUは各可視走査線で、次の走査線にかかるスプライトをOAM先頭から順に探し、最大8個だけ secondary OAM へコピーする。

意味:

- 優先されるのは `OAM index が小さいもの`
- 9個目以降はその走査線では描画されない
- 単純な「面積が小さいもの優先」ではない

### 9.4 減色ツールでの判定

ツールは各スプライト候補について、カバーするY範囲を調べ、各走査線の占有数を数える。

判定ルール:

- `8x8`: 高さ8行
- `8x16`: 高さ16行
- 各走査線で出現順を OAM 順候補で数える
- 9個目以降は `drop` 扱い警告

### 9.5 実装で持つべき警告

- `scanlineSpriteOverflow`
- `oamSpriteOverflow`
- `attributeConflict`

## 10. スプライト優先順位

### 10.1 スプライト同士

重なったとき、前に出るのは `OAM index が小さいスプライト`。

### 10.2 スプライトとBG

単純な3層構造ではない。

実際には:

1. まずスプライト群の中で、最前面の不透明ピクセルが決まる
2. そのスプライトピクセルの priority bit を見る
3. priority bit が front、または BGピクセルが透明ならスプライトが見える
4. priority bit が back かつ BGピクセルが不透明ならBGが見える

重要:

- 「後ろ優先スプライト」が前優先スプライトを覆い、その上でBGを見せることがある
- つまり priority bit はスプライト間の順序ではなく、`勝ち残ったスプライト画素とBGの比較` に使う

### 10.3 減色ツールでの扱い

スプライト候補を生成する際は、各候補に少なくとも次を持たせる。

- `oamIndex`
- `bgPriority` (`front` / `back`)
- `paletteIndex`
- `flipH`
- `flipV`

## 11. Sprite 0 Hit と sprite overflow flag

### 11.1 Sprite 0 Hit

sprite 0 の不透明画素と BG の不透明画素が重なると `sprite 0 hit` が立つ。

これは主にゲーム側の分割スクロール制御に使う。

減色ツールとしては、通常の静止画生成に必須ではない。

ただし、将来「実機向けUI配置」まで見るなら重要になる。

### 11.2 Sprite overflow flag

PPUSTATUS の overflow flag は「8個を超えたら正確に立つ」信号ではなく、既知のバグを含む。

NESdev でも、ちょうど8個のケースなどでバグがあることが説明されている。

減色ツールでは、実機フラグを模倣する必要はない。

代わりに、論理的に

- その走査線に9個以上いるか

を数えて警告すればよい。

## 12. スクロールとネームテーブル配置

### 12.1 論理ネームテーブル

PPUアドレス空間上ではネームテーブルは4面ある。

- `$2000`
- `$2400`
- `$2800`
- `$2C00`

2x2配置で並ぶ。

### 12.2 物理VRAM制約

本体側CIRAMは `2 KiB` しかないため、通常は4論理面を4枚独立には持てない。

カートリッジのミラーリングにより、論理ネームテーブルのどれが同じ実メモリを共有するかが決まる。

### 12.3 減色ツールに必要か

静止画1枚を減色するだけなら、通常は `1 screen = 1 nametable` として十分である。

ただし、将来マップ生成やスクロール背景出力まで行うなら、次の概念が必要になる。

- horizontal mirroring
- vertical mirroring
- single-screen mirroring

### 12.4 今回の初版での扱い

初版の静止画減色ツールでは:

- 1画面 `256x240`
- 1ネームテーブル前提

でよい。

## 13. PPUタイミングのうち、減色ツールに必要な部分

### 13.1 NTSC PPU基礎

- 1フレーム `262 scanlines`
- 1走査線 `341 PPU cycles`

### 13.2 BGフェッチ単位

BGは各タイルについて次の4回のフェッチを行う。

1. nametable byte
2. attribute byte
3. pattern low
4. pattern high

この構造のため、BGは `8ピクセル単位` で同じ属性情報を使う。

### 13.3 実装への影響

このツールでタイミング精度そのものを再現する必要はない。

ただし、次の構造はそのまま制約へ直結する。

- BGピクセルは tile pattern + attribute + palette で決まる
- Spriteピクセルは sprite pattern + attribute + OAM priority で決まる

## 14. 左端8ピクセルの扱い

PPUMASKには

- 左端8ピクセルのBG表示
- 左端8ピクセルのsprite表示

の個別ON/OFFがある。

静止画減色ツールでは、通常は両方ON前提でよい。

ただし、将来「実機HUD再現」や「status barの隠しテクニック」まで扱うなら、この設定が必要になる。

初版では補助設定としては持たなくてよい。

## 15. CHR-ROM と CHR-RAM

### 15.1 実機差

カートリッジに載るCHRは:

- CHR-ROM
- CHR-RAM

のどちらもありうる。

### 15.2 減色ツールへの意味

静止画減色では、最終的に必要なのは「どの8x8パターンを使うか」であり、ROMかRAMかは本質ではない。

ただし、書き出し先を考えるなら重要。

- CHR-ROM想定: 既存タイル前提、差し替えやバンク切替前提
- CHR-RAM想定: ツールが生成したタイルをロードして使う前提

### 15.3 初版の方針

初版では `CHR source independent` とし、単に

- 背景タイル集合
- スプライトタイル集合

を出力できればよい。

## 16. ファミコン減色ツールの完全実装ルール

ここが実装の本体である。

### 16.1 データモデル

最低限次を持つこと。

```js
type NesColor = number; // 0x00-0x3F

type BgSubPalette = [NesColor, NesColor, NesColor];
type SpriteSubPalette = [NesColor, NesColor, NesColor];

type BgPaletteSet = {
  universalColor: NesColor,
  subPalettes: [BgSubPalette, BgSubPalette, BgSubPalette, BgSubPalette]
};

type AttributeCell = {
  x: number; // 16x16 cell index
  y: number;
  paletteIndex: 0 | 1 | 2 | 3;
};

type BgTile = {
  tileX: number;
  tileY: number;
  pixels2bpp: Uint8Array; // 64 entries, 0..3
  attributePaletteIndex: 0 | 1 | 2 | 3;
};

type SpriteCandidate = {
  oamIndex: number;
  x: number;
  y: number;
  width: 8;
  height: 8 | 16;
  paletteIndex: 0 | 1 | 2 | 3;
  priority: "front" | "back";
  flipH: boolean;
  flipV: boolean;
  pixels2bpp: Uint8Array;
};
```

### 16.2 入力画像からの処理順

必ず次の順で行う。

1. 入力画像を `256x240` 基準へ整える
2. 64色RGBテーブルへ最近傍量子化する
3. universal background color 候補を決める
4. 画像を `16x16` 属性領域へ分割する
5. 属性領域ごとの色要求を集計する
6. 4個のBGサブパレットを最適化する
7. 各属性領域へBGサブパレットを割り当てる
8. BGで再現不能な画素をスプライト候補へ抽出する
9. スプライトを `8x8` または `8x16` にまとめる
10. スプライトパレット4組へ割り当てる
11. 走査線8制限と総数64制限を検査する
12. OAM順を決める
13. BG + Sprite を優先ルールつきで合成してプレビューする

### 16.3 BGパレット確定アルゴリズム要件

BG側は次を必ず守る。

- 各属性領域は `universalColor + subPalette[3色]` の計4色以内
- 属性領域に割り当てられるサブパレットは1つだけ
- 1属性領域の4つの8x8タイルは同じサブパレットを共有

### 16.4 スプライト抽出ルール

BGで再現できない画素について、次のどちらかで候補化する。

- 8x8 sprite
- 8x16 sprite

スプライト化の優先候補:

- 属性領域制約のせいでBGへ入らない高コントラスト部分
- キャラクターや前景物として分離しやすい連結領域

### 16.5 スプライト合成ルール

最終プレビューでは各ピクセルで次を行う。

1. その座標のBG色番号を求める
2. その座標に重なるスプライトを OAM順で調べる
3. 最初に見つかった不透明スプライト画素を sprite winner にする
4. sprite winner が無ければBGを出す
5. sprite winner が front なら sprite を出す
6. sprite winner が back の場合:
   BGが色番号0なら sprite を出す
   BGが色番号1..3なら BGを出す

### 16.6 走査線制約の適用

プレビューには2モード用意するのが望ましい。

- `ideal preview`: 走査線制約を無視して全部表示
- `hardware preview`: OAM順に8個までしか表示しない

理由:

- アート確認とハード制約確認を分けられる

### 16.7 警告

最低限次を警告できること。

- 属性領域内でBG色数が4色を超える
- BGサブパレット4個では割り当て不能
- スプライトパレット4個では割り当て不能
- スプライト総数64超過
- 任意走査線でスプライト8超過
- 上端に部分表示できないスプライト配置

## 17. 初版で割り切ってよい項目

完全実装レベルで重要だが、初版では簡略化してよいものもある。

- mid-frame scroll split
- sprite 0 hitの時刻精密再現
- sprite overflow flag のバグ再現
- odd/even frame のcycle差
- EXT pin / master-slave
- PAL PPU差分
- mapper特殊機能での `8x1` レベル属性変更

ただし、以下は割り切ってはいけない。

- universal background color
- `16x16` 属性制約
- スプライト色0透明
- `8x8` / `8x16` の差
- 8 sprites per scanline
- OAM順優先
- front/back priority の本当の挙動

## 18. ツールUIに必要な表示項目

ファミコン向け画面には少なくとも次が必要。

- universal background color
- BGサブパレット4組
- Spriteサブパレット4組
- 属性領域オーバーレイ
- スプライト矩形オーバーレイ
- scanline overflow ヒートマップ
- OAM順一覧
- 8x8 / 8x16 モード切替

## 19. 実装チェックリスト

以下がすべて満たせれば、ファミコン向け減色実装は仕様的に成立している。

1. 64色RGBテーブルへの量子化ができる
2. `$0D` を既定で避けられる
3. universal background color を独立に扱える
4. BGサブパレット4組を作れる
5. 画面を `16x16` 属性領域へ分割できる
6. 各属性領域へ1つのBGパレットを割り当てられる
7. 8x8タイルを 2bit plane 相当の `0..3` 色番号へ落とせる
8. スプライトを `8x8` / `8x16` で生成できる
9. スプライトパレット4組へ割り当てられる
10. OAM順でスプライト優先を解決できる
11. BG前後priorityを正しく合成できる
12. 1走査線8スプライト制約を再現・警告できる
13. 64スプライト総数制約を警告できる
14. BGパレット、スプライト、最終画を同時表示できる

## 20. 出典URL

- https://www.nesdev.org/wiki/PPU_palettes
- https://www.nesdev.org/wiki/PPU_attribute_tables
- https://www.nesdev.org/wiki/PPU_OAM
- https://www.nesdev.org/wiki/PPU_pattern_tables
- https://www.nesdev.org/wiki/PPU_nametables
- https://www.nesdev.org/wiki/PPU_rendering
- https://www.nesdev.org/wiki/PPU_scrolling
- https://www.nesdev.org/wiki/PPU_registers
- https://www.nesdev.org/wiki/Sprite_size
- https://www.nesdev.org/wiki/PPU_sprite_priority
- https://www.nesdev.org/wiki/CHR_ROM_vs._CHR_RAM
- https://www.nesdev.org/wiki/Sprite_overflow_games
