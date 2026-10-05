"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/context/CompanyContext";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { 
  Building2, 
  Upload, 
  Palette, 
  Check, 
  Loader2, 
  Save, 
  Image as ImageIcon,
  Type,
  AlertCircle
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { User, Phone, Mail } from "lucide-react";

export default function SettingsPage() {
  const { companyData, loading, refreshCompanyData } = useCompany();
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState("#5046E5");
  const [brandSecondary, setBrandSecondary] = useState("#3730A3");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Admin Credentials State
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [savingAdminCreds, setSavingAdminCreds] = useState(false);

  useEffect(() => {
    if (companyData) {
      setName(companyData.name || "");
      setBrandColor(companyData.brandColor || "#5046E5");
      setBrandSecondary(companyData.brandSecondary || "#3730A3");
      setLogoPreview(companyData.logoUrl || "");
    }
    if (user) {
      setAdminEmail(user.email || "");
      setAdminPhone((user as any)?.phone || (user as any)?.phoneNumber || "");
    }
  }, [companyData, user]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile || !companyData) return companyData?.logoUrl || null;
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", logoFile);
      formData.append("slug", companyData.id);
      
      const res = await fetch("/api/upload-logo", {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) throw new Error("Upload failed");
      
      const data = await res.json();
      return data.url;
    } catch (error) {
      console.error("Error uploading logo:", error);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!companyData) return;
    
    setSaving(true);
    try {
      const logoUrl = await uploadLogo();
      
      await updateDoc(doc(db, "companies", companyData.id), {
        name,
        brandColor,
        brandSecondary,
        logoUrl: logoUrl || companyData.logoUrl || "",
        updatedAt: new Date(),
      });
      
      await refreshCompanyData();
      showSuccess("Settings updated successfully!");
      router.push(`/${companyData.id}/dashboard/admin`);
    } catch (error) {
      console.error("Error saving settings:", error);
      showError("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAdminCredentials = async () => {
    if (!user) return;
    setSavingAdminCreds(true);
    try {
      const res = await fetch("/api/user/update-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUid: user.uid,
          newEmail: adminEmail,
          newPhone: adminPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || "Failed to update admin credentials.");
      } else {
        showSuccess("Admin Email and Phone Number updated successfully!");
      }
    } catch (err: any) {
      console.error("Error updating admin credentials:", err);
      showError("Failed to update credentials.");
    } finally {
      setSavingAdminCreds(false);
    }
  };

  if (loading || !companyData) {
    return (
      <div className="h-full min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Company Settings</h1>
        <p className="text-slate-500 font-medium">Customize your brand identity and workspace settings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Profile Card */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6 flex flex-col items-center text-center">
            <div className="relative group">
              <div 
                className="w-32 h-32 rounded-3xl overflow-hidden bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center transition-all group-hover:border-brand-primary/50"
                style={{ backgroundColor: logoPreview ? '#fff' : `${brandColor}10` }}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-contain p-4" />
                ) : (
                  <Building2 className="w-12 h-12 text-slate-300 group-hover:text-brand-primary transition-colors" />
                )}
              </div>
              <label 
                htmlFor="logo-upload" 
                className="absolute -bottom-2 -right-2 w-10 h-10 bg-white shadow-lg border border-slate-100 rounded-xl flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors text-slate-600 hover:text-brand-primary"
              >
                <Upload className="w-5 h-5" />
                <input id="logo-upload" type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
              </label>
            </div>
            
            <div className="mt-6">
              <h3 className="font-bold text-slate-900 text-lg">{name || "Company Name"}</h3>
              <p className="text-slate-400 text-sm font-medium">/{companyData.id}</p>
            </div>

            <div className="w-full h-px bg-slate-50 my-6" />

            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              <Palette className="w-3 h-3" /> Brand Palette
            </div>
            
            <div className="flex flex-wrap justify-center gap-2">
              <div className="w-10 h-10 rounded-lg shadow-inner" style={{ backgroundColor: brandColor }} title="Primary" />
              <div className="w-10 h-10 rounded-lg shadow-inner opacity-80" style={{ backgroundColor: brandSecondary }} title="Secondary" />
              <div className="w-10 h-10 rounded-lg shadow-inner opacity-60" style={{ backgroundColor: brandColor }} title="Accent" />
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-8">
            <div className="space-y-8">
              {/* Name Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Type className="w-4 h-4 text-brand-primary" /> General Identity
                </div>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 px-1 uppercase tracking-wider">Display Name</label>
                    <Input 
                      value={name} 
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter company name"
                      className="h-12 rounded-xl bg-slate-50 border-slate-100 focus:bg-white focus:ring-brand-primary transition-all text-base font-medium"
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-50" />

              {/* Branding Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Palette className="w-4 h-4 text-brand-primary" /> Visual Branding
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 px-1 uppercase tracking-wider">Primary Color</label>
                    <div className="flex gap-3">
                      <div className="relative group shrink-0">
                        <input 
                          type="color" 
                          value={brandColor}
                          onChange={(e) => setBrandColor(e.target.value)}
                          className="w-12 h-12 rounded-xl cursor-pointer border-none p-0 overflow-hidden appearance-none shadow-sm"
                        />
                        <div className="absolute inset-0 pointer-events-none rounded-xl ring-1 ring-inset ring-black/10" />
                      </div>
                      <Input 
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        className="h-12 rounded-xl bg-slate-50 border-slate-100 flex-1 font-mono uppercase"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 px-1 uppercase tracking-wider">Secondary Color</label>
                    <div className="flex gap-3">
                      <div className="relative group shrink-0">
                        <input 
                          type="color" 
                          value={brandSecondary}
                          onChange={(e) => setBrandSecondary(e.target.value)}
                          className="w-12 h-12 rounded-xl cursor-pointer border-none p-0 overflow-hidden appearance-none shadow-sm"
                        />
                        <div className="absolute inset-0 pointer-events-none rounded-xl ring-1 ring-inset ring-black/10" />
                      </div>
                      <Input 
                        value={brandSecondary}
                        onChange={(e) => setBrandSecondary(e.target.value)}
                        className="h-12 rounded-xl bg-slate-50 border-slate-100 flex-1 font-mono uppercase"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 px-1 uppercase tracking-wider">Logo Asset</label>
                    <div className="h-12 px-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-sm text-slate-500">
                      <span className="truncate max-w-[150px]">{logoFile ? logoFile.name : "System Default"}</span>
                      <label htmlFor="logo-upload-2" className="text-brand-primary font-bold cursor-pointer hover:underline shrink-0">Change</label>
                      <input id="logo-upload-2" type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50/50 border border-amber-100/50 rounded-2xl p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[13px] text-amber-700 font-medium leading-relaxed">
                  Changing the brand color will automatically update the interface for all users in your organization. Some UI elements like charts and status badges will stay consistent for readability.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3">
                <Button 
                  variant="outline" 
                  className="h-12 px-6 rounded-xl font-bold border-slate-200"
                  onClick={() => {
                    showInfo("Changes discarded.");
                    router.push(`/${companyData.id}/dashboard/admin`);
                  }}
                >
                  Discard Changes
                </Button>
                <Button 
                  className="h-12 px-8 rounded-xl bg-brand-primary hover:bg-brand-secondary text-brand-text font-bold shadow-lg shadow-brand-primary/20 transition-all active:scale-[0.98] flex items-center gap-2"
                  disabled={saving || uploading}
                  onClick={handleSave}
                >
                  {saving || uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  Save Brand Settings
                </Button>
              </div>
            </div>
          </div>

          {/* Admin Account Credentials Card */}
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-8 space-y-6">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <User className="w-4 h-4 text-brand-primary" /> Admin Profile Credentials
            </div>
            <p className="text-xs text-slate-500 font-medium -mt-4">
              Update your Admin login Email Address and Phone Number. Bookings, logs, and system data remain 100% intact.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 px-1 uppercase tracking-wider">Admin Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="pl-11 h-12 rounded-xl bg-slate-50 border-slate-100 focus:bg-white text-sm font-medium"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 px-1 uppercase tracking-wider">Admin Phone</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="tel"
                    value={adminPhone}
                    onChange={(e) => setAdminPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="pl-11 h-12 rounded-xl bg-slate-50 border-slate-100 focus:bg-white text-sm font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={handleSaveAdminCredentials}
                disabled={savingAdminCreds}
                className="h-12 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md"
              >
                {savingAdminCreds ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Update Admin Credentials
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
