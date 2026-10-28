-- Cómo vende cada oferta: WhatsApp o página de ventas (28-oct-2026, pedido de Cindy y decisión de Jean).
--
-- Antes el recolector (bulk-seed-ads) descartaba a propósito los enlaces de WhatsApp/Messenger: las ofertas que
-- venden por WhatsApp quedaban mezcladas con las que no se habían revisado. Ahora:
--  · winning_ads.dest_channel: a dónde lleva cada anuncio NUEVO ('whatsapp', 'pagina' o 'mensajes' =
--    Messenger/Instagram), según el dominio que muestra el anuncio. Solo se agrega: nada se borra ni se oculta.
--  · offers.canal / offers.canal_url: el canal de la oferta y, si es página, su enlace. Lo calcula
--    refresh_offer_canal() una vez al día (después de refresh_offers) con: sus anuncios nuevos, la ficha
--    "Ver detalles" (offer_intel) y, para las de antes, el texto del anuncio cuando menciona WhatsApp.
--    Sin dato = NULL ("sin revisar"): nunca se inventa el canal.

ALTER TABLE public.winning_ads ADD COLUMN IF NOT EXISTS dest_channel text;
ALTER TABLE public.winning_ads DROP CONSTRAINT IF EXISTS winning_ads_dest_channel_check;
ALTER TABLE public.winning_ads ADD CONSTRAINT winning_ads_dest_channel_check
  CHECK (dest_channel IS NULL OR dest_channel IN ('whatsapp', 'pagina', 'mensajes'));
COMMENT ON COLUMN public.winning_ads.dest_channel IS 'A dónde lleva el anuncio según su dominio visible (bulk-seed-ads): whatsapp, pagina o mensajes. NULL = anuncio anterior al 28-oct-2026 o sin dato.';
-- Pequeño: solo filas con dato (las nuevas).
CREATE INDEX IF NOT EXISTS idx_winning_ads_dest_channel ON public.winning_ads (page_id, dest_channel) WHERE dest_channel IS NOT NULL;

ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS canal text;
ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_canal_check;
ALTER TABLE public.offers ADD CONSTRAINT offers_canal_check CHECK (canal IS NULL OR canal IN ('whatsapp', 'pagina', 'mensajes'));
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS canal_url text;
COMMENT ON COLUMN public.offers.canal IS 'Cómo vende: whatsapp, pagina o mensajes. NULL = sin revisar. Lo llena refresh_offer_canal().';
COMMENT ON COLUMN public.offers.canal_url IS 'Si vende por página: el enlace (de la ficha o https:// + dominio). WhatsApp no da enlace en la API: se abre el anuncio.';

CREATE OR REPLACE FUNCTION public.refresh_offer_canal()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
  WITH src AS (
    SELECT o.id,
      CASE
        WHEN EXISTS (SELECT 1 FROM public.winning_ads w WHERE w.page_id = o.page_id AND w.dest_channel = 'whatsapp') THEN 'whatsapp'
        WHEN i.funnel_type = 'whatsapp' THEN 'whatsapp'
        WHEN coalesce(o.sample_body, '') ~* '(whats ?app|wa\.me/|api\.whatsapp)' THEN 'whatsapp'
        WHEN o.landing_domain IS NOT NULL OR i.landing_url IS NOT NULL
          OR i.funnel_type IN ('pagina_ventas', 'vsl', 'webinar', 'quiz', 'checkout_directo', 'captura', 'advertorial', 'tienda') THEN 'pagina'
        WHEN EXISTS (SELECT 1 FROM public.winning_ads w WHERE w.page_id = o.page_id AND w.dest_channel = 'pagina') THEN 'pagina'
        WHEN EXISTS (SELECT 1 FROM public.winning_ads w WHERE w.page_id = o.page_id AND w.dest_channel = 'mensajes') THEN 'mensajes'
        ELSE NULL
      END AS canal,
      coalesce(nullif(i.landing_url, ''), CASE WHEN o.landing_domain IS NOT NULL THEN 'https://' || o.landing_domain END) AS url
    FROM public.offers o
    LEFT JOIN public.offer_intel i ON i.offer_id = o.id
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

-- Una vez al día, 20 minutos después de refresh_offers (11:30 UTC).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'supernova-offer-canal-daily';
SELECT cron.schedule('supernova-offer-canal-daily', '50 11 * * *', $$ SELECT public.refresh_offer_canal(); $$);

-- Primera pasada ahora (14 mil ofertas: liviano).
SELECT public.refresh_offer_canal();
