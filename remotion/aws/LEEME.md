# Remotion Lambda en AWS (16-oct-2026)

Para que "Sube tu video" entregue el video con subtítulos en cualquier navegador y celular, el video se
arma en la nube con Remotion Lambda (AWS). Estos dos archivos son los permisos que pide Remotion
(generados con `remotion lambda policies role|user`, versión 4.0.506). No tienen claves.

- `remotion-lambda-policy.json` → política del ROL `remotion-lambda-role` (lo que puede hacer la función).
- `remotion-user-policy.json` → política del USUARIO `remotion-user` (lo que puede hacer SUPERNOVA con AWS).

Región: `us-east-1`. Las claves del usuario NUNCA van al repo ni al chat:
- en `supernova/remotion/.env` (ignorado por git): `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`
- en Supabase → Edge Functions → Secrets, con los mismos nombres.

Licencia: Remotion es gratis para personas y empresas de hasta 3 personas; desde 4 se paga
"Automators" (US$0,01 por video, mínimo US$100 al mes) — remotion.pro/license.
