# NeonPulse — Ambient Space

React（Vite）フロントと Express API。音声・ジャケット画像は **Vercel Blob**、曲一覧は **Neon Postgres** に保存します。Firebase / Google Drive / Redis は使いません。

## 構成

- **メディア**: 管理画面から Public Vercel Blob へブラウザ直アップロード。公開再生は Blob の HTTPS URL を直接使います。
- **曲情報**: Neon Postgres の `tracks` テーブルに保存。API は `/api/tracks` で公開用トラック一覧を返します。
- **管理者**: 管理 API は **セッション Cookie**（`SESSION_SECRET` で署名）または **`X-Admin-Secret`**（`ADMIN_SECRET`）で保護。
- **アップロード制限**: MP3 最大 150MB、画像は JPG / PNG / WEBP 最大 10MB。

## セットアップ

1. `npm install`
2. Vercel Blob の Public Store を作成し、`BLOB_READ_WRITE_TOKEN` を設定
3. Neon Free DB を作成し、`DATABASE_URL` を設定
4. `.env.local` を [`.env.example`](.env.example) を見て作成
5. ローカルでは `ADMIN_SECRET` と同じ値を `VITE_ADMIN_SECRET` にも入れると、管理画面で毎回シークレットを入力しなくてよい

`tracks` テーブルは API 起動時に自動作成されます。手動で作る場合は [`migrations/001_create_tracks.sql`](migrations/001_create_tracks.sql) を Neon の SQL Editor で実行してください。

## 開発

```bash
npm run dev:all
```

- フロント: http://localhost:3000（`/api` は Vite が 8787 にプロキシ）
- API: http://localhost:8787

### 初回

1. `/admin` を開く
2. 管理者シークレットを入力、または `VITE_ADMIN_SECRET` を設定
3. 曲をアップロード
4. `/api/tracks` と公開画面で再生確認

### 管理者認証が 401 のとき

- **`ADMIN_SECRET` と `VITE_ADMIN_SECRET`（または画面の管理者シークレット入力）**が完全一致しているか確認
- **`VITE_ADMIN_SECRET` を変えたら Vite を再起動**。`import.meta.env` は起動時に固定されます。
- Cookie を使う場合は `SESSION_SECRET` を16文字以上にし、`X-Admin-Secret` 付きで `POST /api/admin/session` を呼ぶと Cookie が発行されます。

## 本番（同一プロセスで静的＋API）

```bash
npm run build
NODE_ENV=production npm start
```

`NODE_ENV=production` では Express が `dist/` を静的配信し、未マッチのパスは SPA の `index.html` にフォールバックします。

## Vercel デプロイ

- **構成**: [`api/_handler.ts`](api/_handler.ts) は [`createApiApp()`](server/app.ts) を default export。`rewrites` で `/api/*` をこの関数へ流します。
- **必須 Environment Variables**: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_SECRET`
- **推奨 Environment Variables**: `SESSION_SECRET`
- **フロント**: 同一オリジンなので通常 **`VITE_API_BASE_URL` は未設定**でよいです。本番で `VITE_ADMIN_SECRET` は埋め込まない運用を推奨します。

### 本番チェックリスト

1. Vercel Blob Store を作成し、`BLOB_READ_WRITE_TOKEN` が入っていることを確認
2. Neon DB を作成し、`DATABASE_URL` を設定
3. `ADMIN_SECRET` と必要なら `SESSION_SECRET` を設定
4. `/api/admin/storage-status` で `configOk: true` を確認
5. `/admin` から MP3 と画像をアップロードして再生確認

## 移行メモ

この構成では既存の Google Drive カタログは自動移行しません。切替後の曲一覧は空から始まり、既存曲は管理画面から再アップロードします。

## セキュリティ

- Blob は Public Store のため、URL を知っている人は音源・画像へ直接アクセスできます。
- `ADMIN_SECRET` と `VITE_ADMIN_SECRET` は漏洩すると不正アップロードに使われます。本番ではフロントに秘密を入れず、Cookie または都度入力で運用してください。
