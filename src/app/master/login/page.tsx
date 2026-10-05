"use client";

import { useState, useEffect } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, Lock, Mail, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function MasterLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { user: currentUser, loading: authLoading, refreshUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && currentUser && currentUser.role === "platform_admin") {
      router.push("/master");
    }
  }, [currentUser, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      let userCredential;
      try {
         userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (err: any) {
         if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            // Auto-register for first time use (only for this specific master email)
            if (email === "raozec11@gmail.com") {
                userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, "users", userCredential.user.uid), {
                   email,
                   role: "platform_admin",
                   name: "Talentum Owner",
                   companyId: "master"
                });
            } else {
                throw err;
            }
         } else {
            throw err;
         }
      }
      
      const user = userCredential.user;
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (userDoc.exists() && userDoc.data().role === "platform_admin") {
         await refreshUser();
         router.push("/master");
      } else {
         setError("Unauthorized: You do not have Master privileges.");
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
        console.warn("Master authentication failed (expected credential mismatch):", errMsg);
      } else {
        console.error(err);
      }
      setError("Invalid credentials or unauthorized.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] relative overflow-hidden p-4">
      {/* Dark mode Master background */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-[150px] pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-[450px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] rounded-[32px] overflow-hidden bg-[#13192B]/80 backdrop-blur-2xl border border-white/10">
        
        <div className="p-10 md:p-12">
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.4)] border border-indigo-400/30">
               <ShieldCheck className="w-8 h-8 text-white" />
            </div>
          </div>
          
          <div className="text-center mb-10">
            <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Master Portal</h1>
            <p className="text-indigo-200/70 font-medium text-[15px]">Sign in to manage Talentum SAAS</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-500/10 text-red-400 rounded-xl text-[13px] font-bold border border-red-500/20 shadow-sm animate-in fade-in slide-in-from-top-2 text-center">
                {error}
              </div>
            )}
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[14px] font-bold text-slate-300">Master Email</label>
                <div className="relative">
                  <Mail className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-12 h-14 bg-[#0B0F19] border-white/10 text-white focus:border-indigo-500 focus:ring-indigo-500/20 rounded-xl text-[15px] font-medium transition-all shadow-inner"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[14px] font-bold text-slate-300">Password</label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-12 pr-12 h-14 bg-[#0B0F19] border-white/10 text-white focus:border-indigo-500 focus:ring-indigo-500/20 rounded-xl text-[15px] font-medium transition-all shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors focus:outline-none"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
            
            <Button type="submit" className="w-full h-14 text-[16px] font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_8px_20px_-4px_rgba(79,70,229,0.5)] hover:shadow-[0_12px_25px_-4px_rgba(79,70,229,0.6)] hover:-translate-y-0.5 transition-all duration-300" disabled={loading}>
              {loading ? "Authorizing..." : (
                <span className="flex items-center justify-center gap-2">
                  Access Portal <ArrowRight className="w-5 h-5" />
                </span>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
