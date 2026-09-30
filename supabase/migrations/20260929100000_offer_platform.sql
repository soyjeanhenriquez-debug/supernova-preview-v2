-- Filtro "Plataforma de cobro" en Ofertas + detección liviana (sin IA) de dónde cobra cada oferta.
--
-- offer_platform: una fila por oferta revisada. platform NULL = se revisó y no se vio checkout
-- (quiz, webinar, WhatsApp…). La llenan dos caminos:
--   · source 'intel': la ficha completa (offer_intel) → trigger de abajo.
--   · source 'scan' : offer-intel acción "platforms" (cron cada 30 min; gratis: sin IA, sin Firecrawl, sin Meta).
-- No toca offers ni winning_ads: el catálogo y su orden no cambian. El filtro solo aplica si el
-- usuario lo elige.

CREATE TABLE IF NOT EXISTS public.offer_platform (
  offer_id     uuid PRIMARY KEY REFERENCES public.offers(id) ON DELETE CASCADE,
  platform     text,
  source       text NOT NULL CHECK (source IN ('intel', 'scan')),
  checkout_url text,
  landing_url  text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offer_platform_platform ON public.offer_platform (platform) WHERE platform IS NOT NULL;

ALTER TABLE public.offer_platform ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offer_platform_select_with_access ON public.offer_platform;
CREATE POLICY offer_platform_select_with_access ON public.offer_platform FOR SELECT TO authenticated
  USING ((SELECT public.has_access()));
REVOKE ALL ON public.offer_platform FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.offer_platform FROM authenticated;

-- La ficha completa manda: cuando offer_intel detecta plataforma, se copia aquí.
CREATE OR REPLACE FUNCTION private.sync_offer_platform()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
begin
  if new.checkout_platform is not null then
    insert into public.offer_platform (offer_id, platform, source, checkout_url, landing_url, updated_at)
    values (new.offer_id, new.checkout_platform, 'intel', new.checkout_url, new.landing_url, now())
    on conflict (offer_id) do update set
      platform = excluded.platform, source = 'intel', checkout_url = excluded.checkout_url,
      landing_url = coalesce(excluded.landing_url, offer_platform.landing_url), updated_at = now();
  end if;
  return new;
end
$function$;
REVOKE ALL ON FUNCTION private.sync_offer_platform() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS offer_intel_sync_platform ON public.offer_intel;
CREATE TRIGGER offer_intel_sync_platform
  AFTER INSERT OR UPDATE OF checkout_platform, checkout_url ON public.offer_intel
  FOR EACH ROW EXECUTE FUNCTION private.sync_offer_platform();

-- Lo que ya se sabe por las fichas.
INSERT INTO public.offer_platform (offer_id, platform, source, checkout_url, landing_url, updated_at)
SELECT offer_id, checkout_platform, 'intel', checkout_url, landing_url, now()
FROM public.offer_intel WHERE checkout_platform IS NOT NULL
ON CONFLICT (offer_id) DO NOTHING;

-- Próximas ofertas a revisar (solo el servidor): las que ya tienen dominio de destino (Fase 0;
-- crece con la rotación horaria), primero las ganadoras y luego por puntaje (que premia días
-- anunciando). Las que tienen ficha completa no hace falta revisarlas.
CREATE OR REPLACE FUNCTION public.offers_pending_platform_scan(p_limit integer DEFAULT 15)
 RETURNS TABLE (id uuid, sample_ad_url text, landing_domain text, is_winner boolean)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  select o.id, o.sample_ad_url, o.landing_domain, o.is_winner
  from public.offers o
  where o.excluded_reason is null and o.enrich_failed = false and o.landing_domain is not null
    and not exists (select 1 from public.offer_platform p where p.offer_id = o.id)
    and not exists (select 1 from public.offer_intel i where i.offer_id = o.id and i.landing_checked_at is not null)
  order by o.is_winner desc, o.winner_score desc nulls last, o.days_active desc nulls last
  limit least(greatest(p_limit, 1), 30)
$function$;
REVOKE ALL ON FUNCTION public.offers_pending_platform_scan(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offers_pending_platform_scan(integer) TO service_role;

-- Opciones del filtro con su conteo real (todas las ofertas visibles y solo ganadoras).
CREATE OR REPLACE FUNCTION public.offer_platform_counts()
 RETURNS TABLE (platform text, total bigint, winners bigint)
 LANGUAGE sql
 STABLE
 SET search_path = public, pg_temp
AS $function$
  select p.platform, count(*), count(*) filter (where o.is_winner)
  from public.offer_platform p
  join public.offers o on o.id = p.offer_id
  where p.platform is not null and o.excluded_reason is null and o.enrich_failed = false
  group by p.platform
  order by count(*) desc
$function$;
REVOKE ALL ON FUNCTION public.offer_platform_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.offer_platform_counts() TO authenticated;

-- Detección liviana cada 30 min (minutos 5 y 35: no choca con los demás crons de ofertas).
SELECT cron.schedule('supernova-offer-platform-scan', '5,35 * * * *', $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/offer-intel',
    headers := private.cron_headers(),
    body := '{"action":"platforms","batch":15}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);
