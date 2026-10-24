# Reel "Esta IA hace X" — ingeniería inversa y cómo automatizarlo (24-oct-2026)

Referencia: reel de 40 s, 720×1280, 30 fps, en español (archivo de Jean en Descargas). Presenta una herramienta de IA
("Vulcania", clona webs) con un presentador creado con IA y cierra con "Comenta «MARQUEZ»" (palabra clave para que
un bot mande el enlace por DM, casi seguro con enlace de afiliado).

## 1. Cómo está hecho

**Guion (≈ 115 palabras en 40 s ≈ 2,9 palabras/s, voz rápida y sin pausas):**

| Tramo | Segundos | Qué dice | Qué se ve |
|---|---|---|---|
| Gancho | 0–4 | "Hay una IA que clona cualquier página web y te la deja lista para editar y publicar como tuya" | Presentador IA (sudadera, sala de servidores) hablando a cámara + **título fijo arriba**: "ESTA IA CLONA / CUALQUIER WEB (azul) / EN SEGUNDOS" en caja negra |
| Qué es | 4–12 | "se llama Vulcania. Es un agente de IA al que le pegas la URL… te la replica entera" | Logo de la herramienta en un celular sobre la mesa, barra de URL flotante con botón "REPLICATE", wireframes 3D azul/naranja |
| Cómo funciona | 12–21 | "Le das la URL… la navega como un humano… la reconstruye con código limpio" | **Capturas reales** de la herramienta en una ventana blanca flotando sobre un fondo desenfocado (el presentador sosteniendo algo) |
| Qué más hace | 21–26 | "cambia los colores… mete mi logo… conecta Stripe… formulario de reservas" | Un portátil por frase con la interfaz de marca (rueda de color, logo, "Payment", "Booking") |
| Resultado | 26–30 | "En unos minutos lo tendrás hecho y no habrás tocado ni una tecla" | Destello de luz naranja como transición + captura del resultado |
| Prueba / extras | 30–36 | "tiene plan gratuito… más de 3.000 herramientas… un CRM… una app para Android" | Logo + "Plan Gratuito", red de iconos "+4,188", ciudad 3D de apps, CRM y celular |
| Llamada | 36–40 | "Comenta MARQUEZ y te mando el enlace… créditos extra tu primer mes" | El presentador (otra ropa, oficina) + **"COMENTA «MARQUEZ»" arriba** |

**Edición:**
- Un plano nuevo cada 1–2 s, siempre al ritmo de la frase (cada imagen ilustra justo lo que se dice).
- Subtítulos de 1 a 3 palabras, MAYÚSCULAS, blanco, letra gruesa con sombra, centrados a ~75 % de la altura.
- Casi todo son **imágenes generadas con IA animadas** (movimiento lento de cámara) + 4–5 capturas reales de la
  herramienta. El presentador es un **personaje IA** con 2 apariencias (gancho y llamada).
- Paleta de la marca de la herramienta (azul/naranja sobre gris oscuro), destellos de luz como transición.

**Por qué funciona:** gancho de curiosidad con beneficio ("cualquier web, en segundos"), demostración visual de cada
frase, prueba (plan gratis, integraciones) y una llamada de una sola palabra que dispara el DM (y mide el interés).

## 2. Cómo lo hacemos mejor y automatizado en SUPERNOVA

**Entrada mínima:** el guion (texto) o el audio ya grabado, + la URL de la herramienta + la palabra para comentar.

**Pasos que haría la app sola:**
1. **Voz:** del texto → voz IA (o la de Jean); del audio → transcripción con tiempos por palabra.
2. **Plan de escenas (IA):** corta el guion en golpes de 1–2 s y a cada uno le asigna un tipo de plano:
   presentador (gancho y llamada) · logo/marca · captura real · concepto 3D · función en portátil/celular.
   Escribe el prompt de cada imagen con la paleta de la marca de la herramienta.
3. **Material:**
   - Capturas reales de la URL (navegador automático, gratis) → ventana flotante sobre fondo desenfocado.
   - Imágenes IA (GPT Image 2 o Nano Banana Pro) → animadas con Grok (mudo, barato) solo las que lo necesitan.
   - Presentador: avatar de SUPERNOVA o el de Jean, con labios sincronizados a la voz solo en gancho y llamada (Omni).
4. **Montaje en el navegador** (plantilla Remotion de "Sube tu video" + montaje de "Mi historia animada"):
   título arriba con palabra en azul, subtítulos por palabra, destellos entre bloques, cierre "COMENTA «PALABRA»".
5. **Salida:** MP4 + texto de la publicación → ofrecer publicarlo con Upload-Post (con el sí de Jean).

**Mejoras sobre el original:** capturas reales en vez de pantallas inventadas (más creíble), un plano por idea
(no repite planos), subtítulos con la palabra clave resaltada, gancho en el primer segundo y sin cifras dudosas
(el original dice "más de 3.000" y muestra "+4,188": nosotros solo números que se puedan comprobar).

## 3. Costo estimado (proveedor) por reel de 40 s

| Pieza | Cantidad | US$ |
|---|---|---|
| Imágenes GPT Image 2 | ~14 | 0,16 |
| Animación Grok 6 s (mudo) | ~6 | 0,69 |
| Presentador con labios (Omni 6 s) | 2 | 0,60 |
| Plan de escenas (IA de texto) | 1 | ~0,01 |
| Capturas, montaje, subtítulos | — | 0 |
| **Total** | | **≈ 1,46** |

Voz: con ElevenLabs (ya pagado) no suma. A × 6 para clientes ≈ 1.100 créditos; mientras sea solo de Jean, sin cobro.

## 4. Dónde vive

Herramienta nueva solo para la cuenta de Jean (`isGenjutsuOwner`), junto a "Mi historia animada" en Creador.
Reutiliza: `yt-produce` (imágenes de escena), `avatar-studio` (Omni/Grok), `src/remotion/SubsVideo.tsx` (texto),
montaje de `HistoriaAnimada` (IndexedDB + renderMediaOnWeb). Nuevo: plan de escenas "reel-herramienta" en ai-chat
y la acción de capturas de una URL.
