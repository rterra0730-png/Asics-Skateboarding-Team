# ASICS SKATEBOARDING — TEAM SHEET(社内向け)

GitHub Pages で公開 + **毎日自動でデータ更新**するための完全パッケージです。

---

## 1. デプロイ手順(初回のみ・約10分)

1. GitHub にログイン → 右上 **+** → **New repository**
2. 名前は例: `asics-team-sheet` / **Private** を選択 → **Create repository**
3. リポジトリ画面で **uploading an existing file** をクリック
4. このフォルダの中身を**フォルダ構造ごと**全部ドラッグ&ドロップ
   (`index.html` / `data.json` / `.nojekyll` / `photos/` / `scripts/` / `.github/workflows/`)
   → **Commit changes**
   > `.github` フォルダはドラッグ&ドロップで隠れて見えないことがありますが、
   > ドロップすれば中身ごと正しくアップロードされます。心配なら Step 5 の Actions タブで確認できます。
5. **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main / (root)** → **Save**
6. 1〜2分後、`https://<ユーザー名>.github.io/asics-team-sheet/` でサイトが開きます

## 2. 自動更新について — 料金と頻度(重要)

自動更新には Anthropic の Web検索API を使います。**2026年時点の公表価格は検索1回$0.01(1,000回で$10)+わずかなトークン代**です。
1回の自動更新(順位チェック+大会カレンダー+動画探索)でだいたい **$0.25〜0.40程度**かかります。

### 料金と頻度の選択肢(3パターン)

| パターン | 頻度 | 月額目安 | 設定 |
|---|---|---|---|
| **①デフォルト(推奨)** | 毎週月曜に自動 | 約$1〜2 | このまま何もしなくてOK |
| **②大会後だけ手動** | 好きなタイミングで手動ボタン | 押した回数 ×約$0.30(自動実行なし) | `.github/workflows/refresh-data.yml` 内の `schedule:` の2行を削除 |
| **③完全無料** | 自動更新なし | $0 | ワークフローを使わない(下記参照) |

**①のまま使う場合(何もしなくてOK):**
1. Anthropic の API キーを用意(すでに持っていなければ [console.anthropic.com](https://console.anthropic.com) で発行)
2. リポジトリの **Settings → Secrets and variables → Actions → New repository secret**
3. Name: `ANTHROPIC_API_KEY` / Secret: 発行したキーを貼り付け → **Add secret**
4. 完了。毎週月曜 UTC 21:00(日本時間 火曜朝6時ごろ)に自動実行され、`data.json` が更新されます。

**②「大会があった時だけ」にしたい場合:**
`.github/workflows/refresh-data.yml` を開き、`schedule:` とその下の `- cron: "0 21 * * 1"` の2行を削除(または `#` でコメントアウト)。
自動実行が完全に止まり、**Actions タブ → Daily data refresh → Run workflow** を押した時だけ課金されます。
大会の翌朝に1回押すだけなら、月に数十円〜百数十円程度で済みます。

**③まったくお金をかけたくない場合:**
API キーの Secret を設定しなければ、ワークフローは失敗するだけでサイトは壊れません(既存の `data.json` を使い続けるだけ)。
確実に止めたい場合は `.github/workflows/` フォルダごと削除してください。
その場合、順位や大会情報は前回説明した通り **`index.html` を手で編集して更新**する運用になります(これも問題なく動作します)。

いずれの場合も、サイト側の **REFRESH ボタン**は「その時点の最新 `data.json` を再読み込みする」動きをします
(ブラウザから直接AIを呼ぶことはないので、APIキーが漏れる心配はありません)。

## 3. ⚠ 重要: 公開範囲について

リポジトリを Private にしても、**GitHub Pages のページ自体は URL を知っていれば誰でも見られます**
(閲覧制限付き Pages は GitHub Enterprise Cloud 限定機能)。契約ライダー情報を含むため:

- 社内限定でURL共有 + `noindex`設定済み(検索には載らない)という運用で許容する
- 会社が GitHub Enterprise Cloud なら Settings → Pages → Visibility を **Private** に
- より厳密にするなら、SSO付きの社内ホスティング(Vercel/Netlify のパスワード保護等)を検討

## 4. 写真の追加

1. `photos/` フォルダに契約写真を置く(例: `photos/liz.jpg`)
2. `index.html` 内の該当選手に `photo:"photos/liz.jpg"` を追記
3. GitHub 上で `photos/` フォルダに **Add file → Upload files** で同じ写真をアップロード → Commit
4. これで全員に反映されます(ローカルに置いただけでは他の人には見えません — 詳細は前回のやり取り参照)

まとめて43人分の写真が揃ったタイミングで、一括ドラッグ&ドロップするのが効率的です。

## 5. データの手動編集

順位・戦績・カレンダー・選手プロフィール(生年月日等)は `index.html` 上部の
**RIDER DATA / CONTEST CALENDAR** ブロックを直接編集(GitHub上で鉛筆アイコン → 編集 → Commit)。
自動更新される `data.json` はランキング・カレンダー・動画IDの「差分」だけを持つ仕組みなので、
手で編集した内容が自動更新で消えることはありません。

## 6. 動作しない時のチェックリスト

- Actions タブでワークフローが赤い❌になっている → `ANTHROPIC_API_KEY` の Secret 設定を確認
- サイトを開いても古いまま → ブラウザで一度スーパーリロード(Ctrl+Shift+R / Cmd+Shift+R)
- data.json が404 → Pages の反映に数分かかることがあるので少し待つ
