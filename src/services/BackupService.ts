/**
 * Whole-data backup (BACKUP_RECOVERY.md §3, §6). Builds the `.tolits` archive
 * (manifest.json + data.json + files/) and either shares it (user-facing
 * backup) or writes it to a fixed internal path (pre-restore safety snapshot,
 * §4 step 5). RestoreService is the only other consumer of `buildArchive`.
 *
 * Scope note (docs/PROGRESS.md): archives are built fully in memory, not
 * streamed to disk table-by-table/file-by-file as ADR-026 asks for. Correct
 * for realistic data sizes (a few thousand records, tens of MB of photos);
 * the true streaming guarantee against a 300 MB archive on a 2 GB device is
 * unverified and left as follow-up work requiring on-device testing.
 */

import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { rawDb } from '@/db/client';
import { SettingsRepository } from '@/db/repositories/SettingsRepository';
import { nowMs, toIsoDate } from '@/lib/dates';
import { log } from '@/lib/log';
import { appError, err, ok, type Result } from '@/lib/result';
import { basenameOf, collectReferencedFilePaths } from './backupData';
import {
  BACKUP_TABLE_ORDER,
  type BackupData,
  type BackupManifest,
  type BackupTableName,
} from './validation/backupSchemas';
import { buildZip } from './adapters/archive';
import { guardService } from './serviceUtils';

const FORMAT_VERSION = 1;
const ENTITLEMENT_KEY_PREFIX = 'entitlement_';
const INTERNAL_BACKUPS_DIR = 'backups';
const INTERNAL_SNAPSHOT_NAME = 'pre-restore-safety.tolits';

export function currentSchemaVersion(): number {
  return rawDb.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
}

function appVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

function dumpTable(table: BackupTableName): Record<string, unknown>[] {
  return rawDb.getAllSync<Record<string, unknown>>(`SELECT * FROM ${table}`);
}

function dumpAppSettings(): { key: string; value: string; updated_at: number }[] {
  return rawDb.getAllSync<{ key: string; value: string; updated_at: number }>(
    `SELECT * FROM app_settings WHERE key NOT LIKE '${ENTITLEMENT_KEY_PREFIX}%'`,
  );
}

/** Gathers every user-data table + filtered app_settings — the archive's `data.json`. */
export function gatherBackupData(): BackupData {
  const data = {} as BackupData;
  for (const table of BACKUP_TABLE_ORDER) {
    (data as Record<string, unknown>)[table] = dumpTable(table);
  }
  data.app_settings = dumpAppSettings();
  return data;
}

export interface BuiltArchive {
  bytes: Uint8Array;
  manifest: BackupManifest;
}

/** Builds the full archive bytes (manifest + data.json + files/) — shared by backup and safety-snapshot. */
export function buildArchive(): BuiltArchive {
  const data = gatherBackupData();
  const filePaths = collectReferencedFilePaths(data);

  const fileEntries: { path: string; bytes: Uint8Array }[] = [];
  let totalFileBytes = 0;
  for (const relativePath of filePaths) {
    // relativePath is like 'documents/<uuid>.jpg' (FileAdapter convention) — stored under files/ by basename,
    // re-joined under 'documents/' again on restore (RestoreService.ts).
    const file = new File(Paths.document, relativePath);
    if (!file.exists) {
      continue; // missing files are a restore-time warning, not a backup-time failure
    }
    const bytes = file.bytesSync();
    fileEntries.push({ path: `files/${basenameOf(relativePath)}`, bytes });
    totalFileBytes += bytes.length;
  }

  const counts: Record<string, number> = {};
  for (const table of BACKUP_TABLE_ORDER) {
    counts[table] = (data[table] as unknown[]).length;
  }
  counts.app_settings = data.app_settings.length;

  const manifest: BackupManifest = {
    formatVersion: FORMAT_VERSION,
    appVersion: appVersion(),
    schemaVersion: currentSchemaVersion(),
    createdAt: nowMs(),
    counts,
    fileCount: fileEntries.length,
    totalFileBytes,
  };

  const bytes = buildZip([
    { path: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) },
    { path: 'data.json', bytes: new TextEncoder().encode(JSON.stringify(data)) },
    ...fileEntries,
  ]);

  return { bytes, manifest };
}

function backupFilename(): string {
  const now = new Date();
  const date = toIsoDate(now).replace(/-/g, '');
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  return `tolits-backup-${date}-${time}.tolits`;
}

/** User-facing "Create backup" (S-32): builds the archive, opens the share sheet, marks `last_backup_at`. */
export function createBackup(): Result<{ fileUri: string; sizeBytes: number }> {
  return guardService('backup.create', () => {
    try {
      const { bytes } = buildArchive();
      const destination = new File(Paths.cache, backupFilename());
      if (destination.exists) {
        destination.delete();
      }
      destination.write(bytes);
      SettingsRepository.set('last_backup_at', nowMs());
      log.info('backup.create.success', { sizeBytes: bytes.length });
      return ok({ fileUri: destination.uri, sizeBytes: bytes.length });
    } catch (cause) {
      log.error('backup.create.failed', { error: String(cause) });
      return err(appError('FileError', 'backup.createFailed', 'Could not create the backup file'));
    }
  });
}

/** Opens the OS share sheet for an already-created backup file (kept separate from creation for testability). */
export async function shareBackup(fileUri: string): Promise<Result<void>> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      return err(appError('FileError', 'backup.shareUnavailable', 'Sharing is not available on this device'));
    }
    await Sharing.shareAsync(fileUri);
    return ok(undefined);
  } catch (cause) {
    log.error('backup.share.failed', { error: String(cause) });
    return err(appError('FileError', 'backup.shareFailed', 'Could not open the share sheet'));
  }
}

/**
 * Internal pre-restore safety snapshot (§4 step 5) — overwrites the previous
 * one (kept: last 1). Never shared; only the recovery screen offers it.
 */
export function createInternalSafetySnapshot(): Result<string> {
  return guardService('backup.safetySnapshot', () => {
    try {
      const { bytes } = buildArchive();
      const dir = new Directory(Paths.document, INTERNAL_BACKUPS_DIR);
      if (!dir.exists) {
        dir.create({ intermediates: true });
      }
      const destination = new File(dir, INTERNAL_SNAPSHOT_NAME);
      if (destination.exists) {
        destination.delete();
      }
      destination.write(bytes);
      return ok(destination.uri);
    } catch (cause) {
      log.error('backup.safetySnapshot.failed', { error: String(cause) });
      return err(appError('FileError', 'backup.safetySnapshotFailed', 'Could not create the safety snapshot'));
    }
  });
}

/**
 * Delete-all-data (SECURITY.md §6, "nothing retained anywhere"): removes the
 * internal pre-restore safety snapshot, which is a full copy of the user's
 * data. Throws on file-system failure; the caller decides how to report it.
 */
export function deleteInternalBackups(): void {
  const dir = new Directory(Paths.document, INTERNAL_BACKUPS_DIR);
  if (dir.exists) {
    dir.delete();
  }
}
