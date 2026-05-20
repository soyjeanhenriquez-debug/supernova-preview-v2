import { todayQuote } from "@/lib/gamification";

export function DailyQuoteWidget() {
  const q = todayQuote();
  return (
    <section className="card-surface rounded-2xl p-8 text-center">
      <div className="max-w-2xl mx-auto">
        <p className="font-display text-[20px] leading-[1.4] text-foreground italic tracking-tight">
          "{q}"
        </p>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-medium mt-4">— Filosofía DR</div>
      </div>
    </section>
  );
}
