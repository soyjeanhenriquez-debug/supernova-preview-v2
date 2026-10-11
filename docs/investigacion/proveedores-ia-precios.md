# Proveedores de IA: precios de costo (para fijar créditos)

Regla del manual: precio al cliente ≥ costo real × 5 (piso 3×), con el crédito más barato (~US$0,008).
Créditos = costo en US$ ÷ 0,008 × 5, redondeado hacia arriba a múltiplos de 5.

## APIMart (apimart.ai) — lista que pasó Jean el 03-oct-2026, columna "precio actual"

Revendedor/pasarela: un solo API para cientos de modelos, pago por uso, desde US$1. Modelos "-ext" = rutas propias de APIMart.

### Video (por segundo, salvo "por gen")
| Modelo | Calidad | Costo | 5 s | Créditos (5×) |
|---|---|---|---|---|
| seedance-2.0-mini | 480P | US$0,0100/s | US$0,050 | 35 |
| seedance-2.0-mini | 720P | US$0,0217/s | US$0,109 | 70 |
| seedance-1-0-pro-fast | 720P | US$0,0190/s | US$0,095 | 60 |
| seedance-1-5-pro | 720P | US$0,0418/s | US$0,209 | 135 |
| kling-v2-6 | estándar | US$0,0350/s | US$0,175 | 110 |
| kling-v3 | estándar | US$0,0638/s | US$0,319 | 200 |
| veo3.1-lite-ext | por gen | US$0,0665/gen | — | 45 por clip |
| veo3.1-fast-ext | por gen | US$0,133/gen | — | 85 por clip |
| MiniMax-Hailuo-02 | 512P | US$0,0099/s | US$0,050 | 35 |

### Imagen (por imagen)
| Modelo | Costo | Créditos (5×) |
|---|---|---|
| gpt-image-2-ext (1K) | US$0,0081 | 5 |
| z-image-turbo | US$0,0095 | 10 |
| nano-banana-ext | US$0,0119 | 10 |
| nano-banana-2-ext (1K) | US$0,0143 | 10 |
| seedream-5-0-lite | US$0,0266 | 20 |

Hoy pagamos Gemini Flash Image directo (~US$0,039/imagen) y cobramos 25 créditos.

## fal.ai (tabla media_models, lo que usa la app hoy)
Seedance 1.5 Pro US$0,13 / 5 s (85 créditos) · Kling AI Avatar US$0,28 / 5 s (175) · Kling 3.0 US$0,42 / 5 s (265).

## Higgsfield (referencia de competencia)
API (blog oficial, sep-2026): Kling 2.5 US$0,042/s · Kling 2.6 US$0,07/s · Seedance 2.5 US$0,0738/s · Kling 3.0 US$0,112/s.
App: Starter US$19 = 270 créditos; un clip de 8 s con Kling 3.0 = 20 créditos (~US$1,41).

## Pendiente
- APIMart necesita cuenta y llave (secreto APIMART_API_KEY en Supabase, nunca en el repo ni en el chat).
- Riesgo: es un intermediario; mantener fal.ai como respaldo si APIMart falla.

## APIMart vs RunningHub (07-oct-2026)

Precios de RunningHub por capturas de Jean. APIMart: página de cada modelo, columna "precio actual". Costos
reales de APIMart en `ai_usage`: gpt-image-2 0,0081 · nano-banana-2-ext 0,0143 · nano-banana-pro-ext 0,0285 ·
seedance-2.0-mini 720p 0,0217/s.

| Modelo (720p) | APIMart | RunningHub | Más barato |
|---|---|---|---|
| GPT Image 2 | 0,0081 | 0,009 Stable texto→imagen · 0,027 Stable imagen→imagen · 0,015 Economy | APIMart |
| Nano Banana 2 | 0,0143 | 0,027 Economy · 0,07 Stable | APIMart (2×) |
| Nano Banana Pro | 0,0285 | 0,06 Economy · 0,12 Stable | APIMart (2–4×) |
| Seedance 2.0 Mini | 0,0217/s | 0,05/s | APIMart (2,3×) |
| Seedance 2.0 Fast | 0,0813/s | 0,08/s | empate |
| Seedance 2.0 | 0,1349/s | 0,10/s | RunningHub (−26 %) |
| Seedance 2.0 con video de referencia (Genjutsu) | 0,0815/s × (seg. de referencia + seg. generados) | 0,10/s (no dice si cobra la referencia) | depende del largo de la referencia |
| Seedance 2.5 | no lo ofrece | ~0,29/s (US$1,454 por 5 s) | solo RunningHub |
| Seedance 1.5 Pro | 0,0418/s | 0,01/s | RunningHub (4×) |

Ojo: algunas tarjetas de RunningHub dicen "/null" en vez de "/seconds"; confirmar con el botón Run (5 s 720p).
