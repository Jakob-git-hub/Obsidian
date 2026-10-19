import React, { useState, useEffect } from "react";
import { msalInstance, loginRequest } from "./services/auth";
import { synchronizeVault } from "./services/sync";
import { db, VaultFile } from "./services/db";
import { Editor } from "./components/Editor";
import { PDFViewer } from "./components/PDFViewer";
import { Graph } from "./components/Graph";
import { Folder, FileText, RefreshCw, LogIn, LogOut, Network, FileCode, Plus, Trash2, Search } from "lucide-react";

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

  useEffect(() => {
    msalInstance.initialize().then(() => {
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
        setIsAuthenticated(true);
        setUser(accounts[0].username);
        loadLocalFiles();
      }
    });
  }, []);

  const handleLogin = async () => {
    try {
      const loginResponse = await msalInstance.loginPopup(loginRequest);
      msalInstance.setActiveAccount(loginResponse.account);
      setIsAuthenticated(true);
      setUser(loginResponse.account.username);
      handleSync();
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
    const all = await db.getAllFiles();
    setFiles(all);
    if (all.length > 0 && !activeFileId) {
      setActiveFileId(all[0].id);
    }
  };

  const handleSync = async () => {
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
    await db.queueSync("save", updatedFile.name, newContent);
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
    await db.queueSync("save", filename, newFile.content);
    setFiles([...files, newFile]);
    setActiveFileId(newFile.id);
  };

  const handleDeleteNote = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    await db.deleteFile(id);
    await db.queueSync("delete", name);
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

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#1e1e1e] text-white">
        <div className="p-8 bg-gray-800 rounded-2xl shadow-2xl flex flex-col items-center max-w-md w-full border border-gray-700">
          <FileCode size={64} className="text-blue-500 mb-4 animate-bounce" />
          <h1 className="text-2xl font-bold mb-2">Obsidian iPad PWA</h1>
          <p className="text-gray-400 text-center mb-6 text-sm">
            Local-first PKM with OneDrive sync and Goodnotes PDF integration tailored for iPadOS Safari.
          </p>
          <button
            onClick={handleLogin}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 font-semibold rounded-lg flex items-center justify-center space-x-2 shadow-lg transition"
          >
            <LogIn size={20} />
            <span>Sign in with Microsoft OneDrive</span>
          </button>
        </div>
      </div>
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
            <button onClick={handleSync} title="Sync Now" className="p-1.5 hover:bg-gray-800 rounded">
              <RefreshCw size={18} className={syncStatus.includes("Syncing") ? "animate-spin text-blue-400" : ""} />
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-gray-800">
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
