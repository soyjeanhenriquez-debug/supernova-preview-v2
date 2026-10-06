import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { accentRuns, type CarouselDesign, type Slide } from "@/lib/carousel";
import { FONTS, palette, rgba, toneColors, type ToneColors } from "@/lib/carouselTheme";

/**
 * Una lámina del carrusel como página diseñada (05-oct-2026). Se dibuja a tamaño real (1080 × 1350 o
 * 1080 × 1080) y se exporta tal cual a PNG: lo que ves es lo que bajas. Plantilla fija en todas:
 * marca y etiqueta arriba, flecha a la derecha, @cuenta, número y barra de avance abajo. Cada tipo de
 * lámina (portada, problema, solución, tarjetas, pasos, frase, llamada) tiene su composición.
 */
export const SLIDE_W = 1080;
const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
export const slideH = (aspect: "4:5" | "1:1") => (aspect === "4:5" ? 1350 : 1080);

type Props = { slide: Slide; index: number; total: number; design: CarouselDesign; aspect: "4:5" | "1:1" };

/** Tamaño de titular según lo largo que sea: corto = enorme, largo = más chico. */
function fitSize(text: string, max: number, min: number, ref = 18) {
  const len = text.replace(/\*/g, "").length;
  return Math.round(Math.max(min, len <= ref ? max : max * (ref / len) ** 0.38));
}

function Title({ text, size, c, f, style }: { text: string; size: number; c: ToneColors; f: (typeof FONTS)[keyof typeof FONTS]; style?: CSSProperties }) {
  return (
    <h2 style={{
      margin: 0, fontFamily: `"${f.display}", Georgia, serif`, fontWeight: f.displayWeight, fontSize: size, lineHeight: f.upperTitle ? 1.0 : 1.04,
      letterSpacing: f.upperTitle ? "0.005em" : f.display === "Fraunces" || f.display === "Playfair Display" ? "-0.012em" : f.display === "Archivo Black" ? "-0.03em" : "-0.022em", textTransform: f.upperTitle ? "uppercase" : "none", color: c.text, ...style,
    }}>
      {accentRuns(text).map((r, i) => (
        <span key={i} style={r.accent ? (f.accent
          ? { color: c.accent, fontFamily: `"${f.accent.family}", Georgia, serif`, fontStyle: f.accent.italic ? "italic" : "normal", fontWeight: f.accent.weight, letterSpacing: "-0.01em", textTransform: "none", fontSize: "1.08em" }
          : { color: c.accent }) : undefined}>{r.text}</span>
      ))}
    </h2>
  );
}

const Icon = {
  x: (color: string) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  check: (color: string) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  arrow: (color: string, s = 34) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  chevron: (color: string) => <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>,
};

export const SlideView = forwardRef<HTMLDivElement, Props>(function SlideView({ slide, index, total, design, aspect }, ref) {
  const H = slideH(aspect);
  const k = H / 1350; // 1:1 comprime un poco todo
  // La lámina CTA con foto siempre va con texto claro sobre un velo oscuro.
  const tone = slide.photo && slide.kind === "llamada" ? "oscuro" : slide.tone;
  const c = toneColors(design.brand, tone, design.style);
  const f = FONTS[design.style];
  const flat = !!f.flat;
  const brand = palette(design.brand, design.style).primary;
  const mono: CSSProperties = { fontFamily: `"${f.mono}", ui-monospace, monospace`, fontWeight: f.monoWeight ?? 500, textTransform: "uppercase" };
  const isCover = slide.kind === "portada";
  const isLast = index === total - 1;
  const brandLabel = design.name || (design.handle ? `@${design.handle}` : "");
  const big = isCover ? (slide.tag?.match(/\d+/)?.[0] ?? String(total)) : String(index).padStart(2, "0");
  // Velo sobre la foto de fondo: oscuro si el texto va en blanco (siempre en la lámina CTA).
  const veil = tone === "claro" ? "#f4efe6" : "#0b0b0b";
  const card: CSSProperties = flat
    ? { background: c.card, border: `4px solid ${c.border}`, borderRadius: 20, boxShadow: `10px 10px 0 ${slide.tone === "degradado" ? "#0b0b0b" : brand}` }
    : { background: c.card, border: `2px solid ${c.border}`, borderRadius: 26 };
  const revealList = (sharp: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 * k }}>
      {(slide.reveal ?? []).map((t, i) => (
        <div key={i} style={{ ...card, padding: `${22 * k}px 30px`, display: "flex", alignItems: "center", gap: 26 }}>
          <span style={{ ...mono, fontSize: 30, color: c.accent, fontWeight: 800, minWidth: 48 }}>{String(i + 1).padStart(2, "0")}</span>
          <span style={{ fontSize: 40 * k, fontWeight: 700, color: c.text, filter: sharp ? "none" : "blur(13px)", userSelect: "none" }}>{t}</span>
        </div>
      ))}
    </div>
  );

  // Portada póster hecha con IA de imagen: la imagen ES la portada (trae su texto).
  if (slide.kind === "portada" && slide.image) {
    return (
      <div ref={ref} style={{ position: "relative", width: SLIDE_W, height: H, overflow: "hidden", background: c.bg }}>
        <img src={slide.image} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
    );
  }

  let body: ReactNode = null;
  switch (slide.kind) {
    case "portada":
      body = (
        <>
          {!!slide.chips?.length && !slide.reveal?.length && (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 12 }}>
              {slide.chips.map((t, i) => (
                <span key={i} style={{ ...mono, fontSize: 24, letterSpacing: "0.06em", textTransform: "none", padding: "12px 20px", borderRadius: 14, background: c.card, border: `2px solid ${c.border}`, color: c.accent, transform: `rotate(${i % 2 ? 2 : -2}deg)` }}>{t}</span>
              ))}
            </div>
          )}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: 20 * k }}>
            {slide.tag && (
              <span style={{ ...mono, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 14, fontSize: 24, letterSpacing: "0.2em", color: c.accent, padding: "14px 26px", borderRadius: 999, border: `2px solid ${c.border}`, background: c.card, marginBottom: 38 * k }}>
                <span style={{ width: 12, height: 12, borderRadius: 99, background: c.accent }} />{slide.tag}
              </span>
            )}
            <Title text={slide.title} size={fitSize(slide.title, (slide.reveal?.length ? 128 : 150) * k, 84 * k, 16)} c={c} f={f} />
            <div style={{ width: 120, height: 8, borderRadius: 8, background: c.accent, margin: `${42 * k}px 0 ${32 * k}px` }} />
            {slide.reveal?.length ? revealList(false) : slide.body && <p style={{ margin: 0, fontSize: 38 * k, lineHeight: 1.38, color: c.muted, maxWidth: 820 }}>{slide.body}</p>}
            {!slide.reveal?.length && <div style={{ ...card, marginTop: 46 * k, padding: `${26 * k}px 32px`, display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...mono, fontSize: 20, letterSpacing: "0.3em", color: c.muted }}>Desliza para ver</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: c.text, marginTop: 8 }}>{design.name || "Guárdalo para tenerlo a mano"}</div>
                {design.handle && <div style={{ fontSize: 26, color: c.accent, marginTop: 4 }}>@{design.handle}</div>}
              </div>
              <div style={{ width: 96, height: 96, borderRadius: 99, background: c.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{Icon.arrow(c.onAccent, 40)}</div>
            </div>}
          </div>
        </>
      );
      break;
    case "respuesta":
      body = (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Title text={slide.title} size={fitSize(slide.title, 128 * k, 80 * k, 16)} c={c} f={f} />
          <div style={{ width: 120, height: 8, borderRadius: 8, background: c.accent, margin: `${40 * k}px 0 ${36 * k}px` }} />
          {slide.reveal?.length ? revealList(true) : null}
          {slide.body && <p style={{ margin: `${slide.reveal?.length ? 34 * k : 0}px 0 0`, fontSize: 44 * k, lineHeight: 1.38, color: slide.reveal?.length ? c.muted : c.text, fontWeight: slide.reveal?.length ? 400 : 600, maxWidth: 880 }}>{slide.body}</p>}
        </div>
      );
      break;
    case "problema":
      body = (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Title text={slide.title} size={fitSize(slide.title, 104 * k, 66 * k, 18)} c={c} f={f} style={{ marginBottom: 44 * k }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 24 * k }}>
            {slide.items.map((it, i) => (
              <div key={i} style={{ ...card, padding: `${28 * k}px 34px`, display: "flex", gap: 28, alignItems: "flex-start" }}>
                <div style={{ width: 68, height: 68, borderRadius: 99, background: rgba("#ef4444", 0.14), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{Icon.x("#ef4444")}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 40 * k, fontWeight: 700, color: c.text, lineHeight: 1.18 }}>{it.title}</div>
                  {it.text && <div style={{ fontSize: 31 * k, color: c.muted, lineHeight: 1.34, marginTop: 8 }}>{it.text}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case "comparacion": {
      const [no, yes] = slide.items;
      const box = (it: { title: string; text: string } | undefined, good: boolean) => it && (
        <div style={{ ...card, padding: `${30 * k}px 36px`, ...(good ? { borderColor: flat ? c.border : c.accent, borderWidth: flat ? 4 : 3 } : { opacity: 0.88 }) }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, ...mono, fontSize: 24, fontWeight: 800, letterSpacing: "0.12em", padding: "8px 16px", borderRadius: 8,
            background: good ? c.accent : rgba("#ef4444", 0.14), color: good ? c.onAccent : "#ef4444" }}>
            {good ? Icon.check(c.onAccent) : Icon.x("#ef4444")} {it.title || (good ? "SÍ" : "NO")}
          </div>
          <div style={{ fontSize: (good ? 42 : 38) * k, fontWeight: good ? 700 : 500, color: good ? c.text : c.muted, lineHeight: 1.3, marginTop: 18 * k, textDecoration: good ? "none" : "line-through", textDecorationColor: rgba("#ef4444", 0.5) }}>{it.text}</div>
        </div>
      );
      body = (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Title text={slide.title} size={fitSize(slide.title, 108 * k, 70 * k, 18)} c={c} f={f} style={{ marginBottom: 48 * k }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 28 * k }}>{box(no, false)}{box(yes, true)}</div>
        </div>
      );
      break;
    }
    case "solucion":
      body = (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Title text={slide.title} size={fitSize(slide.title, 132 * k, 84 * k, 16)} c={c} f={f} />
          <div style={{ width: 120, height: 8, borderRadius: 8, background: c.accent, margin: `${44 * k}px 0` }} />
          {slide.body && (
            <div style={{ ...card, padding: `${44 * k}px 46px`, display: "flex", gap: 30 }}>
              <div style={{ width: 8, borderRadius: 8, background: c.accent, flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 48 * k, lineHeight: 1.4, color: c.text, fontWeight: 600 }}>{slide.body}</p>
            </div>
          )}
          {slide.items.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 30 * k }}>
              {slide.items.map((it, i) => <span key={i} style={{ ...card, borderRadius: 999, padding: "14px 26px", fontSize: 28, color: c.text }}>{it.title}</span>)}
            </div>
          )}
        </div>
      );
      break;
    case "tarjetas":
      body = (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Title text={slide.title} size={fitSize(slide.title, 116 * k, 74 * k, 18)} c={c} f={f} style={{ marginBottom: 54 * k }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
            {slide.items.map((it, i) => (
              <div key={i} style={{ ...card, padding: `${36 * k}px 34px`, minHeight: 300 * k, display: "flex", flexDirection: "column" }}>
                <div style={{ ...mono, fontSize: 28, letterSpacing: "0.12em", color: c.accent, fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</div>
                <div style={{ fontSize: 42 * k, fontWeight: 700, color: c.text, lineHeight: 1.16, marginTop: 20 * k }}>{it.title}</div>
                {it.text && <div style={{ fontSize: 32 * k, color: c.muted, lineHeight: 1.36, marginTop: 12 }}>{it.text}</div>}
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case "pasos":
      body = (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Title text={slide.title} size={fitSize(slide.title, 116 * k, 74 * k, 18)} c={c} f={f} style={{ marginBottom: 60 * k }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {slide.items.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 34, position: "relative", paddingBottom: i < slide.items.length - 1 ? 52 * k : 0 }}>
                {i < slide.items.length - 1 && <div style={{ position: "absolute", left: 44, top: 92, bottom: 4, width: 3, background: c.border }} />}
                <div style={{ width: 90, height: 90, borderRadius: 99, background: c.accent, color: c.onAccent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: `"${f.display}", serif`, fontWeight: f.displayWeight, fontSize: 44 }}>{i + 1}</div>
                <div style={{ paddingTop: 12, minWidth: 0 }}>
                  <div style={{ fontSize: 46 * k, fontWeight: 700, color: c.text, lineHeight: 1.16 }}>{it.title}</div>
                  {it.text && <div style={{ fontSize: 34 * k, color: c.muted, lineHeight: 1.38, marginTop: 10 }}>{it.text}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case "regla":
      // Con 3 líneas (qué hace / cuándo sí / cuándo no): número en círculo, palabra gigante, foto en
      // tarjeta a la izquierda, líneas a la derecha y el veredicto como barra de acción abajo.
      if (slide.items.length >= 2) {
        const num = slide.tag?.match(/\d+/)?.[0]?.padStart(2, "0") ?? String(index - 1).padStart(2, "0");
        body = (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
              <div style={{ width: 170 * k, height: 170 * k, borderRadius: 999, background: c.accent, color: flat ? "#0b0b0b" : c.onAccent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: `"${f.display}", sans-serif`, fontWeight: f.displayWeight, fontSize: 84 * k, flexShrink: 0 }}>{num}</div>
              <div style={{ minWidth: 0 }}>
                {/* Que la palabra quepa en una línea al lado del círculo (~640 px; letras anchas en mayúscula). */}
                <Title text={slide.title.replace(/\*/g, "").toLocaleUpperCase("es")} size={Math.min(fitSize(slide.title, 130 * k, 60 * k, 8), Math.floor(640 / (Math.max(1, slide.title.replace(/\*/g, "").length) * 0.74)))} c={c} f={f} style={{ lineHeight: 0.95, letterSpacing: "-0.03em", whiteSpace: "nowrap" }} />
                {slide.body && <p style={{ margin: `${8 * k}px 0 0`, fontSize: 44 * k, fontWeight: 700, color: c.text, letterSpacing: "-0.02em" }}>{slide.body}</p>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 34, marginTop: 50 * k, alignItems: "center" }}>
              {slide.photo && <img src={slide.photo} alt="" crossOrigin="anonymous" style={{ width: 470, height: 590 * k, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
              <div style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 0 }}>
                {slide.items.slice(0, 3).map((it, i) => (
                  <div key={i} style={{ padding: `${24 * k}px 0`, borderTop: i ? `5px solid ${c.text}` : "none" }}>
                    <div style={{ fontSize: 40 * k, fontWeight: 800, color: c.text, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{it.title}</div>
                    {it.text && <div style={{ fontSize: 30 * k, color: c.muted, lineHeight: 1.25, marginTop: 6 }}>{it.text}</div>}
                  </div>
                ))}
              </div>
            </div>
            {slide.verdict && (
              <div style={{ marginTop: 48 * k, background: c.accent, color: flat ? "#0b0b0b" : c.onAccent, padding: `${22 * k}px 40px`, fontSize: 44 * k, fontWeight: 800, letterSpacing: "-0.02em" }}>{slide.verdict}</div>
            )}
          </div>
        );
        break;
      }
      body = (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          {slide.tag && (
            <div style={{ fontSize: 44 * k, fontWeight: 800, color: c.text, border: `5px solid ${c.text}`, borderRadius: 22, padding: `${8 * k}px 34px`, marginBottom: 18 * k, letterSpacing: "-0.02em" }}>{slide.tag}</div>
          )}
          <Title text={slide.title.replace(/\*/g, "")} size={fitSize(slide.title, (slide.photo ? 210 : 250) * k, 120 * k, 7)} c={c} f={f} style={{ lineHeight: 0.95, letterSpacing: "-0.045em", textAlign: "center" }} />
          {slide.body && <p style={{ margin: `${18 * k}px 0 0`, fontSize: 48 * k, fontWeight: 700, color: c.text, lineHeight: 1.15, letterSpacing: "-0.02em", maxWidth: 880 }}>{slide.body}</p>}
          {slide.photo && (
            <img src={slide.photo} alt="" crossOrigin="anonymous" style={{ width: 760, height: 470 * k, objectFit: "cover", borderRadius: 34, marginTop: 40 * k, boxShadow: flat ? `10px 10px 0 ${slide.tone === "degradado" ? "#0b0b0b" : brand}` : "0 30px 60px rgba(0,0,0,0.35)" }} />
          )}
          {slide.verdict && <p style={{ margin: `${36 * k}px 0 0`, fontSize: 40 * k, fontWeight: 700, color: c.text, lineHeight: 1.2, maxWidth: 820, letterSpacing: "-0.015em" }}>{slide.verdict}</p>}
        </div>
      );
      break;
    case "giro":
      body = (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: `"${f.display}", Georgia, serif`, fontWeight: f.displayWeight, fontSize: 280 * k, lineHeight: 0.7, color: c.accent, height: 150 * k }}>“</div>
          <Title text={slide.title} size={fitSize(slide.title, 132 * k, 84 * k, 24)} c={c} f={f} style={{ lineHeight: 1.08 }} />
          <div style={{ width: 120, height: 8, borderRadius: 8, background: c.accent, margin: `${48 * k}px 0 ${26 * k}px` }} />
          {(design.handle || slide.body) && <p style={{ margin: 0, fontSize: 32 * k, color: c.muted }}>{slide.body || `— @${design.handle}`}</p>}
        </div>
      );
      break;
    case "llamada":
      // Con foto: plantilla CTA (palabra gigante en cursiva arriba + tarjeta de cristal al centro).
      if (slide.photo) {
        const big = (accentRuns(slide.title).find(r => r.accent)?.text || slide.cta || slide.title).replace(/\*/g, "").toLocaleUpperCase("es");
        body = (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontFamily: `"${f.display}", sans-serif`, fontWeight: f.displayWeight, fontStyle: "italic", fontSize: Math.min(220 * k, Math.floor(900 / (Math.max(1, big.length) * 0.68))), lineHeight: 0.9, letterSpacing: "-0.03em", color: "#ffffff", transform: "skewX(-8deg)", textShadow: "0 10px 40px rgba(0,0,0,0.35)", whiteSpace: "nowrap" }}>{big}</div>
            <div style={{ marginTop: 50 * k, width: 820, borderRadius: 48, padding: `${46 * k}px 56px`, background: "rgba(255,255,255,0.16)", border: "2px solid rgba(255,255,255,0.65)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", boxShadow: "0 30px 80px rgba(0,0,0,0.35)", textAlign: "center", color: "#ffffff" }}>
              <div style={{ fontSize: 44 * k, fontWeight: 600, opacity: 0.9 }}>comenta</div>
              <div style={{ fontFamily: f.accent ? `"${f.accent.family}", Georgia, serif` : `"${f.display}", serif`, fontStyle: "italic", fontWeight: f.accent?.weight ?? f.displayWeight, fontSize: 150 * k, lineHeight: 1, margin: `${6 * k}px 0 ${12 * k}px`, letterSpacing: "-0.01em" }}>{(slide.cta || "QUIERO").toLocaleLowerCase("es")}</div>
              {slide.body && <div style={{ fontSize: 38 * k, fontWeight: 600, lineHeight: 1.3 }}>{slide.body}</div>}
              <div style={{ marginTop: 34 * k, fontSize: 30 * k, opacity: 0.85 }}>{slide.items[0]?.title || "Guárdalo para después"}</div>
            </div>
            <div style={{ marginTop: "auto", textAlign: "center", color: "#ffffff" }}>
              <Title text={slide.title} size={fitSize(slide.title, 64 * k, 44 * k, 30)} c={{ ...c, text: "#ffffff" }} f={f} style={{ textAlign: "center", lineHeight: 1.1 }} />
              {design.line && <p style={{ margin: `${14 * k}px 0 0`, fontFamily: f.accent ? `"${f.accent.family}", Georgia, serif` : undefined, fontStyle: "italic", fontSize: 36 * k, opacity: 0.9 }}>{design.line}</p>}
            </div>
          </div>
        );
        break;
      }
      body = (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Title text={slide.title} size={fitSize(slide.title, 124 * k, 80 * k, 18)} c={c} f={f} />
          {slide.body && <p style={{ margin: `${30 * k}px 0 0`, fontSize: 42 * k, lineHeight: 1.38, color: c.muted, maxWidth: 880 }}>{slide.body}</p>}
          {slide.cta && (
            <div style={{ ...card, marginTop: 46 * k, padding: `${34 * k}px 44px`, borderStyle: "dashed", borderWidth: 3 }}>
              <div style={{ ...mono, fontSize: 22, letterSpacing: "0.3em", color: c.muted }}>Comenta o escríbeme</div>
              <div style={{ fontFamily: `"${f.display}", Georgia, serif`, fontWeight: f.displayWeight, fontSize: 104 * k, lineHeight: 1.05, color: c.accent, marginTop: 10, letterSpacing: "0.02em" }}>{slide.cta}</div>
            </div>
          )}
          {slide.items.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 * k, marginTop: 40 * k }}>
              {slide.items.map((it, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ width: 50, height: 50, borderRadius: 99, background: c.card, border: `2px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{Icon.check(c.accent)}</div>
                  <span style={{ fontSize: 36 * k, color: c.text, fontWeight: 600 }}>{it.title}</span>
                </div>
              ))}
            </div>
          )}
          {design.line && (
            <p style={{ margin: `${40 * k}px 0 0`, fontFamily: f.accent ? `"${f.accent.family}", Georgia, serif` : undefined, fontStyle: f.accent?.italic ? "italic" : "normal", fontSize: 44 * k, color: c.text, lineHeight: 1.15 }}>{design.line}</p>
          )}
          {design.handle && (
            <div style={{ alignSelf: "flex-start", marginTop: 46 * k, display: "inline-flex", alignItems: "center", gap: 16, background: c.accent, color: c.onAccent, borderRadius: 999, padding: "22px 36px", fontSize: 32, fontWeight: 700 }}>
              @{design.handle} {Icon.arrow(c.onAccent, 30)}
            </div>
          )}
        </div>
      );
      break;
  }

  // Veredicto: la línea que remata el punto, al pie del contenido.
  if (slide.verdict && ["problema", "comparacion", "solucion", "tarjetas", "pasos"].includes(slide.kind)) {
    body = (
      <>
        {body}
        <div style={{ display: "flex", gap: 20, alignItems: "stretch", marginTop: 34 * k }}>
          <div style={{ width: 8, borderRadius: 8, background: c.accent, flexShrink: 0 }} />
          <div style={{ fontSize: 36 * k, fontWeight: 800, color: c.text, lineHeight: 1.25 }}>{slide.verdict}</div>
        </div>
      </>
    );
  }

  return (
    <div ref={ref} style={{
      position: "relative", width: SLIDE_W, height: H, overflow: "hidden", boxSizing: "border-box", background: c.bg, color: c.text,
      fontFamily: `"${f.body}", system-ui, sans-serif`, padding: `${76 * k}px 88px ${176 * k}px`, display: "flex", flexDirection: "column",
    }}>
      {slide.photo && slide.kind !== "regla" && (
        <>
          <img src={slide.photo} alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${rgba(veil, 0.55)} 0%, ${rgba(veil, 0.35)} 45%, ${rgba(veil, 0.85)} 100%)` }} />
        </>
      )}
      {slide.tone !== "degradado" && !flat && !slide.photo && <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 88% 6%, ${c.glow} 0%, transparent 52%)` }} />}
      {/* Número gigante de fondo */}
      {!flat && <div style={{ position: "absolute", right: -10, bottom: 40 * k, fontFamily: `"${f.display}", Georgia, serif`, fontWeight: f.displayWeight, fontSize: 600 * k, lineHeight: 0.8, color: rgba(c.text, slide.tone === "claro" ? 0.035 : 0.05), pointerEvents: "none" }}>{big}</div>}

      {/* Arriba: con "tu papel", barra de 3 columnas (fecha · marca · papel); si no, marca y etiqueta */}
      {design.role ? (
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 20, marginBottom: 40 * k, fontSize: 24, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: c.text, fontFamily: `"${f.body}", system-ui, sans-serif` }}>
          <span>{MONTHS[new Date().getMonth()]} ©{new Date().getFullYear()}</span>
          <span style={{ textAlign: "center" }}>{brandLabel}{design.receipt ? <span style={{ color: c.accent }}> · {design.receipt}</span> : null}</span>
          <span style={{ textAlign: "right" }}>{design.role}</span>
        </div>
      ) : (
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, marginBottom: 40 * k }}>
          <div style={{ ...mono, display: "flex", alignItems: "center", gap: 14, fontSize: 24, letterSpacing: "0.2em", color: c.muted, fontWeight: 700 }}>
            <span style={{ width: 14, height: 14, borderRadius: 99, background: c.accent }} />{brandLabel}{design.receipt ? ` · ${design.receipt}` : ""}
          </div>
          {flat
            ? <div style={{ ...mono, fontSize: 22, letterSpacing: "0.14em", color: slide.tone === "degradado" ? "#ffffff" : c.onAccent, background: slide.tone === "degradado" ? "#0b0b0b" : c.accent, padding: "8px 16px", borderRadius: 6 }}>{slide.kicker}</div>
            : <div style={{ ...mono, fontSize: 22, letterSpacing: "0.28em", color: c.muted }}>{slide.kicker}</div>}
        </div>
      )}

      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0, paddingRight: isLast ? 0 : 34 }}>{body}</div>

      {/* Flecha para deslizar */}
      {!isLast && (
        <div style={{ position: "absolute", right: 26, top: "50%", marginTop: -32, width: 64, height: 64, borderRadius: 99, border: `2px solid ${c.border}`, background: c.card, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.chevron(c.muted)}</div>
      )}

      {/* Abajo: cuenta, número y barra de avance */}
      <div style={{ position: "absolute", left: 88, right: 88, bottom: 52 * k }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          {slide.bridge && !isLast
            ? <span style={{ fontSize: 28, fontWeight: 700, color: c.text, display: "inline-flex", alignItems: "center", gap: 12, maxWidth: 760 }}>{slide.bridge} {Icon.arrow(c.accent, 28)}</span>
            : <span style={{ fontSize: 24, color: c.muted }}>{design.handle ? `@${design.handle}` : ""}</span>}
          <span style={{ ...mono, fontSize: 22, letterSpacing: "0.16em", color: c.muted }}>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        </div>
        <div style={{ height: 6, borderRadius: 6, background: c.track }}>
          <div style={{ height: 6, borderRadius: 6, width: `${((index + 1) / total) * 100}%`, background: c.accent }} />
        </div>
      </div>
    </div>
  );
});
