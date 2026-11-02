"use client";
// All the screens players see during a game.
import { useEffect, useState } from "react";
import {
  AI_ID, EMOJIS, MIN_PLAYERS, MAX_PLAYERS, TOTAL_ROUNDS,
  checkAnswer, cleanAnswer, orderKey,
} from "../lib/game";
import { submitAnswer, castVote, setAiDecoy, scoreRound } from "../lib/actions";
import { loadProfile } from "../lib/profile";

export function Logo() {
  return (
    <div className="logo">
      <h1>Acro<span>Party</span></h1>
    </div>
  );
}

function Timer({ endsAt, now }) {
  const s = Math.max(0, Math.ceil(((endsAt || 0) - now) / 1000));
  return <div className={`timer ${s <= 10 ? "urgent" : ""}`}>{s}s</div>;
}

function RoundHeader({ game, now, showTimer = true }) {
  return (
    <div className="round-head">
      <div className="muted small">Round {game.round} of {TOTAL_ROUNDS}</div>
      <div className="pill">{game.category}</div>
      {showTimer ? <Timer endsAt={game.phaseEndsAt} now={now} /> : <div style={{ minWidth: 56 }} />}
    </div>
  );
}

function PlayerDots({ players, doneIds, label }) {
  const done = players.filter((p) => doneIds.has(p.id)).length;
  return (
    <div className="center" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="dots">
        {players.map((p) => (
          <span key={p.id} className={`dot ${doneIds.has(p.id) ? "done" : ""}`} title={p.name}>{p.emoji}</span>
        ))}
      </div>
      <div className="muted small">{label}: {done} of {players.length}</div>
    </div>
  );
}

export function NameAndEmoji({ name, setName, emoji, setEmoji }) {
  return (
    <>
      <input
        className="input"
        placeholder="Your name"
        value={name}
        maxLength={16}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="emoji-grid">
        {EMOJIS.map((e) => (
          <button key={e} type="button" className={e === emoji ? "on" : ""} onClick={() => setEmoji(e)}>{e}</button>
        ))}
      </div>
    </>
  );
}

export function JoinForm({ code, onJoin }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const p = loadProfile();
    if (p?.name) setName(p.name);
    setEmoji(p?.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Enter your name");
    setBusy(true);
    setError("");
    try {
      await onJoin(name.trim(), emoji);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <Logo />
      <form className="card" onSubmit={submit}>
        <h2>Join game {code}</h2>
        <NameAndEmoji name={name} setName={setName} emoji={emoji} setEmoji={setEmoji} />
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? "Joining…" : "Join game"}</button>
      </form>
    </>
  );
}

export function Lobby({ game, players, uid, isHost, code, onStart, decoyAvailable }) {
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/game/${code}`;
    const text = `Join my Acro Party game! Code: ${code}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Acro Party", text, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const start = async () => {
    setStarting(true);
    try { await onStart(1); } finally { setStarting(false); }
  };

  return (
    <>
      <Logo />
      <div className="card center">
        <p className="muted">Game code</p>
        <div className="big-code">{code}</div>
        <button className="btn secondary" onClick={share}>{copied ? "Link copied ✓" : "📤 Invite players"}</button>
      </div>

      <div className="card">
        <h3>Players ({players.length}/{MAX_PLAYERS})</h3>
        <ul className="players">
          {players.map((p) => (
            <li key={p.id}>
              <span className="emoji">{p.emoji}</span>
              <span>{p.name}{p.id === uid ? " (you)" : ""}</span>
              {p.id === game.hostId && <span style={{ marginLeft: "auto" }} title="Host">👑</span>}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <div className="card">
          {decoyAvailable && (
            <label className="toggle">
              <input type="checkbox" checked={!!game.aiDecoy} onChange={(e) => setAiDecoy(code, e.target.checked)} />
              <span>
                <strong>🤖 Claude decoy</strong>
                <br />
                <span className="muted small">Claude sneaks in a fake answer each round. Vote for it and lose a point!</span>
              </span>
            </label>
          )}
          <button className="btn" disabled={players.length < MIN_PLAYERS || starting} onClick={start}>
            {players.length < MIN_PLAYERS ? `Need ${MIN_PLAYERS - players.length} more player${MIN_PLAYERS - players.length > 1 ? "s" : ""}` : starting ? "Starting…" : "Start game 🚀"}
          </button>
        </div>
      ) : (
        <div className="banner">
          Waiting for the host to start…
          {game.aiDecoy && <div className="muted small" style={{ marginTop: 6 }}>🤖 Claude decoy is ON</div>}
        </div>
      )}
    </>
  );
}

export function Writing({ game, players, answers, uid, code, now }) {
  const mine = answers.find((a) => a.playerId === uid);
  const [text, setText] = useState(mine?.text || "");
  const [saving, setSaving] = useState(false);
  const check = checkAnswer(text, game.letters);
  const submittedIds = new Set(answers.map((a) => a.playerId));
  const changed = cleanAnswer(text) !== (mine?.text || "");

  const submit = async (e) => {
    e.preventDefault();
    if (!check.ok) return;
    setSaving(true);
    try { await submitAnswer(code, game.round, uid, cleanAnswer(text)); } finally { setSaving(false); }
  };

  let label = "Submit";
  if (saving) label = "Saving…";
  else if (mine && !changed) label = "Submitted ✓";
  else if (mine) label = "Update answer";

  return (
    <>
      <RoundHeader game={game} now={now} />
      <div className="letters">
        {game.letters.split("").map((l, i) => <span key={i} className="tile">{l}</span>)}
      </div>
      <form onSubmit={submit} className="card">
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={game.letters.split("").map((l) => l + "…").join(" ")}
          autoCapitalize="words"
          autoComplete="off"
          maxLength={120}
          autoFocus
        />
        <p className={`hint ${check.ok ? "good" : ""}`}>
          {text ? (check.ok ? "Looks good ✓" : check.message) : `Type ${game.letters.length} words that fit "${game.category}"`}
        </p>
        <button className="btn" disabled={!check.ok || saving || (mine && !changed)}>{label}</button>
        {mine && <p className="muted small center">You can change it until the timer runs out.</p>}
      </form>
      <PlayerDots players={players} doneIds={submittedIds} label="Submitted" />
    </>
  );
}

export function Voting({ game, players, answers, votes, uid, code, now }) {
  const myVote = votes.find((v) => v.voterId === uid);
  const sorted = [...answers].sort((a, b) => orderKey(a.id, game.round) - orderKey(b.id, game.round));
  const voterIds = new Set(votes.map((v) => v.voterId));

  return (
    <>
      <RoundHeader game={game} now={now} />
      <div className="letters">
        {game.letters.split("").map((l, i) => <span key={i} className="tile">{l}</span>)}
      </div>
      <p className="muted center">
        {myVote ? "Changed your mind? Tap another one before time's up." : "Tap your favourite. You can't vote for your own!"}
      </p>
      {sorted.length === 0 && <div className="banner">Nobody answered this round 😅</div>}
      <div className="answers">
        {sorted.map((a) => {
          const own = a.playerId === uid;
          const picked = myVote?.answerId === a.id;
          return (
            <button
              key={a.id}
              className={`answer ${picked ? "picked" : ""}`}
              disabled={own}
              onClick={() => castVote(code, game.round, uid, a.id)}
            >
              {a.text}
              {own && <span className="tag">Yours</span>}
              {picked && <span className="tag">Your vote ✓</span>}
            </button>
          );
        })}
      </div>
      <PlayerDots players={players} doneIds={voterIds} label="Voted" />
    </>
  );
}

export function Results({ game, players, answers, votes, isHost, onNext }) {
  const { count, top } = scoreRound(players, answers, votes);
  const rows = answers
    .map((a) => ({
      ...a,
      votes: count[a.id] || 0,
      author: a.playerId === AI_ID
        ? { name: "Claude (decoy)", emoji: "🤖" }
        : players.find((p) => p.id === a.playerId) || { name: "Someone", emoji: "❓" },
    }))
    .sort((x, y) => y.votes - x.votes);
  const ai = answers.find((a) => a.playerId === AI_ID);
  const fooled = ai
    ? votes.filter((v) => v.answerId === ai.id).map((v) => players.find((p) => p.id === v.voterId)?.name).filter(Boolean)
    : [];
  const last = game.round >= TOTAL_ROUNDS;

  return (
    <>
      <RoundHeader game={game} showTimer={false} />
      <h2 className="center">And the votes are in…</h2>
      {rows.length === 0 && <div className="banner">No answers this round.</div>}
      {rows.map((r) => {
        const winner = top > 0 && r.votes === top && r.playerId !== AI_ID;
        return (
          <div key={r.id} className={`result ${winner ? "winner" : ""}`}>
            <div className="text">{winner ? "👑 " : ""}{r.text}</div>
            <div className="meta">
              <span>{r.author.emoji} {r.author.name}</span>
              <span className="votes">{r.votes} vote{r.votes === 1 ? "" : "s"}</span>
            </div>
          </div>
        );
      })}
      {ai && (
        <div className="banner">
          {fooled.length ? `🤖 Fooled by Claude: ${fooled.join(", ")} (−1 each)` : "🤖 Nobody fell for Claude's decoy!"}
        </div>
      )}
      {isHost ? (
        <button className="btn sticky-bottom" onClick={onNext}>{last ? "See final results 🏆" : "Show leaderboard"}</button>
      ) : (
        <p className="muted center">Waiting for the host…</p>
      )}
    </>
  );
}

export function Leaderboard({ game, players, uid, isHost, onStart, onPlayAgain }) {
  const [busy, setBusy] = useState(false);
  const final = game.phase === "finished";
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score ?? 0;
  const winners = ranked.filter((p) => p.score === topScore);
  const medals = ["🥇", "🥈", "🥉"];

  const act = async (fn) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <>
      <Logo />
      {final ? (
        <div className="card center">
          <div className="trophy">🏆</div>
          <h2>{winners.length > 1 ? `It's a tie! ${winners.map((w) => w.name).join(" & ")}` : `${winners[0]?.name} wins!`}</h2>
        </div>
      ) : (
        <h2 className="center">Leaderboard after round {game.round}</h2>
      )}
      <div className="card">
        <ul className="players">
          {ranked.map((p, i) => {
            const gain = game.roundPoints?.[p.id] || 0;
            return (
              <li key={p.id}>
                <span style={{ width: 28 }}>{medals[i] || `${i + 1}.`}</span>
                <span className="emoji">{p.emoji}</span>
                <span>{p.name}{p.id === uid ? " (you)" : ""}</span>
                <span className="score">
                  {p.score}
                  {gain !== 0 && <span className={`gain ${gain < 0 ? "neg" : ""}`}>{gain > 0 ? `+${gain}` : gain}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {isHost ? (
        final ? (
          <button className="btn" disabled={busy} onClick={() => act(onPlayAgain)}>{busy ? "Setting up…" : "Play again 🔁"}</button>
        ) : (
          <button className="btn" disabled={busy} onClick={() => act(() => onStart(game.round + 1))}>
            {busy ? "Starting…" : `Start round ${game.round + 1} →`}
          </button>
        )
      ) : (
        <p className="muted center">{final ? "Thanks for playing! The host can start a new game." : "Waiting for the host to start the next round…"}</p>
      )}
      {final && <a href="/" className="btn secondary">Home</a>}
    </>
  );
}
