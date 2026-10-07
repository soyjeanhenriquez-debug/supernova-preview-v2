-- Edad y país de cada persona (07-oct-2026, decisión de Jean: "preguntemos siempre al usuario si es
-- mayor de edad"). Se pregunta al entrar, como hace Prime IA.
--
-- Por qué una tabla aparte y no `profiles`: `profiles` la puede editar el propio usuario desde el
-- navegador. Esta solo se escribe con set_age_country (SECURITY DEFINER) y la EDAD queda fija una
-- vez declarada (si se equivocó, la corrige un admin). Así, más adelante, cualquier sección solo
-- para mayores de 18 puede preguntar al servidor (is_adult() / private.is_adult_user(uid)) sin confiar en el navegador.
-- El país sirve también para mostrar precios en la moneda local. La persona lo puede cambiar.

CREATE TABLE IF NOT EXISTS public.user_age_country (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  birth_year  smallint NOT NULL CHECK (birth_year BETWEEN 1900 AND 2030),
  age_at_declaration smallint NOT NULL CHECK (age_at_declaration BETWEEN 10 AND 110),
  country     char(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  declared_at timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_age_country ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edad y país: leer lo propio o admin" ON public.user_age_country
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::public.app_role));
REVOKE ALL ON public.user_age_country FROM anon, authenticated;
GRANT SELECT ON public.user_age_country TO authenticated;

-- Guardar edad y país. La edad solo la primera vez; el país, cuando quiera.
CREATE OR REPLACE FUNCTION public.set_age_country(p_age integer, p_country text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_country text := upper(btrim(coalesce(p_country, '')));
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_auth'); END IF;
  IF v_country !~ '^[A-Z]{2}$' THEN RETURN jsonb_build_object('ok', false, 'error', 'country'); END IF;
  IF EXISTS (SELECT 1 FROM public.user_age_country WHERE user_id = v_uid) THEN
    UPDATE public.user_age_country SET country = v_country, updated_at = now() WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', true, 'age_locked', true);
  END IF;
  IF p_age IS NULL OR p_age < 10 OR p_age > 110 THEN RETURN jsonb_build_object('ok', false, 'error', 'age'); END IF;
  INSERT INTO public.user_age_country (user_id, birth_year, age_at_declaration, country)
  VALUES (v_uid, extract(year FROM now())::int - p_age, p_age, v_country);
  RETURN jsonb_build_object('ok', true);
END $function$;

-- ¿Es mayor de 18? (con lo que declaró). private.is_adult_user(uid) para compuertas del servidor;
-- public.is_adult() solo responde por quien pregunta (nadie consulta la edad de otro).
CREATE OR REPLACE FUNCTION private.is_adult_user(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT coalesce((SELECT a.age_at_declaration + (extract(year FROM now())::int - extract(year FROM a.declared_at)::int) >= 18
                   FROM public.user_age_country a WHERE a.user_id = p_user), false);
$function$;

CREATE OR REPLACE FUNCTION public.is_adult()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ SELECT private.is_adult_user(auth.uid()) $function$;

REVOKE ALL ON FUNCTION public.set_age_country(integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_adult() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_adult_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_age_country(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_adult() TO authenticated;
