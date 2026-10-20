import { db, syncEngine } from "./db";
import { OnedriveService } from "./onedrive";
import { VaultFile } from "./db";

/**
 * Synchronize the local vault with OneDrive.
 * @param progressCallback Optional callback to report progress messages.
 * @returns Promise resolving to the updated list of files after sync.
 */
export const synchronizeVault = async (
  progressCallback?: (msg: string) => void
): Promise<VaultFile[]> => {
  const onedrive = new OnedriveService();
  // Set the vault path to the root of the Obsidian vault
  onedrive.setVaultPath("/ObsidianVault");

  try {
    // Step 1: Upload pending local changes to OneDrive
    if (progressCallback) progressCallback("Uploading pending changes...");
    await syncEngine.syncToOneDrive(onedrive, progressCallback);

    // Step 2: Download file list from OneDrive and sync local changes
    if (progressCallback) progressCallback("Fetching remote file list...");
    const remoteFiles = await onedrive.listFiles();
    const localFiles = await db.getAllFiles();

    // Create a map of local files by name for quick lookup
    const localFileMap = new Map<string, VaultFile>();
    localFiles.forEach((file) => {
      localFileMap.set(file.name, file);
    });

    // Process each remote file
    for (const remoteItem of remoteFiles) {
      // We only care about files (not folders) for now
      if (remoteItem.file) {
        const remoteName = remoteItem.name;
        const localFile = localFileMap.get(remoteName);

        // If file doesn't exist locally or remote is newer, download it
        if (!localFile || isRemoteNewer(remoteItem, localFile)) {
          if (progressCallback) progressCallback(`Downloading: ${remoteName}`);
          try {
            const content = await onedrive.readFile(`/ObsidianVault/${remoteName}`);
            const remoteFile: VaultFile = {
              id: remoteItem.id,
              name: remoteName,
              path: `/${remoteName}`,
              content,
              updatedAt: new Date(remoteItem.file.lastModifiedDateTime).getTime(),
              syncStatus: "synced",
            };

            if (localFile) {
              // Update existing file
              await db.saveFile(remoteFile);
            } else {
              // Add new file
              await db.saveFile(remoteFile);
            }
          } catch (err) {
            console.error(`Failed to download ${remoteName}:`, err);
            if (progressCallback) progressCallback(`Failed to download ${remoteName}`);
          }
        }
      }
    }

    // Step 3: Get all files after sync
    const allFiles = await db.getAllFiles();
    if (progressCallback) progressCallback("Sync complete");
    return allFiles;
  } catch (err) {
    console.error("Sync failed:", err);
    if (progressCallback) progressCallback("Sync failed");
    // Return current local files on error
    return db.getAllFiles();
  }
};

/**
 * Check if the remote file is newer than the local file based on lastModifiedDateTime.
 * @param remoteItem OneDrive file item
 * @param localFile Local vault file
 * @returns true if remote is newer or if local file has no timestamp
 */
function isRemoteNewer(
  remoteItem: { file?: { lastModifiedDateTime: string } },
  localFile: VaultFile
): boolean {
  if (!remoteItem.file?.lastModifiedDateTime) {
    // If we can't determine remote time, assume not newer
    return false;
  }
  const remoteTime = new Date(remoteItem.file.lastModifiedDateTime).getTime();
  return remoteTime > localFile.updatedAt;
}