import { PublicClientApplication } from "@azure/msal-browser";

const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID ?? "",
    authority: "https://login.microsoftonline.com/common",
    redirectUri: "http://localhost",
  },
  system: {
    loggerOptions: {
      allowWarnings: true,
      logLevel: 2,
    },
    cacheLocation: "localStorage",
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
  scopes: ["User.Read", "Files.ReadWrite.All"],
  prompt: "select_account",
};