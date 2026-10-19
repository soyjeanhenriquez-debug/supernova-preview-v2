-- SUPERNOVA — Parte B: ADN de marca y ofertas de Jean Henríquez (19-oct-2026).
--
-- SOLO para la cuenta de Jean (soyjeanhenriquez@gmail.com). NO es una migración ni un valor por
-- defecto: no está en supabase/migrations y no corre en otros entornos. Se aplica a mano, una vez,
-- con el OK de Jean. Es idempotente: volver a correrlo deja los mismos datos (actualiza, no duplica).
-- Si la cuenta no existe con ese id y ese correo, no hace nada y avisa.
-- Todos los textos caben en su tope (medido el 19-oct-2026 en caracteres Unicode; el más largo, P8,
-- 733 de 1.200). Si alguno no cupiera, la base lo rechaza: nunca se recorta.
-- P8 (formative_experiences) queda PRIVADA: formative_editorial_ok = false.

do $seed$
declare
  jean constant uuid := '2687ca65-02c7-40db-b2fc-8ed0d57a4424';
begin
  if not exists (select 1 from auth.users where id = jean and lower(email) = 'soyjeanhenriquez@gmail.com') then
    raise notice 'Seed de Jean: no se encontró la cuenta; no se hizo nada.';
    return;
  end if;

  insert into public.brand_dna (
    user_id, identity, recognized_value, unique_perspective, target_audience, editorial_value, desired_perception,
    credibility, formative_experiences, changed_beliefs, boundaries, intrinsic_interests, communication_style,
    preferred_formats, creative_references, formative_editorial_ok
  ) values (
    jean,
    $t$Soy Jean Henríquez, emprendedor y creador digital con experiencia en ventas por internet, copywriting, VSL, embudos de venta, productos digitales y producción audiovisual. Utilizo inteligencia artificial para desarrollar negocios y automatizaciones. Actualmente estoy construyendo SUPERNOVA y desarrollando una marca personal alrededor de los negocios, las historias y las experiencias.$t$,
    $t$Mis conocidos, clientes y seguidores suelen preguntarme cómo vendo por internet, cómo consigo viajar gracias a mi actividad digital y qué herramientas utilizo. También he enseñado estrategias de marketing y ventas a otras personas, especialmente relacionadas con productos digitales y sistemas de comercialización.$t$,
    $t$Cuestiono que el éxito consista únicamente en ganar más dinero o trabajar sin descanso. Me interesa construir negocios que permitan disfrutar la vida, viajar y tener autonomía. También considero que dominar una habilidad no garantiza construir una empresa sostenible. La tecnología puede multiplicar nuestras capacidades, pero no sustituye el criterio ni la ejecución.$t$,
    $t$Hispanohablantes interesados en negocios, dinero, emprendimiento, desarrollo personal, tecnología y experiencias. Quiero atraer jóvenes adultos, profesionales, creadores y empresarios de República Dominicana, Colombia, Latinoamérica y comunidades latinas en Estados Unidos. Personas curiosas que quieren descubrir oportunidades y construir una vida mejor.$t$,
    $t$Porque comparto historias extraordinarias, descubro cómo funcionan los negocios, entrevisto personas interesantes y documento experiencias sobre viajes, gastronomía y tecnología. También comparto mis aprendizajes y mi perspectiva sobre el crecimiento personal. Quiero que disfruten el contenido y descubran nuevas posibilidades para sus vidas.$t$,
    $t$Que soy una persona que les inspira a ser mejores cada día. Que mi contenido les ayudó a cuestionar sus limitaciones, descubrir oportunidades y tomar mejores decisiones. Que disfrutan mis historias, confían en mi criterio y sienten que vale la pena acompañarme en lo que estoy construyendo.$t$,
    $t$He trabajado desarrollando estrategias de venta por internet, copywriting, VSL, embudos, productos digitales y proyectos audiovisuales. También he compartido estos conocimientos con alumnos y participado en proyectos comerciales para clientes. Actualmente experimento con automatizaciones, inteligencia artificial y creación de contenido. Los resultados cuantitativos deben respaldarse con evidencia antes de utilizarlos públicamente.$t$,
    $t$He participado en colaboraciones profesionales donde terminé involucrándome más de lo conveniente y aprendí la importancia de establecer límites, responsabilidades y condiciones claras.

También he enseñado conocimientos que otras personas consiguieron comercializar mucho mejor que yo. Esa experiencia me hizo cuestionar la diferencia entre tener una habilidad valiosa y construir una empresa capaz de aprovecharla.

He tenido proyectos empresariales que no sostuve con la constancia necesaria. Hoy quiero aprender de esas decisiones y construir sistemas que no dependan únicamente de mi motivación.

Entiendo que el conocimiento necesita ejecución, continuidad y una estructura comercial para convertirse en resultados sostenibles.$t$,
    $t$Antes daba demasiada importancia a dominar habilidades técnicas y resolver problemas para otros. Hoy considero que también necesito desarrollar mis propios activos, cuidar las relaciones profesionales y construir procesos sostenibles. Saber vender para un cliente no significa necesariamente saber desarrollar y mantener una empresa propia.$t$,
    $t$No quiero inventar resultados, prometer riqueza fácil ni aparentar una vida que no tengo. Valoro la responsabilidad personal, la coherencia, la excelencia y el respeto. Prefiero construir una reputación respaldada por experiencias reales. Tampoco quiero exponer innecesariamente la privacidad de otras personas para conseguir visualizaciones.$t$,
    $t$1. Historias humanas y empresariales extraordinarias. 2. Viajes, culturas y gastronomía. 3. Experimentos, experiencias nuevas y entretenimiento, incluidos los videojuegos. También me gustaría desarrollar documentales y videos largos para YouTube.$t$,
    $t$Me gusta comunicarme con seguridad, naturalidad, inteligencia y criterio. Utilizo español dominicano comprensible para cualquier hispanohablante. Disfruto el humor inteligente, la ironía sutil y las historias bien contadas. Prefiero argumentos concretos a frases motivacionales vacías. No quiero sonar arrogante, artificial, repetitivo ni como alguien desesperado por vender.$t$,
    $t$Entrevistas en la calle, conversaciones espontáneas, experimentos sobre negocios y dinero, storytelling, documentales, viajes, gastronomía, videos largos de YouTube y contenido cinematográfico. También quiero producir videos en mi estudio, utilizar avatares de IA cuando aporten valor y crear dinámicas naturales con mi equipo.$t$,
    $t$School of Hard Knocks por sus entrevistas a empresarios; Mark Tilbury por los experimentos sobre dinero; Ryan Trahan por sus historias y desafíos; Ramiro Cubría por comunicar perspectivas empresariales. También me atraen los creadores que combinan reflexiones personales, espiritualidad, humor y entretenimiento. Quiero aprender de sus formatos sin copiar su identidad.$t$,
    false
  )
  on conflict (user_id) do update set
    identity = excluded.identity, recognized_value = excluded.recognized_value, unique_perspective = excluded.unique_perspective,
    target_audience = excluded.target_audience, editorial_value = excluded.editorial_value, desired_perception = excluded.desired_perception,
    credibility = excluded.credibility, formative_experiences = excluded.formative_experiences, changed_beliefs = excluded.changed_beliefs,
    boundaries = excluded.boundaries, intrinsic_interests = excluded.intrinsic_interests, communication_style = excluded.communication_style,
    preferred_formats = excluded.preferred_formats, creative_references = excluded.creative_references,
    formative_editorial_ok = excluded.formative_editorial_ok;

  -- Ofertas: una fila por nombre en la cuenta de Jean (se crea si falta; si existe, se actualiza).
  create temporary table seed_offers (
    name text, offer_status text, product text, who text, promise text,
    price_amount numeric, price_currency text, price_mode text, price text
  ) on commit drop;
  insert into seed_offers values
    ('Workshop de Negocios Digitales con IA', 'validacion',
     $t$Workshop práctico para aprender a estructurar y comercializar una oferta digital utilizando estrategias de marketing e inteligencia artificial.$t$,
     $t$Profesionales, creadores y emprendedores hispanohablantes que tienen conocimientos o habilidades y quieren convertirlos en una oferta digital, o necesitan organizar mejor una oferta que todavía no han validado.$t$,
     $t$Aprender a definir una oferta digital, identificar a su comprador, desarrollar un mensaje comercial y preparar un plan de prueba para evaluar su potencial de venta.$t$,
     99, 'USD', 'unico', '99'),
    ('Mentoría estratégica 1:1', 'validacion',
     $t$Acompañamiento estratégico de seis semanas para mejorar una oferta digital existente, su captación de clientes y su proceso de conversión.$t$,
     $t$Emprendedores y propietarios de negocios digitales que ya han conseguido ventas, tienen información comercial y pueden implementar mejoras en sus ofertas, contenido y embudos.$t$,
     $t$Analizar una oferta existente, identificar problemas comerciales y desarrollar un plan de pruebas para mejorar su propuesta de valor, comunicación y proceso de venta, con acompañamiento estratégico durante seis semanas.$t$,
     3000, 'USD', 'unico', '3.000'),
    -- Precio propuesto, todavía en borrador.
    ('Comunidad', 'borrador', null, null, null, 57, 'USD', 'mensual', '57'),
    ('SUPERNOVA', 'borrador', null, null, null, null, null, null, null);

  update public.products p set
    offer_status = s.offer_status, product = s.product, who = s.who, promise = s.promise,
    price_amount = s.price_amount, price_currency = s.price_currency, price_mode = s.price_mode, price = s.price,
    status = 'activo'
  from seed_offers s where p.user_id = jean and p.name = s.name;

  insert into public.products (user_id, name, offer_status, product, who, promise, price_amount, price_currency, price_mode, price, business_type)
  select jean, s.name, s.offer_status, s.product, s.who, s.promise, s.price_amount, s.price_currency, s.price_mode, s.price,
         case when s.name = 'Mentoría estratégica 1:1' then 'servicios' else 'infoproducto' end
  from seed_offers s
  where not exists (select 1 from public.products p where p.user_id = jean and p.name = s.name);

  raise notice 'Seed de Jean aplicado: ADN (14 respuestas, P8 privada) y 4 ofertas.';
end
$seed$;
