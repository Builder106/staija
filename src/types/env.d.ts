/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_CONTENTFUL_SPACE_ID?: string;
  readonly VITE_CONTENTFUL_ENV_ID?: string;
  readonly VITE_CONTENTFUL_DELIVERY_TOKEN?: string;
  // CONTENTFUL_MANAGEMENT_TOKEN intentionally absent — it's a server-only
  // secret now, read by the lmsContentAdmin Cloud Function from Secret
  // Manager. Anything in the browser bundle is exposed to every visitor.
  // VITE_FIREBASE_MEASUREMENT_ID and VITE_CONTENTFUL_PREVIEW_TOKEN were
  // also removed — no client consumers; if a preview-as-draft surface
  // for staff is ever needed, route it through a callable too.
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
