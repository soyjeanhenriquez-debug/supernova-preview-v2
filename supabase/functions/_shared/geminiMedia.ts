// SUPERNOVA — Gemini con video o audio adentro (13-oct-2026): "Analiza un Reel" y "Sube tu video".
// API nativa (generateContent) porque la compatible con OpenAI no acepta video. Devuelve el JSON que
// pide el prompt, el costo real estimado (para ai_usage) y el uso de tokens.
import { admin } from "./media.ts";

export const MEDIA_MODEL = "gemini-3.8-flash";

export function b64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Saca el JSON aunque venga con ``` o con texto alrededor. */
export function looseJson(text: string): Record<string, unknown> | null {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(t); } catch { /* sigue */ }
  const a = t.indexOf("{"), z = t.lastIndexOf("}");
  if (a >= 0 && z > a) { try { return JSON.parse(t.slice(a, z + 1)); } catch { /* nada */ } }
  return null;
}

export async function geminiMedia(parts: unknown[], maxTokens: number, timeoutMs = 110_000) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("sin GEMINI_API_KEY");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MEDIA_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens, temperature: 0.6, mediaResolution: "MEDIA_RESOLUTION_LOW" },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const text = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  const u = d?.usageMetadata ?? {};
  // US$0,75/M entrada (video y audio se cuentan a US$1 por prudencia) y US$3,75/M salida y razonamiento.
  const cost = (Number(u.promptTokenCount ?? 0) * 1 + (Number(u.candidatesTokenCount ?? 0) + Number(u.thoughtsTokenCount ?? 0)) * 3.75) / 1e6;
  return { out: looseJson(text), cost, usage: u as Record<string, number> };
}

export async function logMediaCost(uid: string, fn: string, cost: number, usage: Record<string, number>, extraUsd = 0) {
  const { error } = await admin().from("ai_usage").insert({
    user_id: uid, fn, model: MEDIA_MODEL, input_tokens: Number(usage.promptTokenCount ?? 0),
    output_tokens: Number(usage.candidatesTokenCount ?? 0), images: 0, cost_usd: cost + extraUsd,
  });
  if (error) console.error("ai_usage:", error.message);
}
