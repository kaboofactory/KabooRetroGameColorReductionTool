# Kaboo Retro Game Color Reduction Tool

ファミリーコンピュータ向けの制約を意識しながら、画像をレトロゲーム風に減色・分解する Web ツールです。

現在はファミリーコンピュータ向けの変換に対応しています。

## 機能

- 画像ファイルの読み込み
- クリップボード貼り付けによる画像入力
- ファミコン画面サイズ `256x240` を前提とした変換
- 64色量子化結果の確認
- BG / Sprite / 最終画像 / 元画像の切り替え表示
- ROI 指定によるディテール優先範囲の設定
- BGパレット / Sprite候補 / 制約警告の表示
- 量子化画像 / BG画像 / Sprite画像 / 最終画像の保存

## 使い方

1. 画像を読み込みます。
2. 必要なら画像上をドラッグして ROI を設定します。
3. 明度、コントラスト、彩度、量子化設定を調整します。
4. `生成` ボタンを押します。
5. `最終画像`、`BG0-BG3`、`Sprite`、`量子化`、`元画像` を切り替えて確認します。

## ローカルで起動する方法

必要環境:

- Node.js 20 以降推奨

セットアップ:

```bash
npm install
```

開発サーバー起動:

```bash
npm run dev
```

本番ビルド:

```bash
npm run build
```

プレビュー:

```bash
npm run preview
```

## GitHub Pages

このリポジトリには GitHub Pages 公開用の workflow を含めています。

- `main` ブランチへ push すると自動でビルド・デプロイされます。
- GitHub 側で `Settings > Pages > Build and deployment` を `GitHub Actions` に設定してください。

## 注意事項

- 本ツールの結果は、実機での完全再現を保証するものではありません。
- パレット割り当て、Sprite構成、制約警告は確認支援用の参考情報です。
- 実機投入や公開用途では、最終的に利用者自身で検証してください。

## License / Disclaimer

本ソフトウェアは現状のまま提供され、明示または黙示を問わず、いかなる種類の保証も行いません。  
本ソフトウェアの使用によって生じた損害やトラブルについて、作者は一切の責任を負いません。

This software is provided "as is", without warranty of any kind, express or implied.  
The author shall not be held liable for any damages or issues arising from the use of this software.
