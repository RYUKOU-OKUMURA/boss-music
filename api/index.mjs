// server/app.ts
import express from "express";
import cookieParser from "cookie-parser";

// server/routes/tracks.ts
import { Router } from "express";

// server/services/tracksDb.ts
import { neon } from "@neondatabase/serverless";
var schemaReady = null;
function getSql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    const err = new Error("DATABASE_URL is required");
    err.code = "DB_NOT_CONFIGURED";
    throw err;
  }
  return neon(url);
}
function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().split("T")[0] ?? value.toISOString();
  return value.includes("T") ? value.split("T")[0] ?? value : value;
}
function parseTags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag)).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((tag) => String(tag)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}
function toNumber(value) {
  if (value === null) return void 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : void 0;
}
function mapTrack(row) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    description: row.description ?? "",
    createdAt: dateOnly(row.created_at),
    tags: parseTags(row.tags),
    playable: row.playable,
    order: row.sort_order,
    audioUrl: row.audio_url,
    audioPath: row.audio_path,
    audioSize: toNumber(row.audio_size) ?? 0,
    audioContentType: row.audio_content_type,
    ...row.cover_url ? { coverUrl: row.cover_url } : {},
    ...row.cover_path ? { coverPath: row.cover_path } : {},
    ...row.cover_size !== null ? { coverSize: toNumber(row.cover_size) ?? 0 } : {},
    ...row.cover_content_type ? { coverContentType: row.cover_content_type } : {}
  };
}
async function ensureTracksSchema() {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS tracks (
        id text PRIMARY KEY,
        title text NOT NULL,
        artist text NOT NULL,
        description text,
        created_at date NOT NULL DEFAULT CURRENT_DATE,
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        playable boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0,
        audio_url text NOT NULL,
        audio_path text NOT NULL,
        audio_size bigint NOT NULL,
        audio_content_type text NOT NULL,
        cover_url text,
        cover_path text,
        cover_size bigint,
        cover_content_type text,
        inserted_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `.then(() => void 0);
  }
  await schemaReady;
}
async function listTracks() {
  await ensureTracksSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT *
    FROM tracks
    ORDER BY sort_order ASC, inserted_at ASC
  `;
  return rows.map(mapTrack);
}
async function addTrack(input) {
  await ensureTracksSchema();
  const sql = getSql();
  const rows = await sql`
    INSERT INTO tracks (
      id,
      title,
      artist,
      description,
      created_at,
      tags,
      playable,
      sort_order,
      audio_url,
      audio_path,
      audio_size,
      audio_content_type,
      cover_url,
      cover_path,
      cover_size,
      cover_content_type
    )
    VALUES (
      ${input.id},
      ${input.title},
      ${input.artist},
      ${input.description},
      CURRENT_DATE,
      ${JSON.stringify(input.tags)}::jsonb,
      true,
      (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM tracks),
      ${input.audio.url},
      ${input.audio.pathname},
      ${input.audio.size},
      ${input.audio.contentType},
      ${input.cover?.url ?? null},
      ${input.cover?.pathname ?? null},
      ${input.cover?.size ?? null},
      ${input.cover?.contentType ?? null}
    )
    RETURNING *
  `;
  const row = rows[0];
  if (!row) throw new Error("Failed to add track");
  return mapTrack(row);
}
async function findTrackById(id) {
  await ensureTracksSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT *
    FROM tracks
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ? mapTrack(rows[0]) : null;
}
async function updateTrackCoverById(id, cover) {
  await ensureTracksSchema();
  const before = await findTrackById(id);
  if (!before) {
    const err = new Error("Track not found");
    err.code = "TRACK_NOT_FOUND";
    throw err;
  }
  const sql = getSql();
  const rows = await sql`
    UPDATE tracks
    SET
      cover_url = ${cover?.url ?? null},
      cover_path = ${cover?.pathname ?? null},
      cover_size = ${cover?.size ?? null},
      cover_content_type = ${cover?.contentType ?? null},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  const row = rows[0];
  if (!row) throw new Error("Failed to update track cover");
  return {
    track: mapTrack(row),
    ...before.coverPath ? { oldCoverPath: before.coverPath } : {}
  };
}
async function removeTrackById(id) {
  await ensureTracksSchema();
  const sql = getSql();
  const rows = await sql`
    DELETE FROM tracks
    WHERE id = ${id}
    RETURNING *
  `;
  const row = rows[0];
  if (!row) {
    const err = new Error("Track not found");
    err.code = "TRACK_NOT_FOUND";
    throw err;
  }
  return mapTrack(row);
}

// server/utils/asyncHandler.ts
function asyncHandler(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// server/utils/trackPublic.ts
function toPublicTrack(t) {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    description: t.description,
    createdAt: t.createdAt,
    tags: t.tags,
    playable: t.playable,
    order: t.order,
    audioUrl: t.audioUrl,
    coverImage: t.coverUrl ?? ""
  };
}

// server/routes/tracks.ts
var tracksRouter = Router();
tracksRouter.get(
  "/tracks",
  asyncHandler(async (_req, res) => {
    try {
      const tracks = await listTracks();
      res.json({
        version: 1,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        tracks: tracks.map(toPublicTrack)
      });
    } catch (e) {
      const err = e;
      if (err.code === "DB_NOT_CONFIGURED") {
        res.status(503).json({ error: err.message, tracks: [] });
        return;
      }
      throw e;
    }
  })
);

// server/routes/admin.ts
import { Router as Router2 } from "express";
import { list } from "@vercel/blob";
import { handleUpload } from "@vercel/blob/client";

// server/services/blobUploads.ts
import { del, head } from "@vercel/blob";
var MAX_AUDIO_BYTES = 150 * 1024 * 1024;
var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
var AUDIO_TYPES = ["audio/mpeg", "audio/mp3"];
var IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
function allowedContentTypes(kind) {
  return kind === "audio" ? AUDIO_TYPES : IMAGE_TYPES;
}
function maxUploadBytes(kind) {
  return kind === "audio" ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
}
function isAllowedContentType(kind, contentType) {
  return allowedContentTypes(kind).includes(contentType.trim().toLowerCase());
}
function normalizeContentType(contentType) {
  return String(contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}
function parseUploadKind(value) {
  if (value === "audio" || value === "image") return value;
  const err = new Error("Invalid upload kind");
  err.code = "UPLOAD_VALIDATION_FAILED";
  throw err;
}
function validateBlobUpload(kind, payload) {
  const url = String(payload.url ?? "").trim();
  const pathname = String(payload.pathname ?? "").trim();
  const contentType = normalizeContentType(payload.contentType);
  const size = Number(payload.size);
  if (!url || !pathname) {
    throwUploadError("Blob upload metadata is incomplete.");
  }
  if (!url.startsWith("https://")) {
    throwUploadError("Blob URL must be an HTTPS URL.");
  }
  if (!pathname.startsWith("tracks/")) {
    throwUploadError("Blob pathname is outside the expected tracks/ folder.");
  }
  if (!Number.isFinite(size) || size <= 0) {
    throwUploadError("Blob upload size is invalid.");
  }
  if (size > maxUploadBytes(kind)) {
    throwUploadError(`${kind === "audio" ? "MP3" : "\u753B\u50CF"} is too large.`);
  }
  if (!isAllowedContentType(kind, contentType)) {
    throwUploadError(`${kind === "audio" ? "MP3" : "\u753B\u50CF"} content type is not allowed.`);
  }
  return { url, pathname, size, contentType };
}
async function verifyBlobUpload(kind, payload) {
  const validated = validateBlobUpload(kind, payload);
  let metadata;
  try {
    metadata = await head(validated.pathname);
  } catch {
    throwUploadError("Uploaded blob was not found in this Blob store.");
  }
  const actualContentType = normalizeContentType(metadata.contentType);
  if (metadata.url !== validated.url) {
    throwUploadError("Blob URL does not match the uploaded pathname.");
  }
  if (metadata.size !== validated.size) {
    throwUploadError("Blob size does not match the uploaded file.");
  }
  if (!isAllowedContentType(kind, actualContentType)) {
    throwUploadError(`${kind === "audio" ? "MP3" : "\u753B\u50CF"} content type is not allowed.`);
  }
  return {
    url: metadata.url,
    pathname: metadata.pathname,
    size: metadata.size,
    contentType: actualContentType
  };
}
async function deleteBlobIfPresent(pathname) {
  if (!pathname) return true;
  try {
    await del(pathname);
    return true;
  } catch (error) {
    console.error(`Failed to delete blob ${pathname}`, error);
    return false;
  }
}
function throwUploadError(message) {
  const err = new Error(message);
  err.code = "UPLOAD_VALIDATION_FAILED";
  throw err;
}

// server/middleware/adminAuth.ts
import crypto from "crypto";
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
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
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
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
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

// server/routes/admin.ts
var adminRouter = Router2();
function splitTags(input) {
  if (Array.isArray(input)) {
    return input.map((tag) => String(tag).trim()).filter(Boolean);
  }
  const raw = String(input ?? "").trim();
  if (!raw) return [];
  return raw.split(",").map((tag) => tag.trim()).filter(Boolean);
}
function parseClientPayload(payload) {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function isValidationError(error) {
  return typeof error === "object" && error !== null && "code" in error;
}
function isTrackNotFound(error) {
  return isValidationError(error) && error.code === "TRACK_NOT_FOUND";
}
function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function ensureExpectedPath(kind, pathname) {
  const audio = /^tracks\/([0-9a-f-]+)\/audio-[a-zA-Z0-9_-]+\.(mp3)$/i;
  const image = /^tracks\/([0-9a-f-]+)\/cover-[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i;
  const match = kind === "audio" ? audio.exec(pathname) : image.exec(pathname);
  if (!match?.[1] || !isUuidLike(match[1])) {
    const err = new Error("Blob upload pathname is not allowed");
    err.code = "UPLOAD_VALIDATION_FAILED";
    throw err;
  }
}
function safeStatusMessage(error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]");
}
async function getStorageStatus() {
  const missing = [];
  if (!process.env.DATABASE_URL?.trim()) missing.push("DATABASE_URL");
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) missing.push("BLOB_READ_WRITE_TOKEN");
  const base = {
    storage: "vercel-blob+neon",
    missing
  };
  if (missing.length) {
    return {
      ...base,
      configOk: false,
      reason: `${missing.join(", ")} is required`
    };
  }
  try {
    await list({ limit: 1 });
  } catch (error) {
    return {
      ...base,
      configOk: false,
      reason: `Vercel Blob check failed: ${safeStatusMessage(error)}`
    };
  }
  try {
    await ensureTracksSchema();
  } catch (error) {
    return {
      ...base,
      configOk: false,
      reason: `Neon DB check failed: ${safeStatusMessage(error)}`
    };
  }
  return {
    ...base,
    configOk: true
  };
}
adminRouter.get(
  "/admin/storage-status",
  asyncHandler(async (_req, res) => {
    const status = await getStorageStatus();
    res.json(status);
  })
);
adminRouter.post(
  "/admin/session",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const token = createAdminSessionToken();
    if (token) {
      res.cookie(adminCookieName, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1e3
      });
    }
    res.json({ ok: true, cookieSet: Boolean(token) });
  })
);
adminRouter.post(
  "/admin/blob-upload",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const jsonResponse = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const parsed = parseClientPayload(clientPayload);
        const kind = parseUploadKind(parsed.kind);
        ensureExpectedPath(kind, pathname);
        return {
          allowedContentTypes: allowedContentTypes(kind),
          maximumSizeInBytes: maxUploadBytes(kind),
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ kind })
        };
      }
    });
    res.json(jsonResponse);
  })
);
adminRouter.post(
  "/admin/upload/complete",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const trackId = String(body.trackId ?? "").trim();
    const title = String(body.title ?? "").trim();
    const artist = String(body.artist ?? "").trim();
    const description = String(body.description ?? "").trim();
    const tags = splitTags(body.tags);
    if (!trackId || !isUuidLike(trackId)) {
      res.status(400).json({ error: "valid trackId is required" });
      return;
    }
    if (!title || !artist) {
      res.status(400).json({ error: "title and artist are required" });
      return;
    }
    if (!body.audio) {
      res.status(400).json({ error: "audio blob metadata is required" });
      return;
    }
    let audio = null;
    let cover;
    try {
      audio = await verifyBlobUpload("audio", body.audio);
      ensureExpectedPath("audio", audio.pathname);
      if (body.cover) {
        cover = await verifyBlobUpload("image", body.cover);
        ensureExpectedPath("image", cover.pathname);
      }
      const track = await addTrack({
        id: trackId,
        title,
        artist,
        description,
        tags,
        audio,
        ...cover ? { cover } : {}
      });
      res.json({ track: toPublicTrack(track) });
    } catch (error) {
      if (audio) await deleteBlobIfPresent(audio.pathname);
      if (cover) await deleteBlobIfPresent(cover.pathname);
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
      error: "Legacy multipart upload is retired. Use browser-direct Vercel Blob upload from /admin and finish with /api/admin/upload/complete."
    });
  })
);
adminRouter.post(
  "/admin/tracks/:id/cover",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    const body = req.body ?? {};
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }
    if (!body.image) {
      res.status(400).json({ error: "image blob metadata is required" });
      return;
    }
    let image = null;
    try {
      image = await verifyBlobUpload("image", body.image);
      ensureExpectedPath("image", image.pathname);
      const { track, oldCoverPath } = await updateTrackCoverById(id, image);
      if (oldCoverPath && oldCoverPath !== image.pathname) {
        await deleteBlobIfPresent(oldCoverPath);
      }
      res.json({ track: toPublicTrack(track) });
    } catch (error) {
      if (image) await deleteBlobIfPresent(image.pathname);
      const err = error;
      if (isTrackNotFound(error)) {
        res.status(404).json({ error: "Track not found" });
        return;
      }
      if (isValidationError(error) && err.code === "UPLOAD_VALIDATION_FAILED") {
        res.status(400).json({ error: err.message });
        return;
      }
      throw error;
    }
  })
);
adminRouter.delete(
  "/admin/tracks/:id/cover",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }
    try {
      const { track, oldCoverPath } = await updateTrackCoverById(id, null);
      await deleteBlobIfPresent(oldCoverPath);
      res.json({ track: toPublicTrack(track) });
    } catch (error) {
      if (isTrackNotFound(error)) {
        res.status(404).json({ error: "Track not found" });
        return;
      }
      throw error;
    }
  })
);
adminRouter.delete(
  "/admin/tracks/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }
    const keepFiles = req.query.keepFiles === "1" || req.query.keepFiles === "true" || String(req.query.keepFiles ?? "").toLowerCase() === "yes";
    let removed;
    try {
      removed = await removeTrackById(id);
    } catch (error) {
      if (isTrackNotFound(error)) {
        res.status(404).json({ error: "Track not found" });
        return;
      }
      throw error;
    }
    const fileDeleteWarnings = [];
    if (!keepFiles) {
      const audioDeleted = await deleteBlobIfPresent(removed.audioPath);
      if (!audioDeleted) fileDeleteWarnings.push("audio");
      const coverDeleted = await deleteBlobIfPresent(removed.coverPath);
      if (!coverDeleted) fileDeleteWarnings.push("cover");
    }
    res.json({
      ok: true,
      id: removed.id,
      ...fileDeleteWarnings.length > 0 ? { fileDeleteWarnings } : {}
    });
  })
);

// server/routes/health.ts
import { Router as Router3 } from "express";
var healthRouter = Router3();
healthRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// server/app.ts
function mountApiRoutes(app2) {
  app2.use(cookieParser());
  app2.use(express.json());
  app2.use("/api", tracksRouter);
  app2.use("/api", adminRouter);
  app2.use("/api", healthRouter);
}
function mountErrorHandler(app2) {
  app2.use((err, _req, res, _next) => {
    console.error(err);
    const typed = err;
    const status = typed.code === "UPLOAD_VALIDATION_FAILED" ? 400 : typed.code === "DB_NOT_CONFIGURED" ? 503 : 500;
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
