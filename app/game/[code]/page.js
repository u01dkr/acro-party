"use client";
// The game itself. Listens to the database live and shows the right screen.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, collection, onSnapshot, query, where, orderBy, getDocFromServer } from "firebase/firestore";
import { getDb, ensureSignedIn, restartConnection } from "../../../lib/firebase";
import { readDirect, listDirect } from "../../../lib/direct";
import * as A from "../../../lib/actions";
import { AI_ID, MAX_PLAYERS } from "../../../lib/game";
import { saveProfile } from "../../../lib/profile";
import { syncClock, serverNow } from "../../../lib/clock";
import { JoinForm, Lobby, Writing, Voting, Results, Leaderboard, Logo } from "../../../components/screens";
import Chat from "../../../components/Chat";

// Orders the stages of a game so a phone can tell newer data from older
const STAGES = ["lobby", "writing", "voting", "results", "leaderboard", "finished"];
const stageKey = (g) => (g.round || 0) * 10 + Math.max(0, STAGES.indexOf(g.phase));

export default function GamePage() {
  const params = useParams();
  const code = String(params.code || "").toUpperCase();
  const router = useRouter();

  const [uid, setUid] = useState(null);
  const [game, setGame] = useState(undefined);
  const [players, setPlayers] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [votes, setVotes] = useState([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [decoyAvailable, setDecoyAvailable] = useState(false);
  const busy = useRef("");
  // Bumping this tears down and reopens the live connections (see the safety net below)
  const [resub, setResub] = useState(0);
  const gameRef = useRef(null);

  // Sign in quietly
  useEffect(() => {
    ensureSignedIn().then((u) => setUid(u.uid)).catch((e) => setError(e.message));
  }, []);

  // New game (e.g. after "Play again"): forget the old one
  useEffect(() => {
    gameRef.current = null;
  }, [code]);

  // Live game + players
  useEffect(() => {
    if (!uid) return;
    const db = getDb();
    const u1 = onSnapshot(
      doc(db, "games", code),
      (s) => {
        const g = s.exists() ? { id: s.id, ...s.data() } : null;
        // Never step back to an older stage of the game
        if (g && gameRef.current && stageKey(g) < stageKey(gameRef.current)) return;
        gameRef.current = g;
        setGame(g);
      },
      (e) => setError(e.message)
    );
    const u2 = onSnapshot(query(collection(db, "games", code, "players"), orderBy("joinedAt")), (s) =>
      setPlayers(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { u1(); u2(); };
  }, [uid, code, resub]);

  // Live answers + votes for the current round
  const round = game?.round ?? 0;
  useEffect(() => {
    if (!uid || !round) return;
    const db = getDb();
    const u1 = onSnapshot(query(collection(db, "games", code, "answers"), where("round", "==", round)), (s) =>
      setAnswers(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const u2 = onSnapshot(query(collection(db, "games", code, "votes"), where("round", "==", round)), (s) =>
      setVotes(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { u1(); u2(); };
  }, [uid, code, round, resub]);

  // Safety net for iPhones: Safari can quietly stop delivering live updates (screen dims,
  // switching apps), leaving one phone stuck on an old screen. So every 3 seconds, and
  // whenever you come back to the app, read the game over a plain web request that doesn't
  // rely on the live connection. If this phone has fallen behind, catch up straight away
  // (game, players, answers and votes) and restart the stuck live connection.
  useEffect(() => {
    if (!uid) return;
    const ref = doc(getDb(), "games", code);
    let cancelled = false;
    let checking = false;

    const readGame = async () => {
      const g = await readDirect(`games/${code}`);
      if (g !== undefined) return g;
      // Plain request not possible: fall back to Firebase's own fetch, with a time limit
      // (it can hang when the connection is stuck)
      const s = await Promise.race([
        getDocFromServer(ref).catch(() => null),
        new Promise((res) => setTimeout(() => res(null), 4000)),
      ]);
      return s?.exists() ? { id: s.id, ...s.data() } : undefined;
    };

    const refreshPlayers = async () => {
      const list = await listDirect(`games/${code}/players`);
      if (list && !cancelled) setPlayers(list.sort((x, y) => (x.joinedAt || 0) - (y.joinedAt || 0)));
    };
    const refreshRound = async (r) => {
      if (!r) return;
      const [ans, vts] = await Promise.all([listDirect(`games/${code}/answers`), listDirect(`games/${code}/votes`)]);
      if (cancelled) return;
      if (ans) setAnswers(ans.filter((x) => x.round === r));
      if (vts) setVotes(vts.filter((x) => x.round === r));
    };

    const check = async () => {
      if (cancelled || checking) return;
      checking = true;
      try {
        const g = await readGame();
        if (!g || cancelled) return;
        const cur = gameRef.current;
        if (!cur || stageKey(g) > stageKey(cur) || (g.nextGame && !cur.nextGame)) {
          // Behind: catch up on everything, then give the live connection a kick
          gameRef.current = g;
          setGame(g);
          await Promise.all([refreshPlayers(), refreshRound(g.round)]);
          if (cur) {
            await restartConnection();
            setResub((n) => n + 1);
          }
        } else if (g.phase === "lobby") {
          await refreshPlayers(); // so the host sees everyone who's joined
        }
      } catch {
        /* offline: try again next time */
      } finally {
        checking = false;
      }
    };

    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && gameRef.current?.phase !== "finished") check();
    }, 3000);
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      restartConnection().then(() => setResub((n) => n + 1)); // fresh live connections after being away
      check();
    };
    // After sending an answer or vote, fetch the latest straight away
    const onSent = () => refreshRound(gameRef.current?.round);
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);
    window.addEventListener("focus", check);
    window.addEventListener("acro:refresh", onSent);
    return () => {
      cancelled = true;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
      window.removeEventListener("focus", check);
      window.removeEventListener("acro:refresh", onSent);
    };
  }, [uid, code]);

  // Line this phone's clock up with the server (and again whenever you come back to the app)
  useEffect(() => {
    if (!uid) return;
    syncClock(code, uid);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNow(serverNow());
        syncClock(code, uid);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [uid, code]);

  // Clock tick for timers
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, []);

  // "Play again" sends everyone to the new game
  useEffect(() => {
    if (game?.nextGame) router.push(`/game/${game.nextGame}`);
  }, [game?.nextGame, router]);

  const isHost = !!game && game.hostId === uid;

  // Is the Claude decoy set up on the server?
  useEffect(() => {
    if (!isHost) return;
    fetch("/api/decoy").then((r) => r.json()).then((d) => setDecoyAvailable(!!d.enabled)).catch(() => {});
  }, [isHost]);

  const roundAnswers = answers.filter((a) => a.round === round);
  const roundVotes = votes.filter((v) => v.round === round);
  const me = players.find((p) => p.id === uid);

  // Moves the game on when the timer runs out (always the full time, so people
  // can change their answer or vote right up to the end).
  // Every phone watches for this, so it doesn't matter if the host's phone is
  // locked or in another app — the first phone to notice moves everyone on.
  useEffect(() => {
    if (!game || !uid || !players.length) return;
    if (!["writing", "voting"].includes(game.phase) || now <= game.phaseEndsAt) return;
    const key = `${game.phase}-${game.round}`;
    if (busy.current === key) return;
    busy.current = key;
    const step = game.phase === "writing"
      ? A.advanceToVoting(code, game.round)
      : A.finishVoting(code, game.round, players);
    step.catch((e) => { console.error(e); busy.current = ""; });
  }, [now, game, players, uid, code]);

  const startRound = async (r) => {
    const res = A.startRound(code, game, r);
    if (res && game?.aiDecoy) A.addDecoy(code, r, res.letters, res.category);
  };

  // ----- Screens -----
  if (error) return <><Logo /><p className="error center">{error}</p><a href="/" className="btn secondary">Home</a></>;
  if (!uid || game === undefined) return <><Logo /><p className="muted center">Loading…</p></>;
  if (game === null) {
    return (
      <>
        <Logo />
        <div className="card center">
          <h2>Game not found</h2>
          <p className="muted">There's no game with code {code}.</p>
        </div>
        <a href="/" className="btn">Go home</a>
      </>
    );
  }

  if (!me) {
    if (game.phase !== "lobby" || players.length >= MAX_PLAYERS) {
      return (
        <>
          <Logo />
          <div className="card center">
            <h2>{game.phase !== "lobby" ? "Game already started" : "Game is full"}</h2>
            <p className="muted">Ask the host to start a new one.</p>
          </div>
          <a href="/" className="btn">Go home</a>
        </>
      );
    }
    return (
      <JoinForm
        code={code}
        onJoin={async (name, emoji) => {
          saveProfile({ name, emoji });
          await A.joinByCode(code, uid, name, emoji);
        }}
      />
    );
  }

  const props = { game, players, answers: roundAnswers, votes: roundVotes, uid, isHost, code, now };

  let screen;
  switch (game.phase) {
    case "lobby":
      screen = <Lobby {...props} onStart={startRound} decoyAvailable={decoyAvailable} />;
      break;
    case "writing":
      screen = <Writing key={`w${game.round}`} {...props} />;
      break;
    case "voting":
      screen = <Voting key={`v${game.round}`} {...props} />;
      break;
    case "results":
      screen = <Results {...props} onNext={() => A.showLeaderboard(code, game.round)} />;
      break;
    case "leaderboard":
    case "finished":
      screen = (
        <Leaderboard
          {...props}
          onStart={startRound}
          onPlayAgain={() => A.playAgain(code, uid, players, game.aiDecoy)}
        />
      );
      break;
    default:
      screen = <p>Unknown game state.</p>;
  }

  return (
    <>
      {screen}
      <Chat key={code} code={code} me={me} uid={uid} />
    </>
  );
}
