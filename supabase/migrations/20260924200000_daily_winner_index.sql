-- get_daily_winner (Inicio y resumen diario) tardaba ~9 s y se cortaba en el límite de 8 s:
-- ordenaba todos los anuncios "mega" vivos. Con este índice parcial baja a ~0,14 s.
-- (Aplicado en producción con CREATE INDEX CONCURRENTLY el 24-sep-2026.)
CREATE INDEX IF NOT EXISTS idx_wa_mega_live_rank ON public.winning_ads (winner_score DESC, days_active DESC)
  WHERE tier = 'mega' AND delivery_stop_time IS NULL;
