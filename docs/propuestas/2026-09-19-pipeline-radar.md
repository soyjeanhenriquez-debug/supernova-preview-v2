# Propuesta: pipeline de datos del Radar (pendiente de aprobar)

Salió de la prueba de usuario del 19-sep-2026. **Nada de esto está aplicado**: son cambios
sobre datos y tareas automáticas de producción, así que esperan el visto bueno de Jean.

## Lo que se encontró (medido en producción)

1. **Desde el 14 de julio no entra ningún anuncio real.** Los 70 966 anuncios de la Biblioteca
   de Meta se cargaron entre el 12 y el 14 de julio (siembra manual con `bulk-seed-ads`). La
   rotación horaria (`master-rotate` -> `search-winning-ads`) no usa la API de Meta: hace una
   búsqueda web con Firecrawl (`site:facebook.com OR site:instagram.com`) y guarda páginas sueltas
   como si fueran anuncios: anunciante "instagram", "facebook", "help", "m"… Son 8 417 filas
   (10 % de la tabla), ~600 al día, y cada hora gasta créditos de Firecrawl.
   La pantalla del Radar ya las oculta (solo muestra filas con fecha de inicio real).
2. **"Días activo" se calcula hasta hoy**, no hasta la última vez que se vio el anuncio. Un
   anuncio apagado en julio sigue sumando días. Afecta a Radar, Ofertas y Hooks.
3. **`score_unscored_ads()` reescribe los 79 000 anuncios cada hora** (UPDATE sin WHERE): 1,9 M de
   filas muertas al día. De ahí la hinchazón (206 MB de tabla para ~70 MB de datos).
4. **La base pesa 704 MB y el plan es Free (límite 500 MB, sin copias de seguridad).** 664 MB son
   `winning_ads`: cada anuncio guarda su texto DOS veces (`ad_description` es copia exacta de
   `ad_body`) y el 12 % de las filas son anuncios-novela de ~26 000 caracteres.
5. Un `VACUUM FULL` de esa tabla no termina en los 120 s que permite el plan (se intentó una vez
   a las 18:10 UTC del 19-sep; se canceló solo, sin cambios, con la tabla bloqueada 2 minutos).

## Propuesta, en orden

1. **Subir Supabase a Pro** antes de vender (8 GB, copias diarias, sin pausas por inactividad,
   protección de contraseñas filtradas). Es lo único que no se arregla con código.
2. **Puntuación horaria solo sobre filas que cambian** (SQL abajo; comprobado: da exactamente los
   mismos valores que hoy en las 79 383 filas, 0 diferencias).
3. **Rotación horaria contra la API de Meta** (gratis, anuncios reales): `master-rotate` llama a
   `bulk-seed-ads` con 4–6 palabras × ES, MX, AR, CO, BR, US, `limit` 50, refrescando también
   los anuncios ya conocidos (`scraped_at` = última vez visto activo). Dejar de llamar a
   `search-winning-ads`. Parche de los scrapers abajo (tope de 5 000 caracteres por texto y
   `ad_description` = NULL).
4. Con una vuelta completa de la rotación (~2–3 días): "días activo" hasta la última vez visto,
   aviso "visto activo hace N días" y retirar del catálogo lo que lleve >30 días sin verse.
5. Limpieza (irreversible, decide Jean): borrar las 8 417 filas de relleno, poner
   `ad_description = NULL` donde es copia de `ad_body`, recortar textos a 5 000 caracteres y
   entonces sí `VACUUM FULL` (con ~70 MB vivos termina en segundos). Deja la base en ~200 MB.
6. Idioma real del anuncio: hoy el filtro "Idioma" filtra por PAÍS (con "Español" salen anuncios en
   inglés o vietnamita que corrieron en ES/MX). Ya existe `guess_lang()` para las ofertas.

## SQL pendiente: puntuación solo donde cambia

```sql
-- SUPERNOVA — La puntuación horaria deja de reescribir la tabla entera.
--
-- score_unscored_ads() (cron, cada hora) hacía UPDATE sobre los 79 000 anuncios SIN
-- WHERE: cada hora se reescribía toda la tabla aunque no cambiara nada (1,9 millones de
-- filas muertas al día). Es de donde salía la hinchazón (206 MB para ~70 MB de datos),
-- el disco ocupado y parte de la lentitud del Radar.
-- Misma fórmula, mismos resultados: ahora solo se tocan las filas cuyo valor cambia
-- (los días suben una vez al día, no 24).

CREATE OR REPLACE FUNCTION public.score_unscored_ads()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_updated INTEGER;
BEGIN
  -- 1) refrescar la señal de escala real (ads activos por anunciante)
  PERFORM public.recompute_advertiser_scale();

  -- 2) re-puntuar con la fórmula unificada, solo donde el resultado cambia
  WITH calc AS (
    SELECT w.id,
           GREATEST(1, COALESCE(EXTRACT(DAY FROM now() - w.delivery_start_time)::int, w.days_active, 1)) AS d,
           COALESCE(w.duplicate_count, 1) AS dup
    FROM public.winning_ads w
  ),
  scored AS (
    SELECT id, d,
           -- longevidad (0-50): 60 días = tope  +  escala del anunciante (0-50): 30+ ads = tope
           LEAST(100, GREATEST(1, LEAST(50, d * 50 / 60) + LEAST(50, dup * 50 / 30))) AS s
    FROM calc
  ),
  upd AS (
    UPDATE public.winning_ads w
    SET days_active  = s.d,
        winner_score = s.s,
        tier = CASE WHEN s.s >= 75 THEN 'mega' WHEN s.s >= 50 THEN 'rising' ELSE 'solid' END
    FROM scored s
    WHERE w.id = s.id
      AND (w.days_active  IS DISTINCT FROM s.d
        OR w.winner_score IS DISTINCT FROM s.s
        OR w.tier IS DISTINCT FROM (CASE WHEN s.s >= 75 THEN 'mega' WHEN s.s >= 50 THEN 'rising' ELSE 'solid' END))
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.score_unscored_ads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.score_unscored_ads() TO service_role;
```

## Parche pendiente: scrapers

```diff
diff --git a/supabase/functions/bulk-seed-ads/index.ts b/supabase/functions/bulk-seed-ads/index.ts
index 00141b9..22c37f6 100644
--- a/supabase/functions/bulk-seed-ads/index.ts
+++ b/supabase/functions/bulk-seed-ads/index.ts
@@ -232,7 +232,9 @@ Deno.serve(async (req) => {
         if (r.err) { totalErrors++; continue; }
         totalFetched += r.items.length;
         for (const it of r.items) {
-          const body = (it.ad_creative_bodies?.[0] ?? "").toString();
+          // Tope de 5 000 caracteres: hay anuncios-novela de 35 000 que inflaban la base
+          // (el 12 % de las filas pesaba el 85 % de la tabla) sin que nada los use enteros.
+          const body = (it.ad_creative_bodies?.[0] ?? "").toString().slice(0, 5000);
           const title = (it.ad_creative_link_titles?.[0] ?? it.page_name ?? "Anuncio").toString();
           // `ad_snapshot_url` trae nuestro access_token pegado: jamás se guarda
           // (estas filas las leen los usuarios). Misma forma que las filas ya
@@ -253,7 +255,7 @@ Deno.serve(async (req) => {
             page_id: it.page_id ?? null,
             page_name: it.page_name ?? null,
             ad_title: title,
-            ad_description: body,
+            ad_description: null, // era una copia exacta de ad_body: el doble de espacio para nada
             ad_body: body,
             ad_url: adUrl,
             platform: "Meta",
diff --git a/supabase/functions/search-winning-ads/index.ts b/supabase/functions/search-winning-ads/index.ts
index c24d500..9075641 100644
--- a/supabase/functions/search-winning-ads/index.ts
+++ b/supabase/functions/search-winning-ads/index.ts
@@ -100,7 +100,7 @@ serve(async (req) => {
                   page_id: extractAdvertiser(item.url || ""),
                   page_name: extractAdvertiser(item.url || ""),
                   ad_title: item.title || "Sin título",
-                  ad_description: body,
+                  ad_description: null, // era una copia exacta de ad_body
                   ad_body: body,
                   ad_url: item.url || "",
                   platform: platforms[0] === "facebook" ? "Meta" : "Web",
```
