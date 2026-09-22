-- Correcciones sobre la migración anterior, ya aplicadas en producción:
--  · el id de Meta viaja dentro de ad_url (ad_media_cache lo guarda suelto), no es el uuid;
--  · no se exige is_primary: un anunciante con ficha secundaria también es una idea válida.
-- El cuerpo definitivo de las tres funciones está en 20260922180000 y en estas sentencias.
SELECT cron.schedule('supernova-radar-platforms-daily', '30 9 * * *', $$
  SELECT public.refresh_radar_platforms();
$$);
