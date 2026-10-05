"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Camera, User, Phone, Save, Clock } from "lucide-react";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";

export default function ClientProfilePage({ params }: { params: { companyId: string } }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phoneNumber: "",
    photoUrl: "",
    email: "",
    createdAt: ""
  });
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          setFormData({
            name: data.name || user.name || "",
            phoneNumber: data.phoneNumber || "",
            photoUrl: data.photoUrl || "",
            email: data.email || user.email || "",
            createdAt: data.createdAt || ""
          });
        }
      } catch (err) {
        console.error("Error loading profile data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    try {
      // Update Credentials in Auth & Firestore (Email & Phone)
      const credRes = await fetch("/api/user/update-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUid: user.uid,
          newEmail: formData.email,
          newPhone: formData.phoneNumber,
        }),
      });
      const credData = await credRes.json();
      if (!credRes.ok) {
        showError(credData.error || "Failed to update email or phone number.");
        setSaving(false);
        return;
      }

      let finalPhotoUrl = formData.photoUrl;

      // Handle local image upload to `/api/upload`
      if (profileFile) {
        const payload = new FormData();
        payload.append("file", profileFile);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: payload });
        const uploadData = await uploadRes.json();
        if (uploadData.success && uploadData.url) {
          finalPhotoUrl = uploadData.url;
        }
      }

      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phoneNumber,
        phoneNumber: formData.phoneNumber,
        clientEmail: formData.email,
        clientPhone: formData.phoneNumber,
        photoUrl: finalPhotoUrl,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", user.uid), payload, { merge: true });
      showSuccess("Profile & Credentials updated successfully!");
      setProfileFile(null);
      setPreviewUrl(null);
      setFormData(prev => ({ ...prev, photoUrl: finalPhotoUrl }));
    } catch (err) {
      console.error("Error saving profile", err);
      showError("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const currentAvatar = previewUrl || formData.photoUrl;

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-16 pt-4 animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Profile Settings</h1>
        <p className="text-slate-500 mt-1 font-medium">Update your account information and preferences.</p>
      </div>

      <form onSubmit={handleSave}>
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-8">
          
          {/* Left Column: Photo Upload */}
          <div className="flex flex-col items-center">
            <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm w-full flex flex-col items-center justify-center gap-6">
              <div className="relative group cursor-pointer w-32 h-32" onClick={() => fileInputRef.current?.click()}>
                <div className={`w-full h-full rounded-full overflow-hidden border-4 border-white shadow-lg bg-slate-100 flex items-center justify-center transition-all ${!currentAvatar && "ring-1 ring-slate-200"}`}>
                  {currentAvatar ? (
                    <img src={currentAvatar} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-12 h-12 text-slate-300" />
                  )}
                </div>
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <Camera className="w-8 h-8 text-white" />
                </div>
              </div>
              
              <div className="text-center">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-bold border-slate-200 text-slate-700 rounded-xl"
                >
                  <Camera className="w-4 h-4 mr-2" /> Change Photo
                </Button>
                <p className="text-[11px] text-slate-400 mt-2 font-medium">JPG, PNG or WEBP (Max 2MB)</p>
              </div>

              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    setProfileFile(file);
                    setPreviewUrl(URL.createObjectURL(file));
                  }
                }}
              />
            </div>
          </div>

          {/* Right Column: Form Fields */}
          <div className="space-y-6">
            <Card className="rounded-3xl border-slate-200/60 shadow-sm overflow-hidden">
              <CardContent className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="group">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 transition-colors group-focus-within:text-indigo-600">Full Name</label>
                    <div className="relative">
                      <User className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                        className="pl-12 h-14 bg-slate-50 border-slate-200/60 focus:bg-white focus:border-indigo-500 ring-4 ring-transparent focus:ring-indigo-500/10 rounded-2xl text-[15px] font-medium"
                        placeholder="John Doe"
                        required
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 transition-colors group-focus-within:text-indigo-600">Email Address</label>
                    <div className="relative">
                      <User className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                        className="pl-12 h-14 bg-slate-50 border-slate-200/60 focus:bg-white focus:border-indigo-500 ring-4 ring-transparent focus:ring-indigo-500/10 rounded-2xl text-[15px] font-medium"
                        placeholder="client@example.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 transition-colors group-focus-within:text-indigo-600">Phone Number</label>
                    <div className="relative">
                      <Phone className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        type="tel"
                        value={formData.phoneNumber}
                        onChange={e => setFormData(p => ({ ...p, phoneNumber: e.target.value }))}
                        className="pl-12 h-14 bg-slate-50 border-slate-200/60 focus:bg-white focus:border-indigo-500 ring-4 ring-transparent focus:ring-indigo-500/10 rounded-2xl text-[15px] font-medium"
                        placeholder="+1 (555) 000-0000"
                      />
                    </div>
                  </div>

                  {formData.createdAt && (
                    <div className="group">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Date Registered</label>
                      <div className="relative">
                        <Clock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                          type="text"
                          value={new Date(formData.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          readOnly
                          className="pl-12 h-14 bg-slate-100 border-slate-200/60 text-slate-500 cursor-not-allowed rounded-2xl text-[15px] font-medium"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={saving}
                    className="h-12 px-8 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 transition-all active:scale-[0.98]"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Saving Changes
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5 mr-2" /> Save Profile
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
          
        </div>
      </form>
    </div>
  );
}
