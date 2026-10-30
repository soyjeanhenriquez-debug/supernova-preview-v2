"""SUPERNOVA — Reels de Apify → «Reels que funcionan» (30-oct-2026).

Toda corrida de apify~instagram-scraper (de la app, del MCP o de una skill) se guarda en la base para no volver a
pagarla. Este script junta uno o varios JSON de Apify, quita repetidos (se queda con la copia que trae
transcripción) y escribe un JSON de filas para public.reel_biblioteca. No guarda enlaces de video ni de portada:
Instagram los vence en pocos días.

Uso:  python3 -I scripts/reels-apify-a-biblioteca.py salida.json corrida1.json [corrida2.json …]
Carga: subir salida.json al bucket temporal importes-temp y, en SQL,
  insert into public.reel_biblioteca (...) select ... from jsonb_to_recordset((select content::jsonb ...))
  on conflict (shortcode) do nothing;   (ver docs del 30-oct en la memoria supernova-reels-biblioteca)
"""
import json
import re
import sys

PALABRAS = {
    "es": {"que", "de", "el", "la", "los", "las", "y", "para", "con", "tu", "tú", "es", "no", "un", "una", "por", "yo", "lo", "como", "más"},
    "pt": {"que", "de", "o", "a", "os", "as", "e", "para", "com", "você", "não", "um", "uma", "por", "eu", "isso", "como", "mais", "é", "do", "da"},
    "en": {"the", "and", "you", "to", "of", "a", "is", "in", "it", "that", "for", "this", "your", "i", "with", "on", "my", "how"},
}


def idioma(texto: str) -> str | None:
    ws = re.findall(r"[a-záéíóúñãõâêôçü']+", (texto or "").lower())
    if len(ws) < 5:
        return None
    pts = {k: sum(1 for w in ws if w in v) for k, v in PALABRAS.items()}
    # «não», «você», «é» casi solo en portugués; «ñ» y «¿» casi solo en español.
    pts["pt"] += 3 * sum(1 for w in ws if w in {"não", "você", "isso", "também"})
    pts["es"] += 3 * len(re.findall(r"[ñ¿¡]", texto or ""))
    mejor = max(pts, key=pts.get)
    return mejor if pts[mejor] >= 3 else None


def fila(i: dict) -> dict | None:
    sc = i.get("shortCode")
    if not sc or i.get("type") not in ("Video", None) or not (i.get("videoUrl") or i.get("videoDuration")):
        return None
    m = i.get("musicInfo") or {}
    # El «audio original» viene con el nombre de la cuenta como artista: eso no es música.
    propio = m.get("uses_original_audio") or m.get("artist_name") == i.get("ownerUsername")
    musica = None if propio else (" – ".join(x for x in [m.get("artist_name"), m.get("song_name")] if x and x != "Original audio") or None)
    texto = i.get("transcript") or i.get("caption") or ""
    return {
        "shortcode": sc,
        "url": f"https://www.instagram.com/reel/{sc}/",
        "owner": i.get("ownerUsername"),
        "owner_name": i.get("ownerFullName"),
        "caption": (i.get("caption") or "")[:4000] or None,
        "transcript": (i.get("transcript") or "")[:12000] or None,
        "duration_s": i.get("videoDuration"),
        "views": i.get("videoPlayCount") or i.get("videoViewCount"),
        "likes": i.get("likesCount") if (i.get("likesCount") or 0) >= 0 else None,
        "comments": i.get("commentsCount"),
        "posted_at": i.get("timestamp"),
        "music": musica,
        "hashtags": (i.get("hashtags") or [])[:30],
        "language": idioma(texto),
    }


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    filas: dict[str, dict] = {}
    for ruta in sys.argv[2:]:
        for i in json.load(open(ruta, encoding="utf-8")):
            f = fila(i)
            if not f:
                continue
            prev = filas.get(f["shortcode"])
            if not prev or (f["transcript"] and not prev["transcript"]):
                filas[f["shortcode"]] = f
    # Sin texto suficiente: el idioma que más usa esa cuenta.
    por_cuenta: dict[str, dict[str, int]] = {}
    for f in filas.values():
        if f["language"] and f["owner"]:
            c = por_cuenta.setdefault(f["owner"], {})
            c[f["language"]] = c.get(f["language"], 0) + 1
    for f in filas.values():
        if not f["language"] and por_cuenta.get(f["owner"]):
            c = por_cuenta[f["owner"]]
            f["language"] = max(c, key=c.get)
    json.dump(list(filas.values()), open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False)
    con = sum(1 for f in filas.values() if f["transcript"])
    print(f"{len(filas)} reels ({con} con transcripción) → {sys.argv[1]}")


if __name__ == "__main__":
    main()
