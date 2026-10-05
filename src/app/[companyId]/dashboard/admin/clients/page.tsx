"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, updateDoc, getDoc, setDoc, arrayUnion, serverTimestamp, addDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import {
  Users, Search, Mail, Phone, Calendar, ChevronLeft, ChevronRight, UserCircle, Star, FileText, X, Briefcase, Clock, MapPin, CreditCard, Info, User, CheckCircle2, XCircle,
  Eye, Loader2, DollarSign, Activity, Trash2, RotateCcw, ChevronDown, History
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityNotes } from "@/components/notes/EntityNotes";
import { showSuccess, showError } from "@/lib/alerts";
import { BookingChatButton } from "@/components/bookings/BookingChatButton";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";
import { sendNotification, sendNotificationToAdmins, sendNotificationToTalents } from "@/lib/notifications";
import { Button } from "@/components/ui/button";

interface ClientData {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  status: string;
  createdAt?: string;
}

const PAGE_SIZE = 15;

const getStatusBadgeStyles = (status: string) => {
  const normalized = (status || "active").toLowerCase();
  if (normalized === "active") {
    return { bg: "bg-emerald-50 text-emerald-600 border-emerald-250", dot: "bg-emerald-500", label: "Active" };
  } else if (normalized === "under review" || normalized === "under_review") {
    return { bg: "bg-amber-50 text-amber-600 border-amber-250", dot: "bg-amber-500", label: "Under Review" };
  } else if (normalized === "inactive") {
    return { bg: "bg-slate-50 text-slate-500 border-slate-200", dot: "bg-slate-400", label: "Inactive" };
  } else if (normalized === "terminated") {
    return { bg: "bg-rose-50 text-rose-600 border-rose-250", dot: "bg-rose-500", label: "Terminated" };
  } else {
    return { bg: "bg-slate-50 text-slate-500 border-slate-200", dot: "bg-slate-400", label: status || "Active" };
  }
};

export default function AdminClientsPage({ params }: { params: any }) {
  const { user: adminUser } = useAuth();
  const companyId = adminUser?.companyId as string;

  const [clients, setClients] = useState<ClientData[]>([]);
  const [internalRatings, setInternalRatings] = useState<Record<string, {
    overall: number,
    punctuality: number,
    communication: number,
    reliability: number,
    count: number
  }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedClientForDetails, setSelectedClientForDetails] = useState<ClientData | null>(null);
  const [modalTab, setModalTab] = useState<"info" | "bookings" | "notes">("info");
  const [clientBookings, setClientBookings] = useState<any[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [inspectedBooking, setInspectedBooking] = useState<any | null>(null);

  // Client Credential Edit state
  const [editClientEmail, setEditClientEmail] = useState("");
  const [editClientPhone, setEditClientPhone] = useState("");
  const [isEditingClientCreds, setIsEditingClientCreds] = useState(false);
  const [savingClientCreds, setSavingClientCreds] = useState(false);

  // Bookings Tab Search & Filters
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatus, setBookingStatus] = useState("All");

  // Admin Booking Operations States
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [manageTalentId, setManageTalentId] = useState<string | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [allTalents, setAllTalents] = useState<any[]>([]);
  const [loadingAllTalents, setLoadingAllTalents] = useState(false);
  const [talentsDict, setTalentsDict] = useState<Record<string, any>>({});
  const [showRateClientModal, setShowRateClientModal] = useState(false);
  const [chatBooking, setChatBooking] = useState<any | null>(null);

  useEffect(() => {
    if (!selectedClientForDetails) {
      setBookingSearch("");
      setBookingStatus("All");
      setIsEditingClientCreds(false);
    } else {
      setEditClientEmail(selectedClientForDetails.email || "");
      setEditClientPhone(selectedClientForDetails.phoneNumber || "");
    }
  }, [selectedClientForDetails]);

  const handleSaveClientCredentials = async () => {
    if (!selectedClientForDetails) return;
    setSavingClientCreds(true);
    try {
      const res = await fetch("/api/user/update-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUid: selectedClientForDetails.id,
          newEmail: editClientEmail,
          newPhone: editClientPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || "Failed to update client credentials.");
      } else {
        showSuccess("Client email and phone number updated successfully!");
        const updatedClient = {
          ...selectedClientForDetails,
          email: editClientEmail,
          phoneNumber: editClientPhone,
        };
        setSelectedClientForDetails(updatedClient);
        setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
        setIsEditingClientCreds(false);
      }
    } catch (err: any) {
      console.error("Error updating client credentials:", err);
      showError("Failed to update credentials.");
    } finally {
      setSavingClientCreds(false);
    }
  };

  const fetchInternalRatings = async () => {
    if (!companyId) return;
    try {
      const snap = await getDocs(query(
        collection(db, "client_internal_ratings"),
        where("companyId", "==", companyId)
      ));
      
      const ratingGroups: Record<string, { punctuality: number[], communication: number[], reliability: number[] }> = {};
      snap.docs.forEach(doc => {
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

      const processed: typeof internalRatings = {};
      Object.entries(ratingGroups).forEach(([cid, metrics]) => {
        const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / arr.length;
        const pAvg = avg(metrics.punctuality);
        const cAvg = avg(metrics.communication);
        const rAvg = avg(metrics.reliability);
        const overall = (pAvg + cAvg + rAvg) / 3;
        processed[cid] = {
          overall: Number(overall.toFixed(1)),
          punctuality: Number(pAvg.toFixed(1)),
          communication: Number(cAvg.toFixed(1)),
          reliability: Number(rAvg.toFixed(1)),
          count: metrics.punctuality.length
        };
      });

      setInternalRatings(processed);
    } catch (e) {
      console.error("Error fetching internal ratings:", e);
    }
  };

  const fetchClients = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, "users"),
        where("companyId", "==", companyId),
        where("role", "==", "client")
      ));
      
      const list = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter((u: any) => u.role === "client")
        .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
      
      setClients(list);
    } catch (err) {
      console.error("Error fetching clients:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) { 
      fetchClients(); 
      fetchInternalRatings();
    }
  }, [companyId]);

  useEffect(() => {
    if (!selectedClientForDetails || !companyId) {
      setClientBookings([]);
      return;
    }
    
    const fetchBookings = async () => {
      setLoadingBookings(true);
      try {
        const snap = await getDocs(query(
          collection(db, "bookings"),
          where("companyId", "==", companyId),
          where("clientId", "==", selectedClientForDetails.id)
        ));
        const list = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })) as any[];
        list.sort((a: any, b: any) => {
          const dA = a.eventDate ? new Date(a.eventDate).getTime() : 0;
          const dB = b.eventDate ? new Date(b.eventDate).getTime() : 0;
          return dB - dA;
        });
        setClientBookings(list);

        // Fetch talent details for any assigned/applicant/selected talent to show in modals
        const uids = new Set<string>();
        list.forEach(b => {
           if (b.talentId) uids.add(b.talentId);
           if (b.selectedTalentId) uids.add(b.selectedTalentId);
           if (b.applicants) b.applicants.forEach((id: string) => uids.add(id));
           if (b.selectedTalentIds) b.selectedTalentIds.forEach((id: string) => uids.add(id));
        });

        const dict: Record<string, any> = {};
        if (uids.size > 0) {
          await Promise.all(Array.from(uids).map(async (uid) => {
            const [uSnap, tSnap] = await Promise.all([
              getDoc(doc(db, "users", uid)),
              getDoc(doc(db, "talents", uid))
            ]);
            if (uSnap.exists() || tSnap.exists()) {
              const uD = uSnap.data() || {};
              const tD = tSnap.data() || {};
              dict[uid] = {
                ...uD,
                ...tD,
                displayName: tD.displayName || tD.name || uD.name || uD.displayName || uD.email || "Unknown Talent",
                profileImage: tD.photoUrl || tD.profileImage || uD.profileImage || uD.photoUrl || null
              };
            }
          }));
          setTalentsDict(dict);
        }
      } catch (err) {
        console.error("Error fetching client bookings:", err);
      } finally {
        setLoadingBookings(false);
      }
    };

    fetchBookings();
  }, [selectedClientForDetails?.id, companyId]);

  const handleUpdateStatus = async (clientId: string, newStatus: string) => {
    try {
      const userRef = doc(db, "users", clientId);
      await updateDoc(userRef, { status: newStatus });
      
      // Update local state
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, status: newStatus } : c));
      if (selectedClientForDetails?.id === clientId) {
        setSelectedClientForDetails(prev => prev ? { ...prev, status: newStatus } : null);
      }
      
      showSuccess(`Client status updated to ${newStatus.toUpperCase()}`);
    } catch (error) {
      console.error("Error updating status:", error);
      showError("Failed to update status. Check permissions.");
    }
  };

  const updateBookingState = (bookingId: string, updates: any) => {
    setClientBookings(prev => prev.map(b => b.id === bookingId ? { ...b, ...updates } : b));
    if (inspectedBooking?.id === bookingId) {
      setInspectedBooking((prev: any) => ({ ...prev, ...updates }));
    }
  };

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

  const handleAssign = async (talentId: string) => {
    if (!inspectedBooking) return;
    
    const limit = parseInt(inspectedBooking.noOfEntertainers || inspectedBooking.numEntertainers || 1);
    const currentAssigned = inspectedBooking.selectedTalentIds || (inspectedBooking.selectedTalentId ? [inspectedBooking.selectedTalentId] : []);
    
    if (currentAssigned.includes(talentId)) return;
    if (currentAssigned.length >= limit) {
      showError(`Limit reached: This job requested a maximum of ${limit} entertainer(s).`);
      return;
    }

    if (!talentsDict[talentId]) {
      const [uSnap, tSnap] = await Promise.all([
        getDoc(doc(db, "users", talentId)),
        getDoc(doc(db, "talents", talentId))
      ]);
      if (uSnap.exists() || tSnap.exists()) {
        const uD = uSnap.data() || {};
        const tD = tSnap.data() || {};
        const merged = {
          ...uD, ...tD, id: talentId,
          displayName: tD.displayName || uD.name || uD.displayName || uD.email,
          profileImage: tD.photoUrl || tD.profileImage || uD.profileImage || null
        };
        setTalentsDict(prev => ({ ...prev, [talentId]: merged }));
      }
    }

    const historyEntry = {
      type: 'assigned',
      talentId,
      at: new Date().toISOString(),
      adminName: adminUser?.displayName || adminUser?.email || "Admin"
    };

    const newIds = [...currentAssigned, talentId];
    const newStatus = newIds.length >= limit ? "Assigned" : (inspectedBooking.status || "Pending");

    const updates = {
      selectedTalentIds: newIds,
      selectedTalentId: newIds[0] || null, 
      status: newStatus,
      assignedAt: serverTimestamp(),
      assignmentHistory: arrayUnion(historyEntry)
    };

    try {
      await updateDoc(doc(db, "bookings", inspectedBooking.id), updates);

      try {
        const talentName = talentsDict[talentId]?.displayName || allTalents.find(t => t.id === talentId)?.displayName || "Talent";
        const chatRef = doc(db, "chats", inspectedBooking.id);
        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) {
          await setDoc(chatRef, {
            bookingId: inspectedBooking.id,
            companyId: companyId,
            createdAt: new Date().toISOString(),
            lastMessageText: `${talentName} Connected`,
            lastSenderId: "system",
            lastMessageAt: new Date().toISOString(),
            lastRead: {}
          });
        }
        const existingMsgs = await getDocs(query(
          collection(db, "chats", inspectedBooking.id, "messages"),
          where("senderId", "==", "system"),
          where("text", "==", `${talentName} Connected`)
        ));
        if (existingMsgs.empty) {
          await addDoc(collection(db, "chats", inspectedBooking.id, "messages"), {
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
        title: "New Job Assignment",
        message: `You've been assigned to a new booking! Please review & confirm.`,
        type: "booking",
        link: `/${companyId}/dashboard/talent/bookings?tab=offers`
      });

      const otherApplicants = (inspectedBooking.applicants || []).filter((uid: string) => !newIds.includes(uid));
      if (newIds.length >= limit && otherApplicants.length > 0) {
        await Promise.all(
          otherApplicants.map(async (uid: any) => {
            let appEmail = "";
            try {
              const uSnap = await getDoc(doc(db, "users", uid));
              if (uSnap.exists()) {
                appEmail = uSnap.data()?.email || "";
              }
            } catch (e) {
              console.error("Failed to fetch applicant email:", e);
            }
            await sendNotification({
              userId: uid,
              companyId: companyId,
              recipientEmail: appEmail,
              title: "Booking Closed",
              message: `Thank you for applying. Another talent has been selected for booking #${inspectedBooking.id.substring(0, 8)}, and the gig is now closed.`,
              type: "info",
              link: `/${companyId}/dashboard/talent/bookings?tab=all`
            });
          })
        );
      }

      updateBookingState(inspectedBooking.id, { ...updates, assignedAt: new Date().toISOString() });
      setShowAssignModal(false);
      showSuccess("Talent assigned successfully.");
    } catch (e) {
      console.error("Assignment failed:", e);
      showError("Failed to assign talent.");
    }
  };

  const handleUnassign = async (talentIdToRemove: string, reopen: boolean) => {
    if (!inspectedBooking) return;
    
    const currentAssigned = inspectedBooking.selectedTalentIds || (inspectedBooking.selectedTalentId ? [inspectedBooking.selectedTalentId] : []);
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
      await updateDoc(doc(db, "bookings", inspectedBooking.id), updates);

      try {
        const talentName = talentsDict[talentIdToRemove]?.displayName || "Talent";
        const chatRef = doc(db, "chats", inspectedBooking.id);
        await addDoc(collection(db, "chats", inspectedBooking.id, "messages"), {
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
        message: `You have been removed from the booking #${inspectedBooking.id.substring(0, 8)}.`,
        type: "alert",
        link: `/${companyId}/dashboard/talent/bookings?tab=all`
      });

      if (reopen) {
        try {
          await sendNotificationToAdmins(companyId, {
            title: "Job Reopened",
            message: `Booking #${inspectedBooking.id.substring(0, 8)} has been reopened and is now available for applications.`,
            type: "booking",
            link: `/${companyId}/dashboard/admin/bookings/all`
          });
          await sendNotificationToTalents(companyId, {
            title: "Job Reopened - Apply Now!",
            message: `Booking #${inspectedBooking.id.substring(0, 8)} is reopened! Apply now in your available tab.`,
            type: "booking",
            link: `/${companyId}/dashboard/talent/bookings?tab=available`
          }, {
            ...inspectedBooking,
            status: "Pending",
            selectedTalentId: null,
            selectedTalentIds: []
          });
        } catch (notifErr) {
          console.error("Reopen notifications failed:", notifErr);
        }
      }

      updateBookingState(inspectedBooking.id, updates);
      setManageTalentId(null);
      showSuccess("Talent unassigned successfully.");
    } catch (e) {
      console.error("Unassignment failed:", e);
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

      if (bookingToApprove.clientId) {
        await sendNotification({
          companyId: bookingToApprove.companyId,
          userId: bookingToApprove.clientId,
          recipientEmail: bookingToApprove.clientEmail || "",
          title: "Payment Approved!",
          message: `Your manual payment via ${bookingToApprove.paymentMethod} for booking #${bookingToApprove.id.substring(0,8)} has been approved. Your booking is now Confirmed.`,
          type: "success",
          link: `/${bookingToApprove.companyId}/dashboard/client/bookings?tab=confirmed`
        });
      }
      showSuccess("Payment approved successfully!");
      updateBookingState(bookingToApprove.id, {
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

      if (bookingToDecline.clientId) {
        await sendNotification({
          companyId: bookingToDecline.companyId,
          userId: bookingToDecline.clientId,
          recipientEmail: bookingToDecline.clientEmail || "",
          title: "Payment Declined",
          message: `Your manual payment for booking #${bookingToDecline.id.substring(0,8)} was declined. Reason: ${reason}. Please try submitting payment again.`,
          type: "alert",
          link: `/${bookingToDecline.companyId}/dashboard/client/payment/${bookingToDecline.id}`
        });
      }

      showSuccess("Payment declined.");
      updateBookingState(bookingToDecline.id, {
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

  const filteredBookings = useMemo(() => {
    return clientBookings.filter(b => {
      const bStatus = (b.status || "Pending").toLowerCase();
      const statusMatch = bookingStatus === "All" || 
        (bookingStatus === "Pending" && bStatus === "pending") ||
        (bookingStatus === "Confirmed" && bStatus === "confirmed") ||
        (bookingStatus === "Completed" && bStatus === "completed") ||
        (bookingStatus === "Cancelled" && bStatus === "cancelled") ||
        (bookingStatus === "Awaiting Approval" && (b.paymentStatus === 'Awaiting Approval' || bStatus === 'awaiting approval'));
      
      const searchStr = bookingSearch.toLowerCase();
      const searchMatch = !bookingSearch || 
        b.id?.toLowerCase().includes(searchStr) ||
        (b.jobType || b.service || "").toLowerCase().includes(searchStr) ||
        (b.city || "").toLowerCase().includes(searchStr);
        
      return statusMatch && searchMatch;
    });
  }, [clientBookings, bookingSearch, bookingStatus]);

  const filtered = useMemo(() =>
    clients.filter(c =>
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.phoneNumber?.toLowerCase().includes(search.toLowerCase())
    ), [clients, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeCount = clients.filter(c => c.status === "active" || c.status === "under review" || c.status === "under_review").length;
  const inactiveCount = clients.filter(c => c.status === "inactive" || c.status === "terminated").length;

  return (
    <>
      <div className="max-w-6xl mx-auto animate-in fade-in duration-300">
        <div className="space-y-5">
        {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="bg-brand-primary/10 p-2 rounded-xl">
              <Users className="w-5 h-5 text-brand-primary" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">All Clients</h1>
          </div>
          <p className="text-sm text-slate-500 ml-11">Manage your registered clients and their details</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Total Clients", value: clients.length, color: "bg-brand-primary" },
          { label: "Active / Under Review", value: activeCount, color: "bg-emerald-500" },
          { label: "Inactive / Terminated", value: inactiveCount, color: "bg-slate-400" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
            <div className={cn("w-3 h-10 rounded-full shrink-0", s.color)} />
            <div>
              <p className="text-3xl font-black text-slate-900 tracking-tight">{s.value}</p>
              <p className="text-[13px] text-slate-500 font-bold uppercase tracking-wider">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main List */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 h-10 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all bg-white shadow-sm"
            />
          </div>
          <span className="text-[13px] text-slate-500 font-bold whitespace-nowrap bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            {filtered.length} Client{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div className="p-20 text-center">
            <div className="w-10 h-10 border-4 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium text-slate-500">Loading clients...</p>
          </div>
        ) : paginated.length === 0 ? (
          <div className="p-20 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-[28px] flex items-center justify-center mx-auto mb-5 border border-slate-100 shadow-inner">
              <Users className="w-10 h-10 text-slate-300" />
            </div>
            <p className="text-lg text-slate-900 font-bold mb-1">{search ? "No clients match your search" : "No clients registered yet"}</p>
            <p className="text-slate-500 text-sm">When clients register via the login page, they will appear securely here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-[11px] font-black uppercase tracking-wider">
                  <th className="px-6 py-4 whitespace-nowrap font-bold">Client</th>
                  <th className="px-6 py-4 whitespace-nowrap font-bold">Contact Details</th>
                  <th className="px-6 py-4 whitespace-nowrap font-bold">Joined Date</th>
                  <th className="px-6 py-4 whitespace-nowrap font-bold">Status</th>
                  <th className="px-6 py-4 whitespace-nowrap font-bold">Evaluation Rating</th>
                  <th className="px-6 py-4 whitespace-nowrap font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paginated.map((client) => {
                  const rating = internalRatings[client.id];
                  const initials = client.name
                    ? client.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()
                    : "?";
                  return (
                    <tr key={client.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 flex items-center justify-center shrink-0 font-black text-brand-primary text-xs border border-indigo-200/50 shadow-sm uppercase group-hover:from-brand-primary group-hover:to-brand-primary group-hover:text-white group-hover:border-brand-primary transition-all duration-300">
                            {initials}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-extrabold text-[13.5px] text-slate-800 group-hover:text-brand-primary transition-colors truncate max-w-[200px]">{client.name || "Unnamed Client"}</span>
                            <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                              <Mail className="w-3.5 h-3.5 text-slate-300" /> {client.email}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        {client.phoneNumber ? (
                          <span className="text-[13px] font-semibold text-slate-600 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" /> {client.phoneNumber}
                          </span>
                        ) : (
                          <span className="text-[13px] text-slate-300 font-semibold">-</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        {client.createdAt ? (
                          <span className="text-[13px] font-semibold text-slate-500 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" /> {new Date(client.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                        ) : (
                          <span className="text-[13px] text-slate-300 font-semibold">-</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        {(() => {
                          const badge = getStatusBadgeStyles(client.status);
                          return (
                            <span className={cn(
                              "text-[10px] uppercase tracking-wider font-black px-2.5 py-1 rounded-full border shadow-sm inline-flex items-center gap-1",
                              badge.bg
                            )}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", badge.dot)} />
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        {rating ? (
                          <div className="relative group/rating inline-block">
                            <div className="flex items-center gap-1.5 text-[12px] font-black text-amber-600 bg-amber-50 border border-amber-200/40 px-2.5 py-1 rounded-lg cursor-help hover:bg-amber-100/30 transition-colors shadow-sm">
                              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                              <span>{rating.overall}</span>
                              <span className="text-slate-400 font-bold ml-0.5">({rating.count})</span>
                            </div>
                            
                            {/* Hover Details Card */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 hidden group-hover/rating:block bg-white border border-slate-200 rounded-2xl shadow-xl p-3.5 z-30 animate-in fade-in slide-in-from-bottom-2 duration-150 text-left">
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-100 pb-1.5">Evaluation Metrics</div>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-slate-500 font-semibold">Punctuality</span>
                                  <span className="font-bold text-slate-800">{rating.punctuality} / 5</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-slate-500 font-semibold">Communication</span>
                                  <span className="font-bold text-slate-800">{rating.communication} / 5</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-slate-500 font-semibold">Reliability</span>
                                  <span className="font-bold text-slate-800">{rating.reliability} / 5</span>
                                </div>
                              </div>
                              {/* Arrow */}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white z-30" />
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-200 -z-10 mt-[1px]" />
                            </div>
                          </div>
                        ) : (
                          <span className="text-[12px] font-semibold text-slate-400">No ratings</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-right">
                        <button
                          onClick={() => { setSelectedClientForDetails(client); setModalTab("info"); }}
                          className="inline-flex items-center gap-1.5 text-[11px] font-black text-[#5046E5] hover:text-white uppercase tracking-widest hover:bg-[#5046E5] transition-all focus:outline-none bg-indigo-50/50 hover:shadow-md px-3.5 py-1.5 rounded-xl border border-indigo-100 hover:border-indigo-200 shadow-sm"
                        >
                          <Info className="w-3.5 h-3.5" /> Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-white text-sm">
            <span className="text-slate-500 font-medium">Page <strong className="text-slate-900">{page}</strong> of <strong className="text-slate-900">{totalPages}</strong></span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))} 
                disabled={page === 1} 
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 transition-all font-bold"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button 
                  key={p} 
                  onClick={() => setPage(p)} 
                  className={cn("w-9 h-9 rounded-xl text-sm font-bold transition-all border", p === page ? "bg-brand-primary text-white border-brand-primary shadow-md shadow-brand-primary/20" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900")}
                >
                  {p}
                </button>
              ))}
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                disabled={page === totalPages} 
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 transition-all font-bold"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
      </div>

      {selectedClientForDetails && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedClientForDetails(null)}>
          <div className="bg-white rounded-[24px] w-full max-w-4xl shadow-2xl relative border border-slate-100 flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            {/* Absolute Close Button */}
            <button 
              onClick={() => setSelectedClientForDetails(null)} 
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 bg-slate-100/60 hover:bg-slate-100 p-2 rounded-xl border border-slate-200/50 hover:border-slate-300 transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="p-6 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100">
              <div className="flex items-center gap-4">
                {(() => {
                  const headerInitials = selectedClientForDetails.name
                    ? selectedClientForDetails.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()
                    : "?";
                  return (
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-brand-primary flex items-center justify-center shrink-0 font-black text-white text-base shadow-lg shadow-brand-primary/10 border border-brand-primary/10 uppercase">
                      {headerInitials}
                    </div>
                  );
                })()}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-extrabold text-slate-900 text-lg leading-tight truncate max-w-[280px]">
                      {selectedClientForDetails.name || "Unnamed Client"}
                    </h3>
                    {(() => {
                      const badge = getStatusBadgeStyles(selectedClientForDetails.status);
                      return (
                        <span className={cn("text-[9px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full border shadow-sm inline-flex items-center gap-1 shrink-0", badge.bg)}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", badge.dot)} />
                          {badge.label}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-[10px] font-mono font-bold text-slate-400 mt-1.5 uppercase tracking-widest">
                    Client ID: {selectedClientForDetails.id}
                  </p>
                </div>
              </div>

              {/* Status Change Selector */}
              <div className="flex items-center gap-2.5 mr-10">
                <span className="text-[11px] font-black text-slate-450 uppercase tracking-wider">Account Status:</span>
                <select
                  value={selectedClientForDetails.status || "active"}
                  onChange={(e) => handleUpdateStatus(selectedClientForDetails.id, e.target.value)}
                  className={cn(
                    "h-9 px-3 rounded-xl border text-xs font-bold focus:outline-none focus:ring-4 transition-all shadow-sm cursor-pointer",
                    selectedClientForDetails.status === "active" && "bg-emerald-50 border-emerald-250 text-emerald-700 focus:ring-emerald-100",
                    (selectedClientForDetails.status === "under review" || selectedClientForDetails.status === "under_review") && "bg-amber-50 border-amber-250 text-amber-700 focus:ring-amber-100",
                    selectedClientForDetails.status === "inactive" && "bg-slate-50 border-slate-200 text-slate-650 focus:ring-slate-100",
                    selectedClientForDetails.status === "terminated" && "bg-rose-50 border-rose-250 text-rose-700 focus:ring-rose-100"
                  )}
                >
                  <option value="active">Active</option>
                  <option value="under review">Under Review</option>
                  <option value="inactive">Inactive</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
            </div>

            {/* Booking Statistics Cards */}
            {(() => {
              const totalBookingsCount = clientBookings.length;
              const completedBookingsCount = clientBookings.filter(b => b.status?.toLowerCase() === "completed").length;
              const cancelledBookingsCount = clientBookings.filter(b => b.status?.toLowerCase() === "cancelled").length;
              const activeBookingsCount = clientBookings.filter(b => 
                b.status && !["completed", "cancelled"].includes(b.status.toLowerCase())
              ).length;

              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 pt-5">
                  <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200/50 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="bg-[#5046E5] text-white p-2.5 rounded-xl shrink-0">
                      <Briefcase className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xl font-black text-slate-800 leading-none">{totalBookingsCount}</div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1.5 truncate">Total Bookings</div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200/50 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="bg-amber-500 text-white p-2.5 rounded-xl shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xl font-black text-slate-800 leading-none">{activeBookingsCount}</div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1.5 truncate">Active Bookings</div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200/50 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="bg-emerald-500 text-white p-2.5 rounded-xl shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xl font-black text-slate-800 leading-none">{completedBookingsCount}</div>
                      <div className="text-[10px] text-slate-550 font-bold uppercase tracking-wider mt-1.5 truncate">Completed</div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-200/50 rounded-2xl p-4 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="bg-rose-500 text-white p-2.5 rounded-xl shrink-0">
                      <XCircle className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xl font-black text-slate-800 leading-none">{cancelledBookingsCount}</div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1.5 truncate">Cancelled</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Navigation Tabs (Segmented Pill Control) */}
            <div className="px-6 pt-5 pb-2">
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1 w-full max-w-2xl">
                {[
                  { id: "info", label: "Info & Evaluation", icon: Info },
                  { id: "bookings", label: "Bookings", icon: Briefcase },
                  { id: "notes", label: "Notes", icon: FileText },
                ].map((tab) => {
                  const TabIcon = tab.icon;
                  const active = modalTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setModalTab(tab.id as any)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all focus:outline-none",
                        active 
                          ? "bg-white text-brand-primary shadow-sm" 
                          : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      <TabIcon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content Body */}
            {modalTab === "info" && (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Contact Info Card */}
                  <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl space-y-3.5 shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact & Credentials</h4>
                      {!isEditingClientCreds ? (
                        <button
                          type="button"
                          onClick={() => setIsEditingClientCreds(true)}
                          className="text-[10px] font-bold text-indigo-600 hover:underline uppercase"
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsEditingClientCreds(false)}
                          className="text-[10px] font-bold text-slate-400 hover:underline uppercase"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    {!isEditingClientCreds ? (
                      <div className="space-y-3">
                        <p className="text-xs text-slate-600 font-bold flex items-center gap-2.5">
                          <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="break-all select-all" title={selectedClientForDetails.email}>{selectedClientForDetails.email}</span>
                        </p>
                        {selectedClientForDetails.phoneNumber && (
                          <p className="text-xs text-slate-600 font-bold flex items-center gap-2.5">
                            <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                            <span>{selectedClientForDetails.phoneNumber}</span>
                          </p>
                        )}
                        {selectedClientForDetails.createdAt && (
                          <p className="text-xs text-slate-500 font-semibold flex items-center gap-2.5">
                            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                            <span>Joined {new Date(selectedClientForDetails.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-1">Email Address</label>
                          <input
                            type="email"
                            value={editClientEmail}
                            onChange={(e) => setEditClientEmail(e.target.value)}
                            className="w-full h-9 px-3 text-xs font-bold rounded-lg border border-slate-200 bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 block mb-1">Phone Number</label>
                          <input
                            type="tel"
                            value={editClientPhone}
                            onChange={(e) => setEditClientPhone(e.target.value)}
                            className="w-full h-9 px-3 text-xs font-bold rounded-lg border border-slate-200 bg-white"
                          />
                        </div>
                        <Button
                          type="button"
                          onClick={handleSaveClientCredentials}
                          disabled={savingClientCreds}
                          className="w-full h-9 rounded-lg bg-indigo-600 text-white font-bold text-xs shadow-sm"
                        >
                          {savingClientCreds ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                          Save Credentials
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Ratings score card */}
                  <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl shadow-sm">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1.5">Internal Evaluation</h4>
                    {(() => {
                      const rating = internalRatings[selectedClientForDetails.id];
                      if (!rating) {
                        return (
                          <div className="py-8 text-center text-slate-400 text-xs font-semibold">
                            No evaluations recorded yet.
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-3.5 mt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold text-slate-600">Overall Score</span>
                            <div className="flex items-center gap-1.5 text-xs font-black text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg">
                              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                              {rating.overall}
                              <span className="text-slate-400 font-bold ml-0.5">({rating.count})</span>
                            </div>
                          </div>
                          <div className="space-y-2.5 pt-1.5 border-t border-slate-200/50">
                            {[
                              { label: "Punctuality", score: rating.punctuality },
                              { label: "Communication", score: rating.communication },
                              { label: "Reliability", score: rating.reliability },
                            ].map((m) => (
                              <div key={m.label} className="space-y-1">
                                <div className="flex justify-between text-[11px] font-extrabold text-slate-500">
                                  <span>{m.label}</span>
                                  <span className="font-bold text-slate-700">{m.score} / 5</span>
                                </div>
                                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${(m.score / 5) * 100}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {modalTab === "bookings" && (
              <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto bg-slate-50/30">
                {/* Bookings Filters */}
                <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm">
                  <div className="relative flex-1 w-full">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search bookings by job, service, or ID..."
                      value={bookingSearch}
                      onChange={e => setBookingSearch(e.target.value)}
                      className="w-full pl-10 pr-4 h-9 rounded-xl border border-slate-200 text-xs placeholder:text-slate-400 focus:outline-none focus:border-brand-primary bg-slate-50/50"
                    />
                  </div>
                  <div className="relative w-full sm:w-48">
                    <select
                      value={bookingStatus}
                      onChange={e => setBookingStatus(e.target.value)}
                      className="w-full h-9 pl-3 pr-8 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50/50 focus:outline-none focus:border-brand-primary appearance-none cursor-pointer"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Pending">Pending</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="Awaiting Approval">Awaiting Approval</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {loadingBookings ? (
                  <div className="py-16 text-center">
                    <div className="w-8 h-8 border-3 border-[#5046E5]/20 border-t-[#5046E5] rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs text-slate-400">Loading bookings history...</p>
                  </div>
                ) : filteredBookings.length === 0 ? (
                  <div className="py-16 text-center space-y-2 border border-dashed border-slate-200 rounded-2xl bg-white shadow-sm">
                    <Briefcase className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-bold text-slate-600">No Bookings Found</p>
                    <p className="text-xs text-slate-400">
                      {bookingSearch || bookingStatus !== "All" 
                        ? "No bookings match your filter criteria." 
                        : "This client hasn't placed any bookings yet."}
                    </p>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 text-[10px] font-black uppercase tracking-wider">
                          <th className="px-4 py-3 whitespace-nowrap font-bold">Booking ID</th>
                          <th className="px-4 py-3 whitespace-nowrap font-bold">Job / Service</th>
                          <th className="px-4 py-3 whitespace-nowrap font-bold">Date & Time</th>
                          <th className="px-4 py-3 whitespace-nowrap font-bold">Budget</th>
                          <th className="px-4 py-3 whitespace-nowrap font-bold">Status</th>
                          <th className="px-4 py-3 whitespace-nowrap font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredBookings.map((b) => {
                          const statusColor = (s: string) => {
                            switch (s?.toLowerCase()) {
                              case "confirmed": return "bg-emerald-50 text-emerald-700 border-emerald-250";
                              case "pending": return "bg-amber-50 text-amber-700 border-amber-250";
                              case "completed": return "bg-slate-50 text-slate-655 border border-slate-200";
                              case "cancelled": return "bg-rose-50 text-rose-700 border border-rose-250";
                              case "awaiting approval":
                              case "awaiting_approval": return "bg-orange-50 text-orange-700 border-orange-250";
                              default: return "bg-indigo-50 text-indigo-700 border border-indigo-250";
                            }
                          };
                          
                          const displayStatus = b.paymentStatus === "Awaiting Approval" || b.status?.toLowerCase() === "awaiting approval"
                            ? "Awaiting Approval"
                            : b.status || "Pending";

                          let dateInfo = "Not set";
                          let timeInfo = "";
                          try {
                            if (b.eventDate) {
                              dateInfo = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(b.eventDate));
                            }
                            if (b.eventTime) {
                              timeInfo = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${b.eventTime}`));
                            }
                          } catch (e) {
                            dateInfo = b.eventDate || "Not set";
                            timeInfo = b.eventTime || "";
                          }

                          return (
                            <tr key={b.id} className="hover:bg-slate-50/40 transition-colors group">
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <span className="text-[11px] font-bold font-mono text-slate-450 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  {b.id.slice(0, 8).toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <span className="font-extrabold text-[13px] text-slate-800 leading-snug">
                                  {b.jobType || b.service || "Unspecified Event"}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <div className="flex flex-col">
                                  <span className="text-[12.5px] font-semibold text-slate-600 leading-none">{dateInfo}</span>
                                  {timeInfo && <span className="text-[10.5px] text-slate-400 font-medium mt-1 leading-none">{timeInfo}</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <span className="text-[12.5px] font-black text-emerald-650 bg-emerald-50/50 border border-emerald-100 px-2 py-0.5 rounded">
                                  ${b.payRate || b.budgetRate || "0"}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <span className={cn(
                                  "text-[9px] uppercase tracking-wider font-black px-2.5 py-1 rounded-full border shadow-sm inline-flex items-center gap-1",
                                  statusColor(displayStatus)
                                )}>
                                  {displayStatus}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-right">
                                <button
                                  onClick={() => setInspectedBooking(b)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-650 hover:text-indigo-850 transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" /> View Details
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {modalTab === "notes" && (
              <div className="p-6 bg-white overflow-y-auto max-h-[400px]">
                <EntityNotes 
                  companyId={companyId}
                  entityId={selectedClientForDetails.id}
                  entityType="client"
                  title="Notes"
                  placeholder="Add an internal evaluation note about this client..."
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nested Booking Details Modal */}
      {inspectedBooking && !showAssignModal && !manageTalentId && !showActivityModal && !showRateClientModal && (
        <BookingDetailsModal 
          booking={inspectedBooking} 
          onSearch={() => {}} 
          onClose={() => setInspectedBooking(null)} 
          talentsDict={talentsDict}
          setShowAssignModal={setShowAssignModal}
          setManageTalentId={setManageTalentId}
          setShowActivityModal={setShowActivityModal}
          fetchAllCompanyTalents={fetchAllCompanyTalents}
          onApprovePayment={handleApprovePayment}
          onDeclinePayment={handleDeclinePayment}
          onRateClient={() => setShowRateClientModal(true)}
          userId={adminUser?.uid || ""}
          onChat={() => { setChatBooking(inspectedBooking); setInspectedBooking(null); }}
        />
      )}

      {showAssignModal && inspectedBooking && (
        <AssignTalentModal 
          booking={inspectedBooking}
          allTalentRoster={allTalents}
          dictionary={talentsDict}
          loading={loadingAllTalents}
          onAssign={handleAssign}
          onClose={() => setShowAssignModal(false)}
        />
      )}

      {manageTalentId && talentsDict[manageTalentId] && inspectedBooking && (
        <TalentManagementModal 
          talent={talentsDict[manageTalentId]}
          booking={inspectedBooking}
          allBookings={clientBookings}
          onUnassign={(reopen: boolean) => handleUnassign(manageTalentId, reopen)}
          onClose={() => setManageTalentId(null)}
        />
      )}

      {showActivityModal && inspectedBooking && (
        <ActivityHistoryModal 
          booking={inspectedBooking}
          dictionary={talentsDict}
          onClose={() => setShowActivityModal(false)}
        />
      )}

      {showRateClientModal && inspectedBooking && (
        <AdminRateClientModal
          booking={inspectedBooking}
          companyId={companyId}
          onClose={() => { setInspectedBooking(null); setShowRateClientModal(false); }}
          onCompleted={(updatedBooking) => {
            updateBookingState(updatedBooking.id, updatedBooking);
            setShowRateClientModal(false);
          }}
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

// Helper components copied from bookings/all/page.tsx

function BookingDetailsModal({ 
  booking, onSearch, onClose, talentsDict, 
  setShowAssignModal, setManageTalentId, setShowActivityModal, fetchAllCompanyTalents,
  onApprovePayment, onDeclinePayment, onRateClient,
  userId, onChat
}: { 
  booking: any, onSearch: (val: string) => void, onClose: () => void, talentsDict: Record<string, any>,
  setShowAssignModal: (v: boolean) => void, setManageTalentId: (v: string | null) => void, 
  setShowActivityModal: (v: boolean) => void, fetchAllCompanyTalents: () => void,
  onApprovePayment: (b: any) => void, onDeclinePayment: (b: any, r: string) => void,
  onRateClient: () => void,
  userId: string,
  onChat: () => void
}) {
  const [localTalentsDict, setLocalTalentsDict] = useState<Record<string, any>>({});

  useEffect(() => {
    let isMounted = true;
    async function fetchMissingTalents() {
      const assignedIds: string[] = booking.selectedTalentIds ||
        (booking.selectedTalentId ? [booking.selectedTalentId] : (booking.talentId ? [booking.talentId] : []));
      const applicantIds: string[] = booking.applicants || [];
      const neededIds = Array.from(new Set([...assignedIds, ...applicantIds])).filter(Boolean);

      const missing = neededIds.filter(id => !talentsDict?.[id]?.displayName && !localTalentsDict[id]?.displayName);
      if (missing.length === 0) return;

      const fetched: Record<string, any> = {};
      await Promise.all(
        missing.map(async (uid) => {
          try {
            const [uSnap, tSnap] = await Promise.all([
              getDoc(doc(db, "users", uid)),
              getDoc(doc(db, "talents", uid))
            ]);
            if (uSnap.exists() || tSnap.exists()) {
              const uD = uSnap.exists() ? uSnap.data() : {};
              const tD = tSnap.exists() ? tSnap.data() : {};
              fetched[uid] = {
                id: uid,
                ...uD,
                ...tD,
                displayName: tD.displayName || tD.name || uD.name || uD.displayName || uD.email || "Talent",
                profileImage: tD.profileImage || tD.photoUrl || uD.profileImage || uD.photoUrl || null,
                talentType: tD.talentType || "Performer",
                rating: tD.rating || uD.rating || null
              };
            }
          } catch (e) {
            console.error("Error fetching missing talent doc in modal:", e);
          }
        })
      );

      if (isMounted && Object.keys(fetched).length > 0) {
        setLocalTalentsDict(prev => ({ ...prev, ...fetched }));
      }
    }

    fetchMissingTalents();
    return () => { isMounted = false; };
  }, [booking, talentsDict]);

  const effectiveTalentsDict = useMemo(() => {
    return { ...(talentsDict || {}), ...localTalentsDict };
  }, [talentsDict, localTalentsDict]);

  // Extract standard fields
  const getVal = (keys: string[]) => {
    for (const k of keys) if (booking[k]) return booking[k];
    return "";
  };

  const name = getVal(['clientName', '__clientName']) || "Unknown Client";
  const email = getVal(['clientEmail', '__email']);
  const phone = getVal(['clientNumber']);
  const address = getVal(['address', '__address']);
  const city = getVal(['city', '__city']) || booking.city || "";
  const state = getVal(['state', '__state']) || booking.state || "";
  const locationDetails = [address, city, state].filter(Boolean).join(", ");
  const date = getVal(['eventDate']);
  const time = getVal(['eventTime']);
  const duration = getVal(['duration']);
  const jobType = getVal(['jobType', '__jobType']);
  const gender = getVal(['gender', '__gender']);
  const numEntertainers = getVal(['numEntertainers']);
  const femaleGuests = getVal(['femaleGuests']);
  const maleGuests = getVal(['maleGuests']);
  const payRate = getVal(['payRate']);
  const options = getVal(['options']);
  const specialRequests = getVal(['specialRequests']);
  const status = booking.status || "Inquiry";
  const createdAt = booking.createdAt ? new Date(booking.createdAt).toLocaleString() : "Unknown";

  // Custom fields
  const standardKeys = ['clientName','__clientName','clientNumber','clientPhone','__clientPhone','clientEmail','__email','__clientEmail','eventDate','eventTime','duration','address','__address','city','__city','state','__state','location','jobType','__jobType','gender','__gender','numEntertainers','noOfEntertainers','femaleGuests','maleGuests','payRate','options','__options','specialRequests','notes','__notes','status','id','companyId','clientId','createdAt','updatedAt','updated_at','formMode', 'talentId', 'selectedTalentId', 'applicants', 'selectedTalentIds', 'assignmentHistory', 'assignedAt', 'activityLogs', 'activity_logs', 'cancelledAt', 'cancelledById', 'cancelledByName', 'cancelledByEmail', 'cancellationReason', 'cancelledReason', 'cancelledBy', 'cancelledRole', 'cancelled_at', 'cancelled_by_id', 'paymentReceiptUrl', 'receiptUploadedAt', 'paymentMethod', 'paymentStatus', 'clientMarkedComplete', 'talentMarkedComplete', 'clientReviewed', 'talentReviewed', 'clientRatingForTalent', 'clientCommentForTalent', 'talentRatingForClient', 'talentCommentForClient', 'tipAmount', 'tipPaymentMethod', 'tipStatus', 'clientInternallyRated', 'paidAt', 'declinedAt', 'paymentDeclineReason', 'customOffers', 'checkoutSessionId', 'stripePaymentIntentId', 'clientEvaluation', 'internalEvaluation', 'declinedTalentIds', 'declined_talent_ids', 'declinedTalents'];
  const customFields = Object.entries(booking).filter(([k, v]) => {
    if (standardKeys.includes(k) || k.startsWith('__')) return false;
    const lowerKey = k.toLowerCase();
    if (
      lowerKey.includes("cancel") ||
      lowerKey.includes("updated") ||
      lowerKey.includes("created") ||
      lowerKey.includes("activity") ||
      lowerKey.includes("history") ||
      lowerKey.includes("offer") ||
      lowerKey.includes("applicant") ||
      lowerKey.includes("receipt") ||
      lowerKey.includes("evaluation") ||
      lowerKey.includes("rating") ||
      lowerKey.includes("review") ||
      lowerKey.includes("stripe") ||
      lowerKey.includes("checkout") ||
      lowerKey.includes("declin")
    ) {
      return false;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) return false;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") return false;
    return true;
  });

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Determine pipeline step completion statically
  const assignedTalentIdsVal = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
  const hasTalent = assignedTalentIdsVal.length > 0;
  const isPaid = booking.paymentStatus === 'Paid' || status.toLowerCase() === 'confirmed' || status.toLowerCase() === 'completed';
  const isAwaiting = booking.paymentStatus === 'Awaiting Approval' || status.toLowerCase() === 'awaiting approval';

  const STEPS = [
    { key: "Inquiry",         label: "Inquiry",         color: "#4f46e5", isDone: true, isActive: false },
    { key: "Pending",         label: "Pending",         color: "#6366f1", isDone: true, isActive: !hasTalent && !isPaid && !isAwaiting }, 
    { key: "Talent Assigned", label: "Talent Assigned", color: "#3b82f6", isDone: hasTalent, isActive: hasTalent && !isPaid && !isAwaiting },
    { key: "Pending Payment", label: isAwaiting ? "Awaiting Approval" : "Pending Payment", color: isAwaiting ? "#f97316" : "#0ea5e9", isDone: isPaid, isActive: isAwaiting },
    { key: "Confirmed",       label: "Confirmed",       color: "#2563eb", isDone: isPaid, isActive: isPaid && status.toLowerCase() !== 'completed' },
    { key: "Completed",       label: "Completed",       color: "#1e3a8a", isDone: status.toLowerCase() === 'completed', isActive: status.toLowerCase() === 'completed' },
  ];

  return (
    <div 
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <style>{`
        @keyframes bModalIn { from { opacity:0; transform:scale(0.98) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .bmodal-in { animation: bModalIn 0.22s cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>
      <div
        className="bmodal-in relative w-[96%] sm:max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Gradient Header - blue/indigo theme */}
        <div
          className="px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between shrink-0"
          style={{ background: `linear-gradient(135deg, #4f46e5, #2563eb)` }}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-white font-black text-xl" style={{ background: 'rgba(255,255,255,0.18)' }}>
              {name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-white font-black text-xl leading-tight">{name}</h2>
              <p className="text-white/60 text-xs font-mono mt-0.5 tracking-widest">#{booking.id.slice(0,10).toUpperCase()}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <BookingChatButton 
              bookingId={booking.id} 
              userId={userId} 
              onClick={onChat}
              className="bg-white/10 hover:bg-white/20 border-white/20 hover:border-white/30 text-white hover:text-indigo-200"
            />
            <button
              onClick={() => setShowActivityModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white shadow-sm transition-all"
              style={{ background: 'rgba(255,255,255,0.15)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.28)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            >
              <Activity className="w-3.5 h-3.5" />
              Activity Log
            </button>
            <span
              className="text-[11px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest hidden sm:inline-block"
              style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
            >
              {isAwaiting ? "Pending Payment Approval" : status}
            </span>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.15)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.28)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Stepper - dot + label per step */}
        <div className="px-2 sm:px-8 pt-5 pb-4 bg-white border-b border-slate-100 shrink-0 overflow-x-auto custom-scrollbar">
          <div className="flex items-start justify-between min-w-[500px] sm:min-w-0">
            {STEPS.map((step, i) => {
              const isDone    = step.isDone;
              const isCurrent = step.isActive;
              const dotColor  = (isDone || isCurrent) ? step.color : '#cbd5e1';
              const labelColor = isCurrent ? step.color : isDone ? '#64748b' : '#94a3b8';
              return (
                <div key={step.key} className="flex flex-col items-center flex-1 min-w-0 relative">
                  {/* Connector line before dot (except first) */}
                  {i > 0 && (
                    <div
                      className="absolute top-[14px] right-[50%] h-[2px] w-full"
                      style={{
                        left: '-50%',
                        right: '50%',
                        background: isDone ? step.color : '#e2e8f0',
                        zIndex: 0,
                      }}
                    />
                  )}
                  {/* Dot */}
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 relative z-10 shadow-sm transition-all"
                    style={{
                      background: isCurrent ? step.color : isDone ? step.color : '#f1f5f9',
                      border: `2px solid ${dotColor}`,
                    }}
                  >
                    {isDone
                      ? <CheckCircle2 className="w-4 h-4 text-white" />
                      : isCurrent
                        ? <span className="w-2.5 h-2.5 rounded-full bg-white" />
                        : <span className="text-[10px] font-black" style={{ color: '#94a3b8' }}>{i + 1}</span>
                    }
                  </div>
                  {/* Label */}
                  <span
                    className="mt-2 text-center leading-tight font-black text-[10px] uppercase tracking-wider px-1"
                    style={{ color: labelColor, maxWidth: 72 }}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {isAwaiting && (
          <div className="px-4 sm:px-6 py-4 bg-orange-50/50 border-b border-orange-100 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                <p className="text-[13px] font-bold text-orange-900">Manual payment proof is awaiting review.</p>
              </div>
              <div className="flex items-center gap-2">
                {booking.paymentReceiptUrl && (
                  <button onClick={() => setPreviewImage(booking.paymentReceiptUrl)} className="h-8 px-3 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] shadow-sm flex items-center justify-center transition-colors">
                    View Receipt
                  </button>
                )}
                <button onClick={() => onApprovePayment(booking)} className="h-8 px-3 rounded-lg bg-emerald-650 hover:bg-emerald-750 text-white font-bold text-[11px] shadow-sm flex items-center justify-center transition-colors">
                  Approve
                </button>
                <button onClick={() => {
                  const reason = prompt("Enter a reason for declining the payment:");
                  if (reason) onDeclinePayment(booking, reason);
                }} className="h-8 px-3 rounded-lg bg-red-505 hover:bg-red-655 text-white font-bold text-[11px] shadow-sm flex items-center justify-center transition-colors">
                  Decline
                </button>
              </div>
            </div>
            {booking.paymentReceiptUrl && (
              <button onClick={() => setPreviewImage(booking.paymentReceiptUrl)} className="block w-full max-w-[240px] h-24 rounded-lg border border-orange-200 overflow-hidden shadow-sm hover:opacity-90 transition-opacity">
                 <img src={booking.paymentReceiptUrl} alt="Receipt" className="w-full h-full object-cover" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4 custom-scrollbar bg-slate-50/30">

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Customer */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <span className="text-[10px] font-black text-slate-505 uppercase tracking-widest">Customer</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${booking.clientId && booking.clientId !== 'guest' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                  {booking.clientId && booking.clientId !== 'guest' ? 'Registered' : 'Guest'}
                </span>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-bold text-slate-900">{name}</p>
                {phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-650 font-semibold">{phone}</span>
                  </div>
                )}
                {email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-650 font-semibold truncate">{email}</span>
                  </div>
                )}
                {address && (
                  <div className="flex items-start gap-2 pt-2">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-650 font-semibold leading-relaxed line-clamp-2">{address}</span>
                  </div>
                )}
              </div>
              <div className="pt-3 flex flex-col gap-2">
                <button
                  className="w-full h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center gap-2 text-[11px] font-bold text-indigo-600 hover:bg-slate-100 hover:border-slate-300 transition-all group font-black uppercase tracking-wider cursor-pointer"
                  onClick={() => {
                    onSearch(email || name);
                    onClose();
                  }}
                >
                  <History className="w-3.5 h-3.5 group-hover:rotate-[-15deg] transition-transform" />
                  Customer History
                </button>

                {status === "Completed" && (
                  <button
                    className="w-full h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center gap-2 text-[11px] font-black text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-all group uppercase tracking-wider cursor-pointer"
                    onClick={onRateClient}
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    {booking.clientInternallyRated ? "Edit Internal Evaluation" : "Evaluate Client (Internal)"}
                  </button>
                )}
              </div>
            </div>

            {/* Event */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <span className="text-[10px] font-black text-slate-505 uppercase tracking-widest">Event Timing</span>
              </div>
              <div className="space-y-3 pt-1">
                {date && (
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Event Date</span>
                    <span className="text-sm font-bold text-slate-800">
                      {new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(date))}
                    </span>
                  </div>
                )}
                {time && (
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Event Time</span>
                    <span className="text-sm font-bold text-slate-800">
                      {new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${time}`))}
                    </span>
                  </div>
                )}
                {duration && (
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Duration</span>
                    <span className="text-sm font-bold text-slate-800">{duration}</span>
                  </div>
                )}
                {locationDetails && (
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Venue Location</span>
                    <span className="text-sm font-bold text-slate-800 flex items-start gap-1.5 leading-snug">
                       <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" /> {locationDetails}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Assigned Talent Section */}
            {(() => {
              const limit = parseInt(booking.noOfEntertainers || booking.numEntertainers || 1);
              const assignedTalentIds = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
              
              return (
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col min-h-[260px]">
                 <div className="flex items-center justify-between pb-3 border-b border-slate-100/50 mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">Assigned Talent</h3>
                      {assignedTalentIds.length > 0 && (
                         <div className="flex items-center gap-1.5 ml-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_4px_rgba(16,185,129,0.4)]" />
                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Live</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">{assignedTalentIds.length} / {limit} Limit</span>
                    </div>
                 </div>
                 
                 <div className="space-y-2 flex-1">
                    {/* Selected Talent Rows */}
                    {assignedTalentIds.map((tid: string) => {
                      const tData = effectiveTalentsDict[tid] || {};
                      const isCompleted = status === "Completed";
                      return (
                      <div 
                        key={tid}
                        className={`flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-100 rounded-xl transition-all ${
                          isCompleted ? "cursor-default" : "hover:bg-slate-100 hover:border-indigo-200 cursor-pointer group"
                        }`}
                        onClick={() => {
                          if (isCompleted) return;
                          setManageTalentId(tid);
                        }}
                      >
                         {tData.profileImage ? (
                            <img src={tData.profileImage} alt="Talent" className="w-11 h-11 rounded-lg object-cover shadow-sm bg-white" />
                         ) : (
                            <div className="w-11 h-11 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-indigo-350 font-bold text-lg">
                               {tData.displayName?.charAt(0) || "?"}
                            </div>
                         )}
                         <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-slate-900 text-[13px] leading-tight truncate">{tData.displayName || "Loading..."}</h4>
                            <p className="text-[10px] font-medium text-slate-450 mt-0.5 truncate">{tData.talentType || "Performer"}</p>
                         </div>
                         <div className="flex flex-col items-end gap-1">
                            {!isCompleted && <ChevronRight className="w-3.5 h-3.5 text-slate-350 group-hover:text-indigo-500 transition-colors" />}
                            {tData.rating && (
                              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-100/50">
                                 <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                                 <span className="text-[9px] font-black text-amber-700">{tData.rating}</span>
                              </div>
                            )}
                         </div>
                      </div>
                      )
                    })}

                    {/* Add Talent Row (hidden if limit reached or booking completed) */}
                    {assignedTalentIds.length < limit && status !== "Completed" && (
                      <div 
                        className="flex items-center gap-3 p-2.5 bg-white border border-dashed border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/20 transition-all cursor-pointer group"
                        onClick={() => {
                            fetchAllCompanyTalents();
                            setShowAssignModal(true);
                        }}
                      >
                         <div className="w-11 h-11 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
                            <Users className="w-5 h-5 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                         </div>
                         <div className="flex-1 min-w-0">
                            <span className="text-[13px] font-bold text-indigo-650 flex items-center gap-1 transition-colors group-hover:text-indigo-755">
                               <span className="text-lg leading-none">+</span> Add Talent
                            </span>
                         </div>
                      </div>
                    )}
                 </div>

                 {assignedTalentIds.length === 0 && (
                   <div className="mt-4 p-2.5 bg-indigo-50/50 rounded-lg border border-indigo-100/50">
                      <p className="text-[9px] font-bold text-indigo-400 leading-normal text-center">
                        Assign a performer to this booking to go live.
                      </p>
                   </div>
                 )}
              </div>
              )
            })()}

            {/* Job & Pricing */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center">
                  <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <span className="text-[10px] font-black text-slate-505 uppercase tracking-widest">Job & Pricing</span>
              </div>
              <div className="space-y-2.5">
                {jobType && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Job Type</span><span className="text-sm font-bold text-slate-800">{jobType}</span></div>}
                {gender && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Gender</span><span className="text-sm font-bold text-slate-800">{gender}</span></div>}
                {numEntertainers && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Entertainers</span><span className="text-sm font-bold text-slate-800">{numEntertainers}</span></div>}
              </div>
              {payRate && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pay Rate</span>
                  <span className="text-xl font-black text-emerald-600">${payRate}</span>
                </div>
              )}
            </div>
          </div>

          {/* Guests */}
          {(femaleGuests || maleGuests) && (
            <div className="grid grid-cols-2 gap-4">
              {femaleGuests && (
                <div className="bg-white rounded-xl p-4 border border-pink-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-pink-400 uppercase tracking-widest block">Female Guests</span>
                    <span className="text-3xl font-black text-pink-650 mt-0.5 block">{femaleGuests}</span>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-pink-50 flex items-center justify-center">
                    <Users className="w-6 h-6 text-pink-300" />
                  </div>
                </div>
              )}
              {maleGuests && (
                <div className="bg-white rounded-xl p-4 border border-blue-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">Male Guests</span>
                    <span className="text-3xl font-black text-blue-655 mt-0.5 block">{maleGuests}</span>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-300" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Additional & Custom Fields */}
          {(options || specialRequests || customFields.length > 0) && (
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <span className="text-[10px] font-black text-slate-505 uppercase tracking-widest">Additional Details</span>
              </div>

              {options && (
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Options</span>
                  <p className="text-sm text-slate-700 font-medium bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100 leading-relaxed">{options}</p>
                </div>
              )}
              {specialRequests && (
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Special Requests</span>
                  <p className="text-sm text-slate-700 font-medium bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100 leading-relaxed whitespace-pre-wrap">{specialRequests}</p>
                </div>
              )}

              {customFields.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                  {customFields.map(([key, value]) => {
                    const label = key.replace(/^__/, '').replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
                    const displayVal = Array.isArray(value) ? value.join(', ') : String(value || '');
                    return (
                      <div key={key} className={`bg-slate-50 rounded-lg p-3 border border-slate-100 ${displayVal.length > 35 ? 'col-span-2 sm:col-span-3' : ''}`}>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 truncate">{label}</span>
                        <p className="text-sm font-bold text-slate-900 break-words leading-snug">{displayVal || <span className="text-slate-300 font-normal italic">—</span>}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Completion Status — shown for Confirmed/Completed bookings */}
          {(status === "Confirmed" || status === "Completed") && (
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <span className="text-[10px] font-black text-slate-505 uppercase tracking-widest">Completion Status</span>
                {booking.clientMarkedComplete && booking.talentMarkedComplete && (
                  <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-600 text-white uppercase tracking-wider">Fully Complete</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl p-3 border flex items-center gap-3 ${booking.clientMarkedComplete ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${booking.clientMarkedComplete ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${booking.clientMarkedComplete ? 'text-emerald-600' : 'text-slate-400'}`}>Client</p>
                    <p className={`text-xs font-bold mt-0.5 ${booking.clientMarkedComplete ? 'text-emerald-900' : 'text-slate-505'}`}>
                      {booking.clientMarkedComplete ? 'Marked Complete ✓' : 'Pending...'}
                    </p>
                  </div>
                </div>
                <div className={`rounded-xl p-3 border flex items-center gap-3 ${booking.talentMarkedComplete ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${booking.talentMarkedComplete ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${booking.talentMarkedComplete ? 'text-emerald-600' : 'text-slate-400'}`}>Talent</p>
                    <p className={`text-xs font-bold mt-0.5 ${booking.talentMarkedComplete ? 'text-emerald-900' : 'text-slate-505'}`}>
                      {booking.talentMarkedComplete ? 'Marked Complete ✓' : 'Pending...'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between px-1 pt-1">
                <div className="flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span className="text-[10px] font-black text-slate-505 uppercase tracking-widest">Reviews</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${booking.clientReviewed ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                    Client {booking.clientReviewed ? '★ Done' : '○ Pending'}
                  </span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${booking.talentReviewed ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                    Talent {booking.talentReviewed ? '★ Done' : '○ Pending'}
                  </span>
                </div>
              </div>
              {booking.tipAmount > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-center justify-between">
                  <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Tip (Client Added)</span>
                  <span className="text-sm font-black text-amber-900">${booking.tipAmount} <span className="capitalize font-semibold text-amber-700 text-[11px]">via {booking.tipPaymentMethod}</span></span>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
            <span>Submitted: {createdAt}</span>
            <span className="font-mono opacity-60">{booking.id}</span>
          </div>
        </div>
        {/* Image Preview Overlay */}
        {previewImage && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-[250] flex items-center justify-center p-4 rounded-2xl">
            <div className="relative max-w-[90%] max-h-[90%]">
              <button 
                onClick={() => setPreviewImage(null)} 
                className="absolute -top-10 right-0 text-white hover:text-slate-200 p-2 bg-black/20 hover:bg-black/40 rounded-full transition-colors"
                title="Close receipt preview"
              >
                <X className="w-5 h-5" />
              </button>
              <img src={previewImage} alt="Receipt Preview" className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl ring-1 ring-white/20" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Talent Management Modal Component ────────────────────────────────────────

const TalentManagementModal = ({ talent, booking, onUnassign, onClose, allBookings }: any) => {
   if (!booking || !talent) return null;
   const completedCount = allBookings.filter((b: any) => b.selectedTalentId === talent.id && b.status === "Completed").length;
   
   const getAssignedDate = () => {
      if (!booking.assignedAt) return "N/A";
      try {
         const date = booking.assignedAt.seconds 
            ? new Date(booking.assignedAt.seconds * 1000) 
            : new Date(booking.assignedAt);
         return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } catch (e) {
         return "N/A";
      }
   };
   
   return (
     <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className="bg-white rounded-3xl w-[96%] sm:max-w-md shadow-2xl relative z-[230] overflow-hidden border border-slate-200 flex flex-col animate-in zoom-in-95">
           {/* Top Image Section */}
           <div className="relative h-48 bg-slate-900 flex items-center justify-center">
              {talent.profileImage ? (
                <img src={talent.profileImage} alt={talent.displayName} className="w-full h-full object-cover opacity-60" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 opacity-80" />
              )}
              <div className="absolute bottom-[-40px] left-4 sm:left-8 w-24 h-24 rounded-2xl bg-white p-1.5 shadow-xl border border-slate-100">
                 {talent.profileImage ? (
                   <img src={talent.profileImage} alt="Avatar" className="w-full h-full object-cover rounded-xl" />
                 ) : (
                   <div className="w-full h-full bg-slate-100 rounded-xl flex items-center justify-center text-indigo-400 text-3xl font-black">
                     {talent.displayName?.charAt(0)}
                   </div>
                 )}
              </div>
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/40 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
           </div>

           <div className="p-5 sm:p-8 pt-14 sm:pt-14 space-y-6">
              <div>
                 <div className="flex items-center justify-between mb-1">
                   <h2 className="text-2xl font-black text-slate-900 tracking-tight">{talent.displayName}</h2>
                   <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span className="text-sm font-black text-amber-700">{talent.rating || "New"}</span>
                   </div>
                 </div>
                 <p className="text-xs font-bold text-indigo-500 uppercase tracking-[0.1em]">{talent.talentType || "Performer"}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Experience</span>
                    <p className="text-sm font-bold text-slate-900">{completedCount} Bookings</p>
                 </div>
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Assigned On</span>
                    <p className="text-sm font-bold text-slate-900">
                      {getAssignedDate()}
                    </p>
                 </div>
              </div>

              <div className="space-y-3 pt-2">
                 <button 
                   onClick={() => onUnassign(false)}
                   className="w-full h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-2.5 text-sm font-bold text-slate-650 hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer"
                 >
                   <Trash2 className="w-4 h-4" />
                   Unassign Talent
                 </button>
                 <button 
                   onClick={() => onUnassign(true)}
                   className="w-full h-12 bg-indigo-600 rounded-xl flex items-center justify-center gap-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all cursor-pointer"
                 >
                   <RotateCcw className="w-4 h-4" />
                   Unassign & Reopen Job
                 </button>
              </div>
           </div>
        </div>
     </div>
   )
}

// ─── Assign Talent Modal Component ───────────────────────────────────────────

const AssignTalentModal = ({ booking, onClose, onAssign, allTalentRoster, dictionary, loading }: any) => {
   const [tab, setTab] = useState<'interested' | 'similar' | 'all'>('interested');
   const [search, setSearch] = useState("");

   if (!booking) return null;

   const getInterested = () => allTalentRoster.filter((t: any) => t.status !== "inactive" && booking.applicants?.includes(t.id));
   const getSimilar = () => allTalentRoster.filter((t: any) => {
      if (t.status === "inactive") return false;
      if (booking.applicants?.includes(t.id)) return false;
      const assigned = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
      if (assigned.includes(t.id)) return false;

      let score = 0;
      if (t.talentType === booking.jobType) score += 2;
      
      const bGender = String(booking.gender || "").toLowerCase().trim();
      const tGenders = (Array.isArray(t.gender) ? t.gender : [t.gender]).map((g: any) => String(g || "").toLowerCase().trim()).filter(Boolean);
      if (bGender && (bGender === 'any' || tGenders.includes(bGender))) score += 1;
      
      const bLoc = [booking.city, booking.state, booking.address].filter(Boolean).join(' ').toLowerCase();
      const tLocs = (t.locations || []).join(' ').toLowerCase() + ' ' + [t.city, t.state].filter(Boolean).join(' ').toLowerCase();
      
      if (bLoc && tLocs && (bLoc.includes(tLocs.split(' ')[0]) || tLocs.includes(bLoc.split(' ')[0]))) score += 1;
      
      return score >= 2;
   });
   const getAll = () => allTalentRoster.filter((t: any) => {
      if (t.status === "inactive") return false;
      const assigned = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
      return !assigned.includes(t.id);
   });

   const activeList = tab === 'interested' ? getInterested() : tab === 'similar' ? getSimilar() : getAll();
   const filtered = activeList.filter((t: any) => 
     t.displayName?.toLowerCase().includes(search.toLowerCase()) || 
     t.email?.toLowerCase().includes(search.toLowerCase())
   );

   return (
     <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={onClose} />
        <div className="bg-white rounded-3xl w-[96%] sm:max-w-2xl h-[90vh] sm:h-[85vh] shadow-2xl relative z-[230] overflow-hidden border border-slate-200 flex flex-col animate-in slide-in-from-bottom-4">
           {/* Header */}
           <div className="p-4 sm:p-6 pb-2 sm:pb-2 space-y-4">
              <div className="flex items-center justify-between">
                 <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Assign Talent</h2>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Found {activeList.length} potential matches</p>
                 </div>
                 <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-450 hover:bg-slate-200 hover:text-slate-650 transition-colors cursor-pointer"><X className="w-5 h-5" /></button>
              </div>

              {/* Tabs */}
              <div className="flex p-1 bg-slate-100 rounded-xl">
                 {(['interested', 'similar', 'all'] as const).map(t => (
                   <button 
                     key={t}
                     onClick={() => setTab(t)}
                     className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${tab === t ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-505 hover:text-slate-750'}`}
                   >
                     {t}
                   </button>
                 ))}
              </div>

              {/* Search */}
              <div className="relative">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                 <input 
                   type="text"
                   placeholder="Find talent by name or email..."
                   value={search}
                   onChange={e => setSearch(e.target.value)}
                   className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 text-sm font-bold placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none"
                 />
              </div>
           </div>

           {/* List */}
           <div className="flex-1 overflow-y-auto p-4 sm:p-6 pt-2 sm:pt-2 custom-scrollbar">
              {loading ? (
                 <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="text-xs font-black uppercase tracking-widest">Accessing Roster...</p>
                 </div>
              ) : filtered.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-300">
                    <Users className="w-16 h-16 opacity-10" />
                    <p className="text-sm font-bold">No results match your current search.</p>
                 </div>
              ) : (
                <div className="grid gap-3">
                   {filtered.map((t: any) => (
                     <div key={t.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-50/50 transition-all group">
                        {t.profileImage ? (
                          <img src={t.profileImage} alt={t.displayName} className="w-12 h-12 rounded-xl object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-350 font-black text-xl">
                            {t.displayName?.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                           <h4 className="font-bold text-slate-900 text-[15px] leading-tight">{t.displayName}</h4>
                           <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{t.talentType || "Performer"}</span>
                              <div className="w-1 h-1 rounded-full bg-slate-200" />
                              <span className="text-xs font-medium text-slate-400 truncate">{t.email}</span>
                           </div>
                        </div>
                        <button 
                          onClick={() => onAssign(t.id)}
                          className="px-5 h-10 bg-indigo-600 rounded-xl text-xs font-black text-white hover:bg-slate-900 transition-all shadow-md shadow-indigo-100 active:scale-95 cursor-pointer"
                        >
                          ASSIGN
                        </button>
                     </div>
                   ))}
                </div>
              )}
           </div>
        </div>
     </div>
   )
}

// ─── Activity Timeline Modal Component ───────────────────────────────────────

const ActivityHistoryModal = ({ booking, dictionary, onClose }: any) => {
   const getTimeline = () => {
      const evts: any[] = [];
      
      if (booking.createdAt) {
         evts.push({ type: 'created', at: booking.createdAt, icon: <Clock className="w-4 h-4 text-white" />, color: 'bg-blue-500', title: 'Booking Submitted', desc: `Client submitted inquiry.` });
      }

      if (booking.applicants && booking.applicants.length > 0) {
         const simulatedAt = new Date(new Date(booking.createdAt).getTime() + 1000).toISOString();
         evts.push({ type: 'applied', at: simulatedAt, icon: <Users className="w-4 h-4 text-white" />, color: 'bg-indigo-500', title: 'Talents Applied', desc: `${booking.applicants.length} talent(s) submitted availability.` });
      }

      if (booking.assignmentHistory) {
         let ash: any[] = [];
         if (Array.isArray(booking.assignmentHistory)) ash = booking.assignmentHistory;
         else if (typeof booking.assignmentHistory === 'string') {
            try { ash = JSON.parse(booking.assignmentHistory); } catch (e) {}
         }
         ash.forEach(a => {
            const tName = dictionary[a.talentId]?.displayName || "Unknown Talent";
            let descText = a.type === 'assigned' ? `Assigned @${tName} by ${a.adminName || a.clientName || 'Admin/Client'}` : `Removed @${tName} by ${a.adminName || a.clientName || 'Admin/Client'} ${a.reopened ? '(Reopened)' : ''}`;
            if (a.customTerms) {
               const terms: string[] = [];
               if (a.customTerms.proposedRate && a.customTerms.proposedRate !== a.customTerms.originalRate) {
                  terms.push(`Rate changed to $${a.customTerms.proposedRate} (was $${a.customTerms.originalRate})`);
               }
               if (a.customTerms.proposedDate && a.customTerms.proposedDate !== a.customTerms.originalDate) {
                  terms.push(`Date changed to ${a.customTerms.proposedDate}`);
               }
               if (a.customTerms.proposedTime && a.customTerms.proposedTime !== a.customTerms.originalTime) {
                  terms.push(`Time changed to ${a.customTerms.proposedTime}`);
               }
               if (terms.length > 0) {
                  descText += ` Accepted custom terms: ${terms.join(", ")}.`;
               }
            }
            evts.push({
               type: a.type,
               at: a.at,
               icon: a.type === 'assigned' ? <Users className="w-4 h-4 text-white" /> : <Trash2 className="w-4 h-4 text-white" />,
               color: a.type === 'assigned' ? 'bg-emerald-500' : 'bg-rose-500',
               title: a.type === 'assigned' ? 'Talent Assigned' : 'Talent Removed',
               desc: descText
            });
         });
      }

      if (booking.receiptUploadedAt) {
         evts.push({ type: 'payment_proof', at: booking.receiptUploadedAt, icon: <Activity className="w-4 h-4 text-white" />, color: 'bg-orange-500', title: 'Payment Proof Submitted', desc: `Client uploaded a manual payment receipt (${booking.paymentMethod || 'Unknown'}).` });
      }

      if (booking.declinedAt) {
         evts.push({ type: 'payment_declined', at: booking.declinedAt, icon: <X className="w-4 h-4 text-white" />, color: 'bg-red-500', title: 'Payment Declined', desc: `Admin declined payment. Reason: ${booking.paymentDeclineReason || 'None given'}.` });
      }

      if (booking.paidAt) {
         evts.push({ type: 'payment_approved', at: booking.paidAt, icon: <CheckCircle2 className="w-4 h-4 text-white" />, color: 'bg-emerald-500', title: 'Payment Approved & Confirmed', desc: `Payment and booking successfully confirmed.` });
      }

      if (booking.status?.toLowerCase() === 'completed') {
         const cTime = new Date().toISOString();
         evts.push({ type: 'completed', at: cTime, icon: <CheckCircle2 className="w-4 h-4 text-white" />, color: 'bg-indigo-800', title: 'Booking Completed', desc: `Gig has concluded successfully.` });
      }

      return evts;
   };
   
   const history = getTimeline().sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime());

   return (
     <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className="bg-white rounded-3xl w-[96%] sm:max-w-xl shadow-2xl relative z-[230] overflow-hidden border border-slate-200 flex flex-col animate-in zoom-in-95">
           <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-indigo-500" />
                 </div>
                 <h2 className="text-xl font-bold text-slate-900">Activity Log</h2>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-650 cursor-pointer"><X className="w-6 h-6" /></button>
           </div>
           <div className="p-4 sm:p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {history.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-3">
                   <Clock className="w-12 h-12 mx-auto stroke-[1.5] opacity-20" />
                   <p className="text-sm font-medium">No activity recorded for this booking.</p>
                </div>
              ) : (
                <div className="space-y-8 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                   {history.map((h: any, i: number) => (
                     <div key={i} className="flex gap-6 relative">
                        <div className={`w-10 h-10 rounded-full border-4 border-white shadow-md z-10 flex items-center justify-center ${h.color}`}>
                           {h.icon}
                        </div>
                        <div className="flex-1 space-y-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                           <div className="flex items-center justify-between">
                              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                 {new Date(h.at).toLocaleDateString()} at {new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                           </div>
                           <p className="text-sm font-bold text-slate-900">
                             {h.title}
                           </p>
                           <p className="text-xs font-bold text-slate-505 mt-1">{h.desc}</p>
                        </div>
                     </div>
                   ))}
                </div>
              )}
           </div>
           <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100">
             <button onClick={onClose} className="w-full h-12 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-650 hover:bg-slate-100 transition-all shadow-sm cursor-pointer">Close Activity Log</button>
           </div>
        </div>
     </div>
   )
}

// ─── Staff Private Client Evaluation Modal Component ──────────────────────────

function AdminRateClientModal({ booking, companyId, onClose, onCompleted }: {
  booking: any,
  companyId: string,
  onClose: () => void,
  onCompleted: (updatedBooking: any) => void
}) {
  const { user } = useAuth();
  const [punctuality, setPunctuality] = useState(5);
  const [communication, setCommunication] = useState(5);
  const [reliability, setReliability] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadExistingRating() {
      try {
        const q = query(
          collection(db, "client_internal_ratings"),
          where("bookingId", "==", booking.id)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setPunctuality(data.punctuality || 5);
          setCommunication(data.communication || 5);
          setReliability(data.reliability || 5);
          setComment(data.comment || "");
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadExistingRating();
  }, [booking.id]);

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "client_internal_ratings"),
        where("bookingId", "==", booking.id)
      );
      const snap = await getDocs(q);
      
      const ratingData = {
        bookingId: booking.id,
        companyId,
        clientId: booking.clientId || "guest",
        adminId: user.uid,
        adminName: user.displayName || user.email || "Admin/Staff",
        punctuality,
        communication,
        reliability,
        comment,
        createdAt: new Date().toISOString()
      };

      if (!snap.empty) {
        await updateDoc(doc(db, "client_internal_ratings", snap.docs[0].id), ratingData);
      } else {
        await addDoc(collection(db, "client_internal_ratings"), ratingData);
      }

      await updateDoc(doc(db, "bookings", booking.id), {
        clientInternallyRated: true
      });

      showSuccess("Internal client evaluation saved successfully.");
      onCompleted({
        ...booking,
        clientInternallyRated: true
      });
    } catch (e) {
      console.error(e);
      showError("Failed to submit internal rating. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      <div className="w-[96%] sm:max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-800 to-slate-950 text-white">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-white/10 rounded-xl"><Star className="w-5 h-5 text-amber-300 fill-amber-300" /></div>
             <div>
                <h3 className="font-black text-lg">Staff Evaluation</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Internal Client Rating System</p>
             </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar bg-slate-50/30">
          <div className="p-4 bg-amber-50/50 border border-amber-200/50 rounded-2xl flex items-center gap-3 text-amber-800 text-xs font-semibold">
            <Info className="w-4 h-4 shrink-0 text-amber-600" />
            <span>This rating is private and only visible to administrators, staff, and company personnel.</span>
          </div>

          <div className="space-y-4">
             {/* Punctuality */}
             <div className="bg-white p-4 rounded-2xl border border-slate-200/60 space-y-2.5">
                <div className="flex items-center justify-between">
                   <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Punctuality</span>
                   <span className="text-xs font-black text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded">{punctuality} / 5</span>
                </div>
                <div className="flex items-center gap-2">
                   {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setPunctuality(star)} className="focus:outline-none transition-transform active:scale-95 cursor-pointer">
                         <Star className={`w-7 h-7 ${star <= punctuality ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      </button>
                   ))}
                </div>
             </div>

             {/* Communication */}
             <div className="bg-white p-4 rounded-2xl border border-slate-200/60 space-y-2.5">
                <div className="flex items-center justify-between">
                   <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Communication</span>
                   <span className="text-xs font-black text-indigo-655 bg-indigo-50 px-2 py-0.5 rounded">{communication} / 5</span>
                </div>
                <div className="flex items-center gap-2">
                   {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setCommunication(star)} className="focus:outline-none transition-transform active:scale-95 cursor-pointer">
                         <Star className={`w-7 h-7 ${star <= communication ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      </button>
                   ))}
                </div>
             </div>

             {/* Reliability */}
             <div className="bg-white p-4 rounded-2xl border border-slate-200/60 space-y-2.5">
                <div className="flex items-center justify-between">
                   <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Reliability & Attitude</span>
                   <span className="text-xs font-black text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded">{reliability} / 5</span>
                </div>
                <div className="flex items-center gap-2">
                   {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setReliability(star)} className="focus:outline-none transition-transform active:scale-95 cursor-pointer">
                         <Star className={`w-7 h-7 ${star <= reliability ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      </button>
                   ))}
                </div>
             </div>

             {/* Private Staff Comment */}
             <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Private Staff Comments</label>
                <textarea
                   placeholder="Enter private notes about this client (e.g. client was demanding but paid immediately, highly recommended...)"
                   value={comment}
                   onChange={e => setComment(e.target.value)}
                   rows={3}
                   className="w-full text-sm font-bold text-slate-800 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 placeholder:text-slate-400 bg-slate-50/50"
                />
             </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} className="rounded-xl font-bold h-11 px-5 border-slate-200 text-slate-650 hover:bg-slate-100 bg-white cursor-pointer">Cancel</Button>
          <Button 
             disabled={loading} 
             onClick={handleSubmit} 
             className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold h-11 px-6 shadow-md shadow-indigo-100 flex items-center gap-2 cursor-pointer"
          >
             {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save Evaluation
          </Button>
        </div>
      </div>
    </div>
  );
}
