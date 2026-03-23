import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { loadRefreshToken } from './tokenStore';

const SCOPES = ['https://www.googleapis.com/auth/drive'];

export function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_URI are required');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export { SCOPES };

export async function getOAuth2ClientForDrive(): Promise<OAuth2Client> {
  const oauth2 = createOAuth2Client();
  const rt = await loadRefreshToken();
  if (!rt) {
    const err = new Error('Drive not connected') as Error & { code: string };
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  oauth2.setCredentials({ refresh_token: rt });
  return oauth2;
}

export async function getDrive() {
  const auth = await getOAuth2ClientForDrive();
  return google.drive({ version: 'v3', auth });
}

export async function getConnectedDriveUser() {
  const drive = await getDrive();
  const response = await drive.about.get({
    fields: 'user(displayName,emailAddress)',
  });
  return {
    displayName: response.data.user?.displayName ?? null,
    emailAddress: response.data.user?.emailAddress ?? null,
  };
}

export function getDriveFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!id) throw new Error('GOOGLE_DRIVE_FOLDER_ID is required');
  return id;
}
