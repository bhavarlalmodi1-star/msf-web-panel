import * as admin from "firebase-admin";
import { cert } from "firebase-admin/app";

// Values pasted into a hosting dashboard (Vercel etc.) often keep their
// surrounding quotes — strip them, and turn the "\n" text back into real line
// breaks for the private key.
const clean = (value) => {
  let v = String(value ?? '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
};

if (!admin.apps.length) {
  const projectId   = clean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const clientEmail = clean(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey  = clean(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n');

  try {
    const missing = [
      !projectId && 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
      !clientEmail && 'FIREBASE_CLIENT_EMAIL',
      !privateKey && 'FIREBASE_PRIVATE_KEY',
    ].filter(Boolean);
    if (missing.length) throw new Error(`missing environment variable(s): ${missing.join(', ')}`);

    admin.initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      databaseURL: clean(process.env.FIREBASE_DATABASE_URL) || undefined,
      storageBucket: clean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) || undefined,
    });
  } catch (error) {
    console.error(
      '\n[firebaseAdmin] Firebase Admin is NOT configured — ' + error.message +
      '\n  Add the keys from .env to the hosting environment (Vercel → Project → Settings → Environment Variables) and redeploy.' +
      '\n  Until then every API route will fail.\n'
    );
    // Start an app without credentials anyway. API routes call admin.firestore()
    // the moment they are imported, and with no app at all that throws — which
    // made `next build` fail ("Failed to collect page data"), so the site had no
    // deployment and showed 404. This way the build succeeds and the problem
    // shows up as a clear error in the logs instead.
    if (!admin.apps.length) {
      const fallbackId = projectId || 'firebase-env-missing';
      // (a bucket name is needed too — some routes call admin.storage().bucket() on import)
      admin.initializeApp({ projectId: fallbackId, storageBucket: `${fallbackId}.appspot.com` });
    }
  }
}

export default admin;
