# MTG EDH Deckbuilder — ChatGPT Sites edition

`sites-edh` は ChatGPT Sites 向けの Commander / EDH デッキビルダー + 通信対戦版です。`main` の GitHub Pages 版はそのまま残しています。

## 実装済み

- Sign in with ChatGPT
- アカウントごとのデッキ保存（D1）
- MTGJSON `AllPrintings.sqlite` をカードマスタのソースとして利用
- 英語名 / 日本語名検索
- 日本語版が存在する印刷は日本語名・日本語カードテキスト・日本語画像を優先
- 日本語 `scryfallId` がない場合は `multiverseId` / Gatherer を利用し、それもなければ英語画像へフォールバック
- Commander 100枚チェック
- 統率者 1〜2枚チェック
- Color Identity チェック
- Commander legality チェック
- 同名カード枚数チェック（基本土地・特殊枚数制限を考慮）
- 2〜4人 EDH ルーム
- 招待コード
- 40点ライフ
- 統率者ダメージ
- 初手7枚 / Mulligan / Bottom / Draw / Shuffle / Library Top
- Battlefield / Hand / Graveyard / Exile / Command Zone
- Tap / Untap
- +1/+1 カウンター
- Token生成
- ターン・フェイズ進行
- 投了
- 他プレイヤーには手札内容・ライブラリー内容を送らない
- D1にゲーム状態とアクション履歴を保存し、再読み込み後も復帰可能

## データ構成

### カードデータ

カード情報の正は MTGJSON の `AllPrintings.sqlite` です。

MTGJSON SQLite から Sites 用 D1 へ必要な列だけ投影します。カード検索時に Scryfall API をカードデータベースとして使用しません。

画像だけは MTGJSON の identifiers を利用します。

優先順位:

1. MTGJSON `cardForeignData` の Japanese `scryfallId`
2. Japanese `multiverseId` → Gatherer
3. 英語版 `scryfallId`

### ユーザーデータ

D1 の `decks.owner_email` を Sign in with ChatGPT の認証済みメールアドレスと照合します。デッキの取得・更新・削除はすべてサーバー側で所有者確認を行います。

## MTGJSONの取り込み

公式から `AllPrintings.sqlite` を取得してプロジェクトルートへ置きます。

```bash
python scripts/export_mtgjson_d1.py AllPrintings.sqlite
```

`.mtgjson-d1/` に分割SQLが生成されます。

日本語データは `cardForeignData` の `language = 'Japanese'` を利用し、言語別 identifiers も保存します。

## Sites

`.openai/hosting.json` は D1 binding `DB` を使用する構成です。

```json
{
  "d1": "DB",
  "r2": null
}
```

Sitesで保存・デプロイするときは、`drizzle/` のスキーマmigrationを先に適用し、その後 MTGJSON の生成SQLをD1へ取り込みます。

## 対戦同期

現在のUIは D1 を正として約1秒間隔で状態を再取得します。各操作は `game_rooms.version` を使った optimistic locking で競合を検出します。

これにより、Sites上で安全に動くことを優先しつつ、2〜4人の通信対戦が可能です。将来 WebSocket / Durable Object 相当へ差し替えられるよう、ゲーム状態更新APIは独立させています。

## 注意

このアプリは Wizards of the Coast、MTGJSON、Scryfall の公式製品ではありません。Magic: The Gathering のカード名・画像等の権利は各権利者に帰属します。
