# 小垣内参拾人組 寄附LP

大阪府泉南郡熊取町・小垣内のだんじり祭で、後梃子・前梃子・大工方を担う **小垣内参拾人組**（任意団体）の寄附受付ページです。

- 公開URL：https://osakana-design.github.io/ogaito30ningumi/
- 応援の方法：**御花**（現金・タオルのお返しあり）／**オガファン**（Stripeによるオンライン寄附・YouTube総集編エンドクレジット掲載）

## ファイル構成

```
.
├── index.html              ページ本体（1ページ構成）
├── css/
│   └── ogaito30.css        スタイル一式（色・書体は :root の変数で管理）
├── img/                    画像
├── video/                  ヒーロー動画（hero-pc.mp4 / hero-sp.mp4）
├── icon.svg                ファビコン（SVG）
├── favicon.ico
├── apple-touch-icon.png
├── icon-192.png / icon-512.png
└── manifest.webmanifest
```

ヒーロー動画は画面の縦横比で出し分けています（縦長＝`-sp`、横長＝`-pc`）。差し替える場合は動画2本とポスター画像（`img/hero-poster-sp.webp` / `img/hero-poster-pc.webp`）をそろえてください。

## 更新のしかた

`main` ブランチに push すると GitHub Pages に自動で反映されます（反映まで数分かかることがあります）。ビルド処理はなく、HTML/CSS をそのまま編集するだけです。

### 毎年更新する箇所（すべて `index.html`）

- 日程 … ヒーローの `.hero-date`、締めの `.closing` 内の文章
- 昨年の支援者数 … `.jisseki`
- オガファンの Stripe 支払いリンク … `.plan` 内のボタンの `href`
- 御花の金額とお返し … `.nedan`
- 写真 … `img/` の差し替え（`alt` も合わせて更新）

エンドクレジット（`.credit-roll`）の `〇〇` は掲載イメージ用のダミーなので、そのままで問題ありません。

## 注意

- 動画・画像は1ファイル100MB未満（GitHubの上限）。表示速度のため、実際には数MB程度に圧縮するのが目安です
- カード情報は Stripe 側で処理され、このリポジトリやページでは扱いません

## 管理

- 現在は制作者（OSAKANA DESIGN）のアカウントで公開しています。祭礼後、組の GitHub Organization へ移管する予定です
- お問い合わせ：ogaito30ningumi@gmail.com ／ Instagram [@ogaito30](https://www.instagram.com/ogaito30)
- 掲載している写真・動画・文章の権利は小垣内参拾人組に帰属します

Design: OSAKANA DESIGN
