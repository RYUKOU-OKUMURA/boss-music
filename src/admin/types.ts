export type UploadKind = 'audio' | 'image';

export interface StorageStatusResponse {
  configOk: boolean;
  storage: string;
  missing?: string[];
  reason?: string;
}

export interface UploadedBlobInfo {
  url: string;
  pathname: string;
  size: number;
  contentType: string;
}
