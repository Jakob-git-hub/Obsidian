import { msalInstance } from "./auth";

const GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPES = ["User.Read", "Files.ReadWrite.All"];

export const getAccessToken = async (): Promise<string> => {
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account) {
    throw new Error("No Microsoft account logged in");
  }

  msalInstance.setActiveAccount(account);
  const response = await msalInstance.acquireTokenSilent({
    scopes: GRAPH_SCOPES,
    account,
  });
  return response.accessToken;
};

const encodePath = (path: string): string =>
  path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

export interface OneDriveItem {
  id: string;
  name: string;
  folder?: { childCount: number };
  file?: { size: number; lastModifiedDateTime: string };
}

export class OnedriveService {
  private token = "";
  private vaultPath = "ObsidianVault";

  setVaultPath(path: string): void {
    this.vaultPath = path.replace(/^\/+|\/+$/g, "");
  }

  getVaultPath(): string {
    return this.vaultPath;
  }

  private async getToken(): Promise<string> {
    if (!this.token) {
      this.token = await getAccessToken();
    }
    return this.token;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${GRAPH_ENDPOINT}${path}`, { ...init, headers });

    if (response.status === 401) {
      this.token = "";
    }
    return response;
  }

  private itemPath(filePath = ""): string {
    const fullPath = [this.vaultPath, filePath].filter(Boolean).join("/");
    return `/drive/root:/${encodePath(fullPath)}`;
  }

  async listFiles(): Promise<OneDriveItem[]> {
    const response = await this.request(`${this.itemPath()}:/children`);
    if (!response.ok) {
      throw new Error(`Failed to list files: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as { value?: OneDriveItem[] };
    return data.value ?? [];
  }

  async readFile(filePath: string): Promise<string> {
    const response = await this.request(`${this.itemPath(filePath)}:/content`);
    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const response = await this.request(`${this.itemPath(filePath)}:/content`, {
      method: "PUT",
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
      body: content,
    });
    if (!response.ok) {
      throw new Error(`Failed to write file: ${response.status} ${response.statusText}`);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const response = await this.request(this.itemPath(filePath), { method: "DELETE" });
    if (!response.ok) {
      throw new Error(`Failed to delete file: ${response.status} ${response.statusText}`);
    }
  }

  async streamPDF(pdfPath: string): Promise<Blob> {
    const response = await this.request(`${this.itemPath(pdfPath)}:/content`);
    if (!response.ok) {
      throw new Error(`Failed to stream PDF: ${response.status} ${response.statusText}`);
    }
    return response.blob();
  }

  async fileExists(filePath: string): Promise<boolean> {
    const response = await this.request(this.itemPath(filePath));
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new Error(`Failed to check file: ${response.status} ${response.statusText}`);
    }
    return true;
  }

  async getFileMetadata(filePath: string): Promise<OneDriveItem> {
    const response = await this.request(this.itemPath(filePath));
    if (!response.ok) {
      throw new Error(`Failed to get file metadata: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<OneDriveItem>;
  }
}
