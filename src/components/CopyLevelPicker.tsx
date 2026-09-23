import { COPY_LEVELS, type BusinessProfile, type CopyLevel } from "@/lib/businessProfile";

/**
 * Selector compacto del tono de los anuncios (1 suave · 2 persuasivo · 3 agresivo). Es el mismo
 * dato que se elige en "Mi negocio" (Mándala, paso 1): cambiarlo aquí lo guarda para todo.
 */
export function CopyLevelPicker({ profile, onChange }: {
  profile: BusinessProfile;
  onChange: (next: BusinessProfile) => void;
}) {
  const current = COPY_LEVELS.find(l => l.id === profile.copy_level) ?? COPY_LEVELS[1];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Tono:</span>
      {COPY_LEVELS.map(l => (
        <button key={l.id} type="button" title={l.desc}
          onClick={() => onChange({ ...profile, copy_level: l.id as CopyLevel })}
          className={`rounded-full border px-2.5 py-1 ${profile.copy_level === l.id ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}>
          {l.id} · {l.label}
        </button>
      ))}
      <span className="text-muted-foreground/80 hidden sm:inline">· {current.desc}</span>
    </div>
  );
}
