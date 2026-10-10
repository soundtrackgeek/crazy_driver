/** IndexedDB storage for the player's own music files, so they survive reloads. */

export interface StoredTrack {
  id: number;
  name: string;
  blob: Blob;
}

const DB = 'crazy-driver';
const STORE = 'music';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const MusicStore = {
  list: () => run<StoredTrack[]>('readonly', (s) => s.getAll() as IDBRequest<StoredTrack[]>),
  add: (name: string, blob: Blob) => run<IDBValidKey>('readwrite', (s) => s.add({ name, blob })),
  remove: (id: number) => run<undefined>('readwrite', (s) => s.delete(id)),
};
