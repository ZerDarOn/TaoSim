import type { SavePayload, SaveHeader } from '@taosim/contracts';
import type { IStorageAdapter } from './storage-adapter.js';

const DB_NAME = 'taosim_saves';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

export class IndexedDBStorageAdapter implements IStorageAdapter {
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'header.saveId' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async save(payload: SavePayload): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async load(saveId: string): Promise<SavePayload | null> {
    if (!this.db) throw new Error('IndexedDB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(saveId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async listHeaders(): Promise<SaveHeader[]> {
    if (!this.db) throw new Error('IndexedDB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const payloads = request.result as SavePayload[];
        resolve(payloads.map(p => p.header));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSave(saveId: string): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(saveId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
