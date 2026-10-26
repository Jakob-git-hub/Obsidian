import React, { useState, useEffect } from "react";
import { msalInstance, loginRequest } from "./services/auth";
import { synchronizeVault } from "./services/sync";
import { db, VaultFile } from "./services/db";
import { Editor } from "./components/Editor";
import { PDFViewer } from "./components/PDFViewer";
import { Graph } from "./components/Graph";
import {
  Folder,
  FileText,
  RefreshCw,
  LogIn,
  LogOut,
  Network,
  Plus,
  Trash2,
  Search,
  HardDrive,
  Cloud,
  FolderOpen,
  ArrowUpRight,
  LockKeyhole,
} from "lucide-react";

type StorageMode = "local" | "onedrive";
const STORAGE_MODE_KEY = "obsidian-storage-mode";
type LocalFileEntry = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
};
type LocalDirectoryEntry = {
  kind: "directory";
  name: string;
  values: () => AsyncIterableIterator<LocalFileEntry | LocalDirectoryEntry>;
};
type LocalDirectoryHandle = LocalDirectoryEntry;

const getDirectoryPicker = () =>
  (window as Window & {
    showDirectoryPicker?: () => Promise<LocalDirectoryHandle>;
  }).showDirectoryPicker;

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<string | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [rightDrawerOpen, setRightDrawerOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"editor" | "graph">("editor");
  const [syncStatus, setSyncStatus] = useState<string>("Idle");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(true);
  const [localVaultName, setLocalVaultName] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>(() => {
    return localStorage.getItem(STORAGE_MODE_KEY) === "onedrive" ? "onedrive" : "local";
  });

  useEffect(() => {
    void loadLocalFiles();
    if (storageMode !== "onedrive") return;

    void msalInstance.initialize().then(() => {
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
        setIsAuthenticated(true);
        setUser(accounts[0].username);
        void handleSync(true);
      }
    });
  }, [storageMode]);

  const chooseStorageMode = (mode: StorageMode) => {
    localStorage.setItem(STORAGE_MODE_KEY, mode);
    setStorageMode(mode);
    setSyncStatus(mode === "local" ? "Local storage" : "Ready to sync");
    if (mode === "local") {
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  const handleLogin = async () => {
    try {
      const loginResponse = await msalInstance.loginPopup(loginRequest);
      msalInstance.setActiveAccount(loginResponse.account);
      setIsAuthenticated(true);
      setUser(loginResponse.account.username);
      await handleSync(true);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const handleLogout = () => {
    msalInstance.logoutPopup().then(() => {
      setIsAuthenticated(false);
      setUser(null);
    });
  };

  const loadLocalFiles = async () => {
    try {
      const all = await db.getAllFiles();
      setFiles(all);
      if (all.length > 0 && !activeFileId) {
        setActiveFileId(all[0].id);
      }
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleOpenLocalVault = async () => {
    const showDirectoryPicker = getDirectoryPicker();
    if (!showDirectoryPicker) {
      alert("Folder access is not available in this browser. Try Safari or Chrome on a secure connection.");
      return;
    }

    try {
      const directory = await showDirectoryPicker();
      const importedFiles: VaultFile[] = [];

      const readDirectory = async (
        currentDirectory: LocalDirectoryHandle,
        parentPath = "",
      ): Promise<void> => {
        for await (const entry of currentDirectory.values()) {
          const entryPath = `${parentPath}/${entry.name}`;
          if (entry.kind === "directory") {
            await readDirectory(entry, entryPath);
          } else if (entry.name.toLowerCase().endsWith(".md")) {
            const file = await entry.getFile();
            importedFiles.push({
              id: `local-${entryPath}`,
              name: entry.name,
              path: entryPath,
              content: await file.text(),
              updatedAt: file.lastModified || Date.now(),
              syncStatus: "local-only",
            });
          }
        }
      };

      await readDirectory(directory);
      for (const file of importedFiles) {
        await db.saveFile(file);
      }
      setFiles(importedFiles);
      setActiveFileId(importedFiles[0]?.id || null);
      setLocalVaultName(directory.name);
      setStorageMode("local");
      localStorage.setItem(STORAGE_MODE_KEY, "local");
      setSyncStatus("Local vault");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Could not open local vault:", error);
      alert("The vault could not be opened. Check that the folder is readable and try again.");
    }
  };

  const handleSync = async (allowUnauthenticated = false) => {
    if (storageMode !== "onedrive" || (!isAuthenticated && !allowUnauthenticated)) return;
    setSyncStatus("Syncing...");
    const updated = await synchronizeVault((msg: string) => setSyncStatus(msg));
    setFiles(updated);
    if (updated.length > 0 && !activeFileId) {
      setActiveFileId(updated[0].id);
    }
  };

  const activeFile = files.find((f) => f.id === activeFileId);

  const handleContentChange = async (newContent: string) => {
    if (!activeFile) return;
    const updatedFile: VaultFile = {
      ...activeFile,
      content: newContent,
      updatedAt: Date.now(),
      syncStatus: "modified",
    };
    await db.saveFile(updatedFile);
    if (storageMode === "onedrive") {
      await db.queueSync("save", updatedFile.name, newContent);
    }
    setFiles(files.map((f) => (f.id === updatedFile.id ? updatedFile : f)));
  };

  const handleCreateNewNote = async () => {
    const name = prompt("Enter note name (e.g. MyNote.md):");
    if (!name) return;
    const filename = name.endsWith(".md") ? name : `${name}.md`;
    const newFile: VaultFile = {
      id: `local-${Date.now()}`,
      name: filename,
      path: `/${filename}`,
      content: `# ${filename.replace(".md", "")}\n\n`,
      updatedAt: Date.now(),
      syncStatus: "local-only",
    };
    await db.saveFile(newFile);
    if (storageMode === "onedrive") {
      await db.queueSync("save", filename, newFile.content);
    }
    setFiles([...files, newFile]);
    setActiveFileId(newFile.id);
  };

  const handleDeleteNote = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    await db.deleteFile(id);
    if (storageMode === "onedrive") {
      await db.queueSync("delete", name);
    }
    const remaining = files.filter((f) => f.id !== id);
    setFiles(remaining);
    if (activeFileId === id) {
      setActiveFileId(remaining[0]?.id || null);
    }
  };

  // Wikilink & PDF embedding helpers
  const extractWikilinks = (content: string): string[] => {
    const regex = /\[\[(.*?)\]\]/g;
    const links: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      const target = match[1].split("|")[0].trim();
      links.push(target);
    }
    return links;
  };

  const extractPDFEmbeds = (content: string): string[] => {
    const regex = /!\[\[(.*?.pdf)\]\]/gi;
    const pdfs: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      pdfs.push(match[1].trim());
    }
    return pdfs;
  };

  // Backlinks calculation
  const getBacklinks = (targetName: string) => {
    const baseName = targetName.replace(/\.md$/, "");
    return files.filter((f) => {
      if (f.name === targetName) return false;
      const links = extractWikilinks(f.content);
      return links.some((l) => l.replace(/\.md$/, "") === baseName);
    });
  };

  // Graph data preparation
  const graphNodes = files.map((f) => ({ id: f.name, label: f.name.replace(".md", "") }));
  const graphEdges: { source: string; target: string }[] = [];
  files.forEach((f) => {
    const links = extractWikilinks(f.content);
    links.forEach((l) => {
      const targetName = l.endsWith(".md") ? l : `${l}.md`;
      if (files.some((item) => item.name === targetName)) {
        graphEdges.push({ source: f.name, target: targetName });
      }
    });
  });

  if (!isLoadingFiles && storageMode === "local" && files.length === 0) {
    return (
      <main className="start-screen">
        <div className="start-layout">
          <header className="start-header">
            <div className="brand-mark" aria-hidden="true">O</div>
            <span>Obsidian</span>
          </header>
          <section className="start-content" aria-labelledby="start-title">
            <p className="eyebrow">A quiet place for your notes</p>
            <h1 id="start-title">Open a vault<br />to begin.</h1>
            <p className="start-description">
              Choose a folder on this device. Your Markdown notes stay local and remain available offline.
            </p>
            <button type="button" className="primary-action" onClick={() => void handleOpenLocalVault()}>
              <FolderOpen size={19} />
              <span>Choose local vault</span>
              <ArrowUpRight size={17} />
            </button>
            <p className="support-note">
              <LockKeyhole size={14} />
              <span>Nothing is uploaded without your permission.</span>
            </p>
          </section>
          <footer className="start-footer">
            <span>Already using a synced vault?</span>
            <button type="button" className="text-action" onClick={() => chooseStorageMode("onedrive")}>
              Continue with OneDrive <ArrowUpRight size={15} />
            </button>
          </footer>
        </div>
      </main>
    );
  }

  if (storageMode === "onedrive" && !isAuthenticated) {
    return (
      <main className="start-screen">
        <div className="start-layout">
          <header className="start-header">
            <div className="brand-mark" aria-hidden="true">O</div>
            <span>Obsidian</span>
          </header>
          <section className="start-content" aria-labelledby="sync-title">
            <p className="eyebrow">OneDrive vault</p>
            <h1 id="sync-title">Bring your notes<br />with you.</h1>
            <p className="start-description">
              Sign in to sync the existing Obsidian vault stored in your OneDrive.
            </p>
            <button type="button" className="primary-action" onClick={() => void handleLogin()}>
              <LogIn size={19} />
              <span>Sign in with Microsoft</span>
              <ArrowUpRight size={17} />
            </button>
            <button type="button" className="secondary-action" onClick={() => chooseStorageMode("local")}>
              <HardDrive size={17} />
              Use a local vault instead
            </button>
          </section>
          <footer className="start-footer">
            <span>Private by default. Sync when you choose.</span>
          </footer>
        </div>
      </main>
    );
  }

  const embeddedPDFs = activeFile ? extractPDFEmbeds(activeFile.content) : [];

  return (
    <div className="flex h-screen w-screen bg-[#1e1e1e] text-gray-200 overflow-hidden select-none">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-72" : "w-0"
        } transition-all duration-300 bg-gray-900 border-r border-gray-800 flex flex-col z-10 overflow-hidden`}
      >
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 truncate">
            <Folder size={20} className="text-blue-400" />
            <span className="font-bold text-sm truncate">ObsidianVault</span>
          </div>
          <div className="flex items-center space-x-1">
            <button onClick={handleCreateNewNote} title="New Note" className="p-1.5 hover:bg-gray-800 rounded">
              <Plus size={18} />
            </button>
            <button onClick={() => void handleSync()} disabled={storageMode === "local"} title="Sync Now" className="p-1.5 hover:bg-gray-800 rounded disabled:opacity-30 disabled:cursor-not-allowed">
              <RefreshCw size={18} className={syncStatus.includes("Syncing") ? "animate-spin text-blue-400" : ""} />
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-gray-800">
          <div className="mb-3 flex gap-1 rounded-lg bg-gray-800 p-1 text-xs">
            <button onClick={() => chooseStorageMode("local")} className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 ${storageMode === "local" ? "bg-gray-600 text-white" : "text-gray-400"}`}>
              <HardDrive size={14} /> Local
            </button>
            <button onClick={() => chooseStorageMode("onedrive")} className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 ${storageMode === "onedrive" ? "bg-blue-600 text-white" : "text-gray-400"}`}>
              <Cloud size={14} /> OneDrive
            </button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-800 text-sm pl-9 pr-3 py-1.5 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {files
            .filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((file) => (
              <div
                key={file.id}
                onClick={() => {
                  setActiveFileId(file.id);
                  setActiveTab("editor");
                }}
                className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-sm group ${
                  activeFileId === file.id && activeTab === "editor" ? "bg-blue-600/20 text-blue-400" : "hover:bg-gray-800"
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <FileText size={16} className="text-gray-400 flex-shrink-0" />
                  <span className="truncate">{file.name}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNote(file.id, file.name);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
        </div>

        <div className="p-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
          <span className="truncate max-w-[150px]">{user}</span>
          <div className="flex items-center space-x-2">
            <button onClick={() => setActiveTab("graph")} title="Note Graph" className="p-1.5 hover:bg-gray-800 rounded">
              <Network size={16} />
            </button>
            <button onClick={handleLogout} title="Sign Out" className="p-1.5 hover:bg-gray-800 rounded text-red-400">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navbar */}
        <div className="h-12 border-b border-gray-800 bg-gray-900 flex items-center justify-between px-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 hover:bg-gray-800 rounded text-gray-400"
            >
              <Folder size={18} />
            </button>
            <span className="font-semibold text-sm">{activeFile ? activeFile.name : "No Note Selected"}</span>
          </div>

          <div className="flex items-center space-x-3 text-xs text-gray-400">
            <span>{syncStatus}</span>
            <button
              onClick={() => setRightDrawerOpen(!rightDrawerOpen)}
              className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-white"
            >
              Backlinks & PDFs
            </button>
          </div>
        </div>

        {/* View Switcher: Editor / Graph */}
        <div className="flex-1 overflow-hidden relative">
          {activeTab === "graph" ? (
            <div className="p-4 h-full">
              <Graph
                nodes={graphNodes}
                edges={graphEdges}
                onNodeClick={(nodeId: string) => {
                  const target = files.find((f) => f.name === nodeId);
                  if (target) {
                    setActiveFileId(target.id);
                    setActiveTab("editor");
                  }
                }}
              />
            </div>
          ) : (
            <div className="flex h-full w-full">
              {/* Editor */}
              <div className="flex-1 h-full">
                {activeFile ? (
                  <Editor
                    initialContent={activeFile.content}
                    onChange={handleContentChange}
                    onWikilinkClick={(noteName: string) => {
                      const targetName = noteName.endsWith(".md") ? noteName : `${noteName}.md`;
                      const target = files.find((f) => f.name === targetName);
                      if (target) {
                        setActiveFileId(target.id);
                      } else {
                        alert(`Note "${targetName}" does not exist yet.`);
                      }
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    Select or create a note to begin editing.
                  </div>
                )}
              </div>

              {/* Embedded PDFs viewer if any in note */}
              {embeddedPDFs.length > 0 && (
                <div className="w-1/2 h-full border-l border-gray-800 p-4 bg-gray-950 flex flex-col space-y-4 overflow-y-auto">
                  <h3 className="text-sm font-semibold text-gray-400">Goodnotes Embedded PDFs</h3>
                  {embeddedPDFs.map((pdfName) => (
                    <div key={pdfName} className="h-96 flex-shrink-0">
                      <PDFViewer pdfName={pdfName} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Drawer (Backlinks) */}
      {rightDrawerOpen && (
        <div className="w-80 bg-gray-900 border-l border-gray-800 p-4 flex flex-col z-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-sm">Backlinks & Info</h2>
            <button onClick={() => setRightDrawerOpen(false)} className="text-gray-400 hover:text-white">
              ✕
            </button>
          </div>

          {activeFile && (
            <div className="space-y-4 text-sm overflow-y-auto flex-1">
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Linked Mentions ({getBacklinks(activeFile.name).length})
                </h3>
                {getBacklinks(activeFile.name).length === 0 ? (
                  <p className="text-gray-500 text-xs">No backlinks found.</p>
                ) : (
                  <div className="space-y-1">
                    {getBacklinks(activeFile.name).map((backlink) => (
                      <div
                        key={backlink.id}
                        onClick={() => setActiveFileId(backlink.id)}
                        className="p-2 bg-gray-800 hover:bg-gray-700 rounded cursor-pointer truncate"
                      >
                        {backlink.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default App;
