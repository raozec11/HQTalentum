"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, firebaseConfig } from "@/lib/firebase";
import {
  collection, doc, setDoc, getDocs, serverTimestamp,
  query, orderBy, addDoc, getFirestore
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import {
  Sparkles, Check, ArrowLeft, ArrowRight, Loader2, Star,
  Lock, Mail, Palette, CheckCircle2, Crown, Zap, Building2,
  Shield, Users, Eye, EyeOff
} from "lucide-react";
import Link from "next/link";
import { showSuccess, showError } from "@/lib/alerts";

// ─── Types ────────────────────────────────────────────────────────
interface PlanLimits {
  maxAdmins: number;
  maxStaff: number;
  maxTalents: number;
  maxBookings: number;
  customBranding: boolean;
}

interface FirestorePlan {
  id: string;
  name: string;
  tagline: string;
  price: number;
  period: string;
  badge: string | null;
  order: number;
  isActive: boolean;
  limits: PlanLimits;
  features: string[];
}

// ─── Default seeds (used if Firestore is empty) ───────────────────
const DEFAULT_PLANS: Omit<FirestorePlan, "id">[] = [
  {
    name: "Starter",
    tagline: "Launch your agency today",
    price: 49,
    period: "/month",
    badge: null,
    order: 1,
    isActive: true,
    limits: { maxAdmins: 1, maxStaff: 1, maxTalents: 25, maxBookings: 50, customBranding: true },
    features: [
      "1 Admin account",
      "1 Staff account",
      "Up to 25 Talents on roster",
      "Up to 50 active Bookings/month",
      "Custom branding & colors",
      "Standard email notifications",
    ],
  },
  {
    name: "Professional",
    tagline: "Scale your operations",
    price: 99,
    period: "/month",
    badge: "Most Popular",
    order: 2,
    isActive: true,
    limits: { maxAdmins: 1, maxStaff: 3, maxTalents: 50, maxBookings: 100, customBranding: true },
    features: [
      "1 Admin account",
      "3 Staff / Agent accounts",
      "Up to 50 Talents on roster",
      "Up to 100 active Bookings/month",
      "Custom branding, logos & banners",
      "Premium booking live chats",
      "Manual invoice payment receipts",
      "Priority email support",
    ],
  },
  {
    name: "Enterprise",
    tagline: "Go enterprise-grade",
    price: 199,
    period: "/month",
    badge: null,
    order: 3,
    isActive: true,
    limits: { maxAdmins: 1, maxStaff: -1, maxTalents: -1, maxBookings: -1, customBranding: true },
    features: [
      "1 Admin account",
      "Unlimited Staff accounts",
      "Unlimited Talents on roster",
      "Unlimited Bookings/month",
      "Full custom branding & white-label",
      "Priority 24/7 dedicated support",
      "Advanced analytics & exports",
      "Custom integrations on request",
    ],
  },
];

// ─── Icon picker by plan order ────────────────────────────────────
const PLAN_ICONS = [Zap, Star, Crown];
const PLAN_ICON_STYLES = [
  { bg: "bg-indigo-500/10 border-indigo-500/20", color: "text-indigo-400" },
  { bg: "bg-violet-500/10 border-violet-500/20", color: "text-violet-400" },
  { bg: "bg-amber-500/10 border-amber-500/20", color: "text-amber-400" },
];

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

// ─── Main Component ───────────────────────────────────────────────
export default function RegisterAgencyPage() {
  const router = useRouter();

  const [plans, setPlans] = useState<FirestorePlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [existingCompanies, setExistingCompanies] = useState<string[]>([]);

  // View: "plans" → show grid | "form" → show registration form
  const [view, setView] = useState<"plans" | "form">("plans");
  const [selectedPlan, setSelectedPlan] = useState<FirestorePlan | null>(null);

  // Form fields
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [newBrandColor, setNewBrandColor] = useState("#4f46e5");
  const [newBrandSecondary, setNewBrandSecondary] = useState("#312e81");
  const [registering, setRegistering] = useState(false);
  const [slugError, setSlugError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // ── Load plans from Firestore ──────────────────────────────────
  useEffect(() => {
    async function load() {
      setPlansLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, "subscriptionPlans"), orderBy("order", "asc"))
        );

        if (snap.empty) {
          // Seed defaults if nothing exists
          for (const plan of DEFAULT_PLANS) {
            await addDoc(collection(db, "subscriptionPlans"), plan);
          }
          // Reload
          const snap2 = await getDocs(
            query(collection(db, "subscriptionPlans"), orderBy("order", "asc"))
          );
          const seeded: FirestorePlan[] = [];
          snap2.forEach((d) => seeded.push({ id: d.id, ...(d.data() as Omit<FirestorePlan, "id">) }));
          setPlans(seeded.filter((p) => p.isActive));
        } else {
          const loaded: FirestorePlan[] = [];
          snap.forEach((d) => loaded.push({ id: d.id, ...(d.data() as Omit<FirestorePlan, "id">) }));
          setPlans(loaded.filter((p) => p.isActive));
        }
      } catch (err) {
        console.error("Failed to load plans:", err);
        // Fallback to defaults
        setPlans(
          DEFAULT_PLANS.map((p, i) => ({ id: `default-${i}`, ...p }))
        );
      } finally {
        setPlansLoading(false);
      }
    }

    async function loadCompanies() {
      try {
        const snap = await getDocs(collection(db, "companies"));
        const slugs: string[] = [];
        snap.forEach((d) => slugs.push(d.id.toLowerCase()));
        setExistingCompanies(slugs);
      } catch (err) {
        console.error("Failed to load companies:", err);
      }
    }

    load();
    loadCompanies();
  }, []);

  // ── Slug helpers ──────────────────────────────────────────────
  const handleNameChange = (val: string) => {
    setNewName(val);
    const slug = val.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    setNewId(slug);
    if (slug === "talentum") {
      setSlugError("This workspace ID is reserved.");
    } else {
      setSlugError(existingCompanies.includes(slug) ? "This workspace ID is already taken." : "");
    }
  };

  const handleSlugChange = (val: string) => {
    const slug = val.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-");
    setNewId(slug);
    if (slug === "talentum") {
      setSlugError("This workspace ID is reserved.");
    } else {
      setSlugError(existingCompanies.includes(slug) ? "This workspace ID is already taken." : "");
    }
  };

  // ── Plan selection → switch to form view ─────────────────────
  const handleSelectPlan = (plan: FirestorePlan) => {
    setSelectedPlan(plan);
    setView("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBackToPlans = () => {
    setView("plans");
    setSelectedPlan(null);
  };

  // ── Deploy workspace ─────────────────────────────────────────
  const handleRegisterAgency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId || !newName || !adminEmail || !adminPass || !selectedPlan) return;
    
    const isMinMax = adminPass.length >= 8 && adminPass.length <= 20;
    const hasUpper = /[A-Z]/.test(adminPass);
    const hasLower = /[a-z]/.test(adminPass);
    const hasSpecial = /[^A-Za-z0-9]/.test(adminPass);
    
    if (!isMinMax || !hasUpper || !hasLower || !hasSpecial) {
      showError("Password must be 8-20 characters and contain a mix of uppercase, lowercase, and special characters.");
      return;
    }

    if (newId === "talentum") {
      showError("This workspace ID is reserved. Please choose a different name.");
      return;
    }
    if (existingCompanies.includes(newId)) {
      showError("This workspace ID is already taken. Please choose a different name.");
      return;
    }

    setRegistering(true);
    try {
      const appName = `register-co-${Date.now()}`;
      const secondaryApp = initializeApp(firebaseConfig, appName);
      const secondaryAuth = getAuth(secondaryApp);
      const secondaryDb = getFirestore(secondaryApp);

      const credential = await createUserWithEmailAndPassword(secondaryAuth, adminEmail, adminPass);
      const uid = credential.user.uid;

      await setDoc(doc(secondaryDb, "users", uid), {
        name: newContact || "Workspace Owner",
        email: adminEmail,
        role: "admin",
        companyId: newId,
        status: "active",
        createdAt: new Date().toISOString(),
      });

      const activationToken = Array.from({ length: 32 }, () => 
        Math.floor(Math.random() * 16).toString(16)
      ).join("");

      await setDoc(doc(secondaryDb, "companies", newId), {
        name: newName,
        adminId: uid,
        adminEmail,
        contactPerson: newContact || "Workspace Owner",
        contactPhone: newPhone || "",
        brandColor: newBrandColor,
        brandSecondary: newBrandSecondary,
        status: "active",
        selectedPlan: selectedPlan.name.toLowerCase(),
        planId: selectedPlan.id,
        planLimits: selectedPlan.limits,
        createdAt: serverTimestamp(),
        emailVerified: false,
        trialActivated: false,
        activationToken: activationToken
      });

      // Send activation email via API route
      try {
        await fetch("/api/notifications/send-activation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            companyId: newId,
            companyName: newName,
            email: adminEmail,
            contactName: newContact || "Workspace Owner"
          })
        });
      } catch (mailErr) {
        console.error("Failed to send initial activation email:", mailErr);
      }

      await deleteApp(secondaryApp);
      showSuccess(`Workspace "${newName}" created! Redirecting to your portal...`);
      router.push(`/${newId}/login`);
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Failed to register workspace. Please try again.");
    } finally {
      setRegistering(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────
  const fmtLimit = (n: number) => (n === -1 ? "Unlimited" : n.toString());

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 font-sans relative overflow-x-hidden">

      {/* Ambient orbs */}
      <div className="fixed top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none animate-pulse" style={{ animationDuration: "8s" }} />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/8 rounded-full blur-[130px] pointer-events-none animate-pulse" style={{ animationDuration: "11s", animationDelay: "2s" }} />

      {/* Sticky header */}
      <header className="sticky top-0 z-50 bg-[#060911]/85 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-black text-white tracking-tight">Talentum</span>
          </Link>

          <div className="flex items-center gap-4">
            {view === "form" ? (
              <button
                onClick={handleBackToPlans}
                className="inline-flex items-center gap-1.5 text-xs font-black text-slate-400 hover:text-white uppercase tracking-wider transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Plans
              </button>
            ) : (
              <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-black text-slate-400 hover:text-white uppercase tracking-wider transition-all">
                <ArrowLeft className="w-3.5 h-3.5" /> Home
              </Link>
            )}
            <Link href="/login" className="text-xs font-black text-white bg-white/8 hover:bg-white/12 border border-white/10 px-4 py-2 rounded-xl transition-all">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* ── VIEW: PLANS ─────────────────────────────────────────── */}
      {view === "plans" && (
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-16 space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-400">

          {/* Hero */}
          <div className="text-center space-y-5 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-xs font-black uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5" /> Launch Your Agency
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight">
              Choose Your Plan &<br />
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-sky-400 bg-clip-text text-transparent">
                Deploy in Seconds
              </span>
            </h1>
            <p className="text-slate-400 text-base sm:text-lg font-medium leading-relaxed">
              Select a plan to get started. All plans include your dedicated agency workspace, custom branding, and admin account.
            </p>
          </div>

          {/* Plans grid */}
          {plansLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-slate-500 text-sm font-semibold">Loading plans...</p>
              </div>
            </div>
          ) : (
            <div className={`grid grid-cols-1 gap-6 lg:gap-8 ${plans.length === 3 ? "md:grid-cols-3" : plans.length === 2 ? "md:grid-cols-2 max-w-3xl mx-auto" : "max-w-md mx-auto"}`}>
              {plans.map((plan, idx) => {
                const iconIdx = Math.min(idx, PLAN_ICONS.length - 1);
                const Icon = PLAN_ICONS[iconIdx];
                const style = PLAN_ICON_STYLES[iconIdx];
                const isPopular = !!plan.badge;

                return (
                  <div
                    key={plan.id}
                    className={`relative border rounded-[28px] p-7 sm:p-8 flex flex-col cursor-pointer transition-all duration-300 group hover:-translate-y-1.5 ${
                      isPopular
                        ? "border-indigo-500/50 bg-indigo-950/30 hover:border-indigo-400 hover:bg-indigo-950/50"
                        : "border-slate-700/60 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/60"
                    }`}
                    onClick={() => handleSelectPlan(plan)}
                  >
                    {/* Badge */}
                    {plan.badge && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <div className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg shadow-indigo-500/30 whitespace-nowrap uppercase tracking-widest">
                          ⭐ {plan.badge}
                        </div>
                      </div>
                    )}

                    <div className="space-y-5 flex-1">
                      {/* Icon + name */}
                      <div className={`w-11 h-11 rounded-2xl border ${style.bg} flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${style.color}`} />
                      </div>

                      <div>
                        <h3 className="text-xl font-black text-white">{plan.name}</h3>
                        <p className="text-xs text-slate-500 font-semibold mt-0.5">{plan.tagline}</p>
                      </div>

                      {/* Price */}
                      <div className="flex items-end gap-1">
                        <span className="text-5xl font-black text-white">${plan.price}</span>
                        <span className="text-sm text-slate-500 font-bold mb-1.5">{plan.period}</span>
                      </div>

                      {/* Key limits strip */}
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: `${fmtLimit(plan.limits.maxStaff)} Staff` },
                          { label: `${fmtLimit(plan.limits.maxTalents)} Talents` },
                          { label: `${fmtLimit(plan.limits.maxBookings)} Bookings/mo` },
                        ].map(({ label }) => (
                          <span key={label} className="text-[10px] font-black text-slate-400 bg-white/5 border border-white/8 px-2.5 py-1 rounded-lg">
                            {label}
                          </span>
                        ))}
                      </div>

                      {/* Features */}
                      <ul className="space-y-2.5 border-t border-white/5 pt-4">
                        {plan.features.map((feat, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-xs text-slate-300 font-semibold">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* CTA */}
                    <div className="mt-7">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSelectPlan(plan); }}
                        className={`w-full h-12 rounded-2xl text-sm font-black transition-all duration-200 flex items-center justify-center gap-2 ${
                          isPopular
                            ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                            : "bg-white/5 hover:bg-white/10 text-slate-300 border border-white/8 group-hover:border-white/15"
                        }`}
                      >
                        Get Started <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer note */}
          <div className="text-center">
            <p className="text-xs text-slate-600 font-semibold">
              All plans include a dedicated workspace, Firestore isolation, and Stripe-ready billing.
            </p>
          </div>
        </div>
      )}

      {/* ── VIEW: FORM ──────────────────────────────────────────── */}
      {view === "form" && selectedPlan && (
        <div className="relative z-10 max-w-2xl mx-auto px-6 py-12 animate-in fade-in slide-in-from-bottom-4 duration-400">

          {/* Top — plan selection header */}
          <div className="mb-8 space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-black uppercase tracking-widest mb-4">
              <CheckCircle2 className="w-3.5 h-3.5" /> {selectedPlan.name} Plan Selected · ${selectedPlan.price}/mo
            </div>

            <h1 className="text-3xl font-black text-white tracking-tight">
              Configure Your Workspace
            </h1>
            <p className="text-sm text-slate-400 font-semibold">
              Fill in your agency details to deploy your isolated portal in seconds.
            </p>
          </div>

          {/* Plan summary card */}
          <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-2xl p-5 mb-8 flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{selectedPlan.name} Plan</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {[
                  { icon: Users, label: `${fmtLimit(selectedPlan.limits.maxStaff)} Staff` },
                  { icon: Users, label: `${fmtLimit(selectedPlan.limits.maxTalents)} Talents` },
                  { icon: Building2, label: `${fmtLimit(selectedPlan.limits.maxBookings)} Bookings/mo` },
                ].map(({ label }) => (
                  <span key={label} className="text-[10px] font-black text-slate-300 bg-white/5 border border-white/8 px-2.5 py-1 rounded-lg">{label}</span>
                ))}
              </div>
            </div>
            <button
              onClick={handleBackToPlans}
              className="text-xs font-black text-slate-400 hover:text-white border border-white/10 hover:border-white/20 px-4 py-2 rounded-xl transition-all flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Change Plan
            </button>
          </div>

          {/* Registration form card */}
          <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-[32px] overflow-hidden shadow-2xl shadow-black/40">
            <form onSubmit={handleRegisterAgency} className="p-8 space-y-8">

              {/* ── Agency Info ─────────────────────── */}
              <section className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5" /> Agency Information
                </h3>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Agency / Company Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. My Entertainment Group"
                    value={newName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                    className="w-full h-11 bg-slate-900/60 border border-white/8 rounded-2xl px-4 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/60 placeholder:text-slate-600 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Workspace ID (URL Slug) *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono font-bold select-none">app/</span>
                    <input
                      type="text"
                      placeholder="my-agency"
                      value={newId}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      required
                      className="w-full h-11 bg-slate-900/60 border border-white/8 rounded-2xl pl-[3.2rem] pr-4 text-sm font-semibold text-white font-mono outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/60 placeholder:text-slate-600 transition-all"
                    />
                  </div>
                  {slugError ? (
                    <p className="text-[10px] text-red-400 font-semibold mt-1 pl-1">⚠ {slugError}</p>
                  ) : newId ? (
                    <p className="text-[10px] text-emerald-400 font-semibold mt-1 pl-1">✓ Available at /{newId}</p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Contact Person *</label>
                    <input
                      type="text"
                      placeholder="Your full name"
                      value={newContact}
                      onChange={(e) => setNewContact(e.target.value)}
                      required
                      className="w-full h-11 bg-slate-900/60 border border-white/8 rounded-2xl px-4 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/60 placeholder:text-slate-600 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Contact Phone</label>
                    <input
                      type="tel"
                      placeholder="+1 702 123 4567"
                      value={newPhone}
                      onChange={(e) => setNewPhone(formatPhoneNumber(e.target.value))}
                      className="w-full h-11 bg-slate-900/60 border border-white/8 rounded-2xl px-4 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/60 placeholder:text-slate-600 transition-all"
                    />
                  </div>
                </div>
              </section>

              {/* ── Brand Colors ─────────────────────── */}
              <section className="space-y-4 border-t border-white/5 pt-6">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Palette className="w-3.5 h-3.5" /> Brand Colors
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Primary Color", value: newBrandColor, onChange: setNewBrandColor },
                    { label: "Secondary Color", value: newBrandSecondary, onChange: setNewBrandSecondary },
                  ].map(({ label, value, onChange }) => (
                    <div key={label}>
                      <label className="text-[10px] font-black text-slate-500 block mb-2">{label}</label>
                      <div className="flex items-center gap-2">
                        <div className="relative w-10 h-10 shrink-0">
                          <input
                            type="color"
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div
                            className="w-10 h-10 rounded-xl border-2 border-white/10 shadow-inner cursor-pointer"
                            style={{ backgroundColor: value }}
                          />
                        </div>
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => onChange(e.target.value)}
                          className="w-full h-10 bg-slate-900/60 border border-white/8 rounded-xl px-3 text-xs font-mono text-white uppercase outline-none focus:ring-2 focus:ring-indigo-500/25"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="h-6 rounded-xl overflow-hidden flex gap-0 border border-white/5">
                  <div className="flex-1 transition-all" style={{ backgroundColor: newBrandColor }} />
                  <div className="flex-1 transition-all" style={{ backgroundColor: newBrandSecondary }} />
                </div>
              </section>

              {/* ── Admin Credentials ────────────────── */}
              <section className="space-y-4 border-t border-white/5 pt-6">
                <div>
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5" /> Admin Account Credentials
                  </h3>
                  <p className="text-[11px] text-slate-600 font-semibold mt-1">
                    Creates your primary admin account. Use these to log in via the global portal.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="email"
                      placeholder="admin@myagency.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      required
                      className="w-full h-11 bg-slate-900/60 border border-white/8 rounded-2xl pl-10 pr-4 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/60 placeholder:text-slate-600 transition-all"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password (8-20 characters)"
                      value={adminPass}
                      onChange={(e) => setAdminPass(e.target.value)}
                      required
                      minLength={8}
                      maxLength={20}
                      className="w-full h-11 bg-slate-900/60 border border-white/8 rounded-2xl pl-10 pr-10 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500/60 placeholder:text-slate-600 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {adminPass && (
                    <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 mt-2 space-y-2 text-xs">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Password Requirements</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-semibold">
                        <div className="flex items-center gap-2">
                          <Check className={`w-3.5 h-3.5 ${adminPass.length >= 8 && adminPass.length <= 20 ? "text-emerald-400" : "text-slate-600"}`} />
                          <span className={adminPass.length >= 8 && adminPass.length <= 20 ? "text-emerald-400" : "text-slate-400"}>8-20 characters</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className={`w-3.5 h-3.5 ${/[A-Z]/.test(adminPass) ? "text-emerald-400" : "text-slate-600"}`} />
                          <span className={/[A-Z]/.test(adminPass) ? "text-emerald-400" : "text-slate-400"}>1 uppercase letter</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className={`w-3.5 h-3.5 ${/[a-z]/.test(adminPass) ? "text-emerald-400" : "text-slate-600"}`} />
                          <span className={/[a-z]/.test(adminPass) ? "text-emerald-400" : "text-slate-400"}>1 lowercase letter</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className={`w-3.5 h-3.5 ${/[^A-Za-z0-9]/.test(adminPass) ? "text-emerald-400" : "text-slate-600"}`} />
                          <span className={/[^A-Za-z0-9]/.test(adminPass) ? "text-emerald-400" : "text-slate-400"}>1 special character</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Summary + Submit ─────────────────── */}
              <section className="border-t border-white/5 pt-6 space-y-4">
                <div className="bg-slate-900/60 border border-white/8 rounded-2xl p-4 space-y-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Deployment Summary</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-semibold mt-2">
                    <span className="text-slate-500">Plan</span>
                    <span className="text-white">{selectedPlan.name} — ${selectedPlan.price}/mo</span>
                    <span className="text-slate-500">Workspace</span>
                    <span className="text-white font-mono">/{newId || "—"}</span>
                    <span className="text-slate-500">Agency Name</span>
                    <span className="text-white">{newName || "—"}</span>
                    <span className="text-slate-500">Admin Email</span>
                    <span className="text-white truncate">{adminEmail || "—"}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={registering || !!slugError || !newId || !newName || !adminEmail || !adminPass}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm rounded-2xl shadow-xl shadow-indigo-600/20 hover:shadow-indigo-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                >
                  {registering ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Deploying Workspace...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Deploy "{newName || "Your Agency"}" <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <p className="text-[10px] text-slate-700 font-semibold text-center">
                  By deploying, you agree to Talentum's Terms of Service.
                </p>
              </section>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-8 mt-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-black text-white">Talentum</span>
          </div>
          <p className="text-xs text-slate-600 font-semibold">© {new Date().getFullYear()} Talentum. Multi-Tenant Agency Platform.</p>
          <Link href="/login" className="text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors">
            Already registered? Sign In →
          </Link>
        </div>
      </footer>
    </div>
  );
}
