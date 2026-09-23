-- "Crear producto" se desbloquea con la primera recarga pagada (decisión de Jean, 23-sep-2026):
-- primero entra dinero, después gastamos en la IA. El índice sigue gratis como muestra; escribir
-- capítulos o lecciones (con cualquier IA) exige haber comprado al menos un pack de créditos.
-- Recarga pagada = credit_transactions.action = 'recharge' (solo lo escribe grant_purchased_credits,
-- que llaman los webhooks de Whop y Stripe al cobrar un pack). Los admin siempre lo tienen.

create or replace function public.builder_unlocked(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_user, 'admin'::public.app_role)
      or exists (select 1 from public.credit_transactions where user_id = p_user and action = 'recharge');
$$;
revoke all on function public.builder_unlocked(uuid) from public, anon, authenticated;
grant execute on function public.builder_unlocked(uuid) to service_role;

-- Para la pantalla: solo sobre uno mismo.
create or replace function public.my_builder_unlocked()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.builder_unlocked(auth.uid());
$$;
revoke all on function public.my_builder_unlocked() from public, anon;
grant execute on function public.my_builder_unlocked() to authenticated;
