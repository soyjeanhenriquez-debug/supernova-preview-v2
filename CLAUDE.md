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
- **Modelo de negocio (precios vigentes, `src/lib/plans.ts`):** dos planes, nada de plan gratis.
  - **SUPERNOVA PRO — US$29,99/mes** por **Whop**, 3 días de prueba con tarjeta, 2.000 créditos
    al mes. Garantía publicada: 30 días, si no terminas tu producto se devuelve el 100 %.
    Cupón `FUNDADOR` (primer mes US$19,99) hasta el 30-sep-2026.
  - **COMUNIDAD CREATIVOS 10X — US$99/mes** (Skool): todo PRO + comunidad + llamadas en vivo.
  - Créditos para lo que gasta IA; mirar ofertas, radar y ganchos es gratis. La gente paga mes a
    mes porque la usa siempre (Tu semana, vigilancia de ofertas, reportes cada 15 días).
    Descubrir es barato; construir cuesta créditos; medir va incluido.
- **Datos:** entran anuncios reales cada hora por la API oficial de Meta (`bulk-seed-ads`), y
  `refresh_offers()` los agrupa en ofertas cada día. Los anuncios de julio siguen siendo la base.

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
- NUNCA inflar cifras para parecer más grandes que la competencia. Cada número que ve el
  cliente es real y dice qué cuenta ("más de 7.500 ofertas analizadas", no "+7.500" suelto).
- NUNCA contenido NSFW / "sin censura" ni disfrazar un cobro para saltarse las políticas de
  Whop o Stripe, aunque la competencia lo haga.

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

## 3. VOZ Y DISEÑO

- **Voz:** español neutro latinoamericano, de tú, frases cortas, sin jerga. Todo término técnico
  se explica en pocas palabras (VSL = video de ventas, CTR = % que hace clic). Números en formato
  español (2.000; 0,8 %). El público empieza de cero: cada pantalla dice qué hacer después.
- **Diseño real de la app (manda sobre cualquier guía genérica):** sistema "Apple Space Black"
  de `src/index.css`. Negro y neutros hacen el 95 %; el **ámbar** solo para acciones principales,
  marca y avisos críticos; bordes finos; sin brillos; mucho aire. Títulos en **Sora**, texto en
  **Manrope**. Playfair e Inter solo en el registro y la landing. Las skills
  `luxury-dark-mode-ui` y `high-end-typography-rhythm` son guías generales: si chocan con esto,
  gana el sistema de la app.
- **Rapidez es parte de la calidad:** listas cortas al abrir con "Ver más" (Radar 24, Ofertas 12,
  Ganchos 24), nada pesado en la primera carga, datos compartidos entre pantallas.

---

## 4. LA COMPETENCIA: qué aprendimos y cómo les ganamos

### Quantum Miner (quantumminer.site) — el más cercano
Misma arquitectura (Next.js + Vercel + Supabase + Whop + Skool). Lo que se sabe de su v4.0:
- **Precios:** quitó el plan gratis (señal de que no convertía). Starter/Minerador US$29 (solo
  buscar) · Software US$49 (construye embudos, ~4 al mes con créditos) · Comunidad US$59.
  Afiliados al 40 % recurrente.
- **Filtro con IA:** un clasificador revisa cada landing y deja solo productos digitales (fuera
  dropshipping, físico, novelas, MLM, cripto).
- **4 niveles:** Mega Winner (25+ clones reales), Rising Star, Solid Performer, Early Signal;
  por días activos, gasto y alcance estimados y antigüedad de la fanpage. Siembra de 458 frases.
- **Embudo en 4 pasos:** Modelar (clona la página) → Crear (principal + upsell + downsell +
  gracias) → Sofisticar (ángulos, mecanismo, objeciones) → Publicar (dominio propio o
  subdominio suyo, SSL, Meta Pixel + API de conversiones, precios por país) + traducción.
- Publica cifras enormes (2,8 M anuncios, 5.394 ofertas, +600/día) que no se pudieron verificar.
- **Lo que NO tienen:** números del negocio. No muestran cuánto vale un cliente (LTV), ni el CPA
  máximo, ni ventas reales (la venta pasa en Hotmart y solo ven el clic). No tienen escalón
  recurrente ni acompañan a quien empieza de cero.

### Otros que ya estudiamos
- **Escala Ads:** de ahí tomamos la ESTRUCTURA de Ofertas (tarjeta → ver detalles → análisis →
  ver checkout), con datos y análisis propios. No tiene nuestro `copy_score` (qué tan replicable
  es para una persona sola).
- **SwipeSaaS:** catálogo de Apps & SaaS → nuestra pestaña Apps & SaaS.
- **Cazador de ROI:** seguir ofertas y ver si escalan → nuestro "Seguir" + vigilancia.
- **Mini Apps Rentables:** kits de producto → nuestras Mini Apps (2 kits por semana).
- **PulpoIA:** herramienta espía (US$14,99 → 29,99, 7 días de reembolso). Nosotros no somos un
  espía: somos el **Método Negocio Gemelo**, tu propio producto, con garantía de 30 días.

### Cómo les ganamos (hacer siempre, en este orden de prioridad)
1. **Los números del negocio:** calculadora de precio y CPA máximo, veredicto de anuncios con
   reglas, "Mapa del negocio" con LTV proyectado y después LTV real
   (`docs/propuestas/2026-09-24-negocio-completo-ltv.md`, fases 0–1 aprobadas).
2. **Acompañar de cero a la primera venta:** recorrido de 6 etapas, Tu semana, Mándala,
   Recuperar ventas, reportes cada 15 días. Ellos entregan herramientas; nosotros un camino.
3. **Longevidad como prueba real:** los anuncios con más días arriba y "visto activo hace N
   días" con datos frescos. Nuestra ventaja no es tener más filas, es mostrar las que venden.
4. **Replicable por uno solo:** `copy_score`, filtro de solo digitales, "Roba como un artista".
5. **Alcanzar lo que ellos ya tienen, mejor hecho:** detectar clones reales por dominio de venta
   (Fase 0), filtro con IA de solo digitales, construir y publicar el embudo con upsell/downsell,
   Pixel y API de conversiones, en un **dominio aparte** (Fase 2), traducción y precios por país.
6. **Precio:** no subir de US$29,99 hasta tener "construir y publicar"; después se decide con
   Jean (idea: Radar ~US$29 / Negocio ~US$79–99). Nunca cambiar precios sin su OK.

### Lo que NUNCA hacemos con la competencia
- Copiar su contenido, textos, imágenes, marcas, catálogos de pago ni conectarnos a sus paneles.
  Se aprende de su estructura; los datos salen de fuentes públicas (Biblioteca de Meta) y el
  análisis es nuestro.
- Inventar cifras para igualar las suyas.
- Comprar sus productos para ver upsells: la escalera que no se ve gratis se **propone** y se
  marca como "propuesto", nunca como "copiado".
- Seguirlos en atajos que rompan este manual (NSFW, cobros disfrazados, promesas de ingresos).

---

## 5. ANTES DE CADA CAMBIO (lista de control)

1. ¿Esto quita, oculta, recorta o degrada anuncios/ofertas con muchos días activos? → Si sí, NO.
2. ¿Encaja con el recorrido de 6 etapas y con "Roba como un artista"?
3. ¿Toca dinero? → cobro en servidor, antes de gastar, con reembolso si falla, precio ≥ 5× costo.
4. ¿Toca acceso o datos de otros? → compuerta en el servidor, RLS, sin confiar en el cliente.
5. ¿Promete algo o muestra números? → solo datos reales, sin promesas de resultados.
6. ¿Es irreversible o afecta producción (borrados, pipeline, precios, despliegues)? → OK de Jean.
7. ¿Cómo lo voy a verificar en producción sin cargar la base?
8. ¿Nos acerca a ganarle a la competencia en lo que importa (números, acompañamiento, datos
   que venden) sin copiar su contenido?

---

## 6. Dónde está lo demás

- Guía de cada pantalla (lo que la app promete al usuario): `src/components/HelpAssistant.tsx`.
- Plan aprobado del pipeline del Radar: `docs/propuestas/2026-09-19-pipeline-radar.md`.
- Plan de negocio completo / LTV (respuesta a Quantum Miner): `docs/propuestas/2026-09-24-negocio-completo-ltv.md`.
- Los 30 embudos públicos de Quantum Miner: `docs/quantum-miner-ofertas-2026-09-24.csv`.
- Precios y planes: `src/lib/plans.ts`. Precios en créditos: tabla `credit_prices`.
- Chequeo de seguridad del proyecto: `.claude/skills/chequeo-seguridad`.
- Proyecto Supabase: `krfdoofwhtcxbyhkjoik`. App: https://supernova-six-eta.vercel.app/app
