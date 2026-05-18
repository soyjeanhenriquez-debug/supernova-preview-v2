# Landing Page Intelligence Analyzer

Nueva feature dentro de **Buscar Ofertas Winner** (`/winning-ads`). Pegar una URL → SUPERNOVA hace fetch de la landing, busca anuncios activos del anunciante en Facebook Ads Library, y genera un Informe de Inteligencia completo con IA. Resultado se guarda en historial.

## Alcance
Solo se toca el módulo Winning Ads. No se modifican otras páginas.

## Decisión técnica importante
El spec menciona Claude + `ANTHROPIC_API_KEY`. **Usaré Lovable AI Gateway con `google/gemini-2.5-pro`** (sin API key del usuario, alta calidad para razonamiento). Si prefieres Claude explícitamente, lo cambio y pediré la key.

## Cambios

### 1. Base de datos
Tabla `landing_analyses`:
- `user_id`, `url`, `domain`, `brand_name`, `analysis_text` (markdown), `ads_found` (jsonb con los 5 mejores ads), `created_at`
- RLS: cada usuario ve solo los suyos (ALL own).

### 2. Edge Functions (nuevas)
- **`fetch-landing`** — recibe `{ url }`, hace fetch server-side con User-Agent realista, extrae `title`, `metaDescription`, `ogTitle`, `ogDescription`, `ogImage`, `bodyText` (primeros 4000 chars limpios). Maneja errores devolviendo `success: false` para que el cliente muestre fallback manual (textarea).
- **`analyze-landing`** — recibe `{ landingUrl, landingContent, activeAds, domain, brandName }`, llama a Lovable AI Gateway (`google/gemini-2.5-pro`) con el system prompt de analista DR y el prompt estructurado de 9 secciones del spec. Maneja 429/402. Devuelve `{ analysis: string }`.

Ambas con CORS estándar.

### 3. UI nueva en `WinningAdsPage.tsx`
- **`IntelligenceAnalyzerCard`** (arriba de la lista de ads): input URL grande estilo Apple + botón ⚡ ANALIZAR + texto de ejemplos. Antes de ejecutar muestra modal "Cuesta 5 créditos ¿continuar?".
- **`AnalyzerProgress`**: panel inline que muestra los 6 pasos con ✅/⏳ en tiempo real (paso 1 validar URL → paso 6 generar blueprint).
- **`IntelligenceReportModal`** (Dialog fullscreen): header con dominio + fecha + botones Guardar/Copiar, fila scroll horizontal con tarjetas compactas de los anuncios encontrados, informe markdown renderizado con React-Markdown en `Accordion` (9 secciones colapsables), y barra de "Acciones rápidas" con 4 botones que enlazan al pipeline existente (Sofisticar, Blueprint, Generar landing, Funnel completo).
- **`SavedAnalysesList`**: sección colapsable al final de la página con historial desde `landing_analyses`, acciones Ver/Eliminar.
- **Fallback manual**: si `fetch-landing` devuelve `success:false`, mostrar textarea para pegar copy y reintentar con ese texto.

### 4. Hook `useLandingAnalyzer`
Orquesta los 6 pasos en paralelo donde se pueda:
1. validar URL y extraer dominio
2. `fetch-landing`
3. en paralelo: `facebook-ads` por dominio + por brandName extraído (combina y deduplica por `id`)
4. `analyze-landing`
5. persistir en `landing_analyses`
6. retornar `{ analysis, ads, savedId }`

Expone `status` por paso para el progress UI. Consume 5 créditos con `useCredits.consume('analyze_url', ...)` (extiendo `CREDIT_COSTS.analyze_url` de 1 → 5 únicamente para esta acción nueva, o añado nuevo action `landing_intelligence: 5` para no romper otros usos — usaré **nuevo action `landing_intelligence`**).

### 5. Créditos
Añadir `landing_intelligence: 5` a `CREDIT_COSTS` y `ACTION_LABEL` en `useCredits.ts`.

## Orden de implementación
1. Migración tabla `landing_analyses` + RLS
2. Edge function `fetch-landing`
3. Edge function `analyze-landing`
4. Hook `useLandingAnalyzer`
5. Componentes UI (Analyzer card, Progress, Report modal, Saved list)
6. Integrar en `WinningAdsPage.tsx`

## Detalles técnicos
- Markdown: ya existe `react-markdown` en el proyecto (memoria del tema).
- Estilo: hairline Apple Space Black, amber `#f7a93d` reservado solo para CTA ANALIZAR y badges de "winner". Sin glows.
- No mock data — todo real desde Supabase + edge functions.
- Idiomas: análisis siempre en español (system prompt lo fuerza).

¿Apruebas y procedo? (Confirma también si OK usar Gemini 2.5 Pro vía Lovable AI en lugar de Claude — evita pedirte una API key).