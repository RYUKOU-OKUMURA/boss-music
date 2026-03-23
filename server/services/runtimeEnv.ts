import { isRedisConfigured } from './redisStore';

export type StorageMode = 'redis' | 'local';

export interface PersistenceStatus {
  storage: StorageMode;
  configOk: boolean;
  reason?: string;
}

export function isVercelRuntime(): boolean {
  return process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV?.trim());
}

export function getPersistenceStatus(): PersistenceStatus {
  if (isRedisConfigured()) {
    return { storage: 'redis', configOk: true };
  }
  if (isVercelRuntime()) {
    return {
      storage: 'local',
      configOk: false,
      reason: 'Vercel 本番では Upstash Redis の設定が必須です。',
    };
  }
  return { storage: 'local', configOk: true };
}

export function assertPersistentStorageConfigured(): PersistenceStatus {
  const status = getPersistenceStatus();
  if (status.configOk) return status;
  const err = new Error(status.reason || 'Persistent storage is required') as Error & { code?: string };
  err.code = 'PERSISTENT_STORAGE_REQUIRED';
  throw err;
}
