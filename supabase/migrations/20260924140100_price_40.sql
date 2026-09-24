-- El precio de la ficha pasa de 30 a 40 caracteres: ofertas como "US$9/mes · reto de entrada US$5"
-- no cabían. El cliente (src/lib/businessProfile.ts, PRICE_MAX) ya recorta a 40.
alter table public.products drop constraint if exists products_price_check;
alter table public.products add constraint products_price_check check (char_length(price) <= 40);
