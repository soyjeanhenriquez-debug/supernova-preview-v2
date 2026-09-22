import { useMemo, useRef, useState } from "react";
import { Upload, Loader2, Check, Trash2, FileText, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Importador del Mercado. Las redes de afiliados entregan sus catálogos como archivos
 * (CSV de Awin, XML del marketplace de ClickBank…), cada una con sus propias columnas.
 * Por eso este importador no sabe de ninguna red en concreto: lee el archivo, muestra
 * las columnas que trae y deja emparejarlas con los campos del Mercado. Así sirve para
 * la red de hoy y para la que llegue mañana, sin tocar código.
 */

type Source = "clickbank" | "digistore24" | "etsy" | "manual";
type Field = { key: string; label: string; required?: boolean; number?: boolean };

const FIELDS: Field[] = [
  { key: "external_id", label: "ID en la red", required: true },
  { key: "title", label: "Título", required: true },
  { key: "description", label: "Descripción" },
  { key: "category", label: "Categoría" },
  { key: "niche", label: "Nicho / para quién" },
  { key: "vendor", label: "Vendedor o tienda" },
  { key: "price", label: "Precio", number: true },
  { key: "currency", label: "Moneda" },
  { key: "commission_pct", label: "Comisión %", number: true },
  { key: "commission_amount", label: "Comisión en dinero", number: true },
  { key: "popularity", label: "Popularidad (gravity, ventas…)", number: true },
  { key: "epc", label: "EPC", number: true },
  { key: "rating", label: "Valoración", number: true },
  { key: "reviews", label: "Nº de reseñas", number: true },
  { key: "image_url", label: "Imagen (URL)" },
  { key: "product_url", label: "URL del producto" },
  { key: "affiliate_url", label: "URL de afiliado" },
  { key: "language", label: "Idioma" },
  { key: "country", label: "País" },
];

/** Pistas para emparejar solo: el nombre real de la columna manda. */
const HINTS: Record<string, string[]> = {
  external_id: ["aw_product_id", "product_id", "external_id", "sku", "item_id", "id"],
  title: ["product_name", "title", "name", "titulo", "nombre"],
  description: ["description", "descripcion", "product_description", "summary", "desc"],
  category: ["merchant_category", "category", "categoria", "product_type"],
  niche: ["niche", "nicho", "subcategory", "sub_category"],
  vendor: ["merchant_name", "vendor_name", "vendor", "shop_name", "seller", "brand", "store"],
  price: ["search_price", "price", "precio", "store_price", "display_price"],
  currency: ["currency", "moneda", "curr"],
  commission_pct: ["commission_pct", "commission_rate", "commission_percent", "comision_pct", "percent"],
  commission_amount: ["commission_amount", "avg_payout", "payout", "commission"],
  popularity: ["gravity", "popularity", "sales_count", "sales", "orders", "ventas", "rank"],
  epc: ["epc", "earnings_per_click", "avg_epc"],
  rating: ["rating", "average_rating", "stars", "valoracion"],
  reviews: ["reviews", "review_count", "num_reviews", "resenas"],
  image_url: ["merchant_image_url", "image_url", "large_image", "imagen", "thumbnail", "image"],
  product_url: ["merchant_deep_link", "product_url", "product_link", "landing_page", "destination_url", "pitch_page"],
  affiliate_url: ["aw_deep_link", "affiliate_url", "affiliate_link", "hoplink", "promolink", "tracking_link"],
  language: ["language", "idioma", "lang", "locale"],
  country: ["country", "pais", "market", "region"],
};

/** CSV con comillas, saltos dentro de campo y separador , o ; */
function parseCSV(text: string): Record<string, string>[] {
  const sep = (text.slice(0, 2000).match(/;/g)?.length ?? 0) > (text.slice(0, 2000).match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() ?? []).map(h => h.trim());
  return rows.filter(r => r.some(v => v.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** XML: toma el nodo que más se repite (el "item" del feed) y aplana sus hijos. */
function parseXML(text: string): Record<string, string>[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("El XML no se pudo leer");
  const counts = new Map<string, Element[]>();
  doc.querySelectorAll("*").forEach(el => {
    if (!el.children.length) return;
    const list = counts.get(el.tagName) ?? [];
    list.push(el);
    counts.set(el.tagName, list);
  });
  let best: Element[] = [];
  counts.forEach(list => { if (list.length > best.length) best = list; });
  return best.map(el => {
    const out: Record<string, string> = {};
    const walk = (node: Element, prefix = "") => {
      for (const child of Array.from(node.children)) {
        const key = prefix ? `${prefix}.${child.tagName}` : child.tagName;
        if (child.children.length) walk(child, key);
        else out[key] = (child.textContent ?? "").trim();
      }
      for (const attr of Array.from(node.attributes)) out[prefix ? `${prefix}@${attr.name}` : `@${attr.name}`] = attr.value;
    };
    walk(el);
    return out;
  });
}

const num = (v: string | undefined) => {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// La tabla aún no está en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("market_offers");

export default function AdminMercado() {
  const [source, setSource] = useState<Source>("clickbank");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ok: number; fail: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setDone(null);
    try {
      const text = await file.text();
      const parsed = /^\s*</.test(text) ? parseXML(text) : parseCSV(text);
      if (!parsed.length) throw new Error("El archivo no trae filas");
      const columns = Array.from(new Set(parsed.flatMap(r => Object.keys(r))));
      // Emparejado automático en dos pasadas: primero los nombres exactos de todos los
      // campos y solo después los parecidos, para que un "merchant_category" no se quede
      // con el puesto de "merchant_name". Una columna no se asigna dos veces.
      const auto: Record<string, string> = {};
      const usadas = new Set<string>();
      const lower = columns.map(c => [c, c.toLowerCase().replace(/[\s-]/g, "_")] as const);
      for (const f of FIELDS) {
        const hit = lower.find(([c, l]) => !usadas.has(c) && (HINTS[f.key] ?? []).includes(l));
        if (hit) { auto[f.key] = hit[0]; usadas.add(hit[0]); }
      }
      for (const f of FIELDS) {
        if (auto[f.key]) continue;
        const hit = lower.find(([c, l]) => !usadas.has(c) && (HINTS[f.key] ?? []).some(h => l.includes(h)));
        if (hit) { auto[f.key] = hit[0]; usadas.add(hit[0]); }
      }
      setRows(parsed); setCols(columns); setMap(auto);
      toast.success(`${parsed.length.toLocaleString("es")} filas leídas`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
    }
  };

  const preview = useMemo(() => rows.slice(0, 3).map(r => ({
    title: map.title ? r[map.title] : "", price: map.price ? r[map.price] : "", com: map.commission_pct ? r[map.commission_pct] : "",
  })), [rows, map]);

  const importar = async () => {
    if (!map.external_id || !map.title) { toast.error("Empareja al menos el ID y el título"); return; }
    setBusy(true); setDone(null);
    const extra = tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    let ok = 0, fail = 0;
    const payload = rows.map(r => {
      const out: Record<string, unknown> = { source, tags: extra, last_seen: new Date().toISOString() };
      for (const f of FIELDS) {
        const col = map[f.key];
        if (!col) continue;
        const raw = (r[col] ?? "").trim();
        if (!raw) continue;
        out[f.key] = f.number ? num(raw) : raw.slice(0, f.key === "description" ? 1200 : 400);
      }
      return out;
    }).filter(r => r.external_id && r.title);

    for (let i = 0; i < payload.length; i += 300) {
      const lote = payload.slice(i, i + 300);
      const { error } = await table().upsert(lote, { onConflict: "source,external_id" });
      if (error) { fail += lote.length; console.error(error); } else ok += lote.length;
    }
    setBusy(false); setDone({ ok, fail });
    if (ok) toast.success(`${ok.toLocaleString("es")} productos en el Mercado`);
    if (fail) toast.error(`${fail.toLocaleString("es")} filas fallaron`);
  };

  const borrarFuente = async () => {
    if (!window.confirm(`¿Borrar del Mercado todos los productos de ${source}?`)) return;
    const { error } = await table().delete().eq("source", source);
    if (error) toast.error("No se pudo borrar"); else toast.success("Productos borrados");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="font-display font-bold text-2xl text-foreground">Mercado · importar catálogo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sube el archivo que entrega la red de afiliados (CSV o XML). Se leen sus columnas, las emparejas una vez
          y cada carga nueva actualiza los productos que ya existen en vez de duplicarlos.
        </p>
      </header>

      <div className="card-surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["clickbank", "digistore24", "etsy", "manual"] as Source[]).map(s => (
            <button key={s} onClick={() => setSource(s)}
              className={`rounded-full border px-3.5 py-2 text-xs font-semibold capitalize ${source === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {s}
            </button>
          ))}
        </div>

        <input ref={fileRef} type="file" accept=".csv,.tsv,.xml,text/csv,text/xml,application/xml" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        <button onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/60 py-8 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <Upload className="w-6 h-6" />
          <span className="text-sm font-medium">Elegir archivo CSV o XML</span>
          <span className="text-xs">El feed diario de la red, tal cual lo descargas</span>
        </button>

        {rows.length > 0 && (
          <>
            <p className="text-sm text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              {rows.length.toLocaleString("es")} filas · {cols.length} columnas detectadas
            </p>

            <div className="grid sm:grid-cols-2 gap-2">
              {FIELDS.map(f => (
                <label key={f.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {f.label}{f.required && <span className="text-primary"> (obligatorio)</span>}
                  <select value={map[f.key] ?? ""} onChange={e => setMap(m => ({ ...m, [f.key]: e.target.value }))}
                    className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground">
                    <option value="">— sin usar —</option>
                    {cols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ))}
            </div>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Etiquetas para estos productos (separadas por comas). Usa <b className="text-foreground">black-friday</b> para que salgan en ese filtro.
              <input value={tags} onChange={e => setTags(e.target.value)} placeholder="black-friday, regalo"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </label>

            {preview.some(p => p.title) && (
              <div className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Así se verán las 3 primeras:</p>
                {preview.map((p, i) => <p key={i} className="truncate">· {p.title} {p.price && `· ${p.price}`} {p.com && `· ${p.com}%`}</p>)}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button onClick={importar} disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Importar al Mercado
              </button>
              <button onClick={borrarFuente} disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-red-400 hover:border-red-400/60">
                <Trash2 className="w-4 h-4" /> Borrar los de {source}
              </button>
            </div>

            {done && (
              <p className={`text-sm rounded-lg p-3 ${done.fail ? "bg-amber-500/10 text-amber-200" : "bg-emerald-500/10 text-emerald-300"}`}>
                {done.fail > 0 && <AlertTriangle className="w-4 h-4 inline mr-1 -mt-0.5" />}
                {done.ok.toLocaleString("es")} productos cargados{done.fail ? ` · ${done.fail.toLocaleString("es")} fallaron (mira la consola)` : ""}.
              </p>
            )}
          </>
        )}
      </div>

      <div className="card-surface rounded-2xl p-5 text-sm text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">De dónde sale cada archivo</p>
        <p><b className="text-foreground">ClickBank:</b> dentro de tu cuenta, el feed diario del marketplace (XML). Solo se descarga con la sesión abierta.</p>
        <p><b className="text-foreground">Awin (programa de afiliados de Etsy):</b> Toolbox → Create-a-Feed, elige categorías y descarga el CSV.</p>
        <p><b className="text-foreground">Digistore24:</b> exporta el marketplace desde tu cuenta de afiliado.</p>
        <p className="text-xs">Sube solo catálogos que tu programa de afiliados te autorice a usar. Cada carga actualiza los productos que ya estaban.</p>
      </div>
    </div>
  );
}
