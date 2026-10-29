-- Más ofertas de WhatsApp y su tamaño real (28/29-oct-2026, Jean: «ampliar el catálogo de WhatsApp»; «send WhatsApp
-- o enviar WhatsApp o referencias a enviar mensaje a WhatsApp en cualquier idioma»; «tienen pocos anuncios activos»).
--
-- refresh_offer_canal() suma dos fuentes nuevas, sin quitar las de antes:
--  · El BOTÓN del anuncio de muestra si ya está guardado (ad_media_cache.cta_text): "WhatsApp" en cualquier idioma o enlace wa.me → whatsapp; botón de mensaje
--    (Messenger/Instagram) → mensajes; enlace a una web → página. (Hoy lo llena la vista de anuncios que ya se abrió.)
--  · El TEXTO de cualquier anuncio del anunciante (no solo el de muestra) que menciona WhatsApp/zap: solo para las
--    ofertas sin ninguna señal de página (no le gana a una página de ventas vista).
-- Solo escribe offers.canal / canal_url. No toca winning_ads ni borra ni esconde nada del catálogo.

CREATE OR REPLACE FUNCTION public.refresh_offer_canal()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
  WITH wa_pages AS (
    SELECT DISTINCT w.page_id FROM public.winning_ads w
    WHERE w.page_id IS NOT NULL
      AND (coalesce(w.ad_body, '') || ' ' || coalesce(w.ad_title, '') || ' ' || coalesce(w.ad_description, ''))
          ~* '(whats ?app|wa\.me/|api\.whatsapp|\yzap\y|zapzap)'
  ),
  src AS (
    SELECT o.id,
      CASE
        WHEN c.cta_text ~* 'whats ?app' OR c.link_url ~* '(wa\.me|whatsapp\.com)' THEN 'whatsapp'
        WHEN EXISTS (SELECT 1 FROM public.winning_ads w WHERE w.page_id = o.page_id AND w.dest_channel = 'whatsapp') THEN 'whatsapp'
        WHEN i.funnel_type = 'whatsapp' THEN 'whatsapp'
        WHEN coalesce(o.sample_body, '') ~* '(whats ?app|wa\.me/|api\.whatsapp)' THEN 'whatsapp'
        WHEN o.landing_domain IS NOT NULL OR i.landing_url IS NOT NULL OR c.link_url IS NOT NULL
          OR i.funnel_type IN ('pagina_ventas', 'vsl', 'webinar', 'quiz', 'checkout_directo', 'captura', 'advertorial', 'tienda') THEN 'pagina'
        WHEN EXISTS (SELECT 1 FROM public.winning_ads w WHERE w.page_id = o.page_id AND w.dest_channel = 'pagina') THEN 'pagina'
        WHEN c.cta_text ~* '(send message|message us|enviar mensaje|mensaje|enviar mensagem|mensagem|nachricht|envoyer un message|instagram|messenger|direct)' THEN 'mensajes'
        WHEN EXISTS (SELECT 1 FROM wa_pages p WHERE p.page_id = o.page_id) THEN 'whatsapp'
        WHEN EXISTS (SELECT 1 FROM public.winning_ads w WHERE w.page_id = o.page_id AND w.dest_channel = 'mensajes') THEN 'mensajes'
        ELSE NULL
      END AS canal,
      coalesce(nullif(i.landing_url, ''), c.link_url, CASE WHEN o.landing_domain IS NOT NULL THEN 'https://' || o.landing_domain END) AS url
    FROM public.offers o
    LEFT JOIN public.offer_intel i ON i.offer_id = o.id
    LEFT JOIN public.ad_media_cache c ON c.ad_id = substring(o.sample_ad_url FROM '[?&]id=([0-9]{6,25})')
  )
  UPDATE public.offers o
     SET canal = s.canal,
         canal_url = CASE WHEN s.canal = 'pagina' THEN s.url END
    FROM src s
   WHERE s.id = o.id
     AND (o.canal IS DISTINCT FROM s.canal OR o.canal_url IS DISTINCT FROM (CASE WHEN s.canal = 'pagina' THEN s.url END));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_offer_canal() FROM PUBLIC, anon, authenticated;

-- La revisión del botón con la vista oficial del anuncio (render_ad) se probó el 29-oct: Meta ya no la entrega
-- gratis (20 de 20 con error). El botón solo entra cuando ya está guardado en ad_media_cache.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('supernova-offer-canal-scan', 'supernova-offer-canal-scan-2');

-- ── Conteo en vivo (Jean, 29-oct: «los que salen tienen pocos anuncios activos») ─────────────────────────────
-- offers.active_ads = los anuncios que guardamos de ese anunciante (una muestra). live_active_ads = los que tiene
-- ACTIVOS HOY en la Biblioteca de Meta (offer-live-count, API oficial, gratis). refresh_offers no toca estas columnas.
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS live_active_ads integer,
  ADD COLUMN IF NOT EXISTS live_capped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_checked_at timestamptz;
COMMENT ON COLUMN public.offers.live_active_ads IS 'Anuncios activos hoy en la Biblioteca de Meta (todos los países), por offer-live-count. NULL = aún no contado.';

-- Qué anunciantes contar: primero WhatsApp y ganadoras, después por puntaje; cada uno se relee a los 3 días. Se
-- cuenta en su país principal (Meta no acepta "todos los países" en estos anuncios: daba 0 en todas).
CREATE OR REPLACE FUNCTION public.offers_pending_live_count(p_limit integer)
RETURNS TABLE(page_id text, market text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT x.page_id, x.market FROM (
    SELECT DISTINCT ON (o.page_id) o.page_id, o.market,
      max(CASE WHEN o.canal = 'whatsapp' THEN 2 WHEN o.is_winner THEN 1 ELSE 0 END) OVER (PARTITION BY o.page_id) AS prio,
      max(coalesce(o.winner_score, 0)) OVER (PARTITION BY o.page_id) AS score,
      min(o.live_checked_at) OVER (PARTITION BY o.page_id) AS visto
    FROM public.offers o
    WHERE o.excluded_reason IS NULL AND o.page_id IS NOT NULL AND o.page_id ~ '^[0-9]{3,25}$' AND o.market ~ '^[A-Z]{2}$'
    ORDER BY o.page_id, o.active_ads DESC NULLS LAST, o.winner_score DESC NULLS LAST
  ) x
  WHERE x.visto IS NULL OR x.visto < now() - interval '3 days'
  ORDER BY x.prio DESC, (x.visto IS NULL) DESC, x.score DESC
  LIMIT greatest(1, least(p_limit, 150));
$$;
REVOKE ALL ON FUNCTION public.offers_pending_live_count(integer) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('supernova-offer-live-count', 'supernova-offer-live-count-2');
SELECT cron.schedule('supernova-offer-live-count', '12 */6 * * *', $$
  SELECT net.http_post(url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/offer-live-count',
    headers := private.cron_headers(), body := '{"limit": 150}'::jsonb, timeout_milliseconds := 150000);
$$);

-- ── Más ofertas de WhatsApp desde el recolector (Brasil y LATAM) ─────────────────────────────────────────────
-- master-rotate corre cada hora las frases que nunca corrió primero (last_run_at NULL), en ES MX CO AR BR US.
INSERT INTO public.master_keyword_state (keyword, source_tier, language, category, priority, source, intent)
SELECT k, 'tier9_whatsapp', l, 'whatsapp', 'high', 'whatsapp-29oct', 'discovery'
FROM (VALUES
  ('chama no whatsapp', 'pt'), ('chame no whatsapp', 'pt'), ('receba no whatsapp', 'pt'), ('receba no seu whatsapp', 'pt'),
  ('fale conosco no whatsapp', 'pt'), ('clique e fale no whatsapp', 'pt'), ('atendimento pelo whatsapp', 'pt'),
  ('compre pelo whatsapp', 'pt'), ('me chama no zap', 'pt'), ('receitas no whatsapp', 'pt'), ('pdf no whatsapp', 'pt'),
  ('grupo vip whatsapp', 'pt'), ('entrega pelo whatsapp', 'pt'),
  ('escríbenos al whatsapp', 'es'), ('escríbeme por whatsapp', 'es'), ('recíbelo en tu whatsapp', 'es'),
  ('pide por whatsapp', 'es'), ('envíanos un whatsapp', 'es'), ('te lo envío por whatsapp', 'es'),
  ('compra por whatsapp', 'es'), ('información por whatsapp', 'es'), ('curso por whatsapp', 'es'), ('recetas por whatsapp', 'es')
) v(k, l)
WHERE NOT EXISTS (SELECT 1 FROM public.master_keyword_state m WHERE lower(m.keyword) = lower(v.k));

-- Primera pasada con lo que ya hay (botones guardados + texto de todos los anuncios).
SELECT public.refresh_offer_canal();
