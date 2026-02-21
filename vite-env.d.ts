/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Firebase
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;

  // Fapshi Payment
  readonly VITE_FAPSHI_API_KEY: string;
  readonly VITE_FAPSHI_USER_TOKEN: string;
  readonly VITE_FAPSHI_BASE_URL: string;

  // Socket.IO Backend
  readonly VITE_SOCKET_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
