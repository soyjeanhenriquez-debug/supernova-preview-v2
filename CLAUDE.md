# MANUAL DE SUPERNOVA — leer antes de CUALQUIER instrucción

Este manual manda sobre cualquier idea de "optimizar", "limpiar" o "mejorar". Si una instrucción
choca con este manual, se para y se le pregunta a Jean antes de hacer nada.

---

## 1. LA BASE: qué es SUPERNOVA

SUPERNOVA ayuda a emprendedores hispanos (LATAM, sobre todo RD, Colombia, México) a **encontrar
negocios digitales que YA están vendiendo y crear su propia versión**, esta semana, cobrándola en
su moneda.

- **La prueba de que algo vende = tiempo pagando anuncios.** Un anuncio que lleva 300 días
  corriendo no es "viejo": es la mejor prueba de venta que existe. El `winner_score` premia justo
  eso (longevidad + escala del anunciante).
- **El catálogo de anuncios y ofertas ES el producto.** Los ~71.000 anuncios reales de la
  Biblioteca de Meta sembrados en julio de 2026 son el activo principal de la app.
- **Método "Roba como un artista":** el usuario elige UNA oferta validada y la copia casi
  idéntica (mismo producto, estructura, mecanismo, precio y embudo), con mejoras puntuales
  (español LATAM, pagos locales, entrega por WhatsApp). Nunca mezclas de varias referencias ni
  precios inventados.
- **El recorrido "Mi negocio" (6 etapas, en orden):** 1 Elegir (Ofertas, Radar, Mini Apps) →
  2 Validar → 3 Precio → 4 Construir → 5 Vender (Mándala, Ganchos, Contenido, Generadores) →
  6 Medir y recuperar. El menú lateral ES ese recorrido. La guía completa y vigente de cada
  pantalla está en `SYSTEM_PROMPT` de `src/components/HelpAssistant.tsx`.
- **Modelo de negocio:** suscripción mensual por **Whop** (PRO con 3 días de prueba con
  tarjeta) + créditos. La gente paga mes a mes porque la usa siempre (Tu semana, vigilancia de
  ofertas, reportes). Descubrir es barato; construir cuesta créditos; medir va incluido.

---

## 2. NUNCA, BAJO NINGUNA CIRCUNSTANCIA

### El catálogo (el corazón de la app)
- **NUNCA borrar, retirar, ocultar, recortar ni "archivar" anuncios u ofertas por antigüedad**,
  por "no vistos en X días" ni por ahorrar espacio. `scraped_at` viejo = el recolector no lo
  re-revisó, NO que el anuncio sea malo. Lo que se hace con los anuncios viejos es
  **refrescarlos** (rotación contra la API de Meta) y mostrar "visto activo hace N días".
- NUNCA cambiar la fórmula de `winner_score`, el orden por puntaje/días ni los filtros del Radar
  u Ofertas de forma que los anuncios de muchos días bajen o desaparezcan.
- NUNCA tocar el pipeline de datos de producción (scrapers, `score_unscored_ads`, crons que
  escriben sobre todos los anuncios, borrados o recortes masivos) sin el OK explícito de Jean.
- Para espacio en la base (plan Free = 500 MB): primero ahorros que NO tocan el catálogo
  (índices sobredimensionados, texto duplicado, filas de relleno sin fecha real de Meta, filas
  muertas). Si no alcanza, la respuesta es **el plan Pro de Supabase**, no borrar catálogo.

### Dinero, precios y créditos
- **NUNCA cobrar créditos desde el navegador.** Todo cobro lo hace el servidor
  (`edge_guard_charge` + tabla `credit_prices`), ANTES de gastar en la IA, y se devuelve solo si
  la IA falla (`refund_charge`). El cliente solo refleja el saldo.
- NUNCA cobrarle a un usuario algo que no pidió (ej.: búsquedas automáticas en segundo plano).
- NUNCA mostrar al cliente cuántos dólares vale un crédito. Al cliente solo créditos.
- NUNCA poner un precio por debajo de **costo real × 5** (piso absoluto 3× en el peor caso),
  calculado con el crédito más barato (~US$0,008). Vigilar con `admin_margin`.
- NUNCA cambiar precios de planes, packs o créditos sin que Jean lo decida.
- NUNCA dar acceso de pago por registrarse: el acceso lo dan SOLO los webhooks de pago de Whop.
- El cobro es **Whop**. Stripe está APAGADO (`STRIPE_ENABLED`); no encenderlo sin arreglar antes
  sus fallos anotados en `stripe-*` ni sin el OK de Jean.
- Créditos mensuales no se acumulan por encima de 3.000; los comprados sí se acumulan y no caducan.

### Seguridad
- **`verify_jwt` NO protege** (la llave anon del bundle es un JWT válido). Toda edge function
  nueva lleva su compuerta en el código: usuario real + `edge_guard`/`edge_guard_charge`, o
  secreto de cron, o firma del webhook. Ver `.claude/skills/chequeo-seguridad`.
- NUNCA escribir secretos (llaves, tokens, `service_role`) en el repo, en el chat, en logs ni en
  datos que lean los usuarios. Ojo con `access_token=` pegado en URLs de Meta.
- NUNCA confiar en datos del cliente para precio, rol, acceso, `user_id` ajeno o id de plan.
- Toda tabla nueva con RLS; todo `SECURITY DEFINER` con `search_path` fijo y sin `EXECUTE` para
  `anon`/`authenticated` salvo que sea a propósito.
- Plan nuevo de SUPERNOVA en Whop → añadir su id a `SUPERNOVA_PLANS` en `whop-webhook`.
  Generador nuevo → añadir su id a `GEN_*_IDS` en `ai-chat`.

### Ética y promesas (lo que ven clientes y compradores)
- NUNCA prometer ingresos, ventas, resultados de salud o físicos, ni plazos ("gana X en 7 días").
- NUNCA inventar testimonios, cifras, ventas "en vivo", clientes, estudios ni urgencia falsa.
  (Jean pidió un ticker de ventas inventadas y se rechazó: se muestran solo datos reales.)
- Garantías solo si existen de verdad, como reembolso y con esas palabras.
- Copiar estructura, mecanismo, precio y embudo; NUNCA textos, imágenes ni marcas literales.
- Los embudos de los usuarios se publican en un dominio aparte, nunca en el de la app.

### Operación y producción
- **Todo en español** para Jean (textos, resúmenes, tablas).
- NUNCA correr pruebas pesadas contra la base de producción (millones de filas,
  `generate_series` grandes, `count exact` sobre `winning_ads`): la instancia es chica y se
  reinicia. Pruebas masivas en un Postgres local.
- NUNCA `select *` ni `count: "exact"` sobre `winning_ads` desde el cliente; límite de 8 s por
  consulta para `authenticated`; con RLS, ILIKE no usa índices (usar RPC).
- NUNCA hacer commit/push a producción, desplegar funciones ni aplicar migraciones que cambien
  comportamiento visible sin que Jean lo haya pedido o aprobado en esta conversación.
- NUNCA declarar algo "arreglado" sin verificarlo en producción (llamar la función, leer la base,
  abrir la pantalla). Decir con claridad lo que no se pudo probar.

---

## 3. ANTES DE CADA CAMBIO (lista de control)

1. ¿Esto quita, oculta, recorta o degrada anuncios/ofertas con muchos días activos? → Si sí, NO.
2. ¿Encaja con el recorrido de 6 etapas y con "Roba como un artista"?
3. ¿Toca dinero? → cobro en servidor, antes de gastar, con reembolso si falla, precio ≥ 5× costo.
4. ¿Toca acceso o datos de otros? → compuerta en el servidor, RLS, sin confiar en el cliente.
5. ¿Promete algo o muestra números? → solo datos reales, sin promesas de resultados.
6. ¿Es irreversible o afecta producción (borrados, pipeline, precios, despliegues)? → OK de Jean.
7. ¿Cómo lo voy a verificar en producción sin cargar la base?

---

## 4. Dónde está lo demás

- Guía de cada pantalla (lo que la app promete al usuario): `src/components/HelpAssistant.tsx`.
- Plan aprobado del pipeline del Radar: `docs/propuestas/2026-09-19-pipeline-radar.md`.
- Plan de negocio completo / LTV: `docs/propuestas/2026-09-24-negocio-completo-ltv.md`.
- Chequeo de seguridad del proyecto: `.claude/skills/chequeo-seguridad`.
- Proyecto Supabase: `krfdoofwhtcxbyhkjoik`. App: https://supernova-six-eta.vercel.app/app
