-- Enseñanza de la comunidad (Jean, 06-oct-2026). Entra "pendiente": Jean la revisa en
-- Admin → Enseñanzas y la publica él. Es una adaptación CON NUESTRAS PALABRAS (no copia) de una guía
-- de juanaia.com, con crédito, ampliada con dos requisitos de Apple que esa guía no cubre
-- (borrar la cuenta desde la app y funcionalidad mínima) y llevada a las herramientas de SUPERNOVA.
-- Correr DESPUÉS de la migración 20261005120000_community_guides.sql, como service_role (mismo
-- motivo que ensenanza_gta6.sql: sin usuario el trigger no fuerza el estado, se pone 'pendiente').
insert into public.community_guides (user_id, author_name, title, summary, body, tools, source_credit, source_url, status)
select r.user_id, 'Jean', 'Tu app en el App Store a la primera: lo que revisa Apple antes de aprobarte',
  'Las causas más comunes por las que Apple rechaza una primera app (privacidad, pruebas en iPhone, inicio de sesión, pagos y borrar la cuenta) y cómo dejarlas listas antes de enviarla.',
$md$
> Hacer la app con IA puede tomarte unas horas. Lo difícil es la **revisión de Apple**: una persona abre tu app en un iPhone de verdad y la usa. Si algo falla, te la devuelven con el número de la regla que incumpliste y vuelves a empezar.

Casi todos los rechazos de una primera app salen de la misma lista corta. Déjala lista **antes** de darle a "Enviar a revisión" y te ahorras días de ida y vuelta.

## 1 — Política de privacidad (regla 5.1.1)
Si tu app pide correo, nombre, ubicación o cualquier dato de la persona, Apple exige el enlace a tu política de privacidad. Sin él, ni la revisan.

- Créala con un generador gratis (Termly, iubenda) o escríbela tú con lo que de verdad guardas.
- Pega el enlace en **App Store Connect → tu app → Información de la app → Privacy Policy URL**.
- **Ábrelo en una ventana de incógnito antes de enviar.** Un enlace roto también es rechazo, y es el error más tonto: se arregla en 10 segundos pero te cuesta días.

## 2 — Pruébala en un iPhone real… y sin internet (regla 2.1)
Apple no lee tu código: usa tu app. Si se cierra sola, queda una pantalla en blanco o un botón no hace nada, la rechazan por "app incompleta".

- Súbela a **TestFlight** (la herramienta de Apple para probar antes de publicar) y úsala tú en tu propio iPhone, no solo en el simulador.
- **Prueba en modo avión.** Abre cada pantalla. Donde veas una ruedita que gira sin fin o una pantalla blanca, ahí hay un rechazo esperando. Sin conexión, la app debe mostrar un mensaje claro ("Sin conexión, inténtalo de nuevo"), no romperse.
- Si tiene inicio de sesión, deja una **cuenta de prueba** en las notas para el revisor (App Review Notes). Si no puede entrar, no puede aprobar nada.

Ejemplo de nota que funciona:

```
Cuenta de prueba
usuario: demo@tuapp.com
clave: (una clave solo para esta cuenta)

El inicio de sesión está en la primera pantalla.
Los pagos usan el entorno de pruebas (sandbox) de Apple.
La app se probó sin conexión.
```

Usa una cuenta creada solo para la revisión, nunca la tuya.

## 3 — Inicio de sesión con Google o Facebook (regla 4.8)
**Si tu app solo usa correo y contraseña propios, este punto no aplica.**

Si dejas entrar con Google, Facebook u otra cuenta de terceros, Apple te pide ofrecer también una opción que cuide la privacidad (que permita ocultar el correo y no rastree para publicidad). La forma más fácil de cumplir es **Sign in with Apple** ("Iniciar sesión con Apple").

- En Supabase, Clerk o Auth0 se activa desde su panel.
- Ponlo **en la misma pantalla y del mismo tamaño** que los otros botones, no escondido abajo.

## 4 — Pagos: aquí cae casi todo el mundo (regla 3.1.1)
La regla general, la que aplica en LATAM:

- **Vendes algo digital que se usa dentro de la app** (suscripción, funciones premium, créditos, cursos): tienes que cobrar con el sistema de Apple (**compras dentro de la app**, In-App Purchase). Mandar a la gente a pagar por fuera con un enlace a Stripe, Whop o Hotmart = rechazo.
- **Vendes algo físico o un servicio fuera de la app** (ropa, comida, una cita, un viaje): puedes cobrar con tu propia pasarela.

Lo que te quita Apple: **30 %**. Si facturas menos de US$1 millón al año, pide el **App Store Small Business Program** desde App Store Connect y baja a **15 %**.

**Haz la cuenta antes de poner el precio.** Una suscripción de US$29,99 te deja unos US$25,50 con el 15 % y unos US$21 con el 30 % (antes de impuestos). Si tus costos ya eran justos, ese recorte se come tu ganancia. En SUPERNOVA, abre **Precio y ganancia** y mete la comisión de Apple como un costo más.

Una nota honesta: en Estados Unidos y en la Unión Europea las reglas cambiaron en 2025 y ya se permite, con condiciones, enlazar a pagos por fuera. No es gratis ni igual en todos lados. Para vender en LATAM, cuenta con compras dentro de la app y revisa las reglas oficiales de Apple antes de decidir.

## 5 — Dos cosas más que casi nadie te cuenta
- **Borrar la cuenta desde la app (regla 5.1.1).** Si tu app permite crear una cuenta, también tiene que permitir borrarla desde dentro de la app. No basta con "escríbenos un correo".
- **No metas tu página web dentro de una app y ya (regla 4.2).** Si la app es solo tu web en una ventana, sin nada que aproveche el teléfono, Apple suele rechazarla por "funcionalidad mínima". Dale algo propio de una app: notificaciones, que funcione sin conexión, la cámara, widgets.

## Lista final antes de enviar
Repásala en este orden:

1. Enlace de privacidad puesto y probado en incógnito.
2. App probada en un iPhone real y en modo avión.
3. Cuenta de prueba en las notas para el revisor.
4. Sign in with Apple activado (solo si usas Google o Facebook).
5. Pagos digitales con compras dentro de la app, Small Business Program pedido y precio recalculado.
6. Opción para borrar la cuenta dentro de la app.
7. Ninguna pantalla en blanco, ningún botón muerto, ningún enlace roto.

## ¿Y qué app hago?
Si todavía no tienes la idea, no inventes desde cero: abre **Mini Apps listas** en SUPERNOVA y elige un kit de algo que ya se está vendiendo. Hacer la app es lo rápido; pasar la revisión con esta lista es lo que la pone en el App Store.

*Esta guía explica las reglas como las publica Apple hoy. Apple las cambia seguido: antes de enviar, revisa las App Review Guidelines oficiales.*
$md$,
  array['miniapps', 'precio'],
  'juanaia.com, "4 cosas que arreglar antes de que Apple te rechace"',
  'https://juanaia.com/recursos/apple',
  'pendiente'
from public.user_roles r
where r.role = 'admin'
limit 1;
