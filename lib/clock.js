// Keeps every phone's countdown in step.
// Phone clocks can be a few seconds apart, so each phone asks Firebase's server
// what time it is and works out the difference. All timers then use server time.
import { doc, setDoc, getDocFromServer, serverTimestamp } from "firebase/firestore";
import { getDb } from "./firebase";

let offset = 0;

export const serverNow = () => Date.now() + offset;

export async function syncClock(code, uid) {
  const ref = doc(getDb(), "games", code, "clocks", uid);
  let best = null;
  for (let i = 0; i < 3; i++) {
    try {
      const t0 = Date.now();
      await setDoc(ref, { t: serverTimestamp() });
      const t1 = Date.now();
      const snap = await getDocFromServer(ref);
      const server = snap.data()?.t?.toMillis?.();
      if (!server) continue;
      const rtt = t1 - t0;
      // Keep the quickest round trip — it's the most accurate
      if (!best || rtt < best.rtt) best = { rtt, offset: server - (t0 + t1) / 2 };
    } catch (e) {
      console.warn("Clock sync failed", e);
    }
  }
  if (best) offset = best.offset;
}
