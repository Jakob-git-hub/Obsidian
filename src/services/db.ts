import { openDB } from "idb";
import { OnedriveService } from "./onedrive";

// Vault file interface
export interface VaultFile {
  id: string;
  name: string;
  path: string;
  content: string;
  updatedAt: number;
  syncStatus: "synced" | "modified" | "local-only" | "conflict";
}

// Database name
const DB_NAME = "obsidian-vault";
const DB_VERSION = 1;

// IndexedDB database wrapper using idb
class Database {
  private dbPromise: Promise<any>;

  constructor() {
    this.dbPromise = this.init();
  }

  private async init(): Promise<any> {
    return openDB(DB_NAME, DB_VERSION, {
      upgrade: (db: any) => {
        // Create files object store with id as keyPath
        const filesStore = db.createObjectStore("files", { keyPath: "id" });
        filesStore.createIndex("by-name", "name", { unique: false });
        filesStore.createIndex("by-path", "path", { unique: true });

        // Goodnotes PDF cache store
        const pdfStore = db.createObjectStore("pdf-cache", { keyPath: "name" });
        pdfStore.createIndex("by-path", "path", { unique: false });

        // Sync queue store (using id key, but items array inside)
        const queueStore = db.createObjectStore("sync-queue", { keyPath: "id" });
      },
    });
  }

  // Get the underlying database promise
  getDB(): Promise<any> {
    return this.dbPromise;
  }

  // Save a file to IndexedDB
  async saveFile(file: VaultFile): Promise<any> {
    const db = await this.dbPromise;
    return db.put("files", file);
  }

  // Get all files from IndexedDB
  async getAllFiles(): Promise<VaultFile[]> {
    const db = await this.dbPromise;
    return db.getAll("files");
  }

  // Get a specific file by ID
  async getFile(id: string): Promise<VaultFile | undefined> {
    const db = await this.dbPromise;
    return db.get("files", id);
  }

  // Delete a file from IndexedDB
  async deleteFile(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete("files", id);
  }

  // PDF Cache operations
  async savePDFCache(name: string, data: ArrayBuffer): Promise<void> {
    const db = await this.dbPromise;
    await db.put("pdf-cache", { name, data, updatedAt: Date.now() }, name);
  }

  // Get PDF cache from IndexedDB
  async getPDFCache(name: string): Promise<ArrayBuffer | undefined> {
    const db = await this.dbPromise;
    const record = await db.get("pdf-cache", name);
    return record ? record.data : undefined;
  }

  // Delete PDF cache
  async deletePDFCache(name: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete("pdf-cache", name);
  }

  // List all files with sync status
  async getSyncedFiles(): Promise<VaultFile[]> {
    const db = await this.dbPromise;
    const all = await db.getAll("files");
    return all.filter((f) => f.syncStatus !== "local-only");
  }

  // Add sync queue item
  async queueSync(action: "save" | "delete", filename: string, content?: string): Promise<void> {
    const db = await this.dbPromise;
    const queue = await db.get("sync-queue", "pending");

    const items: Array<{ action: "save" | "delete"; filename: string; content?: string }> =
      queue ? [...queue.items] : [];

    const existingIndex = items.findIndex((item) => item.filename === filename);
    if (existingIndex >= 0) {
      items[existingIndex] = { action, filename, content };
    } else {
      items.push({ action, filename, content });
    }

    // Add a unique id for the key
    const queueItem = { id: `sync-${Date.now()}-${filename}`, items };
    await db.put("sync-queue", queueItem, "pending");
  }

  // Get sync queue
  async getSyncQueue(): Promise<Array<{ action: "save" | "delete"; filename: string; content?: string }>> {
    const db = await this.dbPromise;
    const queue = await db.get("sync-queue", "pending");
    return queue ? queue.items : [];
  }

  // Clear sync queue after successful sync
  async clearSyncQueue(): Promise<void> {
    const db = await this.dbPromise;
    await db.delete("sync-queue", "pending");
  }
}

// Singleton instance
export const db = new Database();

// Synchronization engine
export const syncEngine = {
  // Sync pending edits to OneDrive
  async syncToOneDrive(
    onedrive: OnedriveService,
    progressCallback?: (msg: string) => void
  ): Promise<void> {
    const queue = await db.getSyncQueue();
    const files = await db.getAllFiles();

    if (queue.length === 0) {
      progressCallback("No pending syncs");
      return;
    }

    progressCallback(`Syncing ${queue.length} items...`);

    for (const item of queue) {
      try {
        const file = files.find((f) => f.name === item.filename);

        if (item.action === "save" && file) {
          await onedrive.writeFile(file.path, item.content || file.content);
          progressCallback(`Synced: ${item.filename}`);
        } else if (item.action === "delete" && file) {
          await onedrive.deleteFile(file.path);
          progressCallback(`Deleted: ${item.filename}`);
        }
      } catch (err) {
        console.error(`Sync error for ${item.filename}:`, err);
        // Mark as conflict - re-queue
        await db.queueSync("save", item.filename, item.content);
        progressCallback(`Error syncing: ${item.filename}`);
      }
    }

    // Clear queue after sync
    await db.clearSyncQueue();
    progressCallback("Sync complete");
  },

  // Initialize offline support - set up network change listener
  initializeOfflineSupport(onedrive: OnedriveService, progressCallback?: (msg: string) => void): void {
    const handleOnline = async () => {
      progressCallback("Network restored, syncing...");
      await syncEngine.syncToOneDrive(onedrive, progressCallback);
    };

    window.addEventListener("online", handleOnline);

    // Also sync on app load
    handleOnline();
  },
};