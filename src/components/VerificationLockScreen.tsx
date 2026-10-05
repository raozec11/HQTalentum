"use client";

import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { Mail, Loader2, LogOut, RefreshCw } from "lucide-react";
import { showSuccess, showError } from "@/lib/alerts";
import { useAuth } from "@/context/AuthContext";

interface VerificationLockScreenProps {
  companyData: any;
}

export default function VerificationLockScreen({ companyData }: VerificationLockScreenProps) {
  const { user } = useAuth();
  const [resending, setResending] = useState(false);

  const handleResendActivation = async () => {
    if (!companyData?.id) return;
    setResending(true);
    try {
      // 1. Get user's ID token from Firebase Auth
      const idToken = await auth.currentUser?.getIdToken();

      // 2. Trigger API route to send email (it will handle token regeneration and write server-side)
      const res = await fetch("/api/notifications/send-activation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          companyId: companyData.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showSuccess("Activation email resent successfully!");
      } else {
        showError(data.error || "Failed to resend activation email.");
      }
    } catch (err: any) {
      console.error(err);
      showError("Failed to resend activation email. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-[#09090b] overflow-y-auto font-sans">
      {/* Sleek background details */}
      <div className="absolute top-1/4 left-1/4 w-[180px] sm:w-[400px] h-[180px] sm:h-[400px] bg-amber-500/10 rounded-full blur-[60px] sm:blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[200px] sm:w-[500px] h-[200px] sm:h-[500px] bg-indigo-500/5 rounded-full blur-[80px] sm:blur-[150px] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none"></div>

      <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="relative z-10 w-full max-w-md bg-white/[0.02] backdrop-blur-[30px] border border-white/10 rounded-3xl sm:rounded-[32px] p-5 sm:p-10 shadow-2xl text-center space-y-6 sm:space-y-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-amber-500/10 rounded-[20px] sm:rounded-[24px] flex items-center justify-center border border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
            <Mail className="w-8 h-8 sm:w-10 sm:h-10 text-amber-500 animate-bounce" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Activate Workspace</h1>
            <p className="text-amber-500 text-[10px] sm:text-xs font-black uppercase tracking-widest">Email Verification Required</p>
          </div>

          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-xs mx-auto font-medium">
            Your administrator account is ready, but you must verify your email address to activate your <strong className="text-white font-bold">7-day free trial</strong> and unlock the dashboard.
          </p>
          
          <div className="p-4 sm:p-5 bg-black/40 rounded-2xl border border-white/5 text-[11px] sm:text-[12px] text-slate-300 text-left space-y-2">
            <p className="font-bold text-slate-300 text-center pb-2 border-b border-white/5">Activation Status</p>
            <p className="flex items-start gap-1">
              <span className="text-indigo-400 font-bold">•</span>
              <span>Verification email sent to: <strong className="text-indigo-300 font-mono font-bold break-all">{companyData?.adminEmail || "your email"}</strong></span>
            </p>
            <p className="flex items-start gap-1">
              <span className="text-indigo-400 font-bold">•</span>
              <span>Click the activation link in that email to automatically activate your trial.</span>
            </p>
            <p className="flex items-start gap-1">
              <span className="text-indigo-400 font-bold">•</span>
              <span>If you did not receive it, click "Resend Email" below to request a new link.</span>
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={handleResendActivation}
              disabled={resending}
              className="w-full h-12 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-98 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer border-0"
            >
              {resending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" /> Sending Verification...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" /> Resend Activation Email
                </>
              )}
            </button>

            <button
              onClick={() => signOut(auth)}
              className="w-full h-12 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 hover:border-white/20 font-black text-xs uppercase tracking-wider rounded-xl active:scale-98 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-slate-400" /> Sign Out & Return
            </button>
            {user && (
              <p className="text-[10px] font-semibold text-slate-500 mt-2 break-all px-2">
                Logged in as: <span className="text-slate-400 font-mono">{user.email}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
