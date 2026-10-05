"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, X, Globe, Briefcase, DollarSign, User, Camera, Trash2, Image as ImageIcon, Clock, CheckCircle2, ChevronDown, Search, MapPin, CalendarDays, Sparkles } from "lucide-react";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { sendNotificationToAdmins } from "@/lib/notifications";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalFooter } from "@/components/ui/modal";

export interface WorkingHours {
  mode?: "24hours" | "custom";
  start: string;
  end: string;
}

export interface BlockedDate {
  id: string;
  date: string; // YYYY-MM-DD
  reason?: string;
}

interface TalentProfile {
  name: string;
  originalName: string;
  email: string;
  phone: string;
  username: string;
  bio: string;
  categories: string[];
  secondaryServices: string[];
  rate: string;
  locations: string[];
  photoUrl: string;
  coverUrl?: string;
  gallery: string[];
  galleryLayout: "grid" | "slider";
  gender: string[];
  workingHours: WorkingHours;
  blockedDates: BlockedDate[];
}

// Custom Searchable Multi-Select Component (Used for Categories)
function SearchableMultiSelect({
  options,
  selected,
  onToggle,
  placeholder,
  icon: Icon,
  label
}: {
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (name: string) => void;
  placeholder: string;
  icon: any;
  label: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() =>
    options.filter(opt => opt.name.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="text-[12px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-indigo-600 text-[10px] bg-indigo-50 px-2 py-0.5 rounded-lg">{selected.length} Selected</span>
      </label>

      {/* Trigger */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-3 h-14 w-full rounded-2xl border-2 transition-all cursor-pointer px-5 ${isOpen ? "border-indigo-500 bg-white ring-4 ring-indigo-500/5" : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
          }`}
      >
        <Icon className={`w-5 h-5 ${selected.length > 0 ? "text-indigo-600" : "text-slate-400"}`} />
        <div className="flex-1 truncate">
          {selected.length === 0 ? (
            <span className="text-slate-400 font-medium">{placeholder}</span>
          ) : (
            <span className="text-slate-900 font-bold">{selected.join(", ")}</span>
          )}
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-100 rounded-[28px] shadow-2xl z-50 p-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="relative mb-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search options..."
              className="h-11 pl-11 rounded-2xl border-slate-100 bg-slate-50/50 focus:bg-white"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto space-y-1 p-1 custom-scrollbar">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm font-medium italic">No matches found...</div>
            ) : (
              filtered.map(opt => {
                const isSelected = selected.includes(opt.name);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onToggle(opt.name)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-[14px] font-bold transition-all flex items-center justify-between group ${isSelected ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-600"
                      }`}
                  >
                    <span>{opt.name}</span>
                    {isSelected ? (
                      <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                    ) : (
                      <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Selected Tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 p-1">
          {selected.map(item => (
            <span key={item} className="bg-indigo-600 text-white px-3.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-2 shadow-sm animate-in zoom-in-95 duration-200">
              {item}
              <button type="button" onClick={() => onToggle(item)} className="hover:scale-125 transition-transform"><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// NEW COMPONENT: Google Places Autocomplete for Multiple Locations
function GooglePlacesMultiSelect({
  selected,
  onAdd,
  onRemove,
  placeholder,
  icon: Icon,
  label
}: {
  selected: string[];
  onAdd: (location: string) => void;
  onRemove: (location: string) => void;
  placeholder: string;
  icon: any;
  label: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const [predictions, setPredictions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const autocompleteService = useRef<any>(null);
  const searchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    
    // Attempt early init if google is available
    const initService = async () => {
      const g = (window as any).google;
      if (g && g.maps && !autocompleteService.current) {
        try {
          const { AutocompleteService } = await g.maps.importLibrary("places");
          autocompleteService.current = new AutocompleteService();
        } catch (err) {
          console.error("Failed to load places library", err);
        }
      }
    };
    initService();

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.length > 2) {
      setIsOpen(true);
      setIsSearching(true);

      // Debounce search requests by 500ms to avoid spamming the Geocoding APIs
      searchTimeoutRef.current = setTimeout(async () => {
        const g = (window as any).google;
        let googleSuccess = false;

        if (g && g.maps) {
          try {
            if (!autocompleteService.current) {
              const { AutocompleteService } = await g.maps.importLibrary("places");
              autocompleteService.current = new AutocompleteService();
            }

            if (autocompleteService.current) {
              const response = await autocompleteService.current.getPlacePredictions({
                input: value,
                types: ["(cities)"],
                componentRestrictions: { country: "us" }
              });
              
              if (response && response.predictions && response.predictions.length > 0) {
                setPredictions(response.predictions.map((r: any) => r.description));
                googleSuccess = true;
              }
            }
          } catch (err) {
            console.warn("Google Maps Places API failed. Falling back to Open Source Geocoder...", err);
          }
        }

        // Failsafe: OpenStreetMap Geocoding API if Google is restricted/fails
        if (!googleSuccess) {
           try {
              const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&countrycodes=us&format=json&limit=5&addressdetails=1`);
              const data = await res.json();
              if (data && data.length > 0) {
                 const formatted = data.map((item: any) => {
                    const city = item.address?.city || item.address?.town || item.address?.village || item.address?.hamlet || item.name;
                    const state = item.address?.stateCode || item.address?.state || "";
                    return state ? `${city}, ${state}` : city;
                 });
                 const uniqueFormatted = Array.from(new Set(formatted.filter(Boolean) as string[]));
                 setPredictions(uniqueFormatted);
              } else {
                 setPredictions([]);
              }
           } catch (err) {
              console.error("Fallback Geocoder also failed", err);
              setPredictions([]);
           }
        }
        setIsSearching(false);
      }, 500);
    } else {
      setIsOpen(false);
      setPredictions([]);
      setIsSearching(false);
    }
  };

  const handleSelect = (place: string) => {
    if (!selected.includes(place)) {
      onAdd(place);
    }
    setInputValue("");
    setIsOpen(false);
    setPredictions([]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="text-[12px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-indigo-600 text-[10px] bg-indigo-50 px-2 py-0.5 rounded-lg">{selected.length} Selected</span>
      </label>

      {/* Input Field */}
      <div className="relative">
        <Icon className={`absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 ${isOpen ? "text-indigo-600" : "text-slate-400"}`} />
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onClick={() => inputValue.length > 2 && setIsOpen(true)}
          placeholder={placeholder}
          className={`h-14 w-full pl-12 pr-5 rounded-2xl border-2 transition-all font-medium text-slate-900 placeholder:text-slate-400 ${isOpen ? "border-indigo-500 bg-white ring-4 ring-indigo-500/5 focus-visible:ring-indigo-500/5 focus-visible:border-indigo-500" : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
            }`}
        />
      </div>

      {/* Dropdown for API Predictions */}
      {isOpen && inputValue.length > 2 && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-100 rounded-[24px] shadow-2xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-[250px] overflow-y-auto custom-scrollbar px-2">
            {isSearching ? (
              <div className="p-4 text-center text-slate-400 text-sm font-medium italic flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Searching...</span>
              </div>
            ) : predictions.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm font-medium italic">No matching locations found</div>
            ) : (
              predictions.map((place, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelect(place)}
                  className="w-full text-left px-4 py-3 rounded-xl text-[14px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center gap-3"
                >
                  <MapPin className="w-4 h-4 text-slate-400" />
                  {place}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Selected Location Tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 p-1">
          {selected.map(item => (
            <span key={item} className="bg-indigo-600 text-white px-3.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-2 shadow-sm animate-in zoom-in-95 duration-200">
              {item}
              <button type="button" onClick={() => onRemove(item)} className="hover:scale-125 transition-transform"><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TalentProfilePage() {
  const { user } = useAuth();
  const companyId = user?.companyId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [talentTypes, setTalentTypes] = useState<{ id: string; name: string }[]>([]);
  const [gendersDropdown, setGendersDropdown] = useState<{ id: string; name: string }[]>([]);

  const defaultWorkingHours: WorkingHours = {
    mode: "24hours",
    start: "00:00",
    end: "23:59",
  };

  const [formData, setFormData] = useState<TalentProfile>({
    name: user?.name || "",
    originalName: "",
    email: user?.email || "",
    phone: (user as any)?.phone || (user as any)?.phoneNumber || "",
    username: "",
    bio: "",
    categories: [],
    secondaryServices: [],
    rate: "",
    locations: [],
    photoUrl: "",
    coverUrl: "",
    gallery: [],
    galleryLayout: "grid",
    gender: [],
    workingHours: defaultWorkingHours,
    blockedDates: []
  });

  const [savingCredentials, setSavingCredentials] = useState(false);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [isUsernameLocked, setIsUsernameLocked] = useState(false);
  const [isPendingApproval, setIsPendingApproval] = useState(false);

  // Blackout Date Modal States
  const [isBlackoutModalOpen, setIsBlackoutModalOpen] = useState(false);
  const [newBlackoutDate, setNewBlackoutDate] = useState("");
  const [newBlackoutEndDate, setNewBlackoutEndDate] = useState("");
  const [newBlackoutReason, setNewBlackoutReason] = useState("");
  const [blackoutFilter, setBlackoutFilter] = useState<"current_month" | "past" | "all">("current_month");

  const handleUpdateCredentials = async () => {
    if (!user) return;
    setSavingCredentials(true);
    try {
      const res = await fetch("/api/user/update-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUid: user.uid,
          newEmail: formData.email,
          newPhone: formData.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || "Failed to update email and phone number.");
      } else {
        showSuccess("Email and Phone Number updated successfully!");
      }
    } catch (err: any) {
      console.error("Credentials update error:", err);
      showError("Failed to save credentials.");
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleAddBlackoutDate = () => {
     if (!newBlackoutDate) {
        showError("Please select a start date.");
        return;
     }

     const start = new Date(newBlackoutDate);
     const end = newBlackoutEndDate ? new Date(newBlackoutEndDate) : start;
     
     if (end < start) {
        showError("End date cannot be before start date.");
        return;
     }

     const newBlocks: BlockedDate[] = [];
     let currentDate = new Date(start);

     // Run loop exactly at midday conceptually to prevent TZ bugs
     currentDate.setHours(12, 0, 0, 0);
     end.setHours(12, 0, 0, 0);

     while (currentDate <= end) {
        const yyyy = currentDate.getFullYear();
        const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
        const dd = String(currentDate.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        if (!formData.blockedDates.some(b => b.date === dateStr)) {
           newBlocks.push({
              id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
              date: dateStr,
              reason: newBlackoutReason
           });
        }
        currentDate.setDate(currentDate.getDate() + 1);
     }

     if (newBlocks.length === 0) {
        showError("These dates are already blocked.");
        return;
     }
     
     setFormData(prev => ({ ...prev, blockedDates: [...prev.blockedDates, ...newBlocks].sort((a,b) => a.date.localeCompare(b.date)) }));
     setNewBlackoutDate("");
     setNewBlackoutEndDate("");
     setNewBlackoutReason("");
     showSuccess(`Added ${newBlocks.length} blackout date(s).`);
  };

  useEffect(() => {
    async function loadData() {
      if (!user || !companyId) return;
      try {
        const typesSnap = await getDocs(query(collection(db, "companies", companyId, "talentTypes"), where("status", "!=", "inactive")));
        const gendersSnap = await getDocs(query(collection(db, "companies", companyId, "genders"), where("status", "!=", "inactive")));
        
        const pendingSnap = await getDoc(doc(db, "pending_profile_updates", user.uid));
        
        setTalentTypes(typesSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
        setGendersDropdown(gendersSnap.docs.map(d => ({ id: d.id, name: d.data().name })));

        if (pendingSnap.exists() && pendingSnap.data().status === "pending") {
          setIsPendingApproval(true);
          const data = pendingSnap.data().newData;
          setFormData({
            name: data.name || user.name || "",
            originalName: data.originalName || "",
            email: data.email || user.email || "",
            phone: data.phone || data.phoneNumber || (user as any).phone || (user as any).phoneNumber || "",
            username: data.username || "",
            bio: data.bio || "",
            categories: data.categories || [],
            secondaryServices: data.secondaryServices || [],
            rate: data.rate || "",
            locations: data.locations || [],
            photoUrl: data.photoUrl || "",
            coverUrl: data.coverUrl || "",
            gallery: data.gallery || [],
            galleryLayout: data.galleryLayout || "grid",
            gender: Array.isArray(data.gender) ? data.gender : (data.gender ? [data.gender] : []),
            workingHours: data.workingHours || defaultWorkingHours,
            blockedDates: data.blockedDates || []
          });
          if (data.username) setIsUsernameLocked(true);
        } else {
          const talentSnap = await getDoc(doc(db, "talents", user.uid));
          if (talentSnap.exists()) {
            const data = talentSnap.data();
            setFormData({
              name: data.name || user.name || "",
              originalName: data.originalName || "",
              email: data.email || user.email || "",
              phone: data.phone || data.phoneNumber || (user as any).phone || (user as any).phoneNumber || "",
              username: data.username || "",
              bio: data.bio || "",
              categories: data.categories || [],
              secondaryServices: data.secondaryServices || [],
              rate: data.rate || "",
              locations: data.locations || [],
              photoUrl: data.photoUrl || "",
              coverUrl: data.coverUrl || "",
              gallery: data.gallery || [],
              galleryLayout: data.galleryLayout || "grid",
              gender: Array.isArray(data.gender) ? data.gender : (data.gender ? [data.gender] : []),
              workingHours: data.workingHours || defaultWorkingHours,
              blockedDates: data.blockedDates || []
            });
            if (data.usernameChanged) setIsUsernameLocked(true);
          }
        }
      } catch (err) {
        console.error("Error loading profile data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, companyId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    try {
      if (!isUsernameLocked && formData.username) {
        const usernameQuery = query(collection(db, "talents"), where("username", "==", formData.username.toLowerCase()));
        const usernameSnap = await getDocs(usernameQuery);
        if (!usernameSnap.empty && usernameSnap.docs[0].id !== user.uid) {
          showError("Username already taken. Please choose another.");
          setSaving(false);
          return;
        }
      }

      const currentSnap = await getDoc(doc(db, "talents", user.uid));
      const currentData: Record<string, any> = currentSnap.data() || {};

      let finalPhotoUrl = formData.photoUrl;
      let finalCoverUrl = formData.coverUrl;

      if (profileFile) {
        const payload = new FormData();
        payload.append("file", profileFile);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: payload });
        const uploadData = await uploadRes.json();
        if (uploadData.success && uploadData.url) finalPhotoUrl = uploadData.url;
      }

      const oldUsername = (currentData.username || "").toLowerCase().trim();
      const newUsername = (formData.username || "").toLowerCase().trim();
      let usernameChangedFlag = currentData.usernameChanged || false;

      if (newUsername && oldUsername && newUsername !== oldUsername) {
        usernameChangedFlag = true;
      }

      const payload: Record<string, any> = {
        ...formData,
        username: newUsername,
        usernameChanged: usernameChangedFlag,
        photoUrl: finalPhotoUrl,
        coverUrl: finalCoverUrl,
        userId: user.uid,
        companyId: user.companyId,
        updatedAt: new Date().toISOString()
      };

      // LIVE DIFF CHECK
      const allKeys = Array.from(new Set([...Object.keys(currentData), ...Object.keys(payload)]));
      const excluded = ['updatedAt', 'requestedAt', 'companyId', 'userId', 'talentId', 'numericId', 'status', 'email', 'password'];
      
      let hasRealChanges = false;
      if (profileFile) {
          hasRealChanges = true;
      } else {
          for (const key of allKeys) {
             if (excluded.includes(key)) continue;
             
             // Rule: Hide "Empty/Blank" Requested Changes to avoid confusing diff
             const oldVal = currentData[key];
             const newVal = payload[key];
             const isNewEmpty = newVal === undefined || newVal === null || newVal === "" || (Array.isArray(newVal) && newVal.length === 0);
             const isOldEmpty = oldVal === undefined || oldVal === null || oldVal === "" || (Array.isArray(oldVal) && oldVal.length === 0);
             
             if (isNewEmpty && isOldEmpty) continue;

             if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                 hasRealChanges = true;
                 break;
             }
          }
      }

      if (!hasRealChanges) {
         showInfo("No changes detected. Your profile is already up-to-date!");
         setSaving(false);
         return;
      }

      // Writing explicitly to the staging approval queue instead of public talents path
      await setDoc(doc(db, "pending_profile_updates", user.uid), {
        talentId: user.uid,
        companyId: user.companyId,
        previousData: {}, // In a full prod system we'd snapshot the previous data, but Admin can fetch it live!
        newData: payload,
        status: "pending",
        requestedAt: new Date().toISOString()
      }, { merge: true });

      await sendNotificationToAdmins(user.companyId!, {
         title: "Pending Talent Profile Update",
         message: `${user.name || "A talent"} has submitted profile updates for approval.`,
         type: "alert",
         link: `/${user.companyId}/dashboard/admin/talents/pendingupdate`
      });

      if (usernameChangedFlag) setIsUsernameLocked(true);
      setIsPendingApproval(true);
      showSuccess("Updates submitted! Waiting for Admin Approval to go public.");
    } catch (err) {
      console.error("Error saving profile", err);
      showError("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !user) return;
    setUploadingCover(true);
    try {
      const payload = new FormData();
      payload.append("file", e.target.files[0]);
      const res = await fetch("/api/upload", { method: "POST", body: payload });
      const data = await res.json();
      if (data.success) setFormData(prev => ({ ...prev, coverUrl: data.url }));
    } catch (err) {
      console.error("Cover upload error", err);
    } finally {
      setUploadingCover(false);
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !user) return;

    if (formData.gallery.length >= 10) {
      showError("Gallery limit reached (max 10 images).");
      return;
    }

    setUploadingGallery(true);

    try {
      const files = Array.from(e.target.files).slice(0, 10 - formData.gallery.length);
      const uploadPromises = files.map(async (f) => {
        const payload = new FormData();
        payload.append("file", f);
        const res = await fetch("/api/upload", { method: "POST", body: payload });
        const data = await res.json();
        return data.success ? data.url : null;
      });

      const urls = (await Promise.all(uploadPromises)).filter(Boolean);
      setFormData(prev => ({ ...prev, gallery: [...prev.gallery, ...urls].slice(0, 10) }));
    } catch (err) {
      console.error("Gallery upload error", err);
    } finally {
      setUploadingGallery(false);
    }
  };

  const removeGalleryImage = (url: string) => {
    setFormData(prev => ({ ...prev, gallery: prev.gallery.filter(item => item !== url) }));
  };

  const toggleCategory = (catName: string) => {
    const updated = formData.categories.includes(catName)
      ? formData.categories.filter(c => c !== catName)
      : [...formData.categories, catName];
    setFormData({ ...formData, categories: updated });
  };

  const toggleGender = (genderName: string) => {
    const updated = formData.gender.includes(genderName)
      ? formData.gender.filter(g => g !== genderName)
      : [...formData.gender, genderName];
    setFormData({ ...formData, gender: updated });
  };

  // Naye location helper functions
  const handleAddLocation = (locName: string) => {
    if (!formData.locations.includes(locName)) {
      setFormData({ ...formData, locations: [...formData.locations, locName] });
    }
  };

  const handleRemoveLocation = (locName: string) => {
    setFormData({
      ...formData,
      locations: formData.locations.filter(l => l !== locName)
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto pb-20 px-4">
      {isPendingApproval && (
        <div className="mt-8 mb-4 p-5 bg-orange-50 border-2 border-orange-200 rounded-3xl flex items-start gap-4 animate-in fade-in slide-in-from-top-4 shadow-sm">
          <div className="p-2.5 bg-orange-100 text-orange-600 rounded-2xl shrink-0">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <div>
            <h3 className="text-orange-900 font-black text-[15px] uppercase tracking-wider mb-1">Updates Pending Approval</h3>
            <p className="text-orange-800 text-[13.5px] font-medium leading-relaxed max-w-3xl">
              Your recent modifications are safely saved as a draft here for you to keep editing, but they are waiting on Administrator Approval before publishing live to your public portfolio layout.
            </p>
          </div>
        </div>
      )}

      <div className="mb-6 sm:mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 sm:pt-8">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">Edit Profile</h1>
          <p className="text-slate-500 mt-1 sm:mt-2 font-medium text-sm sm:text-lg">Manage your professional identity.</p>
        </div>
        <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.open(`/${companyId}/talent/${formData.username || user?.uid}`, "_blank")}
            className="flex-1 sm:flex-none rounded-2xl border-2 border-indigo-100 text-indigo-600 font-bold hover:bg-indigo-50 gap-2 h-11 sm:h-12 text-xs sm:text-sm shadow-sm px-3 sm:px-5"
          >
            <Globe className="w-4 h-4 shrink-0" /> <span className="truncate">View Public Profile</span>
          </Button>
          <Button
            type="submit"
            form="profile-form"
            disabled={saving}
            className="flex-1 sm:flex-none rounded-2xl bg-slate-900 text-white font-bold hover:bg-indigo-600 h-11 sm:h-12 px-4 sm:px-8 text-xs sm:text-sm min-w-[120px]"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Changes"}
          </Button>
        </div>
      </div>

      <form id="profile-form" onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">

        {/* Cover Photo - Full Width Section */}
        <div className="lg:col-span-12">
          <div className="relative h-[180px] sm:h-[280px] w-full rounded-[28px] sm:rounded-[48px] bg-slate-100 overflow-hidden group shadow-xl sm:shadow-2xl shadow-slate-200/50 border-2 sm:border-4 border-white">
            {formData.coverUrl ? (
              <img src={formData.coverUrl} alt="Cover" className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-700" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-gradient-to-br from-slate-50 to-slate-100">
                <ImageIcon className="w-12 h-12 sm:w-16 sm:h-16 mb-2 opacity-20" />
                <p className="text-xs sm:text-sm font-bold opacity-30">No Background Cover</p>
              </div>
            )}
            <label className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 p-2.5 sm:p-4 bg-white/90 backdrop-blur-md text-slate-800 rounded-2xl sm:rounded-[24px] shadow-lg cursor-pointer hover:bg-white transition-all font-black text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 border border-slate-100 z-20">
              {uploadingCover ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Camera className="w-4 h-4 sm:w-5 sm:h-5" />}
              <span className="truncate">Change Background</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleCoverUpload} />
            </label>
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="rounded-[32px] sm:rounded-[40px] overflow-hidden border-none shadow-xl sm:shadow-2xl shadow-slate-200/60 bg-white -mt-10 sm:-mt-20 relative z-10 mx-0">
            <CardContent className="p-5 sm:p-8">
              <div className="relative group mx-auto w-32 h-32 sm:w-44 sm:h-44 mb-6 sm:mb-8">
                <div className="w-32 h-32 sm:w-44 sm:h-44 rounded-[32px] sm:rounded-[48px] bg-slate-100 overflow-hidden border-4 border-white shadow-xl relative z-0">
                  {formData.photoUrl || profileFile ? (
                    <img src={profileFile ? URL.createObjectURL(profileFile) : formData.photoUrl} alt="Profile" className="w-full h-full object-cover shadow-inner" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[32px] sm:rounded-[48px]"><User className="w-14 h-14 sm:w-20 sm:h-20" /></div>
                  )}
                </div>
                <label className="absolute -bottom-2 -right-2 p-3 sm:p-4 bg-indigo-600 text-white rounded-2xl sm:rounded-[24px] shadow-2xl cursor-pointer hover:bg-indigo-700 hover:scale-110 transition-all z-10 border-4 border-white">
                  <Camera className="w-5 h-5 sm:w-6 sm:h-6" />
                  <input type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && setProfileFile(e.target.files[0])} />
                </label>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Display Name</label>
                  <Input
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="h-12 rounded-xl border-slate-100 bg-slate-50/50 focus:bg-white transition-all font-bold px-4"
                    placeholder="E.g. John Doe"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Original Name</label>
                  <Input
                    value={formData.originalName}
                    onChange={e => setFormData({ ...formData, originalName: e.target.value })}
                    className="h-12 rounded-xl border-slate-100 bg-slate-50/50 focus:bg-white transition-all font-bold px-4"
                    placeholder="Your legal name"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1 flex items-center justify-between">
                    Username
                    {isUsernameLocked && <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">Locked</span>}
                  </label>
                  <Input
                    value={formData.username}
                    disabled={isUsernameLocked}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                    className={`h-12 rounded-xl border-slate-100 bg-slate-50/50 focus:bg-white transition-all font-bold px-4 ${isUsernameLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                    placeholder="unique-handle"
                  />
                  {!isUsernameLocked && <p className="text-[10px] text-slate-400 mt-1 ml-1 font-medium italic">* Can only be set once</p>}
                </div>
                <div className="pt-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Hourly Rate ($)</label>
                  <div className="relative">
                    <DollarSign className="w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input type="number" value={formData.rate} onChange={e => setFormData({ ...formData, rate: e.target.value })} required className="pl-14 h-14 rounded-2xl border-slate-100 bg-slate-50/50 focus:bg-white transition-all font-black text-xl" placeholder="0.00" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Credentials Card */}
          <Card className="rounded-[40px] border-none shadow-xl shadow-slate-200/50 bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2.5 text-[18px] font-black">
                <User className="w-5 h-5 text-indigo-600" /> Account Credentials
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Change your login email & contact number safely without data loss.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="h-12 rounded-xl border-slate-100 bg-slate-50/50 focus:bg-white transition-all font-bold px-4 text-slate-900"
                  placeholder="talent@example.com"
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">
                  Phone / Mobile Number
                </label>
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="h-12 rounded-xl border-slate-100 bg-slate-50/50 focus:bg-white transition-all font-bold px-4 text-slate-900"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <Button
                type="button"
                onClick={handleUpdateCredentials}
                disabled={savingCredentials}
                className="w-full h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md"
              >
                {savingCredentials ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Update Contact Info
              </Button>
            </CardContent>
          </Card>

          {/* Portfolio Settings */}
          <Card className="rounded-[40px] border-none shadow-xl shadow-slate-200/50 bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2.5 text-[18px] font-black"><ImageIcon className="w-5 h-5 text-indigo-600" /> Layout</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex gap-2 p-1 bg-slate-50 rounded-2xl border border-slate-100">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, galleryLayout: "grid" })}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all ${formData.galleryLayout === "grid" ? "bg-white shadow-md text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
                >
                  Grid View
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, galleryLayout: "slider" })}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all ${formData.galleryLayout === "slider" ? "bg-white shadow-md text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
                >
                  Slider View
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Working Hours */}
          <Card className="rounded-[40px] border-none shadow-xl shadow-slate-200/50 bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2.5 text-[18px] font-black"><Clock className="w-5 h-5 text-indigo-600" /> Working Hours</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* Option Selector */}
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100/70 rounded-2xl border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      workingHours: { mode: "24hours", start: "00:00", end: "23:59" }
                    });
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    (formData.workingHours?.mode === "24hours" || (!formData.workingHours?.mode && formData.workingHours?.start === "00:00" && formData.workingHours?.end === "23:59"))
                      ? "bg-white text-indigo-600 shadow-sm border border-slate-200/60"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> 24 Hours
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const currStart = (formData.workingHours?.start && formData.workingHours?.start !== "00:00") ? formData.workingHours.start : "09:00";
                    const currEnd = (formData.workingHours?.end && formData.workingHours?.end !== "23:59") ? formData.workingHours.end : "17:00";
                    setFormData({
                      ...formData,
                      workingHours: { mode: "custom", start: currStart, end: currEnd }
                    });
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    (formData.workingHours?.mode === "custom" || (formData.workingHours?.mode !== "24hours" && (formData.workingHours?.start !== "00:00" || formData.workingHours?.end !== "23:59")))
                      ? "bg-white text-indigo-600 shadow-sm border border-slate-200/60"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" /> Custom Hours
                </button>
              </div>

              {(formData.workingHours?.mode === "custom" || (formData.workingHours?.mode !== "24hours" && (formData.workingHours?.start !== "00:00" || formData.workingHours?.end !== "23:59"))) ? (
                <div className="space-y-2 animate-in fade-in duration-200">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Time From</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Time To</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center p-2 bg-slate-50 rounded-2xl border border-slate-100 gap-2 overflow-hidden">
                    <Input 
                      type="time" 
                      value={formData.workingHours.start || "09:00"}
                      onChange={(e) => setFormData({ ...formData, workingHours: { ...formData.workingHours, mode: "custom", start: e.target.value } })}
                      className="h-12 w-full min-w-0 text-[14px] font-bold bg-white border-slate-200 rounded-xl focus-visible:ring-indigo-500 text-center shadow-sm px-2"
                    />
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest px-1 text-center">TO</span>
                    <Input 
                      type="time" 
                      value={formData.workingHours.end || "17:00"}
                      onChange={(e) => setFormData({ ...formData, workingHours: { ...formData.workingHours, mode: "custom", end: e.target.value } })}
                      className="h-12 w-full min-w-0 text-[14px] font-bold bg-white border-slate-200 rounded-xl focus-visible:ring-indigo-500 text-center shadow-sm px-2"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl text-center space-y-1 animate-in fade-in duration-200">
                  <span className="text-xs font-black text-emerald-800 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Always Available (24 Hours)
                  </span>
                  <p className="text-[10px] font-bold text-emerald-600/80">Available for bookings at any hour of the day.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Blackout Dates */}
          <Card className="rounded-[40px] border-none shadow-xl shadow-slate-200/50 bg-white">
            <CardContent className="p-6">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className="bg-indigo-50 w-12 h-12 flex items-center justify-center rounded-2xl">
                      <CalendarDays className="w-5 h-5 text-indigo-600" />
                   </div>
                   <div>
                     <h3 className="text-[15px] font-black text-slate-800">Blackout Dates</h3>
                     <p className="text-[11px] font-medium text-slate-500">{formData.blockedDates.length} locked days</p>
                   </div>
                 </div>
                 <Button 
                  type="button" 
                  onClick={() => setIsBlackoutModalOpen(true)}
                  className="rounded-xl px-4 h-10 font-bold bg-slate-900 hover:bg-indigo-600 text-white shadow-md shadow-slate-900/10"
                >
                  Manage
                </Button>
               </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Details Column */}
        <div className="lg:col-span-8 space-y-8 lg:pt-8">
          <Card className="rounded-[40px] border-none shadow-2xl shadow-slate-200/60 bg-white overflow-hidden">
            <CardContent className="p-8 space-y-8 md:p-10">

              {/* Category & Gender Pickers Grid */}
              <div className="grid grid-cols-1 gap-8">
                <SearchableMultiSelect
                  label="Primary Categories"
                  options={talentTypes}
                  selected={formData.categories}
                  onToggle={toggleCategory}
                  placeholder="Choose categories..."
                  icon={Briefcase}
                />
                <SearchableMultiSelect
                  label="Demographics (Genders)"
                  options={gendersDropdown}
                  selected={formData.gender}
                  onToggle={toggleGender}
                  placeholder="Select genders..."
                  icon={User}
                />
              </div>

              {/* Bio */}
              <div>
                <label className="text-[12px] font-black text-slate-400 uppercase tracking-widest block mb-3.5 ml-1">Professional Story</label>
                <textarea
                  className="w-full min-h-[160px] rounded-[32px] border-none bg-slate-50 p-6 text-[15px] font-medium text-slate-600 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 transition-all outline-none leading-relaxed placeholder:text-slate-300"
                  value={formData.bio}
                  onChange={e => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Tell clients about your journey, unique style, and why they should book you..."
                />
              </div>

              {/* NEW: Location Searchable Picker (Google API Ready) */}
              <GooglePlacesMultiSelect
                label="Coverage Areas"
                selected={formData.locations}
                onAdd={handleAddLocation}
                onRemove={handleRemoveLocation}
                placeholder="Search for cities (e.g., Los Angeles, CA)..."
                icon={Globe}
              />

              {/* Photo Gallery */}
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] font-black text-slate-400 uppercase tracking-widest block ml-1 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" /> Photo Gallery
                  </label>
                  <label className="text-indigo-600 text-[12px] font-bold cursor-pointer hover:underline flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Add Photos
                    <input type="file" multiple className="hidden" accept="image/*" onChange={handleGalleryUpload} />
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {formData.gallery.map((url, idx) => (
                    <div key={idx} className="relative aspect-square rounded-[24px] overflow-hidden group border-2 border-slate-50 shadow-sm">
                      <img src={url} alt="Gallery" className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button type="button" onClick={() => removeGalleryImage(url)} className="p-2 bg-white/20 backdrop-blur-md rounded-xl text-white hover:bg-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <label className="aspect-square rounded-[24px] border-2 border-dashed border-slate-100 bg-slate-50 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100/50 transition-colors text-slate-400 group">
                    {uploadingGallery ? <Loader2 className="w-6 h-6 animate-spin" /> : <>
                      <Camera className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-bold">New Photo</span>
                    </>}
                    <input type="file" multiple className="hidden" accept="image/*" onChange={handleGalleryUpload} />
                  </label>
                </div>
              </div>

            </CardContent>
            <CardFooter className="p-8 md:p-10 pt-0">
              <Button type="submit" disabled={saving} className="w-full h-16 rounded-[28px] bg-slate-900 hover:bg-indigo-600 text-white font-black text-lg shadow-2xl shadow-slate-900/10 transition-all hover:-translate-y-1">
                {saving ? <><Loader2 className="w-6 h-6 mr-2 animate-spin" />Saving Profile...</> : "Publish My Profile"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </form>

      {/* Blackout Date Modal */}
      <Modal open={isBlackoutModalOpen} onOpenChange={setIsBlackoutModalOpen}>
        <ModalContent className="w-[96%] sm:max-w-[500px] rounded-[32px] p-4 sm:p-6 border-none shadow-2xl">
          <ModalHeader className="mb-4">
            <ModalTitle className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-indigo-600" />
              Manage Blackout Dates
            </ModalTitle>
          </ModalHeader>
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 space-y-6">
            
            {/* Add New */}
            <div className="bg-slate-50 p-5 rounded-[24px] border border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Start Date</label>
                  <Input
                    type="date"
                    value={newBlackoutDate}
                    onChange={(e) => setNewBlackoutDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="h-14 rounded-2xl border-slate-200 bg-white focus:bg-white transition-all font-bold px-4 text-slate-700 text-lg shadow-sm w-full"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">End Date (Multiple)</label>
                  <Input
                    type="date"
                    value={newBlackoutEndDate}
                    onChange={(e) => setNewBlackoutEndDate(e.target.value)}
                    min={newBlackoutDate || new Date().toISOString().split("T")[0]}
                    className="h-14 rounded-2xl border-slate-200 bg-white focus:bg-white transition-all font-bold px-4 text-slate-700 text-lg shadow-sm w-full"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 items-center">
                <Input
                  type="text"
                  placeholder="Reason (e.g. Vacation, Sick Day)"
                  value={newBlackoutReason}
                  onChange={(e) => setNewBlackoutReason(e.target.value)}
                  className="h-12 rounded-xl border-slate-200 bg-white focus:bg-white transition-all font-medium px-4 text-sm shadow-sm flex-1 w-full"
                />
                <Button type="button" onClick={handleAddBlackoutDate} className="h-12 w-full sm:w-auto rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-6">
                  Add Dates
                </Button>
              </div>
            </div>

            {/* List */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 px-1">
                <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  Saved Dates
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md">{formData.blockedDates.length}</span>
                </h4>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                   <button type="button" onClick={() => setBlackoutFilter("current_month")} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${blackoutFilter === 'current_month' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>This Month</button>
                   <button type="button" onClick={() => setBlackoutFilter("past")} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${blackoutFilter === 'past' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Past</button>
                   <button type="button" onClick={() => setBlackoutFilter("all")} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${blackoutFilter === 'all' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>All</button>
                </div>
              </div>
              
              {formData.blockedDates.length === 0 ? (
                 <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm font-bold italic">
                   No blackout dates currently mapped.
                 </div>
              ) : (
                 <div className="space-y-4">
                   {Object.keys(
                     formData.blockedDates.filter(b => {
                        const d = new Date(b.date);
                        const curr = new Date();
                        if (blackoutFilter === 'current_month') {
                           return d.getMonth() === curr.getMonth() && d.getFullYear() === curr.getFullYear();
                        }
                        if (blackoutFilter === 'past') {
                           curr.setHours(0, 0, 0, 0);
                           return d < curr;
                        }
                        return true;
                     }).reduce((acc, curr) => {
                       const monthYear = new Date(curr.date).toLocaleString('default', { month: 'long', year: 'numeric' });
                       if (!acc[monthYear]) acc[monthYear] = [];
                       acc[monthYear].push(curr);
                       return acc;
                     }, {} as Record<string, typeof formData.blockedDates>)
                   ).length === 0 ? (
                      <div className="text-center p-6 text-slate-400 text-sm font-bold italic">No dates found for this view.</div>
                   ) : Object.entries(
                     formData.blockedDates.filter(b => {
                        const d = new Date(b.date);
                        const curr = new Date();
                        if (blackoutFilter === 'current_month') {
                           return d.getMonth() === curr.getMonth() && d.getFullYear() === curr.getFullYear();
                        }
                        if (blackoutFilter === 'past') {
                           curr.setHours(0, 0, 0, 0);
                           return d < curr;
                        }
                        return true;
                     }).reduce((acc, curr) => {
                       const monthYear = new Date(curr.date).toLocaleString('default', { month: 'long', year: 'numeric' });
                       if (!acc[monthYear]) acc[monthYear] = [];
                       acc[monthYear].push(curr);
                       return acc;
                     }, {} as Record<string, typeof formData.blockedDates>)
                   ).map(([month, dates]) => (
                     <div key={month}>
                       <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-2">{month}</h5>
                       <div className="space-y-2">
                         {dates.map((block) => (
                           <div key={block.id} className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm transition-all hover:border-indigo-100 group">
                               <div className="w-12 h-12 bg-indigo-50 rounded-xl flex flex-col items-center justify-center font-black text-indigo-600 shrink-0">
                                  <span className="text-[10px] leading-none uppercase">{new Date(block.date).toLocaleString('default', { month: 'short' })}</span>
                                  <span className="text-[16px] leading-tight">{new Date(block.date).getDate()}</span>
                               </div>
                               <div className="flex-1 min-w-0">
                                 <div className="text-[14px] font-black text-slate-800 truncate">{new Date(block.date).toLocaleDateString(undefined, { weekday: 'long' })}</div>
                                 <div className="text-[11px] font-bold text-slate-500 truncate">{block.reason || "Blocked out"}</div>
                               </div>
                               <button type="button" onClick={() => setFormData({ ...formData, blockedDates: formData.blockedDates.filter(b => b.id !== block.id) })} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0">
                                  <Trash2 className="w-4 h-4" />
                               </button>
                           </div>
                         ))}
                       </div>
                     </div>
                   ))}
                 </div>
              )}
            </div>
          </div>
          <ModalFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setIsBlackoutModalOpen(false)} className="w-full h-12 rounded-xl font-black text-slate-700">
              Close Manager
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
}