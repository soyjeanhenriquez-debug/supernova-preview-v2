// SUPERNOVA — Nivel de consciencia y ángulo de venta para las funciones que arman el prompt en el
// SERVIDOR (motion-graphics). El navegador solo manda ids; aquí se validan contra esta lista y se
// convierten en instrucción. Mismos ids que src/lib/awareness.ts y src/lib/angles.ts (lo vigila
// src/lib/pieceStrategy.test.ts). Una pieza = un nivel y un ángulo.

export const LEVEL_RULES: Record<string, string> = {
  inconsciente: "nivel 1, no sabe que tiene el problema: ábrele los ojos con una historia, un dato curioso o algo que enseñe; nada de vender todavía",
  problema: "nivel 2, siente el dolor pero no sabe que hay salida: nombra su dolor con sus palabras y muestra que sí hay salida",
  solucion: "nivel 3, conoce soluciones pero no la tuya: explica el mecanismo, por qué esta sí funciona y por qué lo de siempre no",
  producto: "nivel 4, ya te conoce pero duda: dale pruebas (demostración, comparativa; reseñas o cifras solo si vienen en los datos)",
  "mas-consciente": "nivel 5, ya quiere comprar: dale el empujón con la oferta (fechas y garantías solo si vienen en los datos)",
};

export const ANGLE_RULES: Record<string, string> = {
  problema: "Problema / dolor: entra por una situación concreta que le molesta hoy",
  identidad: "Identidad: llámala por su grupo en la primera frase",
  mecanismo: "Mecanismo: un culpable concreto y por qué esto lo resuelve",
  beneficio: "Beneficio: el después con detalles del día a día, sin promesas",
  objeciones: "Rompe-objeciones: di la duda en voz alta y respóndela con una prueba",
  emocional: "Emocional: un momento concreto que se siente",
  estatus: "Estatus: cómo la ven los demás después, sin humillar",
  miedo: "Miedo / pérdida: la pérdida pequeña y repetida si sigue igual, sin alarmismo",
  comodidad: "Tiempo / comodidad: los pasos o minutos reales",
  precio: "Precio / valor: el precio real frente a un gasto cotidiano",
  comparacion: "Comparación: cómo lo hace hoy vs. con esto, sin marcas ajenas",
  mitos: "Rompe-mitos: di el mito, di no y explica lo que de verdad pasa",
  curiosidad: "Curiosidad: abre una pregunta y ciérrala dentro de la misma pieza",
  origen: "Historia de origen: solo la historia real del dueño",
  enemigo: "Enemigo común: una práctica o situación que los dos odian, nunca personas ni marcas",
  demostracion: "Demostración: el producto funcionando desde el primer segundo",
  "no-es-para": "Para quién NO es: a quién no le sirve y luego para quién sí",
  errores: "Errores comunes: 1 a 3 errores concretos y cómo evitarlos",
  autodiagnostico: "Autodiagnóstico: 2 o 3 preguntas de sí o no, sin diagnósticos de salud",
  detras: "Detrás de cámaras: el proceso real",
};

/** Instrucción para el prompt, o "" si no se eligió nada (o el id no existe). */
export function pieceStrategyRule(level: unknown, angle: unknown): string {
  const l = typeof level === "string" ? LEVEL_RULES[level] : undefined;
  const a = typeof angle === "string" ? ANGLE_RULES[angle] : undefined;
  const parts: string[] = [];
  if (l) parts.push(`NIVEL DE CONSCIENCIA (elegido por el usuario): ${l}. Toda la pieza le habla a ese nivel.`);
  if (a) parts.push(`ÁNGULO DE VENTA (elegido por el usuario): ${a}. Toda la pieza sale de este ángulo; no mezcles otros.`);
  return parts.length ? `\n${parts.join("\n")}` : "";
}
