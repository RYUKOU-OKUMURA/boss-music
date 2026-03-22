import crypto from 'crypto';
import { Router } from 'express';
import { saveRefreshToken } from '../services/tokenStore';
import { createOAuth2Client, SCOPES } from '../services/driveClient';
import { adminCookieName, createAdminSessionToken } from '../middleware/adminAuth';
import { asyncHandler } from '../utils/asyncHandler';
import { saveOAuthState, consumeOAuthState } from '../services/oauthStateStore';

export const authRouter = Router();

authRouter.get(
  '/auth/google',
  asyncHandler(async (_req, res) => {
    const state = crypto.randomBytes(24).toString('hex');
    await saveOAuthState(state);
    const oauth2 = createOAuth2Client();
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state,
    });
    res.redirect(url);
  })
);

authRouter.get(
  '/auth/google/callback',
  asyncHandler(async (req, res) => {
    const { code, state } = req.query;
    if (typeof code !== 'string' || typeof state !== 'string') {
      res.status(400).send('Missing code or state');
      return;
    }
    const ok = await consumeOAuthState(state);
    if (!ok) {
      res.status(400).send('Invalid or expired state');
      return;
    }
    const oauth2 = createOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      res
        .status(400)
        .send(
          'No refresh token returned. Revoke app access in Google Account settings and try again with prompt=consent.'
        );
      return;
    }
    await saveRefreshToken(tokens.refresh_token);

    const sessionTok = createAdminSessionToken();
    if (sessionTok) {
      res.cookie(adminCookieName, sessionTok, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    res.type('html').send(`<!DOCTYPE html><html><body>
      <p>Google Drive と連携しました。このウィンドウを閉じて管理画面に戻ってください。</p>
      <script>setTimeout(() => window.close(), 1500);</script>
    </body></html>`);
  })
);
