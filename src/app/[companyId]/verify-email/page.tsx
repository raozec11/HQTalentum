"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { applyActionCode } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ShieldCheck, ShieldAlert, Loader2, ArrowRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VerifyEmailPage(props: { params: Promise<{ companyId: string }> }) {
  const params = use(props.params);
  const companyId = params.companyId;
  const searchParams = useSearchParams();
  const router = useRouter();

  const oobCode = searchParams.get("oobCode");

  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!oobCode) {
      setVerifying(false);
      setErrorMsg("Invalid or missing action verification code.");
      return;
    }

    async function verifyCode() {
      try {
        await applyActionCode(auth, oobCode);
        setSuccess(true);
      } catch (err: any) {
        console.error("Verification failed:", err);
        setErrorMsg(err.message || "Failed to verify email. The link may have expired or already been used.");
      } finally {
        setVerifying(false);
      }
    }

    verifyCode();
  }, [oobCode]);

  return (
    <div className="fixed inset-0 z-[99999] bg-[#09090b] overflow-y-auto font-sans flex items-center justify-center">
      {/* Premium ambient light background */}
      <div className="absolute top-1/4 left-1/4 w-[180px] sm:w-[400px] h-[180px] sm:h-[400px] bg-indigo-500/10 rounded-full blur-[60px] sm:blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[200px] sm:w-[500px] h-[200px] sm:h-[500px] bg-purple-500/5 rounded-full blur-[80px] sm:blur-[150px] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none"></div>

      <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-6 w-full">
        <div className="relative z-10 w-full max-w-md bg-white/[0.02] backdrop-blur-[30px] border border-white/10 rounded-[32px] p-8 sm:p-10 shadow-2xl text-center space-y-8">
          
          {verifying && (
            <div className="space-y-6 py-6">
              <div className="w-20 h-20 mx-auto bg-indigo-500/10 rounded-[24px] flex items-center justify-center border border-indigo-500/20 shadow-[0_0_30px_rgba(79,70,229,0.15)] animate-pulse">
                <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-black text-white tracking-tight">Verifying Your Email</h1>
                <p className="text-slate-400 text-sm font-medium">Please wait while we secure your account...</p>
              </div>
            </div>
          )}

          {!verifying && success && (
            <div className="space-y-6">
              <div className="w-20 h-20 mx-auto bg-emerald-500/10 rounded-[24px] flex items-center justify-center border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
                <ShieldCheck className="w-10 h-10 text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Email Verified!</h1>
                <p className="text-emerald-400 text-[10px] sm:text-xs font-black uppercase tracking-widest">Account Activated Successfully</p>
              </div>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed font-medium">
                Thank you! Your email ownership has been verified. You can now log into your dashboard and access all portal features.
              </p>
              <div className="pt-4">
                <Button
                  onClick={() => router.push(`/${companyId}/login`)}
                  className="w-full h-12 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-98 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer border-0 font-sans"
                >
                  Go to Login <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {!verifying && !success && (
            <div className="space-y-6">
              <div className="w-20 h-20 mx-auto bg-rose-500/10 rounded-[24px] flex items-center justify-center border border-rose-500/20 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
                <ShieldAlert className="w-10 h-10 text-rose-400" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Verification Failed</h1>
                <p className="text-rose-400 text-[10px] sm:text-xs font-black uppercase tracking-widest">Link Expired or Invalid</p>
              </div>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed font-medium">
                We were unable to verify your email. The action code may be expired, malformed, or has already been used to verify this account.
              </p>
              <div className="pt-4 space-y-3">
                <Button
                  onClick={() => router.push(`/${companyId}/login`)}
                  className="w-full h-12 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 hover:border-white/20 font-black text-xs uppercase tracking-wider rounded-xl active:scale-98 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  Return to Login
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
