// Server-side: asks Claude for a fake answer. Your API key never reaches players' phones.
//
// Longer acronyms (5–6 letters) are hard to hit exactly, so we ask for several
// ideas at once and keep only the ones that fit the letters perfectly.
import { checkAnswer, cleanAnswer } from "../../../lib/game";

export async function GET() {
  return Response.json({ enabled: !!process.env.ANTHROPIC_API_KEY });
}

// Tidies a line like `3. "Pizza Tastes Lovely!"` into `Pizza Tastes Lovely`
function tidy(line) {
  return cleanAnswer(
    line
      .replace(/^\s*(\d+[.)]|[-*•])\s*/, "") // list numbers / bullets
      .replace(/["“”*]/g, "") // quotes and bold
      .replace(/[.!?,;:]+$/, "") // trailing punctuation
  );
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "Decoy not set up" }, { status: 503 });

  const { letters, category } = await req.json().catch(() => ({}));
  if (!/^[A-Z]{3,6}$/.test(letters || "") || typeof category !== "string" || category.length > 40) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const wordGuide = letters
    .split("")
    .map((l, i) => `word ${i + 1} starts with ${l}`)
    .join(", ");

  const prompt = `We're playing a family acronym party game. Category: ${category}. Letters: ${letters}.
Write 6 different funny answers. Each answer must be EXACTLY ${letters.length} words: ${wordGuide}.
No extra words — not even "the", "of" or "and" unless they start with the right letter in the right place. No hyphens.
Make them sound like a witty friend typed them on their phone: casual, clever, family-friendly, about ${category}.
Reply with the 6 answers only, one per line, no numbering.`;

  const errors = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("Anthropic error", res.status, body);
        errors.push(`Anthropic ${res.status}: ${body.slice(0, 200)}`);
        continue;
      }
      const data = await res.json();
      const raw = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
      const valid = raw.split("\n").map(tidy).filter((t) => t && checkAnswer(t, letters).ok);
      if (valid.length) {
        return Response.json({ text: valid[Math.floor(Math.random() * valid.length)] });
      }
      console.warn("No valid decoy in:", raw);
      errors.push("No answer fitted the letters");
    } catch (e) {
      console.error(e);
      errors.push(String(e.message || e));
    }
  }
  return Response.json({ error: "No valid answer", details: errors }, { status: 502 });
}
