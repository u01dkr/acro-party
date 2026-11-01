"use client";
// Home page: pick a name, then create a game or join one with a code.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureSignedIn } from "../lib/firebase";
import { createGame, joinGame, joinByCode } from "../lib/actions";
import { EMOJIS } from "../lib/game";
import { loadProfile, saveProfile } from "../lib/profile";
import { Logo, NameAndEmoji } from "../components/screens";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const p = loadProfile();
    if (p?.name) setName(p.name);
    setEmoji(p?.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
  }, []);

  const run = async (kind, fn) => {
    setError("");
    if (!name.trim()) return setError("Enter your name first");
    setBusy(kind);
    try {
      const user = await ensureSignedIn();
      saveProfile({ name: name.trim(), emoji });
      const target = await fn(user.uid, name.trim());
      router.push(`/game/${target}`);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  };

  const create = () =>
    run("create", async (uid, n) => {
      const c = await createGame(uid);
      await joinGame(c, uid, n, emoji);
      return c;
    });

  const join = (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== 4) return setError("Game codes are 4 letters");
    run("join", async (uid, n) => {
      await joinByCode(c, uid, n, emoji);
      return c;
    });
  };

  return (
    <>
      <Logo />
      <p className="center muted">Make up the funniest meaning for random letters. Vote for the best. Win glory.</p>

      <div className="card">
        <h3>Who are you?</h3>
        <NameAndEmoji name={name} setName={setName} emoji={emoji} setEmoji={setEmoji} />
      </div>

      <button className="btn" onClick={create} disabled={!!busy}>
        {busy === "create" ? "Creating…" : "Create a new game"}
      </button>

      <div className="divider">— or join a friend —</div>

      <form className="row" onSubmit={join}>
        <input
          className="input code"
          placeholder="CODE"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button className="btn" disabled={!!busy}>{busy === "join" ? "Joining…" : "Join"}</button>
      </form>

      {error && <p className="error center">{error}</p>}
    </>
  );
}
