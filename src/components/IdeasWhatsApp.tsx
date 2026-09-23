import { useEffect, useState } from "react";
import { Sparkles, Loader2, Copy, MessageCircle, Plus, Trash2, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits, generatorCost } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import { useFormAssist } from "@/lib/formAssist";
import { AssistButton } from "@/components/AssistButton";
import { useBusinessProfile } from "@/lib/businessProfile";

/**
 * Fábrica de ideas para vender por WhatsApp.
 *
 * Parte de lo que ya se vende en Etsy (los patrones de su vitrina pública y lo que el
 * usuario pegue de lo que vio) y lo convierte en productos que alguien de LATAM puede
 * hacer esta semana, en español, y vender por WhatsApp. No raspa Etsy: sus condiciones
 * lo prohíben. Las ideas no se repiten: cada tanda recibe la lista de las anteriores.
 */

// Lo observado en la vitrina pública de Etsy (muestra de 60 resultados, 22-sep-2026).
// Las reseñas son la señal: en Etsy solo reseña quien compró.
const PATRONES_ETSY = `- Descargas digitales: la mitad de la muestra (30 de 60), de USD 1 a 9. Megapaquetes de arte imprimible, páginas para colorear, diseños para corte láser (uno con 11.800 reseñas a USD 4,86), láminas imprimibles (200 a 1.800 reseñas a menos de USD 2).
- Personalizados para regalo: cartera de piel con nombre y bloqueo RFID (7.900 reseñas, USD 35-42), collares con nombre o inicial.
- Decoración grande (lienzos de USD 100-125) con descuentos del 30 al 75%: se compite por precio.`;

const CATEGORIAS = [
  "Imprimibles para decorar", "Planificadores y agendas", "Plantillas editables (Canva)",
  "Páginas para colorear", "Invitaciones y tarjetas editables", "Stickers y etiquetas digitales",
  "Diseños para sublimación y corte", "Personalizados con nombre", "Material educativo imprimible",
];
const PUBLICOS = ["Mamás", "Maestras", "Emprendedoras", "Novias y bodas", "Niños", "Parejas", "Fitness y salud", "Mascotas"];
const OCASIONES = ["Black Friday", "Navidad", "Día de Reyes", "San Valentín", "Regreso a clases", "Cumpleaños", "Todo el año"];

type Idea = { id: string; nombre: string; texto: string; para: string; precio: string };

function prompt(cat: string, pub: string, oca: string, visto: string, previas: string[]) {
  // La IA no sabe qué día es: sin esto propone "Agenda 2025" en septiembre de 2026.
  const hoy = new Date();
  const fecha = hoy.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
  const proximo = hoy.getMonth() >= 8 ? hoy.getFullYear() + 1 : hoy.getFullYear();
  return `FECHA DE HOY: ${fecha}. Si un producto lleva año (agendas, calendarios, planificadores anuales), usa ${proximo}.

Eres un estratega de productos digitales para emprendedores de Latinoamérica que venden por WhatsApp. Conviertes lo que ya se vende en Etsy en productos que una persona puede crear esta semana, en español, y vender a su comunidad.

PATRONES OBSERVADOS EN LA VITRINA PÚBLICA DE ETSY:
${PATRONES_ETSY}

CATEGORÍA: ${cat}
PÚBLICO: ${pub}
OCASIÓN: ${oca}
${visto.trim() ? `LO QUE EL USUARIO VIO EN ETSY Y LE GUSTÓ (inspiración, no para copiar):\n${visto.trim().slice(0, 1500)}\n` : ""}${previas.length ? `YA PROPUESTAS, NO LAS REPITAS NI HAGAS VARIANTES OBVIAS:\n${previas.map(p => `- ${p}`).join("\n")}\n` : ""}
Entrega EXACTAMENTE 5 ideas, con este formato exacto para cada una:

### Idea N: [nombre corto del producto]
**Qué es:** qué recibe el cliente, en una frase.
**Para quién:** el público concreto.
**Por qué se vende:** relaciónalo con el patrón de Etsy. Si es una suposición tuya, dilo.
**Cómo hacerlo:** herramienta (Canva, Google Slides, una impresora…), cuánto tiempo lleva y cuánto cuesta empezar.
**Precio:** en USD, con su equivalente aproximado en pesos mexicanos y colombianos.
**Venta por WhatsApp:** el texto para el estado de WhatsApp, la respuesta cuando alguien pregunta, cómo cobrar (enlace de pago o transferencia) y cómo entregar (PDF por WhatsApp o enlace de descarga).
**Order bump:** un extra barato para ofrecer justo antes de cobrar.
**Ojo:** el riesgo legal o práctico concreto de ESTA idea. No hables de garantías aquí.

REGLAS:
- Solo productos que se puedan hacer en menos de una semana, sin inventario o con muy poco.
- Nunca personajes, marcas ni diseños con derechos de autor (Disney, Bluey, equipos de fútbol, marcas de lujo). Diseño propio o recursos con licencia comercial clara.
- Nada de copiar el diseño de otro vendedor: la idea es la categoría, la versión es propia.
- No prometas ingresos ni cifras de ventas: no tenemos ese dato.
- Español neutro, frases cortas.`;
}

/** Separa la respuesta en ideas para poder mostrarlas como tarjetas y usarlas en la Mándala. */
function separar(texto: string): Idea[] {
  return texto.split(/^###\s*Idea\s*\d+\s*:\s*/im).slice(1).map((bloque, i) => {
    const [primera, ...resto] = bloque.split("\n");
    const campo = (nombre: string) => (bloque.match(new RegExp(`\\*\\*${nombre}:\\*\\*\\s*(.+)`, "i"))?.[1] ?? "").trim();
    return {
      id: `${Date.now()}-${i}`,
      nombre: primera.replace(/[*#]/g, "").trim() || `Idea ${i + 1}`,
      // Cada campo en su propio párrafo: Markdown junta las líneas sueltas en una sola.
      texto: resto.join("\n").trim().replace(/\n(?=\*\*)/g, "\n\n"),
      para: campo("Para quién"),
      precio: campo("Precio"),
    };
  }).filter(x => x.texto);
}

export function IdeasWhatsApp({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const { savePatch: saveBusiness } = useBusinessProfile();
  const { applyServerCharge, canAfford } = useCredits();
  const key = `sn_ideas_whatsapp_${user?.id ?? "anon"}`;
  const [cat, setCat] = useState(CATEGORIAS[0]);
  const [pub, setPub] = useState(PUBLICOS[0]);
  const [oca, setOca] = useState(OCASIONES[1]);
  const [visto, setVisto] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [borrador, setBorrador] = useState("");
  const [loading, setLoading] = useState(false);

  // Las ideas se guardan en este navegador para no perderlas al cambiar de pantalla.
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(key) || "[]"); if (Array.isArray(s)) setIdeas(s); } catch { /* sin almacenamiento */ }
  }, [key]);
  const guardar = (lista: Idea[]) => { setIdeas(lista); try { localStorage.setItem(key, JSON.stringify(lista.slice(0, 200))); } catch { /* sin almacenamiento */ } };

  const assist = useFormAssist("whatsapp-visto");
  const rellenarVisto = async () => {
    try {
      const s = await assist.generate({ tipo: cat, para_quien: pub, para_cuando: oca, ya_escrito: visto });
      if (typeof s.text === "string" && s.text) setVisto(s.text.slice(0, 1500));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo escribir el ejemplo. Prueba otra vez.");
    }
  };

  const generar = async () => {
    const { action } = generatorCost("etsy-ideas");
    if (!canAfford(action)) { toast.error(`Te faltan créditos: 5 ideas cuestan ${generatorCost("etsy-ideas").cost}`, { description: "Recarga créditos o espera a que se renueven el mes que viene." }); return; }
    setLoading(true); setBorrador("");
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: "POST", headers: await fnHeaders(),
        body: JSON.stringify({
          generator_id: "etsy-ideas", generator_title: `Ideas WhatsApp · ${cat} · ${pub}`,
          messages: [{ role: "user", content: prompt(cat, pub, oca, visto, ideas.map(i => i.nombre).slice(0, 60)) }],
        }),
      });
      if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "No se pudieron generar las ideas"));
      applyServerCharge(action, readBilling(resp), "Ideas para WhatsApp");
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "", full = "", fin = false;
      while (!fin) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") { fin = true; break; }
          try { const c = JSON.parse(j).choices?.[0]?.delta?.content; if (c) { full += c; setBorrador(full); } }
          catch { buf = line + "\n" + buf; break; }
        }
      }
      const nuevas = separar(full);
      if (!nuevas.length) throw new Error("Las ideas salieron con un formato que no pudimos leer. Prueba otra vez.");
      guardar([...nuevas, ...ideas]);
      setBorrador("");
      toast.success(`Listo: ${nuevas.length} ideas nuevas guardadas abajo`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron generar las ideas");
    } finally { setLoading(false); }
  };

  /** Lleva la idea a la Mándala como oferta, lista para crear anuncios u orgánico. */
  const aMandala = async (idea: Idea) => {
    const precio = idea.precio.match(/(\d+[.,]?\d*)/)?.[1] ?? "";
    const brief = {
      product: idea.nombre.slice(0, 300),
      who: (idea.para || pub).slice(0, 300),
      promise: (idea.texto.match(/\*\*Qué es:\*\*\s*(.+)/i)?.[1] ?? idea.nombre).slice(0, 300),
      price: precio.replace(",", "."),
      proof: "",
    };
    // La Mándala lee la ficha de "Mi negocio" (business_profile): se guarda ahí, sin perder el tipo de negocio.
    if (!(await saveBusiness(brief))) { toast.error("No se pudo cargar la oferta en la Mándala. Intenta de nuevo."); return; }
    toast.success("Idea cargada en la Mándala", { description: "Si vas a vender sin pagar anuncios, elige “Sin pagar anuncios (orgánico)”." });
    if (onNavigate) onNavigate("Mándala"); else window.location.hash = "#/mandala";
  };

  const Chips = ({ items, value, set }: { items: string[]; value: string; set: (v: string) => void }) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map(x => (
        <button key={x} onClick={() => set(x)}
          className={`rounded-full border px-3 py-1.5 text-xs ${value === x ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}>
          {x}
        </button>
      ))}
    </div>
  );

  const coste = generatorCost("etsy-ideas").cost;

  return (
    <div className="space-y-5">
      <div className="card-surface rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" /> Ideas para vender por WhatsApp
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Si aún no tienes producto, empieza aquí. Partimos de lo que ya se vende en Etsy (una tienda en línea muy grande) y la IA lo convierte
            en productos sencillos (casi siempre digitales, hechos con herramientas como Canva) que puedes hacer esta semana, en español, y vender por WhatsApp.
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl">
            Elige qué tipo de producto, para quién y para cuándo. Cada tanda trae 5 ideas nuevas, con precio sugerido, cómo hacerlo y el mensaje para vender, y no repite las anteriores.
          </p>
        </div>

        <div className="space-y-3">
          <div><p className="text-xs font-semibold text-foreground mb-1.5">Qué tipo de producto</p><Chips items={CATEGORIAS} value={cat} set={setCat} /></div>
          <div><p className="text-xs font-semibold text-foreground mb-1.5">Para quién</p><Chips items={PUBLICOS} value={pub} set={setPub} /></div>
          <div><p className="text-xs font-semibold text-foreground mb-1.5">Para cuándo</p><Chips items={OCASIONES} value={oca} set={setOca} /></div>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <span><b className="text-foreground">¿Viste algo en Etsy que te gustó?</b> Pega aquí su título o descripción (es opcional). La IA lo usa como inspiración, no para copiarlo.</span>
            <AssistButton onClick={rellenarVisto} loading={assist.loading} filled={!!visto.trim()} className="self-start" />
            <textarea value={visto} onChange={e => setVisto(e.target.value)} rows={2} maxLength={1500}
              placeholder={assist.text() ? `Ej.: ${assist.text()}` : "Ej.: Printable Christmas Planner, 30 pages, instant download…"}
              className="rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60" />
          </label>
        </div>

        <button onClick={generar} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : ideas.length ? <Plus className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          {ideas.length ? "Dame 5 ideas más" : "Dame 5 ideas"} · {coste} créditos
        </button>
      </div>

      {loading && borrador && (
        <div className="card-surface rounded-2xl p-5 prose prose-sm prose-invert max-w-none text-foreground opacity-80">
          <ReactMarkdown>{borrador}</ReactMarkdown>
        </div>
      )}

      {ideas.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Tus ideas guardadas ({ideas.length})</p>
            <button onClick={() => { if (window.confirm(`¿Borrar tus ${ideas.length} ideas guardadas? No se pueden recuperar.`)) guardar([]); }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /> Borrar todas</button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {ideas.map(idea => (
              <article key={idea.id} className="card-surface rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display font-semibold text-[15px] text-foreground leading-snug">{idea.nombre}</h3>
                  {idea.precio && <span className="shrink-0 rounded-full bg-primary/10 text-primary text-[11px] font-bold px-2.5 py-1">{idea.precio.split(/[(,]/)[0].trim()}</span>}
                </div>
                <div className="prose prose-sm prose-invert max-w-none text-foreground text-[13px] [&_p]:my-1.5">
                  <ReactMarkdown>{idea.texto}</ReactMarkdown>
                </div>
                <div className="flex flex-wrap gap-2 pt-1 mt-auto">
                  <button onClick={() => aMandala(idea)}
                    className="inline-flex items-center gap-1.5 rounded-lg gradient-brand px-3 py-2 text-xs font-bold text-primary-foreground">
                    <Sparkles className="w-3.5 h-3.5" /> Crear anuncios y publicaciones
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(`${idea.nombre}\n\n${idea.texto}`); toast.success("Idea copiada"); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </button>
                  <button onClick={() => guardar(ideas.filter(x => x.id !== idea.id))}
                    className="p-2 text-muted-foreground hover:text-red-400" aria-label="Quitar idea"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </article>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Son ideas, no garantías de venta: antes de invertir tiempo o dinero, pregunta a 10 personas de tu público si lo comprarían y a qué precio.
            Usa diseños propios o recursos con licencia comercial; nunca personajes ni marcas de otros (Disney, equipos de fútbol…).
            Las ideas se guardan solo en este navegador.
          </p>
        </div>
      )}
    </div>
  );
}
