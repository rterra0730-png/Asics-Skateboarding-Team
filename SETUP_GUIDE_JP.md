# ASICS Skateboarding Team Sheet + Decap CMS

このフォルダ一式をGitHubリポジトリのルートへアップロードすると、現在のTeam Sheetを維持したまま、`/admin/` から選手・写真・Footage・大会・各セクションのテキストを編集できます。

## 最初に変更する場所

`admin/config.yml` の次の1行を、自分のGitHubリポジトリへ変更します。

```yaml
repo: YOUR_GITHUB_USERNAME/YOUR_REPOSITORY_NAME
```

例：

```yaml
repo: ryohei-teramoto/asics-skate-team-sheet
```

## GitHub Pagesの公開設定

1. フォルダ内のファイルをすべてリポジトリの `main` ブランチ直下へアップロードします。
2. GitHubのリポジトリで `Settings` → `Pages` を開きます。
3. `Deploy from a branch` を選びます。
4. Branchを `main`、Folderを `/(root)` にして保存します。
5. 公開後、通常ページは `https://ユーザー名.github.io/リポジトリ名/`、管理画面はその末尾に `admin/` を付けたURLです。

## 管理画面のGitHubログイン設定

GitHubのOAuthはブラウザだけでは完結できないため、認証だけを処理するOAuthサーバーが必要です。このセットではDecap CMS標準のNetlify OAuthを使う設定を入れています。Webサイト本体は引き続きGitHub Pagesで公開されます。

1. Netlifyで無料の空のサイトを1つ作ります。認証用なので、Team SheetをNetlifyで公開する必要はありません。
2. GitHubの `Settings` → `Developer settings` → `OAuth Apps` でOAuth Appを作成します。
3. Authorization callback URLは `https://api.netlify.com/auth/done` にします。
4. 発行されたClient IDとClient SecretをNetlifyの `Project configuration` → `Access & security` → `OAuth` → `Install provider` → `GitHub` に登録します。
5. 編集するメンバーには、対象GitHubリポジトリへのPush権限を付与します。

## 編集できる内容

### Site Text & Sections
Hero、ナビゲーション、世界地図、Calendar、Roster、LA 2028、Footage、Footerのタイトル・注釈・表示/非表示を編集できます。

### Riders
選手の追加・削除・表示/非表示、プロフィール写真、基本情報、Instagram、ランキング、結果、Historyを編集できます。

写真はCMSで選択またはドラッグ＆ドロップすると `assets/uploads` に保存されます。

### Footage
YouTube URL、または動画ファイルを登録できます。`Publish / show` をONにし、YouTube URLか動画ファイルのどちらかが入っているものだけサイトへ表示されます。選手を紐付けると、その選手の詳細画面にも同じ動画が表示されます。

動画ファイルはGitHubリポジトリへ入るため、この初期版では25MBまでに設定しています。iPhoneの長い動画は容量が大きいため、短く切るか圧縮してからアップロードしてください。長尺動画はYouTubeの限定公開リンク運用が安定します。

### Calendar & Live Radar
大会、出場予定選手、公式リンク、Live表示を変更できます。

## スマホ版の修正

- 世界地図のピンはスマホ時に大きくなり、見えないタップ領域も広くなっています。
- 地図下の国名ボタンを押すと、その国でRosterを絞り込み、選手一覧まで自動スクロールします。

## ローカル確認

通常のHTMLをダブルクリックした場合は、内蔵しているフォールバックデータで表示されます。CMSのJSONを含めて確認するときは、フォルダで簡易サーバーを起動してください。

```bash
python -m http.server 8000
```

その後、`http://localhost:8000/` を開きます。管理画面のローカル編集を試す場合は別ターミナルで以下を実行します。

```bash
npx decap-server
```

## 主なファイル

```text
index.html               公開ページ
admin/index.html         CMS管理画面
admin/config.yml         CMS項目・GitHub接続設定
content/site.json        各セクションのテキスト
content/riders.json      選手情報
content/footage.json     動画情報
content/calendar.json    大会・Live情報
assets/uploads/          CMSからアップロードした画像・動画
```
