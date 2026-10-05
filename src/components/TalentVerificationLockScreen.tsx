"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { signOut, sendEmailVerification } from "firebase/auth";
import { Mail, Loader2, LogOut, RefreshCw } from "lucide-react";
import { showSuccess, showError } from "@/lib/alerts";
import { useAuth } from "@/context/AuthContext";

interface TalentVerificationLockScreenProps {
  companyId: string;
}

export default function TalentVerificationLockScreen({ companyId }: TalentVerificationLockScreenProps) {
  const { user, refreshUser } = useAuth();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleResendVerification = async () => {
    if (!auth.currentUser || !auth.currentUser.email) return;
    setResending(true);
    try {
      const res = await fetch("/api/notifications/send-verification-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: auth.currentUser.email,
          companyId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to resend verification email");
      }

      showSuccess("Verification email resent successfully!");
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Failed to resend verification email. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      await refreshUser();
      if (auth.currentUser?.emailVerified) {
        showSuccess("Email verified successfully! Welcome to the portal.");
      } else {
        showError("Email not verified yet. Please check your inbox and click the verification link.");
      }
    } catch (err: any) {
      console.error(err);
      showError("Failed to check status. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-[#09090b] overflow-y-auto font-sans flex items-center justify-center">
      {/* Premium background styling */}
      <div className="absolute top-1/4 left-1/4 w-[180px] sm:w-[400px] h-[180px] sm:h-[400px] bg-indigo-500/10 rounded-full blur-[60px] sm:blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[200px] sm:w-[500px] h-[200px] sm:h-[500px] bg-violet-500/5 rounded-full blur-[80px] sm:blur-[150px] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none"></div>

      <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-6 w-full">
        <div className="relative z-10 w-full max-w-md bg-white/[0.02] backdrop-blur-[30px] border border-white/10 rounded-3xl sm:rounded-[32px] p-5 sm:p-10 shadow-2xl text-center space-y-6 sm:space-y-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-indigo-500/10 rounded-[20px] sm:rounded-[24px] flex items-center justify-center border border-indigo-500/20 shadow-[0_0_30px_rgba(79,70,229,0.15)]">
            <Mail className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-400 animate-pulse" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Talent Portal Locked</h1>
            <p className="text-indigo-400 text-[10px] sm:text-xs font-black uppercase tracking-widest">Email Verification Required</p>
          </div>

          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-xs mx-auto font-medium">
            Congratulations on being added as a Talent! However, you must verify your email address to unlock your talent dashboard.
          </p>

          <div className="p-4 sm:p-5 bg-black/40 rounded-2xl border border-white/5 text-[11px] sm:text-[12px] text-slate-300 text-left space-y-2">
            <p className="font-bold text-slate-300 text-center pb-2 border-b border-white/5">Verification Steps</p>
            <p className="flex items-start gap-1.5">
              <span className="text-indigo-400 font-bold">•</span>
              <span>We sent a verification link to: <strong className="text-indigo-300 font-mono font-bold break-all">{user?.email}</strong></span>
            </p>
            <p className="flex items-start gap-1.5">
              <span className="text-indigo-400 font-bold">•</span>
              <span>Click that link to activate and unlock your portal instantly.</span>
            </p>
            <p className="flex items-start gap-1.5">
              <span className="text-indigo-400 font-bold">•</span>
              <span>Once clicked, return here and click "Check Verification Status".</span>
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="w-full h-12 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-98 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer border-0 font-sans"
            >
              {checking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" /> Checking...
                </>
              ) : (
                <>
                  Check Verification Status
                </>
              )}
            </button>

            <button
              onClick={handleResendVerification}
              disabled={resending}
              className="w-full h-12 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 hover:border-white/20 font-black text-xs uppercase tracking-wider rounded-xl active:scale-98 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              {resending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" /> Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" /> Resend Verification Email
                </>
              )}
            </button>

            <button
              onClick={() => signOut(auth)}
              className="w-full h-12 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 hover:border-white/20 font-black text-xs uppercase tracking-wider rounded-xl active:scale-98 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-slate-400" /> Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
