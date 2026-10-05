import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-3xl shadow-2xl shadow-indigo-500/10 border border-slate-100">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 relative z-10" />
        </div>
        <p className="text-[11px] font-black tracking-[0.2em] uppercase text-indigo-600/80">Loading</p>
      </div>
    </div>
  );
}
