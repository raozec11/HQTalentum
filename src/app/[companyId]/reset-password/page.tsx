"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { KeyRound, Lock, AlertTriangle, CheckCircle2, ArrowRight, ArrowLeft, Users, Eye, EyeOff, Check } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface ResetPasswordProps {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function ResetPasswordPage(props: ResetPasswordProps) {
  const params = use(props.params);
  const searchParams = use(props.searchParams);
  const router = useRouter();

  // Extract oobCode safely from searchParams (supporting aliases: oobCode, code, oob_code)
  const code = (
    (typeof searchParams.oobCode === "string" ? searchParams.oobCode : "") ||
    (typeof searchParams.code === "string" ? searchParams.code : "") ||
    (typeof searchParams.oob_code === "string" ? searchParams.oob_code : "")
  ).trim();
  const companyId = params.companyId.toLowerCase();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  // Verification states
  const [isValidating, setIsValidating] = useState(true);
  const [tokenError, setTokenError] = useState("");
  const [userEmail, setUserEmail] = useState("");

  // Submission states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // Load workspace details + verify the Firebase oobCode
  useEffect(() => {
    let isMounted = true;

    async function init() {
      // 1. Fetch company details from Firestore in parallel (non-blocking)
      getDoc(doc(db, "companies", companyId))
        .then((companySnap) => {
          if (isMounted) {
            if (companySnap.exists()) {
              const data = companySnap.data();
              setCompanyName(data.name || companyId);
              setCompanyLogo(data.logoUrl || null);
            } else {
              setCompanyName(companyId);
            }
          }
        })
        .catch(() => {
          if (isMounted) setCompanyName(companyId);
        });

      // 2. Verify reset code exists
      if (!code) {
        if (isMounted) {
          setTokenError("No password reset code found in the link. Please request a new reset link.");
          setIsValidating(false);
        }
        return;
      }

      // 3. Verify the oobCode with Firebase (10-second timeout safety guard)
      try {
        const verifyPromise = verifyPasswordResetCode(auth, code);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("VERIFICATION_TIMEOUT")), 10000)
        );

        const email = await Promise.race([verifyPromise, timeoutPromise]);
        if (isMounted) {
          setUserEmail(email);
        }
      } catch (err: any) {
        console.error("[ResetPw] OOB code verification failed:", err?.code, err?.message);
        if (isMounted) {
          let errMsg = "This password reset link is invalid or has expired.";
          if (err?.message === "VERIFICATION_TIMEOUT") {
            errMsg = "Verification timed out. Please refresh the page or request a new reset link.";
          } else if (err?.code === "auth/expired-action-code") {
            errMsg = "This password reset link has expired. Please request a new one from the login page.";
          } else if (err?.code === "auth/invalid-action-code") {
            errMsg = "This password reset link has already been used or is invalid. Please request a new one.";
          } else if (err?.code === "auth/user-disabled") {
            errMsg = "This account has been disabled. Please contact your administrator.";
          }
          setTokenError(errMsg);
        }
      } finally {
        if (isMounted) {
          setIsValidating(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [code, companyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    const isMinMax = password.length >= 8 && password.length <= 20;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (!isMinMax || !hasUpper || !hasLower || !hasSpecial) {
      setSubmitError("Password must be 8-20 characters long and contain a mix of uppercase, lowercase, and special characters.");
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }
    if (!code) {
      setSubmitError("Missing password reset code. Please request a new reset link.");
      return;
    }

    setIsSubmitting(true);
    try {
      const confirmPromise = confirmPasswordReset(auth, code, password);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SUBMIT_TIMEOUT")), 12000)
      );

      await Promise.race([confirmPromise, timeoutPromise]);
      setIsSuccess(true);
    } catch (err: any) {
      console.error("[ResetPw] confirmPasswordReset failed:", err?.code, err?.message);
      let msg = "Failed to reset password. Please try again.";
      if (err?.message === "SUBMIT_TIMEOUT") {
        msg = "Request timed out. Please try submitting again or request a new link.";
      } else if (err?.code === "auth/weak-password") {
        msg = "Password is too weak. Please choose a stronger password (8-20 characters, with uppercase, lowercase, and special character).";
      } else if (err?.code === "auth/expired-action-code") {
        msg = "Reset link expired. Please request a new link from the login page.";
      } else if (err?.code === "auth/invalid-action-code") {
        msg = "Reset link already used. Please request a new link.";
      }
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading / Validating ──────────────────────────────────────────────────
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b] relative overflow-hidden p-4">
        <div className="absolute top-[20%] left-[20%] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[100px] mix-blend-screen animate-pulse"></div>
        <div className="absolute bottom-[20%] right-[20%] w-[400px] h-[400px] bg-violet-600/20 rounded-full blur-[100px] mix-blend-screen animate-pulse"></div>
        <div className="flex flex-col items-center gap-6 z-10">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-slate-400 font-bold tracking-widest uppercase text-sm animate-pulse">Verifying Reset Link</p>
        </div>
      </div>
    );
  }

  // ── Invalid / Expired Link ────────────────────────────────────────────────
  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b] relative overflow-hidden p-4 sm:p-6 font-sans">
        <div className="absolute top-[20%] left-[20%] w-[500px] h-[500px] bg-red-950/10 rounded-full blur-[120px] mix-blend-screen"></div>
        <div className="relative z-10 w-full max-w-[500px] bg-white/5 backdrop-blur-3xl rounded-[32px] p-8 md:p-12 shadow-2xl border border-white/10 text-center">
          <div className="w-20 h-20 mx-auto mb-8 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.15)]">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-4">
            Link Expired <span className="text-red-400">or Invalid</span>
          </h1>
          <p className="text-slate-400 font-medium text-[15px] leading-relaxed mb-8">
            {tokenError}
          </p>
          <a
            href={`/${companyId}/login`}
            className="inline-flex items-center justify-center gap-3 w-full h-14 bg-white hover:bg-slate-100 text-[#09090b] font-bold text-base rounded-2xl transition-all duration-300 hover:scale-[1.02] shadow-[0_4px_20px_rgba(255,255,255,0.15)]"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Login
          </a>
        </div>
      </div>
    );
  }

  // ── Success Screen ────────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b] relative overflow-hidden p-4 sm:p-6 font-sans">
        <div className="absolute top-[20%] left-[20%] w-[500px] h-[500px] bg-emerald-950/10 rounded-full blur-[120px] mix-blend-screen"></div>
        <div className="relative z-10 w-full max-w-[500px] bg-white/5 backdrop-blur-3xl rounded-[32px] p-8 md:p-12 shadow-2xl border border-white/10 text-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-20 h-20 mx-auto mb-8 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-4">
            Password <span className="text-emerald-400">Reset Complete</span>
          </h1>
          <p className="text-slate-400 font-medium text-[15px] leading-relaxed mb-8">
            Your password has been successfully updated. You can now sign in with your new credentials.
          </p>
          <a
            href={`/${companyId}/login`}
            className="inline-flex items-center justify-center gap-3 w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base rounded-2xl transition-all duration-300 hover:scale-[1.02] shadow-[0_4px_20px_rgba(16,185,129,0.25)]"
          >
            Go to Login <ArrowRight className="w-5 h-5" />
          </a>
        </div>
      </div>
    );
  }

  // ── Main Reset Password Form ──────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] relative overflow-hidden p-4 sm:p-6 font-sans">
      {/* Background Orbs */}
      <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '6s' }}></div>
      <div className="absolute bottom-[10%] right-[20%] w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[150px] mix-blend-screen animate-pulse" style={{ animationDuration: '8s', animationDelay: '1s' }}></div>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04]"></div>

      <div className="relative z-10 w-full max-w-[960px] flex flex-col md:flex-row rounded-[32px] overflow-hidden bg-white/5 backdrop-blur-[60px] border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.5)]">

        {/* Left Side: Branding */}
        <div className="w-full md:w-5/12 bg-black/40 backdrop-blur-md p-10 md:p-14 flex flex-col justify-center text-white relative border-r border-white/5 min-h-[300px] md:min-h-[500px]">
          <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left">
            {/* Logo */}
            <div className="w-20 h-20 mb-8 rounded-[20px] bg-gradient-to-b from-white/10 to-transparent border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.6)] flex items-center justify-center overflow-hidden p-1.5">
              <div className="w-full h-full bg-black/50 backdrop-blur-xl rounded-[15px] flex items-center justify-center overflow-hidden">
                {companyLogo ? (
                  <img src={companyLogo} alt={companyName || "Logo"} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-br from-white to-white/40">
                    {companyName?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <h1 className="text-[28px] md:text-[34px] font-bold mb-3 leading-none tracking-tight text-white drop-shadow-lg">
              {companyName}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-violet-300 mt-2 text-lg md:text-xl font-semibold opacity-90">
                Security Verification
              </span>
            </h1>

            <p className="text-white/50 text-[14px] leading-relaxed max-w-[280px] font-medium mt-2">
              Create a strong new password to secure your Talentum workspace account.
            </p>
          </div>
        </div>

        {/* Right Side: Reset Form */}
        <div className="w-full md:w-7/12 p-8 md:p-14 lg:p-16 bg-white flex flex-col justify-center relative shadow-[-20px_0_50px_rgba(0,0,0,0.1)]">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-bl-[100px] translate-x-10 -translate-y-10 blur-3xl opacity-60 pointer-events-none"></div>

          <div className="max-w-[360px] w-full mx-auto relative z-10">
            <div className="mb-10 text-center md:text-left">
              <h2 className="text-[26px] md:text-[30px] font-bold text-slate-900 mb-2 tracking-tight">
                Set New Password
              </h2>
              {userEmail && (
                <>
                  <p className="text-slate-500 font-semibold text-[13px] uppercase tracking-wider mb-2">
                    Account
                  </p>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-[14px] font-semibold border border-indigo-100">
                    <Lock className="w-3.5 h-3.5" /> {userEmail}
                  </div>
                </>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {submitError && (
                <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-[13px] font-semibold border border-red-100 flex items-start gap-3 animate-in fade-in zoom-in-95 duration-200">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span className="leading-snug">{submitError}</span>
                </div>
              )}

              <div className="space-y-4 md:space-y-5">
                {/* New Password */}
                <div className="group">
                  <label className="text-[13px] font-semibold text-slate-500 uppercase tracking-widest block mb-1.5 transition-colors group-focus-within:text-indigo-600">
                    New Password
                  </label>
                  <div className="relative">
                    <KeyRound className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password (8-20 characters)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      maxLength={20}
                      className="pl-12 pr-12 h-14 bg-slate-50 border-slate-200/60 focus:bg-white focus:border-indigo-500 ring-4 ring-transparent focus:ring-indigo-500/10 rounded-2xl text-[15px] font-medium transition-all shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-md"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {password && (
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mt-2 space-y-2 text-xs">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password Requirements</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-semibold">
                        <div className="flex items-center gap-2">
                          <Check className={`w-3.5 h-3.5 ${password.length >= 8 && password.length <= 20 ? "text-emerald-600" : "text-slate-400"}`} />
                          <span className={password.length >= 8 && password.length <= 20 ? "text-emerald-600" : "text-slate-500"}>8-20 characters</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className={`w-3.5 h-3.5 ${/[A-Z]/.test(password) ? "text-emerald-600" : "text-slate-400"}`} />
                          <span className={/[A-Z]/.test(password) ? "text-emerald-600" : "text-slate-500"}>1 uppercase letter</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className={`w-3.5 h-3.5 ${/[a-z]/.test(password) ? "text-emerald-600" : "text-slate-400"}`} />
                          <span className={/[a-z]/.test(password) ? "text-emerald-600" : "text-slate-500"}>1 lowercase letter</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className={`w-3.5 h-3.5 ${/[^A-Za-z0-9]/.test(password) ? "text-emerald-600" : "text-slate-400"}`} />
                          <span className={/[^A-Za-z0-9]/.test(password) ? "text-emerald-600" : "text-slate-500"}>1 special character</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="group">
                  <label className="text-[13px] font-semibold text-slate-500 uppercase tracking-widest block mb-1.5 transition-colors group-focus-within:text-indigo-600">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <KeyRound className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="pl-12 pr-12 h-14 bg-slate-50 border-slate-200/60 focus:bg-white focus:border-indigo-500 ring-4 ring-transparent focus:ring-indigo-500/10 rounded-2xl text-[15px] font-medium transition-all shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-md"
                    />
                  </div>
                  {/* Password match indicator */}
                  {confirmPassword && (
                    <p className={`mt-1.5 text-[12px] font-semibold ${password === confirmPassword ? "text-emerald-600" : "text-red-500"}`}>
                      {password === confirmPassword ? "✓ Passwords match" : "✗ Passwords do not match"}
                    </p>
                  )}
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-14 mt-8 text-[15px] font-bold rounded-2xl bg-slate-900 hover:bg-slate-800 text-white shadow-[0_8px_20px_rgba(15,23,42,0.3)] hover:shadow-[0_15px_30px_rgba(15,23,42,0.4)] hover:-translate-y-0.5 transition-all duration-300 group"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-3">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Updating Password...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Update Password <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-8 text-center">
              <a
                href={`/${companyId}/login`}
                className="inline-flex items-center gap-2 text-[14px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Return to Login
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] font-bold text-white/40 tracking-widest uppercase flex items-center gap-2">
        <Users className="w-3.5 h-3.5" /> Powered by Talentum
      </div>
    </div>
  );
}
