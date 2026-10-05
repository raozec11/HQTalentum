"use client";

import { useState, useEffect, use } from "react";
import { db, auth } from "@/lib/firebase";
import { collection, doc, setDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useCompany } from "@/context/CompanyContext";
import { User, Mail, Lock, Phone, MapPin, Check, Briefcase, EyeOff, Eye, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function BecomeTalentPage(props: { params: Promise<{ companyId: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const companyId = params.companyId;
  const { companyData } = useCompany();
  const companyName = companyData?.name || companyId;
  const logoUrl = companyData?.logoUrl;
  const primaryColor = companyData?.brandColor || "#5046E5";

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    displayName: "", originalName: "", email: "", password: "", phone: "", location: "", talentType: "", gender: ""
  });

  const [talentTypes, setTalentTypes] = useState<{ id: string; name: string }[]>([]);
  const [genders, setGenders] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchDropdowns = async () => {
      const [typesSnap, gendersSnap] = await Promise.all([
        getDocs(query(collection(db, "companies", companyId, "talentTypes"), orderBy("name"))),
        getDocs(query(collection(db, "companies", companyId, "genders"), orderBy("name"))),
      ]);
      setTalentTypes(typesSnap.docs.map(d => ({ id: d.id, name: d.data().name })).filter((t: any) => t.status !== "inactive"));
      setGenders(gendersSnap.docs.map(d => ({ id: d.id, name: d.data().name })).filter((g: any) => g.status !== "inactive"));
    };
    fetchDropdowns();
  }, [companyId]);

  const updateForm = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  // Primary color replaced with local const above

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError("");

    if (!form.displayName.trim() || !form.originalName.trim() || !form.email.trim() || !form.password.trim()) {
      setSaveError("Display Name, Original Name, email, and password are required.");
      return;
    }
    if (form.password.length < 6) {
      setSaveError("Password must be at least 6 characters.");
      return;
    }

    setSaving(true);
    try {
      // 1. Create auth account
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      
      const numericId = Math.floor(100000 + Math.random() * 900000).toString();

      // 2. Save strictly auth details to users collection
      await setDoc(doc(db, "users", cred.user.uid), {
        email: form.email.trim(),
        role: "talent",
        companyId: companyId.toLowerCase(),
        status: "active", // Active by default
        numericId: numericId,
        createdAt: serverTimestamp(),
      });

      // 3. Save public profile details to talents collection
      await setDoc(doc(db, "talents", cred.user.uid), {
        displayName: form.displayName.trim(),
        originalName: form.originalName.trim(),
        phone: form.phone.trim(),
        numericId: numericId,
        companyId: companyId.toLowerCase(),
        createdAt: serverTimestamp(),
        rating: 5,
      });

      setSuccess(true);
      setTimeout(() => {
        router.push(`/${companyId}/login`);
      }, 3000);
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        setSaveError("This email is already registered. Please log in instead.");
      } else {
        setSaveError(err.message || "An error occurred during registration.");
      }
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-10 text-center shadow-xl shadow-slate-200/50">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Registration Successful!</h1>
          <p className="text-slate-500 font-medium mb-8">Welcome aboard to {companyName || "our team"}. You can now log into your talent portal to manage your profile.</p>
          <Button 
            onClick={() => router.push(`/${companyId}/login`)} 
            className="w-full h-12 rounded-xl text-white font-bold"
            style={{ backgroundColor: primaryColor }}
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-8">
      {/* Brand Header */}
      <div className="mb-8 text-center flex flex-col items-center">
        {logoUrl ? (
          <img src={logoUrl} alt={companyName} className="h-16 w-auto object-contain mb-4" />
        ) : (
          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center mb-4 text-2xl font-black text-slate-800">
            {companyName.charAt(0).toUpperCase()}
          </div>
        )}
        <h1 className="text-3xl font-black text-slate-900">Join {companyName.toUpperCase()}</h1>
        <p className="text-slate-500 font-medium mt-1">Register as a talent and manage your professional profile.</p>
      </div>

      {/* Main Form */}
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden border border-slate-100 relative">
        <div className="h-2 w-full" style={{ backgroundColor: primaryColor }} />
        
        <div className="p-8 sm:p-10">
          {saveError && (
            <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl p-4 flex items-start gap-3 mb-8">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-semibold">{saveError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Display Name */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Display Name *</label>
                <div className="relative">
                  <User className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    required
                    placeholder="e.g. Sarah J."
                    value={form.displayName}
                    onChange={e => updateForm("displayName", e.target.value)}
                    className="pl-11 h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white transition-all text-base"
                    style={{ '--tw-ring-color': `${primaryColor}30`, '--tw-border-color': primaryColor } as any}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 ml-1 font-medium">Public name shown to clients.</p>
              </div>

              {/* Original Name */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Original Name *</label>
                <div className="relative">
                  <User className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    required
                    placeholder="e.g. Sarah Johnson"
                    value={form.originalName}
                    onChange={e => updateForm("originalName", e.target.value)}
                    className="pl-11 h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white transition-all text-base"
                    style={{ '--tw-ring-color': `${primaryColor}30`, '--tw-border-color': primaryColor } as any}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 ml-1 font-medium">Your internal legal name.</p>
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Email Address *</label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  required
                  type="email"
                  placeholder="talent@example.com"
                  value={form.email}
                  onChange={e => updateForm("email", e.target.value)}
                  className="pl-11 h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white transition-all text-base"
                  style={{ '--tw-ring-color': `${primaryColor}30`, '--tw-border-color': primaryColor } as any}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Portal Password *</label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  required
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 6 characters"
                  value={form.password}
                  onChange={e => updateForm("password", e.target.value)}
                  className="pl-11 pr-12 h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white transition-all text-base"
                  style={{ '--tw-ring-color': `${primaryColor}30`, '--tw-border-color': primaryColor } as any}
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 py-2"></div>

              {/* Phone */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Phone Number</label>
                <div className="relative">
                  <Phone className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="+1 702 123 4567"
                    value={form.phone}
                    onChange={e => updateForm("phone", e.target.value)}
                    className="pl-11 h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white transition-all text-base"
                  />
                </div>
              </div>

            <Button
              type="submit"
              disabled={saving}
              className="w-full h-14 rounded-xl text-white font-black text-lg gap-2 mt-4 hover:opacity-90 shadow-lg transition-all"
              style={{ backgroundColor: primaryColor, boxShadow: `0 8px 16px -4px ${primaryColor}40` }}
            >
              {saving ? (
                <>
                  <span className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                  PROCESSING...
                </>
              ) : (
                "COMPLETE REGISTRATION"
              )}
            </Button>
          </form>

          <p className="text-center text-sm font-medium text-slate-500 mt-8">
            Already have an account?{' '}
            <a href={`/${companyId}/login`} className="font-bold hover:underline" style={{ color: primaryColor }}>
              Sign in here
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
