import { Loader2 } from "lucide-react";

export default function MasterDashboardLoading() {
  return (
    <div className="w-full h-[60vh] flex flex-col items-center justify-center animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 relative z-10" />
        </div>
        <p className="text-[11px] font-black tracking-[0.2em] uppercase text-indigo-600/80">Loading...</p>
      </div>
    </div>
  );
}
