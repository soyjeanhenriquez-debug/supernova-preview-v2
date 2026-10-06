// SUPERNOVA — Clonar un carrusel viral con su ADN ganador (05-oct-2026, aprobado por Jean: 15 créditos).
//
// { url, brief, goal?, handle? } → usuario real + cobro ANTES de gastar (clone_carousel en
// credit_prices) → Apify trae las láminas de la publicación pública de Instagram → Gemini 3 Flash
// las MIRA y saca su ADN (≈9 partes), elige las 3 que explican por qué funcionó, y escribe una versión
// nueva para el producto de la persona: mantiene esas 3, cambia todo lo demás y la mejora con la
// fórmula de 6 posiciones. Si algo falla después de cobrar, se devuelve el crédito.
//
// "Roba como un artista" (manual, sección 2): se copia estructura y mecanismo, NUNCA textos, fotos,
// caras, nombres ni marcas. Las imágenes del original solo se usan para el análisis: no se guardan.
// La llave de Apify va en la cabecera (nunca en la URL, para que no quede en logs).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { admin, billingHeaders, caller, charge, json, refund } from "../_shared/media.ts";

const FN = "carousel-clone";
const MODEL = "gemini-3-flash-preview";
const MAX_IMAGES = 10;
const MAX_IMG_BYTES = 3 * 1024 * 1024;
const POST_RE = /^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?p\/([A-Za-z0-9_-]{5,40})\/?(?:\?.*)?$/;

const clean = (s: unknown, n: number) => (typeof s === "string" ? s : "").replace(/\s+/g, " ").trim().slice(0, n);

function b64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// deno-lint-ignore no-explicit-any
async function fetchPost(url: string, token: string): Promise<any | null> {
  const r = await fetch("https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=50", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ directUrls: [url], resultsType: "posts", resultsLimit: 1 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) { console.error(`${FN}: apify`, r.status, (await r.text()).slice(0, 200)); return null; }
  const items = await r.json();
  return Array.isArray(items) && items[0] && !items[0].error ? items[0] : null;
}

const SYSTEM = `Eres el director creativo de SUPERNOVA. Analizas carruseles de Instagram que ya funcionan y creas versiones nuevas para emprendedores latinos que empiezan de cero, con el método "Roba como un artista" y el "ADN ganador":
- Todo carrusel se descompone en unas 9 partes. Si se mantienen todas, es una copia. Según el modo que se te pida: en "mismo tema" se conservan el tema, las ideas y la estructura (reescritos con tus palabras); en "producto" se mantienen SOLO las 3 partes que explican por qué funcionó y se cambia todo lo demás.
- Clonar lo que funciona es la base (no se reinventa la rueda). Lo único que no se hace es copiar y pegar en el mismo idioma, traducir palabra por palabra, ni usar sus fotos, su cara, su nombre, su marca, sus números ni sus recursos.
- La versión nueva debe ser MEJOR que el original: aplica la fórmula de 6 posiciones (apertura que crea un deseo, agarre en la lámina 2 que responde solo la portada, columna donde cada lámina abre la siguiente, ritmo corta/densa, giro "Para que puedas…", remate con creencia nueva + UNA acción) y que cada lámina lleve algo real (ejemplo, comparación, regla con veredicto).
Español neutro latinoamericano, de tú, frases cortas, sin jerga. Sin emojis en las láminas; en el pie, solo si el original los usa (los mismos en el mismo lugar). Prohibido: promesas de ingresos o de resultados, plazos, testimonios, cifras o estudios inventados, urgencia falsa, marcas ajenas, personas famosas.
Respondes SOLO con el JSON pedido.`;

// Dos formas de clonar (06-oct-2026, Jean: "la referencia tiene que servir"):
//  · "tema": transcreación fiel: el mismo tema, las mismas ideas y el mismo remate de cada lámina, en el
//    mismo orden y estructura, adaptado al español latino ("Clonar con arte" del manual: de otro idioma
//    se sigue de cerca; no se copia y pega en el mismo idioma ni se traduce palabra por palabra).
//  · "producto": su ADN (3 partes) aplicado al producto de la persona; todo lo demás cambia.
const TEMA_STEP = (n: number) => [
  `PASO 3 · TU CLON EN ESPAÑOL (ESPEJO, 06-oct-2026, Jean: "el clon debe parecerse al 97 % a lo que ya funcionó"). Escribe un carrusel de ${n + 1} láminas que sea el ESPEJO del original: el MISMO tema, el MISMO gancho, las MISMAS ideas, el MISMO número de láminas, en el MISMO orden, con la MISMA composición de cada lámina y el MISMO remate. No reinventes nada: si el original funciona, se repite su receta.`,
  "PORTADAS: la portada 1 es el gancho del original. Si está en otro idioma, transcréalo fiel (la misma promesa, el mismo remate, en español latino natural). Si ya está en español, conserva su estructura y casi sus mismas palabras con un toque propio (un sinónimo, un orden mejor), nunca idéntico. Las portadas 2 y 3 son variantes del MISMO gancho (otra forma de decir lo mismo), nunca otro tema. 'recomendada' = 0. El producto de la persona NUNCA va en la portada.",
  "LÁMINAS: lámina por lámina, la misma idea y el mismo tipo de contenido que la lámina del original en esa posición. Si el original muestra una cuadrícula de fotos o ejemplos con etiquetas, usa el tipo 'galeria' con los mismos elementos: si las etiquetas son comandos, atajos, nombres de herramientas o términos técnicos que funcionan tal cual (ej. '/droneview'), se conservan iguales porque son la utilidad; si son frases, se transcrean. No fuerces los tipos respuesta o giro si el original no los tiene.",
  "PIE: el ESPEJO del pie original: misma apertura, mismos beneficios, misma mecánica de llamada (si pide comentar una palabra, se pide comentar una palabra equivalente) y hashtags del mismo tema, reescrito con sus propias palabras en español latino (nunca copiar y pegar).",
  "REMATE: la misma mecánica del original (comentar una palabra, guardar, seguir…) y el mismo tipo de regalo (ej. 'el listado completo'), que la persona entrega ella misma. Nunca su nombre, su cuenta, su marca ni sus números.",
  "SIRVE PARA CUALQUIER CARRUSEL: mira cómo está construido y repite esa construcción. Si cada lámina es una escena (de una película, una serie, un viaje, una historia), cada lámina lleva su 'escena' para que la IA de imagen la cree con la persona o con personajes propios (nunca actores, personajes ni fotogramas reales: se recrea la idea). Si son capturas de una app, frases sobre fondo, antes/después o un producto, usa el tipo de lámina que más se parezca y explica en 'necesitas' qué captura o qué foto debe poner.",
  "NECESITAS: todo lo que la persona debe tener para que su clon se vea y funcione igual, en frases cortas y concretas, en este orden: 1) las fotos (ej. 'Una foto tuya de cuerpo entero, de frente y con buena luz: la IA la usa para crear cada toma'); 2) capturas o pruebas propias si el original las usa; 3) si el remate promete un regalo (un listado, una guía, una plantilla), 'Prepara <ese regalo> para mandarlo por mensaje a quien comente <PALABRA>'. Nunca se usan las fotos del original.",
  "Mejóralo solo donde suma (legibilidad, orden, una palabra más clara); en 'mejoras' explica 3 cosas concretas. En 'mantener' marca las 3 partes del ADN más importantes.",
].join("\n");

function userPrompt(o: { mode: "tema" | "producto"; brief: Record<string, string>; goal: string; handle: string; world: string; line: string; caption: string; owner: string; likes: number | null; comments: number | null; n: number }): string {
  const slides = Math.min(9, Math.max(4, o.n - 1));
  return [
    `Te paso, en orden, las ${o.n} láminas de un carrusel de Instagram${o.owner ? ` de @${o.owner}` : ""}${o.likes != null ? ` (${o.likes} me gusta, ${o.comments ?? 0} comentarios)` : ""}.`,
    o.caption ? (o.mode === "tema"
      ? `Pie de publicación original (haz su espejo en español con tus palabras; nunca copiar y pegar): """${o.caption}"""`
      : `Pie de publicación original (solo para entender la idea; NO lo copies): """${o.caption}"""`) : "",
    "",
    "PASO 1 · RADIOGRAFÍA. Para cada lámina: su posición en la historia (apertura, agarre, columna, giro o remate), su composición (cómo está armada: dónde va el texto grande, si hay foto, tarjetas, etc.), su artefacto (ejemplo, comparación, regla…) y su idea con TUS palabras (no copies el texto). Luego por qué funciona en 2 o 3 frases, y su estilo: 3 colores en hex, cómo es la letra, cuál de estos estilos se le parece más (poster = sans negra gruesa + serifa en cursiva; editorial = serifa de revista; moderno = sans geométrica; impacto = condensada en mayúsculas; elegante = serifa fina) y si empieza claro u oscuro.",
    "PASO 2 · ADN. Descompón el carrusel en 9 partes (id a1 a a9). Marca con importa=true y pon en 'mantener' EXACTAMENTE las 3 que más explican por qué funcionó. Solo patrones, nunca contenido literal.",
    o.mode === "tema" ? TEMA_STEP(slides) : `PASO 3 · TU VERSIÓN. Escribe un carrusel NUEVO de ${slides + 1} láminas para este producto, que mantiene esas 3 partes y cambia todo lo demás. Debe ser mejor que el original: en 'mejoras' explica 3 cosas concretas que hiciste mejor.`,
    o.mode === "tema" ? "El producto de la persona NO cambia el tema: como mucho aparece en una línea del remate si encaja. Todo el carrusel es el tema del original." : o.goal === "ensenar" ? "Objetivo: enseñar algo útil del tema del producto para que lo guarden y lo compartan." : "Objetivo: que quieran el producto; el remate conecta la creencia nueva con escribir una palabra clave.",
    "",
    "TIPOS DE LÁMINA (el diseño ya existe; tú solo llenas el texto):",
    "- respuesta: la lámina 2, responde SOLO la portada. titulo + texto.",
    "- problema: 3 items (titulo 2-5 palabras + texto ≤12 palabras) + veredicto.",
    "- comparacion: 2 items: el primero lo que NO funciona, el segundo lo que SÍ (titulo = etiqueta como NO/SÍ, DÉBIL/FUERTE, ANTES/DESPUÉS; texto ≤18 palabras) + veredicto.",
    "- solucion: titulo + texto ≤30 palabras + veredicto.",
    "- tarjetas: 4 items (titulo 1-4 palabras + texto ≤10 palabras) + veredicto.",
    "- pasos: 3 items en orden + veredicto.",
    "- regla: para carruseles de 'reglas', 'claves' o 'estilos': pastilla ('Regla 1', 'Clave 2'…), titulo = 1 o 2 palabras GIGANTES, texto = una frase ≤10 palabras, veredicto ≤14 palabras (o una acción corta, como 'Busca \"…\"'), escena = foto de ejemplo para esa regla. Opcional: items = 3 líneas muy cortas (qué hace, cuándo usarlo, cuándo no), si el original las tiene.",
    "- galeria: una cuadrícula de 4 a 9 fotos o ejemplos con etiqueta (como el original). titulo = el encabezado de la lámina (puede ir vacío si el original no tiene), items = cada celda en orden: titulo = la etiqueta tal como se ve (≤22 caracteres), texto = qué muestra esa foto, para que la IA de imagen la cree (≤18 palabras). escena = qué tienen en común todas las fotos (la misma persona, el mismo lugar, la misma ropa).",
    "- giro: la penúltima, 'Para que puedas…', ≤14 palabras.",
    "- llamada: la última. titulo = la creencia nueva; palabra = UNA palabra clave en MAYÚSCULAS conectada con esa creencia; texto = qué recibe al comentarla; items = 1 recordatorio.",
    "Cada lámina (menos llamada y giro) lleva 'puente' (≤7 palabras, abre la siguiente) y 'peso' (corta o densa; nunca dos iguales seguidas). Marca 1 o 2 palabras de cada titular entre *asteriscos*. 'escena' (opcional en todas, obligatoria en regla) = una foto cinematográfica SIN texto que muestre la idea: personas latinas comunes, sin famosos, sin marcas, sin dinero.",
    "'objeto' = un objeto de la historia que invade el primer plano de la portada en perspectiva 3D (mano, teléfono, libreta…), enorme hacia la cámara. 'plantilla' = hero (agresiva, frases fuertes), editorial (crema y negro, marca personal premium) o cinematica (historias, con aire). Copia la GRAMÁTICA visual del original, nunca sus fotos.",
    o.mode === "tema" ? "PORTADAS: 3 versiones del MISMO gancho del original (titulo hasta 9 palabras, subtitulo ≤12, pastilla en MAYÚSCULAS, por_que = qué desea quien la lee). 'escena' de portada = la misma composición del original con la persona de su foto." : "PORTADAS: 3 distintas (titulo 3 a 5 palabras, subtitulo ≤12, pastilla en MAYÚSCULAS, por_que = qué desea quien la lee). 'escena' de portada = metáfora visual del deseo.",
    "'revelar' = lista oculta de 3 a 6 elementos solo si la respuesta es una lista; si no, vacío.",
    "",
    `PRODUCTO: ${clean(o.brief.product, 200)}.`,
    clean(o.brief.who, 200) ? `PÚBLICO: ${clean(o.brief.who, 200)}.` : "",
    clean(o.brief.promise, 200) ? `LO QUE LOGRA: ${clean(o.brief.promise, 200)}.` : "",
    clean(o.brief.price, 30) ? `PRECIO REAL: ${clean(o.brief.price, 30)}.` : "",
    o.handle ? `CUENTA: @${o.handle}.` : "",
    o.line ? `FRASE DE LA MARCA (úsala tal cual en el remate): «${o.line}».` : "",
    o.world ? `MUNDO DE LA MARCA (todas las escenas ocurren aquí): ${o.world}.` : "",
    "",
    "RESPONDE SOLO con JSON válido con esta forma:",
    `{"analisis":{"resumen":"","gancho_original":"","por_que_funciona":"","laminas":[{"n":1,"posicion":"","composicion":"","artefacto":"","idea":""}],"estilo":{"colores":["#000000","#000000","#000000"],"letra":"","estilo_cercano":"poster","empieza":"claro","fotos":""}},"adn":[{"id":"a1","parte":"","que_es":"","importa":false,"por_que":""}],"mantener":["a1","a2","a3"],"mejoras":["","",""],"necesitas":[],"carrusel":{"idea":"","portadas":[{"titulo":"","subtitulo":"","pastilla":"","por_que":""}],"recomendada":0,"revelar":[],"etiquetas":["","",""],"escena":"","objeto":"","plantilla":"editorial","laminas":[{"tipo":"respuesta","peso":"","etiqueta":"","titulo":"","texto":"","items":[],"veredicto":"","puente":"","palabra":"","pastilla":"","escena":""}],"pie":""}}`,
    o.mode === "tema"
      ? `"carrusel.laminas" trae ${slides} elementos (la portada va aparte), uno por cada lámina del original después de su portada, en el mismo orden; la última es de tipo llamada. 'gancho_original' = el texto de la portada del original tal como se lee (solo para mostrarlo al lado del clon).`
      : `"carrusel.laminas" trae ${slides} elementos (la portada va aparte), con la primera de tipo respuesta, la penúltima giro y la última llamada.`,
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let txId: string | null = null;
  try {
    const who = await caller(req);
    if (!who) return json({ error: "Inicia sesión para usar esta función." }, 401);
    const raw = await req.text();
    if (raw.length > 6000) return json({ error: "La solicitud es demasiado grande." }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const m = POST_RE.exec(String(body.url ?? "").trim());
    if (!m) return json({ error: "Pega el enlace de una publicación de Instagram (instagram.com/p/…)." }, 400);
    const url = `https://www.instagram.com/p/${m[1]}/`;
    const b = body.brief && typeof body.brief === "object" ? body.brief : {};
    const brief = { product: clean(b.product, 200), who: clean(b.who, 200), promise: clean(b.promise, 200), price: clean(b.price, 30) };
    if (brief.product.length < 3) return json({ error: "Falta tu producto." }, 400);
    const goal = body.goal === "ensenar" ? "ensenar" : "vender";
    const mode: "tema" | "producto" = body.mode === "producto" ? "producto" : "tema";
    const handle = clean(body.handle, 30).replace(/[^A-Za-z0-9._]/g, "");
    const world = clean(body.world, 160);
    const line = clean(body.line, 80);
    const apify = Deno.env.get("APIFY_TOKEN");
    const gemini = Deno.env.get("GEMINI_API_KEY");
    if (!apify || !gemini) return json({ error: "Esta función llega pronto.", pronto: true }, 503);

    const g = await charge(FN, who.id, "clone_carousel", `Clonar carrusel · ${m[1]}`, 6, 30);
    if (g instanceof Response) return g;
    txId = g.txId;

    // 1) Traer la publicación.
    const post = await fetchPost(url, apify);
    const db = admin();
    await db.rpc("log_ai_usage", { p_user_id: who.id, p_fn: FN, p_model: "apify/instagram-scraper", p_input: 0, p_output: 0, p_images: 1 });
    if (!post) {
      await refund(txId, "apify sin resultado");
      return json({ error: "No pudimos abrir esa publicación. Revisa que sea pública. No se te cobró." }, 502);
    }
    const urls: string[] = (Array.isArray(post.images) && post.images.length ? post.images
      : Array.isArray(post.childPosts) ? post.childPosts.map((c: { displayUrl?: string }) => c.displayUrl) : [])
      .filter((u: unknown): u is string => typeof u === "string" && u.startsWith("https://")).slice(0, MAX_IMAGES);
    if (post.type !== "Sidecar" || urls.length < 2) {
      await refund(txId, "no es carrusel");
      return json({ error: "Esa publicación no es un carrusel (tiene una sola imagen o es un video). No se te cobró." }, 422);
    }

    // 2) Bajar las láminas (solo para el análisis; no se guardan).
    const got = await Promise.all(urls.map(async u => {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(15_000) });
        const type = (r.headers.get("content-type") ?? "").split(";")[0];
        const bytes = new Uint8Array(await r.arrayBuffer());
        return r.ok && /^image\/(jpeg|png|webp)$/.test(type) && bytes.byteLength <= MAX_IMG_BYTES ? `data:${type};base64,${b64(bytes)}` : null;
      } catch { return null; }
    }));
    // En orden; se sigue con las que bajaron.
    const parts = got.filter((x): x is string => !!x).map(url => ({ type: "image_url" as const, image_url: { url } }));
    if (parts.length < 2) {
      await refund(txId, "no bajaron las imágenes");
      return json({ error: "No pudimos leer las láminas de ese carrusel. No se te cobró: inténtalo de nuevo." }, 502);
    }

    // 3) Analizar y clonar con su ADN.
    const ai = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${gemini}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 12_000, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: [{ type: "text", text: userPrompt({ mode, brief, goal, handle, world, line, caption: clean(post.caption, 1500), owner: clean(post.ownerUsername, 40), likes: Number.isFinite(post.likesCount) ? post.likesCount : null, comments: Number.isFinite(post.commentsCount) ? post.commentsCount : null, n: parts.length }) }, ...parts] },
        ],
      }),
      signal: AbortSignal.timeout(85_000),
    });
    if (!ai.ok) {
      console.error(`${FN}: gemini`, ai.status, (await ai.text()).slice(0, 300));
      await refund(txId, `gemini ${ai.status}`);
      return json({ error: "La IA no pudo analizar el carrusel ahora. No se te cobró: inténtalo de nuevo." }, 502);
    }
    const out = await ai.json();
    const text = out?.choices?.[0]?.message?.content;
    const usage = out?.usage ?? {};
    await db.rpc("log_ai_usage", { p_user_id: who.id, p_fn: FN, p_model: MODEL, p_input: usage.prompt_tokens ?? 0, p_output: usage.completion_tokens ?? 0, p_images: 0 });
    let result: Record<string, unknown> | null = null;
    try { result = typeof text === "string" ? JSON.parse(text.replace(/```(?:json)?/gi, "").trim()) : null; } catch { result = null; }
    if (!result || typeof result.carrusel !== "object") {
      await refund(txId, "json inválido");
      return json({ error: "La IA respondió en un formato raro. No se te cobró: inténtalo de nuevo." }, 502);
    }

    // 4) Guardarlo para aprender (Admin → Aprendizaje): solo texto, nunca las fotos del original.
    let cloneId: string | null = null;
    try {
      const an = (result.analisis ?? {}) as Record<string, unknown>;
      const car = (result.carrusel ?? {}) as Record<string, unknown>;
      const slidesOut = Array.isArray(car.laminas) ? car.laminas as Record<string, unknown>[] : [];
      const { data: row } = await db.from("carousel_clones").insert({
        user_id: who.id, url, mode,
        owner: clean(post.ownerUsername, 40) || null,
        likes: Number.isFinite(post.likesCount) ? post.likesCount : null,
        comments: Number.isFinite(post.commentsCount) ? post.commentsCount : null,
        hook: clean(an.gancho_original, 200) || null,
        summary: clean(an.resumen, 300) || null,
        why: clean(an.por_que_funciona, 600) || null,
        analysis: {
          laminas: Array.isArray(an.laminas) ? (an.laminas as unknown[]).slice(0, 10) : [],
          estilo: an.estilo ?? null,
          adn: Array.isArray(result.adn) ? (result.adn as unknown[]).slice(0, 12) : [],
          mantener: result.mantener ?? [],
          necesitas: Array.isArray(result.necesitas) ? (result.necesitas as unknown[]).slice(0, 6) : [],
          caption: clean(post.caption, 600),
        },
        result: {
          portadas: Array.isArray(car.portadas) ? (car.portadas as Record<string, unknown>[]).slice(0, 3).map(c => clean(c?.titulo, 120)) : [],
          tipos: slidesOut.map(l => clean(l?.tipo, 20)),
          palabra: clean(slidesOut.at(-1)?.palabra, 20),
        },
      }).select("id").single();
      cloneId = row?.id ?? null;
    } catch (e) { console.error(`${FN}: guardar clon`, e); }

    return json({
      ...result,
      clone_id: cloneId,
      source: {
        url, images: urls, owner: clean(post.ownerUsername, 40),
        likes: Number.isFinite(post.likesCount) ? post.likesCount : null,
        comments: Number.isFinite(post.commentsCount) ? post.commentsCount : null,
      },
      billing: { charged: g.charged, balance: g.balance },
    }, 200, billingHeaders(g));
  } catch (e) {
    await refund(txId, "excepción");
    console.error(`${FN}:`, e);
    return json({ error: "No se pudo clonar el carrusel. No se te cobró." }, 500);
  }
});
