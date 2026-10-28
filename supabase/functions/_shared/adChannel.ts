// A dónde lleva un anuncio de Meta (28-oct-2026, Cindy/Jean): la API no da la URL de destino, pero sí el dominio
// que se ve en el anuncio ("wa.me", "hotmart.com", "m.me"). Con eso se separan las ofertas que venden por
// WhatsApp de las que llevan a una página de ventas.
export type AdChannel = "whatsapp" | "mensajes" | "pagina";

export function channelFromCaption(raw: unknown): AdChannel | null {
  if (typeof raw !== "string") return null;
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/\s?#]/)[0];
  if (!host || host.length > 100 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return "whatsapp";
  if (/(^|\.)(messenger\.com|m\.me|instagram\.com|ig\.me|facebook\.com|fb\.com|fb\.me)$/.test(host)) return "mensajes";
  return "pagina";
}
