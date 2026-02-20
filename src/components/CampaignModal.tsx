import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const campaignSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  platform: z.enum(["Meta", "Google", "TikTok", "LinkedIn", "Twitter", "YouTube", "Other"]),
  objective: z.enum(["conversions", "awareness", "traffic", "leads", "engagement", "app_installs"]),
  status: z.enum(["draft", "active", "paused"]),
  budget: z.number().min(0, "El presupuesto debe ser positivo"),
  description: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

type CampaignForm = z.infer<typeof campaignSchema>;

interface CampaignModalProps {
  onClose: () => void;
  onSuccess: () => void;
  editCampaign?: any;
}

export function CampaignModal({ onClose, onSuccess, editCampaign }: CampaignModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<CampaignForm>({
    resolver: zodResolver(campaignSchema),
    defaultValues: editCampaign
      ? {
          name: editCampaign.name,
          platform: editCampaign.platform,
          objective: editCampaign.objective,
          status: editCampaign.status,
          budget: editCampaign.budget,
          description: editCampaign.description || "",
          start_date: editCampaign.start_date || "",
          end_date: editCampaign.end_date || "",
        }
      : {
          platform: "Meta",
          objective: "conversions",
          status: "draft",
          budget: 0,
        },
  });

  const onSubmit = async (data: CampaignForm) => {
    if (!user) return;
    setLoading(true);
    try {
      const payload = {
        name: data.name,
        platform: data.platform,
        objective: data.objective,
        status: data.status,
        budget: data.budget,
        user_id: user.id,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        description: data.description || null,
      };

      if (editCampaign) {
        const { error } = await supabase.from("campaigns").update(payload).eq("id", editCampaign.id);
        if (error) throw error;
        toast.success("Campaña actualizada");
      } else {
        const { error } = await supabase.from("campaigns").insert([payload]);
        if (error) throw error;
        toast.success("Campaña creada");
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all";
  const labelClass = "block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5";
  const errorClass = "text-xs text-destructive mt-1";

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card-surface rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-display font-semibold text-foreground">
              {editCampaign ? "Editar Campaña" : "Nueva Campaña"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Completa los datos de tu campaña</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Nombre de la campaña *</label>
            <input {...register("name")} placeholder="ej. Black Friday 2025 – Conversiones" className={inputClass} />
            {errors.name && <p className={errorClass}>{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Plataforma *</label>
              <select {...register("platform")} className={inputClass}>
                {["Meta", "Google", "TikTok", "LinkedIn", "Twitter", "YouTube", "Other"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Objetivo *</label>
              <select {...register("objective")} className={inputClass}>
                <option value="conversions">Conversiones</option>
                <option value="awareness">Awareness</option>
                <option value="traffic">Tráfico</option>
                <option value="leads">Leads</option>
                <option value="engagement">Engagement</option>
                <option value="app_installs">App Installs</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Estado *</label>
              <select {...register("status")} className={inputClass}>
                <option value="draft">Borrador</option>
                <option value="active">Activa</option>
                <option value="paused">Pausada</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Presupuesto ($) *</label>
              <input
                {...register("budget", { valueAsNumber: true })}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className={inputClass}
              />
              {errors.budget && <p className={errorClass}>{errors.budget.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fecha inicio</label>
              <input {...register("start_date")} type="date" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Fecha fin</label>
              <input {...register("end_date")} type="date" className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Descripción (opcional)</label>
            <textarea
              {...register("description")}
              rows={3}
              placeholder="Describe el objetivo y audiencia de esta campaña..."
              className={`${inputClass} resize-none`}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg bg-secondary border border-border text-sm text-foreground hover:bg-secondary/80 transition-colors font-medium">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 gradient-brand text-primary-foreground py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : editCampaign ? "Actualizar" : "Crear Campaña"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
