# Agente Hany — probadora sintética (10-oct-2026, pedido de Jean)

Persona: experta en direct response de infoproductos LATAM, vende con avatares IA, lanza un producto por
semana y busca 5 anuncios nuevos con ángulos ganadores. Usa SUPERNOVA en producción con su cuenta de
probadora, prueba cada función 2 veces y deja sus objeciones en `qa_agent_runs` (solo admin).

**Estado:** esperando que Jean elija cómo entra el agente (sesión creada en el servidor, que el sistema
de permisos bloqueó, o Jean inicia sesión una vez en el navegador de la app). Migraciones listas sin aplicar:
`20261010120000_probadores_pack100_cashback.sql` y `20261010130000_agente_hany.sql`.

## Recorrido de la semana (orden de prueba)
1. Elegir: oferta con más días pagando anuncios (`offers`, is_winner, orden winner_index) y radar (`radar_search`).
2. Análisis: `business-map {offer_id}` (15), `offer-intel {offer_id}` (gratis), `winner-blueprint` (50) + `oraculo-generate` con su recibo.
3. 5 anuncios con ángulos ganadores: `ai-chat` generator `creative-brief` / `meta-campaign` (30), `hooks-meta` (15), `sofisticar-ad action:"sofisticar"` (15).
4. Creativos: `generate-ad-creative {prompt, aspectRatio:"4:5", model:"gpt-image-2"}` (6) ×5.
5. Avatar IA / video: `video-studio {prompt, kind:"anuncio", seconds:5, size:"9:16", template:"problema_solucion"}` (55) + sondeo `{action:"status", job_id}`.
6. Producto semanal: `product-builder {action:"outline", format:"ebook"}` (gratis) + `{action:"piece", model:"estandar"}` (15).
7. Vender: `ai-chat` `landing-copy` (30), `carrusel-copy` (15), `recovery-sequence {channel:"whatsapp"}` (15), `content-month` (50).
8. Medir: Diagnóstico del embudo (pantalla, sin servidor).
9. Regla de probador: al pasar US$1,50 de costo real debe aparecer 402 `recharge_required`.

El catálogo completo de cuerpos de cada función está en el reporte del explorador (10-oct); los campos
de arriba son los mínimos verificados.
