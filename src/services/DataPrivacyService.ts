/**
 * Delete-all-data (S-33, DEVELOPMENT_RULES.md §14 — privacy by minimization,
 * "delete-all really deletes"; SECURITY.md §6: DB wiped, files deleted,
 * notifications cancelled, settings reset). Hard-deletes every user-data row;
 * unlike normal mutations this bypasses soft delete by design.
 *
 * Foreign keys stay ON: rows are deleted children-first so no RESTRICT
 * constraint can fire (builds → motorcycles and build_plan_items → builds are
 * RESTRICT; forgetting them used to make the whole wipe fail).
 */

import { inTransaction, rawDb } from '@/db/client';
import { emitDomainEvent } from '@/lib/events';
import { log } from '@/lib/log';
import { appError, err, ok, type Result } from '@/lib/result';
import { FileAdapter } from './adapters/files';
import { deleteInternalBackups } from './BackupService';
import { cancelAllOwnedNotifications } from './NotificationScheduler';
import { BACKUP_TABLE_ORDER } from './validation/backupSchemas';

/**
 * Every user-data table, children before parents. BACKUP_TABLE_ORDER is the
 * canonical parents-first list of all user-data tables (restore inserts in
 * that order), so its reverse is a dependency-safe delete order — and a new
 * user table added to backup is automatically covered here.
 */
export const DELETE_ORDER: readonly string[] = [...BACKUP_TABLE_ORDER].reverse();

/** Operational tables with user-derived rows (no FKs), also wiped. */
const OPERATIONAL_TABLES = ['scheduled_notifications'];

/** Settings row that describes the install, not the user (DATABASE_DESIGN.md §9). */
const KEPT_SETTING_KEY = 'schema_seed_version';

export interface DeleteAllOutcome {
  /** false when the DB was wiped but stored files could not all be removed. */
  filesRemoved: boolean;
}

export const DataPrivacyService = {
  /**
   * Database part of delete-all, in one transaction: all-or-nothing. Throws on
   * failure (the transaction rolls back and nothing is deleted).
   */
  wipeDatabase(): void {
    inTransaction(() => {
      for (const table of [...DELETE_ORDER, ...OPERATIONAL_TABLES]) {
        rawDb.execSync(`DELETE FROM ${table}`);
      }
      rawDb.execSync(`DELETE FROM app_settings WHERE key != '${KEPT_SETTING_KEY}'`);
    });
  },

  /**
   * Full delete-all: cancel OS notifications first (re-planning afterwards
   * could only cancel what `scheduled_notifications` still lists), then the
   * database, then stored files. Files go last so a failed DB wipe never
   * leaves rows pointing at deleted files.
   */
  async deleteAllData(): Promise<Result<DeleteAllOutcome>> {
    await cancelAllOwnedNotifications();

    try {
      this.wipeDatabase();
    } catch (cause) {
      log.error('privacy.deleteAll.dbFailed', { error: String(cause) });
      return err(appError('DbError', 'privacy.deleteAllFailed', 'Could not delete your data. Nothing was deleted.'));
    }

    let filesRemoved = true;
    try {
      FileAdapter.deleteAllStoredFiles();
      deleteInternalBackups();
    } catch (cause) {
      filesRemoved = false;
      log.error('privacy.deleteAll.filesFailed', { error: String(cause) });
    }

    emitDomainEvent('bike:changed');
    emitDomainEvent('settings:changed');
    return ok({ filesRemoved });
  },
};
