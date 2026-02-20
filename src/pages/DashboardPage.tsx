import { MetricsGrid } from "@/components/MetricsGrid";
import { PerformanceChart, ChannelChart } from "@/components/Charts";
import { CampaignsTable } from "@/components/CampaignsTable";
import { ActivityPanel } from "@/components/ActivityPanel";

export function DashboardPage() {
  return (
    <div className="flex flex-1 gap-6">
      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-6 overflow-auto">
        <MetricsGrid />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PerformanceChart />
          <ChannelChart />
        </div>
        <CampaignsTable />
      </div>

      {/* Right panel */}
      <div className="w-72 flex-shrink-0 hidden xl:block">
        <ActivityPanel />
      </div>
    </div>
  );
}
