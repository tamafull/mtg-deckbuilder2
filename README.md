# MTG Deckbuilder 2

ブラウザだけで使える Magic: The Gathering のデッキ作成 + 一人回し（Goldfish）Web アプリです。

## 主な機能

- Scryfall API を使ったカード検索
- メインデッキ / サイドボード管理
- デッキ名・フォーマット設定
- マナカーブ / 色構成 / 枚数の簡易集計
- LocalStorage による自動保存
- Arena / MTGO 風デッキリストのインポート
- テキスト形式のエクスポート
- 一人回しシミュレーター
  - 初手7枚
  - ロンドン・マリガン用のボトム操作
  - ドロー / ターン進行
  - 戦場・手札・墓地・追放への移動
  - タップ / アンタップ
  - ライフ管理
  - ライブラリーのシャッフル / トップ公開

## ローカル起動

静的ファイルだけで動作します。

```bash
python -m http.server 8080
```

その後 `http://localhost:8080` を開いてください。

## GitHub Pages

`main` ブランチへの push で `.github/workflows/pages.yml` が自動デプロイします。

公開URL: https://tamafull.github.io/mtg-deckbuilder2/

## 外部API

カード情報・画像は [Scryfall](https://scryfall.com/) を利用しています。

## 注意

このアプリは Wizards of the Coast / Scryfall の公式製品ではありません。Magic: The Gathering のカード名・画像等の権利は各権利者に帰属します。
