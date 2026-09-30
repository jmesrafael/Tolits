/**
 * File-system adapter (SOFTWARE_ARCHITECTURE.md §1.5) — the only module that
 * touches expo-file-system. Documents live in app-private storage; the DB
 * stores relative paths only (SECURITY.md §4).
 */

import { Directory, File, Paths } from 'expo-file-system';

const DOCUMENTS_DIR = 'documents';

export interface StoredFile {
  /** Relative path stored in the DB, e.g. 'documents/<uuid>.jpg'. */
  relativePath: string;
  size: number;
}

function documentsDirectory(): Directory {
  const dir = new Directory(Paths.document, DOCUMENTS_DIR);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

/** File extension from a name/uri, normalized without the dot. */
function extensionOf(nameOrUri: string): string {
  const match = /\.([A-Za-z0-9]{1,8})(?:\?.*)?$/.exec(nameOrUri);
  return match?.[1]?.toLowerCase() ?? 'bin';
}

export const FileAdapter = {
  /** Copies a picked file into app storage under a UUID filename (DATA_FLOW.md §6). */
  importFile(sourceUri: string, fileId: string, originalName: string): StoredFile {
    const dir = documentsDirectory();
    const filename = `${fileId}.${extensionOf(originalName !== '' ? originalName : sourceUri)}`;
    const source = new File(sourceUri);
    const destination = new File(dir, filename);
    source.copy(destination);
    return {
      relativePath: `${DOCUMENTS_DIR}/${filename}`,
      size: destination.size ?? 0,
    };
  },

  /** Absolute URI for display/sharing from a stored relative path. */
  uriFor(relativePath: string): string {
    return new File(Paths.document, relativePath).uri;
  },

  deleteFile(relativePath: string): void {
    const file = new File(Paths.document, relativePath);
    if (file.exists) {
      file.delete();
    }
  },

  /**
   * Delete-all-data (SECURITY.md §6): removes every stored user file — all
   * documents, receipts and photos live under this one directory. It is
   * recreated lazily on the next import. Throws on file-system failure.
   */
  deleteAllStoredFiles(): void {
    const dir = new Directory(Paths.document, DOCUMENTS_DIR);
    if (dir.exists) {
      dir.delete();
    }
  },
};
