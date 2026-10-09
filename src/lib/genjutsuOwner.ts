/**
 * Cuenta de Jean: la única que ve Genjutsu (laboratorio de Seedance 2.0, 07-oct-2026). Esto solo
 * esconde la pantalla y el botón; la compuerta real está en el servidor (_shared/genjutsu.ts) y en la RLS.
 */
export const GENJUTSU_OWNER_ID = "2687ca65-02c7-40db-b2fc-8ed0d57a4424";
export const isGenjutsuOwner = (uid: string | null | undefined) => uid === GENJUTSU_OWNER_ID;
