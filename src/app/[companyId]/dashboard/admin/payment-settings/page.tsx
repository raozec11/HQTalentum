"use client";

import { useState, useEffect } from "react";
import { useCompany } from "@/context/CompanyContext";
import { db } from "@/lib/firebase";
import { doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { showSuccess, showError } from "@/lib/alerts";
import { 
  Building2, 
  Upload, 
  Loader2, 
  Save, 
  AlertCircle,
  Smartphone,
  Banknote,
  Lock,
  Eye,
  EyeOff,
  CreditCard
} from "lucide-react";

export default function PaymentSettingsPage() {
  const { companyData, loading, refreshCompanyData } = useCompany();
  
  const [cashappQrUrl, setCashappQrUrl] = useState("");
  const [venmoQrUrl, setVenmoQrUrl] = useState("");
  const [cashappUsername, setCashappUsername] = useState("");
  const [venmoUsername, setVenmoUsername] = useState("");
  
  const [cashappFile, setCashappFile] = useState<File | null>(null);
  const [venmoFile, setVenmoFile] = useState<File | null>(null);
  
  const [cashappPreview, setCashappPreview] = useState("");
  const [venmoPreview, setVenmoPreview] = useState("");

  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (companyData) {
      setCashappQrUrl(companyData.cashappQrUrl || "");
      setVenmoQrUrl(companyData.venmoQrUrl || "");
      setCashappPreview(companyData.cashappQrUrl || "");
      setVenmoPreview(companyData.venmoQrUrl || "");
      setCashappUsername(companyData.cashappUsername || "");
      setVenmoUsername(companyData.venmoUsername || "");
      
      const loadStripeKeys = async () => {
        try {
          const snap = await getDoc(doc(db, "company_stripe_keys", companyData.id));
          if (snap.exists()) {
            const data = snap.data();
            setStripePublishableKey(data.stripePublishableKey || "");
            setStripeSecretKey(data.stripeSecretKey || "");
          }
        } catch (err) {
          console.error("Failed to load Stripe keys:", err);
        }
      };
      loadStripeKeys();
    }
  }, [companyData]);

  const handleCashappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCashappFile(file);
      setCashappPreview(URL.createObjectURL(file));
    }
  };

  const handleVenmoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVenmoFile(file);
      setVenmoPreview(URL.createObjectURL(file));
    }
  };

  const uploadQr = async (file: File, type: "cashapp" | "venmo"): Promise<string | null> => {
    if (!companyData) return null;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("slug", companyData.id);
      formData.append("type", type);
      
      const res = await fetch("/api/upload-qr", {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) throw new Error(`Upload failed for ${type}`);
      const data = await res.json();
      return data.url;
    } catch (error) {
      console.error(`Error uploading ${type} QR:`, error);
      return null;
    }
  };

  const handleSave = async () => {
    if (!companyData) return;
    
    setSaving(true);
    setUploading(true);
    try {
      let finalCashappUrl = cashappQrUrl;
      let finalVenmoUrl = venmoQrUrl;

      if (cashappFile) {
        const url = await uploadQr(cashappFile, "cashapp");
        if (url) finalCashappUrl = url;
      }

      if (venmoFile) {
        const url = await uploadQr(venmoFile, "venmo");
        if (url) finalVenmoUrl = url;
      }
      
      const hasStripeKeys = stripePublishableKey.trim().length > 0 && stripeSecretKey.trim().length > 0;

      await updateDoc(doc(db, "companies", companyData.id), {
        cashappQrUrl: finalCashappUrl,
        venmoQrUrl: finalVenmoUrl,
        cashappUsername: cashappUsername.trim(),
        venmoUsername: venmoUsername.trim(),
        stripeEnabled: hasStripeKeys
      });

      // Save Stripe credentials securely
      await setDoc(doc(db, "company_stripe_keys", companyData.id), {
        stripePublishableKey: stripePublishableKey.trim(),
        stripeSecretKey: stripeSecretKey.trim(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      await refreshCompanyData();
      showSuccess("Payment settings updated successfully!");
    } catch (error) {
      console.error("Error saving payment settings:", error);
      showError("Failed to save payment settings.");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  if (loading || !companyData) {
    return (
      <div className="h-full min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-650" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Payment Settings</h1>
        <p className="text-slate-500 font-medium">Configure card payments (Stripe) and manual mobile payment options for your clients.</p>
      </div>

      {/* Stripe Configuration */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8 space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <CreditCard className="w-32 h-32 text-indigo-600" />
        </div>
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4 relative z-10">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-indigo-950">Stripe Integration</h2>
            <p className="text-indigo-700/60 text-xs font-bold uppercase tracking-widest mt-0.5">Direct Card Payments for Bookings & Tips</p>
          </div>
        </div>

        <div className="space-y-4 relative z-10">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Stripe Publishable Key</label>
            <div className="relative">
              <CreditCard className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                value={stripePublishableKey}
                onChange={e => setStripePublishableKey(e.target.value)}
                placeholder="pk_test_... or pk_live_..."
                className="w-full h-12 pl-10 pr-4 border border-slate-200 rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Stripe Secret Key</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type={showSecretKey ? "text" : "password"} 
                value={stripeSecretKey}
                onChange={e => setStripeSecretKey(e.target.value)}
                placeholder="sk_test_... or sk_live_..."
                className="w-full h-12 pl-10 pr-12 border border-slate-200 rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
              />
              <button 
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
              >
                {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          
          <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
            Note: These API keys will only be used to process client booking payments and performer tips for your workspace. Platform subscription payments will continue to run through the global system.
          </p>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-8 space-y-2">
        <h2 className="text-lg font-extrabold text-slate-900">Manual Payment QR Codes</h2>
        <p className="text-slate-500 text-sm font-medium">Upload manual payment QR codes for clients who prefer using CashApp or Venmo.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* CashApp Settings */}
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
             <Smartphone className="w-32 h-32 text-emerald-600" />
          </div>
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 relative z-10">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shadow-inner font-black text-2xl">$</div>
            <div>
              <h2 className="text-xl font-black text-emerald-950">CashApp Set-Up</h2>
              <p className="text-emerald-700/60 text-xs font-bold uppercase tracking-widest mt-0.5">Primary manual payment</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 relative z-10">
            <div className="relative group w-full max-w-[200px] aspect-square rounded-3xl overflow-hidden bg-emerald-50 border-2 border-dashed border-emerald-200 flex items-center justify-center transition-all group-hover:border-emerald-500/50">
              {cashappPreview ? (
                <img src={cashappPreview} alt="CashApp QR" className="w-full h-full object-contain p-4" />
              ) : (
                <div className="flex flex-col items-center text-emerald-300">
                   <Upload className="w-10 h-10 mb-2 group-hover:text-emerald-500 transition-colors" />
                   <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Upload QR</span>
                </div>
              )}
              <label 
                htmlFor="cashapp-upload" 
                className="absolute inset-0 bg-transparent flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <div className="bg-white/90 backdrop-blur-sm p-3 rounded-full text-emerald-600 shadow-lg">
                  <Upload className="w-5 h-5" />
                </div>
                <input id="cashapp-upload" type="file" className="hidden" accept="image/*" onChange={handleCashappChange} />
              </label>
            </div>
            {cashappFile && <p className="text-xs font-bold text-slate-400 capitalize truncate max-w-[200px]">{cashappFile.name}</p>}
          </div>
          
          <div className="relative z-10 space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">CashApp Username</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400 font-mono">$</span>
              <input 
                type="text" 
                value={cashappUsername}
                onChange={e => setCashappUsername(e.target.value)}
                placeholder="username"
                className="w-full h-12 pl-8 pr-4 border border-slate-200 rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-mono"
              />
            </div>
          </div>
        </div>

        {/* Venmo Settings */}
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
             <Smartphone className="w-32 h-32 text-blue-600" />
          </div>
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 relative z-10">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shadow-inner font-black text-3xl italic">V</div>
            <div>
              <h2 className="text-xl font-black text-blue-950">Venmo Set-Up</h2>
              <p className="text-blue-700/60 text-xs font-bold uppercase tracking-widest mt-0.5">Secondary manual payment</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 relative z-10">
            <div className="relative group w-full max-w-[200px] aspect-square rounded-3xl overflow-hidden bg-blue-50 border-2 border-dashed border-blue-200 flex items-center justify-center transition-all group-hover:border-blue-500/50">
              {venmoPreview ? (
                <img src={venmoPreview} alt="Venmo QR" className="w-full h-full object-contain p-4" />
              ) : (
                <div className="flex flex-col items-center text-blue-300">
                   <Upload className="w-10 h-10 mb-2 group-hover:text-blue-500 transition-colors" />
                   <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Upload QR</span>
                </div>
              )}
              <label 
                htmlFor="venmo-upload" 
                className="absolute inset-0 bg-transparent flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <div className="bg-white/90 backdrop-blur-sm p-3 rounded-full text-blue-600 shadow-lg">
                  <Upload className="w-5 h-5" />
                </div>
                <input id="venmo-upload" type="file" className="hidden" accept="image/*" onChange={handleVenmoChange} />
              </label>
            </div>
            {venmoFile && <p className="text-xs font-bold text-slate-400 capitalize truncate max-w-[200px]">{venmoFile.name}</p>}
          </div>

          <div className="relative z-10 space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Venmo Username</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400 font-mono">@</span>
              <input 
                type="text" 
                value={venmoUsername}
                onChange={e => setVenmoUsername(e.target.value)}
                placeholder="username"
                className="w-full h-12 pl-8 pr-4 border border-slate-200 rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono"
              />
            </div>
          </div>
        </div>

      </div>

      <div className="bg-amber-50/50 border border-amber-100/50 rounded-2xl p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[13px] text-amber-700 font-medium leading-relaxed">
          When clients choose these options at checkout, they will be prompted to scan your uploaded QR codes and will then upload a screenshot of their transaction. You can review uploaded screenshots in the Pending Payments tab.
        </p>
      </div>

      <div className="pt-4 flex items-center justify-end gap-3 sticky bottom-4 z-50 bg-slate-50/80 backdrop-blur-md p-4 rounded-3xl border border-slate-200/60 shadow-xl">
        <Button 
          className="h-12 px-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-lg transition-all active:scale-[0.98] flex items-center gap-2"
          disabled={saving || uploading}
          onClick={handleSave}
        >
          {saving || uploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          Save Payment Methods
        </Button>
      </div>

    </div>
  );
}
