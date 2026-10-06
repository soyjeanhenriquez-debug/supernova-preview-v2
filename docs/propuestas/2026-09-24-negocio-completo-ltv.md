# Propuesta: clonar el negocio completo (con LTV), no solo una página

**Fecha:** 24-sep-2026 · **Estado:** esperando OK de Jean · **No se ha tocado código.**

## De dónde sale

Revisamos Quantum Miner (quantumminer.site), el competidor más cercano:

- **Precios** (página pública /pricing): Minerador $29 (solo buscar, sin construir) · Software $49 (800 QC, "~4 funnels completos/mes") · Comunidad $59 (Skool). Afiliados al 40 % recurrente.
- **Ya vende "funnel completo: principal + upsell + downsell + gracias"** por ~186 QC. O sea: la idea de "clonar el embudo con upsell y downsell" **por sí sola no nos diferencia**; ellos ya la tienen y cobran $49.
- Publican los embudos en `quantumminer.site/p/…`, con checkout de Hotmart del usuario y UTM `quantum_sales_page` + `sck` por sección (miden clics por bloque, A/B).
- **Lo que NO tienen (hasta donde se ve desde fuera):** números. No muestran cuánto vale un cliente, ni si el embudo gana plata, ni ventas reales: la venta ocurre en Hotmart y ellos solo ven el clic. Tampoco ofrecen un escalón **recurrente** (suscripción); todo es pago único.

Lista de sus 30 embudos: `docs/quantum-miner-ofertas-2026-09-24.csv`.

## Dónde estamos nosotros (código revisado hoy)

| Pieza | Hoy en SUPERNOVA |
|---|---|
| Anuncios reales | ✅ Entran cada hora por la API oficial de Meta (`bulk-seed-ads`) |
| Destino del anuncio | ❌ La API da el **dominio visible** (`ad_creative_link_captions`) y lo **pedimos y lo tiramos** (`bulk-seed-ads/index.ts:9-14`, mapeo en `:232-267`). La URL exacta solo sale raspando (`offer-intel`, Firecrawl). `meta-ad-proxy` ya descarga ese HTML para la vista previa y también tira el `link_url` (`:121-127`). |
| Landing de la oferta | 🟡 `offer-intel` la lee para ~300 ofertas ganadoras, sigue **un** paso (`nextUrl`), detecta la plataforma de cobro y los precios visibles |
| Escalera de oferta | 🟡 Solo texto: generador `ecosystem` (bump, upsell, downsell, continuidad, "ticket promedio") en `GeneradoresPage.tsx:77-97` |
| Páginas publicadas | ❌ Nada. Ni HTML generado, ni hosting, ni dominio. La única página de embudo es `public/lab/ia-sin-miedo/` hecha a mano |
| Checkout / pixel / compras | ❌ Nada para el embudo del usuario (ni Pixel, ni CAPI, ni webhook de ventas) |
| Medición | 🟡 Tablas `funnels`, `funnel_events`, `funnel_leads` existen; nadie las lee desde la app |

**Conclusión honesta:** hoy Quantum está por delante en "construir y publicar". Para cobrar más de $29 primero hay que tener eso, y encima ganarles donde ellos no miran: **los números del negocio**.

## Fable: las preguntas

**1. Problema real.** El usuario no quiere una página: quiere saber *qué negocio montar, cuánto le va a dejar cada cliente y cuánto puede pagar por conseguirlo*. Una página clonada sin eso es una apuesta; con eso es una decisión.

**2. Lo más pequeño que lo resuelve.** Un **"Mapa del negocio"** por oferta, antes de construir nada:
oferta validada (días anunciando, nº de anuncios) → landing real → checkout y precio real → order bump visible en el checkout → escalera propuesta (upsell, downsell, **continuidad mensual**) → **LTV proyectado y CPA máximo** ("cada cliente vale ~$21; puedes pagar hasta $9 por venta y ganar"). Eso ya es algo que Quantum no muestra, y reutiliza `offer-intel` + el generador `ecosystem`.

**3. Qué se rompe.**
- `bulk-seed-ads`: el upsert es sobre `(keyword, ad_url)`; agregar columnas no lo rompe. Crece la base: el dominio son ~20 bytes/fila (irrelevante), pero la base está en plan Free (límite 500 MB, hoy ~314 MB).
- Páginas publicadas en **nuestro mismo dominio** = HTML generado por IA sirviéndose junto a la sesión de la app → riesgo de robo de sesión (XSS). **Deben ir en un dominio aparte.**
- `offer-intel` gasta Firecrawl; subir cobertura sube costo → hace falta precio en `credit_prices` y área en `admin_margin` (regla ×5).
- Stripe y Whop cobran distinto hoy (PRO $29 vs $29,99; Media $12 vs $10…). Antes de tocar precios hay que unificar.

**4. Casos límite.** Anuncio sin link (formulario de Meta, WhatsApp, perfil de Instagram) · Linktree/acortadores · cadenas de redirección · landing caída (404) · página en portugués (BR) · checkout que no es Hotmart (Kiwify, Eduzz, Stripe) · usuario sin cuenta de cobro · la misma oferta clonada por 10 usuarios.

**5. Cómo se verifica.** Cada paso abajo trae su verificación.

**6. Qué NO vamos a hacer (y por qué).**
- **Comprar productos de la competencia para ver sus upsells.** Los upsells reales solo se ven pagando. Lo que sí se ve gratis: precio, order bump del checkout de Hotmart y la página de gracias si está enlazada. El resto de la escalera se **propone** con patrones de ofertas validadas del mismo nicho y se marca como "propuesto", nunca como "copiado".
- **Checkout propio / Stripe Connect.** El usuario pega su link de Hotmart/Whop/Stripe; nosotros solo medimos.
- **Dominios personalizados en la v1.** Subdominio nuestro primero; dominio propio después.
- **Editor visual arrastrar-y-soltar.** Editor por bloques con IA, como mucho.
- **Enviar emails.** Entregamos la secuencia escrita; el envío lo hace su herramienta.
- **Copiar imágenes, logos, marcas o testimonios de terceros.** Riesgo de rechazo de anuncios en Meta y de reclamo de derechos. Se replica la **oferta, estructura y precio** (la regla "roba como un artista"); textos reescritos e imágenes propias.

## El plan (pasos pequeños y reversibles)

### Fase 0 — Dejar de tirar datos (1 día, costo cero)
1. `bulk-seed-ads`: guardar `ad_creative_link_captions[0]` (dominio), `ad_creative_link_descriptions[0]` y `languages` en columnas nuevas de `winning_ads` (`link_domain`, `link_desc`, `languages`). Nada de token.
   *Verificación:* tras la siguiente rotación horaria, `select count(*) filter (where link_domain is not null)` sobre filas con `scraped_at` de la última hora > 0.
2. `meta-ad-proxy`: guardar `link_url` y `link_caption` en `ad_media_cache` (el HTML ya se descarga; hoy se tira).
   *Verificación:* abrir 3 anuncios en el Radar y ver la fila con `link_url` en `ad_media_cache`.
3. `refresh_offers()`: propagar el dominio más frecuente de la página a `offers.landing_domain`.
   *Beneficio inmediato:* agrupar por **dominio de venta** (no solo por página de Facebook) → detecta cuando 5 páginas distintas empujan la misma oferta = señal fuerte de ganadora.

### Fase 1 — "Mapa del negocio" (la diferencia vendible; ~1 semana)
4. `offer-intel` v2: seguir landing → checkout (hasta 3 saltos), y en checkouts de Hotmart leer **precio, moneda, order bump y garantía** (se ven sin pagar). Detectar enlaces a página de gracias/upsell si están expuestos.
   *Verificación:* correr sobre 10 ofertas conocidas (p. ej. las de la lista de Quantum con checkout Hotmart) y comparar a ojo con el checkout real.
5. Escalera propuesta: reutilizar el prompt `ecosystem` para que devuelva JSON (bump, upsell 1, downsell, **continuidad mensual**, precios sugeridos y tasa de toma típica), anclado en el precio real del paso 4.
6. **Calculadora de LTV y CPA máximo** en la ficha de la oferta:
   `LTV = precio + (bump × toma_bump) + (upsell × toma_upsell) + (downsell × toma_downsell) + (continuidad × meses_promedio)` − comisión de la plataforma (ya está en `PricingPage.tsx:20`).
   El usuario mueve las tasas; mostramos "CPA máximo para no perder" y "con ROAS 2".
   *Verificación:* prueba unitaria de la fórmula (vitest) + revisión con Jean de las tasas por defecto.
7. Precio en créditos: medir costo real (Firecrawl + IA) de 20 mapas y fijar `business_map` en `credit_prices` con la regla ×5.

### Fase 2 — Construir y publicar el negocio (~2–3 semanas)
8. Tablas `funnel_steps` (tipo: principal/bump/upsell/downsell/gracias/continuidad, orden, precio, link de checkout del usuario) ligadas a `funnels` y `products`. El HTML va a **Storage**, no a la base (límite de 500 MB).
9. Generador de páginas: HTML por paso a partir del mapa (estructura de la landing ganadora, textos reescritos).
10. Publicación en **dominio aparte** (p. ej. `*.supernova.pages` o similar, a comprar) — nunca en el dominio de la app. `noindex` por defecto; nada de sitemap.
11. Pixel de Meta del usuario + UTM + eventos `view/cta` en `funnel_events` por paso.
   *Verificación:* publicar un embudo de prueba, recorrerlo, ver eventos por paso en la tabla y el Pixel con Meta Pixel Helper.

### Fase 3 — LTV real (lo que nadie tiene; ~1 semana)
12. Webhook por embudo para Hotmart (postback), Whop y Stripe del usuario → eventos `purchase`, `bump_accept`, `upsell_accept`, `downsell_accept`, `renewal` con monto.
13. Panel del dueño: ventas, LTV real vs proyectado, en qué paso se cae la plata, CPA real si conecta gasto de Meta.
   *Verificación:* compra de prueba en Hotmart en modo sandbox → aparece en el panel con el monto correcto.

### Fase 4 — Precio (cuando exista la Fase 2)
- **Antes que nada:** unificar precios Stripe/Whop/app (hoy no coinciden).
- Estructura sugerida, para decidir con Jean:
  - **Radar** ~$29: encontrar ofertas + mapa del negocio (igual que el "Minerador" de Quantum, pero con números).
  - **Negocio** ~$79–99: construir, publicar y medir LTV real.
  - **Comunidad** $99 (Skool, ya existe) o integrarla en el plan alto.
- "Solo entran los que quieren crecer": opciones — aplicación con 3 preguntas antes del plan alto, o cupos por mes. Es una decisión comercial, no técnica.
- Afiliados: Quantum paga 40 % recurrente; tenerlo en cuenta al fijar precio.

## Decisiones de Jean (24-sep)

- **Fases 0 y 1 aprobadas.** Fase 0: migración `20260925100000_ad_link_domain.sql` aplicada; `bulk-seed-ads` y `meta-ad-proxy` modificados, pendientes de desplegar (no hay CLI con sesión en la Mac).
- **Retención aprobada:** (1) **vigilancia de ofertas** (alertas cuando una oferta seguida escala, cambia de precio, agrega upsell o se apaga) entra en la Fase 1; (2) **LTV real** (Fase 3).
- **Reporte automático cada 15 días**: 2 al mes incluidos en el plan (sin costo en créditos).
- **Créditos:** los mensuales no se acumulan por encima de 3.000; los **comprados** sí. Ya existe un tope de 3.000 en `grant_monthly_if_due` (migración `20260923140000`), pero cuenta los comprados dentro del tope: quien compra un pack y queda con más de 3.000 deja de recibir la recarga mensual. Para respetar "salvo los comprados" hay que separar saldo regalado y saldo comprado (se gasta primero el regalado). Pendiente de OK.
- Estrategia de precios en créditos: descubrir barato (mapa ~10–15), construir con créditos (embudo ~60–250), medir incluido. Cifras a confirmar midiendo 20 mapas reales.

## Decisiones que esperan a Jean (cambian el plan)

1. **¿Arrancamos por Fase 0 + Fase 1?** (recomendado: barato, rápido y ya diferencia).
2. **Dominio aparte para publicar embudos** (Fase 2): hay que comprarlo.
3. **Plan Pro de Supabase:** la Fase 2 guarda páginas en Storage; en Free (1 GB de Storage, base al límite y sin backups) es arriesgado.
4. **Precio final y filtro de entrada** (Fase 4).
