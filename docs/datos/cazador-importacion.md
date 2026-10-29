# Importación de Cazador Swipe a SUPERNOVA (29-oct-2026)

Cazador Swipe es de Jean. Su catálogo alimenta el de SUPERNOVA. Esto es lo que se extrajo, lo que ya
tenemos y el plan para traer lo que falta. Nada de esto se subió a Supabase ni se desplegó.

## 1. Qué se extrajo

- **Fuente:** la app de Cazador carga todo de la API de su Supabase (`/rest/v1/offers`, 1 sola llamada de 1.000
  filas por página; `offer_funnels` está vacía). Se leyó con la sesión que Jean ya tenía abierta. No hizo falta
  recorrer pantalla por pantalla.
- **Total: 671 ofertas** (670 activas + 1 inactiva; Jean decía 669). Todas en
  `docs/datos/cazador-ofertas-2026-10-29.json` (completo: radar, descripción, checkout, imágenes) y un resumen en
  `docs/datos/cazador-ofertas-2026-10-29.csv`.
- **Orden:** primero las 28 de checkout WhatsApp, luego por anuncios de más a menos.
- **Nivel:** Cazador no lo guarda, lo calcula en pantalla. Se calculó con sus umbrales (Testeando hasta 19 anuncios
  y 14 días; Validando 20–49 o 15–29 días; Escalando 50–299 o 30+ días; Dominando 300+), tomando el mayor de
  anuncios y días al 29-oct. Resultado: Dominando 33, Escalando 333, Validando 265, Testeando 40. Las que no tienen
  fecha del anuncio más antiguo solo se miden por anuncios.
- **page_id:** sale de `view_all_page_id` en el enlace de la Biblioteca de anuncios. **570 ofertas lo tienen
  (494 page_id distintos**: hay 68 anunciantes con más de una oferta). Las otras **101 no tienen page_id**: Cazador
  las busca por palabra o dominio (`q=...`, columna `busqueda_biblioteca`). 55 enlaces traen además el id de un anuncio
  (`ad_id_biblioteca`).
- **Imágenes y videos:** solo URLs. 589 `imagen_url` + 27 `hero_image_url` (bucket público `offer-images` del Supabase
  de Cazador), 2 `vsl_url`, **0 videos** de anuncio (`creative_video_url` está vacío en todas). No se descargó ningún
  archivo: si quieres copiarlas a nuestro Storage hay que decidirlo aparte.
- **No hay anuncios sueltos:** Cazador solo guarda el enlace a la Biblioteca (no los ids de cada anuncio). Los anuncios
  reales los traemos nosotros de la API de Meta.
- Idioma y país: 653 son BR, 9 "LATAM", el resto US/FR/IT/MX. El campo `language` casi siempre viene vacío.

## 2. Cruce con nuestra base (solo lectura, sin tocar winning_ads)

Nuestra tabla `offers` tiene 14.364 filas, únicas por `(page_id, market)`.

| | Anunciantes (page_id) | Ofertas de Cazador |
|---|---|---|
| Con page_id | 494 | 570 |
| **Ya tenemos en `offers`** | **32** | 34 |
| **Faltan** | **462** | 536 |
| Sin page_id (búsqueda por palabra/dominio) | no aplica | 101 |

- De los 462 que faltan: 455 son de Brasil, 2 "LATAM", y 1 de cada uno de IT, MX, PT, AR; 1 FR.
- **WhatsApp:** 28 ofertas con checkout WhatsApp, **28 page_id distintos, 0 ya en `offers`** (ya tenemos 219 ofertas
  con canal whatsapp, pero ninguna es de estas). Si además cuentas las que Cazador pone con funnel WhatsApp son 32
  ofertas / 31 page_id. Ver la decisión que necesito en el punto 5.
- 56 de los 494 page_id tienen anuncios en `winning_ads`; 24 de ellos no llegan a ser oferta porque `refresh_offers`
  exige 3 anuncios o más y 14 días o más.

## 3. Plan para importar las que faltan por page_id

### Lo que ya existe y lo que limita
- `bulk-seed-ads` busca solo por palabra (`search_terms`). `offer-live-count` ya usa `search_page_ids` con la API
  oficial y el token de la bóveda (`get_fb_token`), así que Meta lo acepta con nuestro token.
- Meta pide un país: con `search_page_ids` el valor "ALL" devuelve 0 (anotado en `offer-live-count`). Se usa el país
  de Cazador (BR casi siempre; "LATAM" prueba MX, CO, AR, CL, PE).
- Una oferta nace cuando `refresh_offers()` (cron 11:30 UTC) agrupa `winning_ads` por `(page_id, market)` y hay 3+
  anuncios con 14+ días; ese filtro excluye el mercado "LATAM" (ver advertencia abajo). `refresh_offer_canal()` (11:50
  UTC) decide el canal mirando `winning_ads.dest_channel`.

### Solución elegida: función nueva `cazador-import` (sin tocar bulk-seed-ads)
Archivo: `supabase/functions/cazador-import/index.ts` (escrito, revisado con `deno check`, **sin desplegar**).

1. Lee los page_id (de un body `items` o, en modo diario, directo de la base de Cazador con 2 secretos que guarda
   Jean: `CAZADOR_SUPABASE_URL` y `CAZADOR_SUPABASE_KEY`, solo lectura).
2. Salta los que ya están en `offers`. Primero los de WhatsApp.
3. Por página pide a Meta `search_page_ids` + país + `ad_active_status=ACTIVE`, hasta 300 anuncios.
4. Guarda en `winning_ads` con las mismas columnas y reglas que `bulk-seed-ads` (mínimo 15 días, texto máximo 5.000
   caracteres, nunca `ad_snapshot_url` porque trae el token, upsert por `keyword,ad_url`). `keyword = cazador:<page_id>`
   para saber de dónde vino. Tope de 20 anuncios por página (los de más días primero) para no inflar la base.
5. No escribe en `offers`: al día siguiente `refresh_offers` y `refresh_offer_canal` los convierten en ofertas solos.
6. Compuerta: secreto de cron o sesión de Jean. Sin IA, sin proveedores de pago.

Prueba antes de usarla (con tu OK): `{"items":[…3 page_id…],"dry_run":true}` y revisar el conteo. Después una tanda
real de 40 con `limit`. Con 462 páginas son unas 12 vueltas de 40 (o cron con `limit:40` cada hora). Cada vuelta tarda
menos de 2 minutos.

### Alternativa pedida: que `bulk-seed-ads` acepte `search_page_ids`
Si prefieres tocar esa función en vez de la nueva, el cambio es pequeño. En el armado de trabajos:

```ts
// body.page_ids?: string[]  → un trabajo por (page_id, país); sin page_ids sigue igual que hoy
const pageIds: string[] = Array.isArray(body.page_ids) ? body.page_ids.filter((x: unknown) => /^\d{5,20}$/.test(String(x))) : [];
const jobs: { kw: string; country: string; pid?: string }[] = pageIds.length
  ? pageIds.flatMap((pid) => countries.map((c) => ({ kw: `page:${pid}`, country: c, pid })))
  : /* el armado actual keyword × país */;
// y al construir la URL:
if (job.pid) url.searchParams.set("search_page_ids", JSON.stringify([job.pid]));
else url.searchParams.set("search_terms", kw);
```
Más: pasar `country` único por page_id (si no, hace 13 países por cada uno) y aceptar un mapa `whatsapp_page_ids` para
`dest_channel`. Es el mismo trabajo que ya hace `cazador-import` y mezcla un cambio en el pipeline de producción, por eso
elegí la función aparte (el manual pide tu OK para tocar `bulk-seed-ads`).

### Canal WhatsApp
`offers.canal` lo recalcula `refresh_offer_canal()` cada día y **pisaría un UPDATE directo**. Por eso no se marca
`offers.canal` a mano: `cazador-import` guarda `dest_channel = 'whatsapp'` en los anuncios importados de las páginas que
Cazador marca como WhatsApp (si el dominio visible del anuncio dice página o mensajes, gana el dominio y se cuenta en
`conflictos_canal`). Con eso `refresh_offer_canal` deja `canal = 'whatsapp'` y no lo revierte. Las 28 de checkout
WhatsApp quedarían marcadas al día siguiente de importarse. Cazador, a su vez, es dato propio de Jean, no una
invención nuestra: sigue valiendo "sin dato = NULL".

### Riesgos y cosas a vigilar
- **Espacio (plan Free, 500 MB):** 462 páginas × 20 anuncios ≈ 9.000 filas nuevas (unos 20 a 45 MB con texto). Revisar
  el tamaño de la base antes de la primera tanda; si no alcanza, subir `min_days` o bajar `max_ads_por_pagina`.
- **Páginas sin anuncios activos** en Meta (Cazador se actualiza antes que nosotros): se cuentan en
  `paginas_sin_anuncios` y se reintentan cada día. Si son muchas, conviene guardar un caché de "sin anuncios hasta fecha".
- **LATAM:** `refresh_offers` excluye `market = 'LATAM'`; la función guarda el país real donde encontró anuncios
  (MX, CO…), así que no se pierden.
- **Duplicados con páginas que ya tienen anuncios nuestros (24 page_id):** la fila lleva otro `keyword`, y entra un
  duplicado de cada anuncio. Es poco; si molesta, se agrega una consulta que salte los ad_url ya presentes.
- **Las 101 sin page_id** no se pueden traer por page_id. Se pueden resolver con `search_terms` (el texto `q=` o el
  dominio de venta) o sacar el page_id abriendo la Biblioteca. No hecho.
- **Imágenes de Cazador:** son su `offer-images` público; si SUPERNOVA las muestra directo, depende de que ese bucket
  siga online. Copiar a nuestro Storage cuesta espacio (Free); decisión pendiente.
- Las notas de "radar" de Cazador (`radar` en el JSON: por qué llamó la atención, qué modelaría, cómo adaptar a LATAM)
  vienen vacías en casi todas. No hay mucho que aprovechar.

## 4. Qué NO se hizo
No se subió nada a Supabase ni a Cazador, no hay migraciones, commit ni deploy. La función no está desplegada. No se
tocó `src/`. Se consultó solo `offers` (índices y conteos por lista de page_id) y `winning_ads` con un `IN` sobre el
índice de `page_id`, sin `select *` ni `count exact`.

## 5. Decisiones que necesito de Jean
1. **Despliegue y prueba** de `cazador-import` (primero `dry_run` con 3 page_id).
2. **WhatsApp:** ¿solo las 28 con checkout WhatsApp, o también las 3–4 con funnel WhatsApp (32 en total)?
3. **Modo diario:** si quieres que se importe solo cada día, guarda en secretos de Supabase `CAZADOR_SUPABASE_URL`
   y `CAZADOR_SUPABASE_KEY` (una llave de solo lectura de Cazador; yo no la escribo ni la pido en chat).
4. **Espacio:** ¿importamos las 462 con 20 anuncios cada una, o empezamos por WhatsApp + Dominando/Escalando?
5. ¿Copiamos las imágenes de Cazador a nuestro Storage?
