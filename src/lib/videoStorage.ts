import type { HybridAssetItem, SavedRenderedVideo, VideoItem } from '../types/comic';

const DB_NAME = 'rafu_folk_video_vault_v1';
const DB_VERSION = 2;
const STORE_PROJECTS = 'video_projects';
const STORE_RENDERED = 'rendered_videos';
const STORE_ASSETS = 'custom_assets';

interface StoredRenderedRecord {
  meta: SavedRenderedVideo;
  blob: Blob;
}

export interface StoredHybridAssetRecord {
  asset: HybridAssetItem;
  dataUrl: string;
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_RENDERED)) {
        db.createObjectStore(STORE_RENDERED, { keyPath: 'meta.id' });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: 'asset.id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB unavailable'));
  });
}

export async function loadVideoProjectsFromVault(): Promise<VideoItem[]> {
  try {
    const db = await openVaultDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as VideoItem[]) || [];
        items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveVideoProjectsToVault(items: VideoItem[]): Promise<void> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      store.clear();
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB save projects warning:', err);
  }
}

export async function saveRenderedVideoToVault(
  meta: SavedRenderedVideo,
  blob: Blob
): Promise<void> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_RENDERED, 'readwrite');
      const store = tx.objectStore(STORE_RENDERED);
      const record: StoredRenderedRecord = { meta, blob };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB save rendered video warning:', err);
  }
}

export async function listRenderedVideosFromVault(): Promise<SavedRenderedVideo[]> {
  try {
    const db = await openVaultDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_RENDERED, 'readonly');
      const store = tx.objectStore(STORE_RENDERED);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result as StoredRenderedRecord[]) || [];
        const metas = records.map((r) => r.meta);
        metas.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        resolve(metas);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getRenderedVideoBlobFromVault(id: string): Promise<Blob | null> {
  try {
    const db = await openVaultDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_RENDERED, 'readonly');
      const store = tx.objectStore(STORE_RENDERED);
      const req = store.get(id);
      req.onsuccess = () => {
        const rec = req.result as StoredRenderedRecord | undefined;
        resolve(rec?.blob ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteRenderedVideoFromVault(id: string): Promise<void> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_RENDERED, 'readwrite');
      const store = tx.objectStore(STORE_RENDERED);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB delete rendered video warning:', err);
  }
}

export async function saveCustomAssetToVault(
  asset: HybridAssetItem,
  dataUrl: string
): Promise<void> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ASSETS, 'readwrite');
      const store = tx.objectStore(STORE_ASSETS);
      const record: StoredHybridAssetRecord = { asset, dataUrl };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB save custom asset warning:', err);
  }
}

export async function loadCustomAssetsFromVault(): Promise<StoredHybridAssetRecord[]> {
  try {
    const db = await openVaultDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ASSETS, 'readonly');
      const store = tx.objectStore(STORE_ASSETS);
      const req = store.getAll();
      req.onsuccess = () => {
        resolve((req.result as StoredHybridAssetRecord[]) || []);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deleteCustomAssetFromVault(id: string): Promise<void> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ASSETS, 'readwrite');
      const store = tx.objectStore(STORE_ASSETS);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB delete custom asset warning:', err);
  }
}
