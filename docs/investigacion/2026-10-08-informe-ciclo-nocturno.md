# Informe del ciclo nocturno · 07 al 08-oct-2026

Para Jean, para leer al despertar. Nada de esto está publicado. Todo vive en la rama `super-agentes-2026-10-07`. Nadie hizo push, despliegues ni migraciones. Nadie escribió en producción, inició sesión ni gastó créditos o APIs pagas. `main` sigue igual que anoche.

Palabras técnicas que salen abajo:
- **Rama:** una copia del código donde se trabaja sin tocar lo publicado.
- **Commit:** un cambio guardado con su descripción.
- **Worktree:** una carpeta aparte con esa rama abierta.
- **Migración:** un cambio en la base de datos.
- **Edge function:** una función del servidor (Supabase).
- **CSV:** una tabla que se abre en Excel o Sheets.
- **RLS:** la regla de la base que hace que cada persona solo vea lo suyo.

---

## 1. Resumen en 10 líneas

1. Hubo **2 rondas de mejoras** sobre la rama de los super agentes. Cinco usuarias nuevas revisaron el código tres veces: ronda 1, ronda 2 y revisión final.
2. Las cinco son Mariela (academia con equipo), Sofía (media buyer, la que compra anuncios), Rosa (vende por WhatsApp), Jess (Miami, vende en inglés y español) y Daniela (Lima, marca personal y consultorías). Sus 15 revisiones están completas en la sección 3.
3. Esta noche entraron **16 commits nuevos**: 35 archivos, +1.669 líneas y −87. En total, la rama tiene 47 commits sobre `main` (37 sin contar las uniones).
4. **Ronda 1:**
   - Moneda y precio honestos: el "$" suelto ya no se lee como dólar y Cobra usa el precio que elegiste.
   - Exportar CSV en Ofertas y Ganchos.
   - "Copiado" solo cuando de verdad se copió.
   - El Inicio no trata como principiante a quien ya vende.
   - El tracker suma LinkedIn y las redes de WhatsApp y Facebook.
   - Las fotos del Influencer IA quedan atadas a cada personaje.
5. **Ronda 2:**
   - El CSV ya no deja pasar fórmulas a Excel.
   - El Radar se puede exportar.
   - El Mapa usa la moneda del país de la oferta.
   - Cobra muestra pagos de un solo país y trae 7 respuestas rápidas para WhatsApp Business.
   - El carrusel se baja en ZIP y en PDF para LinkedIn.
6. **Qué mejoró, según ellas:** la confianza en los números. Ya no hay dólares supuestos, cifras infladas ni "Copiado" falso, y ahora pueden llevarse datos a Sheets.
7. **Qué no cambió:** ninguna pagaría la Comunidad de US$99. Las cinco pagarían PRO al menos un mes. Mariela, Sofía y Rosa se quedarían unos 2 o 3 meses; Jess y Daniela, solo 1 o 2, porque la app no les sirve para vender en inglés ni para vender caro con su propia marca.
8. **Lo que las haría quedarse un año necesita tu decisión:** equipo con roles, ventas reales conectadas, alertas y reporte cada 15 días, exportar todo y guardar los datos de cobro. Jess pide además generar en inglés, EE. UU. como país de cobro y un revisor de cumplimiento; Daniela, "Mi voz", LinkedIn de verdad y un embudo para vender por llamada (sección 6).
9. **Comprobado ahora en la rama final:**
   - Pruebas: 52 archivos y 409 pruebas, todas pasan.
   - `tsc` (el revisor de tipos): 126 errores, los mismos que ya tiene `main`. Ninguno es nuevo.
   - El build pasa. jszip y jspdf quedan en archivos aparte que solo se cargan al usarlos.
10. **¿Lista para publicar?** Sí, como cambio solo de pantallas: no necesita base ni funciones. Antes, **apaga `heygen-diag`** (sección 8) y revisa con tu cuenta las pantallas de la lista de la sección 9.

---

## 2. Backup y cómo volver atrás

| Marca | Commit | Qué es |
|---|---|---|
| `backup-main-2026-10-07` | `067f7ac` | Lo publicado hoy, igual a `main` ahora mismo ("Genjutsu: sección oculta solo para Jean…"). |
| `backup-auditoria-2026-10-07` | `f0c5944` | El final de la auditoría nocturna (último commit: Carrusel en el teléfono). |
| Rama `super-agentes-2026-10-07` | `daeb00f` | Todo: auditoría, super agentes, ronda 1 y ronda 2. |

- Worktree con la rama: `/private/tmp/claude-501/-Users-usuario-SUPERNOVA/5f102904-3eec-4250-8f37-7d1a11210bf2/scratchpad/wt-final`.
- Ramas de cada paquete, por si quieres ver uno solo: `r1-P1`, `r1-P2`, `r1-P3`, `r2-P1`, `r2-P1-csv`, `r2-P2` (está vacía, ver sección 7) y `r2-P3`, más las 5 `pkg-*` de los super agentes.

**Comparar** (desde `/Users/usuario/SUPERNOVA/supernova`):
```bash
git log --oneline main..super-agentes-2026-10-07            # los 47 commits
git diff --stat backup-main-2026-10-07..super-agentes-2026-10-07   # todo lo que cambia frente a lo publicado
git diff --stat a8daff8..super-agentes-2026-10-07           # solo lo de esta noche (ronda 1 + ronda 2)
git diff backup-auditoria-2026-10-07..super-agentes-2026-10-07 -- src/lib/csv.ts   # un archivo concreto
```

**Descartar antes de publicar** (no afecta a producción):
```bash
git worktree remove /private/tmp/claude-501/-Users-usuario-SUPERNOVA/5f102904-3eec-4250-8f37-7d1a11210bf2/scratchpad/wt-final
git branch -D super-agentes-2026-10-07     # solo si de verdad no la quieres; las marcas backup-* quedan
```
Para descartar solo una ronda, crea una rama desde un punto anterior. Por ejemplo, `git branch sin-ronda2 fd3a223`, que es la rama al terminar la ronda 1.

**Volver atrás después de publicar:**
- Lo más rápido: en Vercel, "Instant Rollback" al despliegue anterior. Así no tocas git.
- En git: publica con `git merge --no-ff`, para que quede **un solo** commit de unión. Si hay que volver, `git revert -m 1 <ese commit>` y push, con tu OK.
- No uses `reset` + `push --force` sobre `main`.

---

## 3. Antes y después por usuaria

### Las 5 nuevas

| Usuaria | Ronda 1: ¿pagaría? | Revisión final: ¿pagaría? | Queja principal antes (ronda 1) | Queja principal después (final) |
|---|---|---|---|---|
| **Mariela**, 46, Panamá. Academia, equipo de 8, US$200.000/mes | PRO sí, como gasto de una persona (su media buyer). 2–3 meses. Comunidad no. Pagaría US$150–300 por un plan Equipo. | PRO sí, ella sola, para investigar. 2–3 meses. Comunidad no. Mismo plan Equipo. *(En la ronda 2 bajó a 1–2 meses: "cancelo después del primer mes".)* | "Es una herramienta para una persona que empieza de cero: sin equipo ni roles, ventas escritas a mano, reportes y alertas que no llegan solos." | La misma base: no hay espacio de equipo, la vigilancia no avisa fuera de la app y el CSV de Ofertas trae 12 filas. **Mejoró:** el Mapa ya no da resultados grandes con una moneda o un precio supuestos, y ya no dice "activos" a un número acumulado. |
| **Sofía**, 32, Bogotá. Media buyer, US$100.000/mes en Meta | PRO sí, "como herramienta de inspiración". 2–3 meses. Comunidad no. | PRO un mes de prueba. 2–3 meses. Comunidad no. *(En la ronda 2 dijo 1–2 meses.)* Con exportar todo y alertas: 6 meses o más, y la recomendaría. | "No me los puedo llevar: lo guardado en el Radar se pierde, no hay CSV y los 10 anuncios salen en markdown (texto con formato) sin el formato de Meta." | "Le pusieron Exportar a todo, pero solo exporta lo que ya veo (12 a 48 filas). El Radar deja fuera el copy y la landing, y nada me avisa cuando una oferta que sigo escala." **Mejoró:** ya hay CSV seguro, ZIP y PDF. |
| **Rosa**, 37, Monterrey. Secretaria, vende por WhatsApp y grupos de Facebook | La prueba y probablemente el primer mes de PRO. 1–2 meses. Comunidad no. | PRO a prueba. 2–3 meses. Comunidad no. | "La app supone que pago anuncios y empiezo de cero: no guarda mis datos de cobro, no me ayuda a contestar WhatsApp y el recorrido no se completa si vendo sin anuncios." | "Cada mensaje trae [tus datos de pago] y escribo mi CLABE a mano. Las respuestas rápidas están escondidas al final del Gemelo y no hay dónde anotar 'vendí 3 hoy' en pesos." **Mejoró:** OXXO y SPEI en MX$, sin mezclar países, con 7 respuestas rápidas y sus redes en el tracker. |
| **Jess**, 35, Miami. Bilingüe, vende infoproductos en inglés y español, US$80.000–150.000/mes, 250.000 seguidores | PRO sí, un mes, "como herramienta de investigación". 1–2 meses. Comunidad no. | PRO un mes; se iría a los 30–45 días. Comunidad no. *(En la ronda 2 dijo 2–3 meses.)* Con la app en inglés, EE. UU. como país de cobro y un chequeo de la FTC (la agencia de EE. UU. que multa la publicidad engañosa): un año, y pagaría la Comunidad o un plan más alto. | "El Radar ya tiene datos de EE. UU., pero todo lo que la app me ayuda a construir se queda en español y en RD, Colombia o México." Desde Miami, el Gemelo la pone a cobrar en RD$ (`gemelo.ts:43`), el asistente responde siempre en español y la rama quitó el selector de idioma de /auth (ella lo marca como regresión). Tampoco hay revisión de cumplimiento ni ventas conectadas. | "Encuentro qué modelar en el mercado de EE. UU., pero tengo que construirlo y cobrarlo fuera de la app." El inglés sigue apagado para clientes (`features.ts:15`), los países de cobro siguen siendo solo RD, CO y MX, todo se genera en español y nada revisa la FTC al publicar. **Mejoró:** el CSV seguro va a su Google Sheets con puntajes y días activos, el Mapa lee bien US$, £ y R$ sin inventar precio, la landing ya no muestra el cupón vencido ni actividad "en vivo" falsa, y el aviso de afiliado está bien hecho. |
| **Daniela**, 41, Lima. Gerente comercial con marca personal en LinkedIn e Instagram (40.000 seguidores). Vende consultorías y un curso, US$50.000/mes | PRO sí, "solo por el Carrusel". 1–2 meses. Comunidad no. | PRO un mes, quizá dos, solo por el Carrusel. Comunidad no. *(En la ronda 2: "lo probaría 1–2 meses" y se iría al tercero.)* Con "Mi voz", LinkedIn como red principal y un embudo de aplicación con agenda: 6 a 12 meses. | "Sigue hablándome como si empezara de cero": escribe para "alguien que empieza" y no con su voz, LinkedIn no existía (ni PDF ni tracker), la calculadora cuenta "ventas por día" y no llamadas y cierres (high ticket = producto caro que se cierra en una llamada), y sus guiones viven solo en ese navegador. | "La app me trata como si empezara de cero con un ebook de US$10." Voz genérica "de Instagram", LinkedIn solo como PDF y red extra en el tracker (si elige LinkedIn, el tracker igual deja marcada Instagram), sin video con su cara, sin página para captar y filtrar prospectos, y Cobra la pone en RD$ porque Perú no existe (`gemelo.ts:10,43`). **Mejoró:** el carrusel: PDF para LinkedIn, ZIP ordenado, Deshacer y confirmar antes de reemplazar lo pagado. LinkedIn ya está en el tracker y las fotos ya son de cada personaje. |

> En los cinco casos, la queja de fondo no cambió entre rondas, porque necesita decisiones tuyas (sección 6). Lo que sí cambió es la confianza en las cifras. Jess y Daniela muestran un segmento que la app hoy no atiende: quien ya vende, en dólares o en inglés, o caro y con su propia marca.

### Los grupos de antes (11 personas de la auditoría del 07-oct)

Esta noche **no se les volvió a preguntar**, así que no hay un "pagaría" nuevo. La tabla dice qué atendió la rama de su queja, revisado en el código.

| Persona | Queja principal antes | Cómo queda en la rama |
|---|---|---|
| María (novata, iPhone) | "No vi nada que dijera 'empieza aquí'." | Hay botón **Encontrar** en el teléfono y la línea "Tu siguiente paso" en el Inicio. La etapa 1 ahora dice "Encuentra qué vender (o tu próximo producto)" (e448306). |
| Carlos (primera venta) | La moneda se pierde: COL$108.000 en el Gemelo y 27 en Precio. | Ya no se inventa 27. Cobra usa el precio elegido en su moneda (1a50daf) y el Mapa usa la moneda del país (r2-P2). **Falta:** guardar la moneda de verdad (decisión tuya). |
| Andrea (media buyer) | "Activos ahora" inflado y sin "visto activo hace N días". | Todo dice "acumulado", incluida la cifra de arriba en Ofertas (`OfertasPage.tsx:240`), con "visto activo hace N días". Además, el CSV trae los puntajes. |
| Valentina (creadora) | Trabajo pagado que se borra. | Hay confirmaciones y versiones anteriores. Las fotos ya son de cada personaje (fb55936). |
| Diego (direct response) | Sin lote, y el video que habla está cerrado. | Sin cambio: el lote es un cobro nuevo y el video está cerrado (decisiones tuyas). |
| Patricia (creadora de Facebook) | Facebook no estaba en el tracker ni en el carrusel. | Ahora están Facebook y Grupo de Facebook (0614e57, 44532de). |
| Cindy (WhatsApp) | "La guía la tengo que escribir yo en ChatGPT." | Cobra es un paso real, con respuestas rápidas. **Crear producto sigue cerrado** (decisión tuya). |
| Ricardo (ingeniero) | "Dime qué hacer hoy y cuánto tarda." | La línea "Tu siguiente paso" muestra los minutos de las etapas 1 a 3. |
| João (TikTok Shop) | "No encontramos nada." | El buscador tiene sinónimos (TikTok Shop, afiliado, live). |
| Hany (VSL) | Un VSL falso en la landing. Reportes cada 15 días: 1/10. | El VSL se ocultó. **El reporte cada 15 días sigue sin existir.** |
| Lucía (40 años) | 150 créditos de un toque y una garantía que no se puede cumplir. | Mini Apps pide confirmación antes de cobrar. **La garantía sigue esperándote** (sección 8). |

---

## 4. Todo lo implementado esta noche, como lo vería el cliente

### Ronda 1 (rama unida en `9618a86`, `7843153` y `fd3a223`)

**P1 · Moneda y precio honestos** (`r1-P1`)
- `ca869ad`: el Mapa del negocio ya no da por dólar un "$" suelto. Dice "moneda supuesta" y no muestra los números grandes hasta que confirmas. La calculadora de Precio acepta £ y ₽.
- `f483d04`: la ficha y la IA usan el precio en su moneda. Se quitó el " USD" que se pegaba siempre, el campo dice "con tu moneda" y los textos de IA ya no fuerzan dólares.
- `1a50daf`: **Cobra** muestra primero el precio que elegiste en Precio, después el de tu ficha y al final el de la oferta original, marcado como "aprox.". Los métodos de pago son de un solo país: ya no sale "Nequi, transferencia u OXXO" mezclado.

**P2 · Llevarte tu trabajo** (`r1-P2`)
- `1baa9c1`: una herramienta de CSV que Excel abre con las tildes bien y que tiene pruebas.
- `03c78b9`: Ofertas tiene **Exportar CSV** de lo que ves, y el orden se llama "Más anuncios vistos (acumulado)". Los enlaces salen sin `access_token`, una llave de Meta que no debe circular.
- `0cb3d7e`: Ganchos tiene **Exportar CSV**, con los guardados o con los que ves.
- `77a69c1`: en Generadores, "Copiado" solo aparece si de verdad se copió. Si falla, te pide copiarlo a mano.
- `404d6af`: el carrusel baja con nombres ordenados (`producto_AAAA-MM-DD_s01.png`) y la lista "Antes de publicar" incluye LinkedIn.

**P3 · Inicio, tracker y personaje** (`r1-P3`)
- `e448306`: el Inicio ya no te pide "Crear mi producto" si ya lo tienes, y la etapa 1 sirve también a quien ya vende.
- `44532de`: el tracker suma LinkedIn, Estado de WhatsApp, Difusión de WhatsApp y Grupo de Facebook, sin migración.
- `fb55936`: Influencer IA guarda las fotos anteriores por personaje: ya no le ofrece a uno la cara de otro.

### Ronda 2 (unida en `444ba5a`, `f3f11c0` y `5d8b170`, con arreglos en `2b58c19` y `daeb00f`)

**P1 · Exportaciones honestas y seguras** (`8042456`, rama `r2-P1-csv`)
- El CSV ya no ejecuta fórmulas. Un gancho como "+500 recetas" o un texto con "=…" se guarda como texto (`src/lib/csv.ts:22-27`). Esto protege de la **inyección CSV**: un texto ajeno que Excel tomaría como fórmula.
- El CSV de Ofertas suma el ID, `winner_score`, `copy_score` y la "última vez visto activo" como fecha que se puede ordenar. La cifra de arriba dice "Anuncios vistos activos (acumulado)".
- El CSV de Ganchos respeta el filtro activo, dice cuántos exportó y, si falta el enlace al anuncio, pone uno a la búsqueda en la Biblioteca de Meta.
- **El Radar se puede exportar** (`radar_AAAA-MM-DD.csv`), con la fecha de inicio real que da Meta. Si Meta no la da, la celda queda vacía y nunca se calcula a ojo.

**P2 · Moneda, país y cobro coherentes + respuestas rápidas** (`5d8b170`)
- El Mapa usa la moneda del país de la oferta: México da MX$, Colombia COL$, RD RD$ y EE. UU. o PR US$. Sigue marcada como "supuesta" hasta que confirmas.
- Cobra elige los métodos de pago según la moneda de tu precio: con MX$ salen OXXO, SPEI y tarjeta, aunque el Gemelo dijera otro país. El dinero se escribe siempre igual: "MX$ 190".
- Si el portapapeles falla en el teléfono, el mensaje aparece seleccionado con "Mantén presionado y copia".
- **Respuestas rápidas para WhatsApp Business** (gratis, sin IA): /hola, /precio, /pago, /pague, /nollego, /sirve y /entrega, con los pasos para guardarlas en la app (`src/lib/quickReplies.ts`). No prometen nada.

**P3 · Carrusel listo para LinkedIn** (`ee55fdf`, rama `r2-P3`)
- "Bajar todo (.zip)" baja un solo archivo con las láminas en orden. "Bajar como PDF para LinkedIn" arma una página por lámina.
- jszip y jspdf se cargan solo al tocar el botón, así que la primera carga no pesa más. **Son dos dependencias nuevas.**
- Si eliges LinkedIn, el aviso lo nombra y "Agregar a mi tracker" guarda la red correcta. Los videos cortos también pueden ir a LinkedIn.

### Lo que ya venía en la rama (super agentes y auditoría)

Están en `docs/investigacion/2026-10-07-super-agentes.md` y `2026-10-07-auditoria-nocturna.md`:
- Landing sin el cupón FUNDADOR vencido, sin Oráculo, sin VSL falso, sin "Escaneando" y con "US$29,99".
- Mini Apps pide confirmación antes de gastar 150 créditos.
- El historial de Créditos tiene nombres en palabras.
- Ofertas dice "acumulado" y "visto activo hace N días".
- Influencer IA ya no frena a quien no tiene producto.
- Botón Encontrar en el teléfono.
- "Tu siguiente paso" en el Inicio.
- Cobra es un paso real del Gemelo.
- Carrusel, YouTube e Influencer IA piden confirmar antes de reemplazar lo pagado y guardan versiones.
- Radar hasta 365+ días.
- "Ganador" solo con 3 ventas o más.
- La temperatura del Radar ya no hace promesas (`aa7d36c`).
- Los errores de Entrar mandan al correo de soporte (`a8daff8`).

---

## 5. Decisiones del estratega

### Ronda 1

| Mejora | Decisión | Por qué |
|---|---|---|
| Un "$" suelto se leía como US$ (`ltv.ts:135`) | Implementar | Daba cifras infladas cientos de veces con cara de dato real. |
| £ y ₽ en Precio, sin " USD" fijo en la ficha y la IA | Implementar | Arregla una incoherencia de la rama. Sin precios ni base. |
| Un solo precio en Cobra y el Plan, sin mezclar países | Implementar | Es el paso que acerca a cobrar. |
| "Mis datos de cobro" guardados | Preparar para Jean | Puede pedir migración. Se dejó una nota en el código. |
| Carrusel: nombres útiles y ZIP; LinkedIn en la lista | Implementar | En el navegador, gratis. *(El ZIP quedó para la ronda 2: jszip no estaba instalado.)* |
| Carrusel en PDF | Después | Sin comprobar dependencias. *(Hecho en la ronda 2.)* |
| Formato 9:16 en el carrusel | Después | Toca mucho código. |
| "Copiado" verdadero en Generadores | Implementar | Minutos. |
| CSV en Ofertas y Ganchos | Implementar | Sin consultas nuevas ni cobro. |
| Orden "acumulado" en Ofertas | Implementar | Solo cambia el texto, no el orden. |
| Guardados del Radar en la nube | Preparar para Jean | Tabla nueva = migración. |
| `hasBuiltProduct` real en el Inicio | Implementar | Era una regresión escondida. |
| Etapa 1 para quien ya vende | Implementar | Solo cambia el texto. |
| Redes nuevas en el tracker | Implementar | Mismo patrón que Facebook, sin migración. |
| Fotos atadas a cada personaje | Implementar | Arreglo a medias de la rama. |
| Alertas de vigilancia en el correo diario | Preparar para Jean | Es una edge function y Resend no tiene dominio verificado. |
| Reporte cada 15 días | Para Jean | Cron nuevo y correos. |
| "Mi voz" en la ficha | Después | Días de trabajo y revisión de margen. |
| Calculadora de high ticket | Después | Pantalla nueva. |
| Plan Equipo | Para Jean | Semanas y un precio nuevo. |
| Ventas reales conectadas | Para Jean | Webhooks nuevos y producción. |
| Anuncios en lote con formato de Meta | Después | Cambia `creative-brief` y pide una tabla. |
| Respuestas rápidas de WhatsApp | Después | *(Hechas en la ronda 2 en versión plantilla, gratis.)* |
| Instalar la app en el teléfono y avisos push | Después | El service worker (lo que permite instalarla) puede dejar versiones viejas guardadas. |
| Filtro por tipo del Radar en el servidor; activos de hoy en todas las ofertas | Para Jean | Toca el pipeline. |
| PRO en pesos aproximados | Para Jean | Toca cómo se presenta el precio. |
| API, lote, portafolio, embudo high ticket | Después | Días o semanas. |

### Ronda 2

| Mejora | Decisión | Por qué |
|---|---|---|
| CSV a prueba de fórmulas | Implementar | Lo pidieron 4 perfiles. Minutos. |
| "Siguen activos" en la cifra de Ofertas | Implementar | Era incoherente con "acumulado". |
| CSV de Ofertas con puntajes y fecha | Implementar | Los campos ya estaban cargados. |
| CSV de Ganchos con filtro y enlace de respaldo | Implementar | Arreglo a medias de `0cb3d7e`. |
| CSV del Radar (lo cargado) | Implementar | Es el activo principal. Sin consultas nuevas. |
| Exportar "hasta 300/500" con una función de la base | Para Jean | Es una migración y hay que medirla contra el límite de 8 s. |
| Moneda del país en el Mapa | Implementar | La función ya aceptaba la moneda de respaldo y no se usaba. |
| Selector de moneda guardado | Después | Puede pedir una columna nueva. |
| País de Cobra deducido de la moneda; formato de dinero único | Implementar | Evitaba MX$ con pagos de RD. |
| Copiar en Cobra con respaldo | Implementar | En el teléfono el portapapeles falla. |
| Respuestas rápidas de WhatsApp sin IA | Implementar | Gratis, sin migración, retención semanal. |
| Guardar "Mis datos de cobro" | Para Jean | Son datos financieros sensibles: hay que decidir dónde se guardan, si se cifran y qué dice el texto de privacidad. |
| EE. UU., PR y Perú en los países; preguntar en vez de suponer RD | Después | Toca muchos lugares a la vez. |
| El aviso del carrusel nombra la red; el tracker la marca sola | Implementar | Arreglo a medias de `404d6af`. |
| ZIP y PDF del carrusel | Implementar | Lo pidieron 3 perfiles. En el navegador y sin créditos. |
| LinkedIn en video corto | Implementar | Una línea. |
| Generador "Post de LinkedIn" | Para Jean | Generador nuevo, con precio y despliegue. |
| Ganchos y ángulos en lote | Para Jean | Cobro nuevo. |
| Plan Equipo | Para Jean | Igual que en la ronda 1. |
| Ventas reales conectadas | Para Jean | Igual que en la ronda 1. |
| Dinero por publicación en el tracker | Para Jean | Columna nueva. |
| Reporte cada 15 días | Después | Depende de las ventas y del correo. |
| Voz de marca y casos reales | Después | Prompts y ética de la prueba. |
| Revisor de cumplimiento ES/EN | Después | Toca muchas pantallas. *(Jess lo pidió en las tres revisiones: ver sección 6, punto 18.)* |
| Generar en inglés; mercado "Hispanos en EE. UU." | Después | 15 funciones y medir índices. |
| Tarea diaria para quien ya vende, tablero de varios lanzamientos, importar el CSV de Ads Manager | Después | Diseño nuevo. |

---

## 6. Mejoras propuestas que NO se implementaron (por impacto)

| # | Mejora | Quién la pide | Impacto | Qué necesita de ti | Recomendación |
|---|---|---|---|---|---|
| 1 | **Alertas de ofertas seguidas fuera de la app** (correo o webhook) y **reporte cada 15 días** | Mariela, Sofía y Hany (antes) | Enorme: es la razón para pagar cada mes que da el manual, y hoy no existe. `send-daily-digest` no lee `offer_events` (grep vacío). | Desplegar una función, un cron con secreto y verificar el dominio de Resend. | **Sí, primero.** Es gratis para el cliente ("medir va incluido") y lleva días, no semanas. Mientras no exista, el manual no debería citarla como motivo de pago. |
| 2 | **Exportar todo el filtro** (hasta 200–1.000) en Radar y Ofertas | Sofía y Mariela | Enorme para quien trabaja en volumen. Hoy: Ofertas 12 filas (`OfertasPage.tsx:42,325`) y Radar hasta 48 (`WinningAdsPage.tsx:133,1197`). | Una migración con una función de solo lectura paginada por llave, medida en un Postgres local, sin `count exact`. | Sí, gratis y con tope diario. |
| 3 | **Plan Equipo** (espacios, asientos y roles) | Mariela y Jess | Enorme en valor por cliente (US$150–300/mes), pero son semanas. | Tablas con RLS, un plan nuevo en Whop (`SUPERNOVA_PLANS`) y **el precio lo decides tú**. | Planificarlo después del punto 1. |
| 4 | **Ventas reales conectadas** (Hotmart, Whop, Stripe del usuario) → LTV real | Mariela, Sofía y Jess | Enorme: es la prioridad 1 del manual frente a Quantum Miner. | Webhooks con firma, una tabla con RLS y producción. | Empezar por el paso pequeño: ingreso y gasto por semana a mano o importados de un CSV. |
| 5 | **Guardar "Mis datos de cobro"** (CLABE, Nequi, enlace de pago) | Rosa | Alto para quien vende por WhatsApp. Nota en `GemeloFlow.tsx:375`. | Decidir dónde se guardan y con qué RLS, si se cifran y el texto de privacidad. | Sí: en la tabla del producto con su RLS, nunca en el navegador. |
| 6 | **Guardados del Radar en la nube, con listas** | Sofía | Enorme: hoy se pierden al recargar. | Tabla `saved_ads` con RLS (migración). | Sí. Son horas y se copia el patrón de `hook_favorites`. |
| 7 | **Ganchos y anuncios en lote** con formato de Meta y CSV para Ads Manager | Sofía y Diego | Alto. | Precio en `credit_prices`, cobro con `edge_guard_charge` y despliegue. | Sí, con el precio a 5× el costo o más. |
| 8 | **Guardar y exportar el escenario del Mapa del negocio** | Mariela | Alto: hoy se pierde al cerrar (`BusinessMap.tsx:59-70`, solo `useState`). | Tabla nueva. | Sí. |
| 9 | **Landing y checkout en la lista y el CSV de Ofertas**; copy, CTA y landing en el CSV del Radar | Sofía | Alto. Lo del Radar son minutos y ya está en memoria (`demo-winning-ads.ts:11-12,29-35`). | El del Radar no necesita nada de ti. El de Ofertas lleva una consulta liviana. | **El del Radar puede ir en la próxima ronda sin ti.** |
| 10 | **"Copiado" verdadero en toda la app** | Sofía | Medio. Siguen dando falsos positivos `MandalaPage.tsx:580,889`, `MercadoPage.tsx:378`, `IdeasWhatsApp.tsx:253` y `BrainPage.tsx:168`. | Nada. | Próxima ronda, sin ti. |
| 11 | **Exportar la pestaña "Siguiendo"** con los activos de hoy y el historial | Mariela | Alto. | Nada: los datos ya se cargan. | Próxima ronda. |
| 12 | Filtro por tipo del Radar en el servidor | Sofía y Andrea | Medio. | Toca el pipeline. | Con tu OK. |
| 13 | Respuestas rápidas visibles para quien ya vende; "vendí 3 hoy" en pesos; difusión de WhatsApp en el carrusel | Rosa | Medio. | La primera y la tercera no necesitan nada. La de pesos necesita una columna. | La primera y la tercera, próxima ronda. |
| 14 | **EE. UU., Puerto Rico y Perú como países de cobro** (Gemelo, Cobra, Personaje y Mapa), y **no suponer RD** cuando no se reconoce la zona horaria: mostrar "elige tu país" de un toque. Más adelante, selector de moneda guardado | Jess y Daniela en las tres revisiones; Mariela | Alto. Hoy, desde Miami o Lima, Cobra propone RD$ y efectivo (`gemelo.ts:10,43`). Si cobras en US$, la moneda no da país (`gemelo.ts:92-98`). | Nada para los países: es texto y una lista, sin IA ni migración. El selector guardado puede pedir una columna. | **Sí, próxima ronda, sin ti.** Son horas y arregla la etapa 3 a todo el que no vive en RD, CO o MX. Métodos sugeridos: EE. UU. con tarjeta (enlace de Stripe o Whop del usuario), Zelle o Cash App; Perú con Yape, Plin o tarjeta. |
| 15 | API de solo lectura y espacios por cliente para agencias | Sofía | Alto, pero son semanas. | Una función con su compuerta y quizá un plan nuevo con precio tuyo. | Después del plan Equipo. |
| 16 | 9:16 y paquete Meta (1:1, 4:5, 9:16) | Sofía | Medio o alto. | El paquete con IA lleva precio. | 9:16 del carrusel sin IA: próxima ronda. |
| 17 | Importar el CSV de Ads Manager al veredicto de Mándala | Sofía | Alto. | Nada: es en el navegador. | Próxima ronda. |
| 18 | **Revisor de cumplimiento en español e inglés** antes de publicar: marca promesas de ingresos, salud o plazos ("gana X en 7 días", "make $10k"), "garantizado", afiliados sin "#ad" o "enlace de afiliado", imágenes de IA sin la línea "Hecho con IA" y testimonios sin "resultados no típicos". Cada alerta trae la frase para cambiarla | Jess en las tres revisiones | Alto. En EE. UU. la FTC multa estas frases y Meta bloquea cuentas. Hoy solo el carrusel revisa promesas, y solo en español (`carousel.ts:471-484`). Ningún competidor lo tiene. | Nada: reglas fijas en el navegador (`src/lib/compliance.ts`), gratis y sin IA. Una versión con IA más adelante sí llevaría precio. | **Sí, próxima ronda, sin ti.** Es el manual hecho herramienta ("nunca prometer ingresos") y protege también al usuario. Empezar como 5.º punto de "Antes de publicar" en el Carrusel y en el tracker. |
| 19 | **Generar en inglés o en los dos idiomas** (carrusel, guiones, ganchos, anuncios), como transcreación: misma idea y mismo remate, no traducción literal | Jess en las tres revisiones | Enorme para quien vende en EE. UU.: hay 15 funciones del servidor con "español latino" fijo y es su razón número uno para cancelar. | Despliegue de funciones. Un idioma cuesta lo mismo de hoy; **el precio de "Ambos" lo decides tú** (costo × 5 o más, cobrado en el servidor). | Sí, después de los puntos 1 y 14. Empezar por el Carrusel y los generadores. |
| 20 | **"Mi voz"**: pegas 3 a 5 publicaciones tuyas y la IA escribe con tu forma de hablar (largo de frase, palabras que usas y que nunca usas, tú o usted) | Daniela en las tres revisiones | Enorme para marca personal: hoy todo sale "para alguien que empieza" (`generators.ts:53`) y en tono de Instagram (`carousel.ts:271`). | Una columna en la ficha (migración con RLS) o guardarlo dentro de `products.journey`. Decidir si resumir la voz con IA se cobra. | **Sí**, como opción en "Personalizar": nunca bloquea a quien no la llena. |
| 21 | **Números del high ticket** (vender caro por llamada): de lead a aplicación, a llamada agendada, a asistencia y a cierre, con comisión del closer (quien cierra la venta) y reembolsos. Da el ingreso por llamada y cuánto puedes pagar por lead | Daniela (rondas 1 y 2) | Alto. Encaja con la prioridad 1 del manual (los números del negocio) y Quantum Miner no lo tiene. | Nada: es una pantalla en el navegador, sin IA. | Próxima ronda, sin ti, como modo "Cierro en llamada" dentro de Precio y ganancia. |
| 22 | **Filtro "Hispanos en EE. UU."** en Ofertas y Radar, y EE. UU. separado del Reino Unido | Jess (ronda 2) | Alto. Hoy el grupo US exige inglés y mezcla EE. UU. con el Reino Unido, y el grupo en español no incluye EE. UU.: los anuncios en español para EE. UU. no salen en ningún filtro (`offers.ts:94-97`). | Tu OK, porque toca los filtros. Es un grupo nuevo que **no recorta nada**: el orden por puntaje y días no cambia. Medir antes en un Postgres local que no pase de 8 s. | Sí, con medición. |
| 23 | **Mis casos reales**: casos de clientes con un check obligatorio "es real y tengo permiso", que las herramientas citan tal cual y con la marca "resultado de un cliente, no es una promesa" | Daniela (rondas 1 y 2) | Alto para quien ya vende: hoy no puede usar ninguna prueba real. | Revisar contigo el texto del aviso. Nada técnico grande. | Sí. Cumple el manual: nada inventado, solo lo real y con permiso. |
| 24 | **Camino "Ya tengo mi producto y ya vendo"**: marcar la etapa 4 como hecha con un enlace a tu producto hecho fuera de la app | Daniela (final) y Mariela | Medio o alto. Hoy el Inicio solo cuenta productos hechos dentro de la app (`journey.ts:34-37`) y le sigue proponiendo "Crear mi producto". | Nada. | Próxima ronda, sin ti. |
| 25 | **Mis piezas en la nube**: carruseles y guiones guardados en tu cuenta, en cualquier dispositivo | Daniela (ronda 1) | Alto: hoy el guion de YouTube vive solo en ese navegador. | Tabla nueva con RLS (migración). | Sí, junto con el punto 6. |
| 26 | **Embudo de aplicación para high ticket**: página con preguntas que filtran, enlace a tu agenda (Calendly) y avisos de cada aplicación | Daniela en las tres revisiones | Enorme para su segmento, pero son semanas. | Es la Fase 2 del manual (publicar en un **dominio aparte**), con tabla y RLS. | Planificarlo dentro de la Fase 2. |
| 27 | **Video con tu propia cara y voz**, con consentimiento, en vez de un influencer IA | Daniela (rondas 2 y final) | Alto, pero depende de abrir el video que habla. | Precio, cobro en el servidor y texto de consentimiento. | Para ti, cuando decidas abrir el video. Mientras, un teleprompter (guion que se desplaza mientras grabas) sin IA. |
| 28 | **La app en inglés para clientes**, empezando por Radar, Ofertas, Ganchos, Precio y Cobra | Jess en las tres revisiones | Alto, pero son semanas: hoy hay unas 40 frases traducidas para 44 pantallas. | Decidir si se reabre el inglés (lo pausaste en `features.ts:15`). | Después del punto 19: para ella importa más el idioma de lo que se genera que el de los menús. |
| 29 | **Plan anual y facturas** | Jess (ronda 1) | Alto en retención. | **Precio tuyo** y configurarlo en Whop. | Para ti. |

---

## 7. Riesgos y regresiones detectadas

| Riesgo | Estado |
|---|---|
| **El trabajo de `r2-P2` quedó cruzado** en la carpeta de `r2-P1` por un `git stash` compartido (un cajón temporal de git que usaban las dos). La rama `r2-P2` no tiene commits. | **Rescatado.** `5d8b170` lo aplica desde `rescate-P1-estado-actual.patch`, idéntico al trabajo sin commit. Las pruebas de moneda, Cobra y quickReplies pasan (409/409). Si alguna vez miras `r2-P2`, está vacía: lo bueno está en `super-agentes-2026-10-07`. |
| Una prueba de Cobra esperaba "MX$190" sin espacio | **Arreglado** en `daeb00f`, porque ahora todo el dinero se escribe con espacio. |
| Inyección CSV en los exports de la ronda 1 (`03c78b9`, `0cb3d7e`) | **Arreglado** en `8042456`, con pruebas. |
| "Anuncios que siguen activos" contradecía "acumulado" | **Arreglado** (`OfertasPage.tsx:240`). |
| El CSV de Ganchos ignoraba el filtro y dejaba enlaces vacíos | **Arreglado** en `8042456`. |
| El Mapa no usaba la moneda del país | **Arreglado** (`BusinessMap.tsx:24-27`, `ltv.ts:140`). |
| **Dos dependencias nuevas**: `jszip` ^3.10.2 y `jspdf` ^4.2.1 (no estaban en `main`) | Se cargan solo al usarlas (build: `jszip.min` 98 kB y `jspdf.es.min` 391 kB, en archivos aparte). **Al publicar hay que correr `npm ci`.** Conviene pasar el chequeo de seguridad de dependencias antes del push. |
| Exportaciones limitadas a lo cargado (12 a 48 filas) | **Abierto.** Es honesto: el texto dice "Exporta las N cargadas". La solución es la mejora 2 de la sección 6. |
| Cobra dice "No necesitas pasarela para tu primera venta" y a la vez ofrece "tarjeta" y "OXXO" (`GemeloFlow.tsx:420`) | **Abierto.** Sin un enlace de cobro tipo Mercado Pago, la tarjeta no se puede cobrar. Recomiendo cambiar el texto en la próxima ronda. |
| "Copiado" falso en Mándala, Mercado, Ideas de WhatsApp y Brain | **Abierto** (sección 6, punto 10). |
| La difusión de WhatsApp no está entre las redes del carrusel (`contentTracker.ts:30`) | **Abierto**, menor. |
| `tsc` con 126 errores | **Igual que `main`.** Ninguno es nuevo. |
| Pantallas con sesión iniciada sin ver en un navegador (Inicio a 375 px, Cobra, CSV, ZIP/PDF y Radar) | **No probado en pantalla.** Todo sale de leer el código y de las pruebas. Se mira con tu cuenta al publicar (sección 9). |
| Detalle anterior: en Influencer IA, la quinta foto se borra del almacenamiento antes de confirmar el guardado | **Abierto**, menor. `fb55936` solo arregló lo de las fotos por personaje. |
| En Contenido, si cierras la pestaña durante los 5 s de "Deshacer", la pieza no se borra | **Abierto**, menor. Es el lado seguro: no se pierde nada. |
| Manual: no se toca el catálogo, `winner_score`, el orden ni los precios; no se cobra desde el navegador; nada dice "clonar" | **Cumplido.** No hay cambios en `supabase/`. `plans.ts` no cambió. Las líneas nuevas solo dicen "clon" en nombres internos y en pruebas que lo prohíben. |

---

## 8. Pendientes urgentes de producción que no se tocaron

1. **`heygen-diag` publicada sin compuerta.**
   - No está en el repo: en `supabase/functions` solo hay `heygen-generate-video`, `heygen-list-avatars` y `heygen-webhook`.
   - Cualquiera con la llave pública de la app puede **consultar** nuestra cuenta de HeyGen: cuota, videos y avatares. Es solo lectura y no genera videos, pero expone datos de la cuenta y no tiene límite.
   - **Recomendación: bórrala de producción, con tu OK.** Después, revisa que no quede otra función en producción que no esté en el repo.
2. **`spy-analyze`, `tiktok-search` y `analyze-ad`** gastan Firecrawl o Gemini sin cobrar. Recomiendo que respondan 410 ("ya no existe").
3. **Tope de 3.000 que cuenta los créditos comprados.**
   - Quien compró un pack puede quedarse sin sus 2.000 del mes.
   - La frase "se usan después de los del mes" no es cierta.
   - Necesita una migración.
4. **La imagen de anuncio de respaldo (Gemini) queda a 1,2× del costo.** Recomiendo devolver los créditos y pedir "inténtalo de nuevo". Necesita despliegue.
5. **Reembolsos de video después de 1 hora.** Necesita un cron antes de abrir el video que habla.
6. **Garantía de 30 días "si no terminas tu producto"** mientras Crear producto está cerrado. Revisa en Whop qué dice y alinéalo.
7. **Cupón FUNDADOR** en Whop: véncelo allá. La landing de la rama ya no lo menciona.
8. **Cifras de la landing** (114.000 anuncios, 7.517 ofertas…) sin verificar después del borrado del 04-oct. Hace falta una lectura liviana, nunca `count exact` sobre `winning_ads`.
9. **El navegador todavía puede cobrarse a sí mismo** (`consume_credits` para `authenticated`). No hubo cobros en 30 días, pero hay que revocar el permiso.
10. **Resend sin dominio verificado:** bloquea las alertas y el reporte del punto 1 de la sección 6.
11. **Whop no envía eventos de pago ni de reembolso** hasta que los actives (según la memoria del 29-sep).

---

## 9. Plan para publicar con tu OK

Esta rama **no necesita base ni funciones**. El orden siguiente incluye los pendientes de la sección 8 que apruebes.

1. **Base de datos** (solo si apruebas los puntos 3 o 9 de la sección 8): aplicar la migración, hacer una lectura liviana para comprobar y no seguir si algo no cuadra.
2. **Funciones:**
   - Borrar `heygen-diag`.
   - Poner en 410 las 3 funciones que gastan sin cobrar.
   - Si apruebas el punto 4, desplegar la imagen de anuncio sin el respaldo de Gemini.
   - Verificar llamando a cada una: debe responder 410, o 401 si no tiene permiso.
3. **Push del frontend.** Desde el worktree, **no desde el árbol principal**, que tiene 32 archivos ajenos sin commit:
   ```bash
   cd /private/tmp/claude-501/-Users-usuario-SUPERNOVA/5f102904-3eec-4250-8f37-7d1a11210bf2/scratchpad/wt-final
   npm ci && npx vitest run && npx vite build      # esperar 409 pruebas en verde y build OK
   git checkout main   # o: git -C /Users/usuario/SUPERNOVA/supernova ... (main está en 067f7ac = backup-main)
   git merge --no-ff super-agentes-2026-10-07
   git push origin main                              # Vercel publica solo
   ```
   - Ojo: `main` puede estar abierto en el árbol principal. Si git no deja cambiar de rama en el worktree, haz la unión con una rama temporal y empuja con `git push origin HEAD:main`.
4. **Verificar en vivo** (https://supernova-six-eta.vercel.app):
   - `/fundador`: sin FUNDADOR, dice US$29,99 y los botones llevan a Whop.
   - Con tu cuenta, a 375 px: "Tu siguiente paso" en el Inicio.
   - Ofertas: la cifra dice "acumulado" y Exportar CSV abre bien en Excel. Busca un gancho que empiece con "+".
   - Radar: Exportar CSV.
   - Ganchos con un filtro activo: Exportar CSV.
   - Mapa del negocio de una oferta de México con "$": debe decir MX$ y "supuesta".
   - Gemelo, paso Cobra con MX$: OXXO, SPEI y tarjeta, más las respuestas rápidas.
   - Carrusel: "Bajar todo (.zip)" y "PDF para LinkedIn". Mira en la pestaña Red que jszip y jspdf **solo** se bajan al tocar el botón.
   - Mini Apps: confirmar y **cancelar**, sin desbloquear.
   - Dime lo que no se pueda comprobar.

---

## 10. Anexo: las revisiones condensadas

### Revisión 1 (estado de la rama de los super agentes)

**Mariela**
- **Bien:** Mapa con precio supuesto, Precio sin el 27 inventado, "visto activo", Créditos en palabras, landing honesta y la Ayuda sin la promesa de reportes.
- **A medias:**
  - Un "$" suelto contaba como US$ (`ltv.ts:135`).
  - La vigilancia solo se ve dentro de la app.
  - El Inicio tenía `hasBuiltProduct:false` fijo (`DashboardPage.tsx:226`).
  - Las ventas se escriben a mano.
- **Pide:** plan Equipo, ventas conectadas, reporte cada 15 días, alertas que lleguen solas, moneda con "$", portafolio de productos y un modo "ya vendo".

**Sofía** (20 pruebas propias en verde)
- **Bien:** 365+ días, "Revisados hace poco", hora real, sin "1 anuncio", temperatura sin promesas, Ganchos con el anuncio original, Carrusel con Deshacer, Mini Apps con confirmación y Créditos en palabras.
- **A medias:**
  - El filtro por tipo solo actúa sobre la página.
  - Ofertas ordenaba por "activos" acumulados.
  - "Copiado" falso en Generadores (`GeneradoresPage.tsx:302`).
- **Pide:** guardados del Radar en la nube (`WinningAdsPage.tsx:215,731-738`), CSV, anuncios en lote con formato de Meta, alertas, filtro en el servidor, lote desde una selección múltiple, ZIP con 9:16 y una API.

**Rosa** (32/32 pruebas en verde)
- **Bien:** adivina su país (Monterrey → México) y el menú del teléfono está mejor.
- **A medias:**
  - Cobra siempre dice [tus datos de pago].
  - "Sin pasarela" choca con ofrecer tarjeta.
  - El precio del Plan no coincidía con el de Precio.
  - El botón del Plan mezclaba países.
  - "Empieza de cero" en el Inicio.
- **Pide:** guardar los datos de cobro, respuestas rápidas de WhatsApp, un camino "ya vendo" e instalar la app en el teléfono.

**Jess y Daniela:** sus tres revisiones completas (ronda 1, ronda 2 y final) están resumidas en la sección 3 y sus pedidos, en la sección 6 (puntos 14 y 18 a 29).

### Revisión 2 (después de la ronda 1)

**Mariela**
- **Bien:** el orden "acumulado", Cobra con el precio elegido, la etapa 4 y la etapa 1, "Copiado" y los nombres del carrusel.
- **A medias:**
  - CSV de Ofertas con 12 filas y sin protección contra fórmulas (`csv.ts:19-23`).
  - CSV de Ganchos con el mismo problema y enlaces vacíos.
  - El Mapa no usaba la moneda del país.
  - El tracker es de una sola persona.
- **Pide:** equipo, ventas reales, reporte en PDF y CSV, CSV seguro y completo, tablero de lanzamientos y una moneda que se pueda elegir.

**Sofía**
- **Bien:** `shareableUrl` (los enlaces sin la llave de Meta), "Copiado", 365+ y sin "1 anuncio".
- **A medias:**
  - CSV de Ofertas sin puntajes y con una fecha relativa que no se puede ordenar.
  - La cifra de arriba decía "siguen activos" (`OfertasPage.tsx:234`).
  - El CSV de Ganchos ignoraba el filtro.
  - El carrusel no tenía ZIP.
  - El filtro por tipo seguía en la página.
- **Pide:** CSV del Radar, lote de ganchos, ZIP y PDF, el paquete Meta 1:1/4:5/9:16, CSV de Ofertas completo, alertas, filtro en el servidor e importar el CSV de Ads Manager.

**Rosa**
- **Bien:** pagos de un solo país, la ficha en su moneda, el Mapa con "$", el tracker con sus redes, la etapa 4, "Copiado" y el CSV, que no rompe nada.
- **A medias:** sigue [tus datos de pago] y copiar en Cobra no ofrece un respaldo.
- **Pide:** guardar los datos de cobro y un kit de respuestas rápidas. Su revisión llegó cortada en este punto.

### Revisión final (después de la ronda 2)

**Mariela**
- **Bien:** CSV del Radar con la fecha real, el sello de hora real, "acumulado" en todas partes, Mapa con moneda supuesta, tracker con platformFor, respuestas rápidas, carrusel para LinkedIn y el lenguaje del manual.
- **A medias:** CSV de Ofertas con 12 filas y sin exportar la pestaña "Siguiendo".
- **Pide:** plan Equipo, alertas y reporte cada 15 días, exportar "Siguiendo", guardar y compartir el escenario del Mapa, LTV real y tareas asignables.

**Sofía**
- **Bien:** la herramienta de CSV (`csv.ts:22-27,40-45,92-101`), Ganchos, ZIP y PDF (`carouselExport.ts:8-44`), créditos en el Estudio de imágenes y precio en su moneda.
- **A medias:**
  - CSV de Ofertas de 12 en 12 y sin la landing.
  - CSV del Radar con la página actual y sin el copy.
  - "Copiado" falso en otras 4 pantallas.
- **Pide:** exportar todo (hasta 1.000), copy y landing en el CSV del Radar, alertas, lote con nombres de Meta, landing en Ofertas, búsquedas guardadas, "Copiado" verdadero en toda la app y una API para agencias.

**Rosa**
- **Bien:** `cobraCountry` (`gemelo.ts:92-107`), copiar con respaldo, la línea del Inicio, el CSV y el carrusel.
- **A medias:**
  - "No necesitas pasarela" (`GemeloFlow.tsx:420`).
  - Respuestas rápidas escondidas y con huecos que hay que llenar a mano.
  - Sin difusión de WhatsApp en el carrusel.
- **Pide:** guardar los datos de cobro. Su lista de mejoras llegó cortada en este punto.

**Jess y Daniela:** ver la sección 3.

---

**Rama:** `super-agentes-2026-10-07` (`daeb00f`). **Worktree:** `/private/tmp/claude-501/-Users-usuario-SUPERNOVA/5f102904-3eec-4250-8f37-7d1a11210bf2/scratchpad/wt-final`. **Marcas:** `backup-main-2026-10-07` (`067f7ac`) y `backup-auditoria-2026-10-07` (`f0c5944`). Comprobado a las 04:17 del 07-oct (madrugada): 409/409 pruebas, 126 errores de `tsc` (los mismos de `main`) y el build pasa.
