"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { db, firebaseConfig } from "@/lib/firebase";
import {
  collection, getDocs, doc, updateDoc, setDoc, serverTimestamp, query, where, deleteDoc,
  Timestamp, addDoc, orderBy
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Building2, Plus, Loader2, CheckCircle, XCircle, AlertOctagon,
  X, Search, RefreshCw, Mail, Lock, User, ChevronRight,
  ExternalLink, Users, Settings, Upload, Phone, Calendar,
  ChevronLeft, UserPlus, Edit2, Trash2, ArrowLeft, Briefcase,
  CreditCard, DollarSign, Star, FileText, MapPin, Activity, Check, AlertCircle, UserCircle, Clock
} from "lucide-react";
import { usePlatformPermissions } from "@/hooks/usePlatformPermissions";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notifications";
import { EntityNotes } from "@/components/notes/EntityNotes";
import { BookingDetailsModal, ActivityHistoryModal } from "@/components/bookings/AdminBookingModals";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";
import { useAuth } from "@/context/AuthContext";
import Swal from "sweetalert2";

interface Company {
  id: string; name: string; adminEmail?: string; status?: string;
  createdAt?: any; contactPerson?: string; contactPhone?: string;
  contactEmail?: string; logoUrl?: string;
  brandColor?: string; brandSecondary?: string;
  selectedPlan?: string;
  planId?: string;
  planLimits?: {
    maxAdmins: number;
    maxStaff: number;
    maxTalents: number;
    maxBookings: number;
    customBranding: boolean;
  };
  trialEndDate?: any;
  customPrice?: number | null;
  customPricePeriod?: "month" | "year" | "lifetime" | null;
  customPriceEndDate?: any;
  subscriptionStatus?: string;
  nextPaymentDate?: any;
}
interface SubscriptionPayment {
  id: string;
  amount: number;
  status: "Paid" | "Pending" | "Failed";
  billingPeriod: string;
  paymentMethod: string;
  paidAt?: any;
  createdAt: any;
}
interface CompanyUser { id: string; name: string; email: string; role: string; status?: string; }

const ITEMS_PER_PAGE = 6;

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-100",
  disabled: "bg-amber-50 text-amber-700 border-amber-100",
  blacklisted: "bg-red-50 text-red-700 border-red-100",
};

function StatusBadge({ status }: { status?: string }) {
  const s = status || "active";
  const icons: Record<string, React.ReactNode> = {
    active: <CheckCircle className="w-3.5 h-3.5" />,
    disabled: <XCircle className="w-3.5 h-3.5" />,
    blacklisted: <AlertOctagon className="w-3.5 h-3.5" />,
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 rounded-full border capitalize ${STATUS_STYLES[s] || STATUS_STYLES.active}`}>
      {icons[s]} {s}
    </span>
  );
}

function formatDate(ts: any): string {
  if (!ts) return "—";
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

const PLAN_DEFAULTS = {
  starter: {
    name: "Starter",
    price: 49,
    limits: { maxAdmins: 1, maxStaff: 1, maxTalents: 25, maxBookings: 50, customBranding: true }
  },
  professional: {
    name: "Professional",
    price: 99,
    limits: { maxAdmins: 1, maxStaff: 3, maxTalents: 50, maxBookings: 100, customBranding: true }
  },
  enterprise: {
    name: "Enterprise",
    price: 199,
    limits: { maxAdmins: 1, maxStaff: -1, maxTalents: -1, maxBookings: -1, customBranding: true }
  }
};

function getSubscriptionBadge(company: Company) {
  const plan = company.selectedPlan || "starter";
  const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
  
  const isActive = company.subscriptionStatus === "active";
  
  let trialDaysLeft = 0;
  let isTrialActive = false;
  let isTrialExpired = false;
  
  if (!isActive && company.trialEndDate) {
    const end = company.trialEndDate.toDate ? company.trialEndDate.toDate() : new Date(company.trialEndDate);
    const diff = end.getTime() - Date.now();
    if (diff > 0) {
      isTrialActive = true;
      trialDaysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
    } else {
      isTrialExpired = true;
    }
  }

  return {
    planName,
    isTrialActive,
    isTrialExpired,
    trialDaysLeft,
    isActive
  };
}

// ── Company Drawer ──────────────────// ── Company Inspector (Full-Page tabbed workspace) ─────────────────────────────
function CompanyInspector({ company, onClose, onUpdate }: {
  company: Company; onClose: () => void; onUpdate: (c: Company) => void;
}) {
  const { hasPermission } = usePlatformPermissions();
  const { user } = useAuth();
  const [tab, setTab] = useState<"overview" | "settings" | "users" | "clients" | "talents" | "bookings" | "payments" | "subscription" | "notes">("overview");
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [chatBooking, setChatBooking] = useState<any | null>(null);

  // Overview states
  const [editName, setEditName] = useState(company.name);
  const [editContact, setEditContact] = useState(company.contactPerson || "");
  const [editPhone, setEditPhone] = useState(company.contactPhone || "");
  const [editContactEmail, setEditContactEmail] = useState(company.contactEmail || "");
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState(company.logoUrl || "");
  const [uploading, setUploading] = useState(false);
  const [editBrandColor, setEditBrandColor] = useState(company.brandColor || "#5046E5");
  const [editBrandSecondary, setEditBrandSecondary] = useState(company.brandSecondary || "#3730A3");

  // Users states
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "staff">("staff");
  const [creating, setCreating] = useState(false);
  const [userErr, setUserErr] = useState("");
  const [editingUser, setEditingUser] = useState<CompanyUser | null>(null);
  const [userEditName, setUserEditName] = useState("");
  const [userEditRole, setUserEditRole] = useState<"admin" | "staff">("staff");
  const [editSaving, setEditSaving] = useState(false);
  const [userEditErr, setUserEditErr] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Clients state
  const [clients, setClients] = useState<any[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [clientRatings, setClientRatings] = useState<Record<string, any>>({});
  const [clientModalTab, setClientModalTab] = useState<"notes" | "bookings">("notes");
  const [updatingClientStatus, setUpdatingClientStatus] = useState(false);
  const [clientBookingFilter, setClientBookingFilter] = useState<"all" | "active" | "completed" | "cancelled">("all");
  const [clientBookingPage, setClientBookingPage] = useState(1);

  // Talents state
  const [talents, setTalents] = useState<any[]>([]);
  const [talentsLoading, setTalentsLoading] = useState(false);
  const [talentSearch, setTalentSearch] = useState("");
  const [talentPage, setTalentPage] = useState(1);
  const [selectedTalent, setSelectedTalent] = useState<any | null>(null);
  const [showTalentNotesModal, setShowTalentNotesModal] = useState(false);

  // Bookings state
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingPage, setBookingPage] = useState(1);
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [bookingJobFilter, setBookingJobFilter] = useState("all");
  const [bookingStartDate, setBookingStartDate] = useState("");
  const [bookingEndDate, setBookingEndDate] = useState("");

  // Reset booking page when filters change
  useEffect(() => {
    setBookingPage(1);
  }, [bookingSearch, bookingStatusFilter, bookingJobFilter, bookingStartDate, bookingEndDate]);

  const talentsDict = useMemo(() => {
    const dict: Record<string, any> = {};
    talents.forEach((t) => {
      dict[t.id] = t;
    });
    return dict;
  }, [talents]);

  // Payments state
  const [payments, setPayments] = useState<any[]>([]); // manual pending approvals
  const [stripeBookings, setStripeBookings] = useState<any[]>([]);
  const [stripeTips, setStripeTips] = useState<any[]>([]);
  const [paymentsSubTab, setPaymentsSubTab] = useState<"pending" | "stripe_bookings" | "stripe_tips">("pending");
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null);
  const [declineBookingId, setDeclineBookingId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);

  // Subscription States
  const [subPayments, setSubPayments] = useState<SubscriptionPayment[]>([]);
  const [subPaymentsLoading, setSubPaymentsLoading] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [dynamicPlans, setDynamicPlans] = useState<Record<string, { name: string; price: number }>>(PLAN_DEFAULTS);
  
  // Record Payment fields
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payPeriod, setPayPeriod] = useState("");
  const [payMethod, setPayMethod] = useState("Stripe");
  const [payStatus, setPayStatus] = useState<"Paid" | "Pending" | "Failed">("Paid");
  const [payDate, setPayDate] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Extend Trial / Update Plan states
  const [extendDays, setExtendDays] = useState(7);
  const [extendingTrial, setExtendingTrial] = useState(false);
  const [updatingPlan, setUpdatingPlan] = useState(false);

  // Custom Price / Discount States
  const [showCustomPriceModal, setShowCustomPriceModal] = useState(false);
  const [customPriceVal, setCustomPriceVal] = useState<number>(0);
  const [customPriceInterval, setCustomPriceInterval] = useState<"month" | "year">("month");
  const [customPriceValidity, setCustomPriceValidity] = useState<"limited" | "lifetime">("limited");
  const [customPriceDurVal, setCustomPriceDurVal] = useState<number>(6);
  const [savingCustomPrice, setSavingCustomPrice] = useState(false);

  const isCustomPriceActive = useCallback((comp: Company) => {
    if (comp.customPrice === undefined || comp.customPrice === null) return false;
    if (!comp.customPriceEndDate) return true; // lifetime
    const end = comp.customPriceEndDate.toDate ? comp.customPriceEndDate.toDate() : new Date(comp.customPriceEndDate);
    return end.getTime() > Date.now();
  }, []);

  const handleSetCustomPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (customPriceVal < 0) {
      showError("Price cannot be negative.");
      return;
    }
    setSavingCustomPrice(true);
    try {
      let endDate: Timestamp | null = null;
      if (customPriceValidity === "limited") {
        const d = new Date();
        if (customPriceInterval === "month") {
          d.setMonth(d.getMonth() + customPriceDurVal);
        } else {
          d.setFullYear(d.getFullYear() + customPriceDurVal);
        }
        endDate = Timestamp.fromDate(d);
      }

      const updates = {
        customPrice: Number(customPriceVal),
        customPricePeriod: customPriceInterval,
        customPriceEndDate: endDate
      };

      await updateDoc(doc(db, "companies", company.id), updates);
      onUpdate({
        ...company,
        ...updates
      });
      setShowCustomPriceModal(false);
      showSuccess("Custom price / discount applied successfully!");

      // Trigger email/notification
      await sendNotificationToAdmins(company.id, {
        title: "Special Pricing Offer Applied!",
        message: `A custom rate of $${customPriceVal}/${customPriceInterval} has been applied to your company workspace. Valid: ${endDate ? `until ${endDate.toDate().toLocaleDateString("en-GB")}` : "Lifetime"}.`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      showError("Failed to apply custom price.");
    } finally {
      setSavingCustomPrice(false);
    }
  };

  const handleRemoveCustomPrice = async () => {
    if (!(await confirmAction("Are you sure you want to remove the custom price / discount offer? The default plan price will apply."))) return;
    try {
      const updates = {
        customPrice: null,
        customPricePeriod: null,
        customPriceEndDate: null
      };
      await updateDoc(doc(db, "companies", company.id), updates);
      onUpdate({
        ...company,
        customPrice: undefined,
        customPricePeriod: undefined,
        customPriceEndDate: undefined
      });
      showSuccess("Custom price offer removed.");

      // Trigger email/notification
      await sendNotificationToAdmins(company.id, {
        title: "Pricing Offer Removed",
        message: `Your custom price offer has been removed. Your workspace subscription has reverted to standard plan rates.`,
        type: "info"
      });
    } catch (err) {
      console.error(err);
      showError("Failed to remove custom price.");
    }
  };

  const loadSubscriptionPayments = async () => {
    setSubPaymentsLoading(true);
    try {
      const q = query(
        collection(db, "companies", company.id, "subscriptionPayments"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const list: SubscriptionPayment[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as SubscriptionPayment);
      });
      setSubPayments(list);
    } catch (err) {
      console.error("Failed to load subscription payments:", err);
    } finally {
      setSubPaymentsLoading(false);
    }
  };

  const handleExtendTrial = async (days: number) => {
    setExtendingTrial(true);
    try {
      const isActive = company.subscriptionStatus === "active";
      if (isActive) {
        let currentEnd = company.nextPaymentDate
          ? (company.nextPaymentDate.toDate ? company.nextPaymentDate.toDate() : new Date(company.nextPaymentDate))
          : null;
        if (!currentEnd && company.trialEndDate) {
          const trialEnd = company.trialEndDate.toDate ? company.trialEndDate.toDate() : new Date(company.trialEndDate);
          const next = new Date(trialEnd);
          next.setMonth(next.getMonth() + 1);
          currentEnd = next;
        }
        if (!currentEnd) currentEnd = new Date();

        const newEnd = new Date(Math.max(currentEnd.getTime(), Date.now()) + days * 24 * 60 * 60 * 1000);
        const newTimestamp = Timestamp.fromDate(newEnd);

        await updateDoc(doc(db, "companies", company.id), {
          nextPaymentDate: newTimestamp
        });

        onUpdate({
          ...company,
          nextPaymentDate: newTimestamp
        });
        showSuccess(`Subscription extended by ${days} days!`);

        // Trigger email/notification
        await sendNotificationToAdmins(company.id, {
          title: "Subscription Extended!",
          message: `Your active subscription period has been extended by ${days} days by the super administrator. Next billing date: ${newEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.`,
          type: "success"
        });
      } else {
        const currentEnd = company.trialEndDate
          ? (company.trialEndDate.toDate ? company.trialEndDate.toDate() : new Date(company.trialEndDate))
          : new Date();
        
        const newEnd = new Date(Math.max(currentEnd.getTime(), Date.now()) + days * 24 * 60 * 60 * 1000);
        const newTimestamp = Timestamp.fromDate(newEnd);

        await updateDoc(doc(db, "companies", company.id), {
          trialEndDate: newTimestamp,
          trialWarningSent: false
        });

        const updatedCompany = {
          ...company,
          trialEndDate: newTimestamp,
          trialWarningSent: false
        };
        
        onUpdate(updatedCompany);
        showSuccess(`Trial extended by ${days} days!`);

        // Trigger email/notification
        await sendNotificationToAdmins(company.id, {
          title: "Free Trial Extended!",
          message: `Good news! Your free trial period for company "${company.name}" has been extended. It is now valid until ${newEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.`,
          type: "success"
        });
      }
    } catch (err) {
      console.error(err);
      showError("Failed to extend period.");
    } finally {
      setExtendingTrial(false);
    }
  };

  const handleEndTrial = async () => {
    if (!(await confirmAction("Are you sure you want to end the free trial period for this company immediately?"))) return;
    setExtendingTrial(true);
    try {
      // Set trial end date to 1 second ago (or current time) to expire it
      const newEnd = new Date(Date.now() - 1000);
      const newTimestamp = Timestamp.fromDate(newEnd);

      await updateDoc(doc(db, "companies", company.id), {
        trialEndDate: newTimestamp
      });

      const updatedCompany = {
        ...company,
        trialEndDate: newTimestamp
      };
      
      onUpdate(updatedCompany);
      showSuccess(`Free trial period has been ended!`);

      // Trigger email/notification
      await sendNotificationToAdmins(company.id, {
        title: "Free Trial Period Ended",
        message: `Your free trial for "${company.name}" has been ended by the super administrator. Please subscribe to a paid plan to keep using all features.`,
        type: "alert"
      });
    } catch (err) {
      console.error(err);
      showError("Failed to end trial.");
    } finally {
      setExtendingTrial(false);
    }
  };

  const handleUpdatePlan = async (newPlanName: "starter" | "professional" | "enterprise") => {
    if (!(await confirmAction(`Are you sure you want to change this company's plan to ${newPlanName.toUpperCase()}?`))) return;
    setUpdatingPlan(true);
    try {
      const planInfo = PLAN_DEFAULTS[newPlanName];
      await updateDoc(doc(db, "companies", company.id), {
        selectedPlan: newPlanName,
        planId: `default-${newPlanName}`,
        planLimits: planInfo.limits
      });
      
      onUpdate({
        ...company,
        selectedPlan: newPlanName,
        planId: `default-${newPlanName}`,
        planLimits: planInfo.limits
      });
      showSuccess(`Subscription plan updated to ${newPlanName.toUpperCase()}!`);
    } catch (err) {
      console.error(err);
      showError("Failed to update plan.");
    } finally {
      setUpdatingPlan(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payPeriod.trim() || payAmount <= 0) {
      showError("Please fill out all payment fields.");
      return;
    }
    setRecordingPayment(true);
    try {
      const payload = {
        amount: Number(payAmount),
        billingPeriod: payPeriod,
        paymentMethod: payMethod,
        status: payStatus,
        paidAt: payDate ? Timestamp.fromDate(new Date(payDate)) : serverTimestamp(),
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(
        collection(db, "companies", company.id, "subscriptionPayments"),
        payload
      );

      const newPayment: SubscriptionPayment = {
        id: docRef.id,
        amount: payload.amount,
        billingPeriod: payload.billingPeriod,
        paymentMethod: payload.paymentMethod,
        status: payload.status,
        paidAt: payload.paidAt,
        createdAt: new Date()
      };

      setSubPayments(prev => [newPayment, ...prev]);
      setShowRecordPayment(false);
      setPayAmount(0);
      setPayPeriod("");
      showSuccess("Subscription payment recorded successfully!");

      // Trigger subscription payment received/failed email/notifications to company admins
      if (payStatus === "Paid") {
        await sendNotificationToAdmins(company.id, {
          title: "Subscription Payment Received",
          message: `Your subscription payment of $${payAmount} for the period "${payPeriod}" was successful. Thank you!`,
          type: "success"
        });
      } else if (payStatus === "Failed") {
        await sendNotificationToAdmins(company.id, {
          title: "Subscription Payment Failed",
          message: `Your subscription payment of $${payAmount} for the period "${payPeriod}" has failed. Please verify your payment methods to avoid service disruption.`,
          type: "alert"
        });
      }
    } catch (err) {
      console.error(err);
      showError("Failed to record payment.");
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!(await confirmAction("Are you sure you want to delete this payment record?"))) return;
    try {
      await deleteDoc(doc(db, "companies", company.id, "subscriptionPayments", paymentId));
      setSubPayments(prev => prev.filter(p => p.id !== paymentId));
      showSuccess("Payment record deleted.");
    } catch (err) {
      console.error(err);
      showError("Failed to delete payment record.");
    }
  };

  // Load effects depending on tab
  useEffect(() => {
    if (tab === "overview") {
      loadUsers();
      loadClients();
      loadTalents();
      loadBookings();
    }
    else if (tab === "users") loadUsers();
    else if (tab === "clients") {
      loadClients();
      loadBookings();
      loadTalents();
    }
    else if (tab === "talents") loadTalents();
    else if (tab === "bookings") {
      loadBookings();
      loadTalents();
    }
    else if (tab === "payments") loadPayments();
    else if (tab === "subscription") {
      loadSubscriptionPayments();
      // Fetch dynamic plan prices from Firestore
      (async () => {
        try {
          const { getDocs: _getDocs, collection: _col } = await import("firebase/firestore");
          const snap = await _getDocs(_col(db, "subscriptionPlans"));
          if (!snap.empty) {
            const dict: Record<string, { name: string; price: number }> = {};
            snap.forEach((d) => {
              const data = d.data();
              const key = (data.name || d.id).toLowerCase();
              dict[key] = { name: data.name || d.id, price: Number(data.price || 0) };
            });
            if (Object.keys(dict).length > 0) setDynamicPlans(dict);
          }
        } catch (e) {
          console.warn("Could not fetch subscription plans:", e);
        }
      })();
    }
  }, [tab, company.id]);

  useEffect(() => {
    if (selectedClient) {
      setClientBookingPage(1);
      setClientBookingFilter("all");
      setClientModalTab("notes");
    }
  }, [selectedClient]);

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const q = query(collection(db, "users"), where("companyId", "==", company.id));
      const snap = await getDocs(q);
      const list: CompanyUser[] = [];
      for (const d of snap.docs) {
        const u = d.data();
        let role = u.role;
        const isCompanyOwner = (d.id === (company as any).adminId || (u.email && company.adminEmail && u.email.toLowerCase() === company.adminEmail.toLowerCase()));
        if (isCompanyOwner && role !== "admin" && role !== "platform_admin") {
          try {
            await updateDoc(doc(db, "users", d.id), { role: "admin" });
            role = "admin";
          } catch (e) {
            console.warn("Failed auto-repairing admin role in Master Panel:", e);
          }
        }
        if (role === "admin" || role === "staff" || role === "company_admin") {
          list.push({ id: d.id, ...u, role } as CompanyUser);
        }
      }
      setUsers(list);
    } catch (err) {
      console.error(err);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); }
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return company.logoUrl || null;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", logoFile);
      formData.append("slug", company.id);
      const res = await fetch("/api/upload-logo", { method: "POST", body: formData });
      const data = await res.json();
      return data.url || null;
    } finally { setUploading(false); }
  };

  const saveInfo = async () => {
    setSaving(true);
    try {
      const logoUrl = await uploadLogo();
      const updates: any = { 
        name: editName, 
        contactPerson: editContact, 
        contactPhone: editPhone, 
        contactEmail: editContactEmail,
        brandColor: editBrandColor,
        brandSecondary: editBrandSecondary
      };
      if (logoUrl) updates.logoUrl = logoUrl;
      await updateDoc(doc(db, "companies", company.id), updates);
      const updated = { 
        ...company, 
        name: editName, 
        contactPerson: editContact, 
        contactPhone: editPhone, 
        contactEmail: editContactEmail, 
        brandColor: editBrandColor,
        brandSecondary: editBrandSecondary,
        ...(logoUrl ? { logoUrl } : {}) 
      };
      onUpdate(updated);
      showSuccess("Overview & branding updated successfully!");
    } catch (err) {
      console.error(err);
      showError("Failed to update company info.");
    } finally { setSaving(false); }
  };

  const updateStatus = async (status: string) => {
    try {
      await updateDoc(doc(db, "companies", company.id), { status });
      onUpdate({ ...company, status });
      showSuccess(`Operational status updated to ${status}.`);
    } catch (err) {
      console.error(err);
      showError("Failed to update status.");
    }
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true); setUserErr("");
    try {
      const appName = `co-${Date.now()}`;
      const secondary = initializeApp(firebaseConfig, appName);
      const secAuth = getAuth(secondary);
      try {
        const cred = await createUserWithEmailAndPassword(secAuth, newEmail, newPass);
        await setDoc(doc(db, "users", cred.user.uid), {
          name: newName, email: newEmail, role: newRole, companyId: company.id,
          status: "active", createdAt: serverTimestamp()
        });
        setUsers(prev => [...prev, { id: cred.user.uid, name: newName, email: newEmail, role: newRole, status: "active" }]);
        setNewName(""); setNewEmail(""); setNewPass(""); setNewRole("staff");
        showSuccess("User added successfully.");
      } finally { await deleteApp(secondary); }
    } catch (err: any) { setUserErr(err.message || "Failed."); }
    finally { setCreating(false); }
  };

  const toggleUser = async (uid: string, cur: string) => {
    const next = cur === "active" ? "disabled" : "active";
    try {
      await updateDoc(doc(db, "users", uid), { status: next });
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, status: next } : u));
      showSuccess(`User status changed to ${next}.`);
    } catch (err) {
      console.error(err);
      showError("Failed to toggle user status.");
    }
  };

  const saveEditUser = async () => {
    if (!editingUser) return;
    setEditSaving(true); setUserEditErr("");
    try {
      await updateDoc(doc(db, "users", editingUser.id), { name: userEditName, role: userEditRole });
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, name: userEditName, role: userEditRole } : u));
      setEditingUser(null);
      showSuccess("User details updated.");
    } catch (err: any) { setUserEditErr(err.message || "Failed to save."); }
    finally { setEditSaving(false); }
  };

  const deleteUser = async (uid: string) => {
    if (!(await confirmAction("Are you sure you want to delete this user? This cannot be undone."))) return;
    setDeletingId(uid);
    try {
      await deleteDoc(doc(db, "users", uid));
      setUsers(prev => prev.filter(u => u.id !== uid));
      showSuccess("User deleted.");
    } catch (err) {
      console.error(err);
      showError("Failed to delete user.");
    } finally { setDeletingId(null); }
  };

  const handleUserForgotPassword = async (userEmail: string) => {
    try {
      const confirm = await Swal.fire({
        title: "Send Reset Link?",
        text: `Are you sure you want to send a password reset email to ${userEmail}?`,
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "#4f46e5",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Yes, Send Link"
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({
        title: "Sending...",
        didOpen: () => { Swal.showLoading(); }
      });

      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, companyId: company.id }),
      });

      const data = await res.json();

      if (res.ok) {
        Swal.fire("Sent!", "Password reset link has been emailed successfully.", "success");
      } else {
        Swal.fire("Failed", data.error || "Failed to send reset email.", "error");
      }
    } catch (err: any) {
      Swal.fire("Error", err.message || "An error occurred.", "error");
    }
  };

  const handleUserChangePassword = async (uid: string, userEmail: string) => {
    try {
      const { value: newPassword } = await Swal.fire({
        title: "Change Password Directly",
        text: `Enter new password for ${userEmail} (minimum 6 characters):`,
        input: "password",
        inputAttributes: {
          autocapitalize: "off",
          autocorrect: "off"
        },
        showCancelButton: true,
        confirmButtonColor: "#4f46e5",
        cancelButtonColor: "#64748b",
        confirmButtonText: "Change Password",
        inputValidator: (value) => {
          if (!value) {
            return "You need to enter a password!";
          }
          if (value.length < 6) {
            return "Password must be at least 6 characters long!";
          }
        }
      });

      if (!newPassword) return;

      Swal.fire({
        title: "Updating...",
        didOpen: () => { Swal.showLoading(); }
      });

      const res = await fetch("/api/master/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, newPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        Swal.fire("Success!", "User's password has been updated in Firebase Auth directly.", "success");
      } else {
        Swal.fire("Failed", data.error || "Failed to update password.", "error");
      }
    } catch (err: any) {
      Swal.fire("Error", err.message || "An error occurred.", "error");
    }
  };

  // Client rating averages and detail loading
  const loadClients = async () => {
    setClientsLoading(true);
    try {
      const uSnap = await getDocs(query(collection(db, "users"), where("companyId", "==", company.id)));
      const list = uSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((u: any) => u.role === "client");
      
      const rSnap = await getDocs(query(collection(db, "client_internal_ratings"), where("companyId", "==", company.id)));
      const ratingGroups: Record<string, { punctuality: number[], communication: number[], reliability: number[] }> = {};
      rSnap.docs.forEach(doc => {
        const data = doc.data();
        const cid = data.clientId;
        if (!cid) return;
        if (!ratingGroups[cid]) {
          ratingGroups[cid] = { punctuality: [], communication: [], reliability: [] };
        }
        ratingGroups[cid].punctuality.push(Number(data.punctuality || 5));
        ratingGroups[cid].communication.push(Number(data.communication || 5));
        ratingGroups[cid].reliability.push(Number(data.reliability || 5));
      });

      const ratings: Record<string, any> = {};
      Object.entries(ratingGroups).forEach(([cid, metrics]) => {
        const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / arr.length;
        const pAvg = avg(metrics.punctuality);
        const cAvg = avg(metrics.communication);
        const rAvg = avg(metrics.reliability);
        const overall = (pAvg + cAvg + rAvg) / 3;
        ratings[cid] = {
          overall: Number(overall.toFixed(1)),
          punctuality: Number(pAvg.toFixed(1)),
          communication: Number(cAvg.toFixed(1)),
          reliability: Number(rAvg.toFixed(1)),
          count: metrics.punctuality.length
        };
      });

      setClients(list);
      setClientRatings(ratings);
    } catch (err) {
      console.error(err);
    } finally {
      setClientsLoading(false);
    }
  };

  const handleUpdateClientStatus = async (newStatus: string) => {
    if (!selectedClient) return;
    setUpdatingClientStatus(true);
    try {
      await updateDoc(doc(db, "users", selectedClient.id), { status: newStatus });
      setSelectedClient((prev: any) => prev ? { ...prev, status: newStatus } : null);
      setClients((prev: any[]) => prev.map((c: any) => c.id === selectedClient.id ? { ...c, status: newStatus } : c));
      showSuccess(`Client status updated to ${newStatus}.`);
    } catch (err: any) {
      showError("Failed to update client status: " + err.message);
    } finally {
      setUpdatingClientStatus(false);
    }
  };

  // Talent load
  const loadTalents = async () => {
    setTalentsLoading(true);
    try {
      const [usersSnap, talentsSnap] = await Promise.all([
        getDocs(query(collection(db, "users"), where("companyId", "==", company.id))),
        getDocs(query(collection(db, "talents"), where("companyId", "==", company.id)))
      ]);

      const talentDocs: Record<string, any> = {};
      talentsSnap.docs.forEach(d => { talentDocs[d.id] = { id: d.id, ...d.data() }; });

      const list = usersSnap.docs
        .filter(d => (d.data() as any).role === "talent")
        .map(d => {
          const userData = d.data() as any;
          const talentData = talentDocs[d.id] || {};
          return {
            ...userData,
            ...talentData,
            id: d.id,
            displayName: talentData.displayName || talentData.name || userData.name || userData.displayName || userData.email || "Unknown Talent",
            profileImage: talentData.photoUrl || talentData.profileImage || userData.photoUrl || userData.profileImage || null,
            locations: talentData.locations || userData.locations || (userData.city ? [userData.city] : []),
            talentType: talentData.categories || talentData.talentTypes || talentData.talentType || userData.talentType || "No Type",
          };
        });
      setTalents(list);
    } catch (err) {
      console.error(err);
    } finally {
      setTalentsLoading(false);
    }
  };

  // Booking load
  const loadBookings = async () => {
    setBookingsLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "bookings"), where("companyId", "==", company.id)));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setBookings(list);
    } catch (err) {
      console.error(err);
    } finally {
      setBookingsLoading(false);
    }
  };

  // Payment load & trigger actions
  const loadPayments = async () => {
    setPaymentsLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, "bookings"),
        where("companyId", "==", company.id)
      ));
      
      const manualPending: any[] = [];
      const stripeB: any[] = [];
      const stripeT: any[] = [];
      
      snap.forEach(d => {
        const data = { id: d.id, ...d.data() } as any;
        
        // 1. Manual Payments Awaiting Approval
        if (data.paymentStatus === "Awaiting Approval" && data.paymentReceiptUrl) {
          manualPending.push(data);
        }
        
        // 2. Stripe Booking Payments
        const isStripeBooking = data.paymentMethod?.toLowerCase() === "stripe" || 
                               data.paymentMethod?.toLowerCase() === "card" || 
                               data.paymentMethod?.toLowerCase() === "credit card" || 
                               !!data.stripePaymentIntentId;
        if (isStripeBooking && data.paymentStatus === "Paid") {
          stripeB.push(data);
        }
        
        // 3. Stripe Tip Payments
        const isStripeTip = data.tipPaymentMethod?.toLowerCase() === "stripe" || 
                           data.tipPaymentMethod?.toLowerCase() === "card" || 
                           data.tipPaymentMethod?.toLowerCase() === "credit card" || 
                           !!data.tipStripePaymentIntentId;
        if (isStripeTip && data.tipStatus === "Paid") {
          stripeT.push(data);
        }
      });
      
      // Sort manual approvals by receipt uploaded date or created date
      manualPending.sort((a: any, b: any) => new Date(b.receiptUploadedAt || b.createdAt || 0).getTime() - new Date(a.receiptUploadedAt || a.createdAt || 0).getTime());
      
      // Sort Stripe bookings by paid date or created date
      stripeB.sort((a: any, b: any) => new Date(b.paidAt || b.createdAt || 0).getTime() - new Date(a.paidAt || a.createdAt || 0).getTime());
      
      // Sort Stripe tips by tip paid date or paid date
      stripeT.sort((a: any, b: any) => new Date(b.tipPaidAt || b.paidAt || b.createdAt || 0).getTime() - new Date(a.tipPaidAt || a.paidAt || a.createdAt || 0).getTime());
      
      setPayments(manualPending);
      setStripeBookings(stripeB);
      setStripeTips(stripeT);
    } catch (err) {
      console.error("Failed to load company transactions:", err);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const handleApprovePayment = async (booking: any) => {
    setProcessingPaymentId(booking.id);
    try {
      await updateDoc(doc(db, "bookings", booking.id), {
        status: "Confirmed",
        paymentStatus: "Paid",
        paidAt: new Date().toISOString()
      });

      if (booking.clientId) {
        await sendNotification({
          companyId: company.id,
          userId: booking.clientId,
          recipientEmail: booking.clientEmail || "",
          title: "Payment Approved!",
          message: `Your manual payment via ${booking.paymentMethod} for booking #${booking.id.substring(0,8)} has been approved. Your booking is now Confirmed.`,
          type: "success",
          link: `/${company.id}/dashboard/client/bookings?tab=confirmed`
        });
      }

      showSuccess("Payment approved successfully!");
      setPayments(prev => prev.filter(b => b.id !== booking.id));
    } catch (err) {
      console.error(err);
      showError("Failed to approve payment.");
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleDeclinePayment = async () => {
    if (!declineBookingId) return;
    if (!declineReason.trim()) {
      showError("Please provide a reason for declining.");
      return;
    }
    setProcessingPaymentId(declineBookingId);
    try {
      const booking = payments.find(b => b.id === declineBookingId);
      await updateDoc(doc(db, "bookings", declineBookingId), {
        paymentStatus: "Declined",
        paymentDeclineReason: declineReason,
        paymentReceiptUrl: null,
        declinedAt: new Date().toISOString()
      });

      if (booking?.clientId) {
        await sendNotification({
          companyId: company.id,
          userId: booking.clientId,
          recipientEmail: booking.clientEmail || "",
          title: "Payment Declined",
          message: `Your manual payment for booking #${declineBookingId.substring(0,8)} was declined. Reason: ${declineReason}. Please try submitting payment again.`,
          type: "alert",
          link: `/${company.id}/dashboard/client/payment/${declineBookingId}`
        });
      }

      showSuccess("Payment declined successfully.");
      setPayments(prev => prev.filter(b => b.id !== declineBookingId));
      setDeclineBookingId(null);
      setDeclineReason("");
    } catch (err) {
      console.error(err);
      showError("Failed to decline payment.");
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleApprovePaymentFromModal = async (bookingToApprove: any) => {
    try {
      await updateDoc(doc(db, "bookings", bookingToApprove.id), {
        status: "Confirmed",
        paymentStatus: "Paid",
        paidAt: new Date().toISOString()
      });

      if (bookingToApprove.clientId) {
        await sendNotification({
          companyId: company.id,
          userId: bookingToApprove.clientId,
          recipientEmail: bookingToApprove.clientEmail || "",
          title: "Payment Approved!",
          message: `Your manual payment via ${bookingToApprove.paymentMethod} for booking #${bookingToApprove.id.substring(0,8)} has been approved. Your booking is now Confirmed.`,
          type: "success",
          link: `/${company.id}/dashboard/client/bookings?tab=confirmed`
        });
      }

      showSuccess("Payment approved successfully!");
      setBookings(prev => prev.map(b => b.id === bookingToApprove.id ? { ...b, status: "Confirmed", paymentStatus: "Paid", paidAt: new Date().toISOString() } : b));
      if (selectedBooking?.id === bookingToApprove.id) {
        setSelectedBooking((prev: any) => prev ? { ...prev, status: "Confirmed", paymentStatus: "Paid", paidAt: new Date().toISOString() } : null);
      }
      setPayments(prev => prev.filter(b => b.id !== bookingToApprove.id));
    } catch (err) {
      console.error(err);
      showError("Failed to approve payment.");
    }
  };

  const handleDeclinePaymentFromModal = async (bookingToDecline: any, reason: string) => {
    try {
      await updateDoc(doc(db, "bookings", bookingToDecline.id), {
        paymentStatus: "Declined",
        paymentDeclineReason: reason,
        paymentReceiptUrl: null,
        declinedAt: new Date().toISOString()
      });

      if (bookingToDecline.clientId) {
        await sendNotification({
          companyId: company.id,
          userId: bookingToDecline.clientId,
          recipientEmail: bookingToDecline.clientEmail || "",
          title: "Payment Declined",
          message: `Your manual payment for booking #${bookingToDecline.id.substring(0,8)} was declined. Reason: ${reason}. Please try submitting payment again.`,
          type: "alert",
          link: `/${company.id}/dashboard/client/payment/${bookingToDecline.id}`
        });
      }

      showSuccess("Payment declined successfully.");
      setBookings(prev => prev.map(b => b.id === bookingToDecline.id ? { ...b, paymentStatus: "Declined", paymentDeclineReason: reason, paymentReceiptUrl: null } : b));
      if (selectedBooking?.id === bookingToDecline.id) {
        setSelectedBooking((prev: any) => prev ? { ...prev, paymentStatus: "Declined", paymentDeclineReason: reason, paymentReceiptUrl: null } : null);
      }
      setPayments(prev => prev.filter(b => b.id !== bookingToDecline.id));
    } catch (err: any) {
      console.error(err);
      showError("Failed to decline payment.");
    }
  };

  // Filtered client list & pagination
  const filteredClients = useMemo(() => {
    return clients.filter(c => 
      (c.name || "").toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.phoneNumber || "").toLowerCase().includes(clientSearch.toLowerCase())
    );
  }, [clients, clientSearch]);
  
  const clientPageCount = Math.max(1, Math.ceil(filteredClients.length / 10));
  const pagedClients = filteredClients.slice((clientPage - 1) * 10, clientPage * 10);

  // Filtered talent list & pagination
  const filteredTalents = useMemo(() => {
    return talents.filter(t => 
      (t.displayName || "").toLowerCase().includes(talentSearch.toLowerCase()) ||
      (t.email || "").toLowerCase().includes(talentSearch.toLowerCase()) ||
      (t.phoneNumber || "").toLowerCase().includes(talentSearch.toLowerCase()) ||
      (t.talentType || "").toLowerCase().includes(talentSearch.toLowerCase()) ||
      (t.numericId || "").toLowerCase().includes(talentSearch.toLowerCase())
    );
  }, [talents, talentSearch]);
  
  const talentPageCount = Math.max(1, Math.ceil(filteredTalents.length / 10));
  const pagedTalents = filteredTalents.slice((talentPage - 1) * 10, talentPage * 10);

  // Filtered bookings list & pagination
  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      // 1. Search Query
      const searchMatch = !bookingSearch ||
        (b.id || "").toLowerCase().includes(bookingSearch.toLowerCase()) ||
        (b.clientName || "").toLowerCase().includes(bookingSearch.toLowerCase()) ||
        (b.clientEmail || "").toLowerCase().includes(bookingSearch.toLowerCase()) ||
        (b.talentName || "").toLowerCase().includes(bookingSearch.toLowerCase()) ||
        (b.status || "").toLowerCase().includes(bookingSearch.toLowerCase()) ||
        (b.jobType || b.__jobType || "").toLowerCase().includes(bookingSearch.toLowerCase());

      // 2. Status Filter
      let statusMatch = true;
      if (bookingStatusFilter !== "all") {
        if (bookingStatusFilter === "Awaiting Approval") {
          statusMatch = b.paymentStatus === "Awaiting Approval" || (b.status || "").toLowerCase() === "awaiting approval";
        } else {
          statusMatch = (b.status || "").toLowerCase() === bookingStatusFilter.toLowerCase();
        }
      }

      // 3. Job Type Filter
      let jobMatch = true;
      if (bookingJobFilter !== "all") {
        const jType = b.jobType || b.__jobType || "";
        jobMatch = jType.toLowerCase() === bookingJobFilter.toLowerCase();
      }

      // 4. Date Filter
      let dateMatch = true;
      if (bookingStartDate || bookingEndDate) {
        const eventDateStr = b.eventDate || b.date || "";
        if (eventDateStr) {
          const eventTimeMs = new Date(eventDateStr).getTime();
          if (bookingStartDate) {
            const startMs = new Date(bookingStartDate).getTime();
            if (eventTimeMs < startMs) dateMatch = false;
          }
          if (bookingEndDate) {
            const endMs = new Date(bookingEndDate).getTime() + 86400000; // include full end day
            if (eventTimeMs > endMs) dateMatch = false;
          }
        } else {
          dateMatch = false;
        }
      }

      return searchMatch && statusMatch && jobMatch && dateMatch;
    });
  }, [bookings, bookingSearch, bookingStatusFilter, bookingJobFilter, bookingStartDate, bookingEndDate]);
  
  const bookingPageCount = Math.max(1, Math.ceil(filteredBookings.length / 10));
  const pagedBookings = filteredBookings.slice((bookingPage - 1) * 10, bookingPage * 10);

  const uniqueJobTypes = useMemo(() => {
    const jobs = new Set<string>();
    bookings.forEach(b => {
      const jType = b.jobType || b.__jobType;
      if (jType) jobs.add(jType);
    });
    return Array.from(jobs).sort();
  }, [bookings]);

  const bookingStats = useMemo(() => {
    let total = bookings.length;
    let confirmed = 0;
    let completed = 0;
    let cancelled = 0;
    let totalRevenue = 0;
    let awaitingApproval = 0;

    bookings.forEach(b => {
      const status = (b.status || "").toLowerCase();
      if (status === "confirmed") confirmed++;
      else if (status === "completed") completed++;
      else if (status === "cancelled") cancelled++;
      
      if (b.paymentStatus === "Awaiting Approval" || status === "awaiting approval") {
        awaitingApproval++;
      }

      if (status !== "cancelled") {
        totalRevenue += Number(b.totalBudget || 0);
      }
    });

    return { total, confirmed, completed, cancelled, totalRevenue, awaitingApproval };
  }, [bookings]);

  // Filtered payments list
  const filteredPayments = useMemo(() => {
    return payments.filter(p => 
      (p.id || "").toLowerCase().includes(paymentSearch.toLowerCase()) ||
      (p.clientName || "").toLowerCase().includes(paymentSearch.toLowerCase()) ||
      (p.paymentMethod || "").toLowerCase().includes(paymentSearch.toLowerCase())
    );
  }, [payments, paymentSearch]);

  const filteredStripeBookings = useMemo(() => {
    return stripeBookings.filter(b => 
      (b.id || "").toLowerCase().includes(paymentSearch.toLowerCase()) ||
      (b.clientName || "").toLowerCase().includes(paymentSearch.toLowerCase()) ||
      (b.clientEmail || "").toLowerCase().includes(paymentSearch.toLowerCase()) ||
      (b.stripePaymentIntentId || "").toLowerCase().includes(paymentSearch.toLowerCase())
    );
  }, [stripeBookings, paymentSearch]);

  const filteredStripeTips = useMemo(() => {
    return stripeTips.filter(b => 
      (b.id || "").toLowerCase().includes(paymentSearch.toLowerCase()) ||
      (b.clientName || "").toLowerCase().includes(paymentSearch.toLowerCase()) ||
      (b.clientEmail || "").toLowerCase().includes(paymentSearch.toLowerCase()) ||
      (b.tipStripePaymentIntentId || "").toLowerCase().includes(paymentSearch.toLowerCase())
    );
  }, [stripeTips, paymentSearch]);

  const tabs = [
    { id: "overview", label: "Overview", icon: Building2 },
    { id: "settings", label: "Brand Settings", icon: Settings },
    { id: "users", label: "Users & Staff", icon: Users },
    { id: "clients", label: "Clients", icon: UserCircle },
    { id: "talents", label: "Talents", icon: Activity },
    { id: "bookings", label: "Bookings", icon: Briefcase },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "subscription", label: "Subscription Plan", icon: DollarSign },
    { id: "notes", label: "Master Notes", icon: FileText },
  ] as const;

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Header bar */}
      <div className="bg-white border border-slate-200/85 rounded-[24px] p-6 shadow-[0_4px_25px_rgb(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onClose} className="h-10 w-10 p-0 rounded-full border border-slate-200 hover:bg-slate-100 transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 text-[#1e1b4b]" />
          </Button>
          <div className="flex items-center gap-3">
            {logoPreview ? (
              <img src={logoPreview} alt="logo" className="w-14 h-14 rounded-2xl object-cover border border-slate-100 shadow-sm" />
            ) : (
              <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 font-black text-xl shadow-sm shrink-0">
                {company.name[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-[#1e1b4b] leading-tight">{company.name}</h1>
                <StatusBadge status={company.status} />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <code className="text-xs text-slate-400 font-semibold font-mono bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">/{company.id}</code>
                <a href={`/${company.id}/login`} target="_blank" rel="noreferrer"
                  className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1">
                  Login Page <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {company.createdAt && (
            <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
              <Calendar className="w-4 h-4 text-slate-400" />
              Registered {formatDate(company.createdAt)}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Navigation - Sidebar layout */}
        <div className="lg:col-span-1 bg-white border border-slate-200/85 rounded-[24px] p-4 shadow-[0_4px_25px_rgb(0,0,0,0.03)] space-y-1">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider px-3 mb-2">Management</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex lg:flex-col gap-2 pb-2 lg:pb-0">
            {tabs.map(({ id, label, icon: Icon }) => {
              const isActive = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id as any)}
                  className={`group flex items-center gap-2.5 p-2.5 rounded-xl text-[12.5px] font-extrabold transition-all duration-200 shrink-0 w-full text-left border ${
                    isActive
                      ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white border-indigo-600 shadow-[0_4px_12px_rgba(79,70,229,0.25)] scale-[1.01] lg:scale-100"
                      : "bg-slate-50/90 text-slate-600 border-slate-200/70 hover:bg-white hover:text-indigo-600 hover:border-indigo-200 hover:shadow-sm"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0 ${
                    isActive 
                      ? "bg-white/20 text-white" 
                      : "bg-slate-200/50 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                  }`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-pane Content */}
        <div className="lg:col-span-3 bg-white border border-slate-200/85 rounded-[24px] p-6 shadow-[0_4px_25px_rgb(0,0,0,0.03)] min-h-[500px]">
          
          {/* OVERVIEW TAB — Company Dashboard */}
          {tab === "overview" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Header */}
              <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                <Building2 className="w-5 h-5 text-indigo-500" />
                <h2 className="text-base font-extrabold text-[#1e1b4b]">Company Overview</h2>
              </div>


              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: "Total Users", value: users.length, icon: Users, color: "indigo", sub: "Admins & staff" },
                  { label: "Total Clients", value: clients.length, icon: UserCircle, color: "emerald", sub: "Registered clients" },
                  { label: "Total Talents", value: talents.length, icon: Activity, color: "violet", sub: "Roster talents" },
                  { label: "Total Bookings", value: bookings.length, icon: Briefcase, color: "blue", sub: "All time" },
                  { label: "Confirmed", value: bookings.filter((b:any)=>b.status==="Confirmed"||b.status==="confirmed").length, icon: CheckCircle, color: "emerald", sub: "Bookings" },
                  { label: "Completed", value: bookings.filter((b:any)=>b.status==="Completed"||b.status==="completed").length, icon: Star, color: "amber", sub: "Bookings" },
                ].map(({ label, value, icon: Icon, color, sub }) => (
                  <div key={label} className={`bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{label}</p>
                        <p className={`text-2xl font-black mt-1 ${
                          color === "indigo" ? "text-indigo-600" :
                          color === "emerald" ? "text-emerald-600" :
                          color === "violet" ? "text-violet-600" :
                          color === "blue" ? "text-blue-600" :
                          color === "amber" ? "text-amber-600" : "text-slate-800"
                        }`}>{value}</p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{sub}</p>
                      </div>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        color === "indigo" ? "bg-indigo-50" :
                        color === "emerald" ? "bg-emerald-50" :
                        color === "violet" ? "bg-violet-50" :
                        color === "blue" ? "bg-blue-50" :
                        color === "amber" ? "bg-amber-50" : "bg-slate-50"
                      }`}>
                        <Icon className={`w-4.5 h-4.5 ${
                          color === "indigo" ? "text-indigo-500" :
                          color === "emerald" ? "text-emerald-500" :
                          color === "violet" ? "text-violet-500" :
                          color === "blue" ? "text-blue-500" :
                          color === "amber" ? "text-amber-500" : "text-slate-500"
                        }`} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Contact + quick info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Contact person */}
                <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-3">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Primary Contact
                  </h4>
                  {company.contactPerson || company.contactPhone || company.contactEmail ? (
                    <div className="space-y-2">
                      {company.contactPerson && (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                            <User className="w-3.5 h-3.5 text-indigo-500" />
                          </div>
                          <span className="text-sm font-bold text-slate-800">{company.contactPerson}</span>
                        </div>
                      )}
                      {company.contactPhone && (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                            <Phone className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                          <span className="text-sm font-medium text-slate-600">{company.contactPhone}</span>
                        </div>
                      )}
                      {company.contactEmail && (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <Mail className="w-3.5 h-3.5 text-blue-500" />
                          </div>
                          <span className="text-sm font-medium text-slate-600">{company.contactEmail}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No contact info set. Update in Brand Settings.</p>
                  )}
                </div>

                {/* System status */}
                <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-3">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" /> System Status
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 font-semibold">Account Status</span>
                      <StatusBadge status={company.status} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 font-semibold">Admin Email</span>
                      <span className="font-mono text-xs text-slate-700 truncate max-w-[150px]">{company.adminEmail || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 font-semibold">URL Slug</span>
                      <code className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">/{company.id}</code>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 font-semibold">Registered</span>
                      <span className="text-xs text-slate-600 font-semibold">{company.createdAt ? formatDate(company.createdAt) : "—"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent bookings summary */}
              {bookings.length > 0 && (
                <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 mb-4">
                    <Briefcase className="w-3.5 h-3.5" /> Booking Status Breakdown
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Pending", color: "amber", count: bookings.filter((b:any)=>/pending/i.test(b.status||"pending")).length },
                      { label: "Confirmed", color: "blue", count: bookings.filter((b:any)=>/confirmed/i.test(b.status||"" )).length },
                      { label: "Completed", color: "emerald", count: bookings.filter((b:any)=>/completed/i.test(b.status||"" )).length },
                      { label: "Cancelled", color: "red", count: bookings.filter((b:any)=>/cancel/i.test(b.status||"" )).length },
                    ].map(({ label, color, count }) => (
                      <div key={label} className={`rounded-xl border p-3 text-center ${
                        color === "amber" ? "bg-amber-50/50 border-amber-100" :
                        color === "blue" ? "bg-blue-50/50 border-blue-100" :
                        color === "emerald" ? "bg-emerald-50/50 border-emerald-100" :
                        "bg-red-50/50 border-red-100"
                      }`}>
                        <p className={`text-xl font-black ${
                          color === "amber" ? "text-amber-700" :
                          color === "blue" ? "text-blue-700" :
                          color === "emerald" ? "text-emerald-700" : "text-red-700"
                        }`}>{count}</p>
                        <p className="text-[10px] font-bold text-slate-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick action — go to settings */}
              {hasPermission("edit_company") && (
                <button
                  onClick={() => setTab("settings" as any)}
                  className="w-full flex items-center justify-between gap-3 bg-slate-50 hover:bg-indigo-50/60 border border-slate-200 hover:border-indigo-200 rounded-2xl p-4 transition-all duration-200 group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center transition-colors">
                      <Settings className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-extrabold text-slate-800 block">Brand Settings</span>
                      <span className="text-[11px] text-slate-500">Edit logo, colors, contact info & status</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              )}
            </div>
          )}

          {/* SETTINGS TAB — Branding & Config */}
          {tab === "settings" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 mb-2 pb-4 border-b border-slate-100">
                <Settings className="w-5 h-5 text-indigo-500" />
                <h2 className="text-base font-extrabold text-[#1e1b4b]">Brand Settings</h2>
              </div>

              {/* Logo section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 block">Company Logo</label>
                  <div className="flex flex-col gap-3">
                    {logoPreview ? (
                      <img src={logoPreview} alt="logo" className="w-32 h-32 rounded-3xl object-cover border border-slate-200 shadow-sm" />
                    ) : (
                      <div className="w-32 h-32 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center">
                        <Building2 className="w-10 h-10 text-slate-300" />
                      </div>
                    )}
                    {hasPermission("upload_assets") && (
                      <div>
                        <label htmlFor="logo-upload" className="cursor-pointer inline-flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl border border-indigo-100 transition-colors">
                          <Upload className="w-3.5 h-3.5" /> Upload Logo
                        </label>
                        <input id="logo-upload" type="file" accept="image/*" onChange={handleLogoSelect} className="hidden" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1.5">Company Name</label>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-10 rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 block mb-1.5">URL Slug (read-only)</label>
                      <Input value={company.id} disabled className="h-10 rounded-xl text-sm bg-slate-50 text-slate-400" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1.5">Admin Email (read-only)</label>
                    <Input value={company.adminEmail || ""} disabled className="h-10 rounded-xl text-sm bg-slate-50 text-slate-400" />
                  </div>
                </div>
              </div>

              {/* Branding Section */}
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Theme Branding Colors</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="text-xs font-bold text-slate-600 block mb-2">Primary Accent Color</label>
                    <div className="flex gap-2">
                       <input 
                        type="color" 
                        value={editBrandColor} 
                        onChange={e => setEditBrandColor(e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border-none p-0 overflow-hidden" 
                      />
                      <Input value={editBrandColor} onChange={e => setEditBrandColor(e.target.value)} className="h-10 rounded-xl text-sm font-mono uppercase bg-white" />
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="text-xs font-bold text-slate-600 block mb-2">Secondary Accent Color</label>
                    <div className="flex gap-2">
                       <input 
                        type="color" 
                        value={editBrandSecondary} 
                        onChange={e => setEditBrandSecondary(e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border-none p-0 overflow-hidden" 
                      />
                      <Input value={editBrandSecondary} onChange={e => setEditBrandSecondary(e.target.value)} className="h-10 rounded-xl text-sm font-mono uppercase bg-white" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Person Section */}
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Primary Contact Person</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-1">
                    <label className="text-xs font-bold text-slate-600 block mb-1.5">Contact Name</label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input value={editContact} onChange={e => setEditContact(e.target.value)} placeholder="e.g. John Smith" className="pl-9 h-10 rounded-xl text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1.5">Contact Phone</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+92 300..." className="pl-9 h-10 rounded-xl text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1.5">Contact Email</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input type="email" value={editContactEmail} onChange={e => setEditContactEmail(e.target.value)} placeholder="contact@co.com" className="pl-9 h-10 rounded-xl text-sm" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              {hasPermission("edit_company") && (
                <div className="pt-4 flex justify-end">
                  <Button onClick={saveInfo} disabled={saving || uploading} className="h-11 px-8 bg-[#1e1b4b] hover:bg-[#312e81] text-white font-bold rounded-xl text-sm shadow-md">
                    {(saving || uploading) ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Settings"}
                  </Button>
                </div>
              )}

              {/* Status Section */}
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">System Operational Status</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    hasPermission("disable_company") ? { status: "active", label: "Active", desc: "Access open", icon: CheckCircle, bgClass: "bg-emerald-50 text-emerald-700 border-emerald-100" } : null,
                    hasPermission("disable_company") ? { status: "disabled", label: "Disabled", desc: "Blocked login", icon: XCircle, bgClass: "bg-amber-50 text-amber-700 border-amber-100" } : null,
                    hasPermission("blacklist_company") ? { status: "blacklisted", label: "Blacklisted", desc: "Permanently suspended", icon: AlertOctagon, bgClass: "bg-red-50 text-red-700 border-red-100" } : null,
                  ].filter(Boolean).map((item: any) => {
                    const { status, label, desc, icon: Icon, bgClass } = item;
                    const isCurrent = (company.status || "active") === status;
                    return (
                      <button
                        key={status}
                        onClick={() => updateStatus(status)}
                        className={`text-left p-4 rounded-2xl border-2 transition-all flex items-start gap-3 ${
                          isCurrent
                            ? `${bgClass} border-indigo-500 ring-2 ring-indigo-500/10`
                            : "border-slate-100 bg-white hover:border-slate-200"
                        }`}
                      >
                        <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-sm">{label}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                        </div>
                        {isCurrent && (
                          <span className="ml-auto text-[9px] font-black uppercase bg-white/60 border border-current px-1.5 py-0.5 rounded">Active</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* USERS TAB */}
          {tab === "users" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2 pb-4 border-b border-slate-100">
                <Users className="w-5 h-5 text-indigo-500" />
                <h2 className="text-base font-extrabold text-[#1e1b4b]">Company Users & Staff</h2>
              </div>

              {/* Users list */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Current Admins & Staff ({users.length})</h3>
                  <Button variant="outline" size="sm" onClick={loadUsers} className="h-8 rounded-lg text-xs">
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reload
                  </Button>
                </div>

                {usersLoading ? (
                  <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
                ) : users.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-dashed">No users found. Add one below.</div>
                ) : (
                  <div className="border border-slate-150 rounded-2xl overflow-hidden bg-white shadow-sm">
                    {/* Mobile/Tablet Card layout */}
                    <div className="block md:hidden divide-y divide-slate-100">
                      {users.map(u => (
                        <div key={u.id} className="p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm uppercase shrink-0">
                                {u.name?.[0] || "?"}
                              </div>
                              <div className="min-w-0">
                                <span className="font-extrabold text-slate-800 block leading-snug truncate">{u.name}</span>
                                <span className="text-[10px] text-slate-400 font-mono block truncate">{u.email}</span>
                              </div>
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${
                              u.role === "admin" ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}>{u.role}</span>
                          </div>
                          
                          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-50">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                              u.status === "disabled" ? "text-amber-600" : "text-emerald-600"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${u.status === "disabled" ? "bg-amber-500" : "bg-emerald-500"}`} />
                              {u.status === "disabled" ? "Disabled" : "Active"}
                            </span>
                            
                            <div className="inline-flex items-center gap-1">
                              {hasPermission("disable_company_user") && (
                                <button onClick={() => toggleUser(u.id, u.status || "active")}
                                  className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition-all ${
                                    u.status === "disabled"
                                      ? "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100"
                                      : "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100"
                                  }`}>
                                  {u.status === "disabled" ? "Enable" : "Disable"}
                                </button>
                              )}
                              {hasPermission("edit_company_user") && (
                                <button onClick={() => handleUserForgotPassword(u.email)}
                                  title="Send Reset Password Email"
                                  className="p-2 hover:bg-indigo-50 text-indigo-550 hover:text-indigo-700 rounded-lg transition-colors border border-slate-100 bg-slate-50/50">
                                  <Mail className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {hasPermission("edit_company_user") && (
                                <button onClick={() => handleUserChangePassword(u.id, u.email)}
                                  title="Change Password Directly"
                                  className="p-2 hover:bg-amber-50 text-amber-600 hover:text-amber-700 rounded-lg transition-colors border border-slate-100 bg-slate-50/50">
                                  <Lock className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {hasPermission("edit_company_user") && (
                                <button onClick={() => { setEditingUser(u); setUserEditName(u.name); setUserEditRole(u.role as "admin" | "staff"); setUserEditErr(""); }}
                                  className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors border border-slate-100 bg-slate-50/50">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {hasPermission("edit_company_user") && (
                                <button onClick={() => deleteUser(u.id)} disabled={deletingId === u.id}
                                  className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-650 rounded-lg transition-colors border border-slate-100 bg-slate-50/50">
                                  {deletingId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table Layout */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs uppercase">
                          <tr>
                            <th className="px-6 py-3.5">User</th>
                            <th className="px-6 py-3.5">Email</th>
                            <th className="px-6 py-3.5">Role</th>
                            <th className="px-6 py-3.5">Status</th>
                            <th className="px-6 py-3.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {users.map(u => (
                            <tr key={u.id} className="hover:bg-slate-50/50">
                              <td className="px-6 py-4 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm uppercase shrink-0">
                                  {u.name?.[0] || "?"}
                                </div>
                                <span className="font-extrabold text-slate-800">{u.name}</span>
                              </td>
                              <td className="px-6 py-4 text-slate-500 font-mono text-xs">{u.email}</td>
                              <td className="px-6 py-4">
                                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                  u.role === "admin" ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-slate-100 text-slate-500 border-slate-200"
                                }`}>{u.role}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                                  u.status === "disabled" ? "text-amber-600" : "text-emerald-600"
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${u.status === "disabled" ? "bg-amber-500" : "bg-emerald-500"}`} />
                                  {u.status === "disabled" ? "Disabled" : "Active"}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="inline-flex items-center gap-1">
                                  {hasPermission("disable_company_user") && (
                                    <button onClick={() => toggleUser(u.id, u.status || "active")}
                                      className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition-all ${
                                        u.status === "disabled"
                                          ? "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100"
                                          : "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100"
                                      }`}>
                                      {u.status === "disabled" ? "Enable" : "Disable"}
                                    </button>
                                  )}
                                  {hasPermission("edit_company_user") && (
                                    <button onClick={() => handleUserForgotPassword(u.email)}
                                      title="Send Reset Password Email"
                                      className="p-2 hover:bg-indigo-50 text-indigo-550 hover:text-indigo-700 rounded-lg transition-colors">
                                      <Mail className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {hasPermission("edit_company_user") && (
                                    <button onClick={() => handleUserChangePassword(u.id, u.email)}
                                      title="Change Password Directly"
                                      className="p-2 hover:bg-amber-50 text-amber-600 hover:text-amber-700 rounded-lg transition-colors">
                                      <Lock className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {hasPermission("edit_company_user") && (
                                    <button onClick={() => { setEditingUser(u); setUserEditName(u.name); setUserEditRole(u.role as "admin" | "staff"); setUserEditErr(""); }}
                                      className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors">
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {hasPermission("edit_company_user") && (
                                    <button onClick={() => deleteUser(u.id)} disabled={deletingId === u.id}
                                      className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-650 rounded-lg transition-colors">
                                      {deletingId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Add User form */}
              {hasPermission("create_company_user") && (
                <div className="border-t border-slate-100 pt-6 mt-6">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">Add Company Admin or Staff User</h3>
                  {userErr && <div className="mb-4 p-3.5 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100">{userErr}</div>}
                  <form onSubmit={addUser} className="bg-slate-50 border border-slate-100 p-5 rounded-2xl space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">Full Name</label>
                        <div className="relative">
                          <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full Name" required className="pl-8 h-10 rounded-xl text-sm bg-white" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">Email Address</label>
                        <div className="relative">
                          <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email" required className="pl-8 h-10 rounded-xl text-sm bg-white" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">Account Role</label>
                        <select value={newRole} onChange={e => setNewRole(e.target.value as any)}
                          className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none">
                          <option value="staff">Staff Member</option>
                          <option value="admin">Company Administrator</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-bold text-slate-500 block mb-1">Temporary Password</label>
                        <div className="relative">
                          <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Password (min 6 characters)" required className="pl-8 h-10 rounded-xl text-sm bg-white" />
                        </div>
                      </div>
                      <Button type="submit" disabled={creating} className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm w-full">
                        {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : <><UserPlus className="w-4 h-4 mr-2" />Add Account</>}
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {/* Edit User Modal */}
              {editingUser && (
                <div className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200 border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-black text-[#1e1b4b]">Edit User Details</h3>
                      <button onClick={() => setEditingUser(null)} className="p-1.5 hover:bg-slate-100 text-slate-400 rounded-lg"><X className="w-4 h-4" /></button>
                    </div>
                    <p className="text-slate-400 text-xs font-mono mb-4">{editingUser.email}</p>
                    {userEditErr && <div className="mb-3 p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100">{userEditErr}</div>}
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1.5">Full Name</label>
                        <div className="relative">
                          <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <Input value={userEditName} onChange={e => setUserEditName(e.target.value)} className="pl-9 h-10 rounded-xl text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600 block mb-1.5">Role</label>
                        <select value={userEditRole} onChange={e => setUserEditRole(e.target.value as "admin" | "staff")}
                          className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm font-semibold bg-white outline-none">
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="flex gap-3 pt-2">
                        <Button onClick={() => setEditingUser(null)} variant="outline" className="flex-1 h-10 rounded-xl text-sm">Cancel</Button>
                        <Button onClick={saveEditUser} disabled={editSaving} className="flex-1 h-10 rounded-xl bg-[#1e1b4b] hover:bg-[#312e81] text-white font-bold text-sm">
                          {editSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CLIENTS TAB */}
          {tab === "clients" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2 pb-4 border-b border-slate-100">
                <UserCircle className="w-5 h-5 text-indigo-500" />
                <h2 className="text-base font-extrabold text-[#1e1b4b]">Company Clients & Evaluation</h2>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input placeholder="Search clients by name, email, phone..." value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setClientPage(1); }} className="pl-9 h-10 rounded-xl text-sm" />
                </div>
                <Button variant="outline" onClick={loadClients} className="h-10 rounded-xl px-3 text-slate-500 shrink-0">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              {clientsLoading ? (
                <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-500" /></div>
              ) : filteredClients.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-dashed">No clients found.</div>
              ) : (
                <div className="space-y-4">
                  <div className="border border-slate-150 rounded-2xl overflow-hidden bg-white shadow-sm">
                    {/* Mobile/Tablet Card layout */}
                    <div className="block md:hidden divide-y divide-slate-100">
                      {pagedClients.map(c => {
                        const rating = clientRatings[c.id];
                        return (
                          <div key={c.id} className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <span className="font-extrabold text-slate-800 block leading-tight truncate">{c.name || "Unnamed Client"}</span>
                                <span className="text-[10px] text-slate-400 font-mono font-semibold block truncate">{c.id}</span>
                              </div>
                              <span className={`inline-flex items-center gap-1 text-[11px] font-bold shrink-0 ${
                                c.status === "inactive" ? "text-slate-400" : "text-emerald-600"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${c.status === "inactive" ? "bg-slate-300" : "bg-emerald-500"}`} />
                                {c.status === "inactive" ? "Inactive" : "Active"}
                              </span>
                            </div>

                            <div className="space-y-1 text-xs">
                              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Contact</div>
                              <div className="text-slate-700 font-semibold truncate">{c.email}</div>
                              {c.phoneNumber && <div className="text-slate-500 font-medium">{c.phoneNumber}</div>}
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-50 gap-2">
                              <div className="min-w-0">
                                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Rating</div>
                                {rating ? (
                                  <div className="flex items-center gap-1" title={`${rating.overall} / 5 based on ${rating.count} ratings`}>
                                    <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" />
                                    <span className="font-black text-slate-800 text-xs">{rating.overall}</span>
                                    <span className="text-[10px] text-slate-400">({rating.count} jobs)</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-300 text-xs font-semibold">No ratings</span>
                                )}
                              </div>
                              <Button size="sm" variant="ghost" onClick={() => setSelectedClient(c)} className="h-8 rounded-lg text-xs hover:bg-indigo-50 hover:text-indigo-600 font-bold bg-slate-50/50 border border-slate-100 flex items-center justify-center shrink-0">
                                View Activity & Notes <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Table Layout */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs uppercase">
                          <tr>
                            <th className="px-6 py-3.5">Client</th>
                            <th className="px-6 py-3.5">Contact Details</th>
                            <th className="px-6 py-3.5">Rating (Internal)</th>
                            <th className="px-6 py-3.5">Status</th>
                            <th className="px-6 py-3.5 text-right">Inspect</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {pagedClients.map(c => {
                            const rating = clientRatings[c.id];
                            return (
                              <tr key={c.id} className="hover:bg-slate-50/50">
                                <td className="px-6 py-4">
                                  <span className="font-extrabold text-slate-800 block">{c.name || "Unnamed Client"}</span>
                                  <span className="text-[10px] text-slate-400 font-mono font-semibold">{c.id}</span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-slate-600 block text-xs">{c.email}</span>
                                  {c.phoneNumber && <span className="text-slate-400 text-xs block">{c.phoneNumber}</span>}
                                </td>
                                <td className="px-6 py-4">
                                  {rating ? (
                                    <div className="flex items-center gap-1.5" title={`${rating.overall} / 5 based on ${rating.count} ratings`}>
                                      <Star className="w-4 h-4 fill-amber-400 stroke-amber-400" />
                                      <span className="font-black text-slate-800 text-xs">{rating.overall}</span>
                                      <span className="text-[10px] text-slate-400">({rating.count} jobs)</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 text-xs">No ratings</span>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                                    c.status === "inactive" ? "text-slate-400" : "text-emerald-600"
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${c.status === "inactive" ? "bg-slate-300" : "bg-emerald-500"}`} />
                                    {c.status === "inactive" ? "Inactive" : "Active"}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <Button size="sm" variant="ghost" onClick={() => setSelectedClient(c)} className="h-8 rounded-lg text-xs hover:bg-indigo-50 hover:text-indigo-600 font-bold">
                                    View Notes & Activity <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagination */}
                  {clientPageCount > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-slate-400 font-bold">
                        Showing {(clientPage - 1) * 10 + 1}–{Math.min(clientPage * 10, filteredClients.length)} of {filteredClients.length}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => setClientPage(p => Math.max(1, p - 1))} disabled={clientPage === 1} className="h-8 rounded-lg px-2"><ChevronLeft className="w-4 h-4" /></Button>
                        <span className="text-xs font-bold text-slate-600 px-2">Page {clientPage} of {clientPageCount}</span>
                        <Button variant="outline" size="sm" onClick={() => setClientPage(p => Math.min(clientPageCount, p + 1))} disabled={clientPage === clientPageCount} className="h-8 rounded-lg px-2"><ChevronRight className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TALENTS TAB */}
          {tab === "talents" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2 pb-4 border-b border-slate-100">
                <Activity className="w-5 h-5 text-indigo-500" />
                <h2 className="text-base font-extrabold text-[#1e1b4b]">Company Talents Roster</h2>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input placeholder="Search talents by name, category, state, numeric ID..." value={talentSearch}
                    onChange={e => { setTalentSearch(e.target.value); setTalentPage(1); }} className="pl-9 h-10 rounded-xl text-sm" />
                </div>
                <Button variant="outline" onClick={loadTalents} className="h-10 rounded-xl px-3 text-slate-500 shrink-0">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              {talentsLoading ? (
                <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-500" /></div>
              ) : filteredTalents.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-dashed">No talents found.</div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {pagedTalents.map(t => {
                      const talentBookings = bookings.filter((b: any) => {
                        return b.talentId === t.id || (Array.isArray(b.selectedTalentIds) && b.selectedTalentIds.includes(t.id));
                      });
                      const completedCount = talentBookings.filter((b: any) => b.status === "Completed").length;
                      
                      return (
                        <div key={t.id} className="bg-white border border-slate-200/70 hover:border-indigo-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group overflow-hidden">
                          <div className="min-w-0">
                            {/* Top row: Avatar, Name & Status */}
                            <div className="flex items-start gap-3">
                              <div className="shrink-0">
                                {t.profileImage ? (
                                  <img src={t.profileImage} alt={t.displayName} className="w-11 h-11 rounded-xl object-cover border border-slate-200" />
                                ) : (
                                  <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-slate-200 flex items-center justify-center font-black text-indigo-600 text-sm uppercase">
                                    {t.displayName?.[0] || "?"}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <span className="font-extrabold text-slate-800 text-sm block truncate group-hover:text-indigo-600 transition-colors" title={t.displayName}>
                                      {t.displayName}
                                    </span>
                                    <span className="text-slate-400 text-[11px] block truncate" title={t.email}>{t.email}</span>
                                  </div>
                                  <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border leading-none shrink-0 whitespace-nowrap ${
                                    t.status === "inactive" 
                                      ? "bg-slate-50 text-slate-500 border-slate-200" 
                                      : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                  }`}>
                                    <span className={`w-1 h-1 rounded-full ${t.status === "inactive" ? "bg-slate-300" : "bg-emerald-500"}`} />
                                    {t.status === "inactive" ? "Off" : "Active"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Info rows */}
                            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                              <div className="flex items-center justify-between text-xs gap-2">
                                <span className="text-slate-400 font-bold shrink-0">Numeric ID</span>
                                <span className="font-mono font-bold text-slate-700 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded text-right">
                                  #{t.numericId || "Pending"}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-xs gap-2">
                                <span className="text-slate-400 font-bold shrink-0">Type / Role</span>
                                <span className="font-bold text-indigo-600 truncate text-right max-w-[55%]">{t.talentType}</span>
                              </div>

                              {t.categories && Array.isArray(t.categories) && t.categories.length > 0 && (
                                <div className="flex items-center justify-between text-xs gap-2">
                                  <span className="text-slate-400 font-bold shrink-0">Categories</span>
                                  <span className="text-slate-600 font-bold truncate text-right max-w-[55%]" title={t.categories.join(", ")}>
                                    {t.categories.join(", ")}
                                  </span>
                                </div>
                              )}

                              <div className="flex items-center justify-between text-xs gap-2">
                                <span className="text-slate-400 font-bold shrink-0">Location</span>
                                <span className="font-extrabold text-slate-700 flex items-center gap-1 min-w-0">
                                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="truncate">{[t.city, t.state].filter(Boolean).join(", ") || "—"}</span>
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Footer: job count + action */}
                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 shrink-0">
                              <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                              <span className="text-slate-800 font-black">{completedCount}</span> Done
                            </div>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => setSelectedTalent(t)} 
                              className="rounded-xl text-xs border-slate-200 text-slate-700 hover:bg-[#1e1b4b] hover:text-white hover:border-[#1e1b4b] font-bold transition-all flex items-center gap-1 px-3 py-1.5 h-auto"
                            >
                              <span className="hidden sm:inline">View Profile</span>
                              <span className="sm:hidden">Profile</span>
                              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {talentPageCount > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-slate-400 font-bold">
                        Showing {(talentPage - 1) * 10 + 1}–{Math.min(talentPage * 10, filteredTalents.length)} of {filteredTalents.length}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => setTalentPage(p => Math.max(1, p - 1))} disabled={talentPage === 1} className="h-8 rounded-lg px-2"><ChevronLeft className="w-4 h-4" /></Button>
                        <span className="text-xs font-bold text-slate-600 px-2">Page {talentPage} of {talentPageCount}</span>
                        <Button variant="outline" size="sm" onClick={() => setTalentPage(p => Math.min(talentPageCount, p + 1))} disabled={talentPage === talentPageCount} className="h-8 rounded-lg px-2"><ChevronRight className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* BOOKINGS TAB */}
          {tab === "bookings" && (
            <div className="space-y-6">
              {/* Header and stats */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 animate-in fade-in duration-300">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <Briefcase className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-[#1e1b4b]">All Company Bookings & Statuses</h2>
                    <p className="text-xs text-slate-400 font-medium">Manage and inspect all event bookings, payments, and statuses.</p>
                  </div>
                </div>
                <Button variant="outline" onClick={loadBookings} className="h-10 rounded-xl px-3 text-slate-500 hover:text-indigo-600 shrink-0 self-start md:self-auto">
                  <RefreshCw className="w-4 h-4 mr-1.5" /> Reload List
                </Button>
              </div>

              {/* Stats overview cards grid */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 animate-in fade-in duration-300 delay-100">
                <div className="bg-gradient-to-br from-indigo-50/40 to-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Total Bookings</span>
                  <span className="text-2xl font-black text-indigo-950 mt-1 block">{bookingStats.total}</span>
                </div>
                <div className="bg-gradient-to-br from-emerald-50/40 to-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Confirmed</span>
                  <span className="text-2xl font-black text-emerald-700 mt-1 block">{bookingStats.confirmed}</span>
                </div>
                <div className="bg-gradient-to-br from-purple-50/40 to-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Completed</span>
                  <span className="text-2xl font-black text-purple-700 mt-1 block">{bookingStats.completed}</span>
                </div>
                <div className="bg-gradient-to-br from-amber-50/40 to-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Awaiting Approval</span>
                  <span className="text-2xl font-black text-amber-700 mt-1 block">{bookingStats.awaitingApproval}</span>
                </div>
                <div className="bg-gradient-to-br from-sky-50/40 to-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm col-span-2 lg:col-span-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Total Value (Excl. Cancelled)</span>
                  <span className="text-2xl font-black text-sky-700 mt-1 block">${bookingStats.totalRevenue.toLocaleString()}</span>
                </div>
              </div>

              {/* Filters bar */}
              <div className="bg-slate-50/70 border border-slate-200/85 p-5 rounded-2xl space-y-4 animate-in fade-in duration-300 delay-150">
                <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
                  <span className="text-xs font-black text-indigo-950 uppercase tracking-wider">Advanced Filters</span>
                  {(bookingSearch || bookingStatusFilter !== "all" || bookingJobFilter !== "all" || bookingStartDate || bookingEndDate) && (
                    <button
                      onClick={() => {
                        setBookingSearch("");
                        setBookingStatusFilter("all");
                        setBookingJobFilter("all");
                        setBookingStartDate("");
                        setBookingEndDate("");
                      }}
                      className="text-[11px] font-bold text-red-650 hover:text-red-750 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      Reset All Filters
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Search query */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Search</label>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        placeholder="Search client, talent, ID..."
                        value={bookingSearch}
                        onChange={e => setBookingSearch(e.target.value)}
                        className="pl-9 h-10 rounded-xl text-sm border-slate-200 bg-white"
                      />
                    </div>
                  </div>

                  {/* Status filter */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Status</label>
                    <select
                      value={bookingStatusFilter}
                      onChange={e => setBookingStatusFilter(e.target.value)}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm font-semibold bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                    >
                      <option value="all">All Statuses</option>
                      <option value="Inquiry">Inquiry</option>
                      <option value="Pending">Pending</option>
                      <option value="Awaiting Approval">Awaiting Approval</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>

                  {/* Job Type filter */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Job Type</label>
                    <select
                      value={bookingJobFilter}
                      onChange={e => setBookingJobFilter(e.target.value)}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm font-semibold bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                    >
                      <option value="all">All Job Types</option>
                      {uniqueJobTypes.map(job => (
                        <option key={job} value={job}>{job}</option>
                      ))}
                    </select>
                  </div>

                  {/* Date range inputs */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Event Date Range</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={bookingStartDate}
                        onChange={e => setBookingStartDate(e.target.value)}
                        className="h-10 px-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                        placeholder="Start Date"
                      />
                      <input
                        type="date"
                        value={bookingEndDate}
                        onChange={e => setBookingEndDate(e.target.value)}
                        className="h-10 px-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                        placeholder="End Date"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Table list */}
              {bookingsLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3 text-indigo-500">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">Loading bookings...</span>
                </div>
              ) : filteredBookings.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-dashed flex flex-col items-center justify-center gap-2">
                  <Briefcase className="w-10 h-10 text-slate-350 stroke-[1.5]" />
                  <p className="font-bold text-slate-800">No bookings match the selected filters.</p>
                  <p className="text-xs text-slate-400">Try loosening your search query or range settings.</p>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="border border-slate-200/85 rounded-2xl overflow-hidden bg-white shadow-sm">
                    {/* Mobile/Tablet Card layout */}
                    <div className="block md:hidden divide-y divide-slate-100">
                      {pagedBookings.map(b => (
                        <div key={b.id} className="p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-slate-400 text-[11px]">
                              #{b.id?.substring(0, 8)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border leading-none ${
                                b.status === "Confirmed" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                b.status === "Completed" ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                                b.status === "Cancelled" ? "bg-red-50 text-red-700 border-red-100" :
                                "bg-amber-50 text-amber-700 border-amber-100"
                              }`}>{b.status || "Inquiry"}</span>
                              
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border leading-none ${
                                b.paymentStatus === "Paid" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                b.paymentStatus === "Awaiting Approval" ? "bg-amber-50 text-amber-700 border-amber-100 animate-pulse" :
                                "bg-slate-50 text-slate-500 border-slate-100"
                              }`}>{b.paymentStatus || "Unpaid"}</span>
                            </div>
                          </div>

                          <div className="space-y-0.5">
                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Client</div>
                            <div className="font-extrabold text-slate-800 text-[13px] leading-tight">{b.clientName || "Unknown Client"}</div>
                            <div className="text-slate-400 text-[11px] truncate leading-none">{b.clientEmail || "No email"}</div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-50">
                            <div>
                              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Event Details</div>
                              <div className="font-bold text-indigo-950 text-[12px] mt-0.5 truncate">{b.jobType || b.__jobType || "General Event"}</div>
                              <div className="flex items-center gap-1 text-[11px] text-slate-400 font-semibold mt-1">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <span>{b.eventDate || "No Date"}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Pricing</div>
                              <div className="font-extrabold text-slate-800 text-[14px] mt-0.5">${b.totalBudget || 0}</div>
                              {(b.city || b.state) && (
                                <div className="text-[11px] text-slate-400 font-semibold mt-1 truncate justify-end flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-slate-450" />
                                  <span>{[b.city, b.state].filter(Boolean)[0] || ""}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-50 flex justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setSelectedBooking(b)} className="h-9 w-full bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 font-bold transition-all text-xs rounded-xl flex items-center justify-center gap-1">
                              Inspect Booking Details <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table Layout */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-150 text-slate-500 font-black tracking-wider text-[10px] uppercase">
                          <tr>
                            <th className="px-6 py-4">ID</th>
                            <th className="px-6 py-4">Client</th>
                            <th className="px-6 py-4">Event details</th>
                            <th className="px-6 py-4">Pricing</th>
                            <th className="px-6 py-4">Status & Payment</th>
                            <th className="px-6 py-4 text-right">Inspect</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {pagedBookings.map(b => (
                            <tr key={b.id} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="px-6 py-4 font-mono font-bold text-slate-450">
                                #{b.id?.substring(0, 8)}...
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-extrabold text-slate-800 text-[13px] block leading-tight">{b.clientName || "Unknown Client"}</span>
                                <span className="text-slate-400 text-[11px] block mt-0.5 truncate max-w-[140px]" title={b.clientEmail}>{b.clientEmail || "No email"}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-bold text-indigo-950 block text-[12px]">{b.jobType || b.__jobType || "General Event"}</span>
                                <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 font-semibold">
                                  {b.eventDate && (
                                    <span className="flex items-center gap-1 shrink-0"><Calendar className="w-3.5 h-3.5 text-slate-400" /> {b.eventDate}</span>
                                  )}
                                  {(b.city || b.state) && (
                                    <span className="flex items-center gap-1 truncate max-w-[120px]"><MapPin className="w-3.5 h-3.5 text-slate-455" /> {[b.city, b.state].filter(Boolean).join(", ")}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-extrabold text-slate-800 text-[13px] block">${b.totalBudget || 0}</span>
                              </td>
                              <td className="px-6 py-4 space-y-1.5">
                                <div className="flex">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase border leading-none ${
                                    b.status === "Confirmed" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                    b.status === "Completed" ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                                    b.status === "Cancelled" ? "bg-red-50 text-red-700 border-red-100" :
                                    "bg-amber-50 text-amber-700 border-amber-100"
                                  }`}>{b.status || "Inquiry"}</span>
                                </div>
                                <span className={`block text-[10px] font-bold ${
                                  b.paymentStatus === "Paid" ? "text-emerald-600" :
                                  b.paymentStatus === "Awaiting Approval" ? "text-amber-600 animate-pulse" :
                                  "text-slate-400"
                                }`}>{b.paymentStatus || "Unpaid"}</span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <Button size="sm" variant="ghost" onClick={() => setSelectedBooking(b)} className="h-8 rounded-lg text-xs hover:bg-indigo-50 hover:text-indigo-600 font-bold transition-all">
                                  Inspect <ChevronRight className="w-3.5 h-3.5 ml-0.5 group-hover:translate-x-0.5 transition-transform" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagination */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                    <p className="text-xs text-slate-400 font-bold">
                      Showing {(bookingPage - 1) * 10 + 1}–{Math.min(bookingPage * 10, filteredBookings.length)} of {filteredBookings.length} bookings
                    </p>
                    {bookingPageCount > 1 && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBookingPage(p => Math.max(1, p - 1))}
                          disabled={bookingPage === 1}
                          className="h-8 rounded-xl px-2.5 text-xs border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-40"
                        >
                          <ChevronLeft className="w-4 h-4 mr-0.5" /> Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: bookingPageCount }, (_, i) => i + 1).map(p => (
                            <button
                              key={p}
                              onClick={() => setBookingPage(p)}
                              className={`w-8 h-8 rounded-xl text-xs font-bold transition-all border ${
                                p === bookingPage
                                  ? "bg-[#1e1b4b] text-white border-[#1e1b4b]"
                                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setBookingPage(p => Math.min(bookingPageCount, p + 1))}
                          disabled={bookingPage === bookingPageCount}
                          className="h-8 rounded-xl px-2.5 text-xs border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-40"
                        >
                          Next <ChevronRight className="w-4 h-4 ml-0.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}


          {/* PAYMENTS APPROVALS TAB */}
          {tab === "payments" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2 pb-4 border-b border-slate-100">
                <CreditCard className="w-5 h-5 text-indigo-500" />
                <h2 className="text-base font-extrabold text-[#1e1b4b]">Company Transaction Hub</h2>
              </div>

              {/* Sub-tab navigation */}
              <div className="flex flex-wrap gap-2 pb-3 border-b border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setPaymentsSubTab("pending")}
                  className={`h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer border ${
                    paymentsSubTab === "pending"
                      ? "bg-[#1e1b4b] text-white border-[#1e1b4b] shadow-md"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" /> Manual Pending Approvals ({payments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentsSubTab("stripe_bookings")}
                  className={`h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer border ${
                    paymentsSubTab === "stripe_bookings"
                      ? "bg-[#1e1b4b] text-white border-[#1e1b4b] shadow-md"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200"
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" /> Stripe Booking Payments ({stripeBookings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentsSubTab("stripe_tips")}
                  className={`h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer border ${
                    paymentsSubTab === "stripe_tips"
                      ? "bg-[#1e1b4b] text-white border-[#1e1b4b] shadow-md"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200"
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> Stripe Tips & Gratuities ({stripeTips.length})
                </button>
              </div>

              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input 
                    placeholder={
                      paymentsSubTab === "pending" 
                        ? "Search pending approvals by client name, booking ID..." 
                        : "Search Stripe payments by client name, email, booking/intent ID..."
                    } 
                    value={paymentSearch}
                    onChange={e => setPaymentSearch(e.target.value)} 
                    className="pl-9 h-10 rounded-xl text-sm" 
                  />
                </div>
                <Button variant="outline" onClick={loadPayments} className="h-10 rounded-xl px-3 text-slate-500 shrink-0">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              {paymentsLoading ? (
                <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-500" /></div>
              ) : (
                <>
                  {/* Tab 1: Pending Manual Approvals */}
                  {paymentsSubTab === "pending" && (
                    <>
                      {filteredPayments.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-sm bg-slate-50 border border-dashed rounded-2xl">
                          No manual payment receipts awaiting approval.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {filteredPayments.map(p => (
                            <div key={p.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
                              <div className="space-y-2">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <span className="text-xs font-mono font-bold text-slate-400">Booking #{p.id.substring(0, 8)}</span>
                                    <h4 className="font-extrabold text-slate-800 text-sm mt-0.5">{p.clientName || "Unnamed Client"}</h4>
                                  </div>
                                  <span className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-black uppercase px-2 py-0.5 rounded border">
                                    Awaiting Approval
                                  </span>
                                </div>
                                <div className="border-t border-slate-200/60 my-2 pt-2 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
                                  <div>Method: <span className="text-slate-800 font-extrabold">{p.paymentMethod || "Manual"}</span></div>
                                  <div>Amount: <span className="text-slate-800 font-extrabold">${p.totalBudget || 0}</span></div>
                                  <div className="col-span-2">Uploaded At: <span className="text-slate-700">{p.receiptUploadedAt ? new Date(p.receiptUploadedAt).toLocaleString("en-GB") : "Pending"}</span></div>
                                </div>
                              </div>

                              {p.paymentReceiptUrl ? (
                                <div className="relative border border-slate-200 rounded-xl overflow-hidden group max-h-[140px] bg-slate-900 cursor-pointer"
                                  onClick={() => setPreviewReceipt(p.paymentReceiptUrl)}>
                                  <img src={p.paymentReceiptUrl} alt="Receipt Screenshot" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                                  <div className="absolute inset-0 bg-black/45 flex items-center justify-center text-white text-[11px] font-black opacity-0 group-hover:opacity-100 transition-all">
                                    Click to expand receipt
                                  </div>
                                </div>
                              ) : (
                                <div className="py-4 text-center text-xs text-slate-400 bg-slate-105 rounded-xl border border-dashed">No screenshot uploaded.</div>
                              )}

                              <div className="flex gap-2 pt-2 border-t border-slate-200/60">
                                <Button
                                  disabled={processingPaymentId !== null}
                                  variant="outline"
                                  onClick={() => { setDeclineBookingId(p.id); setDeclineReason(""); }}
                                  className="flex-1 h-9 rounded-lg text-xs font-bold text-red-650 hover:bg-red-50 hover:text-red-705 border-red-205"
                                >
                                  Decline
                                </Button>
                                <Button
                                  disabled={processingPaymentId !== null}
                                  onClick={() => handleApprovePayment(p)}
                                  className="flex-1 h-9 rounded-lg text-xs font-bold bg-[#1e1b4b] hover:bg-[#312e81] text-white"
                                >
                                  {processingPaymentId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve"}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Tab 2: Stripe Booking Payments */}
                  {paymentsSubTab === "stripe_bookings" && (
                    <>
                      {filteredStripeBookings.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-sm bg-slate-50 border border-dashed rounded-2xl">
                          No Stripe booking payments recorded for this company.
                        </div>
                      ) : (
                        <div className="border border-slate-200/85 rounded-2xl overflow-hidden bg-white shadow-sm">
                          {/* Mobile Card Layout */}
                          <div className="block md:hidden divide-y divide-slate-100">
                            {filteredStripeBookings.map(b => (
                              <div key={b.id} className="p-4 space-y-2.5 text-xs font-semibold">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <span className="text-[10px] text-slate-400 font-mono block">Booking Ref: #{b.id.substring(0, 8).toUpperCase()}</span>
                                    <h4 className="font-extrabold text-slate-800 text-[13px] mt-0.5">{b.clientName || "Unnamed Client"}</h4>
                                  </div>
                                  <span className="text-[#1e1b4b] font-black text-sm">${(b.payRate || b.__budget || b.totalBudget || 0)}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 space-y-1">
                                  <div>Job Type: <span className="text-slate-700 font-bold">{b.jobType || b.__jobType || "Event Services"}</span></div>
                                  <div className="truncate">Stripe ID: <span className="text-indigo-600 font-mono text-[10px]">{b.stripePaymentIntentId || b.stripeCheckoutSessionId || "Card Payment"}</span></div>
                                  <div>Paid Date: <span className="text-slate-500">{b.paidAt ? formatDate(b.paidAt) : "Paid"}</span></div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Desktop Table Layout */}
                          <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left text-xs font-medium">
                              <thead className="bg-slate-50 border-b border-slate-150 text-slate-500 font-black tracking-wider text-[10px] uppercase">
                                <tr>
                                  <th className="px-6 py-4">Paid Date</th>
                                  <th className="px-6 py-4">Booking Ref</th>
                                  <th className="px-6 py-4">Client</th>
                                  <th className="px-6 py-4">Job Type</th>
                                  <th className="px-6 py-4">Amount</th>
                                  <th className="px-6 py-4">Stripe Intent ID</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                {filteredStripeBookings.map(b => (
                                  <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 text-slate-500">{b.paidAt ? formatDate(b.paidAt) : "Paid"}</td>
                                    <td className="px-6 py-4 font-mono font-bold text-slate-400">#{b.id.substring(0, 8).toUpperCase()}</td>
                                    <td className="px-6 py-4">
                                      <span className="font-extrabold text-slate-800 block">{b.clientName || "Unnamed Client"}</span>
                                      <span className="text-slate-400 text-[10px] block mt-0.5">{b.clientEmail || ""}</span>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-slate-700">{b.jobType || b.__jobType || "Event Services"}</td>
                                    <td className="px-6 py-4 font-black text-slate-900">${(b.payRate || b.__budget || b.totalBudget || 0)}</td>
                                    <td className="px-6 py-4 font-mono text-slate-500 text-[10.5px] truncate max-w-[200px]" title={b.stripePaymentIntentId || b.stripeCheckoutSessionId}>{b.stripePaymentIntentId || b.stripeCheckoutSessionId || "Card Payment"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Tab 3: Stripe Tip Payments */}
                  {paymentsSubTab === "stripe_tips" && (
                    <>
                      {filteredStripeTips.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 text-sm bg-slate-50 border border-dashed rounded-2xl">
                          No Stripe tip payments recorded for this company.
                        </div>
                      ) : (
                        <div className="border border-slate-200/85 rounded-2xl overflow-hidden bg-white shadow-sm">
                          {/* Mobile Card Layout */}
                          <div className="block md:hidden divide-y divide-slate-100">
                            {filteredStripeTips.map(b => (
                              <div key={b.id} className="p-4 space-y-2.5 text-xs font-semibold">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <span className="text-[10px] text-slate-400 font-mono block">Booking Ref: #{b.id.substring(0, 8).toUpperCase()}</span>
                                    <h4 className="font-extrabold text-slate-800 text-[13px] mt-0.5">{b.clientName || "Unnamed Client"}</h4>
                                  </div>
                                  <span className="text-emerald-700 font-black text-sm">${(b.tipAmount || 0)}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 space-y-1">
                                  <div>Recipient Talent: <span className="text-slate-700 font-bold">{b.talentName || "Talent"}</span></div>
                                  <div className="truncate">Stripe ID: <span className="text-indigo-600 font-mono text-[10px]">{b.tipStripePaymentIntentId || "Card"}</span></div>
                                  <div>Paid Date: <span className="text-slate-600">{b.tipPaidAt ? formatDate(b.tipPaidAt) : "Paid"}</span></div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Desktop Table Layout */}
                          <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left text-xs font-medium">
                              <thead className="bg-slate-50 border-b border-slate-150 text-slate-500 font-black tracking-wider text-[10px] uppercase">
                                <tr>
                                  <th className="px-6 py-4">Paid Date</th>
                                  <th className="px-6 py-4">Booking Ref</th>
                                  <th className="px-6 py-4">Client</th>
                                  <th className="px-6 py-4">Recipient Talent</th>
                                  <th className="px-6 py-4">Tip Amount</th>
                                  <th className="px-6 py-4">Stripe Intent ID</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                {filteredStripeTips.map(b => (
                                  <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 text-slate-500">{b.tipPaidAt ? formatDate(b.tipPaidAt) : "Paid"}</td>
                                    <td className="px-6 py-4 font-mono font-bold text-slate-400">#{b.id.substring(0, 8).toUpperCase()}</td>
                                    <td className="px-6 py-4">
                                      <span className="font-extrabold text-slate-800 block">{b.clientName || "Unnamed Client"}</span>
                                      <span className="text-slate-400 text-[10px] block mt-0.5">{b.clientEmail || ""}</span>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-slate-700">{b.talentName || "Talent"}</td>
                                    <td className="px-6 py-4 font-black text-emerald-600">${(b.tipAmount || 0)}</td>
                                    <td className="px-6 py-4 font-mono text-slate-500 text-[10.5px] truncate max-w-[200px]" title={b.tipStripePaymentIntentId}>{b.tipStripePaymentIntentId || "Card Payment"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Decline Reason Modal Dialog */}
              {declineBookingId && (
                <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-sm p-6 border animate-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-black text-[#1e1b4b]">Decline Payment Receipt</h3>
                      <button onClick={() => setDeclineBookingId(null)} className="p-1 hover:bg-slate-100 text-slate-400 rounded-lg"><X className="w-4 h-4" /></button>
                    </div>
                    <textarea
                      placeholder="Please specify a brief reason for declining the manual payment receipt..."
                      value={declineReason}
                      onChange={e => setDeclineReason(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none h-24 mb-4"
                      required
                    />
                    <div className="flex gap-3">
                      <Button onClick={() => setDeclineBookingId(null)} variant="outline" className="flex-1 h-9 rounded-lg text-xs font-bold">Cancel</Button>
                      <Button onClick={handleDeclinePayment} disabled={processingPaymentId !== null || !declineReason.trim()}
                        className="flex-1 h-9 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white">
                        {processingPaymentId !== null ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : "Confirm Decline"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Receipt Preview Image Modal Overlay */}
              {previewReceipt && (
                <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setPreviewReceipt(null)}>
                  <div className="relative max-w-4xl max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setPreviewReceipt(null)} className="absolute top-4 right-4 bg-slate-900/60 p-2 text-white hover:bg-slate-900 rounded-full shadow-lg">
                      <X className="w-5 h-5" />
                    </button>
                    <img src={previewReceipt} alt="Full size payment receipt" className="max-w-full max-h-[85vh] object-contain rounded-xl border border-slate-800" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUBSCRIPTION PLAN TAB */}
          {tab === "subscription" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 mb-2 pb-4 border-b border-slate-100">
                <DollarSign className="w-5 h-5 text-indigo-500" />
                <h2 className="text-base font-extrabold text-[#1e1b4b]">Subscription & Billing</h2>
              </div>

              {/* Plan & Trial Status Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Plan Details Card */}
                <div className="bg-gradient-to-br from-indigo-50/10 via-white to-white border border-slate-200/60 border-l-4 border-l-indigo-500 rounded-[22px] p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-500" /> Current Plan
                    </h3>
                    <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {company.selectedPlan || "starter"}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {(() => {
                      const hasCustomPrice = isCustomPriceActive(company);
                      const planKey = (company.selectedPlan || "starter").toLowerCase();
                      const basePrice = dynamicPlans[planKey]?.price ?? PLAN_DEFAULTS[planKey as keyof typeof PLAN_DEFAULTS]?.price ?? 49;
                      const customPricePeriodLabel = company.customPricePeriod === "lifetime" ? "Lifetime" : `/${company.customPricePeriod}`;
                      return (
                        <>
                          <div className="flex justify-between items-end">
                            <div>
                              <p className="text-2xl font-black text-[#1e1b4b] capitalize">
                                {dynamicPlans[planKey]?.name || PLAN_DEFAULTS[planKey as keyof typeof PLAN_DEFAULTS]?.name || company.selectedPlan || "Starter"}
                              </p>
                              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Workspace billing limits</p>
                            </div>
                            <div className="text-right">
                              {hasCustomPrice ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-xs text-slate-450 font-bold line-through">
                                    ${basePrice}/mo
                                  </span>
                                  <span className="text-2xl font-black text-indigo-600 flex items-center gap-0.5">
                                    ${company.customPrice}
                                    <span className="text-xs text-slate-400 font-bold capitalize">{customPricePeriodLabel}</span>
                                  </span>
                                </div>
                              ) : (
                                <div>
                                  <span className="text-2xl font-black text-slate-800">
                                    ${basePrice}
                                  </span>
                                  <span className="text-xs text-slate-400 font-bold">/mo</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Limits checklist */}
                          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100/60 space-y-2 text-xs font-semibold text-slate-600">
                            <div className="flex items-center justify-between">
                              <span>Max Administrators</span>
                              <span className="text-slate-800 font-bold">
                                {company.planLimits?.maxAdmins === -1 ? "Unlimited" : (company.planLimits?.maxAdmins || 1)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Max Staff/Agents</span>
                              <span className="text-slate-800 font-bold">
                                {company.planLimits?.maxStaff === -1 ? "Unlimited" : (company.planLimits?.maxStaff || 1)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Max Talents on Roster</span>
                              <span className="text-slate-800 font-bold">
                                {company.planLimits?.maxTalents === -1 ? "Unlimited" : (company.planLimits?.maxTalents || 25)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Max Bookings per month</span>
                              <span className="text-slate-800 font-bold">
                                {company.planLimits?.maxBookings === -1 ? "Unlimited" : (company.planLimits?.maxBookings || 50)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Custom Branding</span>
                              <span className="text-slate-800 font-bold">
                                {company.planLimits?.customBranding ? "Included" : "Not Included"}
                              </span>
                            </div>
                          </div>

                          {/* Update Plan Select */}
                          {hasPermission("edit_company") && (
                            <div className="pt-2 border-t border-slate-100 space-y-2">
                              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Change/Upgrade Plan</label>
                              <div className="flex gap-2">
                                <select
                                  defaultValue={company.selectedPlan || "starter"}
                                  onChange={(e) => handleUpdatePlan(e.target.value as any)}
                                  disabled={updatingPlan}
                                  className="flex-1 h-9 px-2.5 border border-slate-200 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                >
                                  <option value="starter">Starter Plan (${dynamicPlans["starter"]?.price ?? 49}/mo)</option>
                                  <option value="professional">Professional Plan (${dynamicPlans["professional"]?.price ?? 99}/mo)</option>
                                  <option value="enterprise">Enterprise Plan (${dynamicPlans["enterprise"]?.price ?? 199}/mo)</option>
                                </select>
                                {updatingPlan && <Loader2 className="w-4 h-4 animate-spin self-center text-indigo-500" />}
                              </div>
                            </div>
                          )}

                          {/* Special Custom Price / Discount section */}
                          {hasPermission("edit_company") && (
                            <div className="pt-3 border-t border-slate-100 space-y-2">
                              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Special Offer / Custom Price</label>
                              {hasCustomPrice ? (
                                <div className="bg-gradient-to-br from-indigo-50/50 to-indigo-100/30 border border-indigo-150 rounded-xl p-3.5 space-y-2 text-xs font-semibold text-slate-700">
                                  <div className="flex justify-between items-center">
                                    <span className="text-indigo-700 font-extrabold flex items-center gap-1.5">
                                      <Star className="w-4 h-4 fill-indigo-500 text-indigo-500 shrink-0" /> Custom Price Offer Active
                                    </span>
                                    <button
                                      onClick={handleRemoveCustomPrice}
                                      className="text-[10px] font-extrabold text-red-650 hover:text-red-700 hover:underline bg-white border border-red-100 shadow-sm px-2 py-1 rounded-lg transition-all"
                                    >
                                      Remove Offer
                                    </button>
                                  </div>
                                  <div className="text-[11px] text-slate-500 space-y-1">
                                    <div>Offered Price: <span className="text-slate-800 font-black">${company.customPrice} {customPricePeriodLabel}</span></div>
                                    <div>Validity: <span className="text-slate-800 font-bold">{company.customPriceEndDate ? `Until ${formatDate(company.customPriceEndDate)}` : "Lifetime (Never expires)"}</span></div>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomPriceVal(basePrice); // Default to clean base price instead of 20% discount fraction
                                    setCustomPriceInterval("month");
                                    setCustomPriceValidity("limited");
                                    setCustomPriceDurVal(6);
                                    setShowCustomPriceModal(true);
                                  }}
                                  className="w-full h-9 rounded-xl border border-indigo-100 bg-indigo-50 hover:bg-indigo-105 text-indigo-650 hover:text-indigo-700 text-xs font-extrabold transition-all active:scale-95"
                                >
                                  Offer Discount or Custom Price
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Free Trial / Subscription Management Card */}
                {(() => {
                  const { isTrialActive, isTrialExpired, trialDaysLeft, isActive } = getSubscriptionBadge(company);
                  const borderClass = isTrialActive 
                    ? "border-l-4 border-l-amber-500" 
                    : isTrialExpired 
                      ? "border-l-4 border-l-rose-500" 
                      : "border-l-4 border-l-emerald-500";
                  const bgGradient = isTrialActive
                    ? "from-amber-50/15 via-white to-white"
                    : isTrialExpired
                      ? "from-rose-50/15 via-white to-white"
                      : "from-emerald-50/15 via-white to-white";

                  const nextPaymentDate = company.nextPaymentDate
                    ? (company.nextPaymentDate.toDate ? company.nextPaymentDate.toDate() : new Date(company.nextPaymentDate))
                    : (company.trialEndDate
                      ? (() => {
                          const trialEnd = company.trialEndDate.toDate ? company.trialEndDate.toDate() : new Date(company.trialEndDate);
                          const next = new Date(trialEnd);
                          next.setMonth(next.getMonth() + 1);
                          return next;
                        })()
                      : new Date());

                  return (
                    <div className={`bg-gradient-to-br ${bgGradient} border border-slate-200/60 ${borderClass} rounded-[22px] p-5 shadow-sm space-y-4`}>
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Clock className={`w-3.5 h-3.5 ${isActive ? "text-emerald-500" : "text-amber-500"}`} /> 
                          {isActive ? "Active Subscription Period" : "Free Trial Period"}
                        </h3>
                        {isTrialActive && <span className="bg-amber-50 text-amber-700 border border-amber-100 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full">Trialing</span>}
                        {isTrialExpired && <span className="bg-rose-50 text-rose-750 border border-rose-100 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full">Expired</span>}
                        {isActive && <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full">Paid Active</span>}
                      </div>

                      <div className="space-y-4">
                        {isActive ? (
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-500">
                              {company.customPricePeriod === "lifetime" ? "Billing Status" : "Next Billing Date / Subscription End Date"}
                            </p>
                            <p className="text-lg font-black text-slate-800">
                              {company.customPricePeriod === "lifetime" ? "Lifetime Paid" : formatDate(nextPaymentDate)}
                            </p>
                            <p className="text-xs text-emerald-600 font-bold">(Active Paid Subscription)</p>
                          </div>
                        ) : company.trialEndDate ? (
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-500">Trial End Date</p>
                            <p className="text-lg font-black text-slate-800">
                              {formatDate(company.trialEndDate)}
                            </p>
                            {isTrialActive ? (
                              <p className="text-xs text-amber-600 font-bold">({trialDaysLeft} days remaining)</p>
                            ) : (
                              <p className="text-xs text-rose-500 font-bold">(Trial period has ended)</p>
                            )}
                          </div>
                        ) : (
                          <div className="py-2">
                            <p className="text-sm text-slate-400 italic font-semibold">No free trial config. Company is on a regular billing schedule.</p>
                          </div>
                        )}

                        {/* Extend Trial / Subscription Form */}
                        {hasPermission("edit_company") && (
                          <div className="pt-2 border-t border-slate-100 space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                              {isActive ? "Extend Subscription Days" : "Extend / Reset Free Trial"}
                            </label>
                            <div className="flex flex-wrap gap-2 items-center">
                              <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                                <button
                                  type="button"
                                  onClick={() => handleExtendTrial(7)}
                                  disabled={extendingTrial}
                                  className="h-9 px-3 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100/70 text-amber-800 text-xs font-black transition-all flex-1 sm:flex-initial text-center"
                                >
                                  +7 Days
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleExtendTrial(14)}
                                  disabled={extendingTrial}
                                  className="h-9 px-3 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100/70 text-amber-800 text-xs font-black transition-all flex-1 sm:flex-initial text-center"
                                >
                                  +14 Days
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleExtendTrial(30)}
                                  disabled={extendingTrial}
                                  className="h-9 px-3 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100/70 text-amber-800 text-xs font-black transition-all flex-1 sm:flex-initial text-center"
                                >
                                  +30 Days
                                </button>
                              </div>

                              {/* Custom date option */}
                              <div className="flex gap-1.5 items-center w-full sm:w-auto mt-1 sm:mt-0">
                                <input
                                  type="number"
                                  placeholder="Days"
                                  min={1}
                                  max={365}
                                  value={extendDays}
                                  onChange={e => setExtendDays(Number(e.target.value))}
                                  className="w-16 h-9 px-2 border border-slate-200 rounded-xl text-xs font-bold text-center outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleExtendTrial(extendDays)}
                                  disabled={extendingTrial || extendDays <= 0}
                                  className="h-9 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold transition-all flex items-center justify-center flex-1 sm:flex-initial"
                                >
                                  {extendingTrial ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Extend"}
                                </button>
                              </div>
                            </div>

                            {/* End Free Trial Button */}
                            {isTrialActive && (
                              <div className="pt-2 border-t border-dashed border-slate-150 flex justify-end">
                                <button
                                  type="button"
                                  onClick={handleEndTrial}
                                  disabled={extendingTrial}
                                  className="h-9 px-4 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer transition-all border border-rose-650"
                                >
                                  {extendingTrial ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                                  End Free Trial Period
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* Payment History Section */}
              <div className="bg-white border border-slate-200/60 rounded-[22px] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> Subscription Payment History
                  </h3>
                </div>

                {subPaymentsLoading ? (
                  <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
                ) : subPayments.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs bg-slate-50 border border-dashed rounded-xl">
                    No subscription payment records logged.
                  </div>
                ) : (
                  <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                    
                    {/* Mobile Card Layout */}
                    <div className="block sm:hidden divide-y divide-slate-100">
                      {subPayments.map((p) => (
                        <div key={p.id} className="p-3.5 space-y-2 text-xs font-semibold">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] text-slate-400 font-mono block">ID: {p.id.substring(0,8)}</span>
                              <span className="text-slate-800 font-bold block text-sm mt-0.5">{p.billingPeriod}</span>
                            </div>
                            <span className="text-slate-800 font-black text-sm">${p.amount}</span>
                          </div>
                          
                          <div className="flex justify-between items-center text-[11px] pt-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">Method:</span>
                              <span className="text-slate-600 font-bold">{p.paymentMethod}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              p.status === "Paid" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                              p.status === "Pending" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                              "bg-red-50 text-red-750 border border-red-100"
                            }`}>
                              {p.status}
                            </span>
                          </div>

                          <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                            <span className="text-[10px] text-slate-400">Paid: {formatDate(p.paidAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table Layout */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase">
                          <tr>
                            <th className="px-4 py-3">Billing Period</th>
                            <th className="px-4 py-3">Amount</th>
                            <th className="px-4 py-3">Method</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Paid Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {subPayments.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-50/40">
                              <td className="px-4 py-3 font-bold text-slate-800">{p.billingPeriod}</td>
                              <td className="px-4 py-3 font-black text-slate-900">${p.amount}</td>
                              <td className="px-4 py-3">{p.paymentMethod}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                  p.status === "Paid" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                                  p.status === "Pending" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                                  "bg-red-50 text-red-750 border border-red-100"
                                }`}>
                                  {p.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-500">{formatDate(p.paidAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                  </div>
                )}
              </div>

              {/* Record Payment Dialog Modal Overlay */}
              {showRecordPayment && (
                <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-sm p-6 border animate-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-black text-[#1e1b4b]">Record Subscription Payment</h3>
                      <button onClick={() => setShowRecordPayment(false)} className="p-1 hover:bg-slate-100 text-slate-400 rounded-lg"><X className="w-4 h-4" /></button>
                    </div>
                    
                    <form onSubmit={handleRecordPayment} className="space-y-3.5">
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Billing Period *</label>
                        <Input
                          placeholder="e.g. June 2026"
                          value={payPeriod}
                          onChange={e => setPayPeriod(e.target.value)}
                          required
                          className="h-10 rounded-xl text-xs font-semibold"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Amount ($) *</label>
                          <Input
                            type="number"
                            min={0.01}
                            step={0.01}
                            placeholder="99.00"
                            value={payAmount || ""}
                            onChange={e => setPayAmount(Number(e.target.value))}
                            required
                            className="h-10 rounded-xl text-xs font-semibold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Payment Method</label>
                          <select
                            value={payMethod}
                            onChange={e => setPayMethod(e.target.value)}
                            className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none"
                          >
                            <option value="Stripe">Stripe Card</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="PayPal">PayPal</option>
                            <option value="Manual Check">Manual Check</option>
                            <option value="Cash">Cash Payment</option>
                            <option value="Other/Manual">Other / Manual</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Payment Status</label>
                          <select
                            value={payStatus}
                            onChange={e => setPayStatus(e.target.value as any)}
                            className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none"
                          >
                            <option value="Paid">Paid</option>
                            <option value="Pending">Pending</option>
                            <option value="Failed">Failed</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Payment Date</label>
                          <input
                            type="date"
                            value={payDate}
                            onChange={e => setPayDate(e.target.value)}
                            className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>

                      <div className="flex gap-3 pt-3 border-t border-slate-100 mt-4">
                        <Button type="button" onClick={() => setShowRecordPayment(false)} variant="outline" className="flex-1 h-10 rounded-xl text-xs font-bold">Cancel</Button>
                        <Button type="submit" disabled={recordingPayment} className="flex-1 h-10 rounded-xl text-xs font-bold bg-[#1e1b4b] hover:bg-[#312e81] text-white">
                          {recordingPayment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Record"}
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Custom Price / Discount Offer Dialog Modal Overlay */}
              {showCustomPriceModal && (
                <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                  <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-sm p-6 border animate-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-black text-[#1e1b4b]">Offer Custom Price / Discount</h3>
                      <button onClick={() => setShowCustomPriceModal(false)} className="p-1 hover:bg-slate-100 text-slate-400 rounded-lg"><X className="w-4 h-4" /></button>
                    </div>
                    
                    <form onSubmit={handleSetCustomPrice} className="space-y-4">
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Custom Offered Price ($) *</label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="e.g. 29.99"
                          value={customPriceVal === 0 ? 0 : (customPriceVal || "")}
                          onChange={e => setCustomPriceVal(Number(e.target.value))}
                          required
                          className="h-10 rounded-xl text-xs font-semibold"
                        />
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">
                          Enter any custom price or discount. Set to 0 for free access.
                        </p>
                      </div>
                      
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Billing Interval</label>
                        <select
                          value={customPriceInterval}
                          onChange={e => setCustomPriceInterval(e.target.value as any)}
                          className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none"
                        >
                          <option value="month">Monthly Subscription</option>
                          <option value="year">Yearly Subscription</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Offer Validity / Duration</label>
                        <select
                          value={customPriceValidity}
                          onChange={e => setCustomPriceValidity(e.target.value as any)}
                          className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-semibold bg-white outline-none"
                        >
                          <option value="limited">Limited Time (Expires after a period)</option>
                          <option value="lifetime">Lifetime Offer (Stays active forever / No expiry)</option>
                        </select>
                      </div>

                      {customPriceValidity === "limited" && (
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                            Offer Duration (in {customPriceInterval === "month" ? "months" : "years"}) *
                          </label>
                          <Input
                            type="number"
                            min={1}
                            placeholder={`e.g. ${customPriceInterval === "month" ? 6 : 1}`}
                            value={customPriceDurVal || ""}
                            onChange={e => setCustomPriceDurVal(Number(e.target.value))}
                            required
                            className="h-10 rounded-xl text-xs font-semibold"
                          />
                          <p className="text-[10px] text-slate-400 mt-1 font-medium">
                            Price will automatically return to plan default after {customPriceDurVal} {customPriceInterval === "month" ? "months" : "years"}.
                          </p>
                        </div>
                      )}

                      <div className="flex gap-3 pt-3 border-t border-slate-100 mt-4">
                        <Button type="button" onClick={() => setShowCustomPriceModal(false)} variant="outline" className="flex-1 h-10 rounded-xl text-xs font-bold">Cancel</Button>
                        <Button type="submit" disabled={savingCustomPrice} className="flex-1 h-10 rounded-xl text-xs font-bold bg-[#1e1b4b] hover:bg-[#312e81] text-white">
                          {savingCustomPrice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply Offer"}
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MASTER NOTES TAB */}
          {tab === "notes" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2 pb-4 border-b border-slate-100">
                <FileText className="w-5 h-5 text-indigo-500" />
                <h2 className="text-base font-extrabold text-[#1e1b4b]">Company Master Log & Notes</h2>
              </div>
              <p className="text-xs text-slate-500 font-semibold mb-2">Record crucial superadmin flags, payment notes, or alerts about this agency. Internal staff and clients will not see these logs.</p>
              <div className="h-[450px]">
                <EntityNotes
                  companyId={company.id}
                  entityId={company.id}
                  entityType="company"
                  title="Superadmin Log File"
                  placeholder="Log superadmin operational details, agency notes, or blacklist history..."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

      {/* ── SUB-MODAL DETAIL DIALOGS ── */}

      {/* Booking Details Modal */}
      {selectedBooking && (
        <BookingDetailsModal
          booking={selectedBooking}
          onSearch={(val) => {
            setClientSearch(val);
            setTab("clients");
          }}
          onClose={() => setSelectedBooking(null)}
          talentsDict={talentsDict}
          setShowAssignModal={() => {}}
          setManageTalentId={(tid) => {
            if (tid && talentsDict[tid]) {
              setSelectedTalent(talentsDict[tid]);
            }
          }}
          setShowActivityModal={setShowActivityModal}
          fetchAllCompanyTalents={() => {}}
          onApprovePayment={handleApprovePaymentFromModal}
          onDeclinePayment={handleDeclinePaymentFromModal}
          onRateClient={async () => {
            try {
              const q = query(collection(db, "client_internal_ratings"), where("bookingId", "==", selectedBooking.id));
              const snap = await getDocs(q);
              if (!snap.empty) {
                const data = snap.docs[0].data();
                Swal.fire({
                  title: 'Internal Client Evaluation',
                  html: `
                    <div class="text-left space-y-3 font-semibold text-slate-700">
                      <div class="flex justify-between border-b pb-2">
                        <span>Punctuality:</span>
                        <span class="font-black text-indigo-650">${data.punctuality || 5} / 5</span>
                      </div>
                      <div class="flex justify-between border-b pb-2">
                        <span>Communication:</span>
                        <span class="font-black text-indigo-650">${data.communication || 5} / 5</span>
                      </div>
                      <div class="flex justify-between border-b pb-2">
                        <span>Reliability & Attitude:</span>
                        <span class="font-black text-indigo-650">${data.reliability || 5} / 5</span>
                      </div>
                      <div class="pt-2">
                        <span class="text-xs text-slate-400 block mb-1">Private Comments</span>
                        <p class="text-sm bg-slate-50 p-3 rounded-xl border italic text-slate-605">${data.comment || "No comments entered."}</p>
                      </div>
                    </div>
                  `,
                  icon: 'info',
                  confirmButtonText: 'Close',
                  confirmButtonColor: '#4f46e5',
                  customClass: {
                    popup: 'rounded-3xl',
                    confirmButton: 'rounded-xl font-bold px-6 py-2.5',
                  }
                });
              } else {
                showInfo("No internal evaluation has been recorded for this booking yet.");
              }
            } catch (err) {
              console.error(err);
              showError("Failed to load evaluation details.");
            }
          }}
          userId={user?.uid || "master_admin"}
          onChat={() => setChatBooking(selectedBooking)}
          isMaster={true}
        />
      )}

      {/* Talent Details Modal */}
      {selectedTalent && (() => {
        // Calculate booking metrics dynamically from `bookings` list
        const talentBookings = bookings.filter((b: any) => {
          return b.talentId === selectedTalent.id || 
                 (Array.isArray(b.selectedTalentIds) && b.selectedTalentIds.includes(selectedTalent.id));
        });
        const completedJobs = talentBookings.filter((b: any) => b.status === "Completed").length;
        const cancelledJobs = talentBookings.filter((b: any) => b.status === "Cancelled").length;
        const activeJobs = talentBookings.filter((b: any) => b.status === "Confirmed" || b.status === "Active").length;
        const pendingJobs = talentBookings.filter((b: any) => b.status === "Pending" || b.status === "Awaiting Approval" || b.status === "Inquiry" || (!b.status)).length;

        // Parse Blocked/Unavailable Dates
        const upcomingBlockedDates = (selectedTalent.blockedDates || selectedTalent.unavailableDates || [])
          .map((item: any) => {
            if (typeof item === "string") {
              return { date: item, reason: "Unavailable" };
            } else if (item && typeof item === "object") {
              return { date: item.date || item.formattedDate || "", reason: item.reason || "Unavailable" };
            }
            return null;
          })
          .filter((item: any) => item && item.date)
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Parse Working Hours
        const parseTime = (timeStr: string) => {
          if (!timeStr) return "—";
          try {
            const [hourStr, minStr] = timeStr.split(":");
            const hour = parseInt(hourStr, 10);
            const ampm = hour >= 12 ? "PM" : "AM";
            const formattedHour = hour % 12 || 12;
            return `${formattedHour}:${minStr || "00"} ${ampm}`;
          } catch {
            return timeStr;
          }
        };

        let workingHoursDisplay = "Not set";
        if (selectedTalent.workingHours) {
          if (typeof selectedTalent.workingHours === "object") {
            const start = selectedTalent.workingHours.start;
            const end = selectedTalent.workingHours.end;
            if (start && end) {
              workingHoursDisplay = `${parseTime(start)} - ${parseTime(end)}`;
            } else if (start) {
              workingHoursDisplay = `Starts at ${parseTime(start)}`;
            } else if (end) {
              workingHoursDisplay = `Ends at ${parseTime(end)}`;
            }
          } else if (typeof selectedTalent.workingHours === "string") {
            workingHoursDisplay = selectedTalent.workingHours;
          }
        }

        // Coverage Locations
        const coverageLocs = selectedTalent.coverageLocations || selectedTalent.locations || [];
        const formattedCoverageLocs = Array.isArray(coverageLocs) 
          ? coverageLocs.join(", ") 
          : (typeof coverageLocs === "string" ? coverageLocs : "—");

        // Gender Representation
        const genderRep = selectedTalent.genderRepresentation || selectedTalent.gender || "—";

        // Primary Job Types
        const primaryJobTypes = selectedTalent.primaryJobTypes || selectedTalent.talentType || "—";
        const formattedJobTypes = Array.isArray(primaryJobTypes) 
          ? primaryJobTypes.join(", ") 
          : (typeof primaryJobTypes === "string" ? primaryJobTypes : "—");

        return (
          <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200" onClick={() => { setSelectedTalent(null); setShowTalentNotesModal(false); }}>
            <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-5xl border border-slate-100 overflow-hidden h-[90vh] lg:h-[760px] flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              
              {/* Header */}
              <div className="px-4 sm:px-6 py-4 border-b border-slate-200/60 flex items-center justify-between bg-gradient-to-r from-[#1e1b4b] to-[#2e2a72] text-white shrink-0">
                <div className="flex items-center gap-3.5">
                  {selectedTalent.profileImage ? (
                    <img src={selectedTalent.profileImage} alt={selectedTalent.displayName} className="w-12 h-12 rounded-2xl object-cover border border-white/20 shadow-inner" />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center font-black text-white text-lg border border-white/10 shadow-inner">
                      {selectedTalent.displayName?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  <div>
                    <h3 className="font-extrabold text-white text-base leading-tight">{selectedTalent.displayName}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-300 font-mono">ID: #{selectedTalent.numericId || "Pending"}</span>
                      <span className="w-1 h-1 rounded-full bg-white/30" />
                      <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-emerald-300`}>
                        <span className="w-1 h-1 rounded-full bg-emerald-400" />
                        {selectedTalent.status || "active"}
                      </span>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setSelectedTalent(null); setShowTalentNotesModal(false); }} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors">
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Main Content Split Panels */}
              <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 flex-1 overflow-y-auto lg:overflow-hidden bg-white">
                
                {/* Left Panel: Profile, Stats, Demographics (Col-span 5) */}
                <div className="lg:col-span-5 p-4 sm:p-6 flex flex-col gap-5 lg:overflow-y-auto custom-scrollbar">
                  
                  {/* Booking Metrics Grid */}
                  <div className="space-y-3 shrink-0">
                    <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Job Metrics</h5>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-indigo-50/50 border border-indigo-100/60 p-4 rounded-xl shadow-sm flex flex-col justify-between min-h-[75px]">
                        <span className="text-[9px] font-black text-indigo-650 uppercase tracking-wider block">Assigned / Active</span>
                        <span className="text-xl font-black text-[#1e1b4b] mt-1 block">{activeJobs}</span>
                      </div>
                      <div className="bg-emerald-50/50 border border-emerald-100/60 p-4 rounded-xl shadow-sm flex flex-col justify-between min-h-[75px]">
                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider block">Completed</span>
                        <span className="text-xl font-black text-emerald-950 mt-1 block">{completedJobs}</span>
                      </div>
                      <div className="bg-amber-50/50 border border-amber-100/60 p-4 rounded-xl shadow-sm flex flex-col justify-between min-h-[75px]">
                        <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider block">Pending</span>
                        <span className="text-xl font-black text-amber-950 mt-1 block">{pendingJobs}</span>
                      </div>
                      <div className="bg-rose-50/50 border border-rose-100/60 p-4 rounded-xl shadow-sm flex flex-col justify-between min-h-[75px]">
                        <span className="text-[9px] font-black text-rose-650 uppercase tracking-wider block">Cancelled</span>
                        <span className="text-xl font-black text-[#881337] mt-1 block">{cancelledJobs}</span>
                      </div>
                    </div>
                  </div>

                  {/* Specialty Details Panel */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4 shrink-0">
                    <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                      <Star className="w-4 h-4 text-amber-500" /> Demographics & Specialty
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Gender Representation</span>
                        <span className="text-slate-800 font-extrabold capitalize block">{genderRep}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Primary Job Types / Role</span>
                        <span className="text-indigo-600 font-extrabold block">{formattedJobTypes}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Coverage Locations</span>
                        <span className="text-slate-800 font-extrabold block">{formattedCoverageLocs || "—"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Working Hours</span>
                        <span className="text-slate-850 font-extrabold flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-500" />
                          {workingHoursDisplay}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Physical Attributes (Age, Height, etc.) */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-3.5 shrink-0">
                    <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                      <User className="w-4 h-4 text-indigo-500" /> Physical Attributes
                    </h5>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Age</span>
                        <span className="text-slate-800 font-extrabold block">{selectedTalent.age || "—"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Height</span>
                        <span className="text-slate-800 font-extrabold block">{selectedTalent.height || "—"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Weight</span>
                        <span className="text-slate-800 font-extrabold block">{selectedTalent.weight || "—"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Hair Color</span>
                        <span className="text-slate-800 font-extrabold block">{selectedTalent.hairColor || "—"}</span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right Panel: Unavailable Dates, Contact, and Internal Notes (Col-span 7) */}
                <div className="lg:col-span-7 flex flex-col h-auto lg:h-full lg:overflow-hidden bg-slate-50/20">
                  
                  <div className="p-4 sm:p-6 space-y-5 flex-1 lg:overflow-y-auto custom-scrollbar">
                    
                    {/* Contact details */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
                      <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                        <Mail className="w-4 h-4 text-indigo-500" /> Contact Details
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-0.5 min-w-0">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Email Address</span>
                          <span className="text-slate-805 font-extrabold font-mono block break-all" title={selectedTalent.email}>{selectedTalent.email}</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Phone Number</span>
                          <span className="text-slate-805 font-extrabold block">{selectedTalent.phoneNumber || "—"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Upcoming Unavailable Dates */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-3">
                      <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                        <Calendar className="w-4 h-4 text-rose-500" /> Upcoming Unavailable Dates
                      </h5>
                      {upcomingBlockedDates.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No upcoming unavailable/blocked dates recorded.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[150px] overflow-y-auto pr-1">
                          {upcomingBlockedDates.map((d: any, idx: number) => {
                            let displayDate = d.date;
                            try {
                              displayDate = new Date(d.date).toLocaleDateString("en-US", {
                                year: "numeric", month: "short", day: "numeric"
                              });
                            } catch {}
                            return (
                              <div key={idx} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-rose-100/50 bg-rose-50/20 text-xs">
                                <span className="font-bold text-slate-800">{displayDate}</span>
                                <span className="text-[10px] font-black uppercase text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded">
                                  {d.reason}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>


                    {/* Experience description */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-2">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block border-b border-slate-100 pb-2">Experience Summary</span>
                      <p className="text-xs text-slate-655 leading-relaxed italic whitespace-pre-wrap">{selectedTalent.experienceDescription || "No experience summary entered."}</p>
                    </div>

                    {/* Internal Notes — button trigger only */}
                    <button
                      onClick={() => setShowTalentNotesModal(true)}
                      className="w-full flex items-center justify-between gap-3 bg-indigo-50/60 hover:bg-indigo-100/70 border border-indigo-100 hover:border-indigo-200 rounded-2xl p-4 transition-all duration-200 group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center transition-colors shrink-0">
                          <FileText className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="text-left">
                          <span className="text-sm font-extrabold text-indigo-800 block">Admin & Client Internal Notes</span>
                          <span className="text-[11px] text-indigo-500 font-semibold">Click to view, add, or manage notes</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-indigo-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>

                  </div>

                </div>

              </div>

            </div>
          </div>
        );
      })()}

      {/* Talent Notes Sub-Modal */}
      {selectedTalent && showTalentNotesModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowTalentNotesModal(false)}
        >
          <div
            className="bg-white rounded-[22px] shadow-2xl w-full max-w-xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
            style={{ maxHeight: "80vh" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-[#1e1b4b] to-[#312e81] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-sm leading-tight">Admin & Client Internal Notes</h3>
                  <span className="text-[10px] text-indigo-300 font-semibold">{selectedTalent.displayName}</span>
                </div>
              </div>
              <button
                onClick={() => setShowTalentNotesModal(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Notes Content */}
            <div className="flex-1 overflow-hidden" style={{ minHeight: "400px" }}>
              <EntityNotes
                companyId={company.id}
                entityId={selectedTalent.id}
                entityType="talent"
                title="Internal Notes Log"
                placeholder="Record a note about this talent..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Client Details Modal */}
      {selectedClient && (() => {
        const clientBookings = bookings.filter((b: any) => b.clientId === selectedClient.id);
        
        // Filter by status
        const filteredClientBookings = clientBookings.filter((b: any) => {
          if (clientBookingFilter === "all") return true;
          if (clientBookingFilter === "active") return b.status !== "Completed" && b.status !== "Cancelled";
          if (clientBookingFilter === "completed") return b.status === "Completed";
          if (clientBookingFilter === "cancelled") return b.status === "Cancelled";
          return true;
        });

        // Pagination
        const CLIENT_BOOKINGS_PER_PAGE = 3;
        const totalClientBookingPages = Math.max(1, Math.ceil(filteredClientBookings.length / CLIENT_BOOKINGS_PER_PAGE));
        const pagedClientBookings = filteredClientBookings.slice(
          (clientBookingPage - 1) * CLIENT_BOOKINGS_PER_PAGE,
          clientBookingPage * CLIENT_BOOKINGS_PER_PAGE
        );
        const totalBookings = clientBookings.length;
        const activeBookings = clientBookings.filter((b: any) => b.status !== "Completed" && b.status !== "Cancelled").length;
        const completedBookings = clientBookings.filter((b: any) => b.status === "Completed").length;
        const cancelledBookings = clientBookings.filter((b: any) => b.status === "Cancelled").length;

        return (
          <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200" onClick={() => setSelectedClient(null)}>
            <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-6xl border border-slate-100 overflow-hidden h-[90vh] lg:h-[760px] flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              
              {/* Header */}
              <div className="px-4 sm:px-6 py-4 border-b border-slate-200/60 flex items-center justify-between bg-gradient-to-r from-[#1e1b4b] to-[#2e2a72] text-white shrink-0">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center font-black text-white text-lg border border-white/10 shadow-inner">
                    {selectedClient.name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-base leading-tight">Client Dashboard Details</h3>
                    <span className="text-[11px] text-slate-300 font-mono mt-0.5 block">UID: {selectedClient.id}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedClient(null)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors">
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 flex-1 overflow-y-auto lg:overflow-hidden bg-white">
                {/* Left Panel - Profile & Ratings & Account Stats (Col-span 5) */}
                <div className="lg:col-span-5 p-4 sm:p-6 flex flex-col gap-5 lg:overflow-y-auto custom-scrollbar">
                  
                  {/* Name and Basic Info Card */}
                  <div className="space-y-1 bg-gradient-to-br from-indigo-50/40 to-slate-50/50 p-5 rounded-2xl border border-indigo-50 shadow-sm shrink-0">
                    <h4 className="font-black text-indigo-950 text-base leading-tight">{selectedClient.name || "Unnamed Client"}</h4>
                    <p className="text-xs text-slate-500 font-semibold mt-1">{selectedClient.email}</p>
                  </div>

                  {/* Stats Cards Grid */}
                  <div className="space-y-3 shrink-0">
                    <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Booking Metrics</h5>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-indigo-50/50 border border-indigo-100/60 p-4 rounded-xl shadow-sm hover:shadow transition-all duration-300 flex flex-col justify-between min-h-[80px]">
                        <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider block">Total Bookings</span>
                        <span className="text-xl font-black text-indigo-950 mt-1 block">{totalBookings}</span>
                      </div>
                      <div className="bg-emerald-50/50 border border-emerald-100/60 p-4 rounded-xl shadow-sm hover:shadow transition-all duration-300 flex flex-col justify-between min-h-[80px]">
                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider block">Active</span>
                        <span className="text-xl font-black text-emerald-950 mt-1 block">{activeBookings}</span>
                      </div>
                      <div className="bg-sky-50/50 border border-sky-100/60 p-4 rounded-xl shadow-sm hover:shadow transition-all duration-300 flex flex-col justify-between min-h-[80px]">
                        <span className="text-[9px] font-black text-sky-600 uppercase tracking-wider block">Completed</span>
                        <span className="text-xl font-black text-slate-900 mt-1 block">{completedBookings}</span>
                      </div>
                      <div className="bg-rose-50/50 border border-rose-100/60 p-4 rounded-xl shadow-sm hover:shadow transition-all duration-300 flex flex-col justify-between min-h-[80px]">
                        <span className="text-[9px] font-black text-rose-600 uppercase tracking-wider block">Cancelled</span>
                        <span className="text-xl font-black text-rose-950 mt-1 block">{cancelledBookings}</span>
                      </div>
                    </div>
                  </div>

                  {/* Contact & Account details */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4 shrink-0">
                    <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                      <UserCircle className="w-4 h-4 text-indigo-500" /> Contact & Account Info
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-0.5 min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Email</span>
                        <span className="text-slate-800 font-extrabold font-mono block break-all" title={selectedClient.email}>{selectedClient.email}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Phone</span>
                        <span className="text-slate-800 font-extrabold block">{selectedClient.phoneNumber || "—"}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Member Since</span>
                        <span className="text-slate-800 font-extrabold block">
                          {selectedClient.createdAt 
                            ? (selectedClient.createdAt.toDate 
                              ? selectedClient.createdAt.toDate().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) 
                              : selectedClient.createdAt.seconds 
                                ? new Date(selectedClient.createdAt.seconds * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                                : new Date(selectedClient.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                              )
                            : "—"
                          }
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Account Status</span>
                        <div className="flex items-center gap-2 mt-1">
                          <select 
                            value={selectedClient.status || "active"} 
                            onChange={(e) => handleUpdateClientStatus(e.target.value)}
                            disabled={updatingClientStatus}
                            className={`text-[10px] font-black uppercase rounded-lg border px-2.5 py-1 outline-none transition-all cursor-pointer ${
                              (selectedClient.status || "active") === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/50" :
                              (selectedClient.status || "active") === "disabled" ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100/50" :
                              "bg-red-50 text-red-700 border-red-200 hover:bg-red-100/50"
                            }`}
                          >
                            <option value="active">Active</option>
                            <option value="disabled">Disabled</option>
                            <option value="blacklisted">Blacklisted</option>
                          </select>
                          {updatingClientStatus && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rating / Internal Evaluation */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4 shrink-0">
                    <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-2">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> Internal Evaluation
                    </h5>
                    {clientRatings[selectedClient.id] ? (
                      <div className="space-y-3.5 text-xs font-semibold">
                        {[
                          { label: "Punctuality", score: clientRatings[selectedClient.id].punctuality, color: "bg-indigo-600" },
                          { label: "Communication", score: clientRatings[selectedClient.id].communication, color: "bg-indigo-600" },
                          { label: "Reliability", score: clientRatings[selectedClient.id].reliability, color: "bg-indigo-600" }
                        ].map(({ label, score, color }) => (
                          <div key={label} className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-500">{label}</span>
                              <span className="text-slate-800 font-extrabold">{score} / 5</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full ${color} rounded-full`} style={{ width: `${(score / 5) * 100}%` }}></div>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-between border-t border-slate-100 pt-3 text-sm items-center mt-2">
                          <span className="text-[#1e1b4b] font-black">Overall Average</span>
                          <span className="text-indigo-600 font-black flex items-center gap-1 bg-indigo-50/50 px-2.5 py-1 rounded-lg border border-indigo-200">
                            <Star className="w-4 h-4 fill-amber-400 stroke-amber-400" />
                            {clientRatings[selectedClient.id].overall} / 5
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 italic bg-slate-50/50 p-4 rounded-xl border border-dashed text-center">
                        No evaluation metrics recorded yet.
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Panel - Tabbed Bookings vs Notes (Col-span 7) */}
                <div className="lg:col-span-7 p-4 sm:p-6 flex flex-col h-auto lg:h-full lg:overflow-hidden min-h-0">
                  
                  {/* Tab Selector */}
                  <div className="flex border-b border-slate-100 pb-3 gap-2 shrink-0">
                    <button
                      onClick={() => setClientModalTab("notes")}
                      className={`h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                        clientModalTab === "notes"
                          ? "bg-[#1e1b4b] text-white shadow-md shadow-indigo-900/10"
                          : "bg-slate-50 hover:bg-slate-100 text-slate-500"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" /> Log & Notes
                    </button>
                    <button
                      onClick={() => setClientModalTab("bookings")}
                      className={`h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                        clientModalTab === "bookings"
                          ? "bg-[#1e1b4b] text-white shadow-md shadow-indigo-900/10"
                          : "bg-slate-50 hover:bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Briefcase className="w-3.5 h-3.5" /> Bookings ({clientBookings.length})
                    </button>
                  </div>

                  {/* Tab Content Container */}
                  <div className="flex-1 mt-4 flex flex-col lg:overflow-hidden min-h-0">
                    
                    {/* Log & Notes Tab */}
                    {clientModalTab === "notes" && (
                      <div className="flex-1 flex flex-col min-h-[350px] lg:min-h-0 min-w-0 lg:overflow-hidden">
                        <EntityNotes
                          companyId={company.id}
                          entityId={selectedClient.id}
                          entityType="client"
                          title="Internal Note File"
                          placeholder="Record client evaluations and warnings..."
                        />
                      </div>
                    )}

                    {/* Bookings List Tab */}
                    {clientModalTab === "bookings" && (
                      <div className="flex-1 flex flex-col lg:overflow-hidden min-h-[350px] lg:min-h-0">
                        {/* Status Filter buttons */}
                        <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0 mb-3">
                          {(["all", "active", "completed", "cancelled"] as const).map((f) => (
                            <button
                              key={f}
                              onClick={() => {
                                setClientBookingFilter(f);
                                setClientBookingPage(1);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                clientBookingFilter === f
                                  ? "bg-white text-indigo-950 shadow-sm"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              {f}
                            </button>
                          ))}
                        </div>

                        {filteredClientBookings.length === 0 ? (
                          <div className="flex-1 flex items-center justify-center py-12 text-center text-slate-400 text-xs bg-slate-50/50 rounded-2xl border border-dashed">
                            No matching bookings found.
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col lg:overflow-hidden min-h-0">
                            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                              {pagedClientBookings.map((b: any) => (
                                <div 
                                  key={b.id} 
                                  className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-indigo-50/30 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer group"
                                  onClick={() => setSelectedBooking(b)}
                                >
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-mono text-[10px] font-bold text-slate-400">#{b.id?.substring(0, 8)}</span>
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase border leading-none ${
                                        b.status === "Confirmed" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                        b.status === "Completed" ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                                        b.status === "Cancelled" ? "bg-red-50 text-red-700 border-red-100" :
                                        "bg-amber-50 text-amber-700 border-amber-100"
                                      }`}>{b.status}</span>
                                    </div>
                                    <h6 className="font-extrabold text-slate-800 text-xs">{b.jobType || "General Event"}</h6>
                                    {b.eventDate && (
                                      <span className="text-[10px] text-slate-400 font-semibold block">Date: {b.eventDate}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                                    <div className="text-left sm:text-right">
                                      <span className="font-bold text-slate-800 text-xs block">${b.totalBudget || 0}</span>
                                      <span className="text-[9px] text-slate-400 font-bold block">{b.paymentStatus || "Unpaid"}</span>
                                    </div>
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-350 group-hover:text-indigo-600 transition-colors" />
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Pagination Controls */}
                            {totalClientBookingPages > 1 && (
                              <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-3 shrink-0">
                                <p className="text-[10px] text-slate-400 font-bold">
                                  Page {clientBookingPage} of {totalClientBookingPages}
                                </p>
                                <div className="flex items-center gap-1.5">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setClientBookingPage(p => Math.max(1, p - 1))} 
                                    disabled={clientBookingPage === 1} 
                                    className="h-8 rounded-xl px-3 text-[10px] font-bold border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
                                  >
                                    <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Prev
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setClientBookingPage(p => Math.min(totalClientBookingPages, p + 1))} 
                                    disabled={clientBookingPage === totalClientBookingPages} 
                                    className="h-8 rounded-xl px-3 text-[10px] font-bold border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
                                  >
                                    Next <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Activity History Modal */}
      {showActivityModal && selectedBooking && (
        <ActivityHistoryModal
          booking={selectedBooking}
          dictionary={talentsDict}
          onClose={() => setShowActivityModal(false)}
        />
      )}

      {/* Booking Chat Modal */}
      {chatBooking && user && (
        <BookingChatModal
          booking={chatBooking}
          user={user}
          onClose={() => setChatBooking(null)}
        />
      )}
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function CompaniesPage() {
  const { hasPermission } = usePlatformPermissions();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Company | null>(null);
  const [page, setPage] = useState(1);

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [newId, setNewId] = useState(""); const [newName, setNewName] = useState("");
  const [adminEmail, setAdminEmail] = useState(""); const [adminPass, setAdminPass] = useState("");
  const [newContact, setNewContact] = useState(""); const [newPhone, setNewPhone] = useState("");
  const [newBrandColor, setNewBrandColor] = useState("#5046E5");
  const [newBrandSecondary, setNewBrandSecondary] = useState("#3730A3");
  const [newPlan, setNewPlan] = useState<"starter" | "professional" | "enterprise">("starter");
  const [creating, setCreating] = useState(false); const [createErr, setCreateErr] = useState("");
  const [pagePlans, setPagePlans] = useState<Record<string, { name: string; price: number }>>(
    { starter: { name: "Starter", price: 49 }, professional: { name: "Professional", price: 99 }, enterprise: { name: "Enterprise", price: 199 } }
  );

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "companies"));
      const list: Company[] = [];
      snap.forEach(d => {
        if (d.id.toLowerCase() !== "talentum") {
          list.push({ id: d.id, ...d.data() } as Company);
        }
      });
      list.sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime() || 0;
        const tb = b.createdAt?.toDate?.()?.getTime() || 0;
        return tb - ta; // newest first
      });
      setCompanies(list);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  // Fetch live plan prices from Firestore for the Create Company dropdown
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "subscriptionPlans"));
        if (!snap.empty) {
          const dict: Record<string, { name: string; price: number }> = {};
          snap.forEach((d) => {
            const data = d.data();
            const key = (data.name || d.id).toLowerCase();
            dict[key] = { name: data.name || d.id, price: Number(data.price || 0) };
          });
          if (Object.keys(dict).length > 0) setPagePlans(dict);
        }
      } catch (e) {
        console.warn("Could not load subscription plans:", e);
      }
    })();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true); setCreateErr("");

    if (newId.trim().toLowerCase() === "talentum") {
      setCreateErr("The workspace ID 'talentum' is reserved for platform systems.");
      setCreating(false);
      return;
    }

    try {
      const appName = `co-${Date.now()}`;
      const secondary = initializeApp(firebaseConfig, appName);
      const secAuth = getAuth(secondary);
      try {
        const cred = await createUserWithEmailAndPassword(secAuth, adminEmail, adminPass);
        await setDoc(doc(db, "users", cred.user.uid), {
          email: adminEmail, role: "admin", name: newContact || "Company Admin",
          companyId: newId, status: "active", createdAt: serverTimestamp()
        });

        const planInfo = PLAN_DEFAULTS[newPlan];
        const activationToken = Array.from({ length: 32 }, () => 
          Math.floor(Math.random() * 16).toString(16)
        ).join("");

        await setDoc(doc(db, "companies", newId), {
          name: newName, adminId: cred.user.uid, adminEmail,
          contactPerson: newContact, contactPhone: newPhone,
          brandColor: newBrandColor, brandSecondary: newBrandSecondary,
          status: "active", createdAt: serverTimestamp(),
          selectedPlan: newPlan,
          planId: `default-${newPlan}`,
          planLimits: planInfo.limits,
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
              contactName: newContact || "Company Admin"
            })
          });
        } catch (mailErr) {
          console.error("Failed to send activation email:", mailErr);
        }
      } finally { await deleteApp(secondary); }
      await fetchCompanies();
      setShowCreate(false);
      setNewId(""); setNewName(""); setAdminEmail(""); setAdminPass(""); setNewContact(""); setNewPhone("");
      setNewPlan("starter");
    } catch (err: any) { setCreateErr(err.message || "Failed."); }
    finally { setCreating(false); }
  };

  // Filtered + paginated
  const filtered = companies.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.id?.toLowerCase().includes(search.toLowerCase()) ||
    c.contactPerson?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };

  if (selected) {
    return (
      <CompanyInspector
        company={selected}
        onClose={() => setSelected(null)}
        onUpdate={(updated) => {
          setCompanies(prev => prev.map(c => c.id === updated.id ? updated : c));
          setSelected(updated);
        }}
      />
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-extrabold text-[#1e1b4b] tracking-tight">Companies</h1>
            <p className="text-slate-500 font-medium text-sm mt-0.5">
              {filtered.length} registered {filtered.length === 1 ? "company" : "companies"} — click to manage.
            </p>
          </div>
          {hasPermission("create_company") && (
            <Button onClick={() => setShowCreate(true)}
              className="bg-[#5046E5] hover:bg-[#4338CA] text-white font-bold h-11 px-5 rounded-xl shadow-[0_6px_16px_-4px_rgba(79,70,229,0.5)] flex items-center gap-2 text-sm w-full sm:w-auto justify-center">
              <Plus className="w-4 h-4" /> New Company
            </Button>
          )}
        </div>

        {/* Search + Refresh */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search by name, slug or contact..." value={search}
              onChange={e => handleSearch(e.target.value)} className="pl-10 h-10 rounded-xl border-slate-200 bg-white text-sm" />
          </div>
          <Button variant="outline" onClick={fetchCompanies} className="h-10 px-3 rounded-xl border-slate-200 shrink-0">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-sm font-medium">Loading companies...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 bg-white rounded-[20px] border border-slate-100 text-center">
            <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No companies found.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {paged.map(company => {
                const { planName, isTrialActive, isTrialExpired, trialDaysLeft, isActive } = getSubscriptionBadge(company);
                const hasCustomPrice = company.customPrice !== undefined && company.customPrice !== null && 
                  (!company.customPriceEndDate || (company.customPriceEndDate.toDate ? company.customPriceEndDate.toDate().getTime() : new Date(company.customPriceEndDate).getTime()) > Date.now());
                return (
                  <button key={company.id} onClick={() => {
                    if (hasPermission("edit_company") || hasPermission("view_company_users")) setSelected(company);
                  }}
                    className={`w-full text-left bg-white rounded-[20px] border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)] p-5 transition-all duration-200 group ${(hasPermission("edit_company") || hasPermission("view_company_users")) ? "cursor-pointer hover:border-indigo-200 hover:shadow-[0_8px_30px_rgba(79,70,229,0.08)] hover:-translate-y-0.5" : "cursor-default"}`}>

                    {/* Top row: logo + status */}
                    <div className="flex items-start justify-between mb-4">
                      {company.logoUrl ? (
                        <img src={company.logoUrl} alt="logo" className="w-12 h-12 rounded-2xl object-cover border border-slate-100" />
                      ) : (
                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors shrink-0">
                          <span className="text-indigo-600 font-black text-[18px]">{company.name[0]?.toUpperCase()}</span>
                        </div>
                      )}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <StatusBadge status={company.status} />
                        <div className="flex items-center gap-1">
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-50/80 text-indigo-700 border border-indigo-100/70">
                            {planName}
                          </span>
                          {hasCustomPrice && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-0.5" title={`Custom Price: $${company.customPrice}`}>
                              <Star className="w-2.5 h-2.5 fill-amber-400 stroke-amber-400" /> Offer
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-[16px] font-extrabold text-[#1e1b4b] mb-0.5">{company.name}</div>
                    <code className="text-[12px] text-slate-400 font-mono">/{company.id}</code>

                    {/* Contact info */}
                    {company.contactPerson && (
                      <div className="flex items-center gap-1.5 mt-2 text-[12px] text-slate-400">
                        <User className="w-3 h-3 text-slate-400" /> {company.contactPerson}
                      </div>
                    )}
                    {company.contactPhone && (
                      <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
                        <Phone className="w-3 h-3 text-slate-400" /> {company.contactPhone}
                      </div>
                    )}

                    {/* Registration date */}
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400 font-medium">
                      <Calendar className="w-3 h-3 text-slate-450" /> Registered {formatDate(company.createdAt)}
                    </div>

                    {/* Trial status */}
                    {isTrialActive && (
                      <div className="flex items-center gap-1.5 mt-2 text-[11.5px] font-extrabold text-amber-600 bg-amber-50/50 border border-amber-100/40 rounded-lg px-2 py-1">
                        <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Trial: {trialDaysLeft}d left
                      </div>
                    )}
                    {isTrialExpired && (
                      <div className="flex items-center gap-1.5 mt-2 text-[11.5px] font-extrabold text-red-600 bg-red-50/50 border border-red-100/40 rounded-lg px-2 py-1">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 animate-pulse" /> Trial Expired
                      </div>
                    )}
                    {isActive && (
                      <div className="flex items-center gap-1.5 mt-2 text-[11.5px] font-extrabold text-emerald-600 bg-emerald-50/50 border border-emerald-100/40 rounded-lg px-2 py-1 w-fit">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Paid Active
                      </div>
                    )}

                    {(hasPermission("edit_company") || hasPermission("view_company_users")) && (
                      <div className="mt-3 flex items-center justify-end text-indigo-500 text-[12px] font-bold gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        Manage <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-slate-400 font-medium">
                  Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <ChevronLeft className="w-4 h-4 text-slate-600" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-9 h-9 rounded-xl text-sm font-bold transition-all border ${p === page ? "bg-[#1e1b4b] text-white border-[#1e1b4b]" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
                      {p}
                    </button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>



      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-7 relative animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <button onClick={() => setShowCreate(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            <h2 className="text-[20px] font-black text-[#1e1b4b] mb-1">New Company</h2>
            <p className="text-slate-400 text-sm mb-5">Register a new company with first admin details.</p>
            {createErr && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-100">{createErr}</div>}
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Company Slug (URL)</label>
                <Input placeholder="e.g. ace-entertainment" value={newId}
                  onChange={e => setNewId(e.target.value.toLowerCase().replace(/\s+/g, "-"))} required className="h-10 rounded-xl text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Company Name</label>
                <Input placeholder="e.g. My Entertainment Group" value={newName} onChange={e => setNewName(e.target.value)} required className="h-10 rounded-xl text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Contact Person</label>
                  <Input placeholder="Name" value={newContact} onChange={e => setNewContact(e.target.value)} className="h-10 rounded-xl text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Contact Phone</label>
                  <Input placeholder="+92 300..." value={newPhone} onChange={e => setNewPhone(e.target.value)} className="h-10 rounded-xl text-sm" />
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Theme Branding</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">Primary Color</label>
                    <div className="flex gap-2">
                       <input 
                        type="color" 
                        value={newBrandColor} 
                        onChange={e => setNewBrandColor(e.target.value)}
                        className="w-9 h-9 rounded-lg cursor-pointer border-none p-0 overflow-hidden" 
                      />
                      <Input value={newBrandColor} onChange={e => setNewBrandColor(e.target.value)} className="h-9 rounded-xl text-xs font-mono uppercase" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">Secondary Color</label>
                    <div className="flex gap-2">
                       <input 
                        type="color" 
                        value={newBrandSecondary} 
                        onChange={e => setNewBrandSecondary(e.target.value)}
                        className="w-9 h-9 rounded-lg cursor-pointer border-none p-0 overflow-hidden" 
                      />
                      <Input value={newBrandSecondary} onChange={e => setNewBrandSecondary(e.target.value)} className="h-9 rounded-xl text-xs font-mono uppercase" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <label className="text-xs font-bold text-slate-600 block mb-1">Subscription Plan</label>
                <select value={newPlan} onChange={e => setNewPlan(e.target.value as any)}
                  className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm font-semibold bg-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 mb-2">
                  <option value="starter">Starter Plan (${pagePlans["starter"]?.price ?? 49}/mo)</option>
                  <option value="professional">Professional Plan (${pagePlans["professional"]?.price ?? 99}/mo)</option>
                  <option value="enterprise">Enterprise Plan (${pagePlans["enterprise"]?.price ?? 199}/mo)</option>
                </select>
                <p className="text-[10px] text-slate-400 font-medium">Includes 7 days free trial.</p>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <div className="space-y-2">
                  <Input type="email" placeholder="admin@company.com" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required className="h-10 rounded-xl text-sm" />
                  <Input type="password" placeholder="Password (min 6)" value={adminPass} onChange={e => setAdminPass(e.target.value)} required className="h-10 rounded-xl text-sm" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="button" onClick={() => setShowCreate(false)} variant="outline" className="flex-1 h-10 rounded-xl text-sm">Cancel</Button>
                <Button type="submit" disabled={creating} className="flex-1 h-10 rounded-xl bg-[#1e1b4b] hover:bg-[#312e81] text-white font-bold text-sm">
                  {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
