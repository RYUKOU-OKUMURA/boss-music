export type StorageMode = 'redis' | 'local';
export type UploadKind = 'audio' | 'image';

export interface DriveStatusResponse {
  connected: boolean;
  storage: StorageMode;
  configOk: boolean;
  reason?: string;
}

export interface GoogleUploadConfigResponse {
  clientId: string;
  folderId: string;
  connectedUser: {
    displayName: string | null;
    emailAddress: string | null;
  };
}

export interface BrowserDriveUser {
  displayName: string | null;
  emailAddress: string | null;
}

export interface BrowserUploadSession {
  fileId: string;
  fileName: string;
  sessionUrl: string;
}

export interface PutResult {
  status: number;
  range: string | null;
}

export interface CachedDriveToken {
  accessToken: string;
  expiresAt: number;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            login_hint?: string;
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
              expires_in?: number;
            }) => void;
            error_callback?: (error: { type?: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
  }
}
