"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Lock, Mail, Building2, AlertTriangle,
  Sparkles, Loader2, CheckCircle2, Shield, Users, Zap
} from "lucide-react";
import { UserRole, useAuth } from "@/context/AuthContext";

export default function GlobalLoginPage() {
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<"workspace" | "credentials">("workspace");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matchedCompanyId, setMatchedCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const router = useRouter();

  // Step 1: Verify workspace exists
  const handleWorkspaceLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const workspaceSlug = slug.trim().toLowerCase();

    if (workspaceSlug === "talentum") {
      setError(`Workspace "${slug}" is not registered on Talentum.`);
      setLoading(false);
      return;
    }

    try {
      let found = "";
      let foundName = "";
      const exactDoc = await getDoc(doc(db, "companies", workspaceSlug));
      if (exactDoc.exists()) {
        found = exactDoc.id;
        foundName = exactDoc.data().name || exactDoc.id;
      } else {
        const allCompanies = await getDocs(collection(db, "companies"));
        allCompanies.forEach((d) => {
          if (d.id.toLowerCase() === workspaceSlug) {
            found = d.id;
            foundName = d.data().name || d.id;
          }
        });
      }

      if (!found) {
        setError(`Workspace "${slug}" is not registered on Talentum.`);
      } else {
        setMatchedCompanyId(found);
        setCompanyName(foundName);
        setError("");
        setStep("credentials");
      }
    } catch {
      setError("Failed to verify workspace. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Authenticate + route
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) {
        setError("User profile not found.");
        await auth.signOut();
        return;
      }

      const userData = userDoc.data();
      const dbCompanyId = String(userData.companyId || "").trim().toLowerCase();
      const isMatch = dbCompanyId === matchedCompanyId.toLowerCase();

      if (!isMatch && userData.role !== "platform_admin") {
        setError(`Access denied. You do not belong to workspace "${companyName}".`);
        await auth.signOut();
        return;
      }

      await refreshUser();
      const role = userData.role as UserRole;
      if (role === "platform_admin") router.push("/master");
      else if (role === "admin" || role === "staff") router.push(`/${matchedCompanyId}/dashboard/admin`);
      else if (role === "talent") router.push(`/${matchedCompanyId}/dashboard/talent`);
      else if (role === "client") router.push(`/${matchedCompanyId}/dashboard/client`);
      else router.push(`/${matchedCompanyId}/dashboard`);
    } catch (err: any) {
      console.warn("Authentication failed:", err?.message || err);
      setError("Invalid credentials. Please verify your email and password.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          companyId: matchedCompanyId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to request password reset link.");
      } else {
        setSuccessMessage(data.message || "Reset link sent successfully.");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 flex relative overflow-hidden font-sans">

      {/* Animated background orbs */}
      <div className="absolute top-[-5%] left-[-5%] w-[600px] h-[600px] bg-indigo-600/15 rounded-full blur-[130px] pointer-events-none animate-pulse" style={{ animationDuration: "7s" }} />
      <div className="absolute bottom-[-10%] right-[-5%] w-[700px] h-[700px] bg-violet-600/10 rounded-full blur-[150px] pointer-events-none animate-pulse" style={{ animationDuration: "9s", animationDelay: "1s" }} />
      <div className="absolute top-[40%] left-[40%] w-[400px] h-[400px] bg-sky-600/8 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDuration: "11s", animationDelay: "2s" }} />

      {/* Left Branding Panel — desktop only */}
      <div className="hidden lg:flex w-[45%] min-h-screen bg-gradient-to-br from-[#0d1225] via-[#0a0e1d] to-[#060911] border-r border-white/5 flex-col justify-between p-14 relative overflow-hidden">

        {/* Panel background accents */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px] translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-violet-500/10 rounded-full blur-[80px] -translate-x-1/4 translate-y-1/4" />

        {/* Logo top */}
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-11 h-11 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black text-white tracking-tight">Talentum</span>
          </Link>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-10">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-xs font-black uppercase tracking-widest">
              <Shield className="w-3.5 h-3.5" /> Secure Multi-Tenant Platform
            </div>
            <h1 className="text-4xl xl:text-5xl font-black text-white leading-tight tracking-tight">
              Your Agency<br />
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-sky-400 bg-clip-text text-transparent">
                Portal Access
              </span>
            </h1>
            <p className="text-slate-400 text-base font-medium leading-relaxed max-w-xs">
              Admins, Staff, Talents, and Clients all enter through one secure gateway.
            </p>
          </div>

          {/* Feature pills */}
          <div className="space-y-3">
            {[
              { icon: Users, label: "All Roles Supported", sub: "Admin · Staff · Talent · Client" },
              { icon: Shield, label: "Workspace Isolation", sub: "Your data stays within your portal" },
              { icon: Zap, label: "Instant Role Routing", sub: "Auto-navigate to your dashboard" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-4 p-4 bg-white/3 border border-white/5 rounded-2xl backdrop-blur-sm">
                <div className="w-9 h-9 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{label}</p>
                  <p className="text-[11px] text-slate-500 font-semibold">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom footer */}
        <div className="relative z-10">
          <p className="text-xs text-slate-600 font-semibold">
            © {new Date().getFullYear()} Talentum · Multi-Tenant Agency Platform
          </p>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10 min-h-screen">

        {/* Mobile logo + back */}
        <div className="lg:hidden w-full max-w-sm mb-8 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-black text-slate-400 hover:text-white uppercase tracking-wider transition-all">
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-black text-white">Talentum</span>
          </div>
        </div>

        {/* Back link — desktop */}
        <div className="hidden lg:block absolute top-8 right-8">
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-300 uppercase tracking-wider transition-all">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>
        </div>

        {/* Step progress indicator */}
        <div className="w-full max-w-sm mb-8">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${step === "workspace" ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/25" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
              {step === "credentials" ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-4 h-4 flex items-center justify-center rounded-full bg-indigo-500/30 text-indigo-300 text-[9px]">1</span>}
              Workspace
            </div>
            <div className="flex-1 h-px bg-white/5" />
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${step === "credentials" ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/25" : "bg-white/3 text-slate-600 border border-white/5"}`}>
              <span className={`w-4 h-4 flex items-center justify-center rounded-full text-[9px] ${step === "credentials" ? "bg-indigo-500/30 text-indigo-300" : "bg-white/10 text-slate-600"}`}>2</span>
              Sign In
            </div>
          </div>
        </div>

        {/* Main card */}
        <div className="w-full max-w-sm">
          <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-[28px] p-8 shadow-2xl shadow-black/40">

            {/* Card header */}
            <div className="mb-8 space-y-2">
              <h2 className="text-2xl font-black text-white tracking-tight">
                {step === "workspace" 
                  ? "Find Your Workspace" 
                  : (isForgotPassword ? "Reset Password" : `Sign into ${companyName}`)}
              </h2>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                {step === "workspace"
                  ? "Enter your agency's unique workspace slug to begin."
                  : (isForgotPassword 
                      ? "Enter your email to receive a secure password reset link."
                      : `Enter your credentials for the "${matchedCompanyId}" workspace.`)}
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="mb-6 p-3.5 bg-red-500/8 text-red-400 rounded-2xl text-xs font-semibold border border-red-500/15 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Success message */}
            {successMessage && (
              <div className="mb-6 p-3.5 bg-emerald-500/8 text-emerald-400 rounded-2xl text-xs font-semibold border border-emerald-500/15 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{successMessage}</span>
              </div>
            )}

            {/* Step 1: Workspace */}
            {step === "workspace" && (
              <form onSubmit={handleWorkspaceLookup} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    Workspace Name / Slug
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="e.g. ace or ace-entertainment"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                      required
                      autoFocus
                      className="w-full h-12 bg-slate-900/60 border border-white/8 rounded-2xl pl-11 pr-4 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/60 placeholder:text-slate-600 transition-all font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-slate-600 font-semibold pl-1">
                    This is the unique handle your agency registered with.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || !slug.trim()}
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm rounded-2xl shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Searching...</>
                  ) : (
                    <>Find Workspace <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            )}

            {/* Step 2: Credentials */}
            {step === "credentials" && (
              <form onSubmit={isForgotPassword ? handleForgotPassword : handleLogin} className="space-y-5">
                {/* Verified workspace badge */}
                <div className="flex items-center gap-3 p-3.5 bg-emerald-500/8 border border-emerald-500/15 rounded-2xl">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Workspace Verified</p>
                    <p className="text-xs font-bold text-white mt-0.5">{companyName} <span className="text-slate-500 font-mono">({matchedCompanyId})</span></p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setStep("workspace"); setError(""); setEmail(""); setPassword(""); setIsForgotPassword(false); setSuccessMessage(""); }}
                    className="ml-auto text-[10px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors"
                  >
                    Change
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="email"
                      placeholder="email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      className="w-full h-12 bg-slate-900/60 border border-white/8 rounded-2xl pl-11 pr-4 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/60 placeholder:text-slate-600 transition-all"
                    />
                  </div>
                </div>

                {!isForgotPassword && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Password</label>
                      <button
                        type="button"
                        onClick={() => { setIsForgotPassword(true); setError(""); setSuccessMessage(""); }}
                        className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider"
                      >
                        Forgot?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full h-12 bg-slate-900/60 border border-white/8 rounded-2xl pl-11 pr-4 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/60 placeholder:text-slate-600 transition-all"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim() || (!isForgotPassword && !password.trim())}
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm rounded-2xl shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {isForgotPassword ? "Sending..." : "Authenticating..."}</>
                  ) : (
                    <>{isForgotPassword ? "Send Reset Link" : "Access Portal"} <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                {isForgotPassword && (
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(false); setError(""); setSuccessMessage(""); }}
                      className="text-[11px] font-bold text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* Bottom register link */}
            <div className="mt-6 pt-5 border-t border-white/5 text-center">
              <p className="text-[11px] text-slate-600 font-semibold">
                New to Talentum?{" "}
                <Link href="/register-agency" className="text-indigo-400 hover:text-indigo-300 font-bold transition-colors">
                  Register your agency →
                </Link>
              </p>
            </div>
          </div>

          {/* Trust badges */}
          <div className="mt-5 flex items-center justify-center gap-5 text-[10px] font-semibold text-slate-600">
            <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" /> Encrypted</span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> Firebase Auth</span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span className="flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> Talentum</span>
          </div>
        </div>
      </div>
    </div>
  );
}
