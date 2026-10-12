import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Turnstile } from "@/components/Turnstile";
import { authErrorMessage } from "@/lib/authErrors";
import { isValidEmail, suggestEmail } from "@/lib/authEmail";
import { loadEditorialFonts } from "@/lib/loadFonts";

loadEditorialFonts();

const CAPTCHA_ENABLED = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);
const MIN_PASSWORD = 8;
/** Segundos antes de ofrecer "reenviar correo" (cada correo nuevo anula el anterior). */
const RESEND_AFTER_S = 60;
const SUPPORT = "soyjeanhenriquez@gmail.com";

/**
 * Registro (R2-19, 12-oct-2026 · "entrar sin fricción"):
 *  1. Datos (nombre, correo, contraseña). Nada se envía todavía.
 *  2. Dos preguntas de un toque (antes cuatro): adaptan la app y alimentan user_onboarding.
 *  3. Se crea la cuenta y la persona confirma su correo → entra a la app.
 *
 * ANTES, al terminar las preguntas salía la escalera de planes con precios ("Empieza tus 3 días
 * gratis" + US$29,99 + US$99) cuando la persona aún no había visto NADA (le pasó a Jean el 11-oct).
 * Ahora el final es solo "confirma tu correo"; el valor llega primero (al entrar ve una muestra real
 * de las ofertas de hoy) y la invitación a la prueba de PRO, con su garantía, vive dentro de la app.
 *
 * El acceso de pago lo dan SOLO los webhooks de Whop (approved_emails). Registrarse no da acceso.
 * Quien llega de Whop ya pagado (?checkout_status=success) ve su variante: "crea tu cuenta con el
 * mismo correo que usaste al pagar".
 */

type Quiz = {
  experience_level: string;
  sells_what: string;
};

// Las respuestas se guardan tal cual (user_onboarding) y la IA las lee. En `sells_what`,
// businessProfile.ts y form-assist deducen el tipo de negocio con regex EN ESTE ORDEN:
// /shopify|tienda|f[ií]sico/ → /infoproducto|curso/ → /servicio|agencia/ → /afiliado/.
// Si cambias un texto, conserva su palabra clave y no metas la de otra opción.
// R2-19: se quitaron "¿pagas anuncios?" y "¿en qué te ayudamos primero?" (form-assist ya tolera que
// falten). Cada pregunta de más en el registro es gente que se va antes de ver la app.
const QUESTIONS: { key: keyof Quiz; title: string; options: string[] }[] = [
  {
    key: "experience_level",
    title: "¿Cuánta experiencia tienes vendiendo por internet?",
    options: [
      "Estoy empezando desde cero",
      "Ya probé con anuncios, pero todavía no vendo seguido",
      "Ya vendo con anuncios y quiero vender más",
      "Llevo años viviendo de esto",
    ],
  },
  {
    key: "sells_what",
    title: "¿Qué vendes o qué te gustaría vender?",
    options: [
      "Cursos, guías o productos digitales propios (infoproducto)",
      "Productos físicos en una tienda online (Shopify u otra)",
      "Un servicio (diseño, clases, agencia…)",
      "Productos de otras personas a cambio de una comisión (afiliado)",
      "Todavía no lo sé: quiero ideas",
    ],
  },
];

/** Atajo para abrir el correo según el dominio (solo los grandes; el resto no ve botón). */
function inboxFor(email: string): { label: string; url: string } | null {
  const d = email.split("@")[1]?.toLowerCase() ?? "";
  if (d === "gmail.com" || d === "googlemail.com") return { label: "Abrir Gmail", url: "https://mail.google.com/mail/u/0/#search/in%3Aanywhere+newer_than%3A1d" };
  if (/^(hotmail|outlook|live|msn)\./.test(d)) return { label: "Abrir Outlook", url: "https://outlook.live.com/mail/" };
  if (/^yahoo\./.test(d)) return { label: "Abrir Yahoo Mail", url: "https://mail.yahoo.com/" };
  if (d === "icloud.com" || d === "me.com") return { label: "Abrir iCloud Mail", url: "https://www.icloud.com/mail" };
  return null;
}

const inputCls =
  "w-full rounded-lg border border-[#ffffff15] bg-[#141416] px-4 py-3.5 font-[Inter,sans-serif] text-sm text-[#F5F5F7] placeholder:text-[#86868B]/60 outline-none transition-colors duration-300 focus:border-[#C5A880]/50";

const labelCls =
  "mb-2 block font-[Inter,sans-serif] text-[11px] uppercase tracking-[0.25em] text-[#86868B]";

const primaryBtn =
  "flex w-full items-center justify-center gap-2 border border-[#C5A880] bg-[#C5A880] px-8 py-4 font-[Inter,sans-serif] text-sm font-medium uppercase tracking-[0.14em] text-black transition-all duration-500 hover:bg-transparent hover:text-[#C5A880] disabled:opacity-50";

export default function SignupPage() {
  const [step, setStep] = useState(0); // 0 datos · 1..N preguntas · N+1 final
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [quiz, setQuiz] = useState<Partial<Quiz>>({});
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [emailChecked, setEmailChecked] = useState(false);
  // Whop devuelve aquí al comprador tras pagar (?checkout_status=success&receipt_id=...).
  // Se recuerda en la sesión para que no se pierda al avanzar por los pasos.
  const [paid] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const fromCheckout = q.get("checkout_status") === "success" || q.has("receipt_id");
    try {
      if (fromCheckout) sessionStorage.setItem("sn_paid", "1");
      return fromCheckout || sessionStorage.getItem("sn_paid") === "1";
    } catch { return fromCheckout; }
  });

  const normalizedEmail = email.trim().toLowerCase();
  const suggestion = emailChecked ? suggestEmail(normalizedEmail) : null;

  const resetCaptcha = () => { setCaptchaToken(""); setCaptchaResetKey((k) => k + 1); };

  const startQuiz = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) return void setFormError("Escribe tu nombre.");
    if (!isValidEmail(normalizedEmail)) return void setFormError("Ese correo no parece válido. Revisa que esté bien escrito (por ejemplo, nombre@gmail.com).");
    if (password.length < MIN_PASSWORD) return void setFormError(`La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`);
    if (CAPTCHA_ENABLED && !captchaToken) return void setFormError("Espera un segundo a que termine la verificación de seguridad (abajo del formulario).");
    setEmailChecked(true);
    setStep(1);
  };

  const answer = (key: keyof Quiz, value: string) => {
    if (loading) return;
    const next = { ...quiz, [key]: value };
    setQuiz(next);
    if (step < QUESTIONS.length) setStep(step + 1);
    else void createAccount(next);
  };

  const createAccount = async (finalQuiz: Partial<Quiz>) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        // El enlace del correo vuelve a la portada, que manda a /app con la sesión (vite.config.ts).
        emailRedirectTo: window.location.origin,
        data: {
          display_name: name.trim(),
          signup_source: "trial",
          onboarding: finalQuiz,
        },
        captchaToken: CAPTCHA_ENABLED ? captchaToken : undefined,
      },
    });
    setLoading(false);

    // Supabase no da error si el correo ya existe y está confirmado: devuelve un usuario
    // sin identidades. Hay que detectarlo o la persona espera un correo que nunca llega.
    const alreadyRegistered = !error && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
    if (alreadyRegistered) {
      toast.error("Ese correo ya tiene cuenta. Entra con tu correo y tu contraseña; si no la recuerdas, entra con un código por correo.", { duration: 9000 });
      window.location.href = "/auth";
      return;
    }
    if (error) {
      // Vuelve a los datos con el error a la vista (no solo en un aviso que se va): nada se pierde.
      setFormError(authErrorMessage(error, "signup"));
      resetCaptcha();
      setStep(0);
      return;
    }

    // Con sesión (si algún día se apaga "Confirmar correo"): directo a la app.
    if (data.session) { window.location.replace("/app"); return; }
    setStep(QUESTIONS.length + 1);
  };

  const q = step >= 1 && step <= QUESTIONS.length ? QUESTIONS[step - 1] : null;
  const progress = Math.min(step, QUESTIONS.length + 1) / (QUESTIONS.length + 1);

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0B0C] text-[#F5F5F7] antialiased">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#ffffff10] bg-[#0B0B0C]/60 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="font-[Inter,sans-serif] text-sm font-semibold uppercase tracking-[0.3em]">
            Supernova
          </Link>
          <Link to="/auth" className="font-[Inter,sans-serif] text-xs text-[#86868B] transition-colors hover:text-[#C5A880]">
            Ya tengo cuenta
          </Link>
        </nav>
        {/* Barra de progreso */}
        <div className="h-px w-full bg-[#ffffff10]">
          <div
            className="h-px bg-[#C5A880] transition-all duration-700"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 pb-20 pt-28">
        <AnimatePresence mode="wait">
          {/* Paso 0: datos */}
          {step === 0 && (
            <motion.div key="datos" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}>
              {paid && (
                <div className="mb-6 rounded-lg border border-[#22c55e]/40 bg-[#22c55e]/10 px-4 py-3 font-[Inter,sans-serif] text-sm leading-relaxed text-[#F5F5F7]">
                  ✅ <b>Listo, tu pago quedó registrado.</b> Ahora crea tu cuenta con el <b>mismo correo</b> que usaste al pagar: así tu acceso se activa solo.
                </div>
              )}
              <p className="mb-5 font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.35em] text-[#C5A880]">
                {paid ? "— Último paso" : "— Crea tu cuenta gratis"}
              </p>
              <h1 className="font-['Playfair_Display',serif] text-4xl font-medium leading-[1.1] sm:text-5xl">
                Encuentra qué vender
                <br />
                <span className="italic text-[#C5A880]">y crea tus anuncios.</span>
              </h1>
              <p className="mt-5 font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#86868B]">
                {paid
                  ? "Toma 30 segundos: tus datos, 2 preguntas de un toque y confirmas tu correo."
                  : "Crear tu cuenta es gratis y no pide tarjeta. Tus datos, 2 preguntas de un toque, confirmas tu correo y entras a ver ofertas reales que ya se venden hoy."}
              </p>

              <form onSubmit={startQuiz} className="mt-8 space-y-5" noValidate>
                <div>
                  <label className={labelCls} htmlFor="su-name">Nombre</label>
                  <input id="su-name" className={inputCls} placeholder="Tu nombre" autoComplete="given-name" autoFocus value={name} onChange={(e) => { setName(e.target.value); setFormError(""); }} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="su-email">Correo</label>
                  <input id="su-email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" className={inputCls} placeholder="tu@email.com" value={email}
                    onChange={(e) => { setEmail(e.target.value); setFormError(""); setEmailChecked(false); }}
                    onBlur={() => setEmailChecked(true)} />
                  {suggestion && (
                    <p className="mt-2 font-[Inter,sans-serif] text-xs text-[#d4d4d8]">
                      ¿Quisiste decir <b className="text-[#F5F5F7]">{suggestion}</b>?{" "}
                      <button type="button" onClick={() => { setEmail(suggestion); setEmailChecked(false); }} className="font-semibold text-[#C5A880] hover:underline">
                        Sí, corregir
                      </button>
                    </p>
                  )}
                  <p className="mt-1.5 font-[Inter,sans-serif] text-[11px] text-[#86868B]">
                    {paid ? "El mismo con el que pagaste en Whop." : "Te mandaremos un enlace para confirmarlo."}
                  </p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="su-pass">Contraseña</label>
                  <div className="relative">
                    <input id="su-pass" type={showPw ? "text" : "password"} autoComplete="new-password" className={`${inputCls} pr-11`} placeholder={`Mínimo ${MIN_PASSWORD} caracteres`} value={password}
                      onChange={(e) => { setPassword(e.target.value); setFormError(""); }} />
                    <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#F5F5F7]">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {CAPTCHA_ENABLED && (
                  <Turnstile onVerify={setCaptchaToken} resetKey={captchaResetKey} />
                )}
                {formError && (
                  <p role="alert" className="rounded-lg border border-[#f87171]/40 bg-[#f87171]/10 px-4 py-3 font-[Inter,sans-serif] text-sm leading-relaxed text-[#fecaca]">
                    {formError}
                  </p>
                )}
                <button type="submit" className={primaryBtn}>
                  Continuar <ArrowRight className="h-4 w-4" />
                </button>
                <p className="text-center font-[Inter,sans-serif] text-xs text-[#86868B]">
                  ¿Ya tienes cuenta?{" "}
                  <Link to="/auth" className="text-[#C5A880] hover:underline">Inicia sesión</Link>
                </p>
              </form>
            </motion.div>
          )}

          {/* Preguntas */}
          {q && (
            <motion.div key={q.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}>
              <button type="button" disabled={loading} onClick={() => setStep(step - 1)}
                className="mb-6 inline-flex items-center gap-1.5 font-[Inter,sans-serif] text-xs text-[#86868B] hover:text-[#F5F5F7] disabled:opacity-40">
                <ArrowLeft className="h-3.5 w-3.5" /> Atrás
              </button>
              <p className="mb-5 font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.35em] text-[#C5A880]">
                — Pregunta {step} de {QUESTIONS.length}
              </p>
              <h1 className="font-['Playfair_Display',serif] text-3xl font-medium leading-[1.15] sm:text-4xl">
                {q.title}
              </h1>
              <p className="mt-3 font-[Inter,sans-serif] text-xs text-[#86868B]">
                Un toque y listo. Con esto adaptamos la app a lo que necesitas.
              </p>
              <div className="mt-8 space-y-3">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={loading}
                    onClick={() => answer(q.key, opt)}
                    className={`w-full rounded-lg border px-5 py-4 text-left font-[Inter,sans-serif] text-sm text-[#F5F5F7] transition-all duration-300 hover:border-[#C5A880]/50 hover:bg-[#1a1a1d] disabled:opacity-60 ${
                      quiz[q.key] === opt ? "border-[#C5A880]/60 bg-[#1a1a1d]" : "border-[#ffffff15] bg-[#141416]"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {loading && (
                <p className="mt-6 text-center font-[Inter,sans-serif] text-xs text-[#86868B]" role="status">
                  Creando tu cuenta…
                </p>
              )}
            </motion.div>
          )}

          {/* Final: confirmar el correo. Sin planes ni precios: primero se ve la app. */}
          {step === QUESTIONS.length + 1 && (
            <motion.div key="final" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <ConfirmEmailStep email={normalizedEmail} paid={paid} onChangeEmail={() => { setStep(0); setEmailChecked(false); resetCaptcha(); }} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-[#ffffff10] py-6 text-center font-[Inter,sans-serif] text-[11px] text-[#86868B]">
        Al registrarte aceptas los <a href="/legal/terminos.html" className="underline-offset-2 hover:underline">Términos</a> y la{" "}
        <a href="/legal/privacidad.html" className="underline-offset-2 hover:underline">Política de privacidad</a> · © SUPERNOVA 2026
      </footer>
    </div>
  );
}

/**
 * "Confirma tu correo": lo único que falta para entrar. Dice qué buscar, dónde (Spam, Promociones),
 * deja reenviar el correo tras un minuto y corregir el correo si estaba mal escrito.
 */
function ConfirmEmailStep({ email, paid, onChangeEmail }: { email: string; paid: boolean; onChangeEmail: () => void }) {
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [resending, setResending] = useState(false);
  const [askCaptcha, setAskCaptcha] = useState(false);
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const inbox = inboxFor(email);

  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  const waitLeft = Math.max(0, RESEND_AFTER_S - Math.floor((now - sentAt) / 1000));

  const resend = async (captchaToken?: string) => {
    if (CAPTCHA_ENABLED && !captchaToken) { setAskCaptcha(true); return; }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin, captchaToken: CAPTCHA_ENABLED ? captchaToken : undefined },
    });
    setResending(false);
    setAskCaptcha(false);
    setToken("");
    setResetKey((k) => k + 1);
    if (error) { toast.error(authErrorMessage(error, "resend"), { duration: 9000 }); return; }
    setSentAt(Date.now());
    setNow(Date.now());
    toast.success("Te mandamos otro correo. Usa solo ese: el anterior ya no vale.");
  };

  // Con la verificación lista, se reenvía solo (un toque menos).
  useEffect(() => {
    if (askCaptcha && token && !resending) void resend(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askCaptcha, token]);

  return (
    <div>
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-[#C5A880]/50 text-[#C5A880]">
        <Mail className="h-6 w-6" strokeWidth={1.6} />
      </div>
      <p className="mb-4 text-center font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.35em] text-[#C5A880]">
        {paid ? "— Cuenta creada · tu pago ya está registrado" : "— Tu cuenta está creada"}
      </p>
      <h1 className="text-center font-['Playfair_Display',serif] text-4xl font-medium leading-[1.1]">
        Confirma tu correo para entrar.
      </h1>
      <p className="mx-auto mt-4 max-w-sm text-center font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#a1a1aa]">
        Te mandamos un enlace a <b className="font-medium text-[#F5F5F7]" data-ph-mask>{email}</b>.
      </p>

      <ol className="mt-8 space-y-3 rounded-xl border border-[#ffffff15] bg-[#141416] p-5 font-[Inter,sans-serif] text-sm leading-relaxed text-[#d4d4d8]">
        <li><b className="text-[#F5F5F7]">1.</b> Abre el correo. Puede tardar 1 o 2 minutos y llegar a Spam o Promociones. El asunto puede venir en inglés: es el nuestro.</li>
        <li><b className="text-[#F5F5F7]">2.</b> Toca el enlace. Usa <b className="text-[#F5F5F7]">solo el último</b> correo: si pides otro, el anterior deja de valer.</li>
        <li><b className="text-[#F5F5F7]">3.</b> Entras directo a SUPERNOVA. {paid
          ? "Tu plan se activa solo con el correo con el que pagaste."
          : "Lo primero que ves son ofertas reales que ya se están vendiendo hoy. Mirar no pide tarjeta."}</li>
      </ol>

      {inbox && (
        <a href={inbox.url} target="_blank" rel="noopener noreferrer" className={`${primaryBtn} mt-6`}>
          {inbox.label} <ArrowRight className="h-4 w-4" />
        </a>
      )}

      <div className="mt-6 space-y-3 text-center font-[Inter,sans-serif] text-xs text-[#86868B]">
        <p>
          {waitLeft > 0 ? (
            <>¿No te llegó? Podrás pedir otro en {waitLeft} s.</>
          ) : (
            <button type="button" disabled={resending} onClick={() => void resend(token)} className="font-semibold text-[#C5A880] hover:underline disabled:opacity-50">
              {resending ? "Enviando…" : "¿No te llegó? Mandar otro correo"}
            </button>
          )}
        </p>
        {askCaptcha && CAPTCHA_ENABLED && (
          <Turnstile onVerify={setToken} resetKey={resetKey} />
        )}
        <p>
          ¿Escribiste mal tu correo?{" "}
          <button type="button" onClick={onChangeEmail} className="text-[#C5A880] hover:underline">Corregirlo</button>
        </p>
        <p>
          ¿Ya lo confirmaste? <Link to="/auth" className="text-[#C5A880] hover:underline">Entra con tu correo y tu contraseña</Link>
        </p>
        <p className="pt-2 text-[11px]">
          ¿Pasaron 10 minutos y nada? Escríbenos a{" "}
          <a href={`mailto:${SUPPORT}`} className="text-[#C5A880] hover:underline">{SUPPORT}</a> y te activamos a mano.
        </p>
      </div>
    </div>
  );
}
