-- 29-oct-2026, Jean revisó Healthy Metal: salía "WhatsApp" porque su anuncio cuenta una historia que menciona
-- WhatsApp, aunque su botón es "Learn more" y su embudo es una tienda. Ahora: primero el botón, el enlace y el
-- embudo; el texto solo cuenta si es una llamada a escribir por WhatsApp, y nunca le gana a una página vista.
CREATE OR REPLACE FUNCTION public.refresh_offer_canal()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer;
  wa_cta constant text := '(wa\.me/|api\.whatsapp|(chama|chame|fale|fala|clique|receba|recebe|compre|pe[cç]a|atendimento|escr[ií]benos|escr[ií]beme|escribe|escr[ií]banos|pide|pedidos|env[ií]anos|env[ií]ame|cont[aá]ctanos|rec[ií]belo|recibe|informaci[oó]n|info|compra|mande|manda)\s+(\S+\s+){0,3}(whats ?app|zap)\y|zapzap)';
  pagina_cta constant text := '(learn more|shop now|sign up|see details|book now|get offer|order now|download|apply now|buy now|subscribe|watch more|install|saiba mais|compre agora|comprar|m[aá]s informaci[oó]n|ver m[aá]s|inscr[ií]bete|reg[ií]strate|descargar|obtener oferta)';
BEGIN
  WITH wa_pages AS (
    SELECT DISTINCT w.page_id FROM public.winning_ads w
    WHERE w.page_id IS NOT NULL
      AND (coalesce(w.ad_body, '') || ' ' || coalesce(w.ad_title, '') || ' ' || coalesce(w.ad_description, ''))
          ~* wa_cta
  ),
  src AS (
    SELECT o.id,
      CASE
        WHEN c.cta_text ~* 'whats ?app' OR c.link_url ~* '(wa\.me|whatsapp\.com)' THEN 'whatsapp'
        WHEN EXISTS (SELECT 1 FROM public.winning_ads w WHERE w.page_id = o.page_id AND w.dest_channel = 'whatsapp') THEN 'whatsapp'
        WHEN i.funnel_type = 'whatsapp' THEN 'whatsapp'
        WHEN o.landing_domain IS NOT NULL OR i.landing_url IS NOT NULL OR c.link_url IS NOT NULL OR c.cta_text ~* pagina_cta
          OR i.funnel_type IN ('pagina_ventas', 'vsl', 'webinar', 'quiz', 'checkout_directo', 'captura', 'advertorial', 'tienda') THEN 'pagina'
        WHEN EXISTS (SELECT 1 FROM public.winning_ads w WHERE w.page_id = o.page_id AND w.dest_channel = 'pagina') THEN 'pagina'
        WHEN c.cta_text ~* '(send message|message us|enviar mensaje|mensaje|enviar mensagem|mensagem|nachricht|envoyer un message|instagram|messenger|direct)' THEN 'mensajes'
        WHEN coalesce(o.sample_body, '') ~* wa_cta THEN 'whatsapp'
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
SELECT public.refresh_offer_canal();
