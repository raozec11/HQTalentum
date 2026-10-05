"use client";

import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, writeBatch, deleteDoc } from "firebase/firestore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Settings, Globe, CheckCircle, MessageSquare, Database, Download, UploadCloud, Trash2, AlertTriangle } from "lucide-react";
import { usePlatformPermissions } from "@/hooks/usePlatformPermissions";
import { showSuccess, showError, confirmAction } from "@/lib/alerts";

// Comprehensive timezones with GMT offsets
const TIMEZONES = [
  { value: "UTC", label: "(GMT+00:00) UTC (Coordinated Universal Time)" },
  { value: "Europe/London", label: "(GMT+00:00) London, Dublin, Lisbon (GMT)" },
  { value: "Europe/Paris", label: "(GMT+01:00) Paris, Berlin, Rome, Madrid (CET)" },
  { value: "Africa/Cairo", label: "(GMT+02:00) Cairo, Johannesburg, Athens (EET)" },
  { value: "Asia/Riyadh", label: "(GMT+03:00) Riyadh, Moscow, Istanbul (AST)" },
  { value: "Asia/Dubai", label: "(GMT+04:00) Dubai, Abu Dhabi, Baku (GST)" },
  { value: "Asia/Karachi", label: "(GMT+05:00) Islamabad, Karachi, Tashkent (PKT)" },
  { value: "Asia/Kolkata", label: "(GMT+05:30) Mumbai, New Delhi, Colombo (IST)" },
  { value: "Asia/Dhaka", label: "(GMT+06:00) Dhaka, Almaty (BST)" },
  { value: "Asia/Bangkok", label: "(GMT+07:00) Bangkok, Hanoi, Jakarta (ICT)" },
  { value: "Asia/Singapore", label: "(GMT+08:00) Singapore, Beijing, Perth (SGT/AWST)" },
  { value: "Asia/Tokyo", label: "(GMT+09:00) Tokyo, Seoul, Osaka (JST)" },
  { value: "Australia/Sydney", label: "(GMT+10:00) Sydney, Melbourne, Brisbane (AEST)" },
  { value: "Pacific/Auckland", label: "(GMT+12:00) Auckland, Wellington, Fiji (NZST)" },
  { value: "Atlantic/Cape_Verde", label: "(GMT-01:00) Cape Verde Is. (CVT)" },
  { value: "America/Noronha", label: "(GMT-02:00) Mid-Atlantic (FNT)" },
  { value: "America/Argentina/Buenos_Aires", label: "(GMT-03:00) Buenos Aires, Brasilia (ART/BRT)" },
  { value: "America/Halifax", label: "(GMT-04:00) Atlantic Time (AST)" },
  { value: "America/New_York", label: "(GMT-05:00) Eastern Time - New York, Washington (EST)" },
  { value: "America/Chicago", label: "(GMT-06:00) Central Time - Chicago, Mexico City (CST)" },
  { value: "America/Denver", label: "(GMT-07:00) Mountain Time - Denver (MST)" },
  { value: "America/Los_Angeles", label: "(GMT-08:00) Pacific Time - Los Angeles, Vancouver (PST)" },
  { value: "America/Anchorage", label: "(GMT-09:00) Alaska Time (AKST)" },
  { value: "Pacific/Honolulu", label: "(GMT-10:00) Hawaii Time (HST)" },
];

export default function MasterSettingsPage() {
  const { hasPermission, permissionsLoading } = usePlatformPermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [timezone, setTimezone] = useState("UTC");

  const [activeTab, setActiveTab] = useState<"general" | "database">("general");

  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const [resetLoading, setResetLoading] = useState(false);
  const [resetOptions, setResetOptions] = useState({
    bookings: false,
    chats: false,
    ratings: false,
    companies: false,
    talents: false,
    users: false,
    reviews: false,
    support_tickets: false,
    talent_activity_logs: false,
    notes: false,
    notifications: false,
    pending_updates: false
  });

  // Troubleshoot diagnostics states
  const [testEmail, setTestEmail] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    details?: any;
  } | null>(null);

  // SMS diagnostics states
  const [testPhone, setTestPhone] = useState("");
  const [testSmsLoading, setTestSmsLoading] = useState(false);
  const [testSmsResult, setTestSmsResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    details?: any;
  } | null>(null);

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) return;

    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/debug/test-smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `Success! Test email sent successfully. Message ID: ${data.messageId}`,
          details: data.config
        });
      } else {
        setTestResult({
          success: false,
          error: data.error || "Failed to send test email.",
          details: data
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || "An unexpected error occurred during connection.",
        details: err
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSendTestSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) return;

    setTestSmsLoading(true);
    setTestSmsResult(null);

    try {
      const res = await fetch("/api/notifications/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "test",
          title: "Talentum SMS Test",
          message: "This is a test SMS from the Talentum platform. If you received this, SMS delivery is working correctly!",
          recipientPhone: testPhone.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setTestSmsResult({
          success: true,
          message: `Success! Test SMS sent successfully. SID: ${data.sid}`,
          details: data
        });
      } else {
        setTestSmsResult({
          success: false,
          error: data.error || "Failed to send test SMS.",
          details: data
        });
      }
    } catch (err: any) {
      setTestSmsResult({
        success: false,
        error: err.message || "An unexpected error occurred.",
        details: err
      });
    } finally {
      setTestSmsLoading(false);
    }
  };

  useEffect(() => {
    async function loadSettings() {
      try {
        const snap = await getDoc(doc(db, "platform_settings", "general"));
        if (snap.exists()) {
          const data = snap.data();
          if (data.timezone) setTimezone(data.timezone);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const ref = doc(db, "platform_settings", "general");
      const snap = await getDoc(ref);
      const payload = {
        timezone
      };
      if (snap.exists()) {
        await updateDoc(ref, payload);
      } else {
        await setDoc(ref, payload);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleExportBackup = async () => {
    setBackupLoading(true);
    try {
      const backupData: any = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        collections: {}
      };

      const flatCollections = [
        "bookings",
        "client_internal_ratings",
        "company_stripe_keys",
        "talents",
        "users",
        "reviews",
        "support_tickets",
        "talent_activity_logs",
        "notes",
        "notifications",
        "pending_profile_updates",
        "platform_roles",
        "platform_settings",
        "subscriptionPlans"
      ];

      // 1. Backup standard flat collections
      for (const colName of flatCollections) {
        const snap = await getDocs(collection(db, colName));
        backupData.collections[colName] = snap.docs.map(d => ({
          id: d.id,
          data: d.data()
        }));
      }

      // 2. Backup chats and messages
      const chatsBackup: any[] = [];
      const chatsSnap = await getDocs(collection(db, "chats"));
      for (const chatDoc of chatsSnap.docs) {
        const chatId = chatDoc.id;
        const msgSnap = await getDocs(collection(db, `chats/${chatId}/messages`));
        const messages = msgSnap.docs.map(d => ({ id: d.id, data: d.data() }));
        chatsBackup.push({
          id: chatId,
          data: chatDoc.data(),
          messages
        });
      }
      backupData.collections["chats"] = chatsBackup;

      // 3. Backup companies and subcollections
      const companiesBackup: any[] = [];
      const companiesSnap = await getDocs(collection(db, "companies"));
      for (const companyDoc of companiesSnap.docs) {
        const companyId = companyDoc.id;
        
        const ttSnap = await getDocs(collection(db, `companies/${companyId}/talentTypes`));
        const talentTypes = ttSnap.docs.map(d => ({ id: d.id, data: d.data() }));

        const gSnap = await getDocs(collection(db, `companies/${companyId}/genders`));
        const genders = gSnap.docs.map(d => ({ id: d.id, data: d.data() }));

        const locations: any[] = [];
        const locSnap = await getDocs(collection(db, `companies/${companyId}/locations`));
        for (const locDoc of locSnap.docs) {
          const stateId = locDoc.id;
          const citySnap = await getDocs(collection(db, `companies/${companyId}/locations/${stateId}/cities`));
          const cities = citySnap.docs.map(d => ({ id: d.id, data: d.data() }));
          locations.push({ id: stateId, data: locDoc.data(), cities });
        }

        const sSnap = await getDocs(collection(db, `companies/${companyId}/settings`));
        const settings = sSnap.docs.map(d => ({ id: d.id, data: d.data() }));

        const subPaySnap = await getDocs(collection(db, `companies/${companyId}/subscriptionPayments`));
        const subscriptionPayments = subPaySnap.docs.map(d => ({ id: d.id, data: d.data() }));

        companiesBackup.push({
          id: companyId,
          data: companyDoc.data(),
          talentTypes,
          genders,
          locations,
          settings,
          subscriptionPayments
        });
      }
      backupData.collections["companies"] = companiesBackup;

      // Trigger browser download
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupData, null, 2)
      )}`;
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", jsonString);
      downloadAnchor.setAttribute(
        "download",
        `talentum_backup_${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showSuccess("Database backup exported successfully!");
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Failed to export database backup.");
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreFile) return;
    
    const confirm = await confirmAction({
      title: "Are you sure?",
      text: "This will overwrite existing documents with the backup data. This action cannot be undone.",
      icon: "warning",
      confirmButtonText: "Yes, restore it",
      cancelButtonText: "Cancel"
    });

    if (!confirm) return;

    setRestoreLoading(true);
    try {
      const fileReader = new FileReader();
      fileReader.onload = async (e) => {
        try {
          const backup = JSON.parse(e.target?.result as string);
          if (!backup || !backup.collections) {
            throw new Error("Invalid backup file format.");
          }

          const cols = backup.collections;

          // 1. Restore standard flat collections
          for (const colName of Object.keys(cols)) {
            if (colName === "companies" || colName === "chats") continue;
            
            const docs = cols[colName];
            if (!Array.isArray(docs)) continue;

            for (const d of docs) {
              if (colName === "users") {
                const existingSnap = await getDoc(doc(db, "users", d.id));
                if (existingSnap.exists() && (existingSnap.data().role === "platform_admin" || existingSnap.data().role === "master")) {
                  continue; // Skip overwriting platform_admin
                }
              }
              await setDoc(doc(db, colName, d.id), d.data);
            }
          }

          // 2. Restore chats & messages
          if (Array.isArray(cols.chats)) {
            for (const chat of cols.chats) {
              const chatId = chat.id;
              await setDoc(doc(db, "chats", chatId), chat.data);
              if (Array.isArray(chat.messages)) {
                for (const msg of chat.messages) {
                  await setDoc(doc(db, `chats/${chatId}/messages`, msg.id), msg.data);
                }
              }
            }
          }

          // 3. Restore companies & subcollections
          if (Array.isArray(cols.companies)) {
            for (const comp of cols.companies) {
              const companyId = comp.id;
              await setDoc(doc(db, "companies", companyId), comp.data);

              if (Array.isArray(comp.talentTypes)) {
                for (const tt of comp.talentTypes) {
                  await setDoc(doc(db, `companies/${companyId}/talentTypes`, tt.id), tt.data);
                }
              }

              if (Array.isArray(comp.genders)) {
                for (const g of comp.genders) {
                  await setDoc(doc(db, `companies/${companyId}/genders`, g.id), g.data);
                }
              }

              if (Array.isArray(comp.settings)) {
                for (const s of comp.settings) {
                  await setDoc(doc(db, `companies/${companyId}/settings`, s.id), s.data);
                }
              }

              if (Array.isArray(comp.subscriptionPayments)) {
                for (const sp of comp.subscriptionPayments) {
                  await setDoc(doc(db, `companies/${companyId}/subscriptionPayments`, sp.id), sp.data);
                }
              }

              if (Array.isArray(comp.locations)) {
                for (const loc of comp.locations) {
                  await setDoc(doc(db, `companies/${companyId}/locations`, loc.id), loc.data);
                  if (Array.isArray(loc.cities)) {
                    for (const city of loc.cities) {
                      await setDoc(doc(db, `companies/${companyId}/locations/${loc.id}/cities`, city.id), city.data);
                    }
                  }
                }
              }
            }
          }

          showSuccess("Database restored successfully!");
          setRestoreFile(null);
        } catch (parseErr: any) {
          console.error(parseErr);
          showError("Failed to parse backup file: " + parseErr.message);
        } finally {
          setRestoreLoading(false);
        }
      };
      fileReader.readAsText(restoreFile);
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Failed to initiate database restore.");
      setRestoreLoading(false);
    }
  };

  const handleResetData = async (all = false) => {
    const activeOptions = all 
      ? Object.keys(resetOptions).reduce((acc: any, key) => { acc[key] = true; return acc; }, {})
      : resetOptions;

    const selectedKeys = Object.keys(activeOptions).filter(k => activeOptions[k]);
    if (selectedKeys.length === 0) {
      showError("Please select at least one collection to delete.");
      return;
    }

    const confirm = await confirmAction({
      title: "Dangerous Operation!",
      text: all 
        ? "Are you absolutely sure you want to delete ALL data from the database? This will clear bookings, talents, companies, users, chats, etc. Platform admin accounts and plans will be preserved."
        : `Are you sure you want to delete data for the selected sections: ${selectedKeys.join(", ")}?`,
      icon: "warning",
      confirmButtonText: "Yes, delete permanently",
      cancelButtonText: "Cancel"
    });

    if (!confirm) return;

    setResetLoading(true);
    try {
      // 1. Delete Bookings
      if (activeOptions.bookings) {
        await deleteFlatCollection("bookings");
      }

      // 2. Delete Chats & Messages
      if (activeOptions.chats) {
        const chatsSnap = await getDocs(collection(db, "chats"));
        for (const chatDoc of chatsSnap.docs) {
          const chatId = chatDoc.id;
          const msgSnap = await getDocs(collection(db, `chats/${chatId}/messages`));
          const msgBatch = writeBatch(db);
          msgSnap.forEach(d => msgBatch.delete(d.ref));
          await msgBatch.commit();
          await deleteDoc(doc(db, "chats", chatId));
        }
      }

      // 3. Delete Ratings
      if (activeOptions.ratings) {
        await deleteFlatCollection("client_internal_ratings");
      }

      // 4. Delete Companies & Company Data
      if (activeOptions.companies) {
        // Collect all company user UIDs to delete from Firebase Auth
        const usersSnap = await getDocs(collection(db, "users"));
        const companyUserUids: string[] = [];
        usersSnap.forEach((d) => {
          const data = d.data();
          if (data.role === "platform_admin" || data.role === "master") {
            return;
          }
          if (data.companyId && data.companyId !== "master") {
            companyUserUids.push(d.id);
          }
        });

        if (companyUserUids.length > 0) {
          const token = await auth.currentUser?.getIdToken();
          if (token) {
            await fetch("/api/master/delete-auth-users", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify({ uids: companyUserUids })
            });
          }

          // Delete these user documents from Firestore users
          const uBatch = writeBatch(db);
          companyUserUids.forEach((uid) => {
            uBatch.delete(doc(db, "users", uid));
          });
          await uBatch.commit();
        }

        const companiesSnap = await getDocs(collection(db, "companies"));
        for (const companyDoc of companiesSnap.docs) {
          const companyId = companyDoc.id;

          const ttSnap = await getDocs(collection(db, `companies/${companyId}/talentTypes`));
          const ttBatch = writeBatch(db);
          ttSnap.forEach(d => ttBatch.delete(d.ref));
          await ttBatch.commit();

          const gSnap = await getDocs(collection(db, `companies/${companyId}/genders`));
          const gBatch = writeBatch(db);
          gSnap.forEach(d => gBatch.delete(d.ref));
          await gBatch.commit();

          const locSnap = await getDocs(collection(db, `companies/${companyId}/locations`));
          for (const locDoc of locSnap.docs) {
            const stateId = locDoc.id;
            const citySnap = await getDocs(collection(db, `companies/${companyId}/locations/${stateId}/cities`));
            const cityBatch = writeBatch(db);
            citySnap.forEach(d => cityBatch.delete(d.ref));
            await cityBatch.commit();
          }
          const locBatch = writeBatch(db);
          locSnap.forEach(d => locBatch.delete(d.ref));
          await locBatch.commit();

          const sSnap = await getDocs(collection(db, `companies/${companyId}/settings`));
          const sBatch = writeBatch(db);
          sSnap.forEach(d => sBatch.delete(d.ref));
          await sBatch.commit();

          const subPaySnap = await getDocs(collection(db, `companies/${companyId}/subscriptionPayments`));
          const subPayBatch = writeBatch(db);
          subPaySnap.forEach(d => subPayBatch.delete(d.ref));
          await subPayBatch.commit();

          await deleteDoc(doc(db, "companies", companyId));
        }
        await deleteFlatCollection("company_stripe_keys");
      }

      // 5. Delete Talents
      if (activeOptions.talents) {
        const talentsSnap = await getDocs(collection(db, "talents"));
        const talentUids: string[] = [];
        talentsSnap.forEach((d) => {
          talentUids.push(d.id);
        });

        if (talentUids.length > 0) {
          const token = await auth.currentUser?.getIdToken();
          if (token) {
            await fetch("/api/master/delete-auth-users", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify({ uids: talentUids })
            });
          }

          const batch = writeBatch(db);
          talentUids.forEach((uid) => {
            batch.delete(doc(db, "talents", uid));
            batch.delete(doc(db, "users", uid));
          });
          await batch.commit();
        }
      }

      // 6. Delete Users (except platform_admin)
      if (activeOptions.users) {
        const querySnapshot = await getDocs(collection(db, "users"));
        const uidsToDelete: string[] = [];
        querySnapshot.forEach((d) => {
          const data = d.data();
          if (data.role === "platform_admin" || data.role === "master") {
            return; // Skip platform admins
          }
          uidsToDelete.push(d.id);
        });

        if (uidsToDelete.length > 0) {
          const token = await auth.currentUser?.getIdToken();
          if (token) {
            await fetch("/api/master/delete-auth-users", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify({ uids: uidsToDelete })
            });
          }

          const batch = writeBatch(db);
          uidsToDelete.forEach((uid) => {
            batch.delete(doc(db, "users", uid));
            batch.delete(doc(db, "talents", uid));
          });
          await batch.commit();
        }
      }

      // 7. Delete Reviews
      if (activeOptions.reviews) {
        await deleteFlatCollection("reviews");
      }

      // 8. Delete Support Tickets
      if (activeOptions.support_tickets) {
        await deleteFlatCollection("support_tickets");
      }

      // 9. Delete Activity Logs
      if (activeOptions.talent_activity_logs) {
        await deleteFlatCollection("talent_activity_logs");
      }

      // 10. Delete Notes
      if (activeOptions.notes) {
        await deleteFlatCollection("notes");
      }

      // 11. Delete Notifications
      if (activeOptions.notifications) {
        await deleteFlatCollection("notifications");
      }

      // 12. Delete Pending profile updates
      if (activeOptions.pending_updates) {
        await deleteFlatCollection("pending_profile_updates");
      }

      showSuccess("Data cleared successfully!");
      setResetOptions({
        bookings: false,
        chats: false,
        ratings: false,
        companies: false,
        talents: false,
        users: false,
        reviews: false,
        support_tickets: false,
        talent_activity_logs: false,
        notes: false,
        notifications: false,
        pending_updates: false
      });
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Failed to clear database data.");
    } finally {
      setResetLoading(false);
    }
  };

  const deleteFlatCollection = async (colName: string) => {
    const snap = await getDocs(collection(db, colName));
    const batch = writeBatch(db);
    let count = 0;
    snap.forEach((d) => {
      batch.delete(d.ref);
      count++;
    });
    if (count > 0) {
      await batch.commit();
    }
  };

  if (permissionsLoading || loading) {
    return (
      <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm font-medium">Loading settings...</span>
      </div>
    );
  }

  if (!hasPermission("manage_settings")) {
    return (
      <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
        <Settings className="w-12 h-12 text-slate-200" />
        <h2 className="text-lg font-bold text-[#1e1b4b]">Access Denied</h2>
        <p className="text-sm">You do not have permission to manage platform settings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-[26px] font-extrabold text-[#1e1b4b] tracking-tight">Platform Settings</h1>
          <p className="text-slate-500 font-medium text-sm mt-0.5">Manage global configuration and database utilities for Talentum.</p>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex bg-slate-100 p-1 rounded-xl shrink-0 self-start sm:self-center">
          <button 
            onClick={() => setActiveTab("general")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'general' ? 'bg-white text-indigo-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <Settings className="w-3.5 h-3.5" />
            General Settings
          </button>
          <button 
            onClick={() => setActiveTab("database")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'database' ? 'bg-white text-indigo-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <Database className="w-3.5 h-3.5" />
            Database & Reset
          </button>
        </div>
      </div>

      {activeTab === "general" ? (
        <>
          {/* Localization Card */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)] overflow-hidden">
            {/* Section Header */}
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Globe className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-[16px] font-bold text-[#1e1b4b]">Localization</h2>
                <p className="text-[13px] text-slate-500">Set the default timezone for the entire platform.</p>
              </div>
            </div>

            {/* Section Body */}
            <div className="p-7 max-w-lg">
              <label className="text-sm font-bold text-slate-700 block mb-2">Platform Timezone</label>
              <p className="text-[13px] text-slate-500 mb-4 leading-relaxed">
                This timezone will be used as the default for all dates and times displayed across the master admin, company portals, and talent dashboards unless a user overrides it.
              </p>
              
              <select 
                value={timezone} 
                onChange={e => setTimezone(e.target.value)}
                className="w-full h-11 px-4 border border-slate-200 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Troubleshooting Resend Card */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)] overflow-hidden">
            {/* Section Header */}
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Settings className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-[16px] font-bold text-[#1e1b4b]">Troubleshooting & Diagnostics</h2>
                <p className="text-[13px] text-slate-500">Test platform mail delivery using Resend API.</p>
              </div>
            </div>

            {/* Section Body */}
            <div className="p-7 space-y-6">
              <div className="max-w-xl">
                <h3 className="text-sm font-bold text-slate-700 mb-1">Resend API Connection Test</h3>
                <p className="text-[13px] text-slate-500 mb-4 leading-relaxed">
                  Verify if the server can successfully connect to the Resend API and deliver outbound emails. This helps identify if your <code>RESEND_API_KEY</code> is properly configured in environment variables.
                </p>

                <form onSubmit={handleSendTestEmail} className="flex gap-3">
                  <Input
                    type="email"
                    placeholder="Enter recipient email (e.g. test@gmail.com)"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    required
                    className="h-11 rounded-xl border-slate-200 focus:border-indigo-500 text-sm font-medium"
                  />
                  <Button
                    type="submit"
                    disabled={testLoading || !testEmail.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 px-6 rounded-xl shrink-0"
                  >
                    {testLoading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</>
                    ) : (
                      "Send Test Email"
                    )}
                  </Button>
                </form>
              </div>

              {/* Test results box */}
              {testResult && (
                <div className="max-w-xl rounded-2xl border p-5 animate-in fade-in slide-in-from-top-2 duration-300">
                  {testResult.success ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                        <span>✓ Resend connection successful</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-normal">{testResult.message}</p>
                      {testResult.details && (
                        <div className="bg-slate-50 rounded-xl p-3 text-[11px] font-mono text-slate-600 space-y-1">
                          <p><b>Mailer:</b> {testResult.details.mailer}</p>
                          <p><b>Sender:</b> {testResult.details.from}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                        <span>✗ Resend API test failed</span>
                      </div>
                      <p className="text-xs text-red-600 font-semibold leading-normal bg-red-50/50 border border-red-100 p-3 rounded-xl">
                        {testResult.error}
                      </p>
                      {testResult.details && (
                        <div className="bg-slate-50 rounded-xl p-3 text-[11px] font-mono text-slate-600 space-y-1 overflow-x-auto max-h-[160px] scrollbar-thin">
                          <p className="font-semibold text-slate-700">Diagnostic Details:</p>
                          <p><b>Config Sender:</b> {testResult.details.config?.from}</p>
                          <p><b>Config Mailer:</b> {testResult.details.config?.mailer}</p>
                        </div>
                      )}
                      <p className="text-[11px] text-slate-500 leading-normal">
                        💡 <b>Tip:</b> Make sure your <code>RESEND_API_KEY</code> and <code>RESEND_FROM</code> are properly configured in <code>.env.local</code> and domain verification on Resend dashboard is complete.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* SMS Diagnostics Card */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)] overflow-hidden">
            {/* Section Header */}
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h2 className="text-[16px] font-bold text-[#1e1b4b]">SMS Delivery Test</h2>
                <p className="text-[13px] text-slate-500">Test platform SMS delivery using Twilio credentials.</p>
              </div>
            </div>

            {/* Section Body */}
            <div className="p-7 space-y-6">
              <div className="max-w-xl">
                <h3 className="text-sm font-bold text-slate-700 mb-1">Twilio SMS Connection Test</h3>
                <p className="text-[13px] text-slate-500 mb-4 leading-relaxed">
                  Verify if the server can successfully connect to Twilio and deliver outbound SMS messages. This helps confirm that your <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>, and <code>TWILIO_PHONE_NUMBER</code> are properly configured.
                </p>

                <form onSubmit={handleSendTestSms} className="flex gap-3">
                  <Input
                    type="tel"
                    placeholder="Enter phone number (e.g. +15551234567)"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    required
                    className="h-11 rounded-xl border-slate-200 focus:border-teal-500 text-sm font-medium"
                  />
                  <Button
                    type="submit"
                    disabled={testSmsLoading || !testPhone.trim()}
                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold h-11 px-6 rounded-xl shrink-0"
                  >
                    {testSmsLoading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testing...</>
                    ) : (
                      "Send Test SMS"
                    )}
                  </Button>
                </form>
              </div>

              {/* SMS Test results box */}
              {testSmsResult && (
                <div className="max-w-xl rounded-2xl border p-5 animate-in fade-in slide-in-from-top-2 duration-300">
                  {testSmsResult.success ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                        <span>✓ Twilio SMS sent successfully</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-normal">{testSmsResult.message}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-red-650 font-bold text-sm">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                        <span>✗ Twilio SMS test failed</span>
                      </div>
                      <p className="text-xs text-red-600 font-semibold leading-normal bg-red-50/50 border border-red-100 p-3 rounded-xl">
                        {testSmsResult.error}
                      </p>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        💡 <b>Tip:</b> Make sure your <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>, and <code>TWILIO_PHONE_NUMBER</code> are correctly set in <code>.env.local</code>. Phone numbers must be in E.164 format (e.g. +15551234567).
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Global Action Footer */}
          <div className="flex items-center gap-4 bg-white p-5 rounded-[24px] border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)]">
            <Button 
              onClick={saveSettings} 
              disabled={saving} 
              className="bg-[#1e1b4b] hover:bg-[#312e81] text-white font-bold h-11 px-8 rounded-xl shadow-sm"
            >
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Settings"}
            </Button>
            
            {saved && (
              <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-600 animate-in fade-in slide-in-from-left-2">
                <CheckCircle className="w-4 h-4" /> Saved successfully
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {/* Backup & Restore Card */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Database className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-[16px] font-bold text-[#1e1b4b]">Backup & Restore</h2>
                <p className="text-[13px] text-slate-500">Export whole database snapshot or restore it from a file.</p>
              </div>
            </div>
            
            <div className="p-7 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Backup */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-700">Export Backup</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">
                  Download a full backup of your entire platform database (bookings, companies, talents, users, reviews, support tickets, settings) as a timestamped JSON file.
                </p>
                <Button 
                  onClick={handleExportBackup} 
                  disabled={backupLoading} 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 px-6 rounded-xl flex items-center gap-2 shadow-sm"
                >
                  {backupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Export Whole Database Backup
                </Button>
              </div>

              {/* Restore */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 md:pl-8">
                <h3 className="text-sm font-bold text-slate-700">Restore Backup</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">
                  Select a previously exported JSON backup file to restore database state. Existing documents will be overwritten.
                </p>
                <div className="flex flex-col gap-3">
                  <input 
                    type="file" 
                    accept=".json"
                    onChange={e => setRestoreFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  />
                  <Button 
                    onClick={handleRestoreBackup} 
                    disabled={restoreLoading || !restoreFile} 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-6 rounded-xl flex items-center gap-2 shadow-sm self-start"
                  >
                    {restoreLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                    Restore Database from Backup
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Database Reset Card */}
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-[16px] font-bold text-[#1e1b4b]">Danger Zone: Reset Database</h2>
                <p className="text-[13px] text-slate-500">Delete specific data collections or clear the whole database.</p>
              </div>
            </div>
            
            <div className="p-7 space-y-6">
              <div className="bg-red-50/50 border border-red-100 p-4 rounded-2xl flex gap-3 text-red-800">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs font-semibold leading-relaxed">
                  <p className="font-bold">Warning: These operations are extremely dangerous and cannot be undone.</p>
                  <p className="mt-1">Subscription plans, platform settings, platform roles, and platform administrator accounts are always preserved to prevent lockouts.</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-4">Choose Collections to Reset</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.keys(resetOptions).map((key) => {
                    const label = key === "pending_updates" 
                      ? "Pending Updates" 
                      : key.charAt(0).toUpperCase() + key.slice(1).replace("_", " ");
                    return (
                      <label key={key} className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer select-none">
                        <input 
                          type="checkbox"
                          checked={(resetOptions as any)[key]}
                          onChange={(e) => setResetOptions(prev => ({ ...prev, [key]: e.target.checked }))}
                          className="w-4.5 h-4.5 rounded text-red-650 border-slate-300 focus:ring-red-500/20"
                        />
                        <span className="text-xs font-semibold text-slate-700 capitalize">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 flex flex-wrap gap-4 items-center justify-between border-t border-slate-100">
                <div className="flex gap-3">
                  <Button 
                    onClick={() => handleResetData(false)}
                    disabled={resetLoading}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold h-11 px-6 rounded-xl flex items-center gap-2 shadow-sm"
                  >
                    {resetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete Selected Data
                  </Button>

                  <Button 
                    onClick={() => handleResetData(true)}
                    disabled={resetLoading}
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50 font-bold h-11 px-6 rounded-xl flex items-center gap-2"
                  >
                    Clear All Database Data
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
