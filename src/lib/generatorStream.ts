import { fnErrorMessage, fnHeaders, readBilling, type ServerBilling } from "@/lib/fnAuth";

/**
 * Llama a un generador de ai-chat y junta la respuesta completa. El servidor cobra ANTES según el
 * nivel del generador (y devuelve el crédito si la IA falla); aquí solo se lee el cobro para
 * reflejar el saldo. `onCharge` se llama en cuanto el servidor aceptó el pedido.
 */
export async function runGenerator(opts: {
  id: string; title: string; prompt: string; system?: string;
  onCharge?: (b: ServerBilling) => void; onText?: (full: string) => void;
}): Promise<string> {
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
    method: "POST", headers: await fnHeaders(),
    body: JSON.stringify({
      generator_id: opts.id, generator_title: opts.title.slice(0, 80),
      ...(opts.system ? { systemPrompt: opts.system } : {}),
      messages: [{ role: "user", content: opts.prompt }],
    }),
  });
  if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "No se pudo escribir. No se te cobró."));
  opts.onCharge?.(readBilling(resp));
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") return full;
      try {
        const c = JSON.parse(json).choices?.[0]?.delta?.content;
        if (c) { full += c; opts.onText?.(full); }
      } catch { /* línea partida: se ignora */ }
    }
  }
  return full;
}
