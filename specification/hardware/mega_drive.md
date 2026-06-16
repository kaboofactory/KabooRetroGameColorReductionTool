# メガドライブ グラフィック仕様

## 1. 対象

- Sega Mega Drive / Genesis
- 通常のタイル/スプライト利用を前提としたVDP制約を対象にする

## 2. まず詰める項目

- 256幅/320幅モードのどちらを初版基準にするか
- RGB333相当 512色
- CRAM `4 x 16` パレット構造
- 背景面とwindow面の初版での扱い
- tileごとの palette line 割り当て
- sprite size 組み合わせ
- 80 sprites / 20 per scanline 制限
- transparent color entry と backdrop color の扱い

## 3. 現状

このファイルは機種別の詳細仕様を書き起こすための分割先として作成した。次の更新で、初版ツール向けの表示モード固定方針まで明記する。

