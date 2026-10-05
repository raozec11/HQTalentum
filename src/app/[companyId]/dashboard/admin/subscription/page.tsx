"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, addDoc, where, serverTimestamp, orderBy } from "firebase/firestore";
import { useCompany } from "@/context/CompanyContext";
import {
  Loader2, ShieldCheck, CreditCard, Zap, Building2, Rocket,
  Check, ArrowRight, Sparkles, Clock, AlertTriangle, Receipt,
} from "lucide-react";
import { showError } from "@/lib/alerts";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    icon: Zap,
    badge: null,
    gradient: "from-indigo-500 via-indigo-600 to-blue-600",
    glow: "shadow-indigo-500/25",
    ring: "#6366f1",
    accent: "text-indigo-600",
    lightBg: "bg-indigo-50",
    description: "Perfect for small agencies getting started.",
    features: [
      "Up to 25 Talents",
      "Up to 50 Bookings/month",
      "1 Admin · 1 Staff Account",
      "Custom Branding",
      "Email Support",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 99,
    icon: Building2,
    badge: "Most Popular",
    gradient: "from-violet-500 via-violet-600 to-purple-700",
    glow: "shadow-violet-500/30",
    ring: "#8b5cf6",
    accent: "text-violet-600",
    lightBg: "bg-violet-50",
    description: "For growing agencies with larger teams.",
    features: [
      "Up to 100 Talents",
      "Up to 200 Bookings/month",
      "3 Admins · 5 Staff Accounts",
      "Custom Branding",
      "Priority Support",
      "Advanced Analytics",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 199,
    icon: Rocket,
    badge: "Best Value",
    gradient: "from-rose-500 via-pink-600 to-fuchsia-600",
    glow: "shadow-rose-500/25",
    ring: "#f43f5e",
    accent: "text-rose-600",
    lightBg: "bg-rose-50",
    description: "Unlimited scale for large operations.",
    features: [
      "Unlimited Talents",
      "Unlimited Bookings",
      "Unlimited Admins & Staff",
      "Custom Branding",
      "Dedicated Support",
      "Custom Integrations",
    ],
  },
];

function SubscriptionPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const { companyData } = useCompany();

  const [selectedPlan, setSelectedPlan] = useState<string>("starter");
  const [processing, setProcessing] = useState(false);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [plans, setPlans] = useState<any[]>(PLANS);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    async function fetchPlans() {
      try {
        const snap = await getDocs(
          query(collection(db, "subscriptionPlans"), orderBy("order", "asc"))
        );
        if (!snap.empty) {
          const loaded: any[] = [];
          snap.forEach(d => {
            const data = d.data();
            const planId = (data.name || "").toLowerCase();
            const visualInfo = PLANS.find(p => p.id === planId) || PLANS[0];
            loaded.push({
              id: planId,
              name: data.name,
              price: data.price,
              description: data.tagline || visualInfo.description,
              features: data.features || visualInfo.features,
              limits: data.limits,
              icon: visualInfo.icon,
              gradient: visualInfo.gradient,
              glow: visualInfo.glow,
              ring: visualInfo.ring,
              accent: visualInfo.accent,
              lightBg: visualInfo.lightBg,
              badge: data.badge || visualInfo.badge || null,
            });
          });
          setPlans(loaded);
        }
      } catch (err) {
        console.error("Failed to load plans from Firestore:", err);
      } finally {
        setLoadingPlans(false);
      }
    }
    fetchPlans();
  }, []);

  useEffect(() => {
    if (companyData?.selectedPlan) {
      setSelectedPlan(companyData.selectedPlan.toLowerCase());
    }
  }, [companyData?.selectedPlan]);

  useEffect(() => {
    const cancelled = searchParams.get("cancelled");
    const sessionId = searchParams.get("session_id");
    if (cancelled && sessionId && companyData?.id) {
      showError("Payment was cancelled. Your subscription has not changed.");
      logFailedPayment(sessionId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, companyData?.id]);

  const logFailedPayment = async (sessionId: string) => {
    if (!companyData?.id) return;
    try {
      const res = await fetch(`/api/stripe/subscription-verify?session_id=${sessionId}&failed=true`);
      const data = await res.json();
      const ref = collection(db, "companies", companyData.id, "subscriptionPayments");
      const dup = await getDocs(query(ref, where("stripeSessionId", "==", sessionId)));
      if (dup.empty) {
        await addDoc(ref, {
          amount: data.price || 0,
          billingPeriod: `${data.planName || "Starter"} Plan (Monthly)`,
          paymentMethod: "Stripe Checkout",
          status: "Failed",
          stripeSessionId: sessionId,
          createdAt: serverTimestamp(),
        });
      }
    } catch { /* silent */ }
  };

  const handleCheckout = async () => {
    if (!companyData?.id) return;
    setProcessing(true);
    try {
      const hasCustom = companyData.customPrice !== undefined && companyData.customPrice !== null;
      const planId = hasCustom ? (companyData.selectedPlan || "starter") : selectedPlan;
      const res = await fetch("/api/stripe/subscription-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: companyData.id, planId }),
      });
      const data = await res.json();
      if (res.ok && data.freeActivated) {
        showSuccess("Workspace subscription activated successfully!");
        window.location.reload();
        return;
      }
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        showError(data.error || "Failed to initiate payment. Please try again.");
      }
    } catch {
      showError("Failed to connect to payment gateway.");
    } finally {
      setProcessing(false);
    }
  };

  if (!companyData || loadingPlans) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading...</p>
      </div>
    );
  }

  const hasCustomPrice = companyData.customPrice !== undefined && companyData.customPrice !== null;
  const currentPlanId = (companyData.selectedPlan || "starter").toLowerCase();
  const selectedPlanInfo = plans.find(p => p.id === selectedPlan) || plans[0] || PLANS[0];
  const isCurrentPlan = selectedPlan === currentPlanId;
  const showingAll = showAllPlans || !isCurrentPlan;

  let isTrialActive = false;
  let trialDaysLeft = 0;
  let isTrialExpired = false;
  let trialEndStr = "";

  if (companyData.trialEndDate) {
    const end = companyData.trialEndDate.toDate ? companyData.trialEndDate.toDate() : new Date(companyData.trialEndDate);
    const diff = end.getTime() - Date.now();
    trialEndStr = end.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    if (diff > 0) {
      isTrialActive = true;
      trialDaysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
    } else {
      isTrialExpired = true;
    }
  }

  const checkoutPrice = hasCustomPrice ? companyData.customPrice : selectedPlanInfo.price;

  const SelectedIcon = selectedPlanInfo.icon;

  return (
    <div className="max-w-4xl mx-auto pb-20 px-3 sm:px-6">

      {/* ── Page Header ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8 pt-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Subscription & Billing
          </h1>
          <p className="text-slate-400 font-medium text-sm mt-1">Manage your plan and payments.</p>
        </div>
        <button
          onClick={() => router.push(`/${companyId}/dashboard/admin/subscription/billing-history`)}
          className="self-start sm:self-auto flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-600 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 px-4 py-2.5 rounded-xl transition-all shadow-sm"
        >
          <Receipt className="w-4 h-4" />
          Billing History
        </button>
      </div>

      {/* ── Trial / Expiry Status Banner ─────────────── */}
      {isTrialExpired && (
        <div className="mb-6 relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 p-px shadow-lg shadow-rose-500/20">
          <div className="rounded-[calc(1rem-1px)] bg-gradient-to-r from-rose-500/10 to-pink-600/10 backdrop-blur-sm px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-black text-rose-700 uppercase tracking-wide">Trial Expired</p>
              <p className="text-sm font-medium text-rose-600 mt-0.5">Your trial ended on <strong>{trialEndStr}</strong>. Subscribe to restore full access.</p>
            </div>
          </div>
        </div>
      )}

      {isTrialActive && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-amber-700 uppercase tracking-wide">
              Free Trial — {trialDaysLeft} {trialDaysLeft === 1 ? "Day" : "Days"} Remaining
            </p>
            <p className="text-sm font-medium text-amber-600 mt-0.5">
              Trial ends <strong>{trialEndStr}</strong>. Subscribe anytime to keep your agency running.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1 bg-amber-100 border border-amber-200 text-amber-700 text-xs font-black px-3 py-1.5 rounded-full whitespace-nowrap">
            <Clock className="w-3 h-3" /> {trialDaysLeft}d left
          </div>
        </div>
      )}

      {/* ── Custom Price Banner ───────────────────────── */}
      {hasCustomPrice && (
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-xl shadow-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-widest text-indigo-200">Special Pricing Active</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black">${companyData.customPrice}</span>
              <span className="text-indigo-200 text-sm font-medium">
                /{companyData.customPricePeriod === "lifetime" ? "Lifetime" : companyData.customPricePeriod || "month"}
              </span>
            </div>
            <p className="text-indigo-200 text-sm font-medium capitalize mt-0.5">
              {companyData.selectedPlan || "Starter"} Plan · Exclusive Rate
            </p>
          </div>
        </div>
      )}

      {/* ── Plan Cards ───────────────────────────────── */}
      {!hasCustomPrice && (
        <div className="mb-6">
          {/* Section heading row */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
              {showingAll ? (
                <><Sparkles className="w-4 h-4 text-indigo-500" /> Choose Your Plan</>
              ) : (
                <><Check className="w-4 h-4 text-emerald-500" /> Your Current Plan</>
              )}
            </h2>
            {!showingAll ? (
              <button
                onClick={() => setShowAllPlans(true)}
                className="flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-3.5 py-2 rounded-xl transition-all"
              >
                Change Plan <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => { setSelectedPlan(currentPlanId); setShowAllPlans(false); }}
                className="text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors"
              >
                ← Keep current
              </button>
            )}
          </div>

          {/* Plan grid */}
          <div className={`grid gap-4 ${showingAll ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1"}`}>
            {(showingAll ? plans : plans.filter(p => p.id === selectedPlan)).map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const isCurrent = plan.id === currentPlanId;
              const Icon = plan.icon;

              return (
                <div
                  key={plan.id}
                  onClick={() => {
                    setSelectedPlan(plan.id);
                    if (showingAll) setShowAllPlans(false);
                  }}
                  className={`relative cursor-pointer rounded-2xl sm:rounded-3xl border-2 transition-all duration-300 overflow-hidden group ${
                    isSelected
                      ? "border-transparent shadow-xl"
                      : "border-slate-200 hover:border-slate-300 bg-white hover:shadow-lg"
                  }`}
                  style={isSelected ? { borderColor: plan.ring, boxShadow: `0 8px 30px ${plan.ring}25` } : {}}
                >
                  {/* Gradient top bar */}
                  <div className={`h-1.5 w-full bg-gradient-to-r ${plan.gradient}`} />

                  <div className="p-5 sm:p-6 bg-white">
                    {/* Badges */}
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center shadow-lg shadow-current/20`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        {plan.badge && (
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-gradient-to-r ${plan.gradient} text-white`}>
                            {plan.badge}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-1 rounded-full">
                            Active
                          </span>
                        )}
                        {isSelected && !isCurrent && (
                          <span className="text-[9px] font-black uppercase tracking-widest bg-indigo-600 text-white px-2.5 py-1 rounded-full">
                            Selected ✓
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Name & Price */}
                    <h3 className="text-lg font-black text-slate-900">{plan.name}</h3>
                    <p className="text-xs text-slate-400 font-medium mt-0.5 mb-3">{plan.description}</p>
                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-3xl sm:text-4xl font-black text-slate-900">${plan.price}</span>
                      <span className="text-sm font-semibold text-slate-400">/mo</span>
                    </div>

                    {/* Features */}
                    <ul className="space-y-2 mb-4">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-center gap-2 text-sm font-medium text-slate-600">
                          <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${plan.gradient} flex items-center justify-center shrink-0`}>
                            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                          </div>
                          {f}
                        </li>
                      ))}
                    </ul>

                    {/* Select button (when showing all) */}
                    {showingAll && !isSelected && (
                      <div className={`w-full text-center text-xs font-black uppercase tracking-wider py-2.5 rounded-xl border-2 border-slate-200 text-slate-400 group-hover:border-current group-hover:${plan.accent} transition-all`}>
                        Select Plan
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Stripe Checkout Card ─────────────────────── */}
      <div className="rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-200 shadow-sm bg-white">
        {/* Top gradient accent */}
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600" />

        <div className="p-5 sm:p-8 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Checkout securely with Stripe</h3>
              <p className="text-slate-400 text-xs font-medium">No card data stored on our servers.</p>
            </div>
          </div>

          {/* Order Summary */}
          <div className="rounded-2xl bg-slate-50 border border-slate-100 px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${selectedPlanInfo.gradient} flex items-center justify-center shadow-sm`}>
                <SelectedIcon className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-800">{selectedPlanInfo.name} Plan</p>
                <p className="text-xs text-slate-400 font-medium">Monthly subscription · Billed via Stripe</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xl font-black text-slate-900">${checkoutPrice}</span>
              <span className="text-xs font-semibold text-slate-400">/mo</span>
            </div>
          </div>

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={processing}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black rounded-2xl h-14 flex items-center justify-center gap-2.5 shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all text-base"
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {Number(checkoutPrice) <= 0 ? "Activating Workspace..." : "Preparing Checkout..."}
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5" />
                {Number(checkoutPrice) <= 0 ? "Activate Free Workspace ($0)" : `Subscribe Now · $${checkoutPrice}/mo`}
              </>
            )}
          </button>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
              256-bit SSL
            </span>
            <span className="w-1 h-1 rounded-full bg-slate-300 hidden sm:block" />
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current text-[#635BFF]"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.92 5.555C4.598 23.082 7.88 24 11.584 24c2.658 0 4.831-.656 6.318-1.899 1.598-1.323 2.342-3.236 2.342-5.634 0-4.095-2.521-5.862-6.268-7.317z"/></svg>
              Stripe Secure
            </span>
            <span className="w-1 h-1 rounded-full bg-slate-300 hidden sm:block" />
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              Cancel Anytime
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      </div>
    }>
      <SubscriptionPageInner />
    </Suspense>
  );
}
