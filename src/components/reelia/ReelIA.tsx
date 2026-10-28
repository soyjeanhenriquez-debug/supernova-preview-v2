import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toolEvent } from "@/lib/toolEvents";
import { toast } from "sonner";
import { blockingIssue } from "@/lib/webRender";
import { Player } from "@remotion/player";
import { AlertTriangle, Camera, Check, ChevronDown, Clapperboard, Download, Link2, Loader2, Send, Sparkles, Star, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isGenjutsuOwner } from "@/lib/genjutsuOwner";
import { fmtNum as fmtCr } from "@/lib/recommendTarget";
import { useCredits } from "@/hooks/useCredits";
import { fnErrorMessage, fnHeaders, readBilling } from "@/lib/fnAuth";
import { audioSeconds, compressImage } from "@/lib/montage";
import { deleteProduction, getMedia, putMedia } from "@/lib/productionStore";
import { guardarEnLista, keyActual, keyLista, leerGuardada, leerLista, quitarDeLista, unirListas } from "@/lib/reelProyectos";
import type { Word } from "@/lib/subtitleStyles";
import { uploadStudioImage, refForServer, type StudioRef } from "@/lib/studioUpload";
import { sliceWavBase64 } from "@/lib/audioSlice";
import { wordsFromAlignment } from "@/lib/reelIa";
import { analizarCortes, miniaturas } from "@/lib/videoCortes";
import { streamGenerator } from "@/components/video/videoApi";
import { ToolShell } from "@/components/tool/ToolShell";
import { ReelDinamico, type RDPlano, type RDProps, type RDTramo } from "@/remotion/ReelDinamico";
import {
  FORMAS, GENERATOR_ID, HABLA_USD_SEG, MODO_NOMBRE, PALETAS, palabraDelGuion, PRICE_PLAN, SYSTEM, VELOCIDADES, audioTramo, costo, huella, paleta, pantallas,
  parseReel, pedidoIA, SYSTEM_ESPEJO, pedidoEspejo, parseEspejo, espejoReel, resumen, seVe, textoPublicacion, tiempos, tramos, type Analisis, type ModoReel, type Oferta, type Plano, type Reel,
} from "@/lib/reelDinamico";
import { Inicio, type Origen } from "./Inicio";
import { ajustesDe as ajustesPublicar, casillasDelDia, etiquetaCasilla, siguienteLibre } from "@/lib/publicar";
import { Storyboard, type Medio } from "./Storyboard";
import { ReelsEnCurso } from "./ReelsEnCurso";
import { GrabarConGuion } from "@/components/reel/GrabarConGuion";
import { dejarToma } from "@/lib/grabacion";
import { BIBLIO, useStudioDatos, type Borrador, type Identidad, type Plantilla } from "./useStudioDatos";

/**
 * Reel Studio (24/25-oct-2026; abierto a clientes el 26-oct-2026: el servidor cobra voz, tomas hablando y análisis). Inicio: recrear un reel de referencia, crear desde una idea o
 * con tu guion; tus borradores diarios, tus plantillas y Mi identidad. Luego 4 pasos: 1 Tu idea · 2 Tus recursos ·
 * 3 Tu video (storyboard editable + cambios conversando) · 4 Crear reel (costo real, producción con su avance real
 * y el MP4 armado en el navegador y validado).
 * Servidor: reel-ia (voz, enlace y análisis de la referencia, tú hablando), avatar-studio (tus looks), yt-produce
 * (imágenes), video-studio (animaciones), reel-diario (borradores diarios). Lo pagado se guarda en el navegador
 * (IndexedDB) por huella: si el reel cambia, se reusa lo que no cambió. Lógica pura: src/lib/reelDinamico.ts.
 */
const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const FPS = 30;
const SIZE = { width: 720, height: 1280 };
const REF_MAX = 18 * 1024 * 1024;
const PEDIDO_SUPERNOVA = "Un reel de 35 a 45 s que presente SUPERNOVA: cómo encuentra negocios digitales que ya venden (anuncios con muchos días pagando publicidad) y te ayuda a crear tu versión con el precio en tu moneda. Gancho fuerte de curiosidad, ritmo rápido y juguetón, y al final: Comenta SUPERNOVA y te mando el enlace.";
const MODOS: ModoReel[] = ["espejo", "recrear", "inspiracion", "adaptacion"];
// Un formato de SUPERNOVA es solo la estructura: la persona pone su tema. Espejo y Recrear copiarían el guion de otro.
const MODOS_FORMATO: ModoReel[] = ["inspiracion", "adaptacion"];
const modoDe = (m: ModoReel, publica?: boolean): ModoReel => (publica && !MODOS_FORMATO.includes(m) ? "inspiracion" : m);
const MODO_LINEA: Record<ModoReel, string> = {
  espejo: "95 % · el mismo reel: mismo gancho, mismos planos; cambias presentador, B-roll y voz.", recrear: "75 % · la misma idea, a tu manera.",
  inspiracion: "50 % · su fórmula, tu tema.", adaptacion: "Su fórmula para vender tu oferta.",
};

type Estado = "pendiente" | "trabajando" | "listo" | "falló";
type Voz = { id: string; nombre: string; muestra: string | null; propia: boolean; clonada: boolean };
type Asset = { estado: Estado; idx: number; job?: string | null; path?: string; vertical?: boolean; motivo?: string };
/** Por qué falló, en palabras de la persona (Guardián del Creador: antes solo decía «Esto falló»). */
const motivoDe = (e: unknown) => (e instanceof Error && e.message ? e.message.slice(0, 160) : undefined);
type Msg = { de: "tu" | "ia"; texto: string };
type Ajustes = { paleta: string; ropa: string; palabra: string; velocidad: number; sfx: boolean; voice_id: string; foto: number };
type Proyecto = {
  id: string;
  origen: Origen | null;
  paso: number;
  idea: string;
  modo: ModoReel;
  /** Espejo: cambiar el gancho del original (opcional; por defecto se queda igual). */
  cambiarGancho?: boolean;
  plantillaId: string | null;
  borradorId: string | null;
  chat: Msg[];
  reel: Reel | null;
  ajustes: Ajustes;
  voz: { key: string; words: Word[]; seconds: number } | null;
  assets: Record<string, Asset>;
  next: number;
  /** Subtítulos editados (capa aparte): por el segundo en que empiezan. */
  subs: Record<string, string>;
  auto: boolean;
  validado: { ok: boolean; detalle: string } | null;
  /** Última vez que se tocó (ordena "Tus reels en curso"). */
  actualizado?: number;
};
const ajustesDe = (i: Identidad): Ajustes => ({ paleta: i.paleta, ropa: i.ropa, palabra: i.palabra, velocidad: i.velocidad, sfx: i.sfx, voice_id: i.voice_id, foto: 0 });
const nuevo = (i: Identidad, origen: Origen | null = null): Proyecto => ({
  id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`, origen, paso: 0, idea: "", modo: "inspiracion", plantillaId: null, borradorId: null,
  chat: [], reel: null, ajustes: ajustesDe(i), voz: null, assets: {}, next: 1, subs: {}, auto: false, validado: null,
});
// El reel abierto (para retomarlo al entrar). La lista de todos los reels en curso está en reelProyectos.ts.
const KEY = keyActual;
function cargar(uid: string, i: Identidad): Proyecto {
  try { const m = JSON.parse(localStorage.getItem(KEY(uid)) ?? "null"); if (m?.id) { const n = nuevo(i); return { ...n, ...m, ajustes: { ...n.ajustes, ...m.ajustes } }; } } catch { /* sin almacenamiento */ }
  return nuevo(i);
}
const guardar = (uid: string, m: Proyecto) => { try { localStorage.setItem(KEY(uid), JSON.stringify(m)); } catch { /* sin almacenamiento */ } };
const ORIGEN_NOMBRE: Record<Origen, string> = { referencia: "Recrear un reel", idea: "Desde una idea", guion: "Tu guion" };
const tituloReel = (p: Proyecto, plantilla?: string) => p.reel?.titulo || p.idea.trim().slice(0, 60) || plantilla || (p.origen ? ORIGEN_NOMBRE[p.origen] : "Reel");
/** ¿El reel tiene algo? (tocar una opción y salir sin escribir no deja un reel vacío en la lista). */
const tieneContenido = (p: Proyecto) => !!(p.reel || p.idea.trim() || p.plantillaId);
const leerReels = (uid: string): Proyecto[] => { try { return uid ? leerLista<Proyecto>(localStorage, uid) : []; } catch { return []; } };
const kindOf = (key: string): "image" | "clip" | "voice" => (key.startsWith("voz:") ? "voice" : key.startsWith("anim:") || key.startsWith("habla:") || key.startsWith("bib:") ? "clip" : "image");

class ApiError extends Error { constructor(m: string, public status: number) { super(m); } }
async function post(fn: string, body: Record<string, unknown>) {
  const resp = await fetch(`${FN}/${fn}`, { method: "POST", headers: await fnHeaders(), body: JSON.stringify(body) });
  if (!resp.ok) throw new ApiError(await fnErrorMessage(resp, "No se pudo completar."), resp.status);
  return resp;
}
const b64Blob = async (b64: string, mime: string) => (await fetch(`data:${mime};base64,${b64}`)).blob();
const download = (blob: Blob, name: string) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function videoSize(file: Blob): Promise<{ w: number; h: number; d: number }> {
  return new Promise(resolve => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (w: number, h: number, d: number) => { URL.revokeObjectURL(url); resolve({ w, h, d }); };
    v.preload = "metadata"; v.muted = true;
    v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight, v.duration);
    v.onerror = () => done(0, 0, 0);
    v.src = url;
  });
}
const usd = (x: number) => `US$${x.toFixed(2).replace(".", ",")}`;

export function ReelIA({ onHome, onNavigate }: { onHome: () => void; onNavigate: (page: string) => void }) {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  // Jean: su voz clonada, la producción diaria y los costos reales. Un cliente ve solo créditos y voces de la biblioteca.
  const jean = isGenjutsuOwner(uid);
  const { applyServerCharge, balance } = useCredits();
  const datos = useStudioDatos(uid);
  const { idn, clips } = datos;
  const [vista, setVista] = useState<"inicio" | "estudio" | "identidad">("inicio");
  const [meta, setMeta] = useState<Proyecto>(() => (uid ? cargar(uid, idn) : nuevo(idn)));
  const metaRef = useRef(meta);
  // Todos tus reels en curso (27-oct-2026): empezar uno nuevo ya no borra el que tenías abierto.
  const [lista, setLista] = useState<Proyecto[]>(() => leerReels(uid));
  const listaRef = useRef(lista);
  const listaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistir = useCallback((m: Proyecto) => {
    if (!uid) return;
    const now = Date.now();
    guardar(uid, { ...m, actualizado: now }); // el abierto, al instante
    if (!m.origen || !tieneContenido(m)) return;
    const { list } = guardarEnLista(listaRef.current, m, now);
    listaRef.current = list; setLista(list);
    // La lista completa se escribe medio segundo después (hay muchos cambios seguidos al producir).
    if (listaTimer.current) clearTimeout(listaTimer.current);
    // Antes de escribir se une con lo que guardó otra pestaña, para no borrarle sus reels.
    listaTimer.current = setTimeout(() => {
      try {
        const l = unirListas(listaRef.current, leerGuardada<Proyecto>(localStorage, uid));
        listaRef.current = l; setLista(l);
        localStorage.setItem(keyLista(uid), JSON.stringify(l));
      } catch { /* sin almacenamiento */ }
    }, 500);
  }, [uid]);
  // Si otra pestaña cambia la lista, esta se pone al día (sin perder el reel que tiene abierto).
  useEffect(() => {
    if (!uid) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== keyLista(uid)) return;
      const otra = leerGuardada<Proyecto>(localStorage, uid);
      const mia = listaRef.current.find(p => p.id === metaRef.current.id);
      const l = unirListas(otra, mia ? [mia] : []);
      listaRef.current = l; setLista(l);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [uid]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "foto" | "plan" | "producir" | "render" | "subir" | "ref">("");
  const [paso, setPaso] = useState("");
  const [progress, setProgress] = useState(0);
  const [texto, setTexto] = useState("");
  const [enlace, setEnlace] = useState("");
  const [refVideo, setRefVideo] = useState<string | null>(null);
  // «Lo grabo yo» (27-oct-2026): grabarte con tu guion encima y llevar la toma a «Sube tu video».
  const [grabar, setGrabar] = useState(false);
  const tomaRef = useRef<HTMLInputElement>(null);
  const llevarASubtitulos = (file: File) => {
    dejarToma({ file, guion: metaRef.current.idea });
    setGrabar(false);
    window.location.hash = "#/con-tu-cara/video";
  };
  const [refPaso, setRefPaso] = useState("");
  const [refProg, setRefProg] = useState(0);
  const [avanzadas, setAvanzadas] = useState(false);
  const [cfg, setCfg] = useState<{ eleven: boolean; fal: boolean; propia?: boolean } | null>(null);
  // Voces de tu cuenta con nombre y muestra (Guardián del Creador: antes había que pegar un id). null = cargando.
  const [voces, setVoces] = useState<Voz[] | null>(null);
  const [sonando, setSonando] = useState<string | null>(null);
  const [masVoces, setMasVoces] = useState(false);
  const muestraRef = useRef<HTMLAudioElement | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const subirRef = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  const ideaRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const commit = useCallback((patch: Partial<Proyecto> | ((m: Proyecto) => Partial<Proyecto>)) => {
    const m = { ...metaRef.current, ...(typeof patch === "function" ? patch(metaRef.current) : patch) };
    metaRef.current = m; setMeta(m); persistir(m);
  }, [persistir]);
  const setUrl = useCallback((k: string, blob: Blob | null) => setUrls(u => {
    if (u[k]) URL.revokeObjectURL(u[k]);
    const n = { ...u }; if (blob) n[k] = URL.createObjectURL(blob); else delete n[k];
    return n;
  }), []);
  const setAsset = useCallback((key: string, patch: Partial<Asset>) => commit(m => {
    const prev = m.assets[key];
    const idx = prev?.idx ?? m.next;
    return { assets: { ...m.assets, [key]: { estado: "pendiente", ...prev, ...patch, idx } }, next: prev ? m.next : m.next + 1 };
  }), [commit]);
  const olvidar = useCallback((keys: string[]) => {
    keys.forEach(k => setUrl(k, null));
    commit(m => { const a = { ...m.assets }; keys.forEach(k => delete a[k]); return { assets: a }; });
  }, [commit, setUrl]);
  const guardarMedia = useCallback(async (key: string, blob: Blob, extra: Partial<Asset> = {}) => {
    setAsset(key, {});
    await putMedia(metaRef.current.id, metaRef.current.assets[key].idx, kindOf(key), blob);
    setUrl(key, blob); setAsset(key, { estado: "listo", ...extra });
  }, [setAsset, setUrl]);
  const saldo = useCallback((resp: Response, data?: { billing?: { charged: number; balance: number | null } }) => {
    const b = data?.billing ?? readBilling(resp);
    if (typeof b.balance === "number") applyServerCharge("gen_media", { charged: 0, balance: b.balance });
  }, [applyServerCharge]);

  // Lo ya producido de un reel, desde este navegador (se corta si en el camino se abre otro reel).
  const cargarMedia = useCallback(async (m: Proyecto) => {
    for (const [key, a] of Object.entries(m.assets)) {
      if (a.estado !== "listo") continue;
      const b = await getMedia(m.id, a.idx, kindOf(key)).catch(() => null);
      if (metaRef.current.id !== m.id) return;
      if (b) setUrl(key, b);
    }
  }, [setUrl]);
  // Al abrir: config y el proyecto en curso (con lo ya pagado desde el navegador).
  useEffect(() => {
    if (!uid) return;
    void post("reel-ia", { action: "config" }).then(r => r.json()).then(setCfg).catch(() => setCfg({ eleven: false, fal: false }));
    void post("reel-ia", { action: "voices" }).then(r => r.json()).then(d => setVoces(Array.isArray(d?.voices) ? d.voices : [])).catch(() => setVoces([]));
    const m = cargar(uid, idn); metaRef.current = m; setMeta(m);
    const l = leerReels(uid); listaRef.current = l; setLista(l);
    if (m.origen) setVista("estudio");
    void cargarMedia(m);
  }, [uid, setUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  // Un proyecto nuevo toma Mi identidad cuando termina de cargar.
  useEffect(() => { if (datos.idnListo && !metaRef.current.reel && !metaRef.current.chat.length) commit({ ajustes: ajustesDe(idn) }); }, [datos.idnListo]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = meta.reel;
  const aj = meta.ajustes;
  // La voz que se va a usar: la elegida; si no, la de Jean (si es Jean) o la primera de la biblioteca.
  const vozActual = aj.voice_id || (cfg?.propia ? "" : voces?.[0]?.id ?? "");
  const nombreVoz = vozActual ? voces?.find(v => v.id === vozActual)?.nombre ?? "otra voz" : "tu propia voz";
  const setAjustes = (patch: Partial<Ajustes>) => commit(m => ({ ajustes: { ...m.ajustes, ...patch } }));
  const plantilla: Plantilla | null = useMemo(() => datos.plantillas?.find(p => p.id === meta.plantillaId) ?? null, [datos.plantillas, meta.plantillaId]);
  const foto: StudioRef | null = idn.fotos[aj.foto] ?? idn.fotos[0] ?? null;
  const clipDe = useCallback((id: string) => clips.find(c => c.id === id)?.item ?? null, [clips]);
  const irPaso = (n: number) => commit({ paso: n });

  // ---------- Inicio ----------
  // Empezar otro reel ya no cierra el abierto: queda en "Tus reels en curso" con todo lo producido.
  const empezar = (origen: Origen, extra: Partial<Proyecto> = {}) => {
    Object.keys(urls).forEach(k => setUrl(k, null));
    setRefVideo(null); setTexto(""); setEnlace("");
    const m = { ...nuevo(idn, origen), ...extra }; metaRef.current = m; setMeta(m); persistir(m);
    setVista("estudio");
    return true;
  };
  // La portada de cada reel en curso: su primera imagen ya producida (de este navegador) o la de su referencia.
  const cargarPortada = useCallback(async (id: string): Promise<string | null> => {
    const p = listaRef.current.find(x => x.id === id);
    if (!p) return null;
    const img = Object.entries(p.assets ?? {}).filter(([k, a]) => a.estado === "listo" && kindOf(k) === "image").sort((a, b) => a[1].idx - b[1].idx)[0];
    if (img) { const b = await getMedia(p.id, img[1].idx, "image").catch(() => null); if (b) return URL.createObjectURL(b); }
    return datos.plantillas?.find(x => x.id === p.plantillaId)?.thumbUrls.find(Boolean) ?? null;
  }, [datos.plantillas]);
  const abrirReel = (p: Proyecto) => {
    if (busy) { toast("Espera a que termine lo que se está creando."); return; }
    Object.keys(urls).forEach(k => setUrl(k, null));
    setRefVideo(null); setTexto(""); setEnlace("");
    const n = nuevo(idn);
    const m: Proyecto = { ...n, ...p, ajustes: { ...n.ajustes, ...p.ajustes } };
    metaRef.current = m; setMeta(m); persistir(m);
    setVista("estudio");
    void cargarMedia(m);
  };
  const borrarReel = (p: Proyecto) => {
    if (!confirm(`¿Borrar «${tituloReel(p)}»? Se borra de este navegador lo que ya produjiste para ese reel.`)) return;
    const list = quitarDeLista(listaRef.current, p.id);
    listaRef.current = list; setLista(list);
    try { localStorage.setItem(keyLista(uid), JSON.stringify(list)); } catch { /* sin almacenamiento */ }
    void deleteProduction(p.id).catch(() => undefined);
    if (metaRef.current.id === p.id) {
      Object.keys(urls).forEach(k => setUrl(k, null));
      const m = nuevo(idn); metaRef.current = m; setMeta(m); guardar(uid, m);
    }
    toast.success("Reel borrado");
  };
  const abrirBorrador = (b: Borrador) => {
    const pl = datos.plantillas?.find(p => p.id === b.plantilla_id) ?? null;
    const reel = parseReel(JSON.stringify(b.reel), clips, undefined, pl?.analisis.planos.length ?? 0);
    if (!reel) { toast.error("Ese borrador no se pudo abrir."); return; }
    empezar(pl ? "referencia" : "idea", { reel, plantillaId: pl?.id ?? null, modo: b.modo, borradorId: b.id, idea: b.tema, paso: 2,
      chat: [{ de: "ia", texto: `Borrador del productor diario sobre «${b.tema}». ${resumen(reel)}` }] });
  };
  const crearAhora = async () => {
    try {
      const data = await (await post("reel-diario", { action: "run" })).json();
      await datos.cargarBorradores();
      if (data.creados) toast.success(`Listo: ${data.creados} borrador${data.creados > 1 ? "es" : ""} nuevo${data.creados > 1 ? "s" : ""}`);
      else toast.message(data.errores?.[0] ?? "Hoy ya tienes tus borradores.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudieron crear los borradores."); }
  };
  const borrarPlantilla = async (pl: Plantilla) => {
    if (!confirm(`¿Borrar la plantilla «${pl.nombre}»?`)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("reel_plantillas").delete().eq("id", pl.id);
    if (pl.thumbs.length) await supabase.storage.from(BIBLIO).remove(pl.thumbs);
    await datos.cargarPlantillas();
  };

  // ---------- Mi identidad ----------
  const subirFoto = async (file: File) => {
    if (!uid || busy) return;
    setBusy("foto");
    try {
      const ref = await uploadStudioImage(uid, "reel-ia", file, `foto-${Date.now()}`);
      await datos.guardarIdentidad({ fotos: [...idn.fotos, ref].slice(-6) });
      toast.success("Foto guardada en Mi identidad.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo subir tu foto."); }
    finally { setBusy(""); }
  };
  const subirLogo = async (file: File) => {
    if (!uid || busy) return;
    setBusy("foto");
    try { await datos.guardarIdentidad({ logo: await uploadStudioImage(uid, "reel-ia", file, "logo") }); toast.success("Logo guardado."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo subir el logo."); }
    finally { setBusy(""); }
  };
  const subirBiblio = async (files: FileList) => {
    if (!uid || busy) return;
    setBusy("subir");
    try {
      for (const f of Array.from(files).slice(0, 10)) {
        if (!(f.type.startsWith("video/") || f.type.startsWith("image/"))) continue;
        if (f.size > 50 * 1024 * 1024) { toast.error(`${f.name}: máximo 50 MB.`); continue; }
        const name = f.name.replace(/[^\w.-]+/g, "-").slice(-60) || "clip";
        const up = await supabase.storage.from(BIBLIO).upload(`${uid}/app/${Date.now()}-${name}`, f, { contentType: f.type, upsert: false });
        if (up.error) toast.error(`${f.name}: no se pudo guardar.`);
      }
      await datos.cargarBiblio();
      toast.success("Guardado en tu biblioteca", { description: "Escribe qué muestra cada uno: así se usa solo donde se habla de eso." });
    } finally { setBusy(""); }
  };
  const borrarDeBiblio = async (path: string) => {
    if (!confirm("¿Borrar este clip de tu biblioteca?")) return;
    const { error } = await supabase.storage.from(BIBLIO).remove([path]);
    if (error) toast.error("No se pudo borrar."); else await datos.cargarBiblio();
  };

  // ---------- 1 · Tu idea: reel de referencia ----------
  // solo = guardar la plantilla desde el inicio sin tocar el reel abierto (Guardián del Creador, 25-oct-2026: antes había
  // que empezar un reel nuevo y se borraba lo ya producido de este navegador).
  const cargarReferencia = async (src: { file?: File; url?: string }, solo = false) => {
    if (!uid || busy) return;
    setBusy("ref"); setRefProg(0);
    try {
      let path: string, local: string, fuente: string, nombre: string;
      if (src.file) {
        if (!src.file.type.startsWith("video/")) throw new Error("Sube un video (MP4 o MOV).");
        if (src.file.size > REF_MAX) throw new Error("El video pesa más de 18 MB. Bájale la calidad o recórtalo y súbelo de nuevo.");
        setRefPaso("Subiendo el video…");
        path = `${uid}/ref/${Date.now()}-${src.file.name.replace(/[^\w.-]+/g, "-").slice(-50)}`;
        const up = await supabase.storage.from(BIBLIO).upload(path, src.file, { contentType: src.file.type, upsert: false });
        if (up.error) throw new Error("No se pudo subir el video.");
        local = URL.createObjectURL(src.file); fuente = "Video subido"; nombre = src.file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 40);
      } else {
        setRefPaso("Leyendo el enlace…");
        const data = await (await post("reel-ia", { action: "fetch_link", url: src.url })).json();
        path = data.path;
        const { data: s } = await supabase.storage.from(BIBLIO).createSignedUrl(path, 60 * 60);
        if (!s?.signedUrl) throw new Error("No se pudo abrir el video.");
        local = URL.createObjectURL(await (await fetch(s.signedUrl)).blob());
        fuente = data.fuente ?? src.url ?? ""; nombre = data.autor ? `Reel de @${data.autor}` : "Reel de Instagram";
      }
      if (!solo) setRefVideo(local);
      setRefPaso("Buscando los cortes…");
      const { duracion, cortes } = await analizarCortes(local, setRefProg);
      setRefPaso("Mirando y escuchando el video…");
      const respA = await post("reel-ia", { action: "analyze", path, cortes, duracion });
      const dataA = await respA.json() as { analisis: Analisis; billing?: { charged: number; balance: number | null } };
      saldo(respA, dataA);
      const { analisis } = dataA;
      setRefPaso("Guardando la plantilla…");
      const id = crypto.randomUUID();
      const blobs = await miniaturas(local, analisis.planos);
      const thumbs: string[] = [];
      for (let k = 0; k < blobs.length; k++) {
        const tp = `${uid}/plantillas/${id}/${k}.jpg`;
        const up = await supabase.storage.from(BIBLIO).upload(tp, blobs[k], { contentType: "image/jpeg", upsert: true });
        thumbs.push(up.error ? "" : tp);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("reel_plantillas").insert({
        id, user_id: uid, nombre: `${nombre} · ${new Date().toLocaleDateString("es")}`.slice(0, 80), fuente: fuente.slice(0, 500), video_path: path, duracion, analisis, thumbs: thumbs.filter(Boolean),
      });
      if (error) throw new Error("No se pudo guardar la plantilla.");
      await datos.cargarPlantillas();
      if (solo) {
        const ids = [...new Set([...datos.diario.plantilla_ids, id])];
        await datos.guardarDiario({ ...datos.diario, plantilla_ids: ids, plantilla_id: ids[0] });
      } else commit({ plantillaId: id });
      toast.success("Reel analizado", { description: `${analisis.planos.length} planos. Quedó guardado como plantilla: no hay que analizarlo otra vez.${solo ? " Ya entra en tu producción diaria." : ""}` });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo analizar el reel."); }
    finally { setBusy(""); setRefPaso(""); }
  };

  // ---------- Pedir el reel (o un cambio) ----------
  const ofertaDisponible = async (): Promise<Oferta | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("products").select("name, product, who, promise, price_amount, price_currency, offer_status")
      .eq("user_id", uid).eq("offer_status", "disponible").order("created_at").limit(1).maybeSingle();
    return data ? { nombre: data.name ?? "", que: data.product ?? "", para: data.who ?? "", promesa: data.promise ?? "", precio: data.price_amount ? `${data.price_amount} ${data.price_currency ?? ""}`.trim() : "", disponible: true } : null;
  };
  const pedir = async (msg: string, opts: { literal: boolean; cambio: boolean }) => {
    if (busy) return;
    if (balance < PRICE_PLAN) { toast.error(`Te faltan créditos: preparar el reel cuesta ${PRICE_PLAN}.`); return; }
    setBusy("plan");
    commit(m => ({ chat: [...m.chat, { de: "tu", texto: msg }] }));
    try {
      const m = metaRef.current;
      const oferta = plantilla && m.modo === "adaptacion" ? await ofertaDisponible() : null;
      if (plantilla && m.modo === "adaptacion" && !oferta && !opts.cambio) toast.message("No tienes una oferta Disponible: la llamada final será de interés, no de compra.");
      // ESPEJO (26-oct-2026): el reel se arma plano por plano desde la ficha del original; la IA solo retoca las frases.
      if (plantilla && !plantilla.publica && m.modo === "espejo" && m.origen === "referencia" && !opts.cambio) {
        const opc = { palabra: m.ajustes.palabra, cambiarGancho: !!m.cambiarGancho, ropa: m.ajustes.ropa };
        const { text: t2, billing: b2 } = await streamGenerator(GENERATOR_ID, "Reel Studio", SYSTEM_ESPEJO, pedidoEspejo(plantilla.analisis, opc));
        applyServerCharge("gen_light", b2, "Reel Studio");
        if (!/"frases"\s*:/.test(t2)) throw new Error("La IA no devolvió tu espejo. Toca Preparar otra vez.");
        const espejo = espejoReel(plantilla.analisis, parseEspejo(t2, plantilla.analisis), opc);
        if (!espejo) throw new Error("No se pudo armar el espejo de este reel. Prueba con Recrear.");
        commit(x => ({
          reel: espejo, paso: 1, validado: null,
          ajustes: { ...x.ajustes, palabra: espejo.palabra || x.ajustes.palabra },
          chat: [...x.chat, { de: "ia", texto: `Aquí está tu espejo: ${espejo.planos.length} planos, uno por cada plano del original. Cambia el presentador, los B-roll o la voz si quieres.` }],
        }));
        setTexto("");
        return;
      }
      const { text, billing } = await streamGenerator(GENERATOR_ID, "Reel Studio", SYSTEM, pedidoIA({
        texto: msg, literal: opts.literal, palabra: m.ajustes.palabra, paleta: m.ajustes.paleta, ropa: m.ajustes.ropa,
        clips: clips.map(({ id, desc }) => ({ id, desc })), actual: opts.cambio ? m.reel : null,
        plantilla: plantilla?.analisis ?? null, modo: modoDe(m.modo, plantilla?.publica), oferta,
        // Preparar desde «Tu idea» = lo que elegiste ahí (Espejo/Recrear → el tema de la referencia, aunque venga de
        // un borrador). Al pedir cambios sobre un borrador del productor diario, se respeta su tema propio.
        temaDeLaReferencia: m.origen === "referencia" && (!opts.cambio || !m.borradorId), cambiarGancho: !!m.cambiarGancho,
      }));
      applyServerCharge("gen_light", billing, "Reel Studio");
      const reel = parseReel(text, clips, opts.literal ? msg : undefined, plantilla?.analisis.planos.length ?? 0);
      if (!reel) throw new Error("La IA no devolvió un reel que sirva. Pídelo de nuevo con otras palabras.");
      const cambioGuion = opts.cambio && m.reel && m.reel.guion !== reel.guion;
      commit(x => ({
        reel, paso: opts.cambio ? x.paso : 1, validado: null,
        // La palabra en pantalla = la que se dice en la voz (24-oct-2026: el ajuste decía SUPERNOVA y la voz VENDER).
        ajustes: { ...x.ajustes, palabra: palabraDelGuion(reel.guion) || reel.palabra || x.ajustes.palabra },
        chat: [...x.chat, { de: "ia", texto: `${opts.cambio ? "Listo, lo cambié." : "Aquí está tu reel."} ${resumen(reel)}${cambioGuion ? " El guion cambió: tu voz se vuelve a hacer." : ""}` }],
      }));
      setTexto("");
    } catch (e) {
      const t = e instanceof Error ? e.message : "No se pudo preparar el reel.";
      commit(x => ({ chat: [...x.chat, { de: "ia", texto: t }] }));
      toast.error(t);
    } finally { setBusy(""); }
  };
  const preparar = () => {
    const m = metaRef.current;
    const idea = m.idea.trim();
    if (m.origen === "guion") {
      if (idea.split(/\s+/).length < 20) { toast.error("Tu guion es muy corto: escribe al menos 20 palabras."); return; }
      return void pedir(idea, { literal: true, cambio: false });
    }
    if (m.origen === "referencia") {
      if (!plantilla) { toast.error("Primero pega el enlace o sube el reel de referencia."); return; }
      if (["inspiracion", "adaptacion"].includes(modoDe(m.modo, plantilla?.publica)) && idea.split(/\s+/).length < 2) { toast.error("Escribe de qué trata tu versión (tu tema)."); return; }
      return void pedir(idea || "Haz mi versión de este reel, con mi voz y mis recursos.", { literal: false, cambio: false });
    }
    if (idea.split(/\s+/).length < 3) { toast.error("Cuéntanos tu idea en una frase."); return; }
    return void pedir(idea, { literal: false, cambio: false });
  };
  const setPlanos = (planos: Plano[]) => commit(m => (m.reel ? { reel: { ...m.reel, planos }, validado: null } : {}));

  // ---------- Claves de lo que se produce (por huella) ----------
  const vozKey = r ? `voz:${huella(`${r.guion}|${aj.velocidad}|${aj.voice_id}`)}` : "";
  const lookKey = useCallback((k: number) => (r && foto && !("stock" in foto) ? `look:${huella(`${r.looks[k]?.escena}|${aj.ropa}|${foto.path}`)}` : ""), [r, aj.ropa, foto]);
  const t = useMemo(() => (r && meta.voz?.key === vozKey ? tiempos(r.planos, meta.voz.words, meta.voz.seconds) : null), [r, meta.voz, vozKey]);
  const trs = useMemo(() => (r && t ? tramos(r.planos, t) : []), [r, t]);
  const total = meta.voz?.seconds ?? 0;
  const hablaKey = useCallback((k: number) => {
    const tr = trs[k];
    if (!tr) return "";
    const a = audioTramo(tr, total);
    return `habla:${huella(`${lookKey(tr.look)}|${vozKey}|${a.desde.toFixed(2)}|${a.hasta.toFixed(2)}`)}`;
  }, [trs, total, lookKey, vozKey]);

  // ---------- Producción ----------
  const pollJob = useCallback(async (key: string) => {
    const habla = key.startsWith("habla:");
    for (let tries = 0; tries < 100 && alive.current; tries++) {
      await sleep(6000);
      const id = metaRef.current.assets[key]?.job;
      if (!id) return;
      try {
        let st: string | undefined;
        if (habla) st = (await (await post("reel-ia", { action: "status", request_id: id })).json())?.status;
        else { const { data, error } = await supabase.functions.invoke("video-studio", { body: { action: "status", job_id: id } }); if (error) continue; st = data?.job?.status; }
        if (st === "failed") { setAsset(key, { estado: "falló", job: null }); return; }
        if (st !== "done") continue;
        const blob = await (await post(habla ? "reel-ia" : "video-studio", habla ? { action: "file", request_id: id } : { action: "file", job_id: id })).blob();
        await guardarMedia(key, blob, { job: null });
        return;
      } catch { /* red: se vuelve a preguntar */ }
    }
  }, [setAsset, guardarMedia]);
  useEffect(() => {
    for (const [key, a] of Object.entries(metaRef.current.assets)) if (a.job && a.estado === "trabajando") void pollJob(key);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const listoA = (key: string) => !!key && meta.assets[key]?.estado === "listo" && !!urls[key];

  const producir = async () => {
    toolEvent("reel-studio", "empezar");
    const m0 = metaRef.current;
    const reel = m0.reel;
    if (busy || !reel) return;
    if (reel.planos.some(p => seVe(p.forma)) && !foto) { toast.error("Falta tu foto: súbela en Tus recursos para crear tus looks."); commit({ auto: false, paso: 1 }); return; }
    setBusy("producir");
    try {
      // 1) Tu voz (ElevenLabs) con los tiempos de cada palabra.
      if (metaRef.current.voz?.key !== vozKey || !urls[vozKey]) {
        setPaso("Tu voz…");
        // Sin voz elegida: Jean usa la suya; un cliente, la primera de la biblioteca (la app decide, no pregunta).
        const vid = m0.ajustes.voice_id || (cfg?.propia ? "" : voces?.[0]?.id ?? "");
        const respV = await post("reel-ia", { action: "voice", text: reel.guion, speed: m0.ajustes.velocidad, ...(vid ? { voice_id: vid } : {}) });
        const data = await respV.json();
        saldo(respV, data);
        const blob = await b64Blob(data.audio, "audio/mpeg");
        await guardarMedia(vozKey, blob);
        const words = wordsFromAlignment(data.alignment);
        const seconds = Math.max(await audioSeconds(blob).catch(() => 0), words.length ? words[words.length - 1].t1 + 0.3 : 0);
        commit({ voz: { key: vozKey, words, seconds } });
      }
      // 2) Tus looks (tu misma cara en otro lugar y con tu ropa).
      const looks = [...new Set(reel.planos.filter(p => seVe(p.forma)).map(p => p.look))];
      for (const k of looks) {
        const key = lookKey(k);
        if (!key || metaRef.current.assets[key]?.estado === "listo") continue;
        setPaso(`Tu look ${k + 1}…`);
        setAsset(key, { estado: "trabajando" });
        const ropa = m0.ajustes.ropa.trim().slice(0, 80);
        const fill = `${reel.looks[k].escena.slice(0, 210 - ropa.length)}${ropa ? `, wearing ${ropa}` : ""}`;
        // GPT Image 2 primero; si se agota el tiempo (APIMart, 24-oct-2026, intermitente), Nano Banana Pro.
        const pedirLook = (model: "gpt" | "pro") => supabase.functions.invoke("avatar-studio", {
          body: { action: "image", template: "misma-persona", model, aspect: "9:16", fill, refs: { persona: refForServer(foto!) } },
        });
        let { data, error } = await pedirLook("gpt");
        if (error || !data?.path) {
          setPaso(`Tu look ${k + 1} (otro motor)…`);
          ({ data, error } = await pedirLook("pro"));
        }
        if (error || !data?.path) { const msg = data?.error || "No se pudo crear tu look. Toca Regenerar en un momento."; setAsset(key, { estado: "falló", motivo: msg }); throw new ApiError(msg, 502); }
        if (data.billing) applyServerCharge("gen_media", data.billing, `Reel Studio · tu look ${k + 1}`);
        await guardarMedia(key, await (await fetch(data.url)).blob(), { path: data.path });
      }
      // 3) Imágenes (una por visual distinto).
      const visuales = [...new Set(reel.planos.map(p => p.visual).filter(Boolean))];
      for (let i = 0; i < visuales.length && alive.current; i++) {
        const key = `img:${huella(visuales[i])}`;
        if (metaRef.current.assets[key]?.estado === "listo") continue;
        setPaso(`Imagen ${i + 1} de ${visuales.length}…`);
        setAsset(key, { estado: "trabajando" });
        try {
          const resp = await post("yt-produce", { action: "scene_image", visual: visuales[i].slice(0, 600), style: "Cinematográfico", aspect: "9:16", scene: Math.min(40, i + 1) });
          const data = await resp.json(); saldo(resp, data);
          const raw = await (await fetch(data.image)).blob();
          await guardarMedia(key, await compressImage(raw).catch(() => raw));
        } catch (err) {
          setAsset(key, { estado: "falló", motivo: motivoDe(err) });
          if (err instanceof ApiError && [401, 402, 403, 429].includes(err.status)) throw err;
        }
      }
      // 4) Animaciones (parten de su imagen).
      for (const v of [...new Set(reel.planos.filter(p => p.animar).map(p => p.visual))]) {
        const key = `anim:${huella(v)}`, ik = `img:${huella(v)}`;
        const a = metaRef.current.assets[key];
        if (a?.estado === "listo" || a?.job || metaRef.current.assets[ik]?.estado !== "listo") continue;
        const img = await getMedia(metaRef.current.id, metaRef.current.assets[ik].idx, "image");
        if (!img) continue;
        setPaso("Animando…");
        const path = `${uid}/reel-ia/${m0.id}/${huella(v)}.webp`;
        const up = await supabase.storage.from("creativos").upload(path, img, { upsert: true, contentType: img.type || "image/webp" });
        if (up.error) { setAsset(key, { estado: "falló" }); continue; }
        try {
          const resp = await post("video-studio", {
            prompt: `Animate this scene with dynamic, smooth motion and an energetic camera move: ${v.slice(0, 400)}. Same style, no cuts, no text.`,
            seconds: 5, size: "9:16", image_path: path, image_bucket: "creativos", audio: false, kind: "yt_scene",
          });
          const data = await resp.json(); saldo(resp, data);
          setAsset(key, { estado: "trabajando", job: data?.job?.id ?? null });
          void pollJob(key);
        } catch (err) {
          setAsset(key, { estado: "falló", motivo: motivoDe(err) });
          if (err instanceof ApiError && [401, 402, 403, 429].includes(err.status)) throw err;
        }
      }
      // 5) Clips de tu biblioteca que usa el reel (gratis).
      for (const id of [...new Set(reel.planos.map(p => p.clip).filter(Boolean))]) {
        const it = clipDe(id);
        if (!it) continue;
        const key = `bib:${it.path}`;
        if (metaRef.current.assets[key]?.estado === "listo" && urls[key]) continue;
        setPaso("Tus clips…");
        try {
          const blob = await (await fetch(it.url)).blob();
          const dims = it.video ? await videoSize(blob) : await createImageBitmap(blob).then(b => ({ w: b.width, h: b.height })).catch(() => ({ w: 9, h: 16 }));
          await guardarMedia(key, blob, { vertical: dims.h > dims.w * 1.2 });
        } catch { setAsset(key, { estado: "falló" }); }
      }
      // 6) Tú hablando: un video con labios por tramo (el trozo de tu voz).
      const mm = metaRef.current;
      const vozBlob = await getMedia(mm.id, mm.assets[vozKey]?.idx ?? -1, "voice");
      if (vozBlob && mm.voz) {
        const lista = tramos(reel.planos, tiempos(reel.planos, mm.voz.words, mm.voz.seconds));
        for (let k = 0; k < lista.length; k++) {
          const lk = lookKey(lista[k].look);
          const look = metaRef.current.assets[lk];
          const a = audioTramo(lista[k], mm.voz.seconds);
          const key = `habla:${huella(`${lk}|${vozKey}|${a.desde.toFixed(2)}|${a.hasta.toFixed(2)}`)}`;
          const cur = metaRef.current.assets[key];
          if (!look?.path || cur?.estado === "listo" || cur?.job) continue;
          setPaso(`Tú hablando (${k + 1} de ${lista.length})…`);
          try {
            const { b64, seconds } = await sliceWavBase64(vozBlob, a.desde, Math.min(a.hasta, a.desde + 12));
            const respP = await post("reel-ia", { action: "presenter", image: { bucket: "estudio-avatar", path: look.path }, audio: b64, seconds });
            const data = await respP.json();
            saldo(respP, data);
            setAsset(key, { estado: "trabajando", job: data.request_id });
            void pollJob(key);
          } catch (err) {
            setAsset(key, { estado: "falló", motivo: motivoDe(err) });
            // Sin saldo en fal no tiene sentido mandar los demás tramos: se avisa una vez y se para.
            if (err instanceof ApiError && err.status === 402) { toast.error(err.message, { duration: 12000 }); break; }
          }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo producir.");
      commit({ auto: false });
    } finally { setBusy(""); setPaso(""); }
  };

  /** Rehace lo de un plano (su imagen y su animación) sin tocar lo demás. */
  const regenerar = (i: number) => {
    const p = metaRef.current.reel?.planos[i];
    if (!p?.visual) return;
    olvidar([`img:${huella(p.visual)}`, `anim:${huella(p.visual)}`]);
    setTimeout(() => void producir(), 50);
  };
  const reintentar = (keys: string[]) => { olvidar(keys); setTimeout(() => void producir(), 50); };

  // ---------- Vista previa ----------
  const subsBase = useMemo(() => (r && meta.voz?.key === vozKey ? pantallas(meta.voz.words, r.planos.map(x => x.enfasis).filter(Boolean)) : null), [r, meta.voz, vozKey]);
  const subs = useMemo(() => subsBase?.map(s => { const e = meta.subs[s.t0.toFixed(2)]; return e !== undefined ? { ...s, texto: e.toLocaleUpperCase("es") } : s; }) ?? null, [subsBase, meta.subs]);
  const plan = useMemo<{ props: RDProps; frames: number } | null>(() => {
    if (!r || !t || !meta.voz || !urls[vozKey]) return null;
    const deTramo = new Map<number, number>();
    trs.forEach((tr, k) => tr.planos.forEach(i => deTramo.set(i, k)));
    const planos: RDPlano[] = r.planos.map((p, i) => {
      let top: RDPlano["top"] = null;
      if (p.clip) {
        const it = clipDe(p.clip);
        const key = it ? `bib:${it.path}` : "";
        if (key && urls[key]) top = { url: urls[key], video: it!.video, vertical: meta.assets[key]?.vertical ?? true };
      } else if (p.visual) {
        const ak = `anim:${huella(p.visual)}`, ik = `img:${huella(p.visual)}`;
        if (urls[ak]) top = { url: urls[ak], video: true, vertical: true };
        else if (urls[ik]) top = { url: urls[ik], video: false, vertical: true };
      }
      return { ...t[i], forma: p.forma, tramo: deTramo.get(i) ?? -1, top, enfasis: p.enfasis };
    });
    const tramosP: RDTramo[] = trs.map((tr, k) => ({ desde: tr.desde, hasta: tr.hasta, clip: urls[hablaKey(k)] ?? null, img: urls[lookKey(tr.look)] ?? foto?.url ?? null }));
    // El último plano (y su tramo) llega hasta el final del video: sin esto, los 0,8 s después de la voz quedaban en negro.
    const fin = meta.voz.seconds + 0.8;
    if (planos.length) planos[planos.length - 1] = { ...planos[planos.length - 1], t1: fin };
    const ultimo = planos[planos.length - 1]?.tramo ?? -1;
    if (ultimo >= 0) tramosP[ultimo] = { ...tramosP[ultimo], hasta: fin };
    const pal = paleta(aj.paleta);
    const props: RDProps = { planos, tramos: tramosP, audio: urls[vozKey], words: meta.voz.words, palabra: palabraDelGuion(r.guion) || aj.palabra || r.palabra, acento: pal.acento, fondo: pal.fondo, sfx: aj.sfx, subs: subs ?? undefined, logo: idn.logo?.url ?? null };
    return { props, frames: Math.max(FPS, Math.round((meta.voz.seconds + 0.8) * FPS)) };
  }, [r, t, trs, meta.voz, meta.assets, urls, vozKey, hablaKey, lookKey, clipDe, aj.paleta, aj.palabra, aj.sfx, subs, idn.logo, foto]);

  // Estado real de cada parte (para la pantalla de producción).
  const visuales = r ? [...new Set(r.planos.map(p => p.visual).filter(Boolean))] : [];
  const animVis = r ? [...new Set(r.planos.filter(p => p.animar).map(p => p.visual))] : [];
  const lookIds = r ? [...new Set(r.planos.filter(p => seVe(p.forma)).map(p => p.look))] : [];
  const clipIds = r ? [...new Set(r.planos.map(p => p.clip).filter(Boolean))] : [];
  const n = {
    voz: listoA(vozKey) && meta.voz?.key === vozKey,
    looks: lookIds.filter(k => listoA(lookKey(k))).length,
    imgs: visuales.filter(v => listoA(`img:${huella(v)}`)).length,
    anims: animVis.filter(v => listoA(`anim:${huella(v)}`)).length,
    clips: clipIds.filter(id => { const it = clipDe(id); return !!it && listoA(`bib:${it.path}`); }).length,
    habla: trs.filter((_, k) => listoA(hablaKey(k))).length,
  };
  const fallas: { label: string; keys: string[]; motivo?: string }[] = [];
  if (r) {
    lookIds.forEach(k => { if (meta.assets[lookKey(k)]?.estado === "falló") fallas.push({ label: `Tu look ${k + 1}`, keys: [lookKey(k)] }); });
    r.planos.forEach((p, i) => {
      if (p.visual && (meta.assets[`img:${huella(p.visual)}`]?.estado === "falló" || meta.assets[`anim:${huella(p.visual)}`]?.estado === "falló"))
        fallas.push({ label: `Plano ${i + 1} (${FORMAS[p.forma]})`, keys: [`img:${huella(p.visual)}`, `anim:${huella(p.visual)}`] });
    });
    trs.forEach((tr, k) => { if (meta.assets[hablaKey(k)]?.estado === "falló") fallas.push({ label: `Tú hablando en los planos ${tr.planos[0] + 1} a ${tr.planos[tr.planos.length - 1] + 1}`, keys: [hablaKey(k)] }); });
  }
  for (const f of fallas) f.motivo = f.keys.map(k => meta.assets[k]?.motivo).find(Boolean);
  const enCamino = Object.values(meta.assets).some(a => a.estado === "trabajando");
  const recursosListos = n.voz && n.looks === lookIds.length && n.imgs === visuales.length && n.clips === clipIds.length;
  const listo = !!plan && recursosListos;
  const todoListo = listo && n.anims === animVis.length && n.habla === trs.length && !enCamino;

  const validar = (blob: Blob, esperado: number) => videoSize(blob).then(({ w, h, d }) => {
    const ok = w === SIZE.width && h === SIZE.height && Number.isFinite(d) && Math.abs(d - esperado) < 0.8;
    return { ok, detalle: w ? `${d.toFixed(1).replace(".", ",")} s · ${w}×${h} · ${(blob.size / 1e6).toFixed(1).replace(".", ",")} MB` : "el archivo no se pudo abrir" };
  });
  // Para publicar (26-oct-2026): el reel terminado se guarda en la app y ocupa la siguiente casilla libre de reel
  // de tu plan (hora de RD) con su copy listo y tus redes. Si falla, el MP4 igual quedó descargado.
  const aParaPublicar = async (blob: Blob) => {
    if (!uid || !r) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdb = supabase as any;
      const { data: futuras } = await sdb.from("content_items").select("slot_at").eq("user_id", uid).gte("slot_at", new Date().toISOString());
      // Las casillas del plan de cada quien (3, 5 o 10 al día + las extra que agregó).
      const { data: ajRow } = await sdb.from("publicar_ajustes").select("plan, extras, vista, redes").eq("user_id", uid).maybeSingle();
      const aj0 = ajustesPublicar(ajRow);
      const slot = siguienteLibre("reel", ((futuras ?? []) as { slot_at: string }[]).map(x => x.slot_at), new Date(), d => casillasDelDia(aj0, d));
      if (!slot) return;
      const path = `${uid}/${crypto.randomUUID()}/reel.mp4`;
      const up = await supabase.storage.from("publicaciones").upload(path, blob, { contentType: "video/mp4", upsert: false });
      if (up.error) throw up.error;
      const titulo = (r.titulo || "Reel").replace(/\*/g, "").slice(0, 190);
      const { error } = await sdb.from("content_items").insert({
        user_id: uid, topic: titulo, title: titulo, kind: "corto", platform: "reels", status: "grabado", source: "reel-studio", due: slot.slice(0, 10),
        slot_at: slot, media_tipo: "reel", media_paths: [path], pub_estado: "listo", pub_redes: aj0.redes,
        caption: textoPublicacion({ ...r, palabra: aj.palabra || r.palabra }), keyword: (aj.palabra || r.palabra || "").slice(0, 30) || null,
        ref_borrador: metaRef.current.borradorId,
      });
      if (error) throw error;
      toast.success(`Guardado en Para publicar: ${etiquetaCasilla(slot)}`, { description: "Contenido → Para publicar. Revisa el copy y toca Programar." });
    } catch (e) {
      console.error("para publicar:", e);
      toast.error("El reel se descargó, pero no se pudo guardar en Para publicar.");
    }
  };

  const render = async (auto = false) => {
    if (!plan || busy) return;
    if (!auto && !todoListo && !confirm("Todavía faltan partes (animaciones o tus tomas hablando): en esas partes saldrá la imagen fija o tu foto. ¿Armar igual?")) return;
    setBusy("render"); setProgress(0);
    try {
      const { canRenderMediaOnWeb, renderMediaOnWeb } = await import("@remotion/web-renderer");
      const check = await canRenderMediaOnWeb({ ...SIZE, container: "mp4", videoCodec: "h264" });
      { const why = blockingIssue(check); if (why) throw new Error(why); }
      const out = await renderMediaOnWeb({
        composition: { id: "reel-studio", component: ReelDinamico, durationInFrames: plan.frames, fps: FPS, ...SIZE, defaultProps: plan.props },
        inputProps: plan.props, container: "mp4", videoCodec: "h264",
        // Con 10+ videos sacar el primer cuadro de un blob tarda más de los 28 s por defecto (24-oct-2026).
        delayRenderTimeoutInMilliseconds: 120_000,
        onProgress: x => setProgress(Math.round(x.progress * 100)),
      });
      const blob = await out.getBlob();
      const v = await validar(blob, plan.frames / FPS);
      commit({ validado: v, auto: false });
      if (!v.ok) { toolEvent("reel-studio", "error"); toast.error(`El video no pasó la revisión: ${v.detalle}. Vuelve a armarlo.`); return; }
      toolEvent("reel-studio", "resultado");
      download(blob, "reel-studio.mp4");
      toolEvent("reel-studio", "descargar");
      void aParaPublicar(blob);
      if (metaRef.current.borradorId) void datos.marcarBorrador(metaRef.current.borradorId, "aprobado");
      toast.success("Tu reel está listo y se descargó");
    } catch (e) {
      toolEvent("reel-studio", "error");
      commit({ validado: { ok: false, detalle: e instanceof Error ? e.message : "no se pudo armar" }, auto: false });
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo armar el video en este navegador. Prueba con Chrome.");
    } finally { setBusy(""); }
  };
  const generar = async () => { commit({ auto: true, validado: null }); await producir(); };
  // "Generar mi reel" sigue solo: cuando todo está listo, arma y valida el MP4. Si algo falla, se detiene y lo dice.
  useEffect(() => {
    if (!meta.auto || busy) return;
    if (todoListo) void render(true);
    else if (!enCamino && fallas.length) commit({ auto: false });
  }, [meta.auto, busy, todoListo, enCamino, fallas.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Piezas de la interfaz ----------
  const field = "w-full rounded-lg border border-border bg-background px-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none";
  const chip = (on: boolean) => `h-9 px-3 rounded-full border text-[12px] ${on ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`;
  const primario = "flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50";
  const c = r ? costo(r, t) : null;
  const usdVoz = r ? r.guion.length * 0.00022 : 0; // costo real aprox. de ElevenLabs (solo se le muestra a Jean)

  const player = plan ? (
    <Player component={ReelDinamico} inputProps={plan.props} durationInFrames={plan.frames} fps={FPS} compositionWidth={SIZE.width} compositionHeight={SIZE.height}
      controls style={{ width: "100%", maxHeight: "62dvh", aspectRatio: "9 / 16", borderRadius: 16, overflow: "hidden", background: "#000" }} />
  ) : (
    <div className="card-surface flex aspect-[9/16] max-h-[62dvh] flex-col items-center justify-center gap-3 rounded-2xl p-6 text-center">
      <Clapperboard className="w-8 h-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{r ? "La vista previa aparece cuando tu voz esté lista (paso 4 · Generar mi reel)." : "Aquí verás tu reel."}</p>
    </div>
  );

  const fotosPanel = (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Tus fotos (la ★ es tu presentador en este reel). De frente, buena luz.</p>
      <div className="flex flex-wrap gap-2">
        {idn.fotos.map((f, i) => (
          <div key={i} className="relative">
            <button type="button" onClick={() => setAjustes({ foto: i })} className={`w-14 h-14 rounded-xl overflow-hidden border-2 ${i === (idn.fotos[aj.foto] ? aj.foto : 0) ? "border-primary" : "border-transparent"}`}>
              <img src={f.url} alt="" className="w-full h-full object-cover" />
            </button>
            {i === (idn.fotos[aj.foto] ? aj.foto : 0) && <Star className="absolute -top-1 -left-1 w-4 h-4 text-primary fill-primary" />}
            <button type="button" aria-label="Quitar foto" onClick={() => void datos.guardarIdentidad({ fotos: idn.fotos.filter((_, k) => k !== i) })} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 text-[11px] text-white">×</button>
          </div>
        ))}
        <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void subirFoto(f); }} />
        <button type="button" onClick={() => fotoRef.current?.click()} disabled={!!busy} className="w-14 h-14 rounded-xl border border-dashed border-border flex items-center justify-center text-muted-foreground">
          {busy === "foto" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
  const bibliotecaPanel = (usados: string[] = []) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">Tus capturas, fotos y videos. Escribe qué muestra cada uno: se usa solo cuando se habla de eso.</p>
        <input ref={subirRef} type="file" accept="video/*,image/*" multiple className="hidden" onChange={e => { const f = e.target.files; if (f?.length) void subirBiblio(f); e.target.value = ""; }} />
        <button type="button" onClick={() => subirRef.current?.click()} disabled={!!busy} className={chip(false)}>
          {busy === "subir" ? <Loader2 className="inline w-3.5 h-3.5 animate-spin" /> : <Upload className="inline w-3.5 h-3.5 mr-1" />}Subir
        </button>
      </div>
      {datos.biblio === null ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        : !clips.length ? <p className="text-[12px] text-muted-foreground">Todavía no tienes nada. Graba tu pantalla usando tu app (3 a 8 s) o sube fotos.</p>
        : (
          <div className="space-y-2 max-h-[36dvh] overflow-y-auto pr-1">
            {clips.map(cl => (
              <div key={cl.item.path} className="flex items-start gap-2">
                <div className="relative w-12 shrink-0">
                  {cl.item.video ? <video src={cl.item.url} muted playsInline preload="metadata" className="w-12 h-20 rounded-lg object-cover object-top border border-border" />
                    : <img src={cl.item.url} alt="" className="w-12 h-20 rounded-lg object-cover object-top border border-border" />}
                  {usados.includes(cl.id) && <Check className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-primary text-primary-foreground p-0.5" />}
                  <button type="button" aria-label="Borrar" onClick={() => void borrarDeBiblio(cl.item.path)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 text-[11px] text-white">×</button>
                </div>
                <label className="flex-1 text-[11px] text-muted-foreground">{cl.id}{usados.includes(cl.id) ? " · lo usa este reel" : ""}
                  <textarea defaultValue={cl.desc} rows={2} onBlur={e => { const v = e.target.value.trim(); if (v !== cl.desc) void datos.guardarIdentidad({ clips_desc: { ...idn.clips_desc, [cl.item.path]: v.slice(0, 200) } }); }}
                    disabled={!!busy} className={`${field} mt-0.5 py-1.5 text-[12px]`} />
                </label>
              </div>
            ))}
          </div>
        )}
    </div>
  );
  const estiloPanel = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-[12px] text-muted-foreground">Colores</p>
        <div className="flex flex-wrap gap-2">{PALETAS.map(x => <button key={x.id} type="button" onClick={() => setAjustes({ paleta: x.id })} className={chip(aj.paleta === x.id)}><span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: x.acento }} />{x.label}</button>)}</div>
      </div>
      <label className="block text-[12px] text-muted-foreground">Palabra para comentar
        <input value={aj.palabra} onChange={e => setAjustes({ palabra: e.target.value.slice(0, 30).toLocaleUpperCase("es") })} placeholder="SUPERNOVA" className={`${field} mt-1 min-h-[44px]`} />
      </label>
      <div className="flex items-center gap-3">
        {idn.logo ? <img src={idn.logo.url} alt="Tu logo" className="w-12 h-12 rounded-lg object-contain border border-border bg-secondary/30" /> : null}
        <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void subirLogo(f); }} />
        <button type="button" onClick={() => logoRef.current?.click()} disabled={!!busy} className={chip(false)}>{idn.logo ? "Cambiar logo" : "Subir tu logo (opcional)"}</button>
        {idn.logo && <button type="button" onClick={() => void datos.guardarIdentidad({ logo: null })} className="text-[12px] text-muted-foreground">Quitar</button>}
      </div>
    </div>
  );
  const avanzadasPanel = (
    <div className="rounded-xl border border-border">
      <button type="button" onClick={() => setAvanzadas(v => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-[12px] text-muted-foreground">
        Opciones avanzadas <ChevronDown className={`w-4 h-4 transition-transform ${avanzadas ? "rotate-180" : ""}`} />
      </button>
      {avanzadas && (
        <div className="space-y-3 px-3 pb-3">
          <div className="space-y-1.5">
            <p className="text-[12px] text-muted-foreground">Velocidad de tu voz</p>
            <div className="flex flex-wrap gap-2">
              {VELOCIDADES.map(x => <button key={x.v} type="button" onClick={() => setAjustes({ velocidad: x.v })} className={chip(aj.velocidad === x.v)}>{x.label}</button>)}
              <button type="button" onClick={() => setAjustes({ sfx: !aj.sfx })} className={chip(aj.sfx)}>{aj.sfx ? "Con efectos de sonido" : "Sin efectos de sonido"}</button>
            </div>
          </div>
          <label className="block text-[12px] text-muted-foreground">Tu ropa en los looks
            <input value={aj.ropa} onChange={e => setAjustes({ ropa: e.target.value.slice(0, 80) })} placeholder="Ej.: camisa negra de lino y jeans oscuros" className={`${field} mt-1 min-h-[40px]`} />
          </label>
          <div className="space-y-1.5">
            <p className="text-[12px] text-muted-foreground">Tu voz</p>
            {voces === null ? <p className="text-[12px] text-muted-foreground">Buscando tus voces…</p> : (
              <div className="flex flex-col gap-1.5">
                {(cfg?.propia
                  ? [{ id: "", nombre: "Tu propia voz", muestra: null, propia: true, clonada: true } as Voz, ...voces.filter(v => !v.propia && (v.clonada || masVoces || v.id === aj.voice_id))]
                  : voces.filter((v, i) => masVoces || i < 6 || v.id === aj.voice_id)).map(v => (
                  <div key={v.id || "propia"} className="flex items-center gap-2">
                    <button type="button" onClick={() => setAjustes({ voice_id: v.id })} aria-pressed={vozActual === v.id} className={`${chip(vozActual === v.id)} flex-1 text-left`}>
                      {v.nombre}{v.clonada && v.id ? " · personalizada" : ""}
                    </button>
                    {v.muestra && (
                      <button type="button" aria-label={`Escuchar ${v.nombre}`} className={chip(sonando === v.id)} onClick={() => {
                        muestraRef.current?.pause();
                        if (sonando === v.id) { setSonando(null); return; }
                        const a = new Audio(v.muestra!); muestraRef.current = a; setSonando(v.id);
                        a.onended = () => setSonando(null); void a.play().catch(() => setSonando(null));
                      }}>{sonando === v.id ? "Parar" : "Escuchar"}</button>
                    )}
                  </div>
                ))}
                {(cfg?.propia ? voces.some(v => !v.propia && !v.clonada) : voces.length > 6) && (
                  <button type="button" onClick={() => setMasVoces(x => !x)} className="self-start text-[12px] text-muted-foreground underline underline-offset-2">
                    {masVoces ? (cfg?.propia ? "Ver solo tus voces" : "Ver menos voces") : `Más voces (${cfg?.propia ? voces.filter(v => !v.propia && !v.clonada).length : voces.length - 6})`}
                  </button>
                )}
                {aj.voice_id && !voces.some(v => v.id === aj.voice_id) && (
                  <p className="text-[11px] text-muted-foreground">La voz guardada ya no está en tu cuenta: elige otra o se usará al crear y te avisaremos si falla.</p>
                )}
              </div>
            )}
          </div>
          {jean && <p className="text-[11px] text-muted-foreground">Motores: voz ElevenLabs multilingual v2 · tú hablando Kling AI Avatar v2 (fal, {usd(HABLA_USD_SEG)} por segundo) · tus looks e imágenes del estudio de avatar y del estudio de video · animaciones de 5 s.</p>}
          <button type="button" onClick={() => void datos.guardarIdentidad({ paleta: aj.paleta, ropa: aj.ropa, palabra: aj.palabra, velocidad: aj.velocidad, sfx: aj.sfx, voice_id: aj.voice_id })} className={chip(false)}>Guardar estos ajustes en Mi identidad</button>
        </div>
      )}
    </div>
  );

  // ---------- Vistas ----------
  if (vista === "inicio" || vista === "identidad") {
    return (
      <ToolShell toolId="reel-studio" onNavigate={onNavigate}
        crumbs={[{ label: "Crear" }, { label: "Con tu cara", onClick: onHome }, { label: "Reel Studio", onClick: vista === "identidad" ? () => setVista("inicio") : undefined }, ...(vista === "identidad" ? [{ label: "Mi identidad" }] : [])]}
        title={vista === "identidad" ? "Mi identidad" : "Reel Studio"}
        line={vista === "identidad" ? "Se configura una vez y SUPERNOVA la usa sola en cada reel. Puedes cambiarla en un reel en particular." : "¿Qué quieres crear? SUPERNOVA hace el guion, tus tomas, las escenas y el montaje."}
        onBack={vista === "identidad" ? () => setVista("inicio") : onHome}>
        {vista === "identidad" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card label="Tu presentador">{fotosPanel}<p className="text-[12px] text-muted-foreground">Tu voz: {cfg?.eleven ? `${nombreVoz} ✓ (se cambia en Opciones avanzadas)` : "la voz no está disponible ahora. Puedes seguir y crearla después."}</p></Card>
            <Card label="Tu estilo">{estiloPanel}{avanzadasPanel}</Card>
            <div className="lg:col-span-2"><Card label="Tu biblioteca">{bibliotecaPanel()}</Card></div>
          </div>
        ) : (
          <>
            <ReelsEnCurso
              reels={lista.filter(tieneContenido).map(p => ({
                id: p.id, origen: p.origen ?? "idea", paso: p.paso ?? 0, preparado: !!p.reel, actualizado: p.actualizado, abierto: p.id === meta.id,
                titulo: tituloReel(p, datos.plantillas?.find(x => x.id === p.plantillaId)?.nombre),
                texto: (p.reel?.guion || p.idea).trim().split(/\s+/).slice(0, 26).join(" "),
              }))}
              cargarPortada={cargarPortada}
              onAbrir={id => { const p = lista.find(x => x.id === id); if (!p) return; if (id === meta.id) setVista("estudio"); else abrirReel(p); }}
              onBorrar={id => { const p = lista.find(x => x.id === id); if (p) borrarReel(p); }} />
            <Inicio diarioOn={jean} idn={idn} plantillas={datos.plantillas} borradores={datos.borradores} diario={datos.diario} busy={!!busy}
              onElegir={o => void empezar(o)} onIdentidad={() => setVista("identidad")}
              onBorrador={abrirBorrador} onDescartar={b => void datos.marcarBorrador(b.id, "descartado")}
              onPlantilla={pl => void empezar("referencia", { plantillaId: pl.id })} onBorrarPlantilla={pl => void borrarPlantilla(pl)}
              onGuardarDiario={datos.guardarDiario} onCrearAhora={crearAhora}
              onAgregarPlantilla={url => cargarReferencia({ url }, true)} agregando={busy === "ref" ? refPaso || "Analizando…" : ""} />
          </>
        )}
      </ToolShell>
    );
  }

  // Estudio: 4 pasos.
  const pasoN = meta.paso;
  const titulos: Record<Origen, string> = { referencia: "Recrear un reel", idea: "Crear desde una idea", guion: "Tengo mi guion" };
  const necesitaFoto = !!r?.planos.some(p => seVe(p.forma));
  const faltan: { que: string; por: string; accion: ReactNode }[] = [];
  if (r && necesitaFoto && !foto) faltan.push({ que: "Tu foto", por: "Con ella creamos tus looks y tus tomas hablando.", accion: <button type="button" onClick={() => fotoRef.current?.click()} className={chip(false)}>Subir foto</button> });
  if (cfg && !cfg.eleven) faltan.push({ que: "Tu voz", por: jean ? "Falta conectar ElevenLabs en Supabase (ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID)." : "La voz no está disponible en este momento. Inténtalo más tarde.", accion: null });
  const clipsFaltan = r ? r.planos.filter(p => p.clip && !clipDe(p.clip)).length : 0;
  if (clipsFaltan) faltan.push({ que: `${clipsFaltan} clips`, por: "El reel usa clips que ya no están en tu biblioteca: elige otros en el storyboard.", accion: <button type="button" onClick={() => irPaso(2)} className={chip(false)}>Ir al storyboard</button> });

  let aside: ReactNode = null;
  let main: ReactNode = null;

  if (pasoN === 0) {
    aside = (
      <>
        {meta.origen === "referencia" && (
          <Card label="Tu reel de referencia">
            {!plantilla ? (
              <>
                <div className="flex gap-2">
                  <input value={enlace} onChange={e => setEnlace(e.target.value.slice(0, 500))} placeholder="Pega el enlace del reel (Instagram)" disabled={!!busy} className={`${field} min-h-[44px]`} />
                  <button type="button" onClick={() => void cargarReferencia({ url: enlace.trim() })} disabled={!!busy || !enlace.trim()} className="h-11 px-4 rounded-xl bg-primary text-primary-foreground disabled:opacity-50" aria-label="Analizar enlace"><Link2 className="w-4 h-4" /></button>
                </div>
                <input ref={refRef} type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void cargarReferencia({ file: f }); }} />
                <button type="button" onClick={() => refRef.current?.click()} disabled={!!busy} className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border text-sm text-foreground disabled:opacity-50"><Upload className="w-4 h-4" /> O sube el video (hasta 18 MB)</button>
                <p className="text-[11px] text-muted-foreground">TikTok y YouTube no se pueden leer por enlace: descarga el video y súbelo. Se analiza el video real; si no se puede abrir, te lo decimos.</p>
                {(datos.plantillas ?? []).some(x => x.publica) && (
                  // Formatos de SUPERNOVA (28-oct-2026): sin enlace ni video, en un toque.
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[12px] text-muted-foreground">O usa un formato de SUPERNOVA:</p>
                    {(datos.plantillas ?? []).filter(x => x.publica).map(x => (
                      <button key={x.id} type="button" onClick={() => commit({ plantillaId: x.id })} disabled={!!busy}
                        className="flex w-full items-center gap-2 rounded-xl border border-border p-2 text-left hover:border-foreground/30 disabled:opacity-50">
                        <div className="flex gap-0.5 shrink-0">{x.thumbUrls.slice(0, 3).map((u, i) => u && <img key={i} src={u} alt="" className="h-12 aspect-[9/16] rounded object-cover" />)}</div>
                        <span className="flex-1 min-w-0"><span className="block text-[13px] text-foreground line-clamp-1">{x.nombre}</span><span className="block text-[11px] text-muted-foreground">{x.analisis.planos.length} planos · {Math.round(x.duracion ?? x.analisis.duracion)} s</span></span>
                      </button>
                    ))}
                  </div>
                )}
                {busy === "ref" && <p className="text-[12px] text-foreground"><Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" />{refPaso}{refPaso.startsWith("Buscando") ? ` ${Math.round(refProg * 100)} %` : ""}</p>}
              </>
            ) : (
              <>
                <p className="text-[13px] text-foreground">{plantilla.nombre}</p>
                <p className="text-[12px] text-muted-foreground">{plantilla.analisis.planos.length} planos · {Math.round(plantilla.analisis.duracion)} s · {plantilla.publica ? "formato de SUPERNOVA." : "guardado como plantilla."}</p>
                {plantilla.publica && plantilla.descripcion && <p className="text-[12px] text-muted-foreground">{plantilla.descripcion}</p>}
                <button type="button" onClick={() => commit({ plantillaId: null })} disabled={!!busy} className="text-[12px] text-muted-foreground hover:text-foreground">Usar otro reel</button>
              </>
            )}
          </Card>
        )}
        {(meta.origen !== "referencia" || plantilla) && (
          <Card label={meta.origen === "referencia" ? "Tu versión" : meta.origen === "guion" ? "Tu guion" : "Tu idea"}>
            {meta.origen === "referencia" && (
              <div className="grid grid-cols-2 gap-2">
                {(plantilla?.publica ? MODOS_FORMATO : MODOS).map(m => (
                  <button key={m} type="button" onClick={() => commit({ modo: m })} disabled={!!busy}
                    className={`rounded-xl border p-2.5 text-left ${modoDe(meta.modo, plantilla?.publica) === m ? "border-primary bg-card" : "border-border"}`}>
                    <p className="text-[13px] font-semibold text-foreground">{MODO_NOMBRE[m]}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{MODO_LINEA[m]}</p>
                  </button>
                ))}
              </div>
            )}
            {meta.origen === "referencia" && meta.modo === "espejo" && !plantilla?.publica && plantilla?.analisis.gancho.texto && (
              <label className="flex items-start gap-2 rounded-xl border border-border p-2.5 text-[12px] cursor-pointer">
                <input type="checkbox" checked={!!meta.cambiarGancho} onChange={e => commit({ cambiarGancho: e.target.checked })} disabled={!!busy} className="mt-0.5" />
                <span><span className="text-foreground">Cambiar el gancho (opcional)</span><br />
                  <span className="text-muted-foreground">Si no lo marcas, empieza igual que el original: «{plantilla.analisis.gancho.texto.slice(0, 90)}»</span></span>
              </label>
            )}
            <textarea value={meta.idea} rows={meta.origen === "guion" ? 8 : 4} onChange={e => commit({ idea: e.target.value.slice(0, 3000) })} disabled={!!busy}
              placeholder={meta.origen === "guion" ? "Pega tu guion tal cual. SUPERNOVA no le cambia ni una palabra." : meta.origen === "referencia" ? (!plantilla?.publica && (meta.modo === "espejo" || meta.modo === "recrear") ? "Opcional: algo tuyo que quieras sumar." : "¿De qué trata tu versión? Ej.: cómo saber si un producto digital ya vende.") : "Ej.: un reel de 40 s de cómo SUPERNOVA encuentra ofertas que ya venden, gancho fuerte y al final «Comenta SUPERNOVA»."}
              className={`${field} py-2`} />
            {meta.origen === "guion" && <p className="text-[11px] text-muted-foreground">{meta.idea.trim() ? meta.idea.trim().split(/\s+/).length : 0} palabras · unos {Math.round((meta.idea.trim() ? meta.idea.trim().split(/\s+/).length : 0) / (2.9 * aj.velocidad))} s de voz</p>}
            {meta.origen === "idea" && !meta.idea && <button type="button" onClick={() => commit({ idea: PEDIDO_SUPERNOVA })} className={chip(false)}><Sparkles className="inline w-3.5 h-3.5 mr-1 text-primary" />Reel de SUPERNOVA</button>}
            {meta.origen !== "referencia" && (
              // Fotos y clips propios (opcional): van a tu biblioteca y la IA los pone donde se habla de eso.
              <div className="flex flex-wrap items-center gap-2">
                <input ref={ideaRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => { const f = e.target.files; if (f?.length) void subirBiblio(f); e.target.value = ""; }} />
                <button type="button" onClick={() => ideaRef.current?.click()} disabled={!!busy} className={chip(false)}>
                  {busy === "subir" ? <Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="inline w-3.5 h-3.5 mr-1" />}Añadir tus fotos o clips (opcional)
                </button>
                {clips.length > 0 && <span className="text-[11px] text-muted-foreground">{clips.length} en tu biblioteca: se usan solos donde corresponden.</span>}
              </div>
            )}
            {meta.origen === "guion" && (
              // Dos caminos con tu guion: te grabas tú (gratis; los subtítulos cobran aparte) o lo hace la IA.
              <div className="space-y-2 rounded-xl border border-border p-3">
                <p className="text-[12px] text-foreground">¿Quién sale en el video?</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => meta.idea.trim().split(/\s+/).length >= 5 ? setGrabar(true) : toast.error("Escribe tu guion primero.")} disabled={!!busy}
                    className="rounded-xl border border-border p-3 text-left hover:border-foreground/40">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground"><Camera className="w-4 h-4" />Lo grabo yo</span>
                    <span className="block text-[11px] text-muted-foreground">Tu cámara con el guion pasando encima. Después SUPERNOVA le pone subtítulos y quita silencios.</span>
                  </button>
                  <button type="button" onClick={() => tomaRef.current?.click()} disabled={!!busy}
                    className="rounded-xl border border-border p-3 text-left hover:border-foreground/40">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground"><Upload className="w-4 h-4" />Ya lo grabé</span>
                    <span className="block text-[11px] text-muted-foreground">Sube el video de tu celular o tu cámara y sigue a subtítulos.</span>
                  </button>
                </div>
                <input ref={tomaRef} type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) llevarASubtitulos(f); }} />
                <p className="text-[11px] text-muted-foreground">O que la IA lo haga completo (presentador, escenas y voz):</p>
              </div>
            )}
            <button type="button" onClick={preparar} disabled={!!busy} className={primario}>
              {busy === "plan" ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparando guion y escenas…</> : <><Sparkles className="w-4 h-4" /> {r ? "Preparar de nuevo" : meta.origen === "guion" ? "Que lo haga la IA" : "Preparar mi reel"} · {PRICE_PLAN} créditos</>}
            </button>
            {grabar && <GrabarConGuion guion={meta.idea} onUsar={llevarASubtitulos} onClose={() => setGrabar(false)} />}
            {r && <button type="button" onClick={() => irPaso(1)} className="text-[12px] text-primary">Seguir con el reel que ya preparé →</button>}
          </Card>
        )}
      </>
    );
    main = meta.origen === "referencia" && plantilla ? <Referencia pl={plantilla} video={refVideo} /> : player;
  } else if (pasoN === 1 && r) {
    aside = (
      <>
        <Card label="Lo que necesita tu reel">
          {faltan.length ? faltan.map(f => (
            <div key={f.que} className="flex items-start gap-2 rounded-xl border border-primary/40 p-2.5">
              <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="flex-1"><p className="text-[13px] font-semibold text-foreground">Falta: {f.que}</p><p className="text-[12px] text-muted-foreground">{f.por}</p></div>
              {f.accion}
            </div>
          )) : <p className="text-[13px] text-foreground"><Check className="inline w-4 h-4 text-primary mr-1" />Tienes todo. Lo demás lo hace SUPERNOVA.</p>}
          <ul className="text-[12px] text-muted-foreground space-y-1">
            <li><Check className="inline w-3.5 h-3.5 mr-1 text-primary" />Tu voz: {nombreVoz} · {VELOCIDADES.find(v => v.v === aj.velocidad)?.label ?? "Rápida"}</li>
            <li>{foto ? <Check className="inline w-3.5 h-3.5 mr-1 text-primary" /> : "· "}Tu presentador en {lookIds.length} looks</li>
            <li>· {clipIds.length} clips de tu biblioteca · {visuales.length} imágenes con IA ({animVis.length} animadas)</li>
          </ul>
        </Card>
        <Card label="Tu presentador">{fotosPanel}</Card>
        <Card label="Tu estilo">{estiloPanel}</Card>
        <button type="button" onClick={() => irPaso(2)} disabled={!!faltan.find(f => f.que === "Tu foto")} className={primario}>Ver mi video →</button>
      </>
    );
    main = (
      <>
        <Card label="Tu biblioteca">{bibliotecaPanel(clipIds)}</Card>
        {player}
      </>
    );
  } else if (pasoN === 2 && r) {
    aside = (
      <>
        {player}
        <Card label="Pide cambios conversando">
          <div className="space-y-2 max-h-[24dvh] overflow-y-auto pr-1">
            {meta.chat.slice(-6).map((m, i) => <div key={i} className={`rounded-xl px-3 py-2 text-[12px] leading-relaxed ${m.de === "tu" ? "ml-6 bg-secondary/50" : "mr-6 border border-border"} text-foreground`}>{m.texto}</div>)}
          </div>
          <textarea value={texto} rows={2} onChange={e => setTexto(e.target.value.slice(0, 1000))} disabled={!!busy}
            placeholder="«Más corto», «el cierre en una oficina», «usa el clip de la calculadora cuando hable del precio»…" className={`${field} py-2`}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && texto.trim()) void pedir(texto.trim(), { literal: false, cambio: true }); }} />
          <button type="button" onClick={() => void pedir(texto.trim(), { literal: false, cambio: true })} disabled={!!busy || texto.trim().split(/\s+/).length < 2}
            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border text-sm text-foreground disabled:opacity-50">
            {busy === "plan" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Pedir cambio · {PRICE_PLAN} créditos
          </button>
        </Card>
        <button type="button" onClick={() => irPaso(3)} className={primario}>Crear mi reel →</button>
      </>
    );
    main = (
      <>
        <div className="rounded-2xl border border-border p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Guion · {r.guion.split(/\s+/).length} palabras{meta.voz?.key === vozKey ? ` · ${Math.round(total)} s` : ""}</p>
          <p className="mt-1 text-[13px] text-foreground">{r.guion}</p>
        </div>
        {plantilla && (
          <div className="rounded-2xl border border-border p-3 space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Así quedaría tu versión · arriba la referencia, abajo la tuya</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {r.planos.map((p, i) => {
                const ref = p.ref >= 0 ? plantilla.thumbUrls[p.ref] : null;
                const m = medioPlano(i);
                return (
                  <div key={i} className="shrink-0 w-14 space-y-1">
                    <div className="h-16 rounded-md overflow-hidden bg-secondary/40">{ref ? <img src={ref} alt="" className="w-full h-full object-cover" /> : null}</div>
                    <div className="h-16 rounded-md overflow-hidden bg-secondary/40 border border-primary/40">{m ? (m.video ? <video src={m.url} muted className="w-full h-full object-cover" /> : <img src={m.url} alt="" className="w-full h-full object-cover" />) : <span className="block p-1 text-[9px] text-muted-foreground">{FORMAS[p.forma]}</span>}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <Storyboard reel={r} t={t} busy={!!busy} thumb={medioPlano} refThumb={k => plantilla?.thumbUrls[k] || null} estado={estadoPlano}
          lookThumb={k => urls[lookKey(k)] ?? null} clips={clips} onPlanos={setPlanos} onRegenerar={regenerar}
          onSubirClip={() => subirRef.current?.click()} subs={subs}
          onSub={(t0, v) => commit(m => ({ subs: { ...m.subs, [t0.toFixed(2)]: v.slice(0, 30) } }))} />
        <input ref={subirRef} type="file" accept="video/*,image/*" multiple className="hidden" onChange={e => { const f = e.target.files; if (f?.length) void subirBiblio(f); e.target.value = ""; }} />
      </>
    );
  } else if (pasoN === 3 && r && c) {
    const pasos: { label: string; ok: boolean; trabajando?: boolean; detalle: string }[] = [
      { label: "Guion preparado", ok: true, detalle: `${r.planos.length} planos` },
      { label: "Voz generada", ok: n.voz, trabajando: busy === "producir" && !n.voz, detalle: n.voz ? `${Math.round(total)} s` : "" },
      { label: "Avatar generado", ok: n.looks === lookIds.length && n.habla === trs.length, trabajando: enCamino && n.habla < trs.length, detalle: `${n.looks}/${lookIds.length} looks · ${n.habla}/${trs.length} tomas hablando` },
      { label: "Recursos preparados", ok: n.imgs === visuales.length && n.anims === animVis.length && n.clips === clipIds.length, trabajando: enCamino && n.anims < animVis.length, detalle: `${n.imgs}/${visuales.length} imágenes · ${n.anims}/${animVis.length} animaciones · ${n.clips}/${clipIds.length} clips` },
      { label: "Escenas montadas", ok: !!plan, detalle: plan ? "vista previa lista" : "" },
      { label: "Subtítulos sincronizados", ok: !!subs, detalle: subs ? `${subs.length} subtítulos con el tiempo de tu voz` : "" },
      { label: "Video validado", ok: !!meta.validado?.ok, trabajando: busy === "render", detalle: busy === "render" ? `armando ${progress} %` : meta.validado ? (meta.validado.ok ? meta.validado.detalle : `no pasó: ${meta.validado.detalle}`) : "" },
    ];
    aside = (
      <>
        <Card label="Crear reel">
          <p className="text-[13px] text-foreground">Costo estimado: <span className="font-semibold">{fmtCr(c.total)} créditos</span></p>
          <p className="text-[12px] text-muted-foreground">{c.looks} looks tuyos · {c.imagenes} imágenes · {c.animadas} animaciones · tu voz · {c.tomas} {c.tomas === 1 ? "toma" : "tomas"} de ti hablando. Lo que ya está hecho no se vuelve a cobrar; si algo falla, se te devuelve.</p>
          {jean && <p className="text-[11px] text-muted-foreground">Costo real aprox.: tú hablando {usd((c.segHabla || r.planos.filter(p => seVe(p.forma)).length * 1.5) * HABLA_USD_SEG)} · voz {usd(usdVoz)}.</p>}
          <button type="button" onClick={() => void generar()} disabled={!!busy || faltan.some(f => f.que === "Tu foto" || f.que === "Tu voz")} className={primario}>
            {busy === "producir" ? <><Loader2 className="w-4 h-4 animate-spin" /> {paso || "Generando…"}</> : busy === "render" ? <><Loader2 className="w-4 h-4 animate-spin" /> Armando tu reel… {progress} %</> : <><Sparkles className="w-4 h-4" /> Generar mi reel</>}
          </button>
          {meta.auto && !busy && <p className="text-[11px] text-muted-foreground">Sigue solo: cuando terminen las animaciones y tus tomas, se arma, se revisa y se descarga. No cierres la pestaña.</p>}
          {plan && !meta.auto && (
            <button type="button" onClick={() => void render()} disabled={!!busy || !listo} className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border text-sm text-foreground disabled:opacity-50">
              <Download className="w-4 h-4" /> Armar y descargar ahora
            </button>
          )}
          <button type="button" onClick={() => void navigator.clipboard?.writeText(textoPublicacion({ ...r, palabra: aj.palabra || r.palabra })).then(() => toast.success("Texto copiado"))} className="text-[12px] text-primary hover:underline">Copiar el texto para publicar</button>
        </Card>
        {avanzadasPanel}
      </>
    );
    main = (
      <>
        {player}
        <Card label="Producción">
          <ol className="space-y-1.5">
            {pasos.map(s => (
              <li key={s.label} className="flex items-center gap-2 text-[13px]">
                {s.ok ? <Check className="w-4 h-4 text-primary" /> : s.trabajando ? <Loader2 className="w-4 h-4 animate-spin text-foreground" /> : <span className="w-4 h-4 rounded-full border border-border" />}
                <span className={s.ok ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
                {s.detalle && <span className="ml-auto text-[11px] text-muted-foreground text-right">{s.detalle}</span>}
              </li>
            ))}
          </ol>
          {fallas.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-primary/40 p-2.5">
              <p className="text-[12px] font-semibold text-foreground">Esto falló (lo demás está a salvo):</p>
              {fallas.map(f => (
                <div key={f.label} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="flex-1">{f.label}{f.motivo && <span className="block text-[11px] text-muted-foreground/80">{f.motivo}</span>}</span>
                  <button type="button" onClick={() => reintentar(f.keys)} disabled={!!busy} className={chip(false)}>Regenerar</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </>
    );
  }

  function medioPlano(i: number): Medio {
    const p = r?.planos[i];
    if (!p) return null;
    if (p.clip) { const it = clipDe(p.clip); return it ? { url: urls[`bib:${it.path}`] ?? it.url, video: it.video } : null; }
    if (p.visual) {
      const ak = `anim:${huella(p.visual)}`, ik = `img:${huella(p.visual)}`;
      return urls[ak] ? { url: urls[ak], video: true } : urls[ik] ? { url: urls[ik], video: false } : null;
    }
    const lk = lookKey(p.look);
    return urls[lk] ? { url: urls[lk], video: false } : foto ? { url: foto.url, video: false } : null;
  }
  function estadoPlano(i: number): Estado | undefined {
    const p = r?.planos[i];
    if (!p) return undefined;
    if (p.visual) return meta.assets[`${p.animar ? "anim" : "img"}:${huella(p.visual)}`]?.estado ?? (meta.assets[`img:${huella(p.visual)}`]?.estado);
    if (p.clip) { const it = clipDe(p.clip); return it ? meta.assets[`bib:${it.path}`]?.estado : "falló"; }
    const k = trs.findIndex(tr => tr.planos.includes(i));
    return k >= 0 ? meta.assets[hablaKey(k)]?.estado ?? meta.assets[lookKey(p.look)]?.estado : meta.assets[lookKey(p.look)]?.estado;
  }

  return (
    <ToolShell toolId="reel-studio" onNavigate={onNavigate} previewFirst={pasoN !== 2}
      crumbs={[{ label: "Crear" }, { label: "Reel Studio", onClick: () => setVista("inicio") }, { label: meta.origen ? titulos[meta.origen] : "Tu reel" }]}
      title={meta.origen ? titulos[meta.origen] : "Reel Studio"}
      line={pasoN === 0 ? "Paso 1: cuéntanos qué quieres. Lo demás lo prepara SUPERNOVA." : pasoN === 1 ? "Paso 2: revisa que tengas lo necesario. Lo que ya guardaste no se vuelve a pedir." : pasoN === 2 ? "Paso 3: tu storyboard. Toca un plano para cambiarlo o pide cambios conversando." : "Paso 4: genera tu reel. Ves el avance real de cada parte."}
      onBack={() => setVista("inicio")} backLabel="Reel Studio"
      steps={["Tu idea", "Tus recursos", "Tu video", "Crear reel"]} step={pasoN}
      onStep={i => { if (i === 0 || r) irPaso(i); }}
      aside={aside}>
      {main}
    </ToolShell>
  );
}

/** El reel de referencia: video, línea de tiempo con miniaturas reales de sus planos y su análisis audiovisual. */
function Referencia({ pl, video }: { pl: Plantilla; video: string | null }) {
  const a = pl.analisis;
  const total = a.planos.length ? a.planos[a.planos.length - 1].t1 : a.duracion;
  const filas: [string, string][] = [
    ["Gancho", `«${a.gancho.texto}» — ${a.gancho.visual}. ${a.gancho.por_que}`],
    ["Ritmo", `${a.planos.length} planos en ${Math.round(a.duracion)} s (${(a.duracion / Math.max(1, a.planos.length)).toFixed(1).replace(".", ",")} s por plano). ${a.ritmo}`],
    ["Protagonista", `Aparece en ~${Math.round(a.presencia_pct)} % del video.`],
    ["Subtítulos y rótulos", `${a.subtitulos} ${a.rotulos}`.trim()],
    ["Transiciones", a.transiciones.join(", ")],
    ["Colores y movimiento", `${a.colores.join(", ")}. ${a.movimiento}`],
    ["Música y efectos", `${a.musica} ${a.efectos}`.trim()],
    ["Cierre (CTA)", `«${a.cta.texto}» — ${a.cta.como}`],
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        {video ? <video src={video} controls playsInline className="w-full max-h-[50dvh] rounded-2xl bg-black" /> : pl.thumbUrls[0] ? <img src={pl.thumbUrls[0]} alt="" className="w-full rounded-2xl" /> : null}
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Reel de referencia · línea de tiempo</p>
          <div className="flex h-24 w-full gap-0.5 overflow-hidden rounded-xl">
            {a.planos.map((p, i) => (
              <div key={i} title={`${i + 1}. ${p.descripcion}`} className="relative h-full min-w-[10px] bg-secondary/40" style={{ flexGrow: Math.max(0.2, p.t1 - p.t0), flexBasis: 0 }}>
                {pl.thumbUrls[i] && <img src={pl.thumbUrls[i]} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                <span className={`absolute bottom-0 inset-x-0 h-1 ${p.protagonista ? "bg-primary" : "bg-sky-400"}`} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground"><span>0 s</span><span><span className="inline-block w-2 h-1 bg-primary mr-1 align-middle" />la persona <span className="inline-block w-2 h-1 bg-sky-400 mx-1 align-middle" />apoyo</span><span>{Math.round(total)} s</span></div>
          <p className="text-[13px] text-foreground">{a.resumen}</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {filas.filter(([, v]) => v.replace(/[«»—.,\s]/g, "")).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border p-3"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p><p className="mt-1 text-[12px] text-foreground leading-snug">{v}</p></div>
        ))}
      </div>
      {a.mecanismo.length > 0 && (
        <div className="rounded-xl border border-border p-3"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Por qué funciona</p>
          <ul className="mt-1 space-y-0.5 text-[12px] text-foreground">{a.mecanismo.map((m, i) => <li key={i}>· {m}</li>)}</ul></div>
      )}
      {/* En un formato de SUPERNOVA no se muestra el guion del original: el formato es la estructura, no su texto
          (lo que dice otro creador no se reparte a todas las cuentas). */}
      {a.transcripcion.length > 0 && !pl.publica && (
        <div className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Guion completo · lo que dice</p>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(a.transcripcion.map(x => x.texto).join(" ")).then(() => toast.success("Guion copiado"))}
              className="text-[12px] text-primary hover:underline">Copiar guion</button>
          </div>
          <ol className="mt-1 space-y-1 text-[12px]">
            {a.transcripcion.map((x, i) => <li key={i} className="flex gap-2"><span className="w-10 shrink-0 tabular-nums text-muted-foreground">{x.t0.toFixed(1).replace(".", ",")} s</span><span className="text-foreground">{x.texto}</span></li>)}
          </ol>
        </div>
      )}
      <div className="rounded-xl border border-border p-3"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Planos</p>
        <ol className="mt-1 space-y-1 text-[12px] text-muted-foreground">
          {a.planos.map((p, i) => <li key={i} className="flex gap-2">{pl.thumbUrls[i] && <img src={pl.thumbUrls[i]} alt="" className="w-8 h-12 rounded object-cover shrink-0" />}<span><span className="text-foreground">{i + 1}. {(p.t1 - p.t0).toFixed(1).replace(".", ",")} s · {FORMAS[p.forma]} · {p.camara}</span> — {p.descripcion}{p.transicion ? ` · entra con ${p.transicion}` : ""}</span></li>)}
        </ol>
      </div>
      <p className="text-[11px] text-muted-foreground">Se toma la estructura, el ritmo y la dirección audiovisual; nunca la cara, el nombre, la marca ni los números de quien hizo el original.</p>
    </div>
  );
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="card-surface rounded-2xl p-4 space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
