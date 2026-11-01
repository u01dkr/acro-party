"use client";
// Game chat: a floating button that opens a slide-up chat panel.
import { useEffect, useRef, useState } from "react";
import { addDoc, collection, onSnapshot, orderBy, query, limitToLast } from "firebase/firestore";
import { getDb } from "../lib/firebase";

const QUICK = ["😂", "🔥", "👏", "😱", "🤔", "💀"];

export default function Chat({ code, me, uid }) {
  const [messages, setMessages] = useState([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [seen, setSeen] = useState(0);
  const listRef = useRef(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    const q = query(collection(getDb(), "games", code, "messages"), orderBy("createdAt"), limitToLast(100));
    return onSnapshot(q, (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(list);
      // Don't count old messages as unread when you first arrive
      if (firstLoad.current) {
        firstLoad.current = false;
        setSeen(list.length);
      }
    });
  }, [code]);

  // While open, everything counts as read, and scroll to the newest message
  useEffect(() => {
    if (!open) return;
    setSeen(messages.length);
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages.length]);

  const unread = Math.max(0, messages.length - seen);

  const send = async (body) => {
    const clean = String(body || "").trim().slice(0, 300);
    if (!clean) return;
    setText("");
    await addDoc(collection(getDb(), "games", code, "messages"), {
      uid, name: me.name, emoji: me.emoji, text: clean, createdAt: Date.now(),
    });
  };

  return (
    <>
      <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Open chat">
        💬
        {unread > 0 && <span className="chat-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="chat-backdrop" onClick={() => setOpen(false)}>
          <div className="chat-panel" onClick={(e) => e.stopPropagation()}>
            <div className="chat-head">
              <strong>Game chat</strong>
              <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
            </div>

            <div className="chat-list" ref={listRef}>
              {messages.length === 0 && <p className="muted center small">No messages yet. Say hello! 👋</p>}
              {messages.map((m) => {
                const mine = m.uid === uid;
                const emojiOnly = /^\p{Extended_Pictographic}+$/u.test(m.text.replace(/\s/g, ""));
                return (
                  <div key={m.id} className={`msg ${mine ? "mine" : ""}`}>
                    {!mine && <div className="msg-name">{m.emoji} {m.name}</div>}
                    <div className={`bubble ${emojiOnly ? "emoji-only" : ""}`}>{m.text}</div>
                  </div>
                );
              })}
            </div>

            <div className="quick">
              {QUICK.map((q) => (
                <button key={q} onClick={() => send(q)}>{q}</button>
              ))}
            </div>

            <form
              className="chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
            >
              <input
                className="input"
                placeholder="Message…"
                value={text}
                maxLength={300}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
              />
              <button className="btn" disabled={!text.trim()}>Send</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
