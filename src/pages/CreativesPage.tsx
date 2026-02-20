import { Image, Video, FileText, TrendingUp, Plus } from "lucide-react";

const creatives = [
  { id: 1, name: "Summer_Hero_Banner.jpg", type: "image", platform: "Meta", ctr: "5.2%", impressions: "450K", status: "active" },
  { id: 2, name: "Product_Demo_30s.mp4", type: "video", platform: "YouTube", ctr: "3.8%", impressions: "1.2M", status: "active" },
  { id: 3, name: "Carousel_Products_Q4.png", type: "image", platform: "Meta", ctr: "4.1%", impressions: "320K", status: "active" },
  { id: 4, name: "Copy_B2B_LinkedIn.txt", type: "copy", platform: "LinkedIn", ctr: "1.9%", impressions: "85K", status: "paused" },
  { id: 5, name: "TikTok_UGC_Collaboration.mp4", type: "video", platform: "TikTok", ctr: "6.7%", impressions: "2.8M", status: "active" },
  { id: 6, name: "Retargeting_Banner_300x250.jpg", type: "image", platform: "Google", ctr: "2.3%", impressions: "560K", status: "active" },
];

const typeIcon = { image: <Image className="w-5 h-5" />, video: <Video className="w-5 h-5" />, copy: <FileText className="w-5 h-5" /> };
const typeColor = { image: "text-primary bg-primary/10", video: "text-accent bg-accent/10", copy: "text-warning bg-warning/10" };

export function CreativesPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{creatives.length} creatividades</div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-brand text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" /> Subir Creative
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {creatives.map((c) => (
          <div key={c.id} className="card-surface rounded-xl p-5 hover:border-primary/30 transition-all group cursor-pointer">
            {/* Preview placeholder */}
            <div className="w-full h-36 rounded-lg bg-secondary mb-4 flex items-center justify-center relative overflow-hidden">
              <div className={`p-4 rounded-xl ${typeColor[c.type as keyof typeof typeColor]}`}>
                {typeIcon[c.type as keyof typeof typeIcon]}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs px-2 py-1 rounded bg-primary/90 text-primary-foreground font-medium">Vista previa</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{c.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{c.platform}</div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-success" />
                  <span className="text-sm font-bold text-accent">{c.ctr} CTR</span>
                </div>
                <span className="text-xs text-muted-foreground">{c.impressions} imp.</span>
              </div>

              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${typeColor[c.type as keyof typeof typeColor]}`}>
                  {c.type}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === "active" ? "text-success bg-success/10" : "text-warning bg-warning/10"}`}>
                  {c.status === "active" ? "Activo" : "Pausado"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
