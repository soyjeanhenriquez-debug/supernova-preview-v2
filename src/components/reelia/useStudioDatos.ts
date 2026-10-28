import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { descDeNombre, idsDeBiblioteca, type Analisis, type ClipInfo, type ModoReel, type Reel } from "@/lib/reelDinamico";
import type { StudioRef } from "@/lib/studioUpload";

/**
 * Datos guardados de Reel Studio (25-oct-2026): Mi identidad (reel_identidad), la biblioteca de clips (bucket
 * biblioteca/{uid}/app), las plantillas de referencia (reel_plantillas), la producción diaria (reel_diario) y sus
 * borradores (reel_borradores). Todo con RLS por cuenta. Las tablas son nuevas y no están en los tipos generados.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;
export const BIBLIO = "biblioteca";

export type Identidad = {
  fotos: StudioRef[];
  logo: StudioRef | null;
  voice_id: string;
  paleta: string;
  ropa: string;
  palabra: string;
  velocidad: number;
  sfx: boolean;
  clips_desc: Record<string, string>;
};
export const IDENTIDAD_VACIA: Identidad = { fotos: [], logo: null, voice_id: "", paleta: "cian", ropa: "ropa oscura elegante y bien ajustada", palabra: "", velocidad: 1.1, sfx: true, clips_desc: {} };
export type BiblioItem = { path: string; name: string; url: string; video: boolean };
export type Plantilla = {
  id: string; nombre: string; fuente: string; duracion: number | null; analisis: Analisis; thumbs: string[]; thumbUrls: string[]; created_at: string;
  /** Plantilla de SUPERNOVA (28-oct-2026): la ven todas las cuentas; no se borra ni se cambia desde la app. */
  publica?: boolean; descripcion?: string;
};
export type Borrador = { id: string; tema: string; modo: ModoReel; reel: Reel; plantilla_id: string | null; created_at: string; origen: string };
/** plantilla_ids: las plantillas que se van alternando cada día (plantilla_id queda como la primera, por compatibilidad). */
export type Diario = { activo: boolean; plantilla_id: string | null; plantilla_ids: string[]; temas: string[]; por_dia: number; modo: ModoReel; palabra: string };
export const DIARIO_VACIO: Diario = { activo: false, plantilla_id: null, plantilla_ids: [], temas: [], por_dia: 2, modo: "inspiracion", palabra: "" };

type Ref = { bucket: "estudio-avatar" | "personajes"; path: string };
async function firmar(r: Ref): Promise<StudioRef | null> {
  const { data } = await supabase.storage.from(r.bucket).createSignedUrl(r.path, 60 * 60 * 6);
  return data?.signedUrl ? { bucket: r.bucket, path: r.path, url: data.signedUrl } : null;
}
const sinUrl = (r: StudioRef) => ("stock" in r ? null : { bucket: r.bucket, path: r.path });

export function useStudioDatos(uid: string) {
  const [idn, setIdn] = useState<Identidad>(IDENTIDAD_VACIA);
  const [idnListo, setIdnListo] = useState(false);
  const [biblio, setBiblio] = useState<BiblioItem[] | null>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [borradores, setBorradores] = useState<Borrador[]>([]);
  const [diario, setDiario] = useState<Diario>(DIARIO_VACIO);

  const cargarIdentidad = useCallback(async () => {
    if (!uid) return;
    const { data } = await db().from("reel_identidad").select("*").eq("user_id", uid).maybeSingle();
    if (data) {
      const fotos = (await Promise.all(((data.fotos ?? []) as Ref[]).map(firmar))).filter(Boolean) as StudioRef[];
      const logo = data.logo ? await firmar(data.logo as Ref) : null;
      setIdn({ ...IDENTIDAD_VACIA, ...data, fotos, logo, voice_id: data.voice_id ?? "", velocidad: Number(data.velocidad) || 1.1, clips_desc: data.clips_desc ?? {} });
    }
    setIdnListo(true);
  }, [uid]);

  /** Guarda Mi identidad (lo que se configura una vez y se usa en cada reel). */
  const guardarIdentidad = useCallback(async (patch: Partial<Identidad>) => {
    if (!uid) return;
    const next = { ...idn, ...patch };
    setIdn(next);
    const row = {
      user_id: uid, fotos: next.fotos.map(sinUrl).filter(Boolean), logo: next.logo ? sinUrl(next.logo) : null,
      voice_id: next.voice_id.trim() || null, paleta: next.paleta, ropa: next.ropa.slice(0, 120), palabra: next.palabra.slice(0, 30),
      velocidad: next.velocidad, sfx: next.sfx, clips_desc: next.clips_desc, updated_at: new Date().toISOString(),
    };
    const { error } = await db().from("reel_identidad").upsert(row, { onConflict: "user_id" });
    if (error) toast.error("No se pudo guardar Mi identidad.");
  }, [uid, idn]);

  const cargarBiblio = useCallback(async () => {
    if (!uid) return;
    const { data, error } = await supabase.storage.from(BIBLIO).list(`${uid}/app`, { limit: 60, sortBy: { column: "created_at", order: "desc" } });
    const files = error ? [] : (data ?? []).filter(f => f.name && !f.name.startsWith("."));
    if (!files.length) { setBiblio([]); return; }
    const { data: signed } = await supabase.storage.from(BIBLIO).createSignedUrls(files.map(f => `${uid}/app/${f.name}`), 60 * 60 * 6);
    setBiblio((signed ?? []).filter(x => x.signedUrl && x.path).map(x => ({
      path: x.path!, url: x.signedUrl, name: x.path!.split("/").pop()!.replace(/^\d+-/, ""), video: /\.(mp4|mov|webm)$/i.test(x.path!),
    })));
  }, [uid]);

  const cargarPlantillas = useCallback(async () => {
    if (!uid) return;
    // Las tuyas y las de SUPERNOVA (públicas; primero, en su orden).
    const { data } = await db().from("reel_plantillas").select("id, nombre, fuente, duracion, analisis, thumbs, created_at, publica, descripcion, orden")
      .or(`user_id.eq.${uid},publica.eq.true`).order("publica", { ascending: false }).order("orden").order("created_at", { ascending: false }).limit(30);
    const rows = (data ?? []) as Omit<Plantilla, "thumbUrls">[];
    // Miniaturas: las públicas son imágenes de la app ("/plantillas/…"); las tuyas, archivos de tu biblioteca.
    const all = rows.flatMap(r => r.thumbs).filter(t => !t.startsWith("/"));
    const { data: signed } = all.length ? await supabase.storage.from(BIBLIO).createSignedUrls(all, 60 * 60 * 6) : { data: [] };
    const map = new Map((signed ?? []).map(s => [s.path, s.signedUrl]));
    setPlantillas(rows.map(r => ({ ...r, thumbUrls: r.thumbs.map(t => (t.startsWith("/") ? t : map.get(t) ?? "")) })));
  }, [uid]);

  const cargarBorradores = useCallback(async () => {
    if (!uid) return;
    const { data } = await db().from("reel_borradores").select("id, tema, modo, reel, plantilla_id, created_at, origen").eq("user_id", uid).eq("estado", "borrador").order("created_at", { ascending: false }).limit(12);
    setBorradores((data ?? []) as Borrador[]);
  }, [uid]);

  const cargarDiario = useCallback(async () => {
    if (!uid) return;
    const { data } = await db().from("reel_diario").select("activo, plantilla_id, plantilla_ids, temas, por_dia, modo, palabra").eq("user_id", uid).maybeSingle();
    if (data) setDiario({ ...DIARIO_VACIO, ...data, plantilla_ids: data.plantilla_ids?.length ? data.plantilla_ids : data.plantilla_id ? [data.plantilla_id] : [] });
  }, [uid]);

  const guardarDiario = useCallback(async (d: Diario) => {
    setDiario(d);
    const { error } = await db().from("reel_diario").upsert({ user_id: uid, ...d, plantilla_id: d.plantilla_ids[0] ?? d.plantilla_id ?? null, temas: d.temas.map(t => t.trim()).filter(Boolean).slice(0, 30), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) { toast.error("No se pudo guardar la producción diaria."); return false; }
    return true;
  }, [uid]);

  const marcarBorrador = useCallback(async (id: string, estado: "aprobado" | "descartado") => {
    await db().from("reel_borradores").update({ estado }).eq("id", id);
    setBorradores(b => b.filter(x => x.id !== id));
  }, []);

  useEffect(() => {
    if (!uid) return;
    void cargarIdentidad(); void cargarBiblio(); void cargarPlantillas(); void cargarBorradores(); void cargarDiario();
  }, [uid, cargarIdentidad, cargarBiblio, cargarPlantillas, cargarBorradores, cargarDiario]);

  /** Los clips como los ve la IA: id (nombre del archivo) y qué muestran (lo que escribió la persona o el nombre). */
  const ids = idsDeBiblioteca((biblio ?? []).map(b => b.name));
  const clips: (ClipInfo & { item: BiblioItem })[] = (biblio ?? []).map((it, i) => ({ id: ids[i], desc: idn.clips_desc[it.path]?.trim() || descDeNombre(it.name), item: it }));

  return {
    idn, idnListo, guardarIdentidad, biblio, cargarBiblio, clips, plantillas, cargarPlantillas,
    borradores, cargarBorradores, marcarBorrador, diario, guardarDiario,
  };
}
