## SUPERNOVA — Transformación Maestra

Voy a transformar SUPERNOVA en la plataforma definitiva de inteligencia para Direct Response Marketing. Implementación en 9 fases secuenciales, sin romper lo existente.

### Fase 1 — Sistema de diseño (colores naranja/negro intensos)
Actualizar `src/index.css` y `tailwind.config.ts`:
- Background más negro: `--bg-void: #000`, `--bg-deep: #0A0A0A`, `--bg-card: #181818`
- Primario naranja saturado: `#F97316` (orange) + `#F59E0B` (amber)
- Bordes sutiles `rgba(255,255,255,0.08)` con variantes naranja
- Sidebar activo: fondo naranja oscuro + borde izquierdo 3px

### Fase 2 — Sidebar limpio
Reordenar `src/components/Sidebar.tsx`:
```
⚡ Dashboard
🏆 Anuncios Ganadores
🤖 Agentes DR
💬 Chat IA
📋 Generadores
🗂️ Proyectos
💰 Créditos
🛡️ Admin (solo admin)
```
Eliminar: Campañas, Espía, Biblioteca, Plantillas. Añadir bloque inferior **SUPERNOVA BRAIN** con contadores de proyectos por modo.

### Fase 3 — Dashboard refocused (`DashboardPage.tsx`)
- 4 stats: anuncios analizados hoy, búsquedas, proyectos BRAIN, créditos restantes
- 2 acciones rápidas grandes (Buscar / Sofisticar)
- 3 proyectos recientes con progreso por pilar
- Barra de créditos con renovación

### Fase 4 — Anuncios Ganadores (módulo estrella)
Reescritura completa de `WinningAdsPage.tsx`:
- Header con badge "ACTUALIZADO HACE X min" (timer en vivo)
- Stats bar global (47,832 total, 8,241 únicos, 312 mega, etc.)
- Input "Analizar URL del Ads Library" (1 crédito)
- **Selector de mercado** con tabs de banderas (Todos/EN/ES/PT/RU)
- Input de búsqueda con placeholder dinámico
- **Chips de keywords** por mercado (cambian al cambiar idioma)
- Filtros sticky: días, repeticiones, tipo, mercado, score, orden
- Sección "OFERTAS ESCALANDO"
- **Tarjetas rediseñadas**: tier dorado/azul/verde, tipo, mercado con bandera, plataforma checkout, badges de días/duplicados con animación pulsante en altos valores, barra "Despegando" con label dinámico, botón SOFISTICAR
- 12+ ads demo realistas (BR salud, US make money, ES fitness, RU educación, LATAM crypto…) con grupos de duplicados

### Fase 5 — Modal SOFISTICAR (3 modos)
Nuevo componente `SofisticarModal.tsx`:
- Paso 1: contexto del anuncio
- Paso 2: elegir modo (Sofisticar / Adaptar / Blueprint)
- **Sofisticar** (2 créditos): inputs (mercado, producto propio, presupuesto) + stream IA con formato exacto especificado
- **Adaptar** (1 crédito): recreación cultural ES/EN
- **Blueprint** (3 créditos): análisis profundo

Edge function `sofisticar-ad/index.ts` usando Lovable AI Gateway (google/gemini-3-flash-preview) con streaming.

### Fase 6 — SUPERNOVA BRAIN
- Bloque en sidebar (parte inferior)
- Nueva página `BrainPage.tsx` con los **6 Pilares** (Detectar → Analizar → Diseñar → Producir → Lanzar → Escalar)
- Lista de proyectos con pilar actual, barra de progreso, fecha
- Click en proyecto → detalles + marcar pilares + notas
- **Persistencia en localStorage** (sin Supabase)
- Hook `useProjects.ts` para CRUD local

### Fase 7 — Modo Crear / Pain Discovery
Nueva página `CrearPage.tsx`:
- Input de nicho + fuentes (Reddit/Google/Product Hunt)
- Llamada real a Google Autocomplete (con fallback demo si CORS)
- Edge function `pain-discovery/index.ts` que pasa señales a IA
- Output formateado: dolores con intensidad, ideas de producto
- Botón "Crear Proyecto desde este Dolor" → guarda en BRAIN

### Fase 8 — Página Créditos
Nueva `CreditsPage.tsx`:
- Círculo grande con balance
- Tabla de costos por acción
- 3 planes (Free/Pro/Agency) con Pro destacado
- Historial de últimas 20 acciones (localStorage)

### Fase 9 — Sistema de créditos
- Hook `useCredits.ts` con localStorage (balance + historial)
- Decrementar en cada acción (buscar, analizar, sofisticar, etc.)
- Mostrar badge de crédito en cada botón
- Bloquear acciones si balance < costo + toast

### Lo que NO se toca
- Rutas del router (solo añadir nuevas)
- Autenticación
- Chat IA y Generadores existentes
- Agentes DR existentes

### Detalles técnicos
- **Edge functions nuevas**: `sofisticar-ad`, `pain-discovery` (Lovable AI Gateway, modelo Gemini Flash, streaming markdown)
- **Hooks nuevos**: `useProjects`, `useCredits`, `useUpdatedSince` (timer del badge)
- **Componentes nuevos**: `SofisticarModal`, `MarketTabs`, `KeywordChips`, `QualityFilters`, `AdCard` (refactor), `BrainSidebarBlock`, `PillarTracker`
- **Persistencia**: localStorage para proyectos/créditos/historial (evitar consumo de migraciones DB)
- **No mock data en producción real** — los demos solo cuando Firecrawl/datos reales no devuelven nada

Implementaré fase por fase, confirmando progreso al final de cada bloque mayor.