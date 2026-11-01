/* Lógica compartida de las páginas de venta (/nueva/ y /nueva/negocios/). Cada página define window.AUD
   (su público, la factura de herramientas y la calculadora) antes de cargar este archivo. */
/* ===================== CONFIGURACIÓN (un solo lugar para cambiar precios y enlaces) =====================
   Jean decide los precios. Los enlaces son los productos de Whop que dio Jean (SUPERNOVA MES y SUPERNOVA ANUAL).
   combo.checkout vacío = falta crear el plan del combo en Whop (la página avisa en el borrador). */
var CFG = {
  priceMonthly: 39, // SUPERNOVA MES en Whop (plan_93briYTWt4o3U): US$39/mes
  checkoutMonthly: "https://whop.com/checkout/plan_93briYTWt4o3U",
  // UNA sola oferta hasta fin de año (Jean, 01-nov-2026). Cambia sola de fase; mismas fechas que _shared/claseSemanal.ts.
  // SUPERNOVA ANUAL en Whop: US$347 al año (Jean, 01-nov-2026). Una sola fase hasta el 31-dic.
  combo: { bonusCredits: 3000, comunidadMeses: 3, fases: [
    { name: "Plan Anual", event: "BLACK FRIDAY", price: 347, endsTxt: "31 de diciembre", endsAt: "2027-01-01T00:00:00-04:00", checkout: "https://whop.com/checkout/plan_18BwA5Fhx25n8" } // SUPERNOVA ANUAL, US$347/año
  ] },
  guarantee: "✓ Garantía de 30 días con reembolso del 100 %",
  verifiedAt: "31 de octubre de 2026",
  officialHost: "supernova-six-eta.vercel.app"
};

var FASE = CFG.combo.fases.filter(function (f) { return Date.now() < Date.parse(f.endsAt); })[0] || null;
CFG.combo.price = FASE ? FASE.price : 0; CFG.combo.checkout = FASE ? FASE.checkout : ""; CFG.combo.endsAt = FASE ? FASE.endsAt : "1970-01-01T00:00:00Z";

(function () {
  // Miles con punto también en 4 cifras (3.000, 7.500): el formato es-ES del navegador no los agrupa.
  var num = function (n) { var p = (Math.round(n * 100) / 100).toFixed(n % 1 ? 2 : 0).split("."); return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : ""); };
  var fmt = function (n) { return "US$" + num(n); };
  var x12 = CFG.priceMonthly * 12, save = x12 - CFG.combo.price;
  var P = {
    monthly: fmt(CFG.priceMonthly), monthlyLbl: fmt(CFG.priceMonthly) + "/mes",
    monthlyX12: fmt(x12), monthlyX12Lbl: fmt(x12) + " mes a mes",
    combo: fmt(CFG.combo.price), comboPerMonth: fmt(Math.round(CFG.combo.price / 12 * 100) / 100),
    comboSave: fmt(save), comboSavePct: "−" + Math.round(save / x12 * 100) + " %",
    bonusCredits: num(CFG.combo.bonusCredits), comunidadMeses: String(CFG.combo.comunidadMeses),
    guarantee: CFG.guarantee, verifiedAt: CFG.verifiedAt,
    comboName: FASE ? FASE.name : "", comboEvent: FASE ? FASE.event : "",
    comboRibbon: FASE ? FASE.event + " · " + FASE.name.toUpperCase() : "",
    comboKicker: FASE ? FASE.event + " · PRECIO ESPECIAL HASTA EL " + FASE.endsTxt.toUpperCase() : "",
    comboEndsTxt: FASE ? "Pago único por 12 meses. Termina el " + FASE.endsTxt + " a medianoche (hora de RD)." : "",
    comboEndsShort: FASE ? FASE.endsTxt : "",
    comboPerDay: fmt(Math.round(CFG.combo.price / 365 * 100) / 100),
    comunidadValor: fmt(99 * CFG.combo.comunidadMeses), // la Comunidad Creativos 10X se vende a US$99/mes
    // Lo que pasa al cerrar cada fase (fechas reales de CFG.combo.fases)
    comboNext: !FASE ? "" : (function () { var i = CFG.combo.fases.indexOf(FASE), sig = CFG.combo.fases[i + 1];
      return sig ? (sig.price > FASE.price ? "Después sube a " + fmt(sig.price) + "." : "") : "Después termina el precio especial."; })()
  };
  // Cuenta atrás de la oferta (la misma fecha que el popup)
  (function () {
    var D = document.getElementById("ofD"); if (!D || !FASE) return;
    var end = Date.parse(FASE.endsAt), pad = function (n) { return String(n).padStart(2, "0"); };
    var t = function () { var ms = Math.max(0, end - Date.now());
      D.textContent = Math.floor(ms / 864e5); document.getElementById("ofH").textContent = pad(Math.floor(ms / 36e5) % 24);
      document.getElementById("ofM").textContent = pad(Math.floor(ms / 6e4) % 60); document.getElementById("ofS").textContent = pad(Math.floor(ms / 1e3) % 60); };
    t(); setInterval(t, 1000);
  })();
  /* ---------- La factura de cada público: lo que pagaría por separado (precios públicos en US$) ---------- */
  var AUD = window.AUD || { page: "venta", tools: [] };
  var audMonth = AUD.tools.reduce(function (s, t) { return s + t.p; }, 0), audYear = Math.round(audMonth * 12 * 100) / 100;
  /* ---------- El paquete: cada parte con lo que reemplaza y su precio público anual (1-nov-2026) ---------- */
  var PAQ = [
    { n: "Radar de anuncios ganadores", d: "Más de 114.000 anuncios reales de la Biblioteca de Meta. Los que llevan meses pagándose, primero.", r: "Reemplaza AdSpy (US$149/mes)", v: 1788 },
    { n: "Video con IA", d: "Anuncios de 3 tomas con la misma persona, clips con sonido y motion graphics.", r: "Reemplaza Higgsfield Plus", v: 468 },
    { n: "Carrusel que vende y Creativos", d: "Carruseles con tu cara en la portada y más de 30 formatos de anuncio con imagen.", r: "Reemplaza Canva Pro + Midjourney", v: 264 },
    { n: "Textos que venden y Ganchos", d: "Páginas de venta, correos, guiones de reels y mensajes de WhatsApp, en español.", r: "Reemplaza ChatGPT Plus", v: 240 },
    { n: "Reel Studio y Sube tu video", d: "Reels con IA, subtítulos con gancho y edición sin saber editar.", r: "Reemplaza CapCut Pro", v: 239.88 },
    { n: "Avatar que habla y Estudio de avatar", d: "Tu avatar o un personaje IA hablando con voz IA, en fotos y videos tipo UGC.", r: "Reemplaza HeyGen Creator + ElevenLabs", v: 612 },
    { n: "Anuncio por escenas", d: "Anuncios de video de 15 segundos armados escena por escena, como los que ya venden.", r: "Incluido" },
    { n: "Estratega de anuncios", d: "Un chat que te arma la estrategia y los guiones UGC de tus anuncios en 4 pasos.", r: "Incluido" },
    { n: "Dale vida a tus láminas y tu historia animada", d: "Convierte una lámina en video y cuenta tu historia con un personaje 3D hecho desde tu foto.", r: "Incluido" },
    { n: "3 meses de Comunidad Creativos 10X", d: "Llamadas en vivo y gente creando contigo.", r: "Se vende a US$99/mes", v: 99 * CFG.combo.comunidadMeses },
    { n: "Ofertas ganadoras", d: "Más de 7.500 ofertas digitales analizadas y las 300 que más venden, con su página y su precio.", r: "Incluido" },
    { n: "Reels que funcionan y Analiza un Reel", d: "532 reels ya leídos (gancho, estructura y por qué funcionan) y tu versión de cualquier reel.", r: "Incluido" },
    { n: "Influencer IA", d: "Vende sin mostrar tu cara: un personaje creado con IA y sus guiones.", r: "Incluido" },
    { n: "Tu mes de contenido y calendario", d: "30 días de ideas con búsquedas reales, ordenados para publicar.", r: "Incluido" },
    { n: "2.000 créditos cada mes + " + num(CFG.combo.bonusCredits) + " de regalo", d: "Para crear todo lo de arriba. Los de regalo no caducan.", r: "Incluido" },
    { n: "Garantía de 30 días", d: "Si no es para ti, te devolvemos el 100 %.", r: "Sin riesgo" }
  ];
  var paqValue = PAQ.reduce(function (s, x) { return s + (x.v || 0); }, 0);
  P.stackValue = fmt(Math.round(paqValue * 100) / 100);
  var pq = document.getElementById("paqItems");
  if (pq) pq.innerHTML = PAQ.map(function (x, i) {
    return '<div class="pq-it rv"><span class="pq-n">' + String(i + 1).padStart(2, "0") + "</span><b>" + x.n + "</b><p>" + x.d + '</p><em class="' + (x.v ? "v" : "") + '">' + x.r + (x.v ? " · " + fmt(x.v) + " al año" : "") + "</em></div>";
  }).join("");
  P.audApps = String(AUD.tools.length); P.audMonth = fmt(Math.round(audMonth * 100) / 100); P.audYear = fmt(audYear);
  P.audSaveYear = fmt(Math.round((audYear - (CFG.combo.price || x12)) * 100) / 100);
  // Cuántos meses de apps sueltas pagan un año de SUPERNOVA
  P.audMonthsCover = audMonth ? String(Math.ceil((CFG.combo.price || x12) / audMonth)) : "";
  var tk = document.getElementById("ticketRows");
  if (tk) tk.innerHTML = AUD.tools.map(function (t) { return '<div class="tk-row"><span>' + t.n + "<small>" + t.d + "</small></span><s>" + fmt(t.p) + "</s></div>"; }).join("");
  var src = document.getElementById("ticketSrc");
  if (src) src.innerHTML = AUD.tools.map(function (t) { return '<a href="' + t.u + '" rel="noopener" target="_blank">' + t.n + "</a>"; }).join(" · ");
  document.querySelectorAll("[data-p]").forEach(function (el) { var v = P[el.getAttribute("data-p")]; if (v != null) el.textContent = v; });

  /* ---------- Medición (PostHog solo en el dominio oficial; mismos parámetros que la landing actual) ---------- */
  var official = location.hostname === CFG.officialHost;
  var q = [];
  window.snTrack = function (ev, props) {
    props = Object.assign({ page: (window.AUD && AUD.page) || "venta", variant: document.documentElement.dataset.variant || "a" }, props || {});
    if (window.posthog && window.posthog.capture) window.posthog.capture(ev, props); else q.push([ev, props]);
    if (!official && window.console) console.debug("[evento]", ev, props);
  };
  if (official) {
    var s = document.createElement("script"); s.async = true; s.src = "https://us-assets.i.posthog.com/static/array.js";
    s.onload = function () {
      if (!window.posthog || !window.posthog.init) return;
      window.posthog.init("phc_xn9sCcuLxhVP3hQ3oxNFiPVq2vzxiicKuCrPAG2q79iR", {
        api_host: "https://us.i.posthog.com", ui_host: "https://us.posthog.com", defaults: "2026-08-30",
        person_profiles: "identified_only", respect_dnt: true, disable_surveys: true, autocapture: true,
        capture_pageview: true, capture_pageleave: true, mask_personal_data_properties: true,
        session_recording: { maskAllInputs: true }
      });
      q.splice(0).forEach(function (e) { window.posthog.capture(e[0], e[1]); });
    };
    document.head.appendChild(s);
  }

  /* ---------- UTM: se conservan hacia el registro y el checkout ---------- */
  var utm = new URLSearchParams();
  new URLSearchParams(location.search).forEach(function (v, k) { if (/^(utm_|fbclid|gclid|ttclid)/.test(k)) utm.set(k, v); });
  var withUtm = function (url) { var u = utm.toString(); return u ? url + (url.indexOf("?") > -1 ? "&" : "?") + u : url; };
  document.querySelectorAll('a[href="/signup"], a[href="/clase/"]').forEach(function (a) { a.href = withUtm(a.getAttribute("href")); });

  /* ---------- Test A/B del titular (H2 de las hipótesis): ?v=b fuerza la variante ---------- */
  var variant = new URLSearchParams(location.search).get("v");
  if (!variant) { try { variant = localStorage.getItem("sn_v2_ab"); if (!variant) { variant = Math.random() < .5 ? "a" : "b"; localStorage.setItem("sn_v2_ab", variant); } } catch (e) { variant = "a"; } }
  document.documentElement.dataset.variant = variant;
  if (variant === "b" && AUD.h1b) {
    var h = document.getElementById("h1");
    h.innerHTML = AUD.h1b;
    if (AUD.leadB) document.querySelector(".hero .lead").textContent = AUD.leadB;
  }
  snTrack("landing_view", { utm: utm.toString() || null });

  /* ---------- Checkout ---------- */
  var comboOn = function () { return Date.now() < new Date(CFG.combo.endsAt).getTime(); };
  document.querySelectorAll("[data-checkout]").forEach(function (a) {
    var plan = a.getAttribute("data-checkout");
    var url = plan === "combo" ? CFG.combo.checkout : CFG.checkoutMonthly;
    a.href = url ? withUtm(url) : "#precios";
    a.addEventListener("click", function (e) {
      snTrack("checkout_start", { plan: plan, where: a.getAttribute("data-cta") });
      if (!url) { e.preventDefault(); alert("Borrador: falta el enlace de Whop del " + (FASE ? FASE.name : "combo") + "."); }
    });
  });
  document.querySelectorAll("[data-cta]").forEach(function (a) {
    if (a.hasAttribute("data-checkout")) return;
    a.addEventListener("click", function () { snTrack(a.getAttribute("data-cta") === "hero" ? "hero_cta_click" : "signup_start", { where: a.getAttribute("data-cta") }); });
  });
  document.querySelectorAll("[data-ev]").forEach(function (a) { a.addEventListener("click", function () { snTrack(a.getAttribute("data-ev")); }); });

  /* ---------- Aviso de borrador fuera del dominio oficial ---------- */
  if (!official) {
    var miss = [];
    if (!CFG.combo.checkout) miss.push("Enlace de Whop del " + (FASE ? FASE.name : "combo"));
    if (/ukBjctlEKufto/.test(CFG.checkoutMonthly) && CFG.priceMonthly !== 29.99) miss.push("Enlace del plan de US$" + CFG.priceMonthly + " (el actual cobra US$29,99)");
    var d = document.getElementById("draft");
    d.innerHTML = "<b>BORRADOR · no publicado</b>" + (miss.length ? "Falta: " + miss.join(" · ") : "Listo para revisar");
    d.style.display = "block";
    d.addEventListener("click", function () { d.style.display = "none"; });
  }

  /* ---------- Aparición al hacer scroll + contadores ---------- */
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("in"); io.unobserve(e.target);
      if (e.target.id === "week") e.target.querySelectorAll(".it").forEach(function (it, i) { it.style.transitionDelay = (i * 60) + "ms"; });
      e.target.querySelectorAll("[data-count]").forEach(countUp);
    });
  }, { threshold: .15, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".rv,#week,.stats,#ticket").forEach(function (el) { io.observe(el); });
  function countUp(el) {
    var to = +el.getAttribute("data-count"), pre = el.getAttribute("data-prefix") || "", t0 = performance.now(), dur = 1400;
    (function step(t) { var k = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3))); el.textContent = pre + num(v); if (k < 1) requestAnimationFrame(step); })(t0);
  }

  /* ---------- Videos: solo se descargan y reproducen cuando se ven (como los "mini" de Katana) ---------- */
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var vio = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { if (!v.src && v.dataset.src) v.src = v.dataset.src; if (!reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
      else if (!v.paused) v.pause();
    });
  }, { threshold: .2 });
  document.querySelectorAll("video[data-src]").forEach(function (v) { vio.observe(v); });

  /* ---------- Demo guiada: avanza sola, se puede tocar cada paso ---------- */
  var steps = document.querySelectorAll(".step"), panes = document.querySelectorAll(".pane"), cur = 0, timer, demoSeen = false;
  function go(i, manual) {
    cur = i;
    steps.forEach(function (s, k) { s.classList.toggle("on", k === i); s.setAttribute("aria-selected", k === i); });
    panes.forEach(function (p, k) { p.classList.toggle("on", k === i); });
    var ty = panes[i].querySelector("[data-type]"); if (ty) typeIt(ty);
    clearTimeout(timer); if (!manual && !reduce) timer = setTimeout(function () { go((cur + 1) % steps.length); }, 5500);
    if (manual) { steps.forEach(function (s) { var b = s.querySelector(".bar"); b.style.animation = "none"; }); }
  }
  steps.forEach(function (s, k) { s.addEventListener("click", function () { go(k, true); snTrack("demo_step", { step: k + 1 }); }); });
  function typeIt(el) { var t = el.getAttribute("data-type"), i = 0; el.textContent = ""; (function tick() { el.textContent = t.slice(0, ++i); if (i < t.length) setTimeout(tick, 28); })(); }
  new IntersectionObserver(function (es, o) { if (es[0].isIntersecting && !demoSeen) { demoSeen = true; go(0); snTrack("demo_view"); o.disconnect(); } }, { threshold: .35 }).observe(document.querySelector(".stage"));

  /* ---------- Pestañas de formatos ---------- */
  var tabs = document.querySelectorAll(".tab"), shows = document.querySelectorAll(".show");
  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      tabs.forEach(function (x) { x.setAttribute("aria-selected", x === t); });
      shows.forEach(function (s) { s.hidden = s.getAttribute("data-show") !== t.getAttribute("data-tab"); });
      snTrack("format_tab", { tab: t.getAttribute("data-tab") });
    });
  });

  /* ---------- Calculadora: lo que te cuesta seguir así, con los números de cada persona ---------- */
  var calc = document.getElementById("calc");
  if (calc) {
    var box = document.getElementById("calcTools"), hrs = document.getElementById("cHrs"), val = document.getElementById("cVal"), ag = document.getElementById("cAg"), ahorro = .5, used = false;
    box.innerHTML = AUD.tools.map(function (t, i) { return '<label class="ck"><input type="checkbox" data-i="' + i + '" checked><span>' + t.n + "</span><em>" + fmt(t.p) + "</em></label>"; }).join("");
    hrs.value = AUD.horas || 6; val.value = AUD.valorHora || 5;
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    var r = function (n) { return fmt(Math.round(n)); };
    var upd = function () {
      var tools = 0; box.querySelectorAll("input:checked").forEach(function (c) { tools += AUD.tools[+c.getAttribute("data-i")].p; });
      var tiempo = +hrs.value * 4.3 * +val.value, agencia = ag ? +ag.value : 0;
      var hoy = tools + tiempo + agencia, pagas = CFG.combo.price ? CFG.combo.price / 12 : CFG.priceMonthly;
      var neto = Math.max(0, tools + tiempo * ahorro + agencia - pagas);
      set("cHrsV", hrs.value + " h"); set("cValV", fmt(+val.value)); set("cAgV", r(agencia));
      set("cTools", r(tools)); set("cTime", r(tiempo)); set("cAgOut", r(agencia));
      set("cHoy", r(hoy)); set("cHoyY", r(hoy * 12)); set("cPay", fmt(Math.round(pagas * 100) / 100)); set("cNet", r(neto)); set("cNetY", r(neto * 12));
    };
    calc.addEventListener("input", function () { upd(); if (!used) { used = true; snTrack("calc_use"); } });
    calc.querySelectorAll("[data-save]").forEach(function (b) { b.addEventListener("click", function () {
      ahorro = +b.getAttribute("data-save"); calc.querySelectorAll("[data-save]").forEach(function (x) { x.classList.toggle("on", x === b); }); upd();
    }); });
    upd();
  }

  /* ---------- Precios vistos ---------- */
  new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { snTrack("pricing_view"); o.disconnect(); } }, { threshold: .3 }).observe(document.getElementById("precios"));

  /* ---------- CTA fijo en celular: aparece al pasar el hero, se esconde en precios y al final ---------- */
  var sticky = document.getElementById("sticky"), heroOut = false, hideZone = false;
  new IntersectionObserver(function (es) { heroOut = !es[0].isIntersecting; sticky.classList.toggle("on", heroOut && !hideZone); }).observe(document.querySelector(".hero-cta"));
  var zones = new Set();
  var zio = new IntersectionObserver(function (es) { es.forEach(function (e) { e.isIntersecting ? zones.add(e.target) : zones.delete(e.target); }); hideZone = zones.size > 0; sticky.classList.toggle("on", heroOut && !hideZone); });
  [document.getElementById("precios"), document.querySelector(".final"), document.querySelector("footer")].forEach(function (z) { zio.observe(z); });

  /* ---------- Black Friday: barra, cuenta atrás real y popup (una vez por sesión) ---------- */
  var modal = document.getElementById("bfModal"), lastFocus = null;
  if (!comboOn()) {
    document.getElementById("comboCard").remove();
    document.getElementById("billCombo").remove();
    return;
  }
  document.getElementById("bfBar").hidden = false;
  function pad(n) { return String(n).padStart(2, "0"); }
  function tickCd() {
    var ms = Math.max(0, new Date(CFG.combo.endsAt).getTime() - Date.now());
    var d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    document.getElementById("bfBarCd").textContent = d + "d " + pad(h) + ":" + pad(m) + ":" + pad(s);
    document.getElementById("cdD").textContent = d; document.getElementById("cdH").textContent = pad(h);
    document.getElementById("cdM").textContent = pad(m); document.getElementById("cdS").textContent = pad(s);
  }
  tickCd(); setInterval(tickCd, 1000);
  function openCombo(src) {
    if (modal.classList.contains("on")) return;
    lastFocus = document.activeElement; modal.classList.add("on"); document.body.style.overflow = "hidden";
    modal.querySelector("[data-checkout]").focus();
    try { sessionStorage.setItem("sn_bf_seen", "1"); } catch (e) {}
    snTrack("combo_popup_view", { source: src });
  }
  function closeCombo(go) {
    modal.classList.remove("on"); document.body.style.overflow = "";
    if (go) document.querySelector(go).scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    else if (lastFocus) lastFocus.focus();
    snTrack("combo_popup_close");
  }
  document.querySelectorAll("[data-open-combo]").forEach(function (b) { b.addEventListener("click", function () { openCombo("bar"); }); });
  document.querySelectorAll("[data-close-combo]").forEach(function (b) { b.addEventListener("click", function () { closeCombo(b.getAttribute("data-go")); }); });
  modal.addEventListener("click", function (e) { if (e.target === modal) closeCombo(); });
  document.addEventListener("keydown", function (e) {
    if (!modal.classList.contains("on")) return;
    if (e.key === "Escape") closeCombo();
    if (e.key === "Tab") { var f = modal.querySelectorAll("a,button"), a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  });
  var seen = false; try { seen = sessionStorage.getItem("sn_bf_seen") === "1"; } catch (e) {}
  if (!seen) {
    // Se abre a los 12 s o al bajar hasta la comparativa; en escritorio también al intentar salir.
    var fired = false, fire = function (src) { if (fired) return; fired = true; openCombo(src); };
    setTimeout(function () { fire("time"); }, 12000);
    new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { fire("scroll"); o.disconnect(); } }, { threshold: .3 }).observe(document.getElementById("comparar"));
    document.addEventListener("mouseout", function (e) { if (!e.relatedTarget && e.clientY < 8) fire("exit"); });
  }
})();
