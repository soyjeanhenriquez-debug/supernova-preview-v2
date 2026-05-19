# Panel Admin SUPERNOVA — Plan de implementación

Este es un proyecto muy grande (8 secciones, ~30 sub-features, nuevas tablas, edge functions, agente IA con aprendizaje). Lo entrego por **fases verificables** para no romper nada y poder iterar.

Antes de empezar necesito confirmar 3 puntos clave (ver "Decisiones pendientes" al final).

---

## Fase 0 — Fundación (rol admin + ruta protegida)

- Migración: tabla `user_roles` + enum `app_role` (admin/moderator/user) + función `has_role()` security definer (patrón obligatorio en este stack).
- Asignar rol `admin` a tu user_id actual (me lo pides o lo detecto por email).
- Nueva ruta `/admin` en `App.tsx` (montar `BrowserRouter` siempre, hoy solo monta si hay user — ya está bien) con guard que verifica `has_role(uid,'admin')`. Redirige a `/` si no es admin.
- Layout `AdminLayout` con sidebar secundario (8 items) usando el mismo design system (Apple Space Black + amber).
- Nada de esto toca páginas existentes — solo añade.

## Fase 1 — Overview

- 4 KPIs reales desde Supabase: `auth.users` count, activos hoy (vía `ad_history.visited_at`), créditos hoy (nueva tabla `credit_transactions`), búsquedas hoy (`landing_analyses` + `ad_history`).
- Feed live últimas 2h (unión de eventos de varias tablas, polling cada 30s).
- 3 gráficos Recharts (línea/barras/pie).
- Top performers (4 listas).

## Fase 2 — Usuarios

- Tabla con paginación, búsqueda, filtros.
- Modal "perfil completo" con timeline.
- Acciones: añadir/quitar créditos, cambiar plan, suspender, eliminar.
- **No incluyo** "impersonar usuario" en esta fase — requiere arquitectura de auth especial (service-role + session swap) que merece su propia conversación.

## Fase 3 — Keywords & Fuentes

- CRUD sobre tabla `keywords` existente + nueva `platforms` + nueva `keyword_rotation_config`.
- Botón "Probar ahora" que invoca `search-winning-ads`.

## Fase 4 — Créditos & Planes

- Nueva tabla `plans` (editable) y `credit_costs` (editable, sustituye el hardcode actual en `useCredits.ts`).
- Migrar `useCredits.ts` a leer costes desde DB y registrar transacciones en `credit_transactions`. **Esto sí toca código compartido** (necesario para que Overview muestre datos reales). Lo hago de forma retro-compatible.
- Tabla de transacciones globales con export CSV.
- Gestión masiva.

## Fase 5 — Mensajes & Comunicación

- Tablas `notifications`, `banners`, `feedback`, `email_templates`.
- UI de creación + segmentación + programación.
- Componente `<BannerHost>` que se monta en `Index.tsx` (única tocada fuera de /admin, mínima) para mostrar banners activos.

## Fase 6 — Analytics

- Vistas SQL + Recharts: retención, conversión, funnel, drop-off, keywords.
- Export CSV.

## Fase 7 — Agente IA Admin

- Edge function `admin-agent` (reutiliza patrón de `ai-chat` pero con system prompt admin + acceso vía service-role a métricas anonimizadas).
- Tabla `admin_agent_proposals` (observation, proposal, confidence, status, created_at, reviewed_at, approved_by).
- Cron pg_cron diario que ejecuta análisis y genera propuestas.
- UI: chat + cola de aprobación + instrucciones permanentes (`admin_agent_instructions`).

## Fase 8 — Configuración del Sistema

- Tabla `system_config` (key/value).
- UI para nombre/logo/colores/mensajes/API keys (las API keys siguen como secrets reales, aquí solo botón "probar conexión").
- Health check de edge functions.
- Logs vía `supabase analytics_query`.

---

## Decisiones pendientes (responde antes de empezar)

1. **Tu email/user_id de admin** — para asignarte el rol en Fase 0. ¿Cuál usas?
2. **Sistema de planes** — actualmente `useCredits` es 100% localStorage con balance fijo 3000. ¿Migramos a planes reales en DB (free/pro/agency con precios) o solo dejo la configuración de costes editable y planes como cosmético por ahora?
3. **Entrega** — ¿hago Fase 0→8 completas de seguido (será un cambio enorme en una sola tanda, alto consumo de créditos), o paro tras cada fase para que verifiques?

Mi recomendación: **una fase por mensaje**, empezando por Fase 0+1 juntas. Confirma y arranco.
