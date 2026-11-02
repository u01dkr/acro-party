"use client";
// The game itself. Listens to the database live and shows the right screen.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { getDb, ensureSignedIn } from "../../../lib/firebase";
import * as A from "../../../lib/actions";
import { AI_ID, MAX_PLAYERS } from "../../../lib/game";
import { saveProfile } from "../../../lib/profile";
import { syncClock, serverNow } from "../../../lib/clock";
import { JoinForm, Lobby, Writing, Voting, Results, Leaderboard, Logo } from "../../../components/screens";
import Chat from "../../../components/Chat";

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

  // Sign in quietly
  useEffect(() => {
    ensureSignedIn().then((u) => setUid(u.uid)).catch((e) => setError(e.message));
  }, []);

  // Live game + players
  useEffect(() => {
    if (!uid) return;
    const db = getDb();
    const u1 = onSnapshot(
      doc(db, "games", code),
      (s) => setGame(s.exists() ? { id: s.id, ...s.data() } : null),
      (e) => setError(e.message)
    );
    const u2 = onSnapshot(query(collection(db, "games", code, "players"), orderBy("joinedAt")), (s) =>
      setPlayers(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { u1(); u2(); };
  }, [uid, code]);

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
  }, [uid, code, round]);

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
