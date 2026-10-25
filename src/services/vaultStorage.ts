/**
 * VeraTrace — Digital Evidence Preservation & Forensics
 * Service: Browser IndexedDB Vault Storage (vaultStorage.ts)
 *
 * Persists original raw evidence binary files (Blobs/ArrayBuffers) linked to their evidence IDs.
 * Restores them across browser refreshes, tab restarts, and offline sessions.
 * Never silently substitutes metadata placeholders for missing files.
 */

const DB_NAME = 'veratrace_vault_v1';
const DB_VERSION = 1;
const STORE_NAME = 'evidence_files';

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;

function hasIndexedDb(): boolean {
  return typeof globalThis !== 'undefined' && 'indexedDB' in globalThis && globalThis.indexedDB !== null;
}

/**
 * Opens or retrieves the singleton IndexedDB instance.
 */
export function getVaultDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) {
    return Promise.resolve(null);
  }

  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve) => {
    try {
      const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'evidenceId' });
        }
      };

      request.onsuccess = (event: Event) => {
        dbInstance = (event.target as IDBOpenDBRequest).result;
        resolve(dbInstance);
      };

      request.onerror = (err) => {
        console.warn('Failed to open IndexedDB veratrace_vault_v1:', err);
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB unavailable in current context:', err);
      resolve(null);
    }
  });

  return dbPromise;
}

// In-memory fallback when IndexedDB is unavailable (e.g. Node/Vitest test environment)
const memoryVault = new Map<string, ArrayBuffer>();

export interface StoredEvidenceFile {
  evidenceId: string;
  data: ArrayBuffer | Blob;
  storedAtUtc: string;
}

/**
 * Persists an original evidence file binary payload into IndexedDB (or fallback memory vault).
 */
export async function saveVaultBlob(
  evidenceId: string,
  data: Blob | ArrayBuffer | Uint8Array
): Promise<void> {
  if (!evidenceId) return;
  const arrayBuffer: ArrayBuffer =
    data instanceof ArrayBuffer
      ? data
      : data instanceof Uint8Array
        ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
        : await data.arrayBuffer();

  const db = await getVaultDb();
  if (!db) {
    memoryVault.set(evidenceId.trim(), arrayBuffer);
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StoredEvidenceFile = {
        evidenceId: evidenceId.trim(),
        data: arrayBuffer,
        storedAtUtc: new Date().toISOString(),
      };
      const putReq = store.put(record);

      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    } catch (err) {
      console.warn('Error saving to vault IndexedDB:', err);
      memoryVault.set(evidenceId.trim(), arrayBuffer);
      resolve();
    }
  });
}

/**
 * Retrieves the preserved raw binary payload for an evidence ID from IndexedDB.
 */
export async function getVaultBlob(
  evidenceId: string
): Promise<ArrayBuffer | Blob | null> {
  if (!evidenceId) return null;
  const db = await getVaultDb();
  if (!db) {
    return memoryVault.get(evidenceId.trim()) || null;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(evidenceId.trim());

      getReq.onsuccess = () => {
        const result = getReq.result as StoredEvidenceFile | undefined;
        if (result && result.data) {
          resolve(result.data);
        } else {
          resolve(memoryVault.get(evidenceId.trim()) || null);
        }
      };

      getReq.onerror = () => {
        resolve(memoryVault.get(evidenceId.trim()) || null);
      };
    } catch {
      resolve(memoryVault.get(evidenceId.trim()) || null);
    }
  });
}

/**
 * Checks whether the original binary payload for an evidence ID is stored in the vault.
 */
export async function hasVaultBlob(evidenceId: string): Promise<boolean> {
  const blob = await getVaultBlob(evidenceId);
  return blob !== null;
}

/**
 * Removes a preserved binary file from IndexedDB.
 */
export async function deleteVaultBlob(evidenceId: string): Promise<void> {
  if (!evidenceId) return;
  memoryVault.delete(evidenceId.trim());
  const db = await getVaultDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const delReq = store.delete(evidenceId.trim());

      delReq.onsuccess = () => resolve();
      delReq.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Clears all stored files from the vault (for testing / reset).
 */
export async function clearVault(): Promise<void> {
  memoryVault.clear();
  const db = await getVaultDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const clearReq = store.clear();

      clearReq.onsuccess = () => resolve();
      clearReq.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
