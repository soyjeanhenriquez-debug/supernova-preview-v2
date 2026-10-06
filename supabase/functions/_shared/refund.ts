// SUPERNOVA — Devolver créditos cuando la IA falla, sin perder ninguno en silencio.
//
// Por qué existe (chequeo de seguridad 06-oct-2026, hallazgo M3): las funciones hacían
// `try { await db.rpc("refund_charge") } catch {}`. Pero supabase.rpc NO lanza: devuelve { error }.
// Si la base fallaba justo ahí (límite de 8 s, reinicio), al cliente se le decía "no se te cobró"
// y los créditos quedaban descontados sin rastro.
//
// refund_charge es idempotente (si ya se devolvió responde ok + already), así que reintentar es
// seguro. Solo vale dentro de la hora del cobro: por eso se reintenta aquí mismo, con pausas
// cortas. Si después de 3 intentos sigue fallando, queda una línea "REEMBOLSO_PENDIENTE" en los
// logs con el id de la transacción (sin datos del usuario) para devolverlo a mano.

// deno-lint-ignore no-explicit-any
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };

const WAIT_MS = [0, 400, 1500];

/** Devuelve true si el crédito quedó devuelto (o ya lo estaba). */
export async function safeRefund(db: RpcClient, txId: string | null | undefined, reason: string, fn = "?"): Promise<boolean> {
  if (!txId) return true;
  let last = "";
  for (const wait of WAIT_MS) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const { data, error } = await db.rpc("refund_charge", { p_tx_id: txId, p_reason: reason.slice(0, 200) });
      if (!error && data?.ok === true) return true;
      // not_found = el cobro no existe, es de más de 1 hora o era de 0 créditos: reintentar no sirve.
      if (!error && data?.reason === "not_found") { last = "not_found"; break; }
      last = error?.code ?? error?.message?.slice(0, 80) ?? "respuesta sin ok";
    } catch (e) {
      last = e instanceof Error ? e.name : "excepción";
    }
  }
  console.error(`REEMBOLSO_PENDIENTE fn=${fn} tx=${txId} motivo=${last}`);
  return false;
}
