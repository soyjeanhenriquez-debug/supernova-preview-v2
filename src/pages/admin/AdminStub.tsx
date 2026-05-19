import { Construction } from "lucide-react";

export function AdminStub({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
      <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
        <Construction className="w-8 h-8 mx-auto text-muted-foreground mb-3" strokeWidth={1.4} />
        <h3 className="font-display text-base">Sección en construcción</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Esta área forma parte del Panel Admin. Se entregará en la siguiente fase del plan aprobado.
        </p>
      </div>
    </div>
  );
}
