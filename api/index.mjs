// server/app.ts
import express from "express";
import cookieParser from "cookie-parser";

// server/routes/tracks.ts
import { Router } from "express";

// server/services/driveClient.ts
import { google } from "googleapis";

// server/services/tokenStore.ts
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

// server/services/kvKeys.ts
var KV_REFRESH_TOKEN = "boss-music:refresh-token";
var KV_CATALOG_FILE_ID = "boss-music:catalog-file-id";
function oauthStateKey(state) {
  return `boss-music:oauth-state:${state}`;
}

// server/services/redisStore.ts
import { Redis } from "@upstash/redis";
var client = null;
function isRedisConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
}
function getRedis() {
  if (!isRedisConfigured()) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for Redis");
  }
  if (!client) {
    client = Redis.fromEnv();
  }
  return client;
}

// server/services/runtimeEnv.ts
function isVercelRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV?.trim());
}
function getPersistenceStatus() {
  if (isRedisConfigured()) {
    return { storage: "redis", configOk: true };
  }
  if (isVercelRuntime()) {
    return {
      storage: "local",
      configOk: false,
      reason: "Vercel \u672C\u756A\u3067\u306F Upstash Redis \u306E\u8A2D\u5B9A\u304C\u5FC5\u9808\u3067\u3059\u3002"
    };
  }
  return { storage: "local", configOk: true };
}
function assertPersistentStorageConfigured() {
  const status = getPersistenceStatus();
  if (status.configOk) return status;
  const err = new Error(status.reason || "Persistent storage is required");
  err.code = "PERSISTENT_STORAGE_REQUIRED";
  throw err;
}

// server/services/tokenStore.ts
var ALGO = "aes-256-gcm";
function getKey() {
  const k = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!k || k.length < 8) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be set (min 8 chars)");
  }
  return crypto.createHash("sha256").update(k, "utf8").digest();
}
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}
function decrypt(payload) {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid token payload");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
var tokenPath = () => path.resolve(process.cwd(), process.env.DRIVE_TOKEN_PATH || "data/drive-tokens.enc");
async function saveRefreshToken(refreshToken) {
  const body = JSON.stringify({ refresh_token: refreshToken });
  const enc = encrypt(body);
  if (isRedisConfigured()) {
    await getRedis().set(KV_REFRESH_TOKEN, enc);
    return;
  }
  assertPersistentStorageConfigured();
  const p = tokenPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, enc, "utf8");
}
async function loadRefreshToken() {
  if (isRedisConfigured()) {
    try {
      const enc = await getRedis().get(KV_REFRESH_TOKEN);
      if (!enc || typeof enc !== "string") return null;
      const json = JSON.parse(decrypt(enc));
      return json.refresh_token ?? null;
    } catch {
      return null;
    }
  }
  assertPersistentStorageConfigured();
  try {
    const enc = await fs.readFile(tokenPath(), "utf8");
    const json = JSON.parse(decrypt(enc));
    return json.refresh_token ?? null;
  } catch {
    return null;
  }
}

// server/services/driveClient.ts
var SCOPES = ["https://www.googleapis.com/auth/drive"];
function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_URI are required");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
async function getOAuth2ClientForDrive() {
  const oauth2 = createOAuth2Client();
  const rt = await loadRefreshToken();
  if (!rt) {
    const err = new Error("Drive not connected");
    err.code = "NOT_CONNECTED";
    throw err;
  }
  oauth2.setCredentials({ refresh_token: rt });
  return oauth2;
}
async function getDrive() {
  const auth = await getOAuth2ClientForDrive();
  return google.drive({ version: "v3", auth });
}
async function getConnectedDriveUser() {
  const drive = await getDrive();
  const response = await drive.about.get({
    fields: "user(displayName,emailAddress)"
  });
  return {
    displayName: response.data.user?.displayName ?? null,
    emailAddress: response.data.user?.emailAddress ?? null
  };
}
function getDriveFolderId() {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!id) throw new Error("GOOGLE_DRIVE_FOLDER_ID is required");
  return id;
}

// server/services/catalog.ts
import fs2 from "fs/promises";
import path2 from "path";
import { Readable } from "stream";
var CATALOG_FILENAME = "boss-music-catalog.json";
var catalogIdPath = () => path2.resolve(process.cwd(), process.env.CATALOG_ID_PATH || "data/catalog-file-id.txt");
function emptyCatalog() {
  return {
    version: 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    tracks: []
  };
}
async function readStoredCatalogFileId() {
  const env = process.env.GOOGLE_DRIVE_CATALOG_FILE_ID?.trim();
  if (env) return env;
  if (isRedisConfigured()) {
    try {
      const id = await getRedis().get(KV_CATALOG_FILE_ID);
      return typeof id === "string" && id.trim() ? id.trim() : null;
    } catch {
      return null;
    }
  }
  assertPersistentStorageConfigured();
  try {
    const raw = await fs2.readFile(catalogIdPath(), "utf8");
    return raw.trim() || null;
  } catch {
    return null;
  }
}
async function writeStoredCatalogFileId(id) {
  if (isRedisConfigured()) {
    await getRedis().set(KV_CATALOG_FILE_ID, id);
    return;
  }
  assertPersistentStorageConfigured();
  const p = catalogIdPath();
  await fs2.mkdir(path2.dirname(p), { recursive: true });
  await fs2.writeFile(p, id, "utf8");
}
async function ensureCatalogFile(drive, folderId) {
  let id = await readStoredCatalogFileId();
  if (id) {
    try {
      await drive.files.get({ fileId: id, fields: "id", supportsAllDrives: true });
      return id;
    } catch {
      id = null;
    }
  }
  const q = `'${folderId}' in parents and name = '${CATALOG_FILENAME}' and trashed = false`;
  const list = await drive.files.list({
    q,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 5
  });
  const found = list.data.files?.[0]?.id;
  if (found) {
    await writeStoredCatalogFileId(found);
    return found;
  }
  const empty = emptyCatalog();
  const buf = Buffer.from(JSON.stringify(empty, null, 2), "utf8");
  const created = await drive.files.create({
    requestBody: {
      name: CATALOG_FILENAME,
      parents: [folderId],
      mimeType: "application/json"
    },
    media: {
      mimeType: "application/json",
      body: Readable.from(buf)
    },
    fields: "id",
    supportsAllDrives: true
  });
  const newId = created.data.id;
  if (!newId) throw new Error("Failed to create catalog file");
  await writeStoredCatalogFileId(newId);
  return newId;
}
async function downloadCatalogJson(drive, fileId) {
  const gRes = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  const buf = Buffer.from(gRes.data);
  const text = buf.toString("utf8");
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.tracks)) parsed.tracks = [];
  if (typeof parsed.version !== "number") parsed.version = 0;
  return parsed;
}
async function readCatalog(drive, folderId) {
  const fileId = await ensureCatalogFile(drive, folderId);
  const catalog = await downloadCatalogJson(drive, fileId);
  return { catalog, fileId };
}
async function writeCatalog(drive, fileId, catalog) {
  catalog.version = (catalog.version ?? 0) + 1;
  catalog.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const buf = Buffer.from(JSON.stringify(catalog, null, 2), "utf8");
  await drive.files.update({
    fileId,
    media: {
      mimeType: "application/json",
      body: Readable.from(buf)
    },
    supportsAllDrives: true
  });
}
async function addTrackAndSave(drive, folderId, track) {
  const { catalog, fileId } = await readCatalog(drive, folderId);
  const maxOrder = catalog.tracks.reduce((m, t) => Math.max(m, t.order ?? 0), -1);
  track.order = maxOrder + 1;
  catalog.tracks.push(track);
  catalog.tracks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  await writeCatalog(drive, fileId, catalog);
  return catalog;
}

// server/utils/asyncHandler.ts
function asyncHandler(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// server/utils/trackPublic.ts
function toPublicTrack(t) {
  const coverImage = t.driveCoverFileId ? `/api/media/image/${encodeURIComponent(t.driveCoverFileId)}` : "";
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    description: t.description,
    createdAt: t.createdAt,
    tags: t.tags,
    playable: t.playable,
    order: t.order,
    driveAudioFileId: t.driveAudioFileId,
    driveCoverFileId: t.driveCoverFileId,
    audioUrl: `/api/media/audio/${encodeURIComponent(t.driveAudioFileId)}`,
    coverImage
  };
}

// server/routes/tracks.ts
var tracksRouter = Router();
tracksRouter.get(
  "/tracks",
  asyncHandler(async (_req, res) => {
    try {
      const drive = await getDrive();
      const folderId = getDriveFolderId();
      const { catalog } = await readCatalog(drive, folderId);
      const tracks = [...catalog.tracks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      res.json({
        version: catalog.version,
        updatedAt: catalog.updatedAt,
        tracks: tracks.map(toPublicTrack)
      });
    } catch (e) {
      const err = e;
      if (err.code === "NOT_CONNECTED" || err.code === "PERSISTENT_STORAGE_REQUIRED") {
        res.status(503).json({ error: err.message, tracks: [] });
        return;
      }
      throw e;
    }
  })
);

// server/routes/auth.ts
import { Router as Router2 } from "express";

// server/middleware/adminAuth.ts
import crypto2 from "crypto";
var COOKIE = "boss_music_admin";
function getSessionSecret() {
  const s = process.env.SESSION_SECRET?.trim();
  if (!s || s.length < 16) return null;
  return s;
}
function createAdminSessionToken() {
  const secret = getSessionSecret();
  if (!secret) return null;
  const expSec = Math.floor(Date.now() / 1e3) + 7 * 24 * 60 * 60;
  const payload = Buffer.from(JSON.stringify({ exp: expSec }), "utf8").toString("base64url");
  const sig = crypto2.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifyAdminSessionToken(token) {
  const secret = getSessionSecret();
  if (!secret) return false;
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!payload || !sig) return false;
  try {
    const expected = crypto2.createHmac("sha256", secret).update(payload).digest("base64url");
    if (sig !== expected) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || data.exp * 1e3 < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}
function headerString(req, name) {
  const h = req.headers[name];
  if (h === void 0) return void 0;
  const s = Array.isArray(h) ? h[0] : h;
  return typeof s === "string" ? s.trim() : void 0;
}
function requireAdmin(req, res, next) {
  const adminSecret = process.env.ADMIN_SECRET?.trim();
  const sentSecret = headerString(req, "x-admin-secret");
  if (adminSecret && sentSecret && sentSecret === adminSecret) {
    next();
    return;
  }
  const reqCookies = req.cookies;
  const token = reqCookies?.[COOKIE] ?? parseCookies(req.headers.cookie)[COOKIE];
  if (verifyAdminSessionToken(token)) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}
var adminCookieName = COOKIE;

// server/services/oauthStateStore.ts
import crypto3 from "crypto";
var STATE_TTL_MS = 10 * 60 * 1e3;
var pendingOAuthStates = /* @__PURE__ */ new Map();
function cleanupStates() {
  const now = Date.now();
  for (const [k, exp] of pendingOAuthStates) {
    if (exp < now) pendingOAuthStates.delete(k);
  }
}
function getHmacSecret() {
  return process.env.SESSION_SECRET?.trim() || process.env.TOKEN_ENCRYPTION_KEY?.trim() || null;
}
function createSignedState() {
  const secret = getHmacSecret();
  const nonce = crypto3.randomBytes(24).toString("hex");
  if (!secret) return nonce;
  const expiry = Date.now() + STATE_TTL_MS;
  const payload = `${nonce}.${expiry}`;
  const sig = crypto3.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}
function verifySignedState(state) {
  const secret = getHmacSecret();
  if (!secret) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, expiryStr, sig] = parts;
  if (!nonce || !expiryStr || !sig) return false;
  const payload = `${nonce}.${expiryStr}`;
  const expected = crypto3.createHmac("sha256", secret).update(payload).digest("hex");
  if (sig !== expected) return false;
  const expiry = Number(expiryStr);
  if (Number.isNaN(expiry) || expiry < Date.now()) return false;
  return true;
}
async function saveOAuthState(state) {
  if (isRedisConfigured()) {
    await getRedis().set(oauthStateKey(state), "1", { ex: Math.ceil(STATE_TTL_MS / 1e3) });
    return;
  }
  cleanupStates();
  pendingOAuthStates.set(state, Date.now() + STATE_TTL_MS);
}
async function consumeOAuthState(state) {
  if (isRedisConfigured()) {
    const r = getRedis();
    const key = oauthStateKey(state);
    const raw = await r.get(key);
    if (raw == null) return false;
    await r.del(key);
    return true;
  }
  cleanupStates();
  const exp = pendingOAuthStates.get(state);
  if (exp && exp >= Date.now()) {
    pendingOAuthStates.delete(state);
    return true;
  }
  return verifySignedState(state);
}

// server/routes/auth.ts
var authRouter = Router2();
authRouter.get(
  "/auth/google",
  asyncHandler(async (_req, res) => {
    const state = createSignedState();
    await saveOAuthState(state);
    const oauth2 = createOAuth2Client();
    const url = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
      state
    });
    res.redirect(url);
  })
);
authRouter.get(
  "/auth/google/callback",
  asyncHandler(async (req, res) => {
    const { code, state } = req.query;
    if (typeof code !== "string" || typeof state !== "string") {
      res.status(400).send("Missing code or state");
      return;
    }
    const ok = await consumeOAuthState(state);
    if (!ok) {
      res.status(400).send("Invalid or expired state");
      return;
    }
    const oauth2 = createOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      res.status(400).send(
        "No refresh token returned. Revoke app access in Google Account settings and try again with prompt=consent."
      );
      return;
    }
    try {
      await saveRefreshToken(tokens.refresh_token);
    } catch (error) {
      const err = error;
      if (err.code === "PERSISTENT_STORAGE_REQUIRED") {
        res.status(503).send(err.message);
        return;
      }
      throw error;
    }
    const sessionTok = createAdminSessionToken();
    if (sessionTok) {
      res.cookie(adminCookieName, sessionTok, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
    }
    res.type("html").send(`<!DOCTYPE html><html><body>
      <p>Google Drive \u3068\u9023\u643A\u3057\u307E\u3057\u305F\u3002\u3053\u306E\u30A6\u30A3\u30F3\u30C9\u30A6\u3092\u9589\u3058\u3066\u7BA1\u7406\u753B\u9762\u306B\u623B\u3063\u3066\u304F\u3060\u3055\u3044\u3002</p>
      <script>setTimeout(() => window.close(), 1500);</script>
    </body></html>`);
  })
);

// server/routes/admin.ts
import crypto4 from "crypto";
import { Router as Router3 } from "express";

// server/services/driveUploads.ts
var MB = 1024 * 1024;
var MAX_AUDIO_BYTES = 150 * MB;
var MAX_IMAGE_BYTES = 10 * MB;
var AUDIO_MIME_TYPES = /* @__PURE__ */ new Set(["audio/mpeg", "audio/mp3"]);
var IMAGE_MIME_TYPES = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
function getUploadRules(kind) {
  return kind === "audio" ? {
    maxBytes: MAX_AUDIO_BYTES,
    mimeTypes: AUDIO_MIME_TYPES,
    prefix: "audio",
    label: "MP3"
  } : {
    maxBytes: MAX_IMAGE_BYTES,
    mimeTypes: IMAGE_MIME_TYPES,
    prefix: "cover",
    label: "JPG / PNG / WEBP"
  };
}
function makeUploadError(message, code = "UPLOAD_VALIDATION_FAILED") {
  const err = new Error(message);
  err.code = code;
  return err;
}
function parseNumericSize(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value !== "string") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}
async function verifyDriveUpload(drive, fileId, kind, folderId) {
  const response = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,size,parents,trashed",
    supportsAllDrives: true
  });
  const data = response.data;
  const parents = Array.isArray(data.parents) ? data.parents.filter(Boolean) : [];
  const mimeType = String(data.mimeType ?? "").trim().toLowerCase();
  const size = parseNumericSize(data.size);
  const rules = getUploadRules(kind);
  if (!data.id) throw makeUploadError("Drive \u4E0A\u306B\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u6E08\u307F\u30D5\u30A1\u30A4\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002");
  if (data.trashed) throw makeUploadError("Drive \u4E0A\u306E\u30D5\u30A1\u30A4\u30EB\u304C\u30B4\u30DF\u7BB1\u306B\u3042\u308A\u307E\u3059\u3002");
  if (!parents.includes(folderId)) {
    throw makeUploadError("Drive \u4E0A\u306E\u30D5\u30A1\u30A4\u30EB\u4FDD\u5B58\u5148\u304C\u60F3\u5B9A\u30D5\u30A9\u30EB\u30C0\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002");
  }
  if (!rules.mimeTypes.has(mimeType)) {
    throw makeUploadError(`${rules.label} \u306E MIME type \u304C\u4E0D\u6B63\u3067\u3059\u3002`);
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw makeUploadError(`${rules.label} \u306E\u30B5\u30A4\u30BA\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002`);
  }
  if (size > rules.maxBytes) {
    throw makeUploadError(`${rules.label} \u306F ${Math.round(rules.maxBytes / MB)}MB \u4EE5\u4E0B\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
  }
  return {
    fileId: data.id,
    name: String(data.name ?? ""),
    mimeType,
    size,
    parents
  };
}
async function deleteDriveFileIfPresent(drive, fileId) {
  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (error) {
    console.error(`Failed to delete Drive file ${fileId}`, error);
  }
}

// server/routes/admin.ts
var adminRouter = Router3();
function splitTags(input) {
  if (Array.isArray(input)) {
    return input.map((tag) => String(tag).trim()).filter(Boolean);
  }
  const raw = String(input ?? "").trim();
  if (!raw) return [];
  return raw.split(",").map((tag) => tag.trim()).filter(Boolean);
}
function isValidationError(error) {
  return typeof error === "object" && error !== null && "code" in error;
}
adminRouter.get(
  "/admin/drive-status",
  asyncHandler(async (_req, res) => {
    const persistence = getPersistenceStatus();
    if (!persistence.configOk) {
      res.json({
        connected: false,
        storage: persistence.storage,
        configOk: false,
        reason: persistence.reason
      });
      return;
    }
    const rt = await loadRefreshToken();
    res.json({
      connected: Boolean(rt),
      storage: persistence.storage,
      configOk: true
    });
  })
);
adminRouter.post(
  "/admin/google-upload-config",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      res.status(500).json({ error: "GOOGLE_CLIENT_ID is required" });
      return;
    }
    const folderId = getDriveFolderId();
    const user = await getConnectedDriveUser();
    res.json({
      clientId,
      folderId,
      connectedUser: user
    });
  })
);
adminRouter.post(
  "/admin/upload/complete",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const title = String(body.title ?? "").trim();
    const artist = String(body.artist ?? "").trim();
    const description = String(body.description ?? "").trim();
    const audioFileId = String(body.audioFileId ?? "").trim();
    const imageFileId = String(body.imageFileId ?? "").trim();
    const tags = splitTags(body.tags);
    if (!title || !artist) {
      res.status(400).json({ error: "title and artist are required" });
      return;
    }
    if (!audioFileId) {
      res.status(400).json({ error: "audioFileId is required" });
      return;
    }
    const drive = await getDrive();
    const folderId = getDriveFolderId();
    let verifiedAudio = null;
    let verifiedImage = null;
    try {
      verifiedAudio = await verifyDriveUpload(drive, audioFileId, "audio", folderId);
      if (imageFileId) {
        verifiedImage = await verifyDriveUpload(drive, imageFileId, "image", folderId);
      }
      const track = {
        id: crypto4.randomUUID(),
        title,
        artist,
        description,
        createdAt: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        tags,
        playable: true,
        order: -1,
        driveAudioFileId: verifiedAudio.fileId,
        ...verifiedImage ? { driveCoverFileId: verifiedImage.fileId } : {}
      };
      await addTrackAndSave(drive, folderId, track);
      res.json({ track: toPublicTrack(track) });
    } catch (error) {
      if (verifiedAudio) {
        await deleteDriveFileIfPresent(drive, verifiedAudio.fileId);
      }
      if (verifiedImage) {
        await deleteDriveFileIfPresent(drive, verifiedImage.fileId);
      }
      const err = error;
      if (isValidationError(error) && err.code === "UPLOAD_VALIDATION_FAILED") {
        res.status(400).json({ error: err.message });
        return;
      }
      throw error;
    }
  })
);
adminRouter.post(
  "/admin/upload",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.status(410).json({
      error: "Legacy multipart upload is retired. Use browser-direct Google Drive upload from /admin and finish with /api/admin/upload/complete."
    });
  })
);

// server/routes/media.ts
import { Router as Router4 } from "express";
import { google as google2 } from "googleapis";

// server/utils/mediaHeaders.ts
function applyGoogleHeaders(res, headers, status) {
  if (!headers) {
    res.status(status);
    return;
  }
  const h = headers;
  const ct = h["content-type"] ?? h["Content-Type"];
  if (ct) res.setHeader("Content-Type", ct);
  const cr = h["content-range"] ?? h["Content-Range"];
  if (cr) res.setHeader("Content-Range", cr);
  const cl = h["content-length"] ?? h["Content-Length"];
  if (cl) res.setHeader("Content-Length", cl);
  const ar = h["accept-ranges"] ?? h["Accept-Ranges"];
  if (ar) res.setHeader("Accept-Ranges", ar);
  res.status(status);
}

// server/routes/media.ts
var mediaRouter = Router4();
mediaRouter.get(
  "/media/audio/:fileId",
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const range = req.headers.range;
    try {
      const auth = await getOAuth2ClientForDrive();
      const drive = google2.drive({ version: "v3", auth });
      const gRes = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        {
          responseType: "stream",
          headers: range ? { Range: range } : void 0
        }
      );
      const stream = gRes.data;
      applyGoogleHeaders(res, gRes.headers, gRes.status ?? 200);
      stream.on("error", (err) => {
        console.error("Drive stream error", err);
        if (!res.headersSent) res.status(502).end();
        else res.destroy();
      });
      stream.pipe(res);
    } catch (e) {
      const err = e;
      console.error("media audio", err);
      if (err.code === "NOT_CONNECTED") {
        res.status(503).json({ error: "Drive not configured" });
        return;
      }
      res.status(err.response?.status ?? 500).json({ error: err.message });
    }
  })
);
mediaRouter.get(
  "/media/image/:fileId",
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const range = req.headers.range;
    try {
      const auth = await getOAuth2ClientForDrive();
      const drive = google2.drive({ version: "v3", auth });
      const gRes = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        {
          responseType: "stream",
          headers: range ? { Range: range } : void 0
        }
      );
      const stream = gRes.data;
      applyGoogleHeaders(res, gRes.headers, gRes.status ?? 200);
      stream.on("error", (err) => {
        console.error("Drive stream error", err);
        if (!res.headersSent) res.status(502).end();
        else res.destroy();
      });
      stream.pipe(res);
    } catch (e) {
      const err = e;
      if (err.code === "NOT_CONNECTED") {
        res.status(503).json({ error: "Drive not configured" });
        return;
      }
      res.status(500).json({ error: e.message });
    }
  })
);

// server/routes/health.ts
import { Router as Router5 } from "express";
var healthRouter = Router5();
healthRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// server/app.ts
function mountApiRoutes(app2) {
  app2.use(cookieParser());
  app2.use(express.json());
  app2.use("/api", tracksRouter);
  app2.use("/api", authRouter);
  app2.use("/api", adminRouter);
  app2.use("/api", mediaRouter);
  app2.use("/api", healthRouter);
}
function mountErrorHandler(app2) {
  app2.use((err, _req, res, _next) => {
    console.error(err);
    const typed = err;
    const status = typed.code === "UPLOAD_VALIDATION_FAILED" ? 400 : typed.code === "NOT_CONNECTED" || typed.code === "PERSISTENT_STORAGE_REQUIRED" ? 503 : typed.code === "DRIVE_INIT_FAILED" || typed.code === "DRIVE_AUTH_FAILED" ? 502 : 500;
    res.status(status).json({ error: err.message });
  });
}
function createApiApp() {
  const app2 = express();
  app2.set("trust proxy", 1);
  app2.use((req, _res, next) => {
    const u = req.url ?? "";
    if (u === "/" || u === "") {
      next();
      return;
    }
    const pathOnly = u.split("?")[0] ?? "";
    if (pathOnly !== "/" && !pathOnly.startsWith("/api")) {
      req.url = "/api" + (u.startsWith("/") ? u : `/${u}`);
    }
    next();
  });
  mountApiRoutes(app2);
  mountErrorHandler(app2);
  return app2;
}

// api/_handler.ts
var app = createApiApp();
var handler_default = app;
export {
  handler_default as default
};
