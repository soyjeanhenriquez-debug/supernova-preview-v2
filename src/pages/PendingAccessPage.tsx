import { useAuth } from "@/contexts/AuthContext";
import { Clock, LogOut, Mail } from "lucide-react";

export default function PendingAccessPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 card-surface rounded-2xl p-8 text-center space-y-5">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
            <Clock className="w-7 h-7 text-primary" />
          </div>
        </div>

        <div>
          <h1 className="font-display font-semibold text-2xl text-foreground mb-2">Acceso pendiente</h1>
          <p className="text-sm text-muted-foreground">
            Tu cuenta existe pero tu acceso a SUPERNOVA aún no ha sido activado o ha sido suspendido.
          </p>
        </div>

        <div className="px-3 py-2 rounded-lg bg-secondary/60 border border-border text-xs text-muted-foreground">
          Sesión actual: <span className="text-foreground font-medium">{user?.email}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Si eres miembro activo de la comunidad y crees que esto es un error, contáctanos.
        </p>

        <div className="space-y-2 pt-2">
          <a
            href="mailto:soyjeanhenriquez@gmail.com"
            className="w-full gradient-brand text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:opacity-90 flex items-center justify-center gap-2 glow-primary"
          >
            <Mail className="w-4 h-4" /> Contactar soporte
          </a>
          <button
            onClick={signOut}
            className="w-full py-3 rounded-lg font-medium text-sm text-muted-foreground hover:text-foreground border border-border hover:bg-secondary/40 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
