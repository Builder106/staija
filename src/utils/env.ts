// Environment configuration utility for STAIJA
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface AppConfig {
  firebase: FirebaseConfig;
  appUrl: string;
  isDevelopment: boolean;
  isProduction: boolean;
  contentful?: {
    spaceId: string;
    environmentId: string;
    deliveryToken: string;
  };
  paystack?: {
    publicKey: string;
  };
  /** Public URL of the deployed `subscribeNewsletter` Cloud Function. */
  newsletterEndpoint?: string;
  /** Public URL of the deployed `getPublicMentors` Cloud Function. When
   *  unset (e.g. local dev without functions emulator), the public
   *  mentor showcase on /stay-connected renders its empty state. */
  publicMentorsEndpoint?: string;
  /** Public URL of the deployed `resolveReferrerName` Cloud Function.
   *  Used by /stay-connected to personalise the hero when a visitor
   *  arrives via `?ref=u-<uid>`. Unset → generic hero copy. */
  referrerNameEndpoint?: string;
  /** Public URL of the deployed `submitReferenceLetter` Cloud Function.
   *  Used by /refs/<token> to upload reference letters. Unset → the
   *  upload form shows "endpoint not configured, email us instead". */
  referenceUploadEndpoint?: string;
}

// Required environment variables
const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

/**
 * Returns whether the browser has enough Firebase configuration to start
 * authenticated services. Public pages can still run without Firebase in
 * local development and in source-only CI checkouts; protected pages will
 * behave as signed-out until credentials are supplied.
 */
export function isFirebaseConfigured(): boolean {
  return REQUIRED_ENV_VARS.every((varName) => Boolean(import.meta.env[varName]));
}

/**
 * Validates that all required environment variables are present
 */
export function validateEnvironment(): void {
  const missingVars = REQUIRED_ENV_VARS.filter((varName) => !import.meta.env[varName]);

  if (missingVars.length > 0) {
    console.warn('⚠️ Missing environment variables. Using development defaults.');
    // Don't throw error in development - use placeholder values
    if (import.meta.env.DEV) {
      return;
    }

    const errorMessage = [
      'Missing required environment variables:',
      ...missingVars.map((varName) => `  - ${varName}`),
      '',
      'Please check your .env file and ensure all required variables are set.',
    ].join('\n');

    throw new Error(errorMessage);
  }
}

/**
 * Gets the Firebase configuration from environment variables
 */
export function getFirebaseConfig(): FirebaseConfig {
  validateEnvironment();

  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

/**
 * Gets the complete application configuration
 */
export function getAppConfig(): AppConfig {
  const firebase = getFirebaseConfig();

  return {
    firebase,
    appUrl: import.meta.env.VITE_APP_URL || 'http://localhost:5173',
    isDevelopment: !!import.meta.env.DEV,
    isProduction: !!import.meta.env.PROD,
    contentful:
      import.meta.env.VITE_CONTENTFUL_SPACE_ID && import.meta.env.VITE_CONTENTFUL_DELIVERY_TOKEN
        ? {
            spaceId: import.meta.env.VITE_CONTENTFUL_SPACE_ID,
            environmentId: import.meta.env.VITE_CONTENTFUL_ENV_ID || 'master',
            deliveryToken: import.meta.env.VITE_CONTENTFUL_DELIVERY_TOKEN,
          }
        : undefined,
    paystack: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
      ? { publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY }
      : undefined,
    newsletterEndpoint: import.meta.env.VITE_NEWSLETTER_ENDPOINT,
    publicMentorsEndpoint: import.meta.env.VITE_PUBLIC_MENTORS_ENDPOINT,
    referrerNameEndpoint: import.meta.env.VITE_REFERRER_NAME_ENDPOINT,
    referenceUploadEndpoint: import.meta.env.VITE_REFERENCE_UPLOAD_ENDPOINT,
  };
}

/**
 * Logs environment information (for debugging)
 */
export function logEnvironmentInfo(): void {
  if (import.meta.env.DEV) {
    console.log('🔧 Environment Configuration:');
    console.log('  Mode:', import.meta.env.MODE);
    console.log('  Firebase Project:', import.meta.env.VITE_FIREBASE_PROJECT_ID);
    console.log('  App URL:', import.meta.env.VITE_APP_URL || 'http://localhost:5173');
    if (import.meta.env.VITE_CONTENTFUL_SPACE_ID) {
      console.log('  Contentful Space:', import.meta.env.VITE_CONTENTFUL_SPACE_ID);
      console.log('  Contentful Env:', import.meta.env.VITE_CONTENTFUL_ENV_ID || 'master');
    }
    console.log('  Development:', import.meta.env.DEV);
    console.log('  Production:', import.meta.env.PROD);
  }
}
