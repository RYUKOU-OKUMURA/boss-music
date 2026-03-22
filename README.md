# NeonPulse — Ambient Space

React（Vite）フロントと Express API。**Firebase は使いません。** 音声・ジャケット・**曲一覧（カタログ）**はすべて **Google Drive** 上のファイルとして保持され、API が Drive API で読み書きします。

## 構成

- **メディア**: Drive のフォルダ内にアップロード。公開再生は `/api/media/audio|image/:fileId`（`Range` 対応）。
- **カタログ**: 同じフォルダ内の `boss-music-catalog.json`（初回アクセス時に自動作成）。トラックのメタデータと `driveAudioFileId` / `driveCoverFileId` を保持。
- **管理者**: Drive OAuth のリフレッシュトークンをサーバーに保存。管理 API は **セッション Cookie**（`SESSION_SECRET` で署名）または **`X-Admin-Secret`**（`ADMIN_SECRET`）で保護。

## セットアップ

1. `npm install`
2. `.env.local` を [`.env.example`](.env.example) を見て作成
3. Google Cloud で **Google Drive API** を有効化し、OAuth クライアント（ウェブ）を作成。リダイレクト URI に  
   `http://localhost:3000/api/auth/google/callback`  
   を登録。スコープは `https://www.googleapis.com/auth/drive`
4. Drive でフォルダを作成し、URL から **フォルダ ID** を `GOOGLE_DRIVE_FOLDER_ID` に設定
5. `TOKEN_ENCRYPTION_KEY`（長いランダム文字列）と、管理者用に **`SESSION_SECRET`**（16文字以上）と **`ADMIN_SECRET`**（任意だがローカルでは推奨）を設定
6. 開発時は `ADMIN_SECRET` と同じ値を `VITE_ADMIN_SECRET` にも入れると、管理画面で毎回シークレットを入力しなくてよい（**本番ビルドに秘密を埋め込まないこと**）

## 開発

```bash
npm run dev:all
```

（Vite は API が `8787` で待ち受けてから起動するので、起動直後のプロキシ `ECONNREFUSED` を避けています。`API_PORT` を変えた場合は `package.json` の `wait-on` も合わせてください。）

- フロント: http://localhost:3000（`/api` は Vite が 8787 にプロキシ）
- API: http://localhost:8787

### 初回

1. `/admin` を開く
2. **Drive と連携する**で OAuth 完了（別タブ）。`SESSION_SECRET` があると管理者用 Cookie が付く
3. 曲をアップロード（Cookie または `ADMIN_SECRET` / `VITE_ADMIN_SECRET` で認証）

カタログファイル ID は `data/catalog-file-id.txt` に保存されます（`.gitignore` 済み）。

### 管理者認証が 401 のとき

- **`SESSION_SECRET` は 16 文字以上**。満たないと Cookie は発行されません。設定後は **API を再起動**し、**Drive と連携するをもう一度**（既存 Cookie は無効になります）。
- **`OAUTH_REDIRECT_URI` のポート**を、実際に開いている URL（例: Vite が `3001` に逃げているなら `http://localhost:3001/...`）と揃える。
- **`VITE_ADMIN_SECRET` を変えたら Vite を再起動**（`dev:all` を止めて起動し直し）。`import.meta.env` は起動時に固定されます。
- **`ADMIN_SECRET` と `VITE_ADMIN_SECRET`（または画面の管理者シークレット入力）**は **完全一致**（余計な引用符や全角スペースなし）。

## 本番（同一プロセスで静的＋API）

```bash
npm run build
NODE_ENV=production npm start
```

`NODE_ENV=production` では Express が `dist/` を静的配信し、未マッチのパスは SPA の `index.html` にフォールバックします。

## ドキュメント

詳細な設計メモは [`docs/`](docs/README.md) を参照してください。

## Vercel デプロイ

Vercel は **常時起動の Express 専用プロセス**向けではないため、次のどちらかで運用する前提を README で固定しておくと混乱が減ります。

### パターン A（推奨・移行コストが低い）

- **Vercel**: `npm run build` の出力（`dist/`）だけを配信。ルート直下に [`vercel.json`](vercel.json) があり、SPA 用の `rewrites` で `index.html` にフォールバックします。
- **API**: Express は **別ホスト**（Railway / Render / Fly.io / Cloud Run 等）にデプロイ。本番のフロントでは **`VITE_API_BASE_URL`** にその API のオリジン（末尾スラッシュなし）を設定してビルドします（例: `https://api.example.com`）。
- **OAuth**: Google Cloud の「承認済みのリダイレクト URI」に、開発時どおり **フロントのオリジン**に紐づくコールバック（例: `http://localhost:3000/api/auth/google/callback`）に加え、**本番 API のコールバック URL**（例: `https://api.example.com/api/auth/google/callback`）を登録します。API 側の環境変数 `OAUTH_REDIRECT_URI` をその URL に合わせます。
- **CORS**: フロントと API のオリジンが異なる場合は、API でフロントオリジンを許可するか、同一ドメインのリバースプロキシで揃えます。

### パターン B（API も Vercel に載せる場合）

- Express を **単一の Serverless ハンドラ**（例: `api/index.ts` で `app` を export）にまとめ、`vercel.json` の `rewrites` で `/api/*` をその関数へ向ける構成に寄せます。
- **制約**: 実行時間・ペイロード上限・コールドスタートがあります。
- **永続化**: `data/drive-tokens.enc` や `data/catalog-file-id.txt` は **インスタンス間で共有されない**ため、本番では Vercel KV / Postgres / 環境変数（単一値のみ）などへ移す **別タスク**が必要です。パターン B を選ぶ場合はその技術的負債をイシュー化してください。

### 環境変数（本番）

- API ホスト側: `OAUTH_REDIRECT_URI`、`SESSION_SECRET`、`ADMIN_SECRET`、`GOOGLE_*`、`TOKEN_ENCRYPTION_KEY`、`GOOGLE_DRIVE_FOLDER_ID` などを Vercel 以外のホスティングの Environment Variables に設定します。
- フロント（パターン A）: `VITE_API_BASE_URL` を API のオリジンに設定してから `npm run build` します（秘密は `VITE_` に入れないこと）。

## Firestore / Firebase からの移行

以前 Firestore にあったトラックは、**Drive に音声・画像を再アップロード**し、管理画面から登録し直すか、`boss-music-catalog.json` を手編集（非推奨）で合わせてください。Firebase の設定ファイルは不要です。

## セキュリティ

- `fileId` が分かると `/api/media/...` 経由でメディアを取得できる設計です（ポートフォリオ想定）。
- `ADMIN_SECRET` と `VITE_ADMIN_SECRET` は漏洩すると不正アップロードに使われます。本番では Cookie 認証中心にし、フロントに秘密を入れない運用を推奨します。
