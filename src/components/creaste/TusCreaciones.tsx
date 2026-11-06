import { useEffect, useState } from "react";
import { Check, Download, ExternalLink, Film, LayoutTemplate, Link2, Scissors, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { useBusinessProfile } from "@/lib/businessProfile";
import { useOfferFavorites } from "@/hooks/useOfferFavorites";
import { abrirGuardado } from "@/lib/carouselStore";
import { downloadVideo } from "@/components/video/videoApi";
import type { CarouselDraft } from "@/lib/carousel";

/**
 * Lo que la persona creó, en un solo lugar (06-nov-2026, pedido de Jean con el caso de Cindy, que no veía sus videos):
 * el enlace de venta de su producto, sus videos (guardados en nuestro almacenamiento por video-guardar), sus carruseles
 * (carousel_saves) y las ofertas que guardó con la estrellita (offer_favorites). Solo lee lo que ya existe: no gasta IA.
 */
type Job = { id: string; result_url: string; prompt: string | null; created_at: string };
type CarruselGuardado = { id: string; title: string; draft: CarouselDraft; updated_at: string };
type OfertaGuardada = { id: string; product_name: string | null; cover_url: string | null; days_active: number | null };

const VER_MAS = 6;
const fecha = (s: string) => new Date(s).toLocaleDateString("es", { day: "numeric", month: "short" });
const titulo = (t: string) => <h3 className="font-display font-bold text-lg text-foreground">{t}</h3>;
const vacio = (t: string) => <p className="card-surface rounded-xl px-4 py-5 text-sm text-muted-foreground">{t}</p>;

export function TusCreaciones({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const { activeId } = useProducts();
  const { profile, loaded, savePatch } = useBusinessProfile();
  const fav = useOfferFavorites();
  const [enlace, setEnlace] = useState("");
  const [videos, setVideos] = useState<Job[] | null>(null);
  const [carruseles, setCarruseles] = useState<CarruselGuardado[] | null>(null);
  const [ofertas, setOfertas] = useState<OfertaGuardada[] | null>(null);
  const [masVideos, setMasVideos] = useState(false);

  useEffect(() => { if (loaded) setEnlace(profile.store_url ?? ""); }, [loaded, profile.store_url]);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    // Videos que siguen disponibles: los guardados en nuestro almacenamiento o los de los últimos 2 días.
    void db.from("video_jobs").select("id,result_url,prompt,created_at").eq("user_id", user.id).eq("status", "done")
      .not("result_url", "is", null).order("created_at", { ascending: false }).limit(60)
      .then(({ data }: { data: Job[] | null }) => setVideos((data ?? []).filter(j => j.result_url.includes("/videos-creados/") || Date.now() - new Date(j.created_at).getTime() < 2 * 864e5)));
    void db.from("carousel_saves").select("id,title,draft,updated_at").order("updated_at", { ascending: false }).limit(30)
      .then(({ data }: { data: CarruselGuardado[] | null }) => setCarruseles(data ?? []));
    void db.from("offer_favorites").select("offer_id, offers(id,product_name,cover_url,days_active)").order("created_at", { ascending: false }).limit(60)
      .then(({ data }: { data: { offers: OfertaGuardada | null }[] | null }) => setOfertas((data ?? []).map(r => r.offers).filter((o): o is OfertaGuardada => !!o)));
  }, [user]);

  const guardarEnlace = async () => {
    const v = enlace.trim();
    if (v && !/^https?:\/\/\S+\.\S+/i.test(v)) { toast.error("Pega el enlace completo, empezando por https://"); return; }
    await savePatch({ store_url: v });
    toast.success(v ? "Enlace guardado" : "Enlace quitado", { description: v ? "Lo usamos en tus textos y anuncios." : undefined });
  };
  const abrirCarrusel = (c: CarruselGuardado) => {
    if (!user || !activeId) return;
    abrirGuardado(user.id, activeId, { ...c.draft, saveId: c.id });
    onNavigate?.("Carrusel");
  };
  const borrarCarrusel = async (c: CarruselGuardado) => {
    if (!window.confirm(`¿Borrar «${c.title || "este carrusel"}»? No se puede recuperar.`)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("carousel_saves").delete().eq("id", c.id);
    if (error) { toast.error("No se pudo borrar."); return; }
    setCarruseles(xs => (xs ?? []).filter(x => x.id !== c.id));
  };
  const quitarOferta = async (id: string) => {
    await fav.toggle(id);
    setOfertas(xs => (xs ?? []).filter(o => o.id !== id));
  };

  const vids = videos ?? [];
  const mostrados = masVideos ? vids : vids.slice(0, VER_MAS);

  return (
    <div className="space-y-8">
      {/* Tu producto: el enlace donde se compra. */}
      <section className="space-y-3">
        {titulo("Tu producto")}
        <div className="card-surface rounded-xl p-4 space-y-2">
          <label htmlFor="enlace-venta" className="flex items-center gap-2 text-sm text-foreground"><Link2 className="w-4 h-4 text-primary" /> Enlace de venta de tu producto</label>
          <p className="text-[12px] text-muted-foreground">Donde te compran: tu WhatsApp, Hotmart, Whop o tu página. Lo usamos en tus textos y anuncios.</p>
          <div className="flex gap-2">
            <input id="enlace-venta" value={enlace} onChange={e => setEnlace(e.target.value.slice(0, 500))} placeholder="https://wa.me/57…  o  https://tu-pagina.com"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background/40 px-3 py-2 text-[16px] sm:text-sm text-foreground" />
            <button type="button" onClick={() => void guardarEnlace()} disabled={!loaded || enlace.trim() === (profile.store_url ?? "")}
              className="shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">Guardar</button>
          </div>
          {profile.store_url && <a href={profile.store_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"><Check className="w-3.5 h-3.5" /> Abrir tu enlace <ExternalLink className="w-3 h-3" /></a>}
        </div>
      </section>

      {/* Tus videos. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          {titulo(`Tus videos${videos ? ` (${vids.length})` : ""}`)}
          {vids.length > 1 && (
            <button type="button" onClick={() => { window.location.hash = "#/con-tu-cara/montaje"; }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-foreground hover:border-primary/60">
              <Scissors className="w-3.5 h-3.5" /> Unir tus tomas
            </button>
          )}
        </div>
        {videos === null ? vacio("Buscando tus videos…") : !vids.length ? vacio("Aquí aparecen los videos que creas en la app. Quedan guardados para verlos y descargarlos cuando quieras.") : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {mostrados.map(j => (
                <div key={j.id} className="card-surface rounded-xl overflow-hidden">
                  <video src={j.result_url} controls playsInline preload="metadata" className="w-full aspect-[9/16] bg-black object-cover" />
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-[11px] text-muted-foreground">{fecha(j.created_at)}</span>
                    <button type="button" onClick={() => void downloadVideo(j.result_url, `supernova-${j.id.slice(0, 8)}.mp4`)} aria-label="Descargar" className="text-muted-foreground hover:text-foreground"><Download className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            {vids.length > VER_MAS && !masVideos && <button type="button" onClick={() => setMasVideos(true)} className="text-sm text-primary hover:underline">Ver los {vids.length}</button>}
          </>
        )}
      </section>

      {/* Tus carruseles. */}
      <section className="space-y-3">
        {titulo(`Tus carruseles${carruseles ? ` (${carruseles.length})` : ""}`)}
        {carruseles === null ? vacio("Buscando tus carruseles…") : !carruseles.length ? vacio("Aquí quedan los carruseles que armas en «Carrusel que vende», para abrirlos y seguir editándolos.") : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {carruseles.map(c => (
              <div key={c.id} className="card-surface rounded-xl p-4 flex flex-col gap-2">
                <div className="text-[10px] uppercase tracking-widest text-primary font-bold flex items-center gap-1"><LayoutTemplate className="w-3 h-3" /> Carrusel · {c.draft.slides?.length ?? 0} láminas</div>
                <div className="font-display font-bold text-sm text-foreground line-clamp-2">{c.title || "Carrusel"}</div>
                <div className="text-[10px] text-muted-foreground">Actualizado {fecha(c.updated_at)}</div>
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => abrirCarrusel(c)} className="text-xs text-primary hover:underline">Abrir y editar →</button>
                  <button type="button" onClick={() => void borrarCarrusel(c)} aria-label="Borrar carrusel" className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ofertas guardadas con la estrellita. */}
      <section className="space-y-3">
        {titulo(`Ofertas guardadas${ofertas ? ` (${ofertas.length})` : ""}`)}
        {ofertas === null ? vacio("Buscando tus ofertas…") : !ofertas.length ? vacio("Toca la ★ en cualquier oferta para guardarla aquí. Es gratis.") : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {ofertas.map(o => (
              <div key={o.id} className="card-surface rounded-xl overflow-hidden flex flex-col">
                <div className="aspect-[4/3] bg-secondary/40">
                  {o.cover_url ? <img src={o.cover_url} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6 text-muted-foreground" /></div>}
                </div>
                <div className="p-3 flex-1 flex flex-col gap-1">
                  <div className="text-sm font-semibold text-foreground line-clamp-2">{o.product_name || "Oferta"}</div>
                  {o.days_active != null && <div className="text-[11px] text-muted-foreground">{o.days_active} días pagando anuncios</div>}
                  <div className="mt-auto pt-1 flex items-center justify-between">
                    <button type="button" onClick={() => onNavigate?.("Ofertas")} className="text-xs text-primary hover:underline">Ver en Ofertas →</button>
                    <button type="button" onClick={() => void quitarOferta(o.id)} aria-label="Quitar de guardadas" className="text-primary"><Star className="w-4 h-4" fill="currentColor" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
