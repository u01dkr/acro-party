// Everything that changes the game in the database lives here.
import {
  doc, getDoc, getDocs, setDoc, updateDoc, collection,
  runTransaction, increment, writeBatch,
} from "firebase/firestore";
import { getDb, restartConnection } from "./firebase";
import { serverNow } from "./clock";
import {
  TOTAL_ROUNDS, WRITE_SECONDS, VOTE_SECONDS, MAX_PLAYERS, AI_ID,
  makeCode, lettersForRound, pickCategory,
} from "./game";

const gameRef = (code) => doc(getDb(), "games", code);
const playerRef = (code, uid) => doc(getDb(), "games", code, "players", uid);
const answerRef = (code, round, id) => doc(getDb(), "games", code, "answers", `${round}_${id}`);
const voteRef = (code, round, id) => doc(getDb(), "games", code, "votes", `${round}_${id}`);

export async function createGame(uid, opts = {}) {
  for (let i = 0; i < 10; i++) {
    const code = makeCode();
    const snap = await getDoc(gameRef(code));
    if (snap.exists()) continue;
    await setDoc(gameRef(code), {
      hostId: uid,
      phase: "lobby",
      round: 0,
      totalRounds: TOTAL_ROUNDS,
      aiDecoy: !!opts.aiDecoy,
      usedCategories: [],
      roundPoints: {},
      createdAt: Date.now(),
    });
    return code;
  }
  throw new Error("Couldn't make a game code — please try again.");
}

export async function joinGame(code, uid, name, emoji) {
  await setDoc(playerRef(code, uid), { name, emoji, score: 0, joinedAt: Date.now() });
}

// Used by the Join box on the home page and by shared links
export async function joinByCode(code, uid, name, emoji) {
  const snap = await getDoc(gameRef(code));
  if (!snap.exists()) throw new Error(`No game found with code ${code}.`);
  const me = await getDoc(playerRef(code, uid));
  if (me.exists()) return; // already in — just rejoin
  if (snap.data().phase !== "lobby") throw new Error("That game has already started.");
  const players = await getDocs(collection(getDb(), "games", code, "players"));
  if (players.size >= MAX_PLAYERS) throw new Error("That game is full (8 players max).");
  await joinGame(code, uid, name, emoji);
}

export const setAiDecoy = (code, value) => updateDoc(gameRef(code), { aiDecoy: value });

// Only the host starts rounds, so a plain update is safe — and it shows
// on the host's own screen instantly instead of waiting for the server.
export function startRound(code, game, round) {
  if (!game || game.round !== round - 1 || !["lobby", "leaderboard"].includes(game.phase)) return null;
  const used = game.usedCategories || [];
  const category = pickCategory(used);
  const letters = lettersForRound(round);
  updateDoc(gameRef(code), {
    phase: "writing",
    round,
    category,
    letters,
    phaseEndsAt: serverNow() + WRITE_SECONDS * 1000,
    usedCategories: [...used, category],
    roundPoints: {},
  }).catch((e) => console.error("Start round failed", e));
  return { category, letters };
}

// Asks Claude for a sneaky fake answer (only if the host switched it on).
// Tries twice, and only adds it if the round is still in the writing stage.
export async function addDecoy(code, round, letters, category) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/decoy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letters, category }),
      });
      if (!res.ok) {
        console.warn("Decoy request failed", res.status, await res.text());
        continue;
      }
      const { text } = await res.json();
      if (!text) continue;
      const g = (await getDoc(gameRef(code))).data();
      if (!g || g.round !== round || g.phase !== "writing") return; // too late for this round
      await setDoc(answerRef(code, round, AI_ID), { round, playerId: AI_ID, text, createdAt: Date.now() });
      return;
    } catch (e) {
      console.warn("Decoy failed", e);
    }
  }
}

// Answers and votes are sent as single "transactions": these go straight to the server in one
// request, rather than queuing on the live connection (which can get stuck on iPhones).
// If it hasn't gone through in 8 seconds, restart the connection and try once more.
async function sendNow(ref, data) {
  const attempt = () => runTransaction(getDb(), async (tx) => { tx.set(ref, data); });
  const timeout = () => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000));
  try {
    await Promise.race([attempt(), timeout()]);
  } catch {
    await restartConnection();
    await attempt();
  }
  // Tell the game page to fetch the latest answers and votes straight away
  if (typeof window !== "undefined") window.dispatchEvent(new Event("acro:refresh"));
}

export const submitAnswer = (code, round, uid, text) =>
  sendNow(answerRef(code, round, uid), { round, playerId: uid, text, createdAt: Date.now() });

export const castVote = (code, round, uid, answerId) =>
  sendNow(voteRef(code, round, uid), { round, voterId: uid, answerId, createdAt: Date.now() });

// Any player's phone can move the game on. The checks inside make sure it
// only ever happens once, even if several phones try at the same moment.
export async function advanceToVoting(code, round) {
  return runTransaction(getDb(), async (tx) => {
    const g = (await tx.get(gameRef(code))).data();
    if (!g || g.phase !== "writing" || g.round !== round) return;
    tx.update(gameRef(code), { phase: "voting", phaseEndsAt: serverNow() + VOTE_SECONDS * 1000 });
  });
}

// Scoring: +1 per vote received, +1 bonus for the round's top answer(s),
// -1 for anyone fooled into voting for Claude's decoy.
export function scoreRound(players, answers, votes) {
  const pts = {};
  players.forEach((p) => (pts[p.id] = 0));
  const author = {};
  answers.forEach((a) => (author[a.id] = a.playerId));
  const count = {};
  answers.forEach((a) => (count[a.id] = 0));
  votes.forEach((v) => {
    if (count[v.answerId] !== undefined && author[v.answerId] !== v.voterId) count[v.answerId]++;
  });
  const human = answers.filter((a) => a.playerId !== AI_ID);
  human.forEach((a) => {
    if (pts[a.playerId] !== undefined) pts[a.playerId] += count[a.id];
  });
  const top = Math.max(0, ...human.map((a) => count[a.id]));
  if (top > 0) {
    human.filter((a) => count[a.id] === top).forEach((a) => {
      if (pts[a.playerId] !== undefined) pts[a.playerId] += 1;
    });
  }
  const ai = answers.find((a) => a.playerId === AI_ID);
  if (ai) {
    votes.filter((v) => v.answerId === ai.id).forEach((v) => {
      if (pts[v.voterId] !== undefined) pts[v.voterId] -= 1;
    });
  }
  return { pts, count, top };
}

// Reads the answers and votes fresh from the server, so the score is right
// no matter whose phone does the counting.
export async function finishVoting(code, round, players) {
  return runTransaction(getDb(), async (tx) => {
    const g = (await tx.get(gameRef(code))).data();
    if (!g || g.phase !== "voting" || g.round !== round) return;
    const ids = players.map((p) => p.id);
    const ansSnaps = await Promise.all([...ids, AI_ID].map((id) => tx.get(answerRef(code, round, id))));
    const voteSnaps = await Promise.all(ids.map((id) => tx.get(voteRef(code, round, id))));
    const answers = ansSnaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() }));
    const votes = voteSnaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() }));
    const { pts } = scoreRound(players, answers, votes);
    Object.entries(pts).forEach(([uid, n]) => {
      if (n !== 0) tx.update(playerRef(code, uid), { score: increment(n) });
    });
    tx.update(gameRef(code), { phase: "results", roundPoints: pts });
  });
}

export const showLeaderboard = (code, round) =>
  updateDoc(gameRef(code), { phase: round >= TOTAL_ROUNDS ? "finished" : "leaderboard" });

// Starts a fresh game with the same players and sends everyone to it
export async function playAgain(code, uid, players, aiDecoy) {
  const newCode = await createGame(uid, { aiDecoy });
  const batch = writeBatch(getDb());
  players.forEach((p, i) => {
    batch.set(playerRef(newCode, p.id), { name: p.name, emoji: p.emoji, score: 0, joinedAt: Date.now() + i });
  });
  batch.update(gameRef(code), { nextGame: newCode });
  await batch.commit();
}
