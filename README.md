# NeonPulse — Ambient Space

React（Vite）フロントと Express API。**Firebase は使いません。** 音声・ジャケット・**曲一覧（カタログ）**はすべて **Google Drive** 上のファイルとして保持され、API が Drive API で読み書きします。

## 構成

- **メディア**: Drive のフォルダ内にアップロード。公開再生は `/api/media/audio|image/:fileId`（`Range` 対応）。
- **カタログ**: 同じフォルダ内の `boss-music-catalog.json`（初回アクセス時に自動作成）。トラックのメタデータと `driveAudioFileId` / `driveCoverFileId` を保持。
- **管理者**: Drive OAuth のリフレッシュトークンをサーバーに保存。管理 API は **セッション Cookie**（`SESSION_SECRET` で署名）または **`X-Admin-Secret`**（`ADMIN_SECRET`）で保護。
- **Vercel 本番アップロード**: 管理画面で Google に再認証し、**MP3 / 画像本体はブラウザから Google Drive に直接送信**します。サーバーは catalog 更新だけ担当します。

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
3. 曲をアップロード（Cookie または `ADMIN_SECRET` / `VITE_ADMIN_SECRET` で認証）。本番の正式サポートは **MP3 最大 150MB**、画像は **JPG / PNG / WEBP 最大 10MB**。
4. Vercel 本番では、アップロード時に **サーバー連携済みと同じ Google アカウント** を選ぶ

カタログファイル ID は、Redis 未使用時は `data/catalog-file-id.txt` に保存されます（`.gitignore` 済み）。Vercel（パターン B）では **Redis** に保存します。

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

### パターン B（本リポジトリの既定: 静的 + Serverless API を同一プロジェクト）

- **構成**: [`api/index.ts`](api/index.ts) は [`createApiApp()`](server/app.ts) を **そのまま default export**（[Vercel の Express 向け公式](https://vercel.com/docs/frameworks/backend/express)）。`serverless-http` は使わない（Lambda 向けで Vercel では 500 になり得る）。[`vercel.json`](vercel.json) に `includeFiles: server/**` を付け、関数バンドルにサーバー側コードを含めます。`rewrites` で `/api/*` をこの関数へ流します。フロントは `npm run build` の `dist/`、SPA は `index.html` への rewrite。
- **永続化（本番必須）**: Serverless ではローカルファイルが共有されないため、**Vercel の Storage で Redis（Upstash）** をプロジェクトに接続し、環境変数 **`UPSTASH_REDIS_REST_URL`** と **`UPSTASH_REDIS_REST_TOKEN`** が入るようにします（ダッシュボードの Integrations から追加）。これによりリフレッシュトークン（暗号化済み）・OAuth state・カタログ fileId が Redis に保存されます。**Vercel 本番で Redis 未設定の場合、Drive 連携と `/api/admin/google-upload-config` は明示エラーになります。**
- **OAuth**: 本番の `OAUTH_REDIRECT_URI` を `https://<あなたのドメイン>/api/auth/google/callback` にし、Google Cloud の承認済みリダイレクト URI と一致させます。
- **アップロード方式**: `/api/admin/google-upload-config` で Google クライアント設定と連携済みアカウント情報を返し、管理画面は Google Identity Services で同じ Google アカウントを選ばせたうえで Drive API に直接アップロードします。`/api/admin/upload/complete` はアップロード済み fileId を検証して catalog に反映します。旧 `/api/admin/upload` はローカル専用です。
- **制約**: Vercel Function に大きい MP3 を直接送る構成ではなく、Drive 直送に切り替えています。アップロード再開は Google Drive の resumable upload に依存します。
- **フロント**: 同一オリジンなので **`VITE_API_BASE_URL` は未設定のまま**でよい（相対 `/api`）。

### 本番チェックリスト

1. Vercel の Environment Variables に `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `OAUTH_REDIRECT_URI` / `GOOGLE_DRIVE_FOLDER_ID` / `TOKEN_ENCRYPTION_KEY` / `SESSION_SECRET` / `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` を設定
2. Google Cloud Console の OAuth クライアントで `Authorized JavaScript origins` に `https://<本番ドメイン>` を追加
3. 同じ OAuth クライアントの `Authorized redirect URIs` に `https://<本番ドメイン>/api/auth/google/callback` を追加
4. `/api/admin/drive-status` で `storage: "redis"` と `configOk: true` を確認
5. `/admin` から同じ Google アカウントで MP3 と画像をアップロードして再生確認

### パターン A（API だけ別ホストに置く場合）

- **Vercel** は `dist/` のみ。Express は Railway / Render 等。
- 本番ビルド時に **`VITE_API_BASE_URL`** に API のオリジンを設定する。
- **CORS** が必要になることがある（このリポジトリの API は CORS ミドルウェア未実装のため、別オリジンから叩く場合は API 側の対応が別途必要）。

### 環境変数（Vercel・パターン B）

- 既存の `GOOGLE_*`、`OAUTH_REDIRECT_URI`、`TOKEN_ENCRYPTION_KEY`、`SESSION_SECRET`、`ADMIN_SECRET`、`GOOGLE_DRIVE_FOLDER_ID` に加え、**`UPSTASH_REDIS_REST_URL`** と **`UPSTASH_REDIS_REST_TOKEN`**（Redis 連携）。
- 任意: **`GOOGLE_DRIVE_CATALOG_FILE_ID`**（カタログ Drive ファイル ID を固定したい場合）。

## Firestore / Firebase からの移行

以前 Firestore にあったトラックは、**Drive に音声・画像を再アップロード**し、管理画面から登録し直すか、`boss-music-catalog.json` を手編集（非推奨）で合わせてください。Firebase の設定ファイルは不要です。

## セキュリティ

- `fileId` が分かると `/api/media/...` 経由でメディアを取得できる設計です（ポートフォリオ想定）。
- `ADMIN_SECRET` と `VITE_ADMIN_SECRET` は漏洩すると不正アップロードに使われます。本番では Cookie 認証中心にし、フロントに秘密を入れない運用を推奨します。
