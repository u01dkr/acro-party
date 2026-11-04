// A backup way to read the game that doesn't use Firebase's live connection.
//
// On iPhones, Firebase's live connection can quietly get stuck. When it does, everything that
// goes through it (including "fetch the latest from the server") is stuck too. These read the
// game over Firebase's plain web address instead, so they still work when the live
// connection doesn't.
import { getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Turns Firebase's web format ({ integerValue: "3" } and so on) into plain values
function fromFirestore(v) {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue?.values ?? []).map(fromFirestore);
  if ("mapValue" in v) return fieldsToObject(v.mapValue?.fields ?? {});
  return undefined;
}

export function fieldsToObject(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFirestore(v);
  return out;
}

async function get(path, params = "") {
  const user = getAuth().currentUser;
  const { projectId, apiKey } = getApp().options;
  if (!user || !projectId) return undefined;
  const token = await user.getIdToken();
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/` +
    path.split("/").map(encodeURIComponent).join("/") +
    `?key=${encodeURIComponent(apiKey || "")}${params}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: ctrl.signal });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const idOf = (name) => name.split("/").pop();

// One document: its data (with id), null if it doesn't exist, or undefined if the read failed
export async function readDirect(path) {
  try {
    const doc = await get(path);
    if (!doc) return doc;
    return { id: idOf(doc.name), ...fieldsToObject(doc.fields ?? {}) };
  } catch {
    return undefined;
  }
}

// Every document in a collection (with ids), or undefined if the read failed
export async function listDirect(path) {
  try {
    const out = [];
    let pageToken = "";
    for (let i = 0; i < 5; i++) {
      const res = await get(path, `&pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      if (res === undefined) return undefined;
      for (const d of res?.documents ?? []) out.push({ id: idOf(d.name), ...fieldsToObject(d.fields ?? {}) });
      if (!res?.nextPageToken) break;
      pageToken = res.nextPageToken;
    }
    return out;
  } catch {
    return undefined;
  }
}
