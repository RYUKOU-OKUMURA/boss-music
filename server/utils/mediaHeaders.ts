import { Response } from 'express';

export function applyGoogleHeaders(
  res: Response,
  headers: Record<string, unknown> | undefined,
  status: number
) {
  if (!headers) {
    res.status(status);
    return;
  }
  const h = headers as Record<string, string | undefined>;
  const ct = h['content-type'] ?? h['Content-Type'];
  if (ct) res.setHeader('Content-Type', ct);
  const cr = h['content-range'] ?? h['Content-Range'];
  if (cr) res.setHeader('Content-Range', cr);
  const cl = h['content-length'] ?? h['Content-Length'];
  if (cl) res.setHeader('Content-Length', cl);
  const ar = h['accept-ranges'] ?? h['Accept-Ranges'];
  if (ar) res.setHeader('Accept-Ranges', ar);
  res.status(status);
}
