// Game settings and rules. Tweak these freely.

export const TOTAL_ROUNDS = 7;
export const WRITE_SECONDS = 90; // time to write an answer
export const VOTE_SECONDS = 45; // time to vote
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const AI_ID = "ai";

// Letters get harder as the game goes on
const LETTERS_PER_ROUND = [3, 3, 4, 4, 5, 5, 6];

export const EMOJIS = ["🦊", "🐸", "🐼", "🦁", "🐙", "🦄", "🐧", "🐯", "🐨", "🦉", "🐝", "🐢", "🦖", "🐬", "🦩", "🐷"];

export const CATEGORIES = [
  "Sport", "Food", "Music", "Movies", "TV", "Animals", "Holidays", "School",
  "Work", "Ireland", "Weather", "Family", "Celebrities", "Science", "History",
  "Fashion", "Technology", "Cars", "Halloween", "Christmas", "Superheroes",
  "Excuses", "Breakfast", "Pets", "Kitchen", "Bad Habits", "Hobbies", "Gym",
  "Pub Talk", "Geography", "Space", "Mornings", "Fairy Tales", "Video Games",
  "Weddings", "Shopping", "Gardening", "Road Trips", "Things Parents Say", "Golf",
];

// How often each letter is picked (roughly how common it is to start English words).
// Q, X and Z are left out on purpose.
const LETTER_WEIGHTS = {
  A: 7, B: 6, C: 8, D: 5, E: 3, F: 5, G: 4, H: 5, I: 3, J: 2, K: 2, L: 5,
  M: 6, N: 3, O: 3, P: 7, R: 5, S: 10, T: 7, U: 1, V: 2, W: 4, Y: 1,
};

function weightedLetter() {
  const entries = Object.entries(LETTER_WEIGHTS);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [l, w] of entries) {
    r -= w;
    if (r < 0) return l;
  }
  return "S";
}

export function lettersForRound(round) {
  const n = LETTERS_PER_ROUND[round - 1] ?? 4;
  const out = [];
  while (out.length < n) {
    const l = weightedLetter();
    if (out[out.length - 1] === l) continue; // no "SS"
    if (out.filter((x) => x === l).length >= 2) continue; // max twice
    out.push(l);
  }
  return out.join("");
}

export function pickCategory(used = []) {
  const pool = CATEGORIES.filter((c) => !used.includes(c));
  const list = pool.length ? pool : CATEGORIES;
  return list[Math.floor(Math.random() * list.length)];
}

const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I, L, O (easy to confuse)
export function makeCode() {
  let c = "";
  for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return c;
}

export function cleanAnswer(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function firstLetter(word) {
  const plain = word.normalize("NFD").replace(/[̀-ͯ]/g, ""); // Ó -> O
  const m = plain.match(/[A-Za-z0-9]/);
  return m ? m[0].toUpperCase() : "";
}

// Checks an answer like "Pele Total Legend" against letters "PTL"
export function checkAnswer(text, letters) {
  const words = cleanAnswer(text).split(" ").filter(Boolean);
  if (!words.length) return { ok: false, message: "" };
  for (let i = 0; i < letters.length; i++) {
    if (!words[i]) return { ok: false, message: `Next word needs to start with ${letters[i]}` };
    if (firstLetter(words[i]) !== letters[i]) {
      return { ok: false, message: `Word ${i + 1} should start with ${letters[i]}` };
    }
  }
  if (words.length > letters.length) {
    return { ok: false, message: `Too many words — use exactly ${letters.length}` };
  }
  return { ok: true, message: "" };
}

// Gives every player the same (scrambled) answer order, so nobody can guess by position
export function orderKey(id, round) {
  let h = round * 7919;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
