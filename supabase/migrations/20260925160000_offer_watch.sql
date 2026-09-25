-- SUPERNOVA — Vigilancia de ofertas seguidas (Fase 1, aprobada por Jean el 24-sep).
--
-- Problema: `offers.active_ads` no sirve para saber si una oferta se apagó. bulk-seed-ads
-- solo le pide a Meta anuncios ACTIVOS y nunca registra cuándo paran (delivery_stop_time
-- queda NULL), y 6.400 de 7.700 ofertas no se vuelven a revisar en semanas. Así que
-- "anuncios activos" solo puede subir.
--
-- Solución sin tocar el catálogo ni el pipeline: una vez al día, offer-intel (acción
-- "watch", secreto de cron) pregunta a Meta por la PÁGINA de cada oferta SEGUIDA cuántos
-- anuncios tiene activos hoy en ese mercado, y relee su checkout (precio, upsell, bumps,
-- garantía). Cada revisión es una fila de offer_watch; comparar con la anterior da las
-- alertas de offer_events. No usa IA; Meta y Hotmart no cuestan: va incluido en el plan.
--
-- Solo lectura para el usuario, y solo de las ofertas que él sigue.

CREATE TABLE IF NOT EXISTS public.offer_watch (
  offer_id        uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  checked_on      date NOT NULL DEFAULT CURRENT_DATE,
  live_active_ads integer,          -- anuncios activos hoy según Meta; NULL = no se pudo leer
  live_capped     boolean NOT NULL DEFAULT false, -- true = llegó al tope de lectura (hay "al menos" N)
  price           numeric,
  currency        text,
  has_upsell      boolean,
  bumps           integer,
  guarantee_days  integer,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, checked_on)
);
ALTER TABLE public.offer_watch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offer_watch_select_followed ON public.offer_watch;
CREATE POLICY offer_watch_select_followed ON public.offer_watch
  FOR SELECT TO authenticated
  USING ((SELECT public.has_access())
         AND EXISTS (SELECT 1 FROM public.offer_follows f
                     WHERE f.offer_id = offer_watch.offer_id AND f.user_id = (SELECT auth.uid())));
-- Escritura solo con service_role (offer-intel): sin políticas de INSERT/UPDATE.

CREATE TABLE IF NOT EXISTS public.offer_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id    uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('escala','baja','se_apaga','vuelve','precio','upsell','bump')),
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  happened_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, kind, happened_on)
);
CREATE INDEX IF NOT EXISTS offer_events_offer_idx ON public.offer_events (offer_id, happened_on DESC);
ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offer_events_select_followed ON public.offer_events;
CREATE POLICY offer_events_select_followed ON public.offer_events
  FOR SELECT TO authenticated
  USING ((SELECT public.has_access())
         AND EXISTS (SELECT 1 FROM public.offer_follows f
                     WHERE f.offer_id = offer_events.offer_id AND f.user_id = (SELECT auth.uid())));

-- Compara la revisión de HOY de cada oferta con su revisión anterior (la más reciente
-- antes de hoy) y anota las alertas. Idempotente: correrla dos veces el mismo día no
-- duplica (UNIQUE offer_id, kind, happened_on). Solo para service_role.
--
-- Umbrales (pensados para no gritar por ruido):
--   escala   : tenía anuncios, +3 o más Y al menos 1,5× los de antes
--   baja     : -3 anuncios o más Y quedan la mitad o menos (sin llegar a 0)
--   se_apaga : tenía anuncios y hoy 0
--   vuelve   : tenía 0 y hoy tiene
--   precio   : cambió el precio o la moneda del checkout
--   upsell   : aparece o desaparece el upsell configurado
--   bump     : cambia la cantidad de order bumps
-- Una lectura fallida (NULL) nunca dispara nada, y si ambas lecturas tocaron el tope
-- de lectura no se compara el conteo (sería "300 → 300").
CREATE OR REPLACE FUNCTION public.detect_offer_events(p_day date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows integer := 0;
  v_n integer;
BEGIN
  WITH pair AS (
    SELECT t.offer_id,
           t.live_active_ads AS now_ads, t.live_capped AS now_cap,
           t.price AS now_price, t.currency AS now_cur, t.has_upsell AS now_up, t.bumps AS now_bumps,
           p.live_active_ads AS prev_ads, p.live_capped AS prev_cap,
           p.price AS prev_price, p.currency AS prev_cur, p.has_upsell AS prev_up, p.bumps AS prev_bumps,
           p.checked_on AS prev_on
    FROM public.offer_watch t
    JOIN LATERAL (
      SELECT * FROM public.offer_watch x
      WHERE x.offer_id = t.offer_id AND x.checked_on < t.checked_on
      ORDER BY x.checked_on DESC LIMIT 1
    ) p ON true
    WHERE t.checked_on = p_day
  ), ev AS (
    SELECT offer_id, 'escala'::text AS kind,
           jsonb_build_object('antes', prev_ads, 'ahora', now_ads, 'desde', prev_on) AS detail
    FROM pair
    WHERE now_ads IS NOT NULL AND prev_ads > 0 AND NOT (now_cap AND prev_cap) -- de 0 a N es "vuelve"
      AND now_ads >= prev_ads + 3 AND now_ads >= prev_ads * 1.5
    UNION ALL
    SELECT offer_id, 'baja', jsonb_build_object('antes', prev_ads, 'ahora', now_ads, 'desde', prev_on)
    FROM pair
    WHERE now_ads IS NOT NULL AND prev_ads IS NOT NULL AND now_ads > 0 AND NOT prev_cap
      AND prev_ads - now_ads >= 3 AND now_ads * 2 <= prev_ads
    UNION ALL
    SELECT offer_id, 'se_apaga', jsonb_build_object('antes', prev_ads, 'desde', prev_on)
    FROM pair WHERE prev_ads > 0 AND now_ads = 0
    UNION ALL
    SELECT offer_id, 'vuelve', jsonb_build_object('ahora', now_ads, 'desde', prev_on)
    FROM pair WHERE prev_ads = 0 AND now_ads > 0
    UNION ALL
    SELECT offer_id, 'precio',
           jsonb_build_object('antes', prev_price, 'ahora', now_price,
                              'moneda_antes', prev_cur, 'moneda', now_cur, 'desde', prev_on)
    FROM pair
    WHERE now_price IS NOT NULL AND prev_price IS NOT NULL
      AND (now_price <> prev_price OR coalesce(now_cur, '') <> coalesce(prev_cur, ''))
    UNION ALL
    SELECT offer_id, 'upsell', jsonb_build_object('ahora', now_up, 'desde', prev_on)
    FROM pair WHERE now_up IS NOT NULL AND prev_up IS NOT NULL AND now_up <> prev_up
    UNION ALL
    SELECT offer_id, 'bump', jsonb_build_object('antes', prev_bumps, 'ahora', now_bumps, 'desde', prev_on)
    FROM pair WHERE now_bumps IS NOT NULL AND prev_bumps IS NOT NULL AND now_bumps <> prev_bumps
  )
  INSERT INTO public.offer_events (offer_id, kind, detail, happened_on)
  SELECT offer_id, kind, detail, p_day FROM ev
  ON CONFLICT (offer_id, kind, happened_on) DO UPDATE SET detail = EXCLUDED.detail;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows + v_n;
  RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.detect_offer_events(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_offer_events(date) TO service_role;

-- Para la pestaña "Siguiendo" y el widget del inicio: por cada oferta que el usuario
-- sigue, la última lectura en vivo, la historia (máx. 60 días) y las últimas alertas.
-- SECURITY INVOKER: las políticas de arriba ya limitan a lo que el usuario sigue.
CREATE OR REPLACE FUNCTION public.get_offer_watch()
RETURNS TABLE (
  offer_id uuid,
  checked_on date,
  live_active_ads integer,
  live_capped boolean,
  history jsonb,
  events jsonb
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT f.offer_id,
         last.checked_on, last.live_active_ads, coalesce(last.live_capped, false),
         coalesce((
           SELECT jsonb_agg(jsonb_build_object('d', w.checked_on, 'n', w.live_active_ads) ORDER BY w.checked_on)
           FROM public.offer_watch w
           WHERE w.offer_id = f.offer_id AND w.checked_on >= CURRENT_DATE - 60 AND w.live_active_ads IS NOT NULL
         ), '[]'::jsonb),
         coalesce((
           SELECT jsonb_agg(jsonb_build_object('kind', e.kind, 'on', e.happened_on, 'detail', e.detail)
                            ORDER BY e.happened_on DESC, e.id DESC)
           FROM (SELECT * FROM public.offer_events e2
                 WHERE e2.offer_id = f.offer_id
                 ORDER BY e2.happened_on DESC, e2.id DESC LIMIT 6) e
         ), '[]'::jsonb)
  FROM public.offer_follows f
  LEFT JOIN LATERAL (
    SELECT w.checked_on, w.live_active_ads, w.live_capped FROM public.offer_watch w
    WHERE w.offer_id = f.offer_id ORDER BY w.checked_on DESC LIMIT 1
  ) last ON true
  WHERE f.user_id = (SELECT auth.uid());
$$;
REVOKE ALL ON FUNCTION public.get_offer_watch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_offer_watch() TO authenticated;

-- Cron diario 11:45 UTC (después de refresh_offers 11:30 y antes del resumen de las 13:00).
-- La edge function revisa, guarda y al final llama detect_offer_events().
DO $$
BEGIN
  PERFORM cron.unschedule('supernova-offer-watch-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'supernova-offer-watch-daily');
END $$;
SELECT cron.schedule('supernova-offer-watch-daily', '45 11 * * *', $cron$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/offer-intel',
    headers := private.cron_headers(),
    body := '{"action":"watch"}'::jsonb,
    timeout_milliseconds := 150000
  );
$cron$);
