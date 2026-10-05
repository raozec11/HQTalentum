"use client";

import { useState, useEffect, use } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Lock, Mail, Users, AlertTriangle, Home, Building2, Star, ShieldCheck, User, Phone, CheckCircle2, Eye, EyeOff, Check } from "lucide-react";
import { UserRole, useAuth } from "@/context/AuthContext";

// ─── Phone Formatting Helper ──────────────────────────────────────
const formatPhoneNumber = (value: string): string => {
  let digits = value.replace(/\D/g, "");
  
  if (value.trim().startsWith("+1")) {
    digits = digits.slice(1);
  } else if (digits.startsWith("1") && digits.length === 11) {
    digits = digits.slice(1);
  }
  
  const actualDigits = digits.slice(0, 10);
  
  if (actualDigits.length === 0) {
    return "";
  }
  
  const area = actualDigits.slice(0, 3);
  const mid = actualDigits.slice(3, 6);
  const last = actualDigits.slice(6, 10);
  
  let formatted = "";
  if (actualDigits.length > 0) formatted += area;
  if (actualDigits.length > 3) formatted += " " + mid;
  if (actualDigits.length > 6) formatted += " " + last;
  
  return `+1 ${formatted}`;
};

export default function LoginPage(props: { params: Promise<{ companyId: string }> }) {
  const params = use(props.params);
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyChecking, setCompanyChecking] = useState(true);
  const [companyNotFound, setCompanyNotFound] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function checkCompany() {
      if (params.companyId.toLowerCase() === "talentum") {
        setCompanyNotFound(true);
        setCompanyChecking(false);
        return;
      }

      try {
        const exactDoc = await getDoc(doc(db, "companies", params.companyId));
        if (exactDoc.exists()) {
          const data = exactDoc.data();
          setCompanyName(data.name || params.companyId);
          setCompanyLogo(data.logoUrl || null);
          setCompanyChecking(false);
          return;
        }
        
        const allCompanies = await getDocs(collection(db, "companies"));
        let found = false;
        allCompanies.forEach(d => {
          if (d.id.toLowerCase() === params.companyId.toLowerCase()) {
            const data = d.data();
            setCompanyName(data.name || d.id);
            setCompanyLogo(data.logoUrl || null);
            found = true;
          }
        });
        if (!found) setCompanyNotFound(true);
      } catch (err) {
        console.error(err);
        setCompanyNotFound(true);
      } finally {
        setCompanyChecking(false);
      }
    }
    checkCompany();
  }, [params.companyId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        let userData = userDoc.data();
        
        // Auto-repair: If logging in user is the workspace owner/admin, restore role to "admin" if corrupted
        try {
          const compDoc = await getDoc(doc(db, "companies", params.companyId));
          if (compDoc.exists()) {
            const cData = compDoc.data();
            const isCompanyOwner = (cData.adminEmail && cData.adminEmail.toLowerCase() === user.email?.toLowerCase()) || cData.adminId === user.uid;
            if (isCompanyOwner && userData.role !== "admin" && userData.role !== "platform_admin") {
              const { updateDoc } = await import("firebase/firestore");
              await updateDoc(doc(db, "users", user.uid), { role: "admin" });
              userData = { ...userData, role: "admin" };
            }
          }
        } catch (repairErr) {
          console.warn("Failed to check/repair admin role on login:", repairErr);
        }

        // Case-insensitive and whitespace-safe check for company affiliation
        const dbCompanyId = String(userData.companyId || "").trim().toLowerCase();
        const urlCompanyId = String(params.companyId || "").trim().toLowerCase();
        const isCompanyMatch = dbCompanyId === urlCompanyId;
        
        if (!isCompanyMatch && userData.role !== "platform_admin") {
           setError(`Unauthorized: You do not belong to this company. (Your ID: "${userData.companyId}", Portal: "${params.companyId}")`);
           await auth.signOut();
           setLoading(false);
           return;
        }

        await refreshUser();
        const role = userData.role as UserRole;
        if (role === "platform_admin") {
          router.push(`/master`);
        } else if (role === "admin" || role === "staff") {
          router.push(`/${params.companyId}/dashboard/admin`);
        } else if (role === "talent") {
          router.push(`/${params.companyId}/dashboard/talent`);
        } else if (role === "client") {
          router.push(`/${params.companyId}/dashboard/client`);
        } else {
          router.push(`/${params.companyId}/dashboard`);
        }
      } else {
        setError("User profile not found.");
        await auth.signOut();
      }
    } catch (err: any) {
      const errCode = err?.code || "";
      const errMsg = err?.message || "";
      const isAuthError = 
        errCode.includes("auth/") || 
        errMsg.includes("auth/") || 
        errMsg.includes("invalid-credential");

      if (isAuthError) {
        console.warn("Authentication failed (expected credential mismatch):", errMsg);
      } else {
        console.error(err);
      }
      setError("Invalid credentials. Please verify your email and password.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const isMinMax = password.length >= 8 && password.length <= 20;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    
    if (!isMinMax || !hasUpper || !hasLower || !hasSpecial) {
      setError("Password must be 8-20 characters and contain a mix of uppercase, lowercase, and special characters.");
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        name,
        email,
        phoneNumber: phone,
        role: "client",
        companyId: params.companyId.toLowerCase(),
        status: "active",
        createdAt: new Date().toISOString()
      });

      router.push(`/${params.companyId}/dashboard/client`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create account. Please try again.");
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
          companyId: params.companyId,
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

  // 1. Loading state
  if (companyChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-[#1e1b4b] rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-slate-500 font-bold tracking-widest uppercase text-sm animate-pulse">Initializing Workspace</p>
        </div>
      </div>
    );
  }

  // 2. Company Not Found
  if (companyNotFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] relative overflow-hidden p-4">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-red-500/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="relative z-10 w-full max-w-lg text-center">
          <div className="bg-white/5 backdrop-blur-3xl rounded-[40px] p-12 shadow-2xl border border-white/10">
            <div className="w-24 h-24 mx-auto mb-8 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.2)]">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-4xl font-extrabold text-white tracking-tight mb-4">
              Workspace <span className="text-red-400">Not Found</span>
            </h1>
            <p className="text-slate-400 font-medium text-lg leading-relaxed mb-10">
              The company "<span className="text-white font-bold">{params.companyId}</span>" is not registered on the Talentum platform.
            </p>
            <a href="/" className="inline-flex items-center justify-center gap-3 w-full h-14 bg-white hover:bg-slate-100 text-[#0B0F19] font-bold text-lg rounded-2xl transition-all hover:scale-[1.02] shadow-[0_0_30px_rgba(255,255,255,0.1)]">
              <Home className="w-5 h-5" /> Return to Homepage
            </a>
          </div>
        </div>
      </div>
    );
  }

  // 3. Ultra-Premium Login Experience
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] relative overflow-hidden p-4 sm:p-6 font-sans">
      {/* Dynamic Animated Orbs (Background) */}
      <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '6s' }}></div>
      <div className="absolute bottom-[10%] right-[20%] w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[150px] mix-blend-screen animate-pulse" style={{ animationDuration: '8s', animationDelay: '1s' }}></div>
      <div className="absolute top-[40%] left-[40%] w-[400px] h-[400px] bg-fuchsia-600/20 rounded-full blur-[100px] mix-blend-screen animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }}></div>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.04]"></div>
      <div className="relative z-10 w-full max-w-[960px] flex flex-col md:flex-row rounded-[32px] overflow-hidden bg-white/5 backdrop-blur-[60px] border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.5)]">
        
        {/* Left Side: Hyper-Premium Branding */}
        <div className="w-full md:w-5/12 bg-black/40 backdrop-blur-md p-10 md:p-14 flex flex-col justify-center text-white relative border-r border-white/5 min-h-[350px] md:min-h-[500px]">
          
          <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left">
            {/* Company Logo OR Initial */}
            <div className="w-24 h-24 mb-8 rounded-[24px] bg-gradient-to-b from-white/10 to-transparent border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.6)] flex items-center justify-center overflow-hidden p-1.5 group">
               <div className="w-full h-full bg-black/50 backdrop-blur-xl rounded-[18px] flex items-center justify-center overflow-hidden relative">
                 {companyLogo ? (
                   <img src={companyLogo} alt={companyName || "Logo"} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                 ) : (
                   <span className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-br from-white to-white/40">
                     {companyName?.charAt(0).toUpperCase()}
                   </span>
                 )}
               </div>
            </div>

            <h1 className="text-[32px] md:text-[40px] font-bold mb-4 leading-none tracking-tight text-white drop-shadow-lg">
              {companyName}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-violet-300 mt-2 text-xl md:text-2xl font-semibold opacity-90">
                Portal Access
              </span>
            </h1>

            <p className="text-white/50 text-[14px] md:text-[15px] leading-relaxed max-w-[280px] font-medium mt-2">
              Manage your talent roster, oversee bookings, and coordinate with clients in your dedicated environment.
            </p>
          </div>
        </div>

        {/* Right Side: Sleek Login Form */}
        <div className="w-full md:w-7/12 p-8 md:p-14 lg:p-16 bg-white flex flex-col justify-center relative shadow-[-20px_0_50px_rgba(0,0,0,0.1)]">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-bl-[100px] translate-x-10 -translate-y-10 blur-3xl opacity-60 pointer-events-none"></div>

          <div className="max-w-[360px] w-full mx-auto relative z-10">
            <div className="mb-10 text-center md:text-left">
              <h2 className="text-[28px] md:text-[34px] font-bold text-slate-900 mb-2 tracking-tight">
                {isForgotPassword ? "Reset Password" : (isRegistering ? "Create Account" : "Sign In")}
              </h2>
              <p className="text-slate-500 font-medium text-[14px] md:text-[15px]">
                {isForgotPassword 
                  ? "Enter your email to receive a secure password reset link." 
                  : (isRegistering ? "Register to start booking and managing events." : "Enter your credentials to securely access your account.")}
              </p>
            </div>

            <form onSubmit={isForgotPassword ? handleForgotPassword : (isRegistering ? handleRegister : handleLogin)} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-[13px] font-semibold border border-red-100 flex items-start gap-3 animate-in fade-in zoom-in-95 duration-200">
                  <AlertTriangle className="w-5 h-5 shrink-0" /> 
                  <span className="leading-snug">{error}</span>
                </div>
              )}
              {successMessage && (
                <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl text-[13px] font-semibold border border-emerald-100 flex items-start gap-3 animate-in fade-in zoom-in-95 duration-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0" /> 
                  <span className="leading-snug">{successMessage}</span>
                </div>
              )}
              
              <div className="space-y-4 md:space-y-5">
                {isRegistering && !isForgotPassword && (
                  <>
                    <div className="group">
                      <label className="text-[13px] font-semibold text-slate-500 uppercase tracking-widest block mb-1.5 transition-colors group-focus-within:text-indigo-600">Full Name</label>
                      <div className="relative">
                        <User className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
                        <Input
                          type="text"
                          placeholder="John Doe"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          className="pl-12 h-14 bg-slate-50 border-slate-200/60 focus:bg-white focus:border-indigo-500 ring-4 ring-transparent focus:ring-indigo-500/10 rounded-2xl text-[15px] font-medium transition-all shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-md"
                        />
                      </div>
                    </div>
                    
                    <div className="group">
                      <label className="text-[13px] font-semibold text-slate-500 uppercase tracking-widest block mb-1.5 transition-colors group-focus-within:text-indigo-600">Phone Number</label>
                      <div className="relative">
                        <Phone className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
                        <Input
                          type="tel"
                          placeholder="+1 702 123 4567"
                          value={phone}
                          onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                          required
                          className="pl-12 h-14 bg-slate-50 border-slate-200/60 focus:bg-white focus:border-indigo-500 ring-4 ring-transparent focus:ring-indigo-500/10 rounded-2xl text-[15px] font-medium transition-all shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-md"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="group">
                  <label className="text-[13px] font-semibold text-slate-500 uppercase tracking-widest block mb-1.5 transition-colors group-focus-within:text-indigo-600">Email Address</label>
                  <div className="relative">
                    <Mail className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-12 h-14 bg-slate-50 border-slate-200/60 focus:bg-white focus:border-indigo-500 ring-4 ring-transparent focus:ring-indigo-500/10 rounded-2xl text-[15px] font-medium transition-all shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-md"
                    />
                  </div>
                </div>
                
                {!isForgotPassword && (
                  <div className="group">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[13px] font-semibold text-slate-500 uppercase tracking-widest transition-colors group-focus-within:text-indigo-600">Password</label>
                      {!isRegistering && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPassword(true);
                            setError("");
                            setSuccessMessage("");
                          }}
                          className="text-[13px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
                        >
                          Forgot?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder={isRegistering ? "Password (8-20 characters)" : "••••••••"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={isRegistering ? 8 : undefined}
                        maxLength={isRegistering ? 20 : undefined}
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
                    {isRegistering && password && (
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mt-2.5 space-y-2 text-xs">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password Requirements</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-semibold">
                          <div className="flex items-center gap-2">
                            <Check className={`w-3.5 h-3.5 ${password.length >= 8 && password.length <= 20 ? "text-emerald-500" : "text-slate-300"}`} />
                            <span className={password.length >= 8 && password.length <= 20 ? "text-emerald-600" : "text-slate-400"}>8-20 characters</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Check className={`w-3.5 h-3.5 ${/[A-Z]/.test(password) ? "text-emerald-500" : "text-slate-300"}`} />
                            <span className={/[A-Z]/.test(password) ? "text-emerald-600" : "text-slate-400"}>1 uppercase letter</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Check className={`w-3.5 h-3.5 ${/[a-z]/.test(password) ? "text-emerald-500" : "text-slate-300"}`} />
                            <span className={/[a-z]/.test(password) ? "text-emerald-600" : "text-slate-400"}>1 lowercase letter</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Check className={`w-3.5 h-3.5 ${/[^A-Za-z0-9]/.test(password) ? "text-emerald-500" : "text-slate-300"}`} />
                            <span className={/[^A-Za-z0-9]/.test(password) ? "text-emerald-600" : "text-slate-400"}>1 special character</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <Button 
                type="submit" 
                className="w-full h-14 mt-8 text-[15px] font-bold rounded-2xl bg-slate-900 hover:bg-slate-800 text-white shadow-[0_8px_20px_rgba(15,23,42,0.3)] hover:shadow-[0_15px_30px_rgba(15,23,42,0.4)] hover:-translate-y-0.5 transition-all duration-300 group" 
                disabled={loading}
              >
                {loading ? (
                   <span className="flex items-center justify-center gap-3">
                     <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                     {isForgotPassword ? "Sending..." : (isRegistering ? "Creating Account..." : "Authenticating...")}
                   </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    {isForgotPassword ? "Send Reset Link" : (isRegistering ? "Create Account" : "Access Portal")} 
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-8 text-center relative z-20">
              {isForgotPassword ? (
                <p className="text-[14px] font-medium text-slate-500">
                  Remember your password?{" "}
                  <button 
                    type="button" 
                    onClick={() => { setIsForgotPassword(false); setError(""); setSuccessMessage(""); }} 
                    className="text-indigo-600 font-bold hover:text-indigo-700 hover:underline transition-all"
                  >
                    Sign In
                  </button>
                </p>
              ) : isRegistering ? (
                <p className="text-[14px] font-medium text-slate-500">
                  Already have an account?{" "}
                  <button 
                    type="button" 
                    onClick={() => { setIsRegistering(false); setError(""); setSuccessMessage(""); }} 
                    className="text-indigo-600 font-bold hover:text-indigo-700 hover:underline transition-all"
                  >
                    Sign In
                  </button>
                </p>
              ) : (
                <p className="text-[14px] font-medium text-slate-500">
                  Don't have an account?{" "}
                  <button 
                    type="button" 
                    onClick={() => { setIsRegistering(true); setError(""); setSuccessMessage(""); }} 
                    className="text-indigo-600 font-bold hover:text-indigo-700 hover:underline transition-all"
                  >
                    Register Here
                  </button>
                </p>
              )}
            </div>

          </div>
          
        </div>

      </div>
      {/* Bottom Footer mark */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] font-bold text-white/40 tracking-widest uppercase flex items-center gap-2">
        <Users className="w-3.5 h-3.5" /> Powered by Talentum
      </div>
    </div>
  );
}
