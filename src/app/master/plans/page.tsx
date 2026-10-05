"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, serverTimestamp, Timestamp
} from "firebase/firestore";
import {
  Plus, Pencil, Trash2, Check, X, Loader2, CreditCard,
  Users, Calendar, Building2, Shield, Star, Zap, Crown,
  ToggleLeft, ToggleRight, ChevronUp, ChevronDown,
  Save, AlertTriangle, Eye, EyeOff, GripVertical, Sparkles
} from "lucide-react";
import { showSuccess, showError } from "@/lib/alerts";

// ─── Types ─────────────────────────────────────────────────────
interface PlanLimits {
  maxAdmins: number;
  maxStaff: number;
  maxTalents: number;
  maxBookings: number;
  customBranding: boolean;
}

interface Plan {
  id: string;
  name: string;
  tagline: string;
  price: number;
  period: string;
  badge: string;
  order: number;
  isActive: boolean;
  limits: PlanLimits;
  features: string[];
  createdAt?: any;
  updatedAt?: any;
}

const EMPTY_PLAN: Omit<Plan, "id"> = {
  name: "",
  tagline: "",
  price: 0,
  period: "/month",
  badge: "",
  order: 99,
  isActive: true,
  limits: { maxAdmins: 1, maxStaff: 1, maxTalents: 25, maxBookings: 50, customBranding: true },
  features: [],
};

const DEFAULT_PLANS: Omit<Plan, "id">[] = [
  {
    name: "Starter",
    tagline: "Launch your agency today",
    price: 49,
    period: "/month",
    badge: "",
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
    badge: "",
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

// ─── Limit display helper ───────────────────────────────────────
const fmtLimit = (n: number) => (n === -1 ? "∞" : n.toString());

// ─── Feature input component ─────────────────────────────────
function FeaturesEditor({ features, onChange }: { features: string[]; onChange: (f: string[]) => void }) {
  const [newFeat, setNewFeat] = useState("");

  const add = () => {
    if (!newFeat.trim()) return;
    onChange([...features, newFeat.trim()]);
    setNewFeat("");
  };

  const remove = (i: number) => onChange(features.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {features.map((f, i) => (
          <div key={i} className="flex items-center gap-2 group">
            <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <input
                type="text"
                value={f}
                onChange={(e) => {
                  const copy = [...features];
                  copy[i] = e.target.value;
                  onChange(copy);
                }}
                className="flex-1 bg-transparent text-sm text-slate-700 font-medium outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Add a feature line..."
          value={newFeat}
          onChange={(e) => setNewFeat(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="flex-1 h-9 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={add}
          className="h-9 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─── Limit field ─────────────────────────────────────────────
function LimitInput({
  label, icon: Icon, value, onChange, hint
}: {
  label: string; icon: any; value: number; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div>
      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={-1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className="w-full h-9 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
        />
        <button
          type="button"
          onClick={() => onChange(-1)}
          title="Set to Unlimited"
          className={`h-9 px-2.5 text-xs font-black rounded-xl border transition-colors whitespace-nowrap ${value === -1 ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300"}`}
        >
          {value === -1 ? "∞ Set" : "∞"}
        </button>
      </div>
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function MasterPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal/drawer state
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [editTarget, setEditTarget] = useState<Plan | null>(null);
  const [formData, setFormData] = useState<Omit<Plan, "id">>(EMPTY_PLAN);

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      for (const plan of DEFAULT_PLANS) {
        await addDoc(collection(db, "subscriptionPlans"), {
          ...plan,
          createdAt: serverTimestamp(),
        });
      }
      showSuccess("Default plans successfully seeded!");
      await loadPlans();
    } catch (err: any) {
      showError(err.message || "Failed to seed default plans.");
    } finally {
      setSeeding(false);
    }
  };

  // ── Load ───────────────────────────────────────────────────
  const loadPlans = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "subscriptionPlans"), orderBy("order", "asc")));
      const data: Plan[] = [];
      snap.forEach((d) => data.push({ id: d.id, ...(d.data() as Omit<Plan, "id">) }));
      setPlans(data);
    } catch (err) {
      console.error(err);
      showError("Failed to load plans.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPlans(); }, []);

  // ── Open create/edit ───────────────────────────────────────
  const openCreate = () => {
    setFormData({ ...EMPTY_PLAN, order: plans.length + 1 });
    setEditTarget(null);
    setMode("create");
  };

  const openEdit = (plan: Plan) => {
    setEditTarget(plan);
    setFormData({
      name: plan.name,
      tagline: plan.tagline,
      price: plan.price,
      period: plan.period,
      badge: plan.badge || "",
      order: plan.order,
      isActive: plan.isActive,
      limits: { ...plan.limits },
      features: [...plan.features],
    });
    setMode("edit");
  };

  const closeForm = () => { setMode("idle"); setEditTarget(null); };

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.price < 0) {
      showError("Plan name and price are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        badge: formData.badge.trim() || null,
        updatedAt: serverTimestamp(),
      };

      if (mode === "create") {
        await addDoc(collection(db, "subscriptionPlans"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        showSuccess(`Plan "${formData.name}" created.`);
      } else if (mode === "edit" && editTarget) {
        await updateDoc(doc(db, "subscriptionPlans", editTarget.id), payload);
        showSuccess(`Plan "${formData.name}" updated.`);
      }
      closeForm();
      await loadPlans();
    } catch (err: any) {
      showError(err.message || "Failed to save plan.");
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle active ──────────────────────────────────────────
  const toggleActive = async (plan: Plan) => {
    try {
      await updateDoc(doc(db, "subscriptionPlans", plan.id), {
        isActive: !plan.isActive,
        updatedAt: serverTimestamp(),
      });
      setPlans((prev) => prev.map((p) => p.id === plan.id ? { ...p, isActive: !p.isActive } : p));
    } catch {
      showError("Failed to toggle plan status.");
    }
  };

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "subscriptionPlans", deleteTarget.id));
      showSuccess(`Plan "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      await loadPlans();
    } catch {
      showError("Failed to delete plan.");
    } finally {
      setDeleting(false);
    }
  };

  // ── Update limit field helper ──────────────────────────────
  const setLimit = (key: keyof PlanLimits, value: number | boolean) =>
    setFormData((prev) => ({ ...prev, limits: { ...prev.limits, [key]: value } }));

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-extrabold text-[#1e1b4b] tracking-tight">Subscription Plans</h1>
          <p className="text-slate-500 font-medium mt-0.5 text-sm">
            Manage pricing plans shown on the public registration page. Changes reflect immediately.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm shadow-md shadow-indigo-600/20 transition-all hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4" /> New Plan
        </button>
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        Changes to plans are <strong className="text-amber-700">live immediately</strong> on the public registration page. Existing workspaces are not affected by plan changes.
      </div>

      {/* Plans list */}
      {loading ? (
        <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-16 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-slate-400 font-medium text-sm">Loading plans...</p>
          </div>
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-16 text-center">
          <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-semibold text-base">No plans found.</p>
          <p className="text-slate-400 font-medium text-sm mt-1">Create your first subscription plan to show it on the registration page.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button onClick={openCreate} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-md shadow-indigo-600/10">
              <Plus className="w-4 h-4" /> Create Custom Plan
            </button>
            <button
              type="button"
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-xl text-sm transition-all border border-slate-200 disabled:opacity-50"
            >
              {seeding ? <><Loader2 className="w-4 h-4 animate-spin" /> Seeding...</> : <><Sparkles className="w-4 h-4 text-amber-500" /> Seed Default Plans</>}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan, idx) => (
            <div
              key={plan.id}
              className={`bg-white rounded-[20px] border shadow-[0_2px_12px_rgb(0,0,0,0.04)] transition-all hover:shadow-[0_4px_20px_rgb(0,0,0,0.07)] ${plan.isActive ? "border-slate-100" : "border-slate-200 opacity-60"}`}
            >
              <div className="p-6 flex items-start gap-5 flex-wrap">

                {/* Order badge */}
                <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center shrink-0 font-black text-slate-500 text-lg">
                  {idx + 1}
                </div>

                {/* Plan info */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-[17px] font-extrabold text-[#1e1b4b]">{plan.name}</h3>
                    {plan.badge && (
                      <span className="text-[10px] font-black text-violet-600 bg-violet-50 border border-violet-200 px-2.5 py-0.5 rounded-full uppercase tracking-widest">
                        {plan.badge}
                      </span>
                    )}
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest border ${plan.isActive ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {plan.isActive ? "Active" : "Hidden"}
                    </span>
                  </div>

                  <p className="text-sm text-slate-400 font-medium">{plan.tagline}</p>

                  {/* Price + limits */}
                  <div className="flex items-center gap-4 flex-wrap text-sm">
                    <span className="font-black text-[#1e1b4b] text-lg">${plan.price}<span className="text-slate-400 font-medium text-sm">{plan.period}</span></span>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { icon: Shield, label: `${fmtLimit(plan.limits.maxAdmins)} Admin` },
                        { icon: Users, label: `${fmtLimit(plan.limits.maxStaff)} Staff` },
                        { icon: Star, label: `${fmtLimit(plan.limits.maxTalents)} Talents` },
                        { icon: Calendar, label: `${fmtLimit(plan.limits.maxBookings)} Bookings/mo` },
                      ].map(({ icon: Icon, label }) => (
                        <span key={label} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                          <Icon className="w-3 h-3" /> {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Features preview */}
                  {plan.features.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {plan.features.slice(0, 4).map((f, i) => (
                        <span key={i} className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                          {f}
                        </span>
                      ))}
                      {plan.features.length > 4 && (
                        <span className="text-[10px] font-semibold text-slate-400">+{plan.features.length - 4} more</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Toggle active */}
                  <button
                    onClick={() => toggleActive(plan)}
                    title={plan.isActive ? "Hide plan" : "Show plan"}
                    className={`p-2 rounded-xl border text-xs font-bold transition-all ${plan.isActive ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"}`}
                  >
                    {plan.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => openEdit(plan)}
                    className="p-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setDeleteTarget(plan)}
                    className="p-2 rounded-xl border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CREATE / EDIT SLIDE-IN PANEL ─────────────────────────── */}
      {mode !== "idle" && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={closeForm}
          />

          {/* Drawer */}
          <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

            {/* Drawer header */}
            <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-[18px] font-extrabold text-[#1e1b4b]">
                  {mode === "create" ? "New Subscription Plan" : `Edit: ${editTarget?.name}`}
                </h2>
                <p className="text-[12px] text-slate-400 font-medium mt-0.5">
                  {mode === "create" ? "Fill in the details to add a new plan." : "Update the plan's details, pricing, and limits."}
                </p>
              </div>
              <button onClick={closeForm} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form body */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-7 py-6 space-y-7">

              {/* Basic info */}
              <section className="space-y-4">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Basic Info</h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Plan Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Professional"
                      value={formData.name}
                      onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                      required
                      className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Tagline</label>
                    <input
                      type="text"
                      placeholder="e.g. Scale your operations"
                      value={formData.tagline}
                      onChange={(e) => setFormData((p) => ({ ...p, tagline: e.target.value }))}
                      className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Price (USD) *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="99"
                        value={formData.price}
                        onChange={(e) => setFormData((p) => ({ ...p, price: parseInt(e.target.value) || 0 }))}
                        required
                        className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl pl-7 pr-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Display Order</label>
                    <input
                      type="number"
                      min={1}
                      value={formData.order}
                      onChange={(e) => setFormData((p) => ({ ...p, order: parseInt(e.target.value) || 1 }))}
                      className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Badge Label</label>
                    <input
                      type="text"
                      placeholder='e.g. "Most Popular" or leave blank'
                      value={formData.badge}
                      onChange={(e) => setFormData((p) => ({ ...p, badge: e.target.value }))}
                      className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Status</label>
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, isActive: !p.isActive }))}
                      className={`w-full h-10 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 ${formData.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-slate-100 text-slate-500 border-slate-300"}`}
                    >
                      {formData.isActive ? <><Eye className="w-4 h-4" /> Visible</> : <><EyeOff className="w-4 h-4" /> Hidden</>}
                    </button>
                  </div>
                </div>
              </section>

              {/* Limits */}
              <section className="space-y-4 border-t border-slate-100 pt-5">
                <div>
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Account Limits</h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Set -1 or click ∞ for unlimited.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <LimitInput label="Max Admins" icon={Shield} value={formData.limits.maxAdmins} onChange={(v) => setLimit("maxAdmins", v)} hint="Usually 1" />
                  <LimitInput label="Max Staff" icon={Users} value={formData.limits.maxStaff} onChange={(v) => setLimit("maxStaff", v)} />
                  <LimitInput label="Max Talents" icon={Star} value={formData.limits.maxTalents} onChange={(v) => setLimit("maxTalents", v)} />
                  <LimitInput label="Max Bookings/mo" icon={Calendar} value={formData.limits.maxBookings} onChange={(v) => setLimit("maxBookings", v)} />
                </div>

                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-700">Custom Branding</p>
                    <p className="text-[11px] text-slate-400 font-medium">Logos, banners, custom colors</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLimit("customBranding", !formData.limits.customBranding)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${formData.limits.customBranding ? "bg-indigo-600" : "bg-slate-300"}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${formData.limits.customBranding ? "translate-x-5.5 left-0" : "left-0.5"}`} />
                  </button>
                </div>
              </section>

              {/* Features */}
              <section className="space-y-4 border-t border-slate-100 pt-5">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Feature Bullet Points</h3>
                <FeaturesEditor
                  features={formData.features}
                  onChange={(f) => setFormData((p) => ({ ...p, features: f }))}
                />
              </section>

            </form>

            {/* Drawer footer */}
            <div className="px-7 py-5 border-t border-slate-100 flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 h-11 border border-slate-200 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="plan-form"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Plan</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── DELETE CONFIRM MODAL ─────────────────────────────────── */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[24px] shadow-2xl p-8 w-full max-w-md animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h3 className="text-[17px] font-extrabold text-[#1e1b4b]">Delete "{deleteTarget.name}"?</h3>
                  <p className="text-sm text-slate-400 font-medium mt-0.5">This will remove the plan from the registration page permanently.</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
                <p className="text-xs font-semibold text-amber-700">
                  ⚠ Existing workspaces on this plan are <strong>not affected</strong>. Only the public plan card will be removed.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 h-11 border border-slate-200 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white font-black text-sm rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4" /> Delete Plan</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
