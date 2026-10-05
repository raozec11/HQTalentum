import * as admin from "firebase-admin";

if (!admin.apps.length) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "talentumhq-33753";

  // Option 1: Single JSON string (easiest – paste the downloaded service account JSON as one line)
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  // Option 2: Separate env vars
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } catch (e) {
      console.error("⚠️ FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON:", e);
      admin.initializeApp({ projectId });
    }
  } else if (privateKey && clientEmail) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  } else {
    console.warn("⚠️ Firebase Admin initialized without service account credentials. Add FIREBASE_SERVICE_ACCOUNT_JSON to .env.local to enable server-side Auth/Firestore access.");
    admin.initializeApp({ projectId });
  }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const hasAdminCredentials = !!(
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
  (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL)
);
export { admin };
