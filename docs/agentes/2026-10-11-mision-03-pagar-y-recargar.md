# Misión 03 · El momento de pagar y recargar — 11-oct-2026

Agente 3 de 10. Revisé el camino del dinero: Mis créditos, la ruedita, el aviso de pocos créditos,
la ventana de recarga, la vitrina con candado, los planes y la prueba de 3 días. Leí el código,
abrí la app en producción con la sesión de Hany (`?r=m3`) y consulté la base (solo SELECT ligeros).

---

## 1. Veredicto

**De 10 personas que ya probaron la app: 4 pagarían PRO y 1 recargaría.** Hoy, no mañana.

Por qué 4 y no 7:
- El producto se entiende y la prueba de 3 días está bien explicada (`TrialTerms`), pero **la garantía
  de 30 días no aparece donde se decide pagar** (ventana de planes, registro, candados). Solo está en
  un texto del Inicio sin plan. Es el argumento que quita el miedo y está escondido.
- **Nadie sabía qué compra con 2.000 créditos** hasta hoy. "2.000 créditos" no dice nada; "333
  imágenes o 12 anuncios en video" sí. (Ya está arreglado en Mis créditos, ruedita, aviso y ventana.)
- Datos reales: 1 suscripción activa y 3 canceladas; 2 recargas Boost el 19-sep (US$10 cada una) y
  ninguna desde entonces. Las cancelaciones dicen que el valor no se sintió en los 3 días.

Por qué solo 1 recarga:
- **Al cliente que paga y se queda sin saldo no se le invita a recargar en el momento.** El servidor
  responde `insufficient_credits` (402) y el cliente ve un toast "No tienes créditos suficientes." y
  nada más. La ventana de recarga solo se abre para probadores (`recharge_required`). Es el momento de
  más intención (acaba de pedir algo) y lo dejamos ir. Arreglo de 1 línea en `fnAuth.ts` (propuesto).
- La ventana de recarga mandaba a "Ver paquetes" (otra pantalla, scroll, elegir, botón): 4 pasos.
  Ahora compra directo el pack que desbloquea (POWER, 2.000 por US$20) en 1 toque (hecho).
- La escalera de packs era 5 tarjetas iguales en 3+2 sin decir qué rinde cada una ni para quién.

## 2. La app en una línea

**SUPERNOVA te enseña negocios digitales que ya llevan meses pagando anuncios y te ayuda a hacer tu
propia versión en español, con tu precio y tus anuncios, esta semana.**

## 3. Top 5 fallos (con pasos)

1. **Cliente sin saldo no recibe invitación a recargar.**
   Pasos: usuario PRO con saldo < costo → Creativos → Generar → el servidor devuelve 402
   `insufficient_credits` (`supabase/functions/_shared/media.ts:85`) → `fnErrorMessage` solo abre la
   ventana si `code === "recharge_required"` (`src/lib/fnAuth.ts:37`) → la persona ve un toast rojo y
   se queda. Impacto: cero recargas en el momento de más valor. Fix propuesto en §5 (P0).
2. **La garantía de 30 días no está donde se paga.**
   Pasos: cuenta sin plan → cualquier candado → ventana "Para usar X, activa tu plan" (`VitrinaContext`)
   → se ve prueba de 3 días, precio, beneficios, `TrialTerms`… y ninguna mención a la garantía. Igual en
   `SignupPage` y `PendingAccessPage`. Solo aparece en `DashboardPage.tsx:309`. Fix propuesto (P0).
3. **Video con IA está por debajo de la regla de 5×.**
   `vid_mini_5` = 55 créditos (US$0,44 al crédito más barato) y el costo real medido en `ai_usage`
   (video-studio, 12 llamadas, US$1,41) da US$0,118 por clip → 3,7×. Con las pruebas gratis de
   probadores (5 de 8 clips no se cobraron), el margen real del mes fue 2,0×. Propuesta: 70 créditos
   (5,1×) y que el video no entre en las 3 pruebas gratis o solo 1. Decide Jean.
4. **Mis créditos pide al servidor una suscripción de Stripe que está apagada.**
   `SubscriptionCard` llama `stripe-portal` en cada carga (Stripe apagado desde `STRIPE_ENABLED`),
   muestra "Cargando tu suscripción…" y después desaparece para quien paga por Whop sin fila en
   `subscriptions`. Igual pasa con cada "Comprar": `startCheckout` llama `stripe-checkout`, falla, y
   recién ahí va a Whop (1-2 s de "Abriendo el pago…"). Fix propuesto (P1).
5. **La ventana de probadores decía "Recarga al menos US$20" sin decir qué se consigue.**
   Y usaba `gradient-brand` (brillo) en vez del botón ámbar del sistema. Hecho: ahora dice qué cuesta,
   qué queda, qué rinden 2.000 créditos y compra en 1 toque con `btn-primary-nova`.

Otros (menores): el título decía "TUS CRÉDITOS" y la barra "Mis créditos" (unificado); la ruedita
se veía medio vacía con 21.000 créditos comprados (ahora, si los del mes se acaban y quedan
comprados, el anillo muestra esos); "PACK 100 / PACK 250" se nombran por precio y los otros por
apodo (no lo cambié: son los nombres de Whop; propongo abajo).

## 4. Cambios HECHOS (solo archivos de mi lista + sus pruebas)

- `src/components/CreditRing.tsx`
  - Nuevo `creditEquivalents()` y `creditEquivalentsLine()`: traducen créditos a piezas reales con
    `CREDIT_COSTS` (imagen 6, anuncio en video = 3 tomas × 55, texto corto 15, texto medio 30). Vive
    aquí porque la página de créditos se carga aparte (lazy) y la ruedita y el aviso la usan siempre.
  - Popover: debajo de "Saldo total" dice "Te rinde para ≈ N imágenes · N anuncios en video · N
    textos cortos". El enlace cambia a "Recargar créditos" cuando el saldo es bajo.
  - El anillo ya no se ve vacío/rojo cuando se acabaron los del mes pero hay comprados.
- `src/components/LowCreditBanner.tsx`
  - Dice qué rinde lo que queda ("Te quedan 120 créditos (≈ 20 imágenes o 8 textos cortos)").
  - Si no hay comprados y los del plan se renuevan en ≤ 3 días, lo dice antes de invitar a comprar
    ("Los de tu plan se renuevan mañana. ¿No puedes esperar? Recarga →"). No empujamos una compra
    que no hace falta.
  - Con saldo 0: "Se te acabaron los créditos". Enlace: "Recarga desde US$10: lo que compras no caduca".
- `src/components/RechargePopup.tsx`
  - Acepta `CustomEvent.detail` `{ reason, cost, balance }` (compatible con el `Event` actual).
  - Dos textos: probador ("Ya usaste tus pruebas gratis…") y cliente sin saldo ("Esto cuesta 55
    créditos y te quedan 12. Lo que ya hiciste queda guardado…").
  - Botón principal: "Recargar 2.000 créditos por US$20 →" → `startCheckout({pack:"power"})`
    (Whop, mismo id que `WHOP_PACKS`). Secundarios: "Ver todos los paquetes" y "Ahora no / Seguir
    probando otra cosa". Botón ámbar del sistema, sin gradiente.
  - Nueva prueba `src/components/RechargePopup.test.tsx` (2 casos).
- `src/pages/CreditsPage.tsx`
  - Título "MIS CRÉDITOS" (igual que la barra). Bajo la intro: "con los 2.000 créditos de tu plan
    haces ≈ 333 imágenes o 12 anuncios en video o 133 textos cortos (un anuncio en video son 3 tomas
    de 5 segundos)".
  - Bajo el anillo: "Te rinden para …" con el saldo real.
  - Packs: tarjeta única `PackCard` con "Te rinde para …" (incluye el regalo en los grandes), "+500 de
    regalo" junto a los créditos, y la escalera en dos filas: 3 chicos y, con subtítulo "Para quien
    produce todas las semanas", los 2 grandes con la explicación del cashback en una línea.
  - Taglines dicen para quién es cada pack (BOOST solo textos · POWER imágenes y anuncios cada
    semana · NUCLEAR video y varios anuncios por semana). Precios y créditos intactos.
  - Nota final: "El pago lo hace Whop; los créditos entran solos a tu cuenta al pagar."
- `src/components/CreditRing.test.tsx`: el mock de `useCredits` ahora incluye `CREDIT_COSTS`.

Verificación: `npx tsc --noEmit -p tsconfig.app.json` sin errores en estos archivos;
`npx vitest run` en verde: 48 archivos, 332 pruebas (incluye las 2 nuevas de RechargePopup).

## 5. Cambios PROPUESTOS (no toqué estos archivos)

### P0 · Abrir la ventana de recarga también al cliente sin saldo (`src/lib/fnAuth.ts`)
```diff
-export function offerRecharge() {
-  try { window.dispatchEvent(new Event("sn:recharge-required")); } catch { /* sin ventana (pruebas) */ }
+export function offerRecharge(detail?: { reason?: "recharge_required" | "insufficient_credits"; cost?: number; balance?: number }) {
+  try { window.dispatchEvent(new CustomEvent("sn:recharge-required", { detail })); } catch { /* sin ventana (pruebas) */ }
 }
 ...
-    if (data?.code === "recharge_required") offerRecharge();
+    if (data?.code === "recharge_required" || data?.code === "insufficient_credits") {
+      offerRecharge({ reason: data.code, cost: Number(data.cost) || undefined, balance: typeof data.balance === "number" ? data.balance : undefined });
+    }
```
Las funciones que no pasan por `fnErrorMessage` (`productBuilder.ts` → `insufficient_credits`,
`useLandingAnalyzer.ts`) deberían llamar `offerRecharge({ reason: "insufficient_credits" })` en su
rama de error. `RechargePopup` ya está listo para recibirlo.

### P0 · Garantía de 30 días donde se decide pagar (`src/components/PlanFeatures.tsx`, `TrialTerms`)
Con las palabras del manual, como reembolso:
```diff
         <li>
           ¿No te convenció? <b className={strong}>Cancela antes del día 4 y no pagas nada.</b> ...
         </li>
+        <li>
+          <b className={strong}>Garantía de 30 días.</b> Si no terminas tu producto en 30 días, te
+          devolvemos el 100 %. Se pide por correo a soyjeanhenriquez@gmail.com.
+        </li>
```
Esto la pone de una vez en la ventana de planes (vitrina), en el registro y en "acceso pendiente".
También en `LockedToolPage.tsx`, bajo el botón "Empezar mis 3 días gratis": una línea de 11 px
"3 días gratis · garantía de 30 días: si no terminas tu producto, te devolvemos el 100 %".

### P1 · No llamar a Stripe cuando está apagado (`src/lib/stripe.ts`, `SubscriptionCard.tsx`)
```diff
+const STRIPE_ON = import.meta.env.VITE_STRIPE_ENABLED === "true"; // espejo del secreto del servidor
 export async function startCheckout(body: CheckoutBody): Promise<boolean> {
-  const { data, error } = await supabase.functions.invoke("stripe-checkout", {...});
-  if (error || !data?.url) {
+  const res = STRIPE_ON ? await supabase.functions.invoke("stripe-checkout", {...}) : { data: null, error: new Error("off") };
+  if (res.error || !res.data?.url) {
```
Y en `SubscriptionCard`, saltar el paso 1 (`stripe-portal`) si `!STRIPE_ON`. Ahorra 1-2 s en cada
"Comprar" y el parpadeo de "Cargando tu suscripción…".

### P1 · Precio de Video con IA (decisión de Jean; tabla `credit_prices` + `CREDIT_COSTS`)
`vid_mini_5`: 55 → **70** créditos (5,1× sobre US$0,118 medido). `vid_mini_10`: 110 → **140**.
Y en `edge_guard_charge`, que el video cuente como 1 sola prueba gratis (no 3): hoy 5 clips gratis
costaron US$0,59 reales a una cuenta que no ha pagado.

### P2 · Nombres de los packs grandes (solo texto visible, `CreditsPage.tsx`)
"PACK 100" / "PACK 250" → "PACK ESTUDIO" (12.000) / "PACK AGENCIA" (30.000), para que la escalera
se lea por tamaño y no por precio. Los id y productos de Whop no cambian. Si Jean prefiere los
nombres actuales, se queda como está.

### P2 · Momento correcto para invitar a recargar (texto listo)
Hoy la app invita en 3 momentos: (a) franja arriba con < 200 créditos (cada sesión), (b) ventana
cuando una acción falla por saldo, (c) proyección en Mis créditos. Falta el momento de más valor:
**justo después de un resultado bueno**. Propuesta (sin nuevas pantallas): en `ToolFeedback`
("¿Te sirvió?"), cuando la persona marca "Sí" y su saldo es < 300, mostrar una línea debajo:
> "Te quedan 180 créditos (≈ 30 imágenes). Si quieres seguir a este ritmo, 2.000 créditos son
> US$20 y no caducan. [Recargar]"
Nunca en medio de una generación ni al abrir la app.

## 6. Lo que no pude comprobar

- **No vi mis cambios en el navegador.** No se despliega sin OK de Jean y el servidor local
  (`localhost:8091`) pide iniciar sesión (no tengo credenciales y no se deben pegar). Verifiqué con
  `tsc` y las pruebas unitarias; falta abrir Mis créditos, la ruedita y la ventana en producción
  después del deploy.
- No pude leer `admin_margin()` (solo admin) para los márgenes exactos por función; usé
  `ai_usage` y `credit_transactions` a mano.
- No pulsé ningún botón de pago de Whop. Los enlaces de los packs son los de `WHOP_PACKS`
  (`plan_MmMIIQFDwfLFg` para POWER) con el correo prellenado.
- No comprobé qué recibe `data.cost` / `data.balance` en cada función que devuelve 402: lo vi en
  `_shared/media.ts`; las demás (ai-chat, product-builder) pueden mandar solo `error`.

## Datos reales usados (últimos 30 días)

Créditos cobrados por acción (`credit_transactions`): search_ads 1.920 (384 usos, 2 personas, casi
todo el agente) · gen_master_prompt 600 (12 usos, 6 personas) · gen_light 600 (73 usos, 5) ·
gen_ad_image 553 (87 usos, 3) · unlock_kit 450 (3 usos, 1) · build_piece_std 390 (26, 1) ·
gen_medium 330 (37, 5) · vid_mini_5 165 (8 usos, 3 cobrados) · clone_carousel 105 (7, 1).

Costo real por función (`ai_usage`): enrich-offers US$1,79 (pipeline, 0 usuarios) · video-studio
US$1,41 (12 clips, 2 personas) · generate-ad-creative US$1,03 (89 imágenes, 3 personas) · el resto
< US$0,25 cada una. Total de IA pagada por usuarios ≈ US$3,30 en 30 días.

**Las 3 herramientas que sostienen el negocio:** (1) Generadores de texto (gen_light + gen_medium +
master_prompt: 1.530 créditos, 6 personas distintas, costo real < US$0,40 → margen enorme);
(2) Creativos e imágenes (643 créditos, 87 piezas, 5,0× justo); (3) Mini Apps / Crear producto
(unlock_kit + build_piece: 840 créditos de 1 sola persona, pero es el ticket más alto por uso).
**Lo que sobra para la monetización:** search_ads (5 créditos por búsqueda de un dato que el
manual dice que es gratis mirar; casi todo lo gasta el agente) y los modelos de video premium
(`vid_kling*`, `vid_wan*`, `avatar_*`: 0 usos en 30 días, 20+ precios en la tabla que nadie toca).
