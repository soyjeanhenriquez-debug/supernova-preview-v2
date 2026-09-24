import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { invokeErrorMessage } from "@/lib/fnAuth";

export type Step =
  | "validate"
  | "fetch"
  | "ads"
  | "analyze"
  | "save"
  | "done";

export type StepState = "idle" | "running" | "done" | "error" | "skipped";

export interface LandingAd {
  id?: string;
  page_id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time?: string;
  publisher_platforms?: string[];
}

export interface IntelligenceResult {
  id?: string;
  url: string;
  domain: string;
  brandName: string;
  analysis: string;
  ads: LandingAd[];
  createdAt: string;
}

export const STEP_ORDER: Step[] = ["validate", "fetch", "ads", "analyze", "save"];

export const STEP_LABEL: Record<Step, string> = {
  validate: "URL detectada y validada",
  fetch:    "Extrayendo contenido de la landing page",
  ads:      "Buscando anuncios activos en Facebook Ads Library",
  analyze:  "Generando análisis de inteligencia",
  save:     "Guardando informe en tu historial",
  done:     "Completado",
};

const AD_COUNTRIES = ["MX", "CO", "AR", "ES", "US", "BR"];

export function useLandingAnalyzer() {
  const { user } = useAuth();
  const { applyServerCharge, canAfford } = useCredits();
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<Step, StepState>>({
    validate: "idle", fetch: "idle", ads: "idle", analyze: "idle", save: "idle", done: "idle",
  });
  const [result, setResult] = useState<IntelligenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mark = (s: Step, st: StepState) =>
    setSteps((prev) => ({ ...prev, [s]: st }));

  const reset = () => {
    setSteps({ validate: "idle", fetch: "idle", ads: "idle", analyze: "idle", save: "idle", done: "idle" });
    setResult(null); setError(null);
  };

  const analyze = useCallback(async (rawUrl: string, manualText?: string): Promise<IntelligenceResult | null> => {
    setError(null); setResult(null); setRunning(true);
    setSteps({ validate: "running", fetch: "idle", ads: "idle", analyze: "idle", save: "idle", done: "idle" });

    try {
      // 1. Validate
      let parsed: URL;
      try {
        parsed = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
      } catch {
        mark("validate", "error");
        throw new Error("URL inválida");
      }
      const domain = parsed.hostname.replace(/^www\./, "");
      mark("validate", "done");

      // Aviso temprano. El cobro (50) lo hace el servidor en el paso de análisis:
      // si falla la lectura de la landing o la búsqueda de anuncios, no se paga nada.
      if (!canAfford("landing_intelligence")) {
        throw new Error("Sin créditos suficientes. El Oráculo completo cuesta 50 créditos.");
      }

      // 2. Fetch landing (or use manual text)
      mark("fetch", "running");
      let brandName = domain;
      let landingContent = "";
      if (manualText && manualText.trim().length > 50) {
        landingContent = manualText.trim().slice(0, 5000);
        mark("fetch", "skipped");
      } else {
        const { data: fetchData, error: fetchErr } = await supabase.functions.invoke<{
          success: boolean; brandName?: string; bodyText?: string; title?: string;
          metaDescription?: string; ogDescription?: string; error?: string;
        }>("fetch-landing", { body: { url: parsed.toString() } });
        if (fetchErr || !fetchData?.success || !fetchData?.bodyText) {
          mark("fetch", "error");
          throw new Error("FETCH_FAILED");
        }
        brandName = fetchData.brandName || domain;
        landingContent = [
          fetchData.title, fetchData.metaDescription, fetchData.ogDescription, fetchData.bodyText,
        ].filter(Boolean).join("\n\n").slice(0, 5500);
        mark("fetch", "done");
      }

      // 3. Search ads in parallel (by domain & by brand) across countries
      mark("ads", "running");
      const seeds = Array.from(new Set([
        domain.split(".")[0],
        brandName,
      ].filter((s) => s && s.length >= 3)));
      const calls = seeds.flatMap((seed) =>
        AD_COUNTRIES.map((country) =>
          supabase.functions.invoke<{ data?: LandingAd[] }>("facebook-ads", {
            // Incluidas en el Oráculo (se cobra en analyze-landing): el servidor no las cobra aparte.
            body: { search_terms: seed, country, limit: 15, ad_active_status: "ACTIVE", purpose: "oraculo" },
          }).then((r) => r.data?.data ?? []).catch(() => [] as LandingAd[])
        )
      );
      const adsBatches = await Promise.all(calls);
      const adsAll = adsBatches.flat();
      const seen = new Set<string>();
      const ads: LandingAd[] = [];
      for (const a of adsAll) {
        const k = String(a.id ?? `${a.page_id}-${(a.ad_creative_bodies?.[0] ?? "").slice(0, 60)}`);
        if (!seen.has(k)) { seen.add(k); ads.push(a); }
        if (ads.length >= 12) break;
      }
      mark("ads", "done");

      // 4. AI analysis
      mark("analyze", "running");
      const { data: aiData, error: aiErr } = await supabase.functions.invoke<{
        analysis?: string; error?: string; billing?: { charged: number; balance: number | null };
      }>("analyze-landing", {
        body: {
          landingUrl: parsed.toString(),
          landingContent,
          activeAds: ads.slice(0, 6),
          domain,
          brandName,
        },
      });
      if (aiErr || !aiData?.analysis) {
        mark("analyze", "error");
        throw new Error(aiData?.error || await invokeErrorMessage(aiErr, "Fallo al generar análisis"));
      }
      if (aiData.billing) applyServerCharge("landing_intelligence", aiData.billing, domain);
      const analysis = aiData.analysis;
      mark("analyze", "done");

      // 5. Save
      mark("save", "running");
      let savedId: string | undefined;
      if (user?.id) {
        const { data: saved, error: saveErr } = await supabase
          .from("landing_analyses")
          .insert([{
            user_id: user.id,
            url: parsed.toString(),
            domain,
            brand_name: brandName,
            analysis_text: analysis,
            ads_found: JSON.parse(JSON.stringify(ads.slice(0, 6))),
          }])
          .select("id")
          .single();
        if (saveErr) {
          mark("save", "error");
        } else {
          savedId = saved?.id;
          mark("save", "done");
        }
      } else {
        mark("save", "skipped");
      }

      const out: IntelligenceResult = {
        id: savedId,
        url: parsed.toString(),
        domain,
        brandName,
        analysis,
        ads,
        createdAt: new Date().toISOString(),
      };
      setResult(out);
      mark("done", "done");
      return out;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return null;
    } finally {
      setRunning(false);
    }
  }, [user?.id, canAfford, applyServerCharge]);

  return { analyze, running, steps, result, error, reset, setResult };
}
