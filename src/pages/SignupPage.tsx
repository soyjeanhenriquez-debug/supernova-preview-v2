import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PLANS, checkoutUrl, type PlanKey } from "@/lib/plans";

/**
 * Funnel de registro self-serve (3 pasos):
 *  1. Datos (nombre, email, contraseña) → nada se envía todavía
 *  2. Quiz de expertise (4 preguntas) → adapta la app y alimenta analytics
 *  3. Crear cuenta + activar trial (checkout con tarjeta si hay URL configurada)
 *
 * El checkout se toma de VITE_CHECKOUT_URL (link de plan de Whop o Stripe
 * Payment Link con trial de 7 días). Si no está configurado, la cuenta se
 * crea igual y el usuario entra directo a la app.
 */

type Quiz = {
  experience_level: string;
  runs_ads: string;
  sells_what: string;
  main_goal: string;
};

const QUESTIONS: { key: keyof Quiz; title: string; options: string[] }[] = [
  {
    key: "experience_level",
    title: "¿Cuál es tu nivel en direct response marketing?",
    options: [
      "Estoy empezando desde cero",
      "Ya lancé campañas, sin resultados consistentes",
      "Facturo con ads, quiero escalar",
      "Vivo de esto hace años",
    ],
  },
  {
    key: "runs_ads",
    title: "¿Corres publicidad online actualmente?",
    options: [
      "Sí, en Meta Ads",
      "Sí, en otras plataformas",
      "Todavía no, pero voy a empezar",
    ],
  },
  {
    key: "sells_what",
    title: "¿Qué vendes (o quieres vender)?",
    options: [
      "Infoproducto o curso propio",
      "Servicios / agencia",
      "Afiliado de productos de otros",
      "Aún no lo tengo claro",
    ],
  },
  {
    key: "main_goal",
    title: "¿Qué esperas de SUPERNOVA?",
    options: [
      "Encontrar ofertas ganadoras",
      "Copiar ángulos y copy que venden",
      "Construir mi funnel completo",
      "Vigilar a mi competencia",
    ],
  },
];

const inputCls =
  "w-full rounded-lg border border-[#ffffff15] bg-[#141416] px-4 py-3.5 font-[Inter,sans-serif] text-sm text-[#F5F5F7] placeholder:text-[#86868B]/60 outline-none transition-colors duration-300 focus:border-[#C5A880]/50";

const labelCls =
  "mb-2 block font-[Inter,sans-serif] text-[11px] uppercase tracking-[0.25em] text-[#86868B]";

export default function SignupPage() {
  const [step, setStep] = useState(0); // 0 datos · 1..4 quiz · 5 final
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [quiz, setQuiz] = useState<Partial<Quiz>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<"session" | "confirm" | null>(null);

  const startQuiz = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Dinos tu nombre");
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Email inválido");
    if (password.length < 6) return toast.error("La contraseña necesita mínimo 6 caracteres");
    setStep(1);
  };

  const answer = (key: keyof Quiz, value: string) => {
    const next = { ...quiz, [key]: value };
    setQuiz(next);
    if (step < QUESTIONS.length) setStep(step + 1);
    if (step === QUESTIONS.length) void createAccount(next);
  };

  const createAccount = async (finalQuiz: Partial<Quiz>) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          display_name: name.trim(),
          signup_source: "trial",
          onboarding: finalQuiz,
        },
      },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message === "User already registered"
        ? "Ese email ya tiene cuenta. Inicia sesión."
        : error.message);
      setStep(0);
      return;
    }

    setDone(data.session ? "session" : "confirm");
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
          <Link to="/" className="font-[Inter,sans-serif] text-xs text-[#86868B] transition-colors hover:text-[#C5A880]">
            ← Volver
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

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 pb-20 pt-32">
        <AnimatePresence mode="wait">
          {/* Paso 0: datos */}
          {step === 0 && (
            <motion.div key="datos" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5 }}>
              <p className="mb-5 font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.35em] text-[#C5A880]">
                — Cuenta gratis
              </p>
              <h1 className="font-['Playfair_Display',serif] text-4xl font-medium leading-[1.1] sm:text-5xl">
                Empieza a copiar
                <br />
                ofertas <span className="italic text-[#C5A880]">ganadoras.</span>
              </h1>
              <p className="mt-5 font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#86868B]">
                Te creamos la cuenta en 30 segundos. 7 días gratis con acceso
                completo al radar y los generadores.
              </p>

              <form onSubmit={startQuiz} className="mt-10 space-y-5">
                <div>
                  <label className={labelCls} htmlFor="su-name">Nombre</label>
                  <input id="su-name" className={inputCls} placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="su-email">Email</label>
                  <input id="su-email" type="email" className={inputCls} placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="su-pass">Contraseña</label>
                  <input id="su-pass" type="password" className={inputCls} placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 border border-[#C5A880] bg-[#C5A880] px-8 py-4 font-[Inter,sans-serif] text-sm font-medium uppercase tracking-[0.14em] text-black transition-all duration-500 hover:bg-transparent hover:text-[#C5A880]"
                >
                  Continuar <ArrowRight className="h-4 w-4" />
                </button>
                <p className="text-center font-[Inter,sans-serif] text-xs text-[#86868B]">
                  ¿Ya tienes cuenta?{" "}
                  <Link to="/auth" className="text-[#C5A880] hover:underline">Inicia sesión</Link>
                </p>
              </form>
            </motion.div>
          )}

          {/* Pasos 1..4: quiz */}
          {q && (
            <motion.div key={q.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5 }}>
              <p className="mb-5 font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.35em] text-[#C5A880]">
                — Pregunta {step} de {QUESTIONS.length}
              </p>
              <h1 className="font-['Playfair_Display',serif] text-3xl font-medium leading-[1.15] sm:text-4xl">
                {q.title}
              </h1>
              <div className="mt-10 space-y-3">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={loading}
                    onClick={() => answer(q.key, opt)}
                    className="w-full rounded-lg border border-[#ffffff15] bg-[#141416] px-5 py-4 text-left font-[Inter,sans-serif] text-sm text-[#F5F5F7] transition-all duration-300 hover:border-[#C5A880]/50 hover:bg-[#1a1a1d]"
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {loading && (
                <p className="mt-6 text-center font-[Inter,sans-serif] text-xs text-[#86868B]">
                  Creando tu cuenta…
                </p>
              )}
            </motion.div>
          )}

          {/* Paso final: escalera de planes */}
          {step === QUESTIONS.length + 1 && (
            <motion.div key="final" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <p className="mb-5 text-center font-[Inter,sans-serif] text-[10px] uppercase tracking-[0.35em] text-[#C5A880]">
                — Tu cuenta está creada
              </p>
              <h1 className="text-center font-['Playfair_Display',serif] text-4xl font-medium leading-[1.1]">
                Elige tu nivel.
              </h1>
              <p className="mx-auto mt-4 max-w-sm text-center font-[Inter,sans-serif] text-sm font-light leading-relaxed text-[#86868B]">
                {done === "confirm"
                  ? `Te enviamos un enlace de confirmación a ${email}.`
                  : "Desbloquea el radar completo con 7 días gratis."}
              </p>

              <div className="mt-10 space-y-4">
                {(Object.keys(PLANS) as PlanKey[]).map((key) => {
                  const p = PLANS[key];
                  const featured = key === "proMax";
                  return (
                    <a
                      key={key}
                      href={checkoutUrl(key, email)}
                      className={`block rounded-xl border p-5 transition-all duration-500 ${
                        featured
                          ? "border-[#C5A880]/60 bg-[#C5A880]/5 hover:bg-[#C5A880]/10"
                          : "border-[#ffffff15] bg-[#141416] hover:border-[#C5A880]/40"
                      }`}
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="font-[Inter,sans-serif] text-sm font-semibold uppercase tracking-[0.14em] text-[#F5F5F7]">
                          {p.name}
                          {featured && (
                            <span className="ml-2 rounded bg-[#C5A880]/15 px-2 py-0.5 text-[10px] tracking-[0.15em] text-[#C5A880]">
                              Recomendado
                            </span>
                          )}
                        </span>
                        <span className="font-['Playfair_Display',serif] text-2xl text-[#C5A880]">
                          ${p.price}
                          <span className="font-[Inter,sans-serif] text-xs text-[#86868B]">{p.period}</span>
                        </span>
                      </div>
                      <p className="mt-1 font-[Inter,sans-serif] text-xs text-[#86868B]">
                        {p.tagline} · {p.features.join(" · ")}
                      </p>
                    </a>
                  );
                })}
              </div>

              <div className="mt-8 text-center">
                <Link
                  to="/"
                  className="font-[Inter,sans-serif] text-xs text-[#86868B] underline-offset-4 transition-colors hover:text-[#C5A880] hover:underline"
                >
                  {done === "confirm"
                    ? "Confirmaré mi correo y decido después"
                    : "Explorar primero con la cuenta gratis"}
                </Link>
                <p className="mt-5 flex items-center justify-center gap-1.5 font-[Inter,sans-serif] text-[11px] text-[#86868B]">
                  <Lock className="h-3 w-3" />
                  7 días gratis en planes PRO · Pago seguro vía Whop · Cancela cuando quieras
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-[#ffffff10] py-6 text-center font-[Inter,sans-serif] text-[11px] text-[#86868B]">
        Al registrarte aceptas los Términos y la Política de privacidad · © SUPERNOVA 2026
      </footer>
    </div>
  );
}
