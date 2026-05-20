# Seguridad Enterprise SUPERNOVA — Plan Adaptado

Adapto los 6 bloques del prompt a la arquitectura real (Vite SPA + `user_roles` + `has_role()`), migrando créditos a DB para habilitar control admin real. Se ejecuta en orden, sin romper nada existente.

## Resumen ejecutivo

| # | Bloque | Cambio principal |
|---|--------|------------------|
| 0 | Migración créditos a DB | Nuevas tablas `user_credits` + `credit_ledger`. `useCredits` lee/escribe en DB. localStorage queda como fallback de transición. |
| 1 | Infra seguridad | `audit_log`, `active_sessions`, `blocked_ips`, `system_config`, `rate_limits` + funciones. Todo con `has_role()`. |
| 2 | Guard SPA | `RequireAccess` en React: chequea `maintenance_mode`, role `suspended`, approved_emails. Reemplaza el middleware Next. |
| 3 | Edge `admin-delete-user` | Borra usuario de `auth.users` con service_role + audit. |
| 4 | Panel Admin | Refactor `/admin/usuarios` con acciones + nuevas páginas `/admin/audit`, `/admin/sesiones`, `/admin/config`, `/admin/salud`. |
| 5 | Auth en edge functions de usuario | Helper compartido `requireUser()` aplicado a `ai-chat`, `oraculo-generate`, `analyze-landing`, `analyze-ad`, `sofisticar-ad`, `pain-discovery`, `pillar-assist`, `spy-analyze`, `winner-blueprint`, `fetch-landing`, `tiktok-search`. |
| 6 | Limpieza datos inventados | Barrido `Math.random`/hardcoded → `null` solo donde se muestra al usuario como métrica real. Banner demo solo para admin. |

---

## Detalles técnicos

### Bloque 0 — Migración créditos a DB (PRE-REQUISITO)

Migración nueva:
```sql
CREATE TABLE public.user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 2000,
  monthly_grant INT NOT NULL DEFAULT 2000,
  last_grant_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY uc_select_own ON public.user_credits FOR SELECT USING (auth.uid()=user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY uc_admin_all ON public.user_credits FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Trigger en handle_new_user para crear row con 2000 al registrarse
-- RPC consume_credits(p_amount, p_action, p_label) atómico (SECURITY DEFINER)
-- RPC grant_monthly_if_due() chequea aniversario
```

`useCredits.ts` se reescribe: lee de `user_credits` vía supabase, inserta en `credit_transactions` (esquema actual: `action/cost/label/meta`). `CreditsPage` y `LowCreditBanner` consumen el balance de DB. Sin tocar `profiles`.

### Bloque 1 — SQL adaptado

- `audit_log`, `active_sessions`, `blocked_ips`, `system_config`, `rate_limits` con RLS usando `has_role(auth.uid(),'admin')` en vez del `profiles.role` inexistente.
- `system_config` poblada con las 30+ claves del prompt (créditos, packs, límites, features, sistema).
- Funciones: `log_action`, `check_rate_limit`, `admin_adjust_credits` (opera sobre `user_credits` nuevo, no `profiles`), `admin_toggle_user_status` (añade `suspended` al enum `app_role` y maneja `user_roles` + `approved_emails`), `admin_terminate_session`.
- `FORCE RLS` solo en tablas de usuario: `profiles, ad_favorites, ad_history, agents, library_items, templates, keywords, landing_analyses, campaigns, credit_transactions, user_credits, rate_limits, active_sessions`. NO en `winning_ads, temperature_snapshots, ad_media_cache, master_keyword_runs, master_keyword_state, scraper_settings, system_learnings, audit_log, approved_emails, access_requests, blocked_ips, system_config, user_roles`.

### Bloque 2 — Guard SPA (sin Next)

Nuevo `src/components/RequireAccess.tsx`:
- Lee `useAccessStatus` (ya existe) + chequea `system_config.maintenance_mode` + chequea si role del usuario es `suspended`.
- Si suspended → `signOut()` + redirect `/auth?error=suspended`.
- Si maintenance y no admin → `/auth?error=maintenance`.
- Hace upsert en `active_sessions` (background, no bloquea).
- Se envuelve alrededor de las rutas autenticadas en `App.tsx`.

### Bloque 3 — Edge `admin-delete-user`

Idéntica al prompt, valida admin vía `user_roles` (no `profiles.role`). Loguea a `audit_log`.

### Bloque 4 — Panel Admin

- `AdminUsers.tsx`: agrego columnas Créditos + acciones inline (+créditos, -créditos, suspender, activar, terminar sesión, eliminar). Modals de confirmación.
- `AdminConfig.tsx` (nuevo): grid editable de `system_config` agrupado por categoría. Switches para booleans. Auto-save on blur.
- `AdminAudit.tsx` (nuevo): tabla con filtros, color-coding por criticidad.
- `AdminSessions.tsx` (nuevo): tabla de `active_sessions` con punto verde si `last_seen < 5min`. Botón terminar.
- `AdminHealth.tsx` (nuevo): cards de RLS check, rate_limits, suspended users, scraper last run. Sin probar tokens externos (no quiero gastar API calls en cada carga).
- Añadir rutas en `AdminLayout.tsx`.

### Bloque 5 — Auth en edge functions

Helper compartido (inline en cada función, ya que edge functions no comparten imports cómodamente):
```ts
// auth + approved + not-suspended + rate_limit(30/h)
```
Aplicado a las 11 edge functions de usuario listadas. NO a `master-rotate`, `bulk-seed-ads`, `weekly-learner`, `meta-ad-proxy`, `admin-*` (son cron/internas o tienen su propio gating).

### Bloque 6 — Limpieza

Búsqueda `rg "Math\.random"` y `rg "impressions"`. Solo toco:
- Tarjetas/dashboards que muestran métricas → si no hay dato real, no renderizar el campo.
- IDs efímeros (`tiktok_${Date.now()}_${i}`), animaciones decorativas: se mantienen.
- En `WinningAdsPage`: banner "⚠️ Modo demo activo" solo si `useIsAdmin()` y el scraper no devolvió ads en >24h.

---

## Riesgos identificados

1. **Migrar créditos rompe `useCredits` consumers temporalmente** — mitigado: nueva API mantiene mismas signatures (`balance`, `consume`, `addCredits`).
2. **`FORCE RLS` en `profiles`** — `profiles_select_authenticated` usa `USING (true)` → sigue funcionando bajo FORCE. Verificado.
3. **`ALTER TYPE app_role ADD VALUE 'suspended'`** — requiere commit antes de uso. Lo aíslo en migración propia.
4. **Edge functions ya con `verify_jwt=false` en config.toml** — añadir `getClaims` en código es seguro y consistente con el resto del proyecto.

---

## Orden de ejecución y checkpoints

1. Migración 0 (créditos DB) → confirmar tabla creada
2. Migración 1 (audit + config + funciones) → confirmar
3. Migración 1b (`ALTER TYPE` suspended) → confirmar
4. Migración 1c (FORCE RLS selectivo) → confirmar
5. Refactor `useCredits` + verificar que app carga
6. Edge function `admin-delete-user` deploy
7. Helper auth + actualizar 11 edge functions
8. RequireAccess + envolver App.tsx
9. Panel admin nuevo (4 páginas + refactor users)
10. Limpieza Math.random / banner demo
11. Reporte final

Tiempo estimado de ejecución: largo (varios mensajes). ¿Apruebas el plan o quieres ajustar alcance (ej. saltar Bloque 0 y dejar créditos en localStorage, recortar panel admin, etc.)?
