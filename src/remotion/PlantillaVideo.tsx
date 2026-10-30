import { useMemo } from "react";
import { AbsoluteFill, interpolate, Series, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { loadFont as loadSora } from "@remotion/google-fonts/Sora";
import { loadFont as loadManrope } from "@remotion/google-fonts/Manrope";
import type { Word } from "@/lib/subtitleStyles";
import type { MomentoFinal, PlantillaId } from "@/lib/plantillasVideo";

/**
 * Plantillas con TU video (30-oct-2026, Jean): tu toma (sin silencios) es la base y encima va el diseño de cada una.
 * Las 3 del reto (modeladas de sus 3 referencias): Explicador, Set + fichas y Desfile de casos. Y 3 de reels ya
 * analizados con Apify: Lista numerada («5 herramientas, la última es la mejor»), Charla con íconos y Letrero de
 * urgencia («Faltan 2 meses»). Los momentos (cifra, punto, caso, frase) los saca la IA de lo que dices: nunca inventa
 * cifras. Todo el texto en HTML con letras web (Sora y Manrope) dentro del cuadro.
 */
const SORA = loadSora("normal", { weights: ["700", "800"], subsets: ["latin", "latin-ext"] }).fontFamily;
const MANROPE = loadManrope("normal", { weights: ["600", "700", "800"], subsets: ["latin", "latin-ext"] }).fontFamily;
const C = { bg: "#0A0A0B", card: "#141416", line: "#26262B", txt: "#F4F4F5", mut: "#A1A1AA", amb: "#F5A524", grn: "#22C55E",
  teal: "#0B1F1C", teal2: "#10302A", mint: "#3DDC97", paper: "#F3F2EE" };
const TINTS = ["#FDE7C8", "#D9F0E3", "#DCE8FB", "#F6DCE6", "#E9E2FB", "#FFF3BF"];

export type PlantillaProps = {
  plantilla: PlantillaId;
  src: string;
  /** Tramos del video original que se quedan (sin silencios). Vacío = el video entero. */
  tramos: { a: number; b: number }[];
  words: Word[];
  claves: string[];
  momentos: MomentoFinal[];
  letrero: string;
  cierre: string;
};

const norm = (t: string) => t.toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ]/g, "");
function useIn(delay = 0, damping = 14) {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, mass: 0.7 } });
}

export function PlantillaVideo(p: PlantillaProps) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const k = W / 1080; // todo se diseñó en 1080 de ancho
  const end = durationInFrames / fps;
  const idx = p.momentos.findIndex((m, i) => t >= m.t && t < (p.momentos[i + 1]?.t ?? end) && t < m.t + m.dur);
  const m = idx >= 0 ? p.momentos[idx] : null;
  const desdeM = m ? Math.round((t - m.t) * fps) : 0;
  const enCierre = !!p.cierre && t > end - 2.6;
  // Qué ocupa la pantalla: en Explicador y Set + fichas el momento tapa tu toma (tu voz sigue); en el resto vas debajo.
  const tapa = !!m && !enCierre && (p.plantilla === "explicador" || p.plantilla === "set");
  const enCirculo = p.plantilla === "desfile" && !!p.momentos.length && t >= p.momentos[0].t;
  const tramos = p.tramos.length ? p.tramos : [{ a: 0, b: end }];
  const zoom = p.plantilla === "set" ? 1.04 + (t % 6) / 140 : 1;

  const toma = (
    <Series>
      {tramos.map((x, i) => {
        const a = Math.round(x.a * fps), b = Math.max(a + 1, Math.round(x.b * fps));
        return (
          <Series.Sequence key={i} durationInFrames={b - a} premountFor={fps}>
            <Video src={p.src} trimBefore={a} trimAfter={b} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%", transform: `scale(${zoom * (p.plantilla === "lista" && i % 2 ? 1.1 : 1)})`, transformOrigin: "50% 30%" }} />
          </Series.Sequence>
        );
      })}
    </Series>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: p.plantilla === "desfile" ? C.paper : "#000" }}>
      {/* Tu toma: pantalla completa, o en un círculo abajo (Desfile). Siempre suena. */}
      <AbsoluteFill style={enCirculo ? { left: W / 2 - 150 * k, top: H - 560 * k, width: 300 * k, height: 300 * k, borderRadius: 999, overflow: "hidden", border: `${6 * k}px solid #fff`, boxShadow: "0 12px 30px rgba(0,0,0,.25)" } : { opacity: tapa ? 0 : 1 }}>
        {toma}
      </AbsoluteFill>
      {p.plantilla === "set" && !tapa && <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,.72) 100%)" }} />}

      <AbsoluteFill style={{ transform: `scale(${k})`, transformOrigin: "0 0", width: 1080, height: H / k }}>
        {m && !enCierre && <Momento key={idx} p={p} m={m} n={idx + 1} total={p.momentos.length} f={desdeM} H={H / k} />}
        {p.plantilla === "explicador" && <Header letrero={p.letrero} n={Math.max(1, idx + 1)} total={Math.max(1, p.momentos.length)} />}
        {p.plantilla === "urgencia" && p.letrero && <Letrero texto={p.letrero} />}
        {p.plantilla === "desfile" && !enCirculo && p.letrero && <Letrero texto={p.letrero} blanco />}
        {!enCierre && <Subtitulo p={p} t={t} H={H / k} />}
        {enCierre && <Cierre palabra={p.cierre} claro={p.plantilla === "desfile"} top={p.plantilla === "desfile" ? 640 : 1060} color={p.plantilla === "set" ? C.mint : C.amb} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Header({ letrero, n, total }: { letrero: string; n: number; total: number }) {
  return (
    <div style={{ position: "absolute", top: 70, left: 60, right: 60, display: "flex", justifyContent: "space-between", fontFamily: SORA, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: C.mut, textShadow: "0 2px 8px rgba(0,0,0,.6)" }}>
      <span><span style={{ color: C.amb }}>●</span> {letrero.toLocaleUpperCase("es")}</span>
      <span>{String(n).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
    </div>
  );
}

function Letrero({ texto, blanco }: { texto: string; blanco?: boolean }) {
  const p = useIn(0, 12);
  return (
    <div style={{ position: "absolute", top: 150, left: 60, right: 60, display: "flex", justifyContent: "center" }}>
      <div style={{ background: "#fff", color: "#111", fontFamily: SORA, fontWeight: 800, fontSize: blanco ? 74 : 62, lineHeight: 1.08, textAlign: "center", padding: "22px 32px", borderRadius: 22, transform: `scale(${p})`, boxShadow: "0 12px 30px rgba(0,0,0,.25)" }}>{texto}</div>
    </div>
  );
}

/** Lo que aparece en cada momento, según la plantilla. */
function Momento({ p, m, n, total, f, H }: { p: PlantillaProps; m: MomentoFinal; n: number; total: number; f: number; H: number }) {
  const a = spring({ frame: f, fps: 30, config: { damping: 13, mass: 0.7 } });
  const b = spring({ frame: f - 12, fps: 30, config: { damping: 14, mass: 0.7 } });
  if (p.plantilla === "explicador") {
    return (
      <AbsoluteFill style={{ background: `radial-gradient(1200px 900px at 50% 18%, rgba(245,165,36,.20), rgba(10,10,11,0) 60%), ${C.bg}`, alignItems: "center", padding: "0 70px" }}>
        {m.valor ? (
          <div style={{ marginTop: 470, textAlign: "center" }}>
            <div style={{ fontFamily: SORA, fontWeight: 800, fontSize: m.valor.length > 5 ? 170 : 250, letterSpacing: -8, color: C.amb, transform: `scale(${0.7 + a * 0.3})`, opacity: a, lineHeight: 1 }}>{m.valor}</div>
            <div style={{ fontFamily: MANROPE, fontWeight: 700, fontSize: 52, color: C.txt, marginTop: 26, opacity: b }}>{m.titulo}</div>
          </div>
        ) : (
          <div style={{ marginTop: 420, textAlign: "center" }}>
            {m.tipo === "punto" && <div style={{ width: 170, height: 170, borderRadius: 999, background: C.amb, color: C.bg, fontFamily: SORA, fontWeight: 800, fontSize: 110, display: "grid", placeItems: "center", margin: "0 auto 40px", transform: `scale(${a})` }}>{n}</div>}
            <div style={{ fontFamily: SORA, fontWeight: 800, fontSize: 88, lineHeight: 1.06, letterSpacing: -2, color: C.txt, opacity: a, transform: `translateY(${(1 - a) * 40}px)` }}>{m.titulo}</div>
            {m.detalle && <div style={{ fontFamily: MANROPE, fontWeight: 700, fontSize: 44, color: C.mut, marginTop: 30, opacity: b }}>{m.detalle}</div>}
          </div>
        )}
      </AbsoluteFill>
    );
  }
  if (p.plantilla === "set") {
    const filas = m.detalle ? m.detalle.split(/\s*[·;|]\s*|,\s+/).filter(Boolean).slice(0, 3) : [];
    return (
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${C.teal2} 0%, ${C.teal} 70%)`, padding: "260px 80px 0" }}>
        <div style={{ fontFamily: SORA, fontWeight: 800, fontSize: 28, letterSpacing: 4, color: C.mint, opacity: a }}>{(p.letrero || "TU PLAN").toLocaleUpperCase("es")} · {String(n).padStart(2, "0")}</div>
        <div style={{ fontFamily: SORA, fontWeight: 800, fontSize: 92, color: "#fff", letterSpacing: -2, marginTop: 14, lineHeight: 1.04, opacity: a }}>{m.titulo}</div>
        <div style={{ height: 2, background: "rgba(61,220,151,.25)", margin: "40px 0 20px" }} />
        {filas.map((x, i) => (
          <div key={i} style={{ padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,.08)", fontFamily: MANROPE, fontWeight: 700, fontSize: 40, color: "#fff",
            opacity: interpolate(f - 8 - i * 6, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{x}</div>
        ))}
        {m.valor && <div style={{ marginTop: 50, fontFamily: SORA, fontWeight: 800, fontSize: 130, color: C.mint, letterSpacing: -4, opacity: b }}>{m.valor}</div>}
      </AbsoluteFill>
    );
  }
  if (p.plantilla === "desfile") {
    return (
      <div style={{ position: "absolute", top: 170, left: 110, width: 860, background: "#fff", borderRadius: 34, boxShadow: "0 24px 60px rgba(0,0,0,.14)", overflow: "hidden", transform: `translateY(${(1 - a) * 80}px)`, opacity: a }}>
        <div style={{ height: 360, background: TINTS[(n - 1) % TINTS.length], display: "grid", placeItems: "center", fontSize: 190 }}>{m.emoji || "✨"}</div>
        <div style={{ padding: "30px 36px 36px" }}>
          <div style={{ fontFamily: SORA, fontWeight: 800, fontSize: 52, color: "#111", lineHeight: 1.1 }}>{m.titulo}</div>
          {m.detalle && <div style={{ fontFamily: MANROPE, fontWeight: 600, fontSize: 34, color: "#555", marginTop: 12 }}>{m.detalle}</div>}
        </div>
        {m.valor && <div style={{ position: "absolute", left: 30, top: 285, background: "#16A34A", color: "#fff", fontFamily: SORA, fontWeight: 800, fontSize: 56, padding: "10px 26px", borderRadius: 16, transform: `scale(${b}) rotate(-3deg)` }}>{m.valor}</div>}
      </div>
    );
  }
  if (p.plantilla === "lista") {
    return (
      <div style={{ position: "absolute", top: 230, left: 60, right: 60, display: "flex", alignItems: "center", gap: 26, background: "rgba(10,10,11,.86)", border: `2px solid ${C.line}`, borderRadius: 30, padding: "26px 30px", transform: `translateX(${(1 - a) * -120}px)`, opacity: a }}>
        <div style={{ minWidth: 120, height: 120, borderRadius: 26, background: C.amb, color: C.bg, fontFamily: SORA, fontWeight: 800, fontSize: 64, display: "grid", placeItems: "center" }}>{n}<span style={{ fontSize: 28 }}>/{total}</span></div>
        <div style={{ fontFamily: SORA, fontWeight: 800, fontSize: 58, color: "#fff", lineHeight: 1.06, letterSpacing: -1 }}>{m.titulo}</div>
      </div>
    );
  }
  if (p.plantilla === "iconos") {
    const izq = n % 2 === 1;
    return (
      <div style={{ position: "absolute", top: H * 0.44, [izq ? "left" : "right"]: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, transform: `scale(${a}) rotate(${izq ? -6 : 6}deg)` }}>
        <div style={{ width: 170, height: 170, borderRadius: 40, background: "rgba(255,255,255,.95)", boxShadow: "0 18px 40px rgba(0,0,0,.35)", display: "grid", placeItems: "center", fontSize: 105 }}>{m.emoji || "💡"}</div>
        <div style={{ maxWidth: 300, textAlign: "center", fontFamily: MANROPE, fontWeight: 800, fontSize: 34, color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,.7)", opacity: b }}>{m.valor || m.titulo}</div>
      </div>
    );
  }
  // urgencia: la cifra en grande en el centro, con su etiqueta.
  if (!m.valor) return null;
  return (
    <div style={{ position: "absolute", top: H * 0.5, left: 0, right: 0, textAlign: "center", transform: `scale(${0.6 + a * 0.4})`, opacity: a }}>
      <div style={{ display: "inline-block", background: "#E11D2E", color: "#fff", fontFamily: SORA, fontWeight: 800, fontSize: m.valor.length > 5 ? 120 : 180, letterSpacing: -4, padding: "6px 40px", borderRadius: 26, boxShadow: "0 16px 40px rgba(225,29,46,.45)" }}>{m.valor}</div>
      <div style={{ marginTop: 16, fontFamily: MANROPE, fontWeight: 800, fontSize: 46, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,.75)" }}>{m.titulo}</div>
    </div>
  );
}

/** Subtítulos de 1 a 3 palabras con la palabra clave en color, al estilo de cada plantilla. */
function Subtitulo({ p, t, H }: { p: PlantillaProps; t: number; H: number }) {
  const grupos = useMemo(() => {
    const out: { ws: Word[]; t0: number; t1: number }[] = [];
    let cur: Word[] = [];
    p.words.forEach((w, i) => {
      cur.push(w);
      if (/[.,?!:;]$/.test(w.w) || cur.length === 3 || i === p.words.length - 1) { out.push({ ws: cur, t0: cur[0].t0, t1: cur[cur.length - 1].t1 }); cur = []; }
    });
    return out;
  }, [p.words]);
  const claves = useMemo(() => new Set(p.claves.map(norm)), [p.claves]);
  const g = grupos.find((x, i) => t >= x.t0 - 0.05 && t < (grupos[i + 1]?.t0 ?? x.t1 + 0.8));
  if (!g) return null;
  const pop = interpolate(t - g.t0, [0, 0.12], [0.86, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pl = p.plantilla;
  const hl = pl === "set" ? C.mint : pl === "urgencia" ? "#FFD60A" : C.amb;
  const base: React.CSSProperties =
    pl === "set" || pl === "lista" ? { fontFamily: SORA, fontWeight: 800, fontSize: 70, textTransform: "uppercase", letterSpacing: -1, color: "#fff", textShadow: "0 4px 18px rgba(0,0,0,.65)" }
      : pl === "desfile" ? { fontFamily: MANROPE, fontWeight: 800, fontSize: 52, color: "#fff", background: "rgba(10,10,11,.88)", padding: "14px 26px", borderRadius: 18 }
        : pl === "iconos" ? { fontFamily: MANROPE, fontWeight: 800, fontSize: 60, color: "#fff", textShadow: "0 3px 14px rgba(0,0,0,.7)" }
          : pl === "urgencia" ? { fontFamily: MANROPE, fontWeight: 800, fontSize: 66, color: "#fff", WebkitTextStroke: "3px #000", paintOrder: "stroke" }
            : { fontFamily: MANROPE, fontWeight: 800, fontSize: 58, color: C.txt, textShadow: "0 3px 14px rgba(0,0,0,.6)" };
  const top = pl === "desfile" ? H - 240 : pl === "iconos" ? H * 0.7 : H * 0.745;
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ ...base, transform: `scale(${pop})`, textAlign: "center", maxWidth: 940, lineHeight: 1.12 }}>
        {g.ws.map((w, i) => (
          <span key={i} style={{ color: claves.has(norm(w.w)) ? hl : undefined }}>{w.w.replace(/[.,;:]$/, "")}{i < g.ws.length - 1 ? " " : ""}</span>
        ))}
      </div>
    </div>
  );
}

function Cierre({ palabra, claro, color, top }: { palabra: string; claro?: boolean; color: string; top: number }) {
  const p = useIn(0, 9);
  // Debajo de la cara (tu toma sigue arriba mientras pides el comentario).
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ border: `5px solid ${color}`, borderRadius: 30, padding: "30px 60px", textAlign: "center", background: claro ? "#fff" : "rgba(0,0,0,.6)", transform: `scale(${p})` }}>
        <div style={{ fontFamily: SORA, fontWeight: 800, fontSize: 64, color: claro ? "#111" : "#fff", letterSpacing: 2 }}>COMENTA</div>
        <div style={{ fontFamily: SORA, fontWeight: 800, fontSize: palabra.length > 8 ? 76 : 110, color, letterSpacing: 2, lineHeight: 1.05 }}>{palabra}</div>
        <div style={{ fontFamily: MANROPE, fontWeight: 700, fontSize: 30, color: claro ? "#555" : C.mut, marginTop: 10 }}>y te lo mando por mensaje</div>
      </div>
    </div>
  );
}
