export type UploadKind = 'audio' | 'image';

export interface StorageStatusResponse {
  configOk: boolean;
  dbOk?: boolean;
  blobOk?: boolean;
  adminSecretConfigured?: boolean;
  storage: string;
  missing?: string[];
  reason?: string;
}

export interface AuthStatusResponse {
  adminSecretConfigured: boolean;
  authenticated?: boolean;
}

export type AdminAuthState =
  | 'unknown'
  | 'ok'
  | 'missing_secret'
  | 'invalid_secret'
  | 'server_unconfigured';

export interface UploadedBlobInfo {
  url: string;
  pathname: string;
  size: number;
  contentType: string;
}
