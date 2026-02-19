// Storage module barrel — re-exports all storage interfaces, services, and utilities

export * from './interfaces.js';
export { FileStorageService } from './FileStorageService.js';
export { FileProjectStore } from './FileProjectStore.js';
export { getStoragePath, getLegacyElectronPath } from './storagePaths.js';
export {
  createVersionedBackup,
  pruneOldBackups,
  checkWriteGuard,
  MAX_VERSIONED_BACKUPS,
  type BackupFsDeps,
} from './backupService.js';
