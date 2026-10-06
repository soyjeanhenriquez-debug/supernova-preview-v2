# Inteligencia competitiva: Quantum Miner v4.0 (quantumminer.site)

**Fecha:** 24-sep-2026 · **Fuentes:** solo públicas (landing, /pricing, /affiliates, /terms, /privacy, sitemap, 30 embudos publicados en /p/, Skool). No hay repositorio ni changelog público; es un SaaS cerrado.
**Aclaración:** en GitHub, "Quantum Miner v4.0" es minería de criptomonedas (Quantus Network, quantumhash). No tiene relación.

## Resumen ejecutivo: las 3 mejoras críticas de la v4.0

1. **De buscador a fábrica de embudos.** La v3.0 (términos y privacidad de mayo 2026) era solo el minero. La v4.0 suma "el software": Modelar (clona la página ganadora), Crear (landing + upsell + downsell + gracias), Sofisticar (ángulos, mecanismo, objeciones) y Publicar (dominio propio o subdominio gratis, SSL, Meta Pixel + API de conversiones, precios localizados por país, traducción al idioma del mercado). Ya hay 30 embudos de usuarios publicados desde el 21-may-2026 (unos 10 por mes).
2. **Curación con IA en 4 niveles.** Un clasificador con Claude descarta lo que no es producto digital antes de mostrarlo; luego ordena en Mega Winner (25+ clones), Rising Star, Solid Performer y Early Signal, usando días activos, gasto y alcance estimados y antigüedad de la fanpage. Dicen cubrir EE. UU., LATAM y Brasil con más de 600 ofertas nuevas al día (no verificable).
3. **Nuevo modelo comercial.** Quitaron el plan Free y la cuota diaria. Ahora: Minerador US$29 (ilimitado, sin construir), Software US$49 (800 QC ≈ 4 embudos), Comunidad US$59 (1.000 QC + Skool "Quantum Shadows", 222 miembros). Afiliados 40 % recurrente de por vida (50 % con +20 ventas/mes). Empiezan a llamarse "Quantum OS" en /pricing y /affiliates: señal de rebranding a "sistema operativo".

## Cambios técnicos encontrados

### Rendimiento y datos
- Sincronización cada 15 min (v3) → tareas programadas continuas "24/7" (v4).
- Minero ilimitado en Starter; en /pricing todavía dice "~200 búsquedas/mes, 2 QC por búsqueda" (incoherencia entre landing y precios).
- Cifras publicadas: 2.807.929 anuncios, 5.394 ofertas, 65 Mega Winners.

### Seguridad y arquitectura
- Next.js en Vercel, Supabase (base y login), Whop (pagos), Sentry (errores), Skool (comunidad). Misma pila que SUPERNOVA.
- Cabeceras correctas (HSTS, nosniff, frame-ancestors self, referrer-policy). `/admin` bloqueado en robots.
- **Publican los embudos de usuarios en su propio dominio** (`quantumminer.site/p/…`), HTML generado por IA junto a la sesión de la app. Es el riesgo que nuestro manual prohíbe.
- Login y textos legales siguen diciendo v3.0; solo la landing dice v4.0. La v4 es marketing + módulo nuevo, no una reescritura.

### Interfaz y UX
- Embudo completo en ~186 QC; una página en su dominio "el mismo día".
- Páginas generadas con estructura fija: hero → problema → ejemplos → método → "resultados científicos" → bonos → testimonios → stack de valor → FAQ → cierre con urgencia. Con contadores ("47 accesos restantes"), testimonios y cifras que nadie verifica. Ese estilo choca con nuestra regla ética; para nosotros no es algo que copiar.
- Tercer embudo revisado sin pixel: el usuario no lo configuró y la plataforma no lo obliga.

### Nuevas funciones
- A/B por sección: cada botón lleva `utm_content` (value_stack, sticky_cta, final_cta, emotional_desire) y `sck=<uuid>__control__<sección>`. Miden clics por bloque, pero la venta ocurre en Hotmart (`checkoutMode=10`): **no ven ventas, ni LTV, ni recurrencia.**
- Pixel de Meta del usuario inyectado por página (ids distintos por embudo).
- Precios localizados por país y traducción del embudo al idioma elegido.
- Comunidad con 2 sesiones en vivo semanales; precio escalonado por miembros (39 → 49 → 59 → 69 al llegar a 300).

## Dónde estamos frente a ellos

| Pieza | Quantum v4.0 | SUPERNOVA hoy |
|---|---|---|
| Datos frescos | Dicen 600+/día | Radar sin anuncios reales desde julio (según prueba del 19-sep); `bulk-seed-ads` cada hora |
| Curación | Clasificador Claude + 4 tiers | `winner_score` (longevidad + escala), sin filtro "solo digital" ni tiers |
| Construir | Modelar/Crear/Sofisticar | Generadores de texto (`ecosystem`), sin páginas |
| Publicar | Dominio propio + subdominio + SSL + pixel + CAPI | Nada |
| Medir | Clics por sección (UTM/sck) | Tablas `funnels`, `funnel_events`, `funnel_leads` sin uso |
| Números del negocio | No tienen | Plan aprobado: Mapa del negocio con LTV y CPA máximo |
| Retención | Comunidad y llamadas | Vigilancia de ofertas + reporte cada 15 días (aprobados) |
| Cobro | Whop, sin prueba | Whop, PRO con 3 días de prueba |
| Precio de entrada | US$29 sin construir | PRO ~US$29 |

## Recomendación estratégica (qué priorizar)

1. **Datos primero (bloqueante).** Verificar en producción que el Radar vuelve a recibir anuncios reales y mostrar "visto activo hace N días". Contra "600 ofertas nuevas al día", un radar quieto es la debilidad que más se nota en una demo.
2. **Mapa del negocio con LTV (Fase 1, ya aprobada).** Es lo único que Quantum no puede mostrar: precio real del checkout, order bump, escalera propuesta, LTV y CPA máximo. Diferencia vendible en semanas, no meses.
3. **Tiers y filtro "solo digital" en Ofertas.** Barato: clasificar con IA una vez por oferta (no por anuncio) y etiquetar 4 niveles a partir del `winner_score` existente, sin cambiar la fórmula ni ocultar anuncios viejos. Cierra la brecha de percepción con su "4 tiers".
4. **Construir y publicar (Fase 2), pero en dominio aparte y sin sus vicios.** Publicar con pixel obligatorio, sin contadores falsos ni testimonios inventados, y con eventos por paso en `funnel_events`. Requiere comprar dominio y plan Pro de Supabase (decisiones pendientes).
5. **LTV real (Fase 3).** Webhooks de Hotmart/Whop/Stripe del usuario: ventas reales por paso. Ni Quantum ni las herramientas de espionaje lo tienen.
6. **Afiliados.** Ellos pagan 40 % recurrente por Whop. Si SUPERNOVA no tiene programa, cada creador de contenido en LATAM tiene un motivo para recomendarlos a ellos. Decisión comercial de Jean.

## Lo que NO hay que copiar
- Publicar en el dominio de la app.
- Urgencia falsa, contadores, "resultados científicos" y testimonios sin fuente.
- Promesas de ingresos en la página de afiliados ("100 clientes = US$2.360/mes").

## Pendiente de verificar
- Cifras de volumen (2,8 M anuncios, 600/día): no hay forma pública de comprobarlas.
- Canal de YouTube @Quantumminers: no se pudo leer; probablemente no relacionado.
- Anuncios propios en Meta Ad Library: la consulta falló (socket hang up); repetir con la skill `competitive-ads-extractor`.
