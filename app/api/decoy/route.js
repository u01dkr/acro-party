// Server-side: asks Claude for a fake answer. Your API key never reaches players' phones.
import { checkAnswer, cleanAnswer } from "../../../lib/game";

export async function GET() {
  return Response.json({ enabled: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "Decoy not set up" }, { status: 503 });

  const { letters, category } = await req.json().catch(() => ({}));
  if (!/^[A-Z]{3,6}$/.test(letters || "") || typeof category !== "string" || category.length > 40) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const prompt = `We're playing a family acronym party game. Category: ${category}. Letters: ${letters.split("").join(" ")}.
Write ONE funny answer with exactly ${letters.length} words, each starting with those letters in order.
Make it sound like a witty friend typed it on their phone — casual, clever, not too polished, family-friendly.
Reply with ONLY the answer, nothing else.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
          max_tokens: 60,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        console.error("Anthropic error", res.status, await res.text());
        continue;
      }
      const data = await res.json();
      const text = cleanAnswer(data.content?.[0]?.text || "").replace(/^["']|["'.]$/g, "");
      if (checkAnswer(text, letters).ok) return Response.json({ text });
    } catch (e) {
      console.error(e);
    }
  }
  return Response.json({ error: "No valid answer" }, { status: 502 });
}
