/**
 * Manual de SUPERNOVA: nunca contenido NSFW / "sin censura". El Radar trae anuncios reales de la Biblioteca
 * de Meta y alguno es para adultos (la prueba de Hany del 10-oct-2026 encontró un "🔞 sleep with me").
 * No se borran de la base: solo no se muestran en el Radar. Las palabras van en minúsculas.
 */
const ADULT = /🔞|\b(porn\w*|xxx|nsfw|onlyfans|sexo|sexual\w*|er[oó]tic\w*|desnud\w*|nude\w*|naked|sleep with me|hot girls?|chicas calientes|18\s?\+)\b/i;

export function isAdultAd(text: string | null | undefined): boolean {
  return !!text && ADULT.test(text);
}
