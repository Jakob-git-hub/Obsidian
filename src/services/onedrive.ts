import { msalInstance } from "./auth";

// Microsoft Graph API endpoints
const GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0";

// Token acquisition helper
export const getAccessToken = async (): Promise<string> => {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    throw new Error("No Microsoft account logged in");
  }
  msalInstance.setActiveAccount(accounts[0]);
  
  const tokenResponse = await msalInstance.acquireTokenSilent({
    scopes: ["User.Read", "Files.ReadWrite.All"],
    account: accounts[0],
  });
  
  return tokenResponse.accessToken;
};

// Onedrive API service
export class OnedriveService {
  private token: string = "";
  private vaultPath: string = "/ObsidianVault"; // Personal vault root folder

  // Set the vault folder path (e.g., /ObsidianVault/ or /Goodnotes/)
  setVaultPath(path: string): void {
    this.vaultPath = path.endsWith("/") ? path : `${path}/`;
  }

  // Get the current vault path
  getVaultPath(): string {
    return this.vaultPath;
  }

  // Get access token
  private async getToken(): Promise<string> {
    if (!this.token) {
      this.token = await getAccessToken();
    }
    return this.token;
  }

  // List files in vault folder
  async listFiles(): Promise<OneDriveItem[]> {
    const token = await this.getToken();
    const url = `${GRAPH_ENDPOINT}/drive/root:/${this.vaultPath}:/children`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list files: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.value || [];
  }

  // Read a file content from OneDrive
  async readFile(filePath: string): Promise<string> {
    const token = await this.getToken();
    const encodedPath = encodeURIComponent(filePath);
    const url = `${GRAPH_ENDPOINT}/drive/root:/${this.vaultPath}${encodedPath}:/content`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.statusText}`);
    }
    
    return response.text();
  }

  // Write/ save a file to OneDrive
  async writeFile(filePath: string, content: string): Promise<void> {
    const token = await this.getToken();
    const encodedPath = encodeURIComponent(filePath);
    const url = `${GRAPH_ENDPOINT}/drive/root:/${this.vaultPath}${encodedPath}`;
    
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: filePath.split("/").pop(), content }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to write file: ${response.statusText}`);
    }
  }

  // Delete a file from OneDrive
  async deleteFile(filePath: string): Promise<void> {
    const token = await this.getToken();
    const encodedPath = encodeURIComponent(filePath);
    const url = `${GRAPH_ENDPOINT}/drive/root:/${this.vaultPath}${encodedPath}`;
    
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete file: ${response.statusText}`);
    }
  }

  // Stream fetch for Goodnotes PDF binaries
  async streamPDF(pdfPath: string): Promise<Blob> {
    const token = await this.getToken();
    const encodedPath = encodeURIComponent(pdfPath);
    const url = `${GRAPH_ENDPOINT}/drive/root:/${this.vaultPath}Goodnotes/${encodedPath}/content`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
      // Stream the response as a blob for PDF rendering
    });
    
    if (!response.ok) {
      throw new Error(`Failed to stream PDF: ${response.statusText}`);
    }
    
    return response.blob();
  }

  // Check if a file exists
  async fileExists(filePath: string): Promise<boolean> {
    const token = await this.getToken();
    const encodedPath = encodeURIComponent(filePath);
    const url = `${GRAPH_ENDPOINT}/drive/root:/${this.vaultPath}${encodedPath}`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    
    return response.status === 200;
  }

  // Get file metadata
  async getFileMetadata(filePath: string): Promise<OneDriveItem> {
    const token = await this.getToken();
    const encodedPath = encodeURIComponent(filePath);
    const url = `${GRAPH_ENDPOINT}/drive/root:/${this.vaultPath}${encodedPath}`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get file metadata: ${response.statusText}`);
    }
    
    return response.json();
  }
}

interface OneDriveItem {
  id: string;
  name: string;
  folder?: {
    childCount: number;
  };
  file?: {
    size: number;
    lastModifiedDateTime: string;
  };
}