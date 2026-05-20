## Dashboard Millonario y Gamificado — SUPERNOVA

Rediseño completo del Dashboard con sistema de gamificación (racha, misiones, XP, niveles, insignias) manteniendo toda la funcionalidad existente.

### 1. Base de datos (Supabase)

Crear tabla `user_gamification`:
- `user_id` (PK, FK auth)
- `xp` int default 0
- `level` int default 1
- `streak_days` int default 0
- `last_login_date` date
- `badges` text[] default '{}'
- `total_hours_saved` numeric default 0
- `created_at`, `updated_at`

RLS: usuario solo ve/modifica el suyo. Trigger updated_at.

Función RPC `register_daily_login()` que:
- Si `last_login_date = today` → no hace nada
- Si `last_login_date = today - 1` → streak +1
- Si gap > 1 día → streak = 1 (rompe racha)
- Devuelve `{ streak, broke, milestone }`

Función RPC `add_xp(amount, reason)` que suma XP, recalcula nivel y desbloquea badges nuevos.

### 2. Frontend — DashboardPage rediseñado

Componentes nuevos en `src/components/dashboard/`:
- `HeroJarvis.tsx` — saludo + JARVIS escaneando hace X horas + pills + card derecha "JARVIS ACTIVO" con stats reales
- `StreakWidget.tsx` — racha + 7 círculos L-D + barra hacia badge semanal
- `StatCardSparkline.tsx` — card con sparkline SVG (sin Chart.js, SVG inline para no inflar bundle) usando datos reales de `credit_transactions` últimos 7 días
- `DailyMissionWidget.tsx` — 3 misiones rotativas por día con localStorage `mission_YYYY-MM-DD`, +50c bonus al completar (vía `admin_adjust_credits` o nueva RPC `award_mission_bonus`)
- `LevelXPWidget.tsx` — nivel, barra XP, insignias
- `DailyQuoteWidget.tsx` — 30 frases, rota por día del mes
- `LevelUpModal.tsx` — celebración con `canvas-confetti`

### 3. Hooks nuevos
- `useGamification.ts` — lee/escribe user_gamification, expone `xp, level, streak, badges, addXP, registerLogin`
- `useDailyMission.ts` — gestiona misiones del día en localStorage + sincroniza con acciones reales (escucha eventos de `useCredits`)
- `useActivitySeries.ts` — agrupa `credit_transactions` por día últimos 7 días por tipo de acción

### 4. Integración con acciones existentes

En `useCredits.consume()` después de éxito → emitir evento `window.dispatchEvent('supernova_action', { detail: action })` para que misiones y XP se actualicen sin tocar cada página.

`useGamification` y `useDailyMission` escuchan este evento.

### 5. Dependencias
Añadir `canvas-confetti` (~3KB) para celebraciones. NO añadir Chart.js — sparklines en SVG puro (más ligero, sin CDN).

### 6. Secciones que se mantienen (sin cambios funcionales)
- HeatMap (añadir selector período HOY/7D/30D y % cambio)
- RisingTemperatureWidget (mantener)
- Proyectos recientes (añadir % visible y "Continuar" en hover)
- Quick actions (rediseño visual: ícono grande con fondo de color)
- Créditos (panel mantenido)

### 7. Animaciones (CSS en index.css)
- `@keyframes flicker` para fueguitos
- `@keyframes pulse-amber` para borde card JARVIS
- Hover translateY(-2px) en cards
- Barras de progreso con `transition: width 1s ease-out`
- CountUp ya existe (`src/components/CountUp.tsx`) ✓

### Detalles técnicos

```text
DashboardPage
├── HeroJarvis (grid 60/40)
├── StreakWidget
├── 4× StatCardSparkline (grid)
├── DailyMissionWidget
├── LevelXPWidget
├── DailyQuoteWidget
├── HeatMap (con selector período)
├── RisingTemperatureWidget
├── QuickActions rediseñadas
├── Proyectos recientes
└── Panel créditos
```

### Orden de ejecución
1. Migración `user_gamification` + RPCs (`register_daily_login`, `add_xp`, `award_mission_bonus`)
2. Hooks `useGamification`, `useDailyMission`, `useActivitySeries`
3. Componentes nuevos en `dashboard/`
4. Refactor `DashboardPage.tsx` componiendo todo
5. Animaciones en `index.css`
6. Emitir evento desde `useCredits`
7. Instalar `canvas-confetti`

### Notas
- Rotación de misiones: día del año % 5 → set A-E
- Rotación de frase: día del mes % 30 → frase N
- XP por acción mapeado en `useGamification` (search:5, sofisticar:15, oraculo:25, blueprint:30)
- Insignias auto-desbloqueables al cruzar thresholds dentro de `add_xp` (en SQL para evitar trampas client-side)
- "Horas ahorradas" = transacciones totales × factor por tipo (search=0.25h, sofisticar=2h, oraculo=4h, blueprint=6h)

¿Procedo con esta implementación?
