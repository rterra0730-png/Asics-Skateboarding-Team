# AI Update機能 セットアップガイド

## できること

Netlify側の `/ai-admin/` で次の流れを実行します。

1. Rankings / Results / Events / Footageを選択
2. OpenAI APIがWeb検索して更新候補を作成
3. 出典リンクと変更JSONを確認
4. 採用する候補だけチェック
5. Approve selectedを押す
6. Netlify FunctionがGitHubのJSONを更新
7. GitHub Pages / Netlifyが再デプロイ

写真、契約情報、スポンサー情報などは誤更新を避けるためAIの自動候補対象外です。これらは従来どおりDecap CMSから編集します。

## 1. GitHubへアップロード

このフォルダの中身をリポジトリのルートにアップロードします。特に以下が新規ファイルです。

- `ai-admin/index.html`
- `netlify/functions/ai-research.mjs`
- `netlify/functions/ai-apply.mjs`
- `netlify/functions/_shared.mjs`
- `netlify.toml`
- `package.json`

## 2. NetlifyのEnvironment variablesを設定

Netlifyプロジェクトを開き、Project configuration → Environment variablesで以下を登録します。

### OPENAI_API_KEY
OpenAI APIのSecret key。ブラウザやGitHubには絶対に貼らないでください。

### OPENAI_MODEL
例: `gpt-5.6`

### GITHUB_TOKEN
Fine-grained personal access token。対象リポジトリを `Asics-Skateboarding-Team` のみに限定し、Repository permissions → Contentsを Read and write にします。

### ADMIN_SYNC_KEY
AI Update画面を使うための任意の長いパスワード。20文字以上を推奨します。

### GITHUB_OWNER
`rterra0730-png`

### GITHUB_REPO
`Asics-Skateboarding-Team`

### GITHUB_BRANCH
`main`

Environment variablesのScopeを選べる場合はFunctionsで利用できるようにします。

## 3. Netlifyを再デプロイ

Environment variables登録後、Deploys → Trigger deploy → Deploy siteを実行します。

## 4. AI Update画面を開く

`https://fantastic-kheer-a2ffd2.netlify.app/ai-admin/`

Admin Sync Keyを入力し、検索対象を選んで `SEARCH LATEST UPDATES` を押します。

## 5. 安全な運用

- OpenAI API keyとGitHub tokenはNetlify環境変数だけに保存します。
- AI候補は自動反映されません。Approve selectedを押した候補のみ更新します。
- Sourceリンクを開き、重要なランキングや大会情報は必ず人間が確認してください。
- GitHubの履歴からいつでも変更前へ戻せます。
- ADMIN_SYNC_KEYは社外へ共有しないでください。

## 費用

OpenAI APIはChatGPT Plusとは別課金です。検索対象を4種類すべて選ぶと4回のAPI処理が走ります。必要な項目だけ選ぶと費用を抑えられます。
