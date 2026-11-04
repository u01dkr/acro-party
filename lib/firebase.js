// Connects the app to your Firebase project.
// The values come from Vercel "Environment Variables" (see README).
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, initializeFirestore, disableNetwork, enableNetwork } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cached = null;
function fb() {
  if (!cached) {
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    // iPhones and iPads: use Firebase's steadier "long polling" connection, which copes
    // better with Safari pausing the page. Everyone else keeps the faster default.
    const isApple =
      typeof navigator !== "undefined" &&
      (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    let db;
    try {
      db = isApple
        ? initializeFirestore(app, {
            experimentalForceLongPolling: true,
            experimentalLongPollingOptions: { timeoutSeconds: 10 },
          })
        : getFirestore(app);
    } catch {
      db = getFirestore(app); // already set up
    }
    cached = { app, auth: getAuth(app), db };
  }
  return cached;
}

export const getDb = () => fb().db;

// Drops and reopens the live connection. Used when a phone finds it has fallen behind.
let restarting = false;
export async function restartConnection() {
  if (restarting) return;
  restarting = true;
  try {
    const db = fb().db;
    await disableNetwork(db);
    await enableNetwork(db);
  } catch {
    /* ignore */
  } finally {
    restarting = false;
  }
}

// Every player gets a hidden anonymous ID — no sign-up needed.
// It's remembered by the browser, so refreshing or reopening rejoins the game.
export function ensureSignedIn() {
  const { auth } = fb();
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (user) return resolve(user);
      try {
        const cred = await signInAnonymously(auth);
        resolve(cred.user);
      } catch (e) {
        reject(e);
      }
    });
  });
}
