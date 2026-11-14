// api pública del modo sin conexión: las pantallas importan desde acá

export { apiCacheInterceptor, SAVED_COPY_HEADER } from './api-cache.interceptor';
export { API_CACHE_MAX_ENTRIES, ApiCacheStore } from './api-cache-store';
export type { CachedResponse } from './api-cache-store';
export { ConnectionStatus } from './connection-status/connection-status';
export { Connectivity } from './connectivity';
export type { BackendStatus } from './connectivity';
export { describeBackendError, isConnectivityError } from './http-errors';
export { LotOutbox } from './lot-outbox';
export type { LotSaveResult, PendingLot, SyncedLot } from './lot-outbox';
export { provideOffline } from './provide-offline';
export { MemoryStorage, OFFLINE_STORAGE } from './storage';
export type { KeyValueStorage } from './storage';
export { RELOAD_PAGE, UpdateToast } from './update-toast/update-toast';
