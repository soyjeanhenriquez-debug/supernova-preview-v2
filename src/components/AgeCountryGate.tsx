import { useEffect, useMemo, useState } from "react";
import { Cake, Check, ChevronDown, Globe, Loader2, Minus, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Edad y país al entrar (07-oct-2026, decisión de Jean: "preguntemos siempre al usuario si es mayor
 * de edad"; mismo formato que Prime IA). Se pregunta una sola vez y se guarda en el SERVIDOR
 * (set_age_country): la edad queda fija; el país se puede cambiar. Cualquier sección solo para
 * mayores de 18 debe preguntar al servidor (is_adult), nunca a este componente.
 */

// Primero los países de nuestra gente; después el resto en orden alfabético.
const FIRST = ["DO", "MX", "CO", "AR", "ES", "US", "PE", "CL", "VE", "EC"];
const COUNTRIES: Record<string, string> = {
  DO: "República Dominicana", MX: "México", CO: "Colombia", AR: "Argentina", ES: "España", US: "Estados Unidos",
  PE: "Perú", CL: "Chile", VE: "Venezuela", EC: "Ecuador", BO: "Bolivia", BR: "Brasil", CA: "Canadá", CR: "Costa Rica",
  CU: "Cuba", SV: "El Salvador", GT: "Guatemala", HN: "Honduras", NI: "Nicaragua", PA: "Panamá", PY: "Paraguay",
  PR: "Puerto Rico", UY: "Uruguay", GQ: "Guinea Ecuatorial", PT: "Portugal", IT: "Italia", FR: "Francia",
  DE: "Alemania", GB: "Reino Unido", NL: "Países Bajos", CH: "Suiza", BE: "Bélgica", IE: "Irlanda", AU: "Australia",
  JP: "Japón", HT: "Haití", JM: "Jamaica", TT: "Trinidad y Tobago", AW: "Aruba", CW: "Curazao",
};
const flag = (cc: string) => String.fromCodePoint(...[...cc].map(c => 0x1f1a5 + c.charCodeAt(0)));
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function guessCountry(): string {
  try {
    const region = new Intl.Locale(navigator.language).region;
    if (region && COUNTRIES[region]) return region;
  } catch { /* navegador viejo */ }
  return "";
}

export function AgeCountryGate() {
  const { user } = useAuth();
  const [need, setNeed] = useState(false);
  const [age, setAge] = useState<number | null>(null);
  const [country, setCountry] = useState(guessCountry);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const uid = user?.id;
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    // La tabla es nueva: aún no está en los tipos generados de Supabase.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const check = (retry: boolean) => (supabase as any).from("user_age_country").select("user_id").eq("user_id", uid).maybeSingle()
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (!alive) return;
        if (!error) { if (!data) setNeed(true); return; }
        // Un fallo de red al abrir no debe saltarse la pregunta para siempre: un reintento a los 3 s.
        // Si vuelve a fallar no se bloquea la app (lo de +18 lo decide igual el servidor con is_adult).
        if (retry) timer = window.setTimeout(() => check(false), 3000);
      }, () => { if (alive && retry) timer = window.setTimeout(() => check(false), 3000); });
    let timer = 0;
    check(true);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [uid]);

  const list = useMemo(() => {
    const all = [...FIRST, ...Object.keys(COUNTRIES).filter(c => !FIRST.includes(c)).sort((a, b) => COUNTRIES[a].localeCompare(COUNTRIES[b], "es"))];
    const n = norm(q.trim());
    return n ? all.filter(c => norm(COUNTRIES[c]).includes(n)) : all;
  }, [q]);

  if (!need) return null;
  const ageOk = age !== null && age >= 10 && age <= 110;
  const ready = ageOk && !!country;
  // El registro guarda el nombre en display_name; quien entra con Google o por código puede traer full_name.
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const rawName = [meta.full_name, meta.display_name, meta.name].find((v): v is string => typeof v === "string" && v.trim().length > 0);
  const firstName = rawName?.trim().split(/\s+/)[0];
  // Los botones − y + con la casilla vacía empiezan en 18 (antes no hacían nada).
  const bump = (d: 1 | -1) => setAge(a => (a === null ? 18 : Math.min(110, Math.max(10, a + d))));

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("set_age_country" as never, { p_age: age, p_country: country } as never);
    setBusy(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      toast.error(
        res?.error === "age" ? "Revisa tu edad: escribe solo el número de años."
          : res?.error === "country" ? "Elige tu país de la lista."
          : res?.error === "no_auth" ? "Tu sesión se cerró. Recarga la página y entra de nuevo."
          : "No se pudo guardar. Revisa tu internet y toca Continuar otra vez.",
      );
      return;
    }
    setNeed(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/85 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
      <form onSubmit={save} noValidate className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <h2 id="age-gate-title" className="font-display text-xl font-semibold text-foreground text-center">{firstName ? `Hola, ${firstName}` : "Antes de empezar"}</h2>
        <p className="text-[13px] text-muted-foreground text-center mt-1.5">Dos datos y entras: tu edad y desde dónde nos visitas, para adaptar SUPERNOVA a ti.</p>

        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground"><Cake className="w-4 h-4 text-primary" /> Edad</span>
            {ageOk && <Check className="w-4 h-4 text-emerald-400" />}
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 h-14">
            <button type="button" aria-label="Restar un año" onClick={() => bump(-1)} className="w-9 h-9 rounded-full text-muted-foreground hover:text-foreground flex items-center justify-center"><Minus className="w-4 h-4" /></button>
            <input inputMode="numeric" aria-label="Tu edad" placeholder="Tu edad" value={age ?? ""}
              onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 3); setAge(v ? Number(v) : null); }}
              className="flex-1 min-w-0 bg-transparent text-center text-2xl font-semibold tabular-nums text-foreground placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground focus:outline-none" />
            <span className="text-[13px] text-muted-foreground">años</span>
            <button type="button" aria-label="Sumar un año" onClick={() => bump(1)} className="w-9 h-9 rounded-full text-muted-foreground hover:text-foreground flex items-center justify-center"><Plus className="w-4 h-4" /></button>
          </div>
          {age !== null && age > 110 && <p className="text-[12px] text-destructive" role="alert">Escribe tu edad en años (por ejemplo, 28).</p>}
        </div>

        <div className="mt-5 space-y-2 relative">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground"><Globe className="w-4 h-4 text-primary" /> País</span>
            {country && <Check className="w-4 h-4 text-emerald-400" />}
          </div>
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={country ? `País: ${COUNTRIES[country]}. Cambiar` : "Elegir país"}
            className="w-full flex items-center gap-2 rounded-2xl border border-border bg-background px-4 h-14 text-left">
            <span className="flex-1 text-[15px] text-foreground">{country ? `${flag(country)}  ${COUNTRIES[country]}` : <span className="text-muted-foreground">Elige tu país</span>}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="absolute left-0 right-0 mt-1 z-10 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 h-11 border-b border-border">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar país…" className="flex-1 bg-transparent text-sm text-foreground focus:outline-none" />
              </div>
              <ul className="max-h-56 overflow-auto py-1">
                {list.map(c => (
                  <li key={c}>
                    <button type="button" onClick={() => { setCountry(c); setOpen(false); setQ(""); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-secondary ${c === country ? "text-foreground" : "text-muted-foreground"}`}>
                      <span>{flag(c)}</span><span className="flex-1">{COUNTRIES[c]}</span>{c === country && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  </li>
                ))}
                {list.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No está en la lista. Elige el más cercano.</li>}
              </ul>
            </div>
          )}
        </div>

        <button type="submit" disabled={!ready || busy}
          className="btn-primary-nova mt-6 w-full h-12 rounded-2xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Continuar
        </button>
        <p className="mt-3 text-[11px] text-muted-foreground text-center">Es una sola vez. Tu edad queda guardada y no se puede cambiar después; el país sí.</p>
      </form>
    </div>
  );
}
