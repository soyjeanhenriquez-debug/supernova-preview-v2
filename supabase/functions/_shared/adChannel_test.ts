// Correr: deno test -A supabase/functions/_shared/adChannel_test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { channelFromCaption } from "./adChannel.ts";

Deno.test("WhatsApp, mensajes o página según el dominio del anuncio", () => {
  assertEquals(channelFromCaption("wa.me"), "whatsapp");
  assertEquals(channelFromCaption("API.WHATSAPP.COM"), "whatsapp");
  assertEquals(channelFromCaption("https://wa.me/18095551234"), "whatsapp");
  assertEquals(channelFromCaption("m.me"), "mensajes");
  assertEquals(channelFromCaption("instagram.com"), "mensajes");
  assertEquals(channelFromCaption("pay.hotmart.com"), "pagina");
  assertEquals(channelFromCaption("www.misitio.com/curso"), "pagina");
});

Deno.test("sin dominio claro no se inventa", () => {
  assertEquals(channelFromCaption(""), null);
  assertEquals(channelFromCaption("Más información"), null);
  assertEquals(channelFromCaption(undefined), null);
});
