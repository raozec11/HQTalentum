"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle, AlertTriangle, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";

function ActivateTrialContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = searchParams.get("companyId");
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "already_active">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    async function activate() {
      if (!companyId) {
        setStatus("error");
        setErrorMsg("Workspace ID (companyId) is missing in the activation link.");
        return;
      }

      if (!token) {
        setStatus("error");
        setErrorMsg("Activation verification token is missing. Please use the complete link sent to your email.");
        return;
      }

      try {
        const res = await fetch("/api/notifications/activate-trial", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            companyId,
            token
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setCompanyName(data.companyName || companyId);
          if (data.alreadyActive) {
            setStatus("already_active");
          } else {
            setStatus("success");
          }
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Verification failed.");
        }
      } catch (err: any) {
        console.error("Error activating trial:", err);
        setStatus("error");
        setErrorMsg(err.message || "An unexpected error occurred during activation.");
      }
    }

    activate();
  }, [companyId, token]);

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="fixed top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/8 rounded-full blur-[130px] pointer-events-none" />

      <div className="relative z-10 max-w-md w-full bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 shadow-2xl shadow-black/40 text-center">
        
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-6 h-6 text-white animate-pulse" />
          </div>
        </div>

        {status === "loading" && (
          <div className="space-y-6 py-6">
            <div className="flex justify-center">
              <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Activating Trial...</h2>
              <p className="text-sm text-slate-400 font-semibold mt-2">
                Verifying activation token and setting up your 7-day free trial. Please hold on.
              </p>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400">
                <CheckCircle className="w-10 h-10" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Trial Activated!</h2>
              <p className="text-sm text-slate-400 font-semibold mt-3">
                Workspace <span className="text-white font-extrabold">{companyName}</span> has been verified.
                Your 7-day free trial is now active.
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => router.push(`/${companyId}/login`)}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-indigo-600/20 hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
              >
                Go to Agency Login <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {status === "already_active" && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400">
                <CheckCircle className="w-10 h-10" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Already Active</h2>
              <p className="text-sm text-slate-400 font-semibold mt-3">
                Your workspace <span className="text-white font-extrabold">{companyName}</span> is already verified and has an active trial.
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => router.push(`/${companyId}/login`)}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-indigo-600/20 hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
              >
                Go to Agency Login <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center text-red-400">
                <AlertTriangle className="w-10 h-10" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-black text-red-400 tracking-tight">Activation Failed</h2>
              <p className="text-sm text-slate-400 font-semibold mt-3">
                {errorMsg}
              </p>
            </div>
            <div className="pt-4 space-y-3">
              <Link
                href="/"
                className="w-full py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-sm rounded-2xl transition-all flex items-center justify-center gap-2"
              >
                Back to Home
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function ActivateTrialPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#060911] text-slate-100 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
        </div>
      }
    >
      <ActivateTrialContent />
    </Suspense>
  );
}
