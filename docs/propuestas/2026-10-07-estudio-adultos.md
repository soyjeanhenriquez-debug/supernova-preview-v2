# Estudio +18: diseño para aprobar (07-oct-2026)

**Pedido de Jean:** quien sea mayor de 18 puede crear contenido para adultos sin límites propios de
la app, partiendo de **cualquier imagen hecha con IA**, siempre que pague los créditos. Solo con
modelos que permiten ese contenido de forma explícita (como en PrimeLabs: "permite NSFW").

Estado: **solo diseño**. Nada de esto está construido.

## 1. Cómo se ve

- Una sección aparte, **"Estudio +18"**, que NO aparece en el Inicio, el menú, el buscador ni Aprende
  para nadie que no la haya activado.
- Para activarla: ser mayor de 18 según `is_adult()` (la edad ya se pregunta al entrar y queda fija) +
  aceptar una vez un aviso corto ("Contenido para adultos. Solo personas ficticias creadas con IA").
- Dentro: Imagen y Video, cada uno con su lista de modelos, y en cada tarjeta su costo en créditos.
  Las herramientas de siempre (Creativos, Carrusel, Video con IA…) siguen como están.

## 2. Qué se puede usar de entrada (la regla de "cualquier imagen hecha con IA")

- Texto (describir la escena) → sin restricciones propias.
- Imágenes de referencia: **solo imágenes generadas dentro de SUPERNOVA** (sus creativos, su
  Influencer IA, lo que ya creó en el Estudio +18). Sabemos de dónde salen porque las guardamos
  nosotros, así que sabemos que son de IA.
- **No se pueden subir fotos de la cámara o de internet** en esta sección. Una foto subida no se puede
  comprobar que sea de IA, y con ella cualquiera desnuda a una persona real. Este es el único punto
  que hace legal la sección; con él, todo lo demás queda libre.

## 3. Lo que no depende de nosotros (piso legal, no se negocia)

- Nada que muestre o sugiera menores de edad, en ningún caso. Bloqueo antes de generar (palabras y
  revisión de la imagen de referencia) y reporte si se intenta. Es delito en todos los países donde
  vendemos, y la plataforma responde.
- Los proveedores que usamos hoy (OpenAI, Google, fal con filtro, APIMart, HeyGen) no lo permiten:
  hace falta un proveedor que lo acepte por contrato (por ejemplo runningHub, como en PrimeLabs).

## 4. Proveedor, precios y cobro

- Proveedor: por definir con su lista de modelos y precio real por imagen/segundo. El precio para el
  cliente sigue la regla de siempre: costo real × 5 en créditos, cobrado en el servidor antes de
  generar y devuelto si falla.
- **Cobro:** antes de abrirla hay que leer las condiciones de Whop sobre contenido para adultos. Si no
  lo permiten, la sección necesita su propio cobro (procesadores especializados en adultos). Si Whop
  cierra la cuenta, se cae el cobro de todo SUPERNOVA: este punto decide si la sección se lanza.

## 5. Dónde se guarda

- Bucket privado aparte (`adultos/{uid}/…`), nunca en las galerías normales, en Aprende, en el bono por
  publicar ni en los ejemplos de la app.
- El bono por publicar y "Agregar a mi tracker" no aplican a esta sección.

## 6. Lo que necesito de Jean para construirlo

1. OK a este diseño (sobre todo el punto 2: referencias solo de imágenes hechas en la app).
2. El proveedor elegido (o que lo investigue y te traiga 2–3 opciones con precios).
3. La revisión de las condiciones de Whop (la hago yo y te digo qué dicen).
