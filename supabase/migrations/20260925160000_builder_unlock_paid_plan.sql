-- "Crear producto" también se desbloquea al COBRARSE el plan (decisión de Jean, 25-sep-2026).
--
-- Antes (20260924110000_builder_unlock.sql): solo con una recarga o aporte pagado. Así quien
-- pagaba sus US$29,99 no podía escribir su ebook con los créditos del plan y terminaba en
-- ChatGPT. Ahora: la persona crea un producto mínimo viable dentro de SUPERNOVA.
--
-- Sigue BLOQUEADO durante los 3 días de prueba (status 'trialing'): no se gasta IA con alguien
-- que todavía no pagó. Whop pasa la suscripción a 'active' con payment.succeeded /
-- invoice_paid, o al activarse una membresía que no es de prueba (whop-webhook mapEvent).
-- 'past_due' y 'canceled' no desbloquean.
--
-- La suscripción se reconoce por user_id o, si el webhook llegó antes de que existiera la
-- cuenta, por el correo CONFIRMADO del usuario (1 de las 3 filas actuales no trae user_id).

create or replace function public.builder_unlocked(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_user, 'admin'::public.app_role)
      or exists (select 1 from public.credit_transactions where user_id = p_user and action = 'recharge')
      or exists (
        select 1 from public.subscriptions s
        where s.status = 'active'
          and (s.user_id = p_user
               or (s.user_id is null and lower(s.email) = (
                     select lower(u.email) from auth.users u
                     where u.id = p_user and u.email_confirmed_at is not null)))
      );
$$;
revoke all on function public.builder_unlocked(uuid) from public, anon, authenticated;
grant execute on function public.builder_unlocked(uuid) to service_role;
