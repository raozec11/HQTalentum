"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { db, firebaseConfig } from "@/lib/firebase";
import {
  collection, getDocs, doc, setDoc, deleteDoc, query, where, orderBy, serverTimestamp,
  updateDoc, arrayUnion, getDoc, addDoc
} from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { EntityNotes } from "@/components/notes/EntityNotes";
import {
  Users, Plus, Search, X, Check, Mail, Lock, User, Phone, MapPin,
  ChevronLeft, ChevronRight, Eye, EyeOff, Briefcase, Calendar, Globe,
  CheckCircle2, ChevronDown, Edit3, Trash2, ShieldAlert, Camera, Clock, Activity, DollarSign,
  Loader2, Star, History, Info, RotateCcw, Sparkles, ImagePlus, LayoutGrid, LayoutList, Image
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { sendNotification, sendNotificationToAdmins, sendNotificationToTalents } from "@/lib/notifications";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";
import {
  BookingDetailsModal,
  TalentManagementModal,
  AssignTalentModal,
  ActivityHistoryModal,
  AdminRateClientModal
} from "@/components/bookings/AdminBookingModals";

interface Talent {
  id: string;
  name: string;
  displayName?: string;
  email: string;
  role: string;
  companyId: string;
  status?: string;
  talentType?: string | string[];
  location?: string;
  locations?: string[];
  gender?: string | string[];
  profileImage?: string;
  phone?: string;
  workingHours?: { start: string; end: string };
  blockedDates?: any[];
  [key: string]: any;
}

const PAGE_SIZE = 9;

// Phone Formatting Helper
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

// Secondary Firebase app to create talent users without signing out the admin
function getSecondaryApp() {
  const existing = getApps().find(a => a.name === "talent-creator");
  return existing ?? initializeApp(firebaseConfig, "talent-creator");
}

import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";

export default function AdminTalentsPage({ params }: { params: any }) {
  const { user: adminUser } = useAuth();
  const companyId = adminUser?.companyId as string;

  const [talents, setTalents] = useState<Talent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedTalent, setSelectedTalent] = useState<Talent | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    displayName: "", originalName: "", email: "", password: "", phone: "", location: "", talentType: "", gender: ""
  });

  // Edit Modal State
  const [isEditingModal, setIsEditingModal] = useState(false);
  const [showActivityLogs, setShowActivityLogs] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editForm, setEditForm] = useState<{ 
    displayName: string; originalName: string; username: string; email: string; phone: string; profileImage: string; 
    gender: string[]; talentType: string[]; locations: string[];
    workingHours: { start: string; end: string }; blockedDates: any[];
    gallery: string[]; galleryLayout: "grid" | "slider";
  }>({
    displayName: "", originalName: "", username: "", email: "", phone: "", profileImage: "",
    gender: [], talentType: [], locations: [],
    workingHours: { start: "00:00", end: "23:59" }, blockedDates: [],
    gallery: [], galleryLayout: "grid"
  });

  const [isUploadingGallery, setIsUploadingGallery] = useState(false);

  // Blackout Editor State (Inline in Modal)
  const [showBlackoutAdder, setShowBlackoutAdder] = useState(false);
  const [newBlackoutDate, setNewBlackoutDate] = useState("");
  const [newBlackoutEndDate, setNewBlackoutEndDate] = useState("");
  const [newBlackoutReason, setNewBlackoutReason] = useState("");


  // Dropdown data
  const [talentTypes, setTalentTypes] = useState<{ id: string; name: string }[]>([]);
  const [genders, setGenders] = useState<{ id: string; name: string }[]>([]);

  // Jobs Completed listing & details
  const [showJobsModal, setShowJobsModal] = useState(false);
  const [talentBookings, setTalentBookings] = useState<any[]>([]);
  const [loadingTalentBookings, setLoadingTalentBookings] = useState(false);
  const [selectedBookingForDetails, setSelectedBookingForDetails] = useState<any | null>(null);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [manageTalentId, setManageTalentId] = useState<string | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showRateClientModal, setShowRateClientModal] = useState(false);
  const [allTalents, setAllTalents] = useState<any[]>([]);
  const [loadingAllTalents, setLoadingAllTalents] = useState(false);
  const [chatBooking, setChatBooking] = useState<any | null>(null);

  const talentsDict = useMemo(() => {
    const dict: Record<string, any> = {};
    talents.forEach(t => {
      dict[t.id] = t;
    });
    return dict;
  }, [talents]);

  const fetchAllCompanyTalents = async () => {
    if (!companyId || allTalents.length > 0) return;
    setLoadingAllTalents(true);
    try {
      const [uSnap, tSnap] = await Promise.all([
        getDocs(query(collection(db, "users"), where("companyId", "==", companyId), where("role", "==", "talent"))),
        getDocs(query(collection(db, "talents"), where("companyId", "==", companyId)))
      ]);
      const tDocs: Record<string, any> = {};
      tSnap.docs.forEach(d => { tDocs[d.id] = d.data(); });
      
      const list = uSnap.docs.map(d => {
        const uD = d.data();
        const tD = tDocs[d.id] || {};
        return {
          ...uD, ...tD, id: d.id,
          displayName: tD.displayName || uD.name || uD.displayName || uD.email,
          profileImage: tD.photoUrl || tD.profileImage || uD.profileImage || null
        };
      });
      setAllTalents(list);
    } catch (e) { console.error(e); }
    finally { setLoadingAllTalents(false); }
  };

  const updateBookingStateInModal = (bookingId: string, updates: any) => {
    setSelectedBookingForDetails((prev: any) => {
      if (prev && prev.id === bookingId) {
        return { ...prev, ...updates };
      }
      return prev;
    });
    setTalentBookings(prev => prev.map(b => b.id === bookingId ? { ...b, ...updates } : b));
  };

  const handleAssign = async (talentId: string) => {
    if (!selectedBookingForDetails) return;
    const limit = parseInt(selectedBookingForDetails.noOfEntertainers || selectedBookingForDetails.numEntertainers || 1);
    const currentAssigned = selectedBookingForDetails.selectedTalentIds || (selectedBookingForDetails.selectedTalentId ? [selectedBookingForDetails.selectedTalentId] : []);
    
    if (currentAssigned.includes(talentId)) return;
    if (currentAssigned.length >= limit) {
      showError(`Limit reached: This job requested a maximum of ${limit} entertainer(s).`);
      return;
    }

    const historyEntry = {
      type: 'assigned',
      talentId,
      at: new Date().toISOString(),
      adminName: adminUser?.displayName || adminUser?.email || "Admin"
    };

    const newIds = [...currentAssigned, talentId];
    const newStatus = newIds.length >= limit ? "Assigned" : (selectedBookingForDetails.status || "Pending");

    const updates = {
      selectedTalentIds: newIds,
      selectedTalentId: newIds[0] || null, 
      status: newStatus,
      assignedAt: serverTimestamp(),
      assignmentHistory: arrayUnion(historyEntry)
    };

    try {
      await updateDoc(doc(db, "bookings", selectedBookingForDetails.id), updates);
      
      try {
        const talentName = talentsDict[talentId]?.displayName || allTalents.find(t => t.id === talentId)?.displayName || "Talent";
        const chatRef = doc(db, "chats", selectedBookingForDetails.id);
        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) {
          await setDoc(chatRef, {
            bookingId: selectedBookingForDetails.id,
            companyId: companyId,
            createdAt: new Date().toISOString(),
            lastMessageText: `${talentName} Connected`,
            lastSenderId: "system",
            lastMessageAt: new Date().toISOString(),
            lastRead: {}
          });
        }
        const existingMsgs = await getDocs(query(
          collection(db, "chats", selectedBookingForDetails.id, "messages"),
          where("senderId", "==", "system"),
          where("text", "==", `${talentName} Connected`)
        ));
        if (existingMsgs.empty) {
          await addDoc(collection(db, "chats", selectedBookingForDetails.id, "messages"), {
            text: `${talentName} Connected`,
            senderId: "system",
            senderName: "System",
            senderRole: "system",
            createdAt: new Date().toISOString()
          });
          await updateDoc(chatRef, {
            lastMessageText: `${talentName} Connected`,
            lastSenderId: "system",
            lastMessageAt: new Date().toISOString()
          });
        }
      } catch (chatErr) {
        console.error("Failed to post system message to chat:", chatErr);
      }

      await sendNotification({
        userId: talentId,
        companyId: companyId,
        recipientEmail: talentsDict[talentId]?.email || "",
        title: "New Job Action Required",
        message: `You've been assigned to a new booking! Please review & confirm.`,
        type: "booking",
        link: `/${companyId}/dashboard/talent/bookings?tab=offers`
      });

      updateBookingStateInModal(selectedBookingForDetails.id, { ...updates, assignedAt: new Date().toISOString() });
      setShowAssignModal(false);
      showSuccess("Talent assigned successfully!");
    } catch (e) {
      console.error(e);
      showError("Failed to assign talent.");
    }
  };

  const handleUnassign = async (talentIdToRemove: string, reopen: boolean) => {
    if (!selectedBookingForDetails) return;
    
    const currentAssigned = selectedBookingForDetails.selectedTalentIds || (selectedBookingForDetails.selectedTalentId ? [selectedBookingForDetails.selectedTalentId] : []);
    if (!currentAssigned.includes(talentIdToRemove)) return;

    const historyEntry = {
      type: 'unassigned',
      talentId: talentIdToRemove,
      at: new Date().toISOString(),
      adminName: adminUser?.displayName || adminUser?.email || "Admin",
      reopened: reopen
    };

    const newIds = currentAssigned.filter((id: string) => id !== talentIdToRemove);
    const updates: any = {
      selectedTalentIds: newIds,
      selectedTalentId: newIds.length > 0 ? newIds[0] : null,
      assignmentHistory: arrayUnion(historyEntry)
    };
    
    if (newIds.length === 0) updates.assignedAt = null;
    if (newIds.length === 0 || reopen) {
      updates.status = "Pending";
    }

    try {
      await updateDoc(doc(db, "bookings", selectedBookingForDetails.id), updates);
      
      try {
        const talentName = talentsDict[talentIdToRemove]?.displayName || "Talent";
        const chatRef = doc(db, "chats", selectedBookingForDetails.id);
        await addDoc(collection(db, "chats", selectedBookingForDetails.id, "messages"), {
          text: `${talentName} was unassigned`,
          senderId: "system",
          senderName: "System",
          senderRole: "system",
          createdAt: new Date().toISOString()
        });
        await updateDoc(chatRef, {
          lastMessageText: `${talentName} was unassigned`,
          lastSenderId: "system",
          lastMessageAt: new Date().toISOString()
        });
      } catch (chatErr) {
        console.error("Failed to post system message to chat:", chatErr);
      }

      await sendNotification({
        userId: talentIdToRemove,
        companyId: companyId,
        recipientEmail: talentsDict[talentIdToRemove]?.email || "",
        title: "Unassigned from Booking",
        message: `You have been removed from the booking #${selectedBookingForDetails.id.substring(0, 8)}.`,
        type: "alert",
        link: `/${companyId}/dashboard/talent/bookings?tab=all`
      });

      if (reopen) {
        try {
          await sendNotificationToAdmins(companyId, {
            title: "Job Reopened",
            message: `Booking #${selectedBookingForDetails.id.substring(0, 8)} has been reopened and is now available for applications.`,
            type: "booking",
            link: `/${companyId}/dashboard/admin/bookings/all`
          });
          await sendNotificationToTalents(companyId, {
            title: "Job Reopened - Apply Now!",
            message: `Booking #${selectedBookingForDetails.id.substring(0, 8)} is reopened! Apply now in your available tab.`,
            type: "booking",
            link: `/${companyId}/dashboard/talent/bookings?tab=available`
          }, {
            ...selectedBookingForDetails,
            status: "Pending",
            selectedTalentId: null,
            selectedTalentIds: []
          });
        } catch (notifErr) {
          console.error("Reopen notifications failed:", notifErr);
        }
      }

      updateBookingStateInModal(selectedBookingForDetails.id, updates);
      setManageTalentId(null);
      showSuccess("Talent unassigned successfully!");
    } catch (e) {
      console.error(e);
      showError("Failed to unassign talent.");
    }
  };

  const handleApprovePayment = async (bookingToApprove: any) => {
    try {
      await updateDoc(doc(db, "bookings", bookingToApprove.id), {
        status: "Confirmed",
        paymentStatus: "Paid",
        paidAt: new Date().toISOString()
      });
      showSuccess("Payment approved successfully!");
      updateBookingStateInModal(bookingToApprove.id, {
        status: "Confirmed",
        paymentStatus: "Paid",
        paidAt: new Date().toISOString()
      });
    } catch (err) {
      console.error(err);
      showError("Failed to approve payment.");
    }
  };

  const handleDeclinePayment = async (bookingToDecline: any, reason: string) => {
    try {
      await updateDoc(doc(db, "bookings", bookingToDecline.id), {
        paymentStatus: "Declined",
        paymentDeclineReason: reason,
        paymentReceiptUrl: null,
        declinedAt: new Date().toISOString()
      });
      showSuccess("Payment declined.");
      updateBookingStateInModal(bookingToDecline.id, {
        paymentStatus: "Declined",
        paymentDeclineReason: reason,
        paymentReceiptUrl: null,
        declinedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error(err);
      showError("Failed to decline payment.");
    }
  };

  const fetchTalentBookings = async (talentId: string) => {
    setLoadingTalentBookings(true);
    try {
      const ids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));
      const snaps = await Promise.all(
        ids.map(id => getDocs(query(collection(db, "bookings"), where("companyId", "==", id))))
      );
      
      const bookingMap = new Map<string, any>();
      snaps.forEach(snap => {
        snap.docs.forEach(d => {
          bookingMap.set(d.id, { id: d.id, ...d.data() });
        });
      });
      
      const list = Array.from(bookingMap.values())
        .filter(b => {
          const tId = b.selectedTalentId || b.talentId;
          const isAssigned = tId === talentId || (Array.isArray(b.selectedTalentIds) && b.selectedTalentIds.includes(talentId));
          return isAssigned;
        });
      
      list.sort((a, b) => new Date(b.eventDate || 0).getTime() - new Date(a.eventDate || 0).getTime());
      setTalentBookings(list);
    } catch (err) {
      console.error("Failed to fetch talent bookings:", err);
      showError("Failed to fetch jobs.");
    } finally {
      setLoadingTalentBookings(false);
    }
  };

  const fetchTalents = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const ids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));
      
      const [usersSnaps, talentsSnaps, bookingsSnaps] = await Promise.all([
        Promise.all(ids.map(id => getDocs(query(collection(db, "users"), where("companyId", "==", id), where("role", "==", "talent"))))),
        Promise.all(ids.map(id => getDocs(query(collection(db, "talents"), where("companyId", "==", id))))),
        Promise.all(ids.map(id => getDocs(query(collection(db, "bookings"), where("companyId", "==", id), where("status", "==", "Completed")))))
      ]);

      const completedJobsCount: Record<string, number> = {};
      const uniqueBookings = new Map<string, any>();
      bookingsSnaps.forEach(snap => {
        snap.docs.forEach(doc => {
          uniqueBookings.set(doc.id, doc.data());
        });
      });

      console.log("DEBUG completed bookings parsed:", Array.from(uniqueBookings.entries()).map(([id, data]) => ({
        id,
        selectedTalentId: data.selectedTalentId || null,
        talentId: data.talentId || null,
        selectedTalentIds: data.selectedTalentIds || null,
        status: data.status,
        companyId: data.companyId
      })));

      uniqueBookings.forEach((bookingData) => {
        const talentsInBooking = new Set<string>();
        
        const tId = bookingData.selectedTalentId || bookingData.talentId;
        if (tId) talentsInBooking.add(tId);
        
        if (Array.isArray(bookingData.selectedTalentIds)) {
          bookingData.selectedTalentIds.forEach((id: string) => {
            if (id) talentsInBooking.add(id);
          });
        }
        
        talentsInBooking.forEach(id => {
          completedJobsCount[id] = (completedJobsCount[id] || 0) + 1;
        });
      });

      const talentDocs: Record<string, any> = {};
      talentsSnaps.forEach(snap => {
        snap.docs.forEach(d => {
          talentDocs[d.id] = { id: d.id, ...d.data() };
        });
      });

      const userDocsMap = new Map<string, any>();
      usersSnaps.forEach(snap => {
        snap.docs.forEach(d => {
          userDocsMap.set(d.id, d.data());
        });
      });

      const list = Array.from(userDocsMap.entries())
        .map(([uid, userData]) => {
          const talentData = talentDocs[uid] || {};

          return {
            ...userData,
            ...talentData,
            id: uid,
            completedJobs: completedJobsCount[uid] || 0,
            // Priority Merge
            displayName: talentData.displayName || talentData.name || userData.name || userData.displayName || userData.email || "Unknown Talent",
            profileImage: talentData.photoUrl || talentData.profileImage || userData.photoUrl || userData.profileImage || null,
            locations: talentData.locations || userData.locations || (userData.city ? [userData.city] : []),
            talentType: talentData.categories || talentData.talentTypes || talentData.talentType || userData.talentType || "No Type",
          };
        })
        .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));

      setTalents(list);

      // Background Legacy Migration: Auto-assign numericId
      list.forEach(async (t) => {
        if (!t.numericId) {
          const numId = Math.floor(100000 + Math.random() * 900000).toString();
          try {
            await setDoc(doc(db, "users", t.id), { numericId: numId }, { merge: true });
            await setDoc(doc(db, "talents", t.id), { numericId: numId }, { merge: true });
            setTalents(prev => prev.map(pt => pt.id === t.id ? { ...pt, numericId: numId } : pt));
          } catch (e) {
            console.error("Failed to migrate ID", t.id);
          }
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdowns = async () => {
    if (!companyId) return;
    const ids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));
    const [typesSnaps, gendersSnaps] = await Promise.all([
      Promise.all(ids.map(id => getDocs(query(collection(db, "companies", id, "talentTypes"), orderBy("name"))))),
      Promise.all(ids.map(id => getDocs(query(collection(db, "companies", id, "genders"), orderBy("name"))))),
    ]);
    
    const types: any[] = [];
    typesSnaps.forEach(snap => {
      snap.docs.forEach(d => {
        if (!types.some(t => t.id === d.id)) {
          types.push({ id: d.id, name: d.data().name, status: d.data().status });
        }
      });
    });
    
    const gendersList: any[] = [];
    gendersSnaps.forEach(snap => {
      snap.docs.forEach(d => {
        if (!gendersList.some(g => g.id === d.id)) {
          gendersList.push({ id: d.id, name: d.data().name, status: d.data().status });
        }
      });
    });
    
    setTalentTypes(types.filter((t: any) => t.status !== "inactive"));
    setGenders(gendersList.filter((g: any) => g.status !== "inactive"));
  };

  useEffect(() => {
    if (companyId) { fetchTalents(); fetchDropdowns(); }
  }, [companyId]);

  const filtered = useMemo(() =>
    talents.filter(t =>
      t.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.email?.toLowerCase().includes(search.toLowerCase()) ||
      (Array.isArray(t.talentType) ? t.talentType.join(" ").toLowerCase() : (t.talentType || "")?.toLowerCase()).includes(search.toLowerCase()) ||
      (Array.isArray(t.locations) ? t.locations.join(" ").toLowerCase() : (t.location || "")?.toLowerCase()).includes(search.toLowerCase())
    ), [talents, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const updateForm = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const handleAddTalent = async () => {
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
      // Use secondary app to create the talent's account without logging out the admin
      const secondaryApp = getSecondaryApp();
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password);
      await secondaryAuth.signOut(); // Sign out of secondary app immediately

      const numericId = Math.floor(100000 + Math.random() * 900000).toString();

      // 1. Generate unique username from displayName
      const baseUsername = form.displayName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric characters with hyphens
        .replace(/(^-|-$)/g, "");     // strip hyphens at ends
      
      let finalUsername = baseUsername || "talent";
      let isUnique = false;
      let counter = 1;
      
      while (!isUnique) {
        const q = query(collection(db, "talents"), where("username", "==", finalUsername));
        const snap = await getDocs(q);
        if (snap.empty) {
          isUnique = true;
        } else {
          finalUsername = `${baseUsername}-${counter}`;
          counter++;
        }
      }

      // Save strictly auth details to users collection
      await setDoc(doc(db, "users", cred.user.uid), {
        email: form.email.trim(),
        role: "talent",
        companyId: companyId.toLowerCase(),
        status: "active",
        numericId,
        createdAt: serverTimestamp(),
      });

      // Save public profile details to talents collection
      await setDoc(doc(db, "talents", cred.user.uid), {
        displayName: form.displayName.trim(),
        originalName: form.originalName.trim(),
        phone: form.phone.trim(),
        username: finalUsername,
        usernameChanged: false,
        workingHours: { start: "00:00", end: "23:59" },
        numericId,
        companyId: companyId.toLowerCase(),
        createdAt: serverTimestamp(),
      });

      // Fetch company name
      let companyName = companyId;
      try {
        const compSnap = await getDoc(doc(db, "companies", companyId));
        if (compSnap.exists()) {
          companyName = compSnap.data()?.name || companyId;
        }
      } catch (e) {
        console.error("Failed to fetch company name for welcome email:", e);
      }

      // Trigger server-side generation of email verification and send welcome email
      try {
        await fetch("/api/notifications/send-talent-welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            talentUid: cred.user.uid,
            talentEmail: form.email.trim(),
            talentName: form.displayName.trim(),
            companyId: companyId.toLowerCase(),
            companyName,
            password: form.password,
          }),
        });
      } catch (welcomeErr) {
        console.error("Failed to trigger welcome email API:", welcomeErr);
      }

      // Reset and close
      setForm({ displayName: "", originalName: "", email: "", password: "", phone: "", location: "", talentType: "", gender: "" });
      setShowModal(false);
      fetchTalents();
      showSuccess("Talent added successfully! A verification email has been sent to them.");
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        setSaveError("This email is already registered.");
      } else {
        setSaveError(err.message || "An error occurred.");
      }
    } finally {
      setSaving(false);
    }
  };

  // --- Admin Modal Logic ---
  const handleToggleStatus = async () => {
    if (!selectedTalent) return;
    const newStatus = selectedTalent.status === "active" ? "inactive" : "active";
    try {
      await setDoc(doc(db, "users", selectedTalent.id), { status: newStatus }, { merge: true });
      await setDoc(doc(db, "talents", selectedTalent.id), { status: newStatus }, { merge: true });
      
      const updatedTalent = { ...selectedTalent, status: newStatus };
      setTalents(prev => prev.map(t => t.id === selectedTalent.id ? updatedTalent : t));
      setSelectedTalent(updatedTalent);
    } catch (e) {
      console.error("Failed to toggle status", e);
      showError("Error toggling status.");
    }
  };

  const handleDeleteTalent = async () => {
    if (!selectedTalent) return;
    const confirmDelete = (await confirmAction(`Are you absolutely sure you want to completely delete ${selectedTalent.displayName}? This securely removes them from the database.`));
    if (!confirmDelete) return;
    
    try {
      await deleteDoc(doc(db, "users", selectedTalent.id));
      await deleteDoc(doc(db, "talents", selectedTalent.id));
      setTalents(prev => prev.filter(t => t.id !== selectedTalent.id));
      setSelectedTalent(null);
    } catch (e) {
      console.error("Failed to delete talent", e);
      showError("Error deleting talent.");
    }
  };

  const handleSaveModalEdits = async () => {
    if (!selectedTalent || !companyId) return;
    setSaving(true);
    try {
      if (editForm.username.trim()) {
        const usernameQuery = query(collection(db, "talents"), where("username", "==", editForm.username.trim().toLowerCase()));
        const usernameSnap = await getDocs(usernameQuery);
        if (!usernameSnap.empty && usernameSnap.docs[0].id !== selectedTalent.id) {
          showError("Username already taken. Please choose another.");
          setSaving(false);
          return;
        }
      }

      // Check if Email or Phone changed and update credentials via API
      let updatedEmail = selectedTalent.email || "";
      let updatedPhone = selectedTalent.phone || selectedTalent.phoneNumber || "";

      if (editForm.email.trim() !== (selectedTalent.email || "").trim() || editForm.phone.trim() !== (selectedTalent.phone || "").trim()) {
        const credRes = await fetch("/api/user/update-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUid: selectedTalent.id,
            newEmail: editForm.email.trim(),
            newPhone: editForm.phone.trim(),
          }),
        });
        const credData = await credRes.json();
        if (!credRes.ok) {
          showError(credData.error || "Failed to update talent email/phone credentials.");
          setSaving(false);
          return;
        }
        updatedEmail = editForm.email.trim();
        updatedPhone = editForm.phone.trim();
        showSuccess("Credentials updated! Security alerts & verification emails sent.");
      }

      const payload = {
        displayName: editForm.displayName.trim(),
        originalName: editForm.originalName.trim(),
        username: editForm.username.trim(),
        email: updatedEmail,
        phone: updatedPhone,
        phoneNumber: updatedPhone,
        profileImage: editForm.profileImage,
        gender: editForm.gender,
        talentType: editForm.talentType,
        locations: editForm.locations,
        workingHours: editForm.workingHours,
        blockedDates: editForm.blockedDates,
        gallery: editForm.gallery,
        galleryLayout: editForm.galleryLayout
      };
      await setDoc(doc(db, "talents", selectedTalent.id), payload, { merge: true });
      await setDoc(doc(db, "users", selectedTalent.id), { profileImage: editForm.profileImage, photoUrl: editForm.profileImage, email: updatedEmail, phone: updatedPhone, phoneNumber: updatedPhone }, { merge: true });
      
      const updatedTalent = { ...selectedTalent, ...payload } as Talent;
      setTalents(prev => prev.map(t => t.id === selectedTalent.id ? updatedTalent : t));
      setSelectedTalent(updatedTalent);
      setIsEditingModal(false);
    } catch (e) {
      console.error("Failed to save edits", e);
      showError("Error saving edits.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddBlackoutDateAdmin = () => {
     if (!newBlackoutDate) { showError("Select a start date"); return; }
     const start = new Date(newBlackoutDate);
     const end = newBlackoutEndDate ? new Date(newBlackoutEndDate) : start;
     if (end < start) { showError("End date cannot be before start"); return; }
     
     const newBlocks: any[] = [];
     let currentDate = new Date(start);
     currentDate.setHours(12, 0, 0, 0);
     end.setHours(12, 0, 0, 0);
     while (currentDate <= end) {
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(currentDate.getDate()).padStart(2,'0')}`;
        if (!editForm.blockedDates.some(b => b?.date === dateStr)) {
           newBlocks.push({ id: Date.now().toString() + Math.random().toString(36).substr(2, 5), date: dateStr, reason: newBlackoutReason });
        }
        currentDate.setDate(currentDate.getDate() + 1);
     }
     if (newBlocks.length === 0) { showError("Dates already blocked"); return; }
     setEditForm(p => ({ ...p, blockedDates: [...p.blockedDates, ...newBlocks].sort((a,b) => a.date.localeCompare(b.date)) }));
     setNewBlackoutDate(""); setNewBlackoutEndDate(""); setNewBlackoutReason("");
     showSuccess(`Added ${newBlocks.length} dates.`);
     setShowBlackoutAdder(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTalent) return;
    
    const MAX_MB = 10;
    const MAX_BYTES = MAX_MB * 1024 * 1024;

    if (file.size > MAX_BYTES) {
      showError(`File size exceeds ${MAX_MB}MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB selected). Please choose a smaller image.`);
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.url) {
        setEditForm(prev => ({ ...prev, profileImage: data.url }));
        setSelectedTalent(prev => prev ? { ...prev, profileImage: data.url } : null);
        showSuccess("Profile image uploaded successfully! Click Save to apply.");
      } else {
        showError(data.error || "Failed to upload image.");
      }
    } catch (error: any) {
      console.error("Upload Error:", error);
      showError("Failed to upload image. Please try again.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleAdminGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selectedTalent) return;

    const MAX_MB = 10;
    const MAX_BYTES = MAX_MB * 1024 * 1024;
    const currentCount = editForm.gallery.length;
    const slotsLeft = 10 - currentCount;

    if (slotsLeft <= 0) {
      showError("Gallery is full. Max 10 images allowed. Remove some to add new ones.");
      e.target.value = "";
      return;
    }

    const filesToUpload = files.slice(0, slotsLeft);
    const oversized = filesToUpload.filter(f => f.size > MAX_BYTES);
    if (oversized.length > 0) {
      showError(`${oversized.length} file(s) exceed ${MAX_MB}MB limit. Please choose smaller images.`);
      e.target.value = "";
      return;
    }

    setIsUploadingGallery(true);
    try {
      const uploaded: string[] = [];
      for (const file of filesToUpload) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.success && data.url) {
          uploaded.push(data.url);
        }
      }
      if (uploaded.length > 0) {
        setEditForm(prev => ({ ...prev, gallery: [...prev.gallery, ...uploaded] }));
        showSuccess(`${uploaded.length} image(s) added to gallery. Click Save to apply.`);
      } else {
        showError("Failed to upload images.");
      }
    } catch (err) {
      console.error("Gallery upload error:", err);
      showError("Failed to upload gallery images. Please try again.");
    } finally {
      setIsUploadingGallery(false);
      e.target.value = "";
    }
  };

  const handleAdminRemoveGalleryImage = (index: number) => {
    setEditForm(prev => ({ ...prev, gallery: prev.gallery.filter((_, i) => i !== index) }));
  };

  const activeCount = talents.filter(t => t.status === "active").length;

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="bg-[#5046E5]/10 p-2 rounded-xl">
              <Users className="w-5 h-5 text-[#5046E5]" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">All Talents</h1>
          </div>
          <p className="text-sm text-slate-500 ml-11">Manage your talent roster and their portal access</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              if (typeof window !== "undefined") {
                const link = `${window.location.origin}/${companyId}/become-talent`;
                navigator.clipboard.writeText(link);
                showSuccess("Registration Link Copied: " + link);
              }
            }}
            className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold gap-2 shadow-md shadow-amber-400/25 rounded-xl h-10 px-4 border-none"
          >
            <Mail className="w-4 h-4" /> Share Link
          </Button>

          <Button
            onClick={() => { setShowModal(true); setSaveError(""); }}
            className="bg-[#5046E5] hover:bg-[#3730A3] text-white gap-2 shadow-md shadow-[#5046E5]/25 rounded-xl h-10 px-5"
          >
            <Plus className="w-4 h-4" /> Add New Talent
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Talents", value: talents.length, color: "bg-[#5046E5]" },
          { label: "Active", value: activeCount, color: "bg-emerald-500" },
          { label: "Inactive", value: talents.length - activeCount, color: "bg-slate-400" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
            <div className={cn("w-2.5 h-8 rounded-full shrink-0", s.color)} />
            <div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 font-medium">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, type, or location..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 h-9 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#5046E5] focus:ring-2 focus:ring-[#5046E5]/10 transition-all bg-slate-50"
            />
          </div>
          <span className="text-xs text-slate-400 font-medium whitespace-nowrap">{filtered.length} talent{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="p-16 text-center">
            <div className="w-8 h-8 border-2 border-[#5046E5]/20 border-t-[#5046E5] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading talents...</p>
          </div>
        ) : paginated.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-600 font-semibold">{search ? "No talents match your search" : "No talents added yet"}</p>
            <p className="text-slate-400 text-sm mt-1">{search ? "Try a different search term" : `Click "Add New Talent" to register your first talent.`}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                  <th className="px-5 py-3.5 whitespace-nowrap font-semibold">Talent ID</th>
                  <th className="px-5 py-3.5 whitespace-nowrap font-semibold">Stage Name</th>
                  <th className="px-5 py-3.5 whitespace-nowrap font-semibold">Real Name</th>
                  <th className="px-5 py-3.5 whitespace-nowrap font-semibold">Completed Jobs</th>
                  <th className="px-5 py-3.5 whitespace-nowrap font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white">
                {paginated.map((talent) => (
                  <tr 
                    key={talent.id} 
                    onClick={() => setSelectedTalent(talent)}
                    className="hover:bg-slate-50/60 transition-colors group cursor-pointer"
                  >
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md border border-slate-200/60">
                        {talent.numericId || talent.id.slice(0, 8).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        {talent.profileImage ? (
                          <img src={talent.profileImage} alt={talent.displayName} className="w-9 h-9 rounded-xl object-cover shrink-0 shadow-sm border border-slate-100" />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5046E5]/10 to-violet-50 flex items-center justify-center shrink-0 font-bold text-[#5046E5] text-sm border border-[#5046E5]/10">
                            {talent.displayName?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                        )}
                        <span className="font-bold text-[13px] text-slate-900">{talent.displayName || "-"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="text-[13px] font-semibold text-slate-600">{talent.originalName || "-"}</span>
                    </td>
                    <td 
                      className="px-5 py-3.5 whitespace-nowrap"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTalent(talent);
                        fetchTalentBookings(talent.id);
                        setShowJobsModal(true);
                      }}
                    >
                      <button className="text-[13px] font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all border border-indigo-100 shadow-sm px-2.5 py-1 rounded-md cursor-pointer">
                        {talent.completedJobs || 0}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className={cn(
                        "text-[10px] uppercase tracking-wider font-black px-2.5 py-1 rounded-full border shadow-sm",
                        talent.status === "active" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"
                      )}>
                        {talent.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs text-slate-400">Page {page} of {totalPages} · {filtered.length} talents</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} className={cn("w-7 h-7 rounded-lg text-xs font-semibold transition-all", p === page ? "bg-[#5046E5] text-white shadow-sm" : "text-slate-500 hover:bg-white border border-slate-200")}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

      {/* ===== Add Talent Modal ===== */}
      {showModal && (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && setShowModal(false)} />
          
          {/* Modal */}
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#5046E5] to-violet-600 px-7 py-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-xl">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Add New Talent</h2>
                    <p className="text-white/70 text-xs mt-0.5">Creates a login account for the talent</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} disabled={saving} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Form */}
            <div className="p-7 space-y-4 max-h-[70vh] overflow-y-auto">
              {saveError && (
                <div className="bg-red-50 text-red-600 border border-red-100 rounded-xl px-4 py-3 text-sm font-medium">
                  {saveError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Display Name */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1.5">Display Name *</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="e.g. Sarah J."
                      value={form.displayName}
                      onChange={e => updateForm("displayName", e.target.value)}
                      className="pl-10 h-11 rounded-xl border-slate-200 focus:border-[#5046E5] focus:ring-[#5046E5]/10 focus:ring-4"
                    />
                  </div>
                </div>

                {/* Original Name */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1.5">Original Name *</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="e.g. Sarah Johnson"
                      value={form.originalName}
                      onChange={e => updateForm("originalName", e.target.value)}
                      className="pl-10 h-11 rounded-xl border-slate-200 focus:border-[#5046E5] focus:ring-[#5046E5]/10 focus:ring-4"
                    />
                  </div>
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1.5">Email Address *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="talent@example.com"
                    value={form.email}
                    onChange={e => updateForm("email", e.target.value)}
                    className="pl-10 h-11 rounded-xl border-slate-200 focus:border-[#5046E5] focus:ring-[#5046E5]/10 focus:ring-4"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1.5">Portal Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 6 characters"
                    value={form.password}
                    onChange={e => updateForm("password", e.target.value)}
                    className="pl-10 pr-11 h-11 rounded-xl border-slate-200 focus:border-[#5046E5] focus:ring-[#5046E5]/10 focus:ring-4"
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1 ml-1">This will be the talent's login password for their portal.</p>
              </div>

              <div>
                {/* Phone */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1.5">Phone</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="+1 702 123 4567"
                      value={form.phone}
                      onChange={e => updateForm("phone", formatPhoneNumber(e.target.value))}
                      className="pl-10 h-11 rounded-xl border-slate-200 focus:border-[#5046E5] focus:ring-[#5046E5]/10 focus:ring-4"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-7 pb-7 flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="flex-1 h-11 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddTalent}
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-[#5046E5] hover:bg-[#3730A3] text-white shadow-md shadow-[#5046E5]/30 gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Create Talent Account
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Talent Details Modal ===== */}
      {selectedTalent && (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 sm:p-6 sm:py-8 lg:py-12">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setSelectedTalent(null)}></div>
          
          <div className="relative w-full max-w-5xl xl:max-w-6xl bg-[#f8fafc] rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-full animate-in zoom-in-95 duration-200">
            
            {/* Top Header Controls */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-100 z-30 px-3 sm:px-6 py-3 flex items-center justify-between shadow-sm shrink-0 gap-2">
               <h2 className="text-xs sm:text-sm font-black text-slate-400 uppercase tracking-widest truncate hidden xs:block sm:block">
                 {isEditingModal ? "Edit Talent Profile" : "Talent Profile"}
               </h2>
               <div className="flex items-center gap-2 ml-auto min-w-0">
                 <div className="flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto custom-scrollbar py-0.5 max-w-[calc(100vw-100px)] sm:max-w-none shrink">
                   {isEditingModal ? (
                     <>
                       <Button onClick={() => setIsEditingModal(false)} variant="ghost" className="h-9 sm:h-10 text-xs sm:text-sm rounded-xl hover:bg-slate-200/50 text-slate-500 font-bold px-3 sm:px-4 shrink-0">
                         Cancel
                       </Button>
                       <Button onClick={handleSaveModalEdits} disabled={saving} className="h-9 sm:h-10 text-xs sm:text-sm rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 gap-1.5 sm:gap-2 px-3.5 sm:px-5 font-bold shrink-0">
                         {saving ? (
                           <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                         ) : (
                           <><Check className="w-4 h-4" /> Save</>
                         )}
                       </Button>
                     </>
                   ) : (
                     <>
                       {(!selectedTalent.completedJobs && !selectedTalent.assigned) && (
                         <button onClick={handleDeleteTalent} className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 rounded-[12px] sm:rounded-[14px] text-[10px] sm:text-[11px] font-black tracking-widest uppercase transition-colors shadow-sm focus:outline-none shrink-0">
                           <Trash2 className="w-3.5 h-3.5" /> Delete
                         </button>
                       )}
                       
                       <button onClick={() => {
                         setEditForm({
                           displayName: selectedTalent.displayName || "",
                           originalName: selectedTalent.originalName || "",
                           username: selectedTalent.username || "",
                           email: selectedTalent.email || "",
                           phone: selectedTalent.phone || selectedTalent.phoneNumber || "",
                           profileImage: selectedTalent.profileImage || "",
                           gender: Array.isArray(selectedTalent.gender) ? selectedTalent.gender : (selectedTalent.gender ? [selectedTalent.gender] : []),
                           talentType: Array.isArray(selectedTalent.talentType) ? selectedTalent.talentType.filter((t: string) => t !== "No Type") : (selectedTalent.talentType && selectedTalent.talentType !== "No Type" ? [selectedTalent.talentType] : []),
                           locations: Array.isArray(selectedTalent.locations) ? selectedTalent.locations : (selectedTalent.location ? [selectedTalent.location] : []),
                           workingHours: (() => {
                             const wh = selectedTalent.workingHours || {};
                             const start = wh.start || "00:00";
                             const end = wh.end || "23:59";
                             const mode = wh.mode || ((start === "00:00" && end === "23:59") ? "24hours" : "custom");
                             return { mode, start, end };
                           })(),
                           blockedDates: selectedTalent.blockedDates || [],
                           gallery: Array.isArray(selectedTalent.gallery) ? selectedTalent.gallery : [],
                           galleryLayout: selectedTalent.galleryLayout || "grid"
                         });
                         setIsEditingModal(true);
                         setShowBlackoutAdder(false);
                       }} className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 rounded-[12px] sm:rounded-[14px] text-[10px] sm:text-[11px] font-black tracking-widest uppercase transition-colors shadow-sm focus:outline-none shrink-0">
                         <Edit3 className="w-3.5 h-3.5" /> Edit
                       </button>
                       
                       <button onClick={handleToggleStatus} className={cn(
                         "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 border rounded-[12px] sm:rounded-[14px] text-[10px] sm:text-[11px] font-black tracking-widest uppercase transition-colors shadow-sm focus:outline-none shrink-0", 
                         selectedTalent.status === "active" ? "bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-200" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100"
                       )}>
                         <ShieldAlert className="w-3.5 h-3.5" />
                         {selectedTalent.status === "active" ? "Deactivate" : "Activate"}
                       </button>
                       
                       <button 
                         onClick={() => { setShowActivityLogs(p => !p); setIsEditingModal(false); }} 
                         className={cn(
                           "flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 border rounded-[12px] sm:rounded-[14px] text-[10px] sm:text-[11px] font-black tracking-widest uppercase transition-colors shadow-sm focus:outline-none shrink-0",
                           showActivityLogs ? "bg-blue-600 text-white border-blue-600 shadow-blue-200" : "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-100"
                         )}
                       >
                         <Activity className="w-3.5 h-3.5" />
                         {showActivityLogs ? "Profile" : "Activity"}
                       </button>
                     </>
                   )}
                 </div>

                 <button 
                   onClick={() => { setSelectedTalent(null); setIsEditingModal(false); setShowActivityLogs(false); }} 
                   className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-full transition-colors flex items-center justify-center shrink-0 focus:outline-none ml-1 border border-slate-200/80 shadow-sm"
                   title="Close modal"
                 >
                   <X className="w-5 h-5" />
                 </button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
               <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 mt-2 sm:mt-2">
                 
                 {/* Left Column: Identity & Contact */}
                 <div className="lg:col-span-5 xl:col-span-4 space-y-6">
                    {/* Identity Card */}
                    <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
                       <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-br from-indigo-50/80 to-purple-50/80 border-b border-white"></div>
                       
                       <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-[32px] overflow-hidden border-4 border-white shadow-xl bg-white shrink-0 mt-6 flex items-center justify-center z-10 group">
                          {isEditingModal ? (
                            <>
                              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center p-2 text-center transition-opacity opacity-80 group-hover:opacity-100">
                                {isUploading ? (
                                  <div className="flex flex-col items-center gap-1.5">
                                    <Loader2 className="w-7 h-7 text-white animate-spin" />
                                    <span className="text-[10px] font-black text-white uppercase tracking-wider">Uploading...</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    <Camera className="w-7 h-7 text-white" />
                                    <span className="text-[10px] font-black text-white uppercase tracking-wider">Change Photo</span>
                                    <span className="text-[9px] text-indigo-200 font-bold">Max 10MB</span>
                                  </div>
                                )}
                                <input
                                  type="file"
                                  accept="image/*,.webp,.svg,.png,.jpeg,.jpg,.gif,.heic,.heif,.avif"
                                  onChange={handleImageUpload}
                                  disabled={isUploading}
                                  title="Upload talent photo (Max 10MB)"
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                              </div>
                              {editForm.profileImage ? <img src={editForm.profileImage} alt="Avatar" className="w-full h-full object-cover" /> : <span className="text-5xl font-black text-indigo-300 tracking-tighter">?</span>}
                            </>
                          ) : (
                            selectedTalent.profileImage ? (
                              <img src={selectedTalent.profileImage} alt={selectedTalent.displayName} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-5xl font-black text-indigo-300 tracking-tighter">{selectedTalent.displayName?.charAt(0).toUpperCase()}</span>
                            )
                          )}
                       </div>
                       {isEditingModal && (
                         <div className="mt-2.5 z-10 text-center">
                           <span className="text-[11px] font-bold text-slate-400">
                             Max size: <strong className="text-indigo-600 font-black">10MB</strong> (WEBP, SVG, PNG, JPG, GIF, HEIC)
                           </span>
                         </div>
                       )}

                       <div className="mt-6 w-full relative z-10 space-y-3">
                          {isEditingModal ? (
                            <div className="space-y-3">
                              <Input value={editForm.displayName} onChange={e => setEditForm(p => ({ ...p, displayName: e.target.value }))} placeholder="Display Name (Public)" className="text-center font-black text-lg h-12" />
                              <Input value={editForm.originalName} onChange={e => setEditForm(p => ({ ...p, originalName: e.target.value }))} placeholder="Real Name (Internal Only)" className="text-center font-bold text-sm h-11 bg-slate-50" />
                              <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[13px]">@</span>
                                <Input value={editForm.username} onChange={e => setEditForm(p => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="username" className="pl-8 text-center font-medium text-sm h-11" />
                              </div>
                            </div>
                          ) : (
                            <>
                              <h2 className="text-2xl font-black text-slate-900 tracking-tight truncate uppercase">{selectedTalent.displayName || "Unnamed Talent"}</h2>
                              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">
                                {selectedTalent.originalName && selectedTalent.originalName !== selectedTalent.displayName ? selectedTalent.originalName : "Professional Profile"}
                              </p>
                            </>
                          )}
                          
                          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                             <span className={cn(
                               "px-3 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase border inline-flex items-center",
                               selectedTalent.status === "active" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
                             )}>
                               {selectedTalent.status === "active" ? "Active" : "Inactive"}
                             </span>
                             <span className="px-3 py-1.5 rounded-xl text-[10px] font-black text-slate-500 tracking-widest uppercase bg-slate-50 border border-slate-200">
                               ID: {selectedTalent.numericId || selectedTalent.id.slice(0, 8).toUpperCase()}
                             </span>
                          </div>

                          <div className="mt-8 border-t border-slate-100 pt-6">
                            <a href={`/${companyId}/talent/${selectedTalent.username || selectedTalent.id}`} target="_blank" rel="noreferrer" className="w-full h-12 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all shadow-md shadow-indigo-200 uppercase tracking-wider text-[11px]">
                               <Globe className="w-4 h-4" /> View Public Profile
                            </a>
                          </div>
                       </div>
                    </div>

                    {/* Contact Card */}
                    <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
                       <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5">Contact Details</h3>
                       
                       <div className="space-y-4">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 rounded-[14px] bg-indigo-50 border border-indigo-100/50 flex items-center justify-center shrink-0">
                               <Mail className="w-4 h-4 text-indigo-500" />
                             </div>
                             <div className="min-w-0 pr-1 flex-1">
                               <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Email</p>
                               {isEditingModal ? (
                                 <Input
                                   type="email"
                                   value={editForm.email}
                                   onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))}
                                   className="w-full h-10 text-xs font-bold bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-500/10 rounded-xl px-2.5"
                                   placeholder="talent@example.com"
                                   title={editForm.email}
                                 />
                               ) : (
                                 <p className="text-xs sm:text-sm font-bold text-slate-800 break-all select-all hover:text-indigo-600 transition-colors leading-snug" title={selectedTalent.email}>
                                   {selectedTalent.email || "-"}
                                 </p>
                               )}
                             </div>
                          </div>
                          
                          <div className="w-full h-px bg-slate-50"></div>

                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 rounded-[14px] bg-purple-50 border border-purple-100/50 flex items-center justify-center shrink-0">
                               <Phone className="w-4 h-4 text-purple-500" />
                             </div>
                             <div className="min-w-0 pr-1 flex-1">
                               <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Phone</p>
                               {isEditingModal ? (
                                 <Input
                                   type="tel"
                                   value={editForm.phone}
                                   onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))}
                                   className="w-full h-10 text-xs font-bold bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-purple-500/10 rounded-xl px-2.5"
                                   placeholder="+1 (555) 000-0000"
                                   title={editForm.phone}
                                 />
                               ) : (
                                 <p className="text-xs sm:text-sm font-bold text-slate-800 break-all select-all leading-snug" title={selectedTalent.phone}>
                                   {selectedTalent.phone || "-"}
                                 </p>
                               )}
                             </div>
                          </div>
                       </div>
                    </div>

                      {/* Working Hours Box */}
                      <div className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm space-y-4">
                        {isEditingModal ? (
                          <div className="space-y-4">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-blue-500" />
                              <span className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Daily Working Hours</span>
                            </div>

                            {/* 2-Option Toggle: 24 Hours vs Custom Hours */}
                            <div className="grid grid-cols-2 p-1 bg-slate-100/80 rounded-2xl gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditForm(p => ({
                                    ...p,
                                    workingHours: { mode: "24hours", start: "00:00", end: "23:59" }
                                  }));
                                }}
                                className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                  (editForm.workingHours?.mode === "24hours" || (!editForm.workingHours?.mode && editForm.workingHours?.start === "00:00" && editForm.workingHours?.end === "23:59"))
                                    ? "bg-white text-indigo-600 shadow-sm border border-slate-200/60"
                                    : "text-slate-500 hover:text-slate-900"
                                }`}
                              >
                                <Sparkles className="w-3.5 h-3.5" /> 24 Hours
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  const currStart = (editForm.workingHours?.start && editForm.workingHours?.start !== "00:00") ? editForm.workingHours.start : "09:00";
                                  const currEnd = (editForm.workingHours?.end && editForm.workingHours?.end !== "23:59") ? editForm.workingHours.end : "17:00";
                                  setEditForm(p => ({
                                    ...p,
                                    workingHours: { mode: "custom", start: currStart, end: currEnd }
                                  }));
                                }}
                                className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                  (editForm.workingHours?.mode === "custom" || (editForm.workingHours?.mode !== "24hours" && (editForm.workingHours?.start !== "00:00" || editForm.workingHours?.end !== "23:59")))
                                    ? "bg-white text-indigo-600 shadow-sm border border-slate-200/60"
                                    : "text-slate-500 hover:text-slate-900"
                                }`}
                              >
                                <Clock className="w-3.5 h-3.5" /> Custom Hours
                              </button>
                            </div>

                            {/* Custom Hours inputs or 24 Hours banner */}
                            {(editForm.workingHours?.mode === "custom" || (editForm.workingHours?.mode !== "24hours" && (editForm.workingHours?.start !== "00:00" || editForm.workingHours?.end !== "23:59"))) ? (
                              <div className="space-y-2 animate-in fade-in duration-200">
                                <div className="flex justify-between items-center px-1">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Time From</span>
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Time To</span>
                                </div>
                                <div className="grid grid-cols-[1fr_auto_1fr] items-center p-2 bg-slate-50 rounded-2xl border border-slate-100 gap-2">
                                  <Input 
                                    type="time" 
                                    value={editForm.workingHours.start || "09:00"}
                                    onChange={(e) => setEditForm(p => ({ ...p, workingHours: { ...p.workingHours, mode: "custom", start: e.target.value } }))}
                                    className="h-11 w-full text-xs font-bold bg-white border-slate-200 rounded-xl text-center shadow-sm px-2"
                                  />
                                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest px-1">TO</span>
                                  <Input 
                                    type="time" 
                                    value={editForm.workingHours.end || "17:00"}
                                    onChange={(e) => setEditForm(p => ({ ...p, workingHours: { ...p.workingHours, mode: "custom", end: e.target.value } }))}
                                    className="h-11 w-full text-xs font-bold bg-white border-slate-200 rounded-xl text-center shadow-sm px-2"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-2xl text-center space-y-0.5 animate-in fade-in duration-200">
                                <span className="text-xs font-black text-emerald-800 flex items-center justify-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Always Available (24 Hours)
                                </span>
                                <p className="text-[10px] font-bold text-emerald-600/80">Available for bookings at any hour.</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2.5 mb-2">
                              <div className="w-9 h-9 rounded-[12px] bg-blue-50 border border-blue-100/50 flex items-center justify-center shrink-0">
                                <Clock className="w-4 h-4 text-blue-500" />
                              </div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Working Hours</p>
                            </div>
                            <div className="flex flex-wrap gap-2 pl-[46px]">
                              {(() => {
                                const wh = selectedTalent.workingHours;
                                const is24h = !wh || wh?.mode === "24hours" || (!wh?.mode && (wh?.start === "00:00" || !wh?.start) && (wh?.end === "23:59" || !wh?.end));
                                
                                if (is24h) {
                                  return (
                                    <span className="px-3.5 py-1.5 bg-emerald-50 border border-emerald-200/80 text-emerald-700 shadow-sm rounded-xl text-[12px] font-black inline-flex items-center gap-1.5">
                                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> 24 Hours / Always Available
                                    </span>
                                  );
                                }

                                const formatTime = (t: string) => {
                                  if (!t) return "";
                                  const [h, m] = t.split(":");
                                  const hh = parseInt(h);
                                  return `${hh % 12 || 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`;
                                };

                                return (
                                  <span className="px-3.5 py-1.5 bg-slate-50 border border-slate-200 shadow-sm rounded-xl text-[13px] font-bold text-slate-700">
                                    {formatTime(wh.start)} - {formatTime(wh.end)}
                                  </span>
                                );
                              })()}
                            </div>
                          </>
                        )}
                      </div>

                  </div>

                 {/* Right Column: Demographics / Activity Logging Switch */}
                 <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                    {showActivityLogs ? (
                      <AdminTalentActivityLog talentId={selectedTalent.id} companyId={companyId} />
                    ) : (
                    <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm flex flex-col h-full">
                       
                       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-5 border-b border-slate-100">
                         <h3 className="text-lg font-black text-slate-900 tracking-tight">Demographics <span className="text-slate-300 font-medium px-1">&</span> Specialty</h3>
                         <button 
                            onClick={() => {
                              fetchTalentBookings(selectedTalent.id);
                              setShowJobsModal(true);
                            }}
                            className="flex items-center gap-1.5 text-[11px] font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all px-3 py-1.5 rounded-xl border border-indigo-100 shadow-sm self-start sm:self-auto uppercase tracking-wider cursor-pointer"
                          >
                            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                            {selectedTalent.completedJobs || 0} Jobs Completed
                          </button>
                       </div>

                       <div className="grid grid-cols-1 gap-5 flex-1">
                         
                         {/* Gender Box */}
                         <div className={`p-6 rounded-3xl border transition-colors ${isEditingModal ? "bg-white border-indigo-100 shadow-sm ring-4 ring-indigo-50" : "bg-slate-50/50 border-slate-100 hover:border-slate-200"}`}>
                           {isEditingModal ? (
                             <SearchableMultiSelect
                               label="Editing Gender Classification"
                               icon={User}
                               placeholder="Select applicable genders"
                               options={genders}
                               selected={editForm.gender}
                               onToggle={(val) => setEditForm(p => ({
                                 ...p,
                                 gender: p.gender.includes(val) ? p.gender.filter(v => v !== val) : [...p.gender, val]
                               }))}
                             />
                           ) : (
                             <>
                               <div className="flex items-center gap-2.5 mb-4">
                                 <div className="w-9 h-9 rounded-[12px] bg-indigo-50 border border-indigo-100/50 flex items-center justify-center shrink-0">
                                   <User className="w-4 h-4 text-indigo-500" />
                                 </div>
                                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gender Representation</p>
                               </div>
                               <div className="flex flex-wrap gap-2 pl-[46px]">
                                 {Array.isArray(selectedTalent.gender) && selectedTalent.gender.length > 0 ? (
                                   selectedTalent.gender.map((item: string, i: number) => (
                                     <span key={i} className="px-3.5 py-1.5 bg-white border border-slate-200/80 shadow-[0_2px_4px_rgba(0,0,0,0.02)] rounded-xl text-[13px] font-bold text-slate-700">{item}</span>
                                   ))
                                 ) : (
                                   <span className="px-3.5 py-1.5 bg-white border border-slate-200/80 shadow-[0_2px_4px_rgba(0,0,0,0.02)] rounded-xl text-[13px] font-bold text-slate-700">{(typeof selectedTalent.gender === 'string' && selectedTalent.gender) ? selectedTalent.gender : "-"}</span>
                                 )}
                               </div>
                             </>
                           )}
                         </div>

                         {/* Job Type Box */}
                         <div className={`p-6 rounded-3xl border transition-colors ${isEditingModal ? "bg-white border-emerald-100 shadow-sm ring-4 ring-emerald-50" : "bg-slate-50/50 border-slate-100 hover:border-slate-200"}`}>
                           {isEditingModal ? (
                             <SearchableMultiSelect
                               label="Editing Primary Job Types"
                               icon={Briefcase}
                               placeholder="Select job skills/roles"
                               options={talentTypes}
                               selected={editForm.talentType}
                               onToggle={(val) => setEditForm(p => ({
                                 ...p,
                                 talentType: p.talentType.includes(val) ? p.talentType.filter(v => v !== val) : [...p.talentType, val]
                               }))}
                             />
                           ) : (
                             <>
                               <div className="flex items-center gap-2.5 mb-4">
                                 <div className="w-9 h-9 rounded-[12px] bg-emerald-50 border border-emerald-100/50 flex items-center justify-center shrink-0">
                                   <Briefcase className="w-4 h-4 text-emerald-500" />
                                 </div>
                                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Primary Job Types</p>
                               </div>
                               <div className="flex flex-wrap gap-2 pl-[46px]">
                                 {Array.isArray(selectedTalent.talentType) && selectedTalent.talentType.length > 0 ? (
                                   selectedTalent.talentType.map((item: string, i: number) => (
                                     <span key={i} className="px-3.5 py-1.5 bg-white border border-slate-200/80 shadow-[0_2px_4px_rgba(0,0,0,0.02)] rounded-xl text-[13px] font-bold text-slate-700">{item}</span>
                                   ))
                                 ) : (
                                   <span className="px-3.5 py-1.5 bg-white border border-slate-200/80 shadow-[0_2px_4px_rgba(0,0,0,0.02)] rounded-xl text-[13px] font-bold text-slate-700">{(typeof selectedTalent.talentType === 'string' && selectedTalent.talentType) ? selectedTalent.talentType : "-"}</span>
                                 )}
                               </div>
                             </>
                           )}
                         </div>

                         {/* Locations Box */}
                         <div className={`p-6 rounded-3xl border transition-colors flex flex-col gap-3 ${isEditingModal ? "bg-white border-orange-100 shadow-sm ring-4 ring-orange-50" : "bg-slate-50/50 border-slate-100 hover:border-slate-200"}`}>
                           {isEditingModal ? (
                             <AdminGooglePlacesMultiSelect
                               label="Editing Coverage Locations"
                               icon={MapPin}
                               placeholder="Search global cities..."
                               selected={editForm.locations}
                               onAdd={(val) => setEditForm(p => ({ ...p, locations: [...p.locations, val] }))}
                               onRemove={(val) => setEditForm(p => ({ ...p, locations: p.locations.filter(l => l !== val) }))}
                             />
                           ) : (
                             <>
                               <div className="flex items-center gap-2.5 mb-2">
                                 <div className="w-9 h-9 rounded-[12px] bg-orange-50 border border-orange-100/50 flex items-center justify-center shrink-0">
                                   <MapPin className="w-4 h-4 text-orange-500" />
                                 </div>
                                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Coverage Locations</p>
                               </div>
                               <div className="flex flex-wrap gap-2 pl-[46px]">
                                 {Array.isArray(selectedTalent.locations) && selectedTalent.locations.length > 0 ? (
                                   selectedTalent.locations.map((loc: string, i: number) => (
                                     <span key={i} className="px-3.5 py-1.5 bg-white border border-slate-200/80 shadow-[0_2px_4px_rgba(0,0,0,0.02)] rounded-xl text-[13px] font-bold text-slate-700">{loc}</span>
                                   ))
                                 ) : (
                                   <span className="px-3.5 py-1.5 bg-white border border-slate-200/80 shadow-[0_2px_4px_rgba(0,0,0,0.02)] rounded-xl text-[13px] font-bold text-slate-700">{(typeof selectedTalent.locations === 'string' && selectedTalent.locations) ? selectedTalent.locations : (typeof selectedTalent.location === 'string' && selectedTalent.location ? selectedTalent.location : "-")}</span>
                                 )}
                               </div>
                             </>
                           )}
                         </div>

                         {/* Blackout Dates Box */}
                         <div className={`p-6 rounded-3xl border transition-colors flex flex-col gap-3 ${isEditingModal ? "bg-white border-red-100 shadow-sm ring-4 ring-red-50" : "bg-slate-50/50 border-slate-100 hover:border-slate-200"}`}>
                           {isEditingModal ? (
                              <>
                               <div className="flex items-center gap-2 mb-2">
                                  <Calendar className="w-4 h-4 text-red-500" />
                                  <span className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Editing Blackout Dates</span>
                               </div>
                               <Button variant="outline" className="w-full text-red-600 border-red-100 hover:bg-red-50" onClick={() => setShowBlackoutAdder(!showBlackoutAdder)}>{showBlackoutAdder ? "Hide Adder" : "+ Add Blackout Date"}</Button>
                               
                               {showBlackoutAdder && (
                                   <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-2">
                                     <div className="flex gap-3">
                                       <div className="flex-1">
                                          <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Start Date</label>
                                          <Input type="date" value={newBlackoutDate} onChange={e => setNewBlackoutDate(e.target.value)} className="h-10 text-sm font-bold bg-white" />
                                       </div>
                                       <div className="flex-1">
                                          <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">End Date (Opt)</label>
                                          <Input type="date" value={newBlackoutEndDate} onChange={e => setNewBlackoutEndDate(e.target.value)} className="h-10 text-sm font-bold bg-white" />
                                       </div>
                                     </div>
                                     <Input placeholder="Reason (e.g. Vacation)..." value={newBlackoutReason} onChange={e => setNewBlackoutReason(e.target.value)} className="h-10 bg-white" />
                                     <Button onClick={handleAddBlackoutDateAdmin} className="w-full h-10 bg-red-600 hover:bg-red-700 text-white shadow-md font-bold">Save Blackout Date(s)</Button>
                                   </div>
                               )}
                               
                               {editForm.blockedDates.length > 0 && (
                                 <div className="flex flex-wrap gap-2 mt-2">
                                    {editForm.blockedDates.map((b: any, i: number) => {
                                       const isStr = typeof b === 'string';
                                       const id = isStr ? i : b.id;
                                       const date = isStr ? b : b.date;
                                       const reason = !isStr && b.reason ? `(${b.reason})` : "";
                                       return (
                                        <span key={id} className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center border border-red-100 shadow-sm animate-in zoom-in-95">
                                          {date} {reason}
                                          <button type="button" onClick={() => setEditForm(p => ({...p, blockedDates: p.blockedDates.filter((bd:any, j:number) => (typeof bd === 'string' ? j !== i : bd.id !== id))}))} className="ml-2 hover:text-red-900 transition-colors"><X className="w-3.5 h-3.5" /></button>
                                        </span>
                                      );
                                    })}
                                 </div>
                               )}
                              </>
                           ) : (
                             <>
                               <div className="flex items-center gap-2.5 mb-2">
                                 <div className="w-9 h-9 rounded-[12px] bg-red-50 border border-red-100/50 flex items-center justify-center shrink-0">
                                   <Calendar className="w-4 h-4 text-red-500" />
                                 </div>
                                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Upcoming Unavailable Dates</p>
                               </div>
                               <div className="flex flex-wrap gap-2 pl-[46px]">
                                 {(!selectedTalent.blockedDates || selectedTalent.blockedDates.length === 0) ? (
                                    <span className="px-3.5 py-1.5 bg-white border border-slate-200/80 shadow-[0_2px_4px_rgba(0,0,0,0.02)] rounded-xl text-[13px] font-bold text-slate-400">No dates blocked</span>
                                 ) : (
                                    selectedTalent.blockedDates.filter((item: any) => {
                                        if (typeof item === 'object' && item !== null && 'date' in item) {
                                            const obj = new Date(item.date);
                                            obj.setHours(12,0,0,0);
                                            const today = new Date();
                                            today.setHours(0,0,0,0);
                                            return obj >= today;
                                        }
                                        return true; // legacy strings bypass filter cleanly
                                    }).map((b: any, i: number) => {
                                      const isStr = typeof b === 'string';
                                      const label = isStr ? (new Date(b).getDate() || b) : new Date(b.date).getDate();
                                      const month = isStr ? b : new Date(b.date).toLocaleString('default', { month: 'short' });
                                      const reason = !isStr && b.reason ? ` - ${b.reason}` : '';
                                      return (
                                       <span key={i} className="px-3.5 py-1.5 bg-white border border-red-100 shadow-[0_2px_4px_rgba(0,0,0,0.02)] rounded-xl text-[12px] font-bold text-red-600 flex items-center gap-1.5">
                                          <span className="font-black text-[14px]">{label}</span> <span className="uppercase text-[10px] text-red-400 tracking-wider"> {month}</span> {reason}
                                       </span>
                                      );
                                    })
                                 )}
                               </div>
                             </>
                           )}
                         </div>

                       </div>
                        {/* Photo Gallery Section */}
                        <div className="mt-6 bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
                          <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-[12px] bg-violet-50 border border-violet-100/50 flex items-center justify-center shrink-0">
                                <Image className="w-4 h-4 text-violet-500" />
                              </div>
                              <div>
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Photo Gallery</h3>
                                <p className="text-[11px] text-slate-400 font-medium">
                                  {isEditingModal ? `${editForm.gallery.length}/10 photos` : `${(selectedTalent.gallery || []).length || 0} photos`}
                                </p>
                              </div>
                            </div>
                            {/* Layout Toggle (view mode only) */}
                            {!isEditingModal && (selectedTalent.gallery || []).length > 0 && (
                              <div className="flex items-center gap-1 bg-slate-50 border border-slate-100 rounded-xl p-1">
                                <button
                                  onClick={() => setSelectedTalent(prev => prev ? { ...prev, galleryLayout: "grid" } : null)}
                                  className={`p-1.5 rounded-lg transition-all ${
                                    (selectedTalent.galleryLayout || "grid") === "grid"
                                      ? "bg-white shadow-sm text-violet-600 border border-slate-200/60"
                                      : "text-slate-400 hover:text-slate-700"
                                  }`}
                                  title="Grid view"
                                >
                                  <LayoutGrid className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setSelectedTalent(prev => prev ? { ...prev, galleryLayout: "slider" } : null)}
                                  className={`p-1.5 rounded-lg transition-all ${
                                    selectedTalent.galleryLayout === "slider"
                                      ? "bg-white shadow-sm text-violet-600 border border-slate-200/60"
                                      : "text-slate-400 hover:text-slate-700"
                                  }`}
                                  title="List view"
                                >
                                  <LayoutList className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                            {/* Layout toggle for edit mode */}
                            {isEditingModal && (
                              <div className="flex items-center gap-1 bg-slate-50 border border-slate-100 rounded-xl p-1">
                                <button
                                  onClick={() => setEditForm(prev => ({ ...prev, galleryLayout: "grid" }))}
                                  className={`p-1.5 rounded-lg transition-all ${
                                    editForm.galleryLayout === "grid"
                                      ? "bg-white shadow-sm text-violet-600 border border-slate-200/60"
                                      : "text-slate-400 hover:text-slate-700"
                                  }`}
                                  title="Grid layout"
                                >
                                  <LayoutGrid className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditForm(prev => ({ ...prev, galleryLayout: "slider" }))}
                                  className={`p-1.5 rounded-lg transition-all ${
                                    editForm.galleryLayout === "slider"
                                      ? "bg-white shadow-sm text-violet-600 border border-slate-200/60"
                                      : "text-slate-400 hover:text-slate-700"
                                  }`}
                                  title="Slider layout"
                                >
                                  <LayoutList className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* EDIT MODE: gallery grid with upload + remove */}
                          {isEditingModal ? (
                            <div className="space-y-4">
                              <div className="grid grid-cols-3 gap-2.5">
                                {editForm.gallery.map((url, idx) => (
                                  <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
                                    <img src={url} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                      <button
                                        onClick={() => handleAdminRemoveGalleryImage(idx)}
                                        className="w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg"
                                        title="Remove image"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                {editForm.gallery.length < 10 && (
                                  <label className="relative aspect-square rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/50 hover:bg-violet-50 hover:border-violet-300 transition-all flex flex-col items-center justify-center cursor-pointer group">
                                    {isUploadingGallery ? (
                                      <>
                                        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                                        <span className="text-[10px] font-bold text-violet-400 mt-1.5 uppercase tracking-wider">Uploading...</span>
                                      </>
                                    ) : (
                                      <>
                                        <ImagePlus className="w-6 h-6 text-violet-400 group-hover:text-violet-600 transition-colors" />
                                        <span className="text-[10px] font-bold text-violet-400 group-hover:text-violet-600 mt-1.5 uppercase tracking-wider">Add Photo</span>
                                        <span className="text-[9px] text-violet-300 font-medium mt-0.5">{10 - editForm.gallery.length} left</span>
                                      </>
                                    )}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      onChange={handleAdminGalleryUpload}
                                      disabled={isUploadingGallery}
                                      className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                  </label>
                                )}
                              </div>
                              {editForm.gallery.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-6 text-center">
                                  <ImagePlus className="w-8 h-8 text-slate-200 mb-2" />
                                  <p className="text-[11px] text-slate-400 font-bold">No gallery images yet</p>
                                  <p className="text-[10px] text-slate-300 mt-0.5">Click "Add Photo" above to upload up to 10 images</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* VIEW MODE */
                            (selectedTalent.gallery || []).length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-8 text-center">
                                <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
                                  <Image className="w-5 h-5 text-slate-300" />
                                </div>
                                <p className="text-[11px] text-slate-400 font-bold">No gallery photos</p>
                                <p className="text-[10px] text-slate-300 mt-0.5">Click Edit Talent to add gallery images</p>
                              </div>
                            ) : selectedTalent.galleryLayout === "slider" ? (
                              <div className="flex gap-2.5 overflow-x-auto pb-2 custom-scrollbar">
                                {(selectedTalent.gallery || []).map((url: string, idx: number) => (
                                  <div key={idx} className="shrink-0 w-32 h-32 rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
                                    <img src={url} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="grid grid-cols-3 gap-2.5">
                                {(selectedTalent.gallery || []).map((url: string, idx: number) => (
                                  <div key={idx} className="aspect-square rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
                                    <img src={url} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                                  </div>
                                ))}
                              </div>
                            )
                          )}
                        </div>

                       {/* Internal Notes about this talent */}
                       <div className="mt-6">
                         <EntityNotes 
                           companyId={companyId}
                           entityId={selectedTalent.id}
                           entityType="talent"
                           title="Admin & Client Internal Notes"
                           placeholder="Add an internal note about this talent..."
                         />
                       </div>
                    </div>
                    )}
                 </div>

               </div>
            </div>
            
          </div>
        </div>
      )}

      {/* ===== Talent Jobs Modal ===== */}
      {showJobsModal && selectedTalent && (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowJobsModal(false)} />
          <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight">{selectedTalent.displayName}'s Jobs List</h2>
                  <p className="text-white/75 text-xs font-semibold uppercase tracking-widest mt-0.5">Roster booking associations</p>
                </div>
              </div>
              <button onClick={() => setShowJobsModal(false)} className="p-2 rounded-xl hover:bg-white/10 text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              {loadingTalentBookings ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
                  <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Loading bookings...</p>
                </div>
              ) : talentBookings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center">
                  <Calendar className="w-12 h-12 mb-3 stroke-[1.2] opacity-40 text-slate-400" />
                  <p className="text-sm font-black text-slate-800 uppercase tracking-widest">No Gigs Recorded</p>
                  <p className="text-xs font-semibold text-slate-400 mt-1">This talent has not been assigned to any bookings yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {talentBookings.map((b) => {
                    const status = b.status || "Pending";
                    const isCompleted = status === "Completed";
                    const isCancelled = status === "Cancelled";
                    const isConfirmed = status === "Confirmed";
                    
                    let statusBadge = "bg-slate-50 text-slate-500 border-slate-200";
                    if (isCompleted) statusBadge = "bg-emerald-50 text-emerald-600 border-emerald-200";
                    else if (isCancelled) statusBadge = "bg-rose-50 text-rose-600 border-rose-200";
                    else if (isConfirmed) statusBadge = "bg-green-50 text-green-600 border-green-200";
                    else if (status === "Pending") statusBadge = "bg-amber-50 text-amber-600 border-amber-200";
                    else if (status === "Selected" || status === "Assigned") statusBadge = "bg-indigo-50 text-indigo-600 border-indigo-200";

                    return (
                      <div 
                        key={b.id} 
                        onClick={() => setSelectedBookingForDetails(b)}
                        className="bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group"
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">
                              ID: {b.id.slice(0, 8).toUpperCase()}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${statusBadge}`}>
                              {status}
                            </span>
                          </div>
                          <h3 className="text-[15px] font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {b.jobType || b.__jobType || "Talent Service"}
                          </h3>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                              <span>{b.eventDate} {b.eventTime && `@ ${b.eventTime}`}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-rose-400" />
                              <span className="truncate">{b.city || b.__city || "N/A"}, {b.state || b.__state || "N/A"}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                          <div className="text-right hidden sm:block">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rate</p>
                            <p className="text-sm font-black text-emerald-600">${b.payRate || b.rate || "0"}</p>
                          </div>
                          <Button className="h-9 px-4 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-600 shadow-none border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all">
                            View details
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Job Details Modal ===== */}
      {selectedBookingForDetails && !showAssignModal && !manageTalentId && !showActivityModal && !showRateClientModal && (
        <BookingDetailsModal 
          booking={selectedBookingForDetails} 
          onSearch={(val) => {
            if (typeof window !== "undefined") {
              window.location.href = `/${companyId}/dashboard/admin/bookings/all?search=${encodeURIComponent(val)}`;
            }
          }}
          onClose={() => setSelectedBookingForDetails(null)} 
          talentsDict={talentsDict}
          setShowAssignModal={setShowAssignModal}
          setManageTalentId={setManageTalentId}
          setShowActivityModal={setShowActivityModal}
          fetchAllCompanyTalents={fetchAllCompanyTalents}
          onApprovePayment={handleApprovePayment}
          onDeclinePayment={handleDeclinePayment}
          onRateClient={() => setShowRateClientModal(true)}
          userId={adminUser?.uid || ""}
          onChat={() => { setChatBooking(selectedBookingForDetails); setSelectedBookingForDetails(null); }}
        />
      )}

      {selectedBookingForDetails && showRateClientModal && (
        <AdminRateClientModal
          booking={selectedBookingForDetails}
          companyId={companyId}
          onClose={() => { setSelectedBookingForDetails(null); setShowRateClientModal(false); }}
          onCompleted={(updatedBooking) => {
            setTalentBookings(prev => prev.map(b => b.id === updatedBooking.id ? updatedBooking : b));
            setSelectedBookingForDetails(null);
            setShowRateClientModal(false);
          }}
        />
      )}

      {manageTalentId && talentsDict[manageTalentId] && selectedBookingForDetails && (
        <TalentManagementModal 
          talent={talentsDict[manageTalentId]}
          booking={selectedBookingForDetails}
          allBookings={talentBookings}
          onUnassign={(reopen: boolean) => handleUnassign(manageTalentId, reopen)}
          onClose={() => setManageTalentId(null)}
        />
      )}

      {showAssignModal && selectedBookingForDetails && (
        <AssignTalentModal 
          booking={selectedBookingForDetails}
          allTalentRoster={allTalents}
          dictionary={talentsDict}
          loading={loadingAllTalents}
          onAssign={handleAssign}
          onClose={() => setShowAssignModal(false)}
        />
      )}

      {showActivityModal && selectedBookingForDetails && (
        <ActivityHistoryModal 
          booking={selectedBookingForDetails}
          dictionary={talentsDict}
          onClose={() => setShowActivityModal(false)}
        />
      )}

      {chatBooking && (
        <BookingChatModal 
          booking={chatBooking} 
          user={adminUser} 
          onClose={() => setChatBooking(null)} 
        />
      )}
    </>
  );
}

// Custom Searchable Multi-Select Component for Edit Mode
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
  const [searchLocal, setSearchLocal] = useState("");

  const filtered = useMemo(() =>
    options.filter(opt => opt.name.toLowerCase().includes(searchLocal.toLowerCase())),
    [options, searchLocal]
  );

  return (
    <div className="relative mb-4">
      <label className="text-[12px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1 flex items-center justify-between">
        <span className="flex items-center gap-2"><Icon className="w-4 h-4" /> {label}</span>
      </label>

      {/* Trigger */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-3 h-12 w-full rounded-2xl border-2 transition-all cursor-pointer px-4 ${isOpen ? "border-indigo-500 bg-white shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
      >
        <div className="flex-1 truncate">
          {selected.length === 0 ? (
            <span className="text-slate-400 font-medium text-sm">{placeholder}</span>
          ) : (
            <span className="text-slate-800 font-bold text-sm">{selected.join(", ")}</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 p-2 animate-in fade-in duration-150">
          <Input autoFocus value={searchLocal} onChange={e => setSearchLocal(e.target.value)} placeholder="Search..." className="h-10 mb-2 rounded-xl border-slate-100 bg-slate-50/50" />
          <div className="max-h-[200px] overflow-y-auto space-y-1 p-1 custom-scrollbar">
            {filtered.map(opt => {
              const isSelected = selected.includes(opt.name);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onToggle(opt.name)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all flex items-center justify-between group ${isSelected ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-600"}`}
                >
                  <span>{opt.name}</span>
                  {isSelected ? <CheckCircle2 className="w-4 h-4 text-indigo-600" /> : <Plus className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Badges */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2 p-1">
          {selected.map(item => (
            <span key={item} className="bg-indigo-600 text-white px-2.5 py-1 rounded-[10px] text-[10px] font-black flex items-center gap-1.5 shadow-sm">
              {item}
              <button type="button" onClick={() => onToggle(item)} className="hover:text-red-300 transition-colors"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Custom Searchable Multi-Select Component for Locations (with Google Autocomplete mapping)
function AdminGooglePlacesMultiSelect({
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
  
  const wrapperRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<any>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    
    const initService = async () => {
      const g = (window as any).google;
      if (g && g.maps && !serviceRef.current) {
        try {
          const { AutocompleteService } = await g.maps.importLibrary("places");
          serviceRef.current = new AutocompleteService();
        } catch (err) {}
      }
    };
    initService();
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    if (value.length > 2) {
      setIsOpen(true);
      const g = (window as any).google;
      let googleSuccess = false;

      if (g && g.maps) {
        try {
          if (!serviceRef.current) {
            const { AutocompleteService } = await g.maps.importLibrary("places");
            serviceRef.current = new AutocompleteService();
          }
          if (serviceRef.current) {
            const response = await serviceRef.current.getPlacePredictions({
              input: value, types: ["(cities)"], componentRestrictions: { country: "us" }
            });
            if (response && response.predictions && response.predictions.length > 0) {
              setPredictions(response.predictions.map((r: any) => r.description));
              googleSuccess = true;
            }
          }
        } catch (err) {}
      }

      // Fallback
      if (!googleSuccess) {
         try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(value)}&countrycodes=us&format=json&limit=5&addressdetails=1`);
            const data = await res.json();
            if (data && data.length > 0) {
               const formatted = data.map((item: any) => {
                  const city = item.address?.city || item.address?.town || item.address?.village || item.name;
                  const state = item.address?.state || item.address?.country;
                  return state ? `${city}, ${state}` : city;
               });
               setPredictions(Array.from(new Set(formatted as string[])));
            } else {
               setPredictions([]);
            }
         } catch (err) { setPredictions([]); }
      }
    } else {
      setIsOpen(false);
      setPredictions([]);
    }
  };

  const handleSelect = (place: string) => {
    if (!selected.includes(place)) onAdd(place);
    setInputValue("");
    setIsOpen(false);
    setPredictions([]);
  };

  return (
    <div className="relative mb-4" ref={wrapperRef}>
      <label className="text-[12px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1 flex items-center justify-between">
        <span className="flex items-center gap-2"><Icon className="w-4 h-4" /> {label}</span>
      </label>

      <div className="relative">
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onClick={() => inputValue.length > 2 && setIsOpen(true)}
          placeholder={placeholder}
          className={`h-12 w-full rounded-2xl border-2 transition-all font-medium text-slate-900 placeholder:text-slate-400 focus-visible:bg-white bg-slate-50/50 ${isOpen ? "border-indigo-500 bg-white shadow-sm ring-4 ring-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}
        />
      </div>

      {isOpen && inputValue.length > 2 && (
        <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-100 rounded-[20px] shadow-2xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-[250px] overflow-y-auto custom-scrollbar px-2">
            {predictions.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm font-medium italic">Searching...</div>
            ) : (
              predictions.map((place, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelect(place)}
                  className="w-full text-left px-4 py-3 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center gap-3"
                >
                  <MapPin className="w-4 h-4 text-slate-400" />
                  {place}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2 p-1">
          {selected.map(item => (
            <span key={item} className="bg-indigo-600 text-white px-2.5 py-1 rounded-[10px] text-[10px] font-black flex items-center gap-1.5 shadow-sm">
              {item}
              <button type="button" onClick={() => onRemove(item)} className="hover:text-red-300 transition-colors"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Sub-Component: Chronological Feed of Talent Activity Logs
function AdminTalentActivityLog({ talentId, companyId }: { talentId: string, companyId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const q = query(
          collection(db, "talent_activity_logs"), 
          where("talentId", "==", talentId),
          where("companyId", "==", companyId)
        );
        const snap = await getDocs(q);
        const fetchedLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // sort descending
        fetchedLogs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setLogs(fetchedLogs);
      } catch (err) {
        console.error("Failed to fetch logs", err);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [talentId, companyId]);

  if (loading) return (
    <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm flex flex-col h-full items-center justify-center">
      <span className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></span>
    </div>
  );

  return (
    <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm flex flex-col h-full relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-blue-400 to-indigo-500 hidden sm:block"></div>
      
      <div className="flex items-center gap-3 mb-8 pb-5 border-b border-slate-100">
        <div className="w-10 h-10 bg-blue-50 flex items-center justify-center rounded-xl">
          <Activity className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none mb-1">Activity Log</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Chronological History</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
        {logs.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No activity history recorded for this profile yet.</p>
          </div>
        ) : (
          <div className="relative pl-6 border-l-2 border-slate-100 space-y-8 mt-4">
            {logs.map(log => (
              <div key={log.id} className="relative">
                <span className="absolute -left-[31px] top-1 w-4 h-4 rounded-full border-4 border-white bg-blue-400 shadow-sm"></span>
                <p className="text-slate-800 text-sm font-bold">{log.actionStr || "Unknown action"}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(log.timestamp).toLocaleString()}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                  <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{log.changedByRole}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
