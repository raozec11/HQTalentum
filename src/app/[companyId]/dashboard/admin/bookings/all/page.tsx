"use client";

import { useState, useEffect, use } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp, addDoc } from "firebase/firestore";
import { 
  Calendar, Loader2, Eye, User, Mail, Briefcase, X, Phone, MapPin, Clock, 
  Users, DollarSign, CheckCircle2, ChevronRight, FileText, Info, Search, 
  Filter, LayoutGrid, GripVertical, ChevronDown, History, Activity, Star, 
  Trash2, RotateCcw, Sparkles, Plus, Minus
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { sendNotification, sendNotificationToAdmins, sendNotificationToTalents } from "@/lib/notifications";
import { BookingChatButton } from "@/components/bookings/BookingChatButton";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";
import {
  BookingDetailsModal,
  TalentManagementModal,
  AssignTalentModal,
  ActivityHistoryModal,
  AdminRateClientModal
} from "@/components/bookings/AdminBookingModals";

const BASE_COLUMNS = [
  { id: "id", label: "Booking ID" },
  { id: "customer", label: "Customer Details" },
  { id: "date", label: "Event Date" },
  { id: "address", label: "Venue Address" },
  { id: "jobType", label: "Job Service" },
  { id: "talent", label: "Requested Talent" },
  { id: "amount", label: "Total Amount" },
  { id: "status", label: "Booking Status" },
];

export default function AllBookingsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = use(props.params);
  const { user } = useAuth();
  const urlCompanyId = params.companyId;

  const [bookings, setBookings] = useState<any[]>([]);
  const [talentsDict, setTalentsDict] = useState<Record<string, any>>({});
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [chatBooking, setChatBooking] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRateClientModal, setShowRateClientModal] = useState(false);

  // Advanced Table States
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Assignment & Management States
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [manageTalentId, setManageTalentId] = useState<string | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [allTalents, setAllTalents] = useState<any[]>([]);
  const [loadingAllTalents, setLoadingAllTalents] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [activeAssignTab, setActiveAssignTab] = useState<'interested' | 'similar' | 'all'>('interested');

  // Column Configuration States
  const [availableColumns, setAvailableColumns] = useState<typeof BASE_COLUMNS>(BASE_COLUMNS);
  const [columns, setColumns] = useState<string[]>(BASE_COLUMNS.map(c => c.id));
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [draggedColId, setDraggedColId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBookingsAndSettings() {
      const targetCompanyId = (user?.companyId || urlCompanyId || "").trim();
      if (!targetCompanyId) return;
      
      try {
        // 1. Fetch form settings first to understand the column schema
        const formSnap = await getDoc(doc(db, "companies", targetCompanyId, "settings", "bookingForm"));
        let dynamicCols = [...BASE_COLUMNS];
        
        if (formSnap.exists() && formSnap.data().activeForm === "custom" && Array.isArray(formSnap.data().customElements)) {
          const customElements = formSnap.data().customElements;
          customElements.forEach((el: any) => {
            if (el.type !== "divider" && el.type !== "paragraph" && !el.locked) {
               const slug = el.label ? el.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '') || el.id : el.id;
               if (!dynamicCols.some(c => c.id === slug)) {
                  dynamicCols.push({ id: slug, label: el.label || "Custom Field" });
               }
            }
          });
        }

        const ids = Array.from(new Set([targetCompanyId, targetCompanyId.toLowerCase(), targetCompanyId.toUpperCase()]));
        const snaps = await Promise.all(
          ids.map(id => getDocs(query(collection(db, "bookings"), where("companyId", "==", id))))
        );
        const bookingMap = new Map<string, any>();
        snaps.forEach(snap => {
          snap.docs.forEach(d => {
            bookingMap.set(d.id, { id: d.id, ...d.data() });
          });
        });
        const data = Array.from(bookingMap.values());
        
        // 3. Extract any extra dynamic columns from legacy or undefined bookings
        data.forEach(b => {
           Object.keys(b).forEach(k => {
              if (!['id','companyId','clientId','createdAt','formMode', 'checkoutSessionId', 'stripePaymentIntentId'].includes(k) 
                  && !dynamicCols.some(c => c.id === k) && !k.startsWith('__')) {
                   const formattedLabel = k.replace(/^__/, '').replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
                   dynamicCols.push({ id: k, label: formattedLabel.charAt(0).toUpperCase() + formattedLabel.slice(1) });
              }
           })
        });

        setAvailableColumns(dynamicCols);

        // 4. Initialize user preference if exists
        if (user) {
          const savedColsStr = localStorage.getItem(`talentum_admin_cols_${user.uid}`);
          if (savedColsStr) {
             const savedCols = JSON.parse(savedColsStr);
             // Ensure legacy local storage columns still exist in definitions
             const validCols = savedCols.filter((colId: string) => dynamicCols.some(dc => dc.id === colId));
             if (validCols.length > 0) setColumns(validCols);
          } else {
             setColumns(["id", "customer", "date", "jobType", "amount", "status"]);
          }
        }

        const sorted = data.sort((a,b) => new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime());
        setBookings(sorted);

        // EXTRA: Fetch talent details for any assigned/applicant/selected talent to show in modals
        const uids = new Set<string>();
        data.forEach(b => {
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
      } catch (error: any) {
        console.error("Error fetching bookings:", error);
        setErrorMsg(error.message || "Unknown error occurred.");
      } finally {
        setLoading(false);
      }
    }
    fetchBookingsAndSettings();
  }, [user, urlCompanyId]);

  const saveColumns = (newCols: string[]) => {
    setColumns(newCols);
    if (user) localStorage.setItem(`talentum_admin_cols_${user.uid}`, JSON.stringify(newCols));
  };

  const fetchAllCompanyTalents = async () => {
    if (!urlCompanyId || allTalents.length > 0) return;
    setLoadingAllTalents(true);
    try {
      const [uSnap, tSnap] = await Promise.all([
        getDocs(query(collection(db, "users"), where("companyId", "==", urlCompanyId), where("role", "==", "talent"))),
        getDocs(query(collection(db, "talents"), where("companyId", "==", urlCompanyId)))
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

  const updateBookingState = (bookingId: string, updates: any) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, ...updates } : b));
    if (selectedBooking?.id === bookingId) {
      setSelectedBooking((prev: any) => ({ ...prev, ...updates }));
    }
  };

  const handleAssign = async (talentId: string) => {
    if (!selectedBooking) return;
    
    // Multi-Talent Limit Check
    const limit = parseInt(selectedBooking.noOfEntertainers || selectedBooking.numEntertainers || 1);
    const currentAssigned = selectedBooking.selectedTalentIds || (selectedBooking.selectedTalentId ? [selectedBooking.selectedTalentId] : []);
    
    if (currentAssigned.includes(talentId)) return;
    if (currentAssigned.length >= limit) {
      showError(`Limit reached: This job requested a maximum of ${limit} entertainer(s).`);
      return;
    }

    // Ensure we have the talent data in our dict for UI consistency
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
      adminName: user?.displayName || user?.email || "Admin"
    };

    const newIds = [...currentAssigned, talentId];

    const newStatus = newIds.length >= limit ? "Assigned" : (selectedBooking.status || "Pending");

    const updates = {
      selectedTalentIds: newIds,
      // For backwards compatibility, maintain the single id until fully migrated, or just use the first
      selectedTalentId: newIds[0] || null, 
      status: newStatus,
      assignedAt: serverTimestamp(),
      assignmentHistory: arrayUnion(historyEntry)
    };

    try {
      await updateDoc(doc(db, "bookings", selectedBooking.id), updates);

      // Add system message to booking chat
      try {
        const talentName = talentsDict[talentId]?.displayName || allTalents.find(t => t.id === talentId)?.displayName || "Talent";
        const chatRef = doc(db, "chats", selectedBooking.id);
        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) {
          await setDoc(chatRef, {
            bookingId: selectedBooking.id,
            companyId: urlCompanyId,
            createdAt: new Date().toISOString(),
            lastMessageText: `${talentName} Connected`,
            lastSenderId: "system",
            lastMessageAt: new Date().toISOString(),
            lastRead: {}
          });
        }
        const existingMsgs = await getDocs(query(
          collection(db, "chats", selectedBooking.id, "messages"),
          where("senderId", "==", "system"),
          where("text", "==", `${talentName} Connected`)
        ));
        if (existingMsgs.empty) {
          await addDoc(collection(db, "chats", selectedBooking.id, "messages"), {
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
        companyId: urlCompanyId,
        recipientEmail: talentsDict[talentId]?.email || "",
        title: "New Job Action Required",
        message: `You've been assigned to a new booking! Please review & confirm.`,
        type: "booking",
        link: `/${urlCompanyId}/dashboard/talent/bookings?tab=offers`
      });

      // If the booking meets its required entertainer limit, select other applicants and send them a "Booking Closed" notification
      const otherApplicants = (selectedBooking.applicants || []).filter((uid: string) => !newIds.includes(uid));
      if (newIds.length >= limit && otherApplicants.length > 0) {
        await Promise.all(
          otherApplicants.map(async (uid: string) => {
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
              companyId: urlCompanyId,
              recipientEmail: appEmail,
              title: "Booking Closed",
              message: `Thank you for applying. Another talent has been selected for booking #${selectedBooking.id.substring(0, 8)}, and the gig is now closed.`,
              type: "info",
              link: `/${urlCompanyId}/dashboard/talent/bookings?tab=all`
            });
          })
        );
      }

      updateBookingState(selectedBooking.id, { ...updates, assignedAt: new Date().toISOString() });
      setShowAssignModal(false);
    } catch (e) {
      console.error("Assignment failed:", e);
      showError("Failed to assign talent.");
    }
  };

  const handleUnassign = async (talentIdToRemove: string, reopen: boolean) => {
    if (!selectedBooking) return;
    
    const currentAssigned = selectedBooking.selectedTalentIds || (selectedBooking.selectedTalentId ? [selectedBooking.selectedTalentId] : []);
    if (!currentAssigned.includes(talentIdToRemove)) return;

    const historyEntry = {
      type: 'unassigned',
      talentId: talentIdToRemove,
      at: new Date().toISOString(),
      adminName: user?.displayName || user?.email || "Admin",
      reopened: reopen
    };

    const newIds = currentAssigned.filter((id: string) => id !== talentIdToRemove);

    const updates: any = {
      selectedTalentIds: newIds,
      selectedTalentId: newIds.length > 0 ? newIds[0] : null,
      assignmentHistory: arrayUnion(historyEntry)
    };
    
    // Clear global assignedAt if no talents left, else preserve it
    if (newIds.length === 0) updates.assignedAt = null;
    
    // Revert status to Pending if no talents are left or explicitly reopened
    if (newIds.length === 0 || reopen) {
      updates.status = "Pending";
    }

    try {
      await updateDoc(doc(db, "bookings", selectedBooking.id), updates);

      // Add system message to booking chat
      try {
        const talentName = talentsDict[talentIdToRemove]?.displayName || "Talent";
        const chatRef = doc(db, "chats", selectedBooking.id);
        await addDoc(collection(db, "chats", selectedBooking.id, "messages"), {
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
      
      // SEND UNASSIGN NOTIFICATION
      await sendNotification({
        userId: talentIdToRemove,
        companyId: urlCompanyId,
        recipientEmail: talentsDict[talentIdToRemove]?.email || "",
        title: "Unassigned from Booking",
        message: `You have been removed from the booking #${selectedBooking.id.substring(0, 8)}.`,
        type: "alert",
        link: `/${urlCompanyId}/dashboard/talent/bookings?tab=all`
      });

      if (reopen) {
        try {
          await sendNotificationToAdmins(urlCompanyId, {
            title: "Job Reopened",
            message: `Booking #${selectedBooking.id.substring(0, 8)} has been reopened and is now available for applications.`,
            type: "booking",
            link: `/${urlCompanyId}/dashboard/admin/bookings/all`
          });
          await sendNotificationToTalents(urlCompanyId, {
            title: "Job Reopened - Apply Now!",
            message: `Booking #${selectedBooking.id.substring(0, 8)} is reopened! Apply now in your available tab.`,
            type: "booking",
            link: `/${urlCompanyId}/dashboard/talent/bookings?tab=available`
          }, {
            ...selectedBooking,
            status: "Pending",
            selectedTalentId: null,
            selectedTalentIds: []
          });
        } catch (notifErr) {
          console.error("Reopen notifications failed:", notifErr);
        }
      }

      updateBookingState(selectedBooking.id, updates);
      setManageTalentId(null);
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

  const toggleColumn = (colId: string) => {
    if (columns.includes(colId)) saveColumns(columns.filter(c => c !== colId));
    else saveColumns([...columns, colId]);
  };

  // HTML5 Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, colId: string) => {
    setDraggedColId(colId);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    if (!draggedColId || draggedColId === targetColId) return;
    const newCols = [...columns];
    const gidx = newCols.indexOf(draggedColId);
    const tidx = newCols.indexOf(targetColId);
    if (gidx === -1 || tidx === -1) return;
    newCols.splice(gidx, 1);
    newCols.splice(tidx, 0, draggedColId);
    saveColumns(newCols);
  };
  const handleDragEnd = () => setDraggedColId(null);

  // Deep Client-Side Search
  const filteredBookings = bookings.filter(b => {
    const matchesStatus = statusFilter === "All" || (b.status || "Pending") === statusFilter;
    
    // Convert the entire booking object to a giant searchable string
    let fullText = Object.values(b).map(val => {
      if(val && typeof val === 'object') return JSON.stringify(val);
      return String(val);
    }).join(" ").toLowerCase();
    
    // Add known key mappings manually just in case
    fullText += ` ${b.id.toLowerCase()}`;
    
    const matchesSearch = fullText.includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const totalPages = Math.ceil(filteredBookings.length / itemsPerPage) || 1;
  const paginatedBookings = filteredBookings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter]);

  return (
    <>
      <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-4 pb-16 w-full px-4 sm:px-6 lg:px-8">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200/60 pb-6">
        <div>
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200">
                <Calendar className="w-5 h-5 text-white" />
             </div>
             <p className="text-xs font-black text-indigo-600 uppercase tracking-widest leading-none mt-1">Management Console</p>
           </div>
           <h1 className="text-[32px] md:text-[40px] font-black text-slate-900 tracking-tight leading-none">Reservations</h1>
        </div>
      </div>

      {/* Control Navigation Header */}
      {!loading && !errorMsg && bookings.length > 0 && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200/60 relative z-10 w-full">
          
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 w-full max-w-[400px] transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400">
            <Search className="w-5 h-5 text-indigo-400" />
            <input 
              type="text" 
              placeholder="Search reservations, names, emails..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none focus:ring-0 text-[15px] flex-1 outline-none text-slate-800 bg-transparent placeholder:text-slate-400 font-medium w-full"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600 bg-slate-200/50 rounded-full p-1"><X className="w-4 h-4" /></button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 relative z-30 justify-between md:justify-end">
             {/* Status Dropdown */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm relative min-w-[200px]">
               <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
               <select 
                 value={statusFilter}
                 onChange={(e) => setStatusFilter(e.target.value)}
                 className="appearance-none border-none bg-transparent text-[15px] focus:ring-0 outline-none text-slate-700 font-bold cursor-pointer pr-4 w-full"
               >
                 <option value="All">Record View: All</option>
                 <option value="Pending">Status: Pending</option>
                 <option value="Approved">Status: Approved</option>
                 <option value="Assigned">Status: Assigned</option>
                 <option value="Completed">Status: Completed</option>
               </select>
               <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 pointer-events-none" />
            </div>

            {/* Column Configurator */}
            <div className="relative">
              <Button 
                variant="outline" 
                onClick={() => setShowColumnConfig(!showColumnConfig)}
                className={`h-[46px] px-5 rounded-xl font-bold shadow-sm transition-all border-slate-200 ${showColumnConfig ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 hover:text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                <LayoutGrid className="w-4 h-4 mr-2" />
                Configure Table
              </Button>

              {showColumnConfig && (
                <div className="absolute right-0 top-14 w-[320px] bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 z-40 animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="text-sm font-black text-slate-800">Layout Settings</h3>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Drag to reorder</p>
                    </div>
                    <button onClick={() => setShowColumnConfig(false)} className="text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-full transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                  
                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                    {/* Active Columns */}
                    {columns.map(colId => {
                      const colDef = availableColumns.find(c => c.id === colId);
                      if (!colDef) return null;
                      const isDragging = draggedColId === colId;
                      return (
                        <div 
                          key={colId} 
                          draggable 
                          onDragStart={(e) => handleDragStart(e, colId)}
                          onDragOver={(e) => handleDragOver(e, colId)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center justify-between py-3 px-4 bg-white rounded-xl border transition-all cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50 border-indigo-300 bg-indigo-50/30' : 'border-slate-100 shadow-sm hover:border-slate-300 hover:shadow-md'}`}
                        >
                          <label className="flex items-center gap-3 cursor-pointer pointer-events-none">
                            <input type="checkbox" checked readOnly className="rounded border-slate-300 text-indigo-600 w-4 h-4 pointer-events-auto" onClick={() => toggleColumn(colId)} />
                            <span className="text-sm font-bold text-slate-700">{colDef.label}</span>
                          </label>
                          <GripVertical className="w-4 h-4 text-slate-300" />
                        </div>
                      )
                    })}
                    
                    {columns.length > 0 && availableColumns.filter(c => !columns.includes(c.id)).length > 0 && <div className="h-px bg-slate-200/60 my-4"></div>}

                    {/* Inactive columns */}
                    {availableColumns.filter(c => !columns.includes(c.id)).map(colDef => (
                       <div key={colDef.id} className="flex items-center justify-between py-3 px-4 bg-slate-50/50 rounded-xl border border-transparent hover:bg-slate-50 transition-colors">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={false} onChange={() => toggleColumn(colDef.id)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 w-4 h-4" />
                            <span className="text-sm font-semibold text-slate-500">{colDef.label}</span>
                          </label>
                        </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Table View */}
      <Card className="rounded-3xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)] bg-white overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Records...</p>
          </div>
        ) : errorMsg ? (
          <div className="p-24 text-center">
             <div className="w-20 h-20 bg-red-50 rounded-[28px] flex items-center justify-center mx-auto mb-6 ring-1 ring-red-100">
               <X className="w-10 h-10 text-red-500" />
             </div>
            <h2 className="text-2xl font-black text-slate-900">Failed to Load</h2>
            <p className="text-slate-500 mt-2 font-semibold">{errorMsg}</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="p-24 text-center">
            <div className="w-24 h-24 bg-slate-50 rounded-[28px] flex items-center justify-center mx-auto mb-8 border border-slate-100 shadow-sm">
              <Calendar className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-2xl font-black text-slate-900">Database Empty</h2>
            <p className="text-slate-500 mt-2 font-medium max-w-sm mx-auto leading-relaxed">You haven't received any bookings yet. Share your booking portal to start collecting client reservations!</p>
          </div>
        ) : (
          <div className="flex flex-col w-full">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="border-b-2 border-slate-100 bg-white">
                    {columns.map(colId => {
                       const colDef = availableColumns.find(c => c.id === colId);
                       return <th key={colId} className="py-3 px-4 text-[11px] font-black text-slate-400 uppercase tracking-[0.1em] whitespace-nowrap">{colDef?.label}</th>
                    })}
                    <th className="py-3 px-4 text-[11px] font-black text-slate-400 uppercase tracking-[0.1em] text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80 bg-[#fbfcfd]">
                  {paginatedBookings.map((booking) => {
                    // Extract Standard Fallback Fields
                    const name = booking.clientName || booking.__clientName || "Unknown Client";
                    const email = booking.clientEmail || booking.__email;
                    const phone = booking.clientNumber;
                    const jobType = booking.jobType || booking.__jobType || "Unspecified";
                    let displayStatus = booking.status || "Pending";
                    if (booking.paymentStatus === "Awaiting Approval") {
                        displayStatus = "Awaiting Approval";
                    } else if (displayStatus === "Assigned") {
                        displayStatus = "Talent Assigned";
                    }
                    const status = displayStatus;
                    const rawDate = booking.eventDate || "";
                    const rawTime = booking.eventTime || "";
                    
                    let dateInfo = "Not set";
                    let timeInfo = "";

                    try {
                      if (rawDate) {
                        dateInfo = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(rawDate));
                      }
                      if (rawTime) {
                        timeInfo = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${rawTime}`));
                      }
                    } catch (e) {
                      dateInfo = rawDate;
                      timeInfo = rawTime;
                    }

                    const address = booking.address || booking.__address || "Not specified";
                    const talentCnt = booking.numEntertainers || "1";
                    const amount = booking.payRate ? `$${booking.payRate}` : "-";

                    return (
                      <tr key={booking.id} className="hover:bg-white hover:shadow-sm transition-all group relative z-0">
                        {columns.map(colId => {
                           // Fixed Column Handlers
                           if (colId === "id") return (
                             <td key={colId} className="py-3.5 px-4 whitespace-nowrap">
                               <span className="text-[12px] font-bold font-mono text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">
                                 ID:{booking.id}
                               </span>
                             </td>
                           );
                           
                           if (colId === "customer") return (
                             <td key={colId} className="py-3.5 px-4 whitespace-nowrap">
                               <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100/50">
                                   <span className="text-indigo-600 font-bold text-xs uppercase">{name.charAt(0)}</span>
                                 </div>
                                 <div className="flex flex-col justify-center">
                                   <span className="text-[14px] font-bold text-slate-900 leading-tight">{name}</span>
                                   {(email || phone) && <span className="text-[12px] font-semibold text-slate-400 leading-tight mt-0.5">{email || phone}</span>}
                                 </div>
                               </div>
                             </td>
                           );

                           if (colId === "date") return (
                             <td key={colId} className="py-3.5 px-4 whitespace-nowrap">
                               <div className="flex flex-col justify-center">
                                 <span className="text-[13px] font-bold text-slate-700 leading-tight">{dateInfo}</span>
                                 {timeInfo && <span className="text-[11px] font-semibold text-slate-400 mt-0.5 uppercase leading-tight">{timeInfo}</span>}
                               </div>
                             </td>
                           );

                           if (colId === "address") return (
                             <td key={colId} className="py-3.5 px-4 min-w-[200px]">
                               <p className="text-[13px] font-semibold text-slate-600 block line-clamp-1" title={address}>{address}</p>
                             </td>
                           );

                           if (colId === "jobType") return (
                             <td key={colId} className="py-3.5 px-4 min-w-[150px]">
                               <span className="text-[13px] font-bold text-slate-800 bg-white border border-slate-200 px-2.5 py-1 rounded-md whitespace-nowrap shadow-sm">{jobType}</span>
                             </td>
                           );

                           if (colId === "talent") return (
                             <td key={colId} className="py-3.5 px-4">
                               <span className="text-[12px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md flex w-max items-center gap-1.5 border border-indigo-100/50">
                                 <Users className="w-3 h-3"/> {talentCnt}
                               </span>
                             </td>
                           );

                           if (colId === "amount") return (
                             <td key={colId} className="py-3.5 px-4 whitespace-nowrap">
                               <span className="text-[13px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/50 shadow-sm">{amount}</span>
                             </td>
                           );

                           if (colId === "status") return (
                              <td key={colId} className="py-3.5 px-4 whitespace-nowrap">
                                <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm ${
                                  status === 'Inquiry' ? 'bg-violet-50 text-violet-600 border-violet-200' :
                                  status === 'Pending' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                  status === 'Talent Assigned' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                  status === 'Awaiting Approval' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                                  status === 'Deposit Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                  status === 'Confirmed' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' :
                                  status === 'Completed' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                                  'bg-slate-50 text-slate-600 border-slate-200'
                                }`}>
                                  {status === 'Inquiry' && <Info className="w-3 h-3 mr-1.5"/>}
                                  {status === 'Pending' && <Clock className="w-3 h-3 mr-1.5"/>}
                                  {status === 'Talent Assigned' && <User className="w-3 h-3 mr-1.5"/>}
                                  {status === 'Awaiting Approval' && <Clock className="w-3 h-3 mr-1.5 animate-pulse"/>}
                                  {status === 'Deposit Paid' && <DollarSign className="w-3 h-3 mr-1.5"/>}
                                  {status === 'Confirmed' && <CheckCircle2 className="w-3 h-3 mr-1.5"/>}
                                  {status === 'Completed' && <CheckCircle2 className="w-3 h-3 mr-1.5"/>}
                                  {status}
                                </span>
                              </td>
                           );
                           
                           // Dynamic Custom Column Handler
                           const val = booking[colId];
                           const displayVal = Array.isArray(val) ? val.join(', ') : String(val || '');
                           return (
                              <td key={colId} className="py-3.5 px-4">
                                <span className="text-[13px] font-semibold text-slate-600 line-clamp-1">
                                  {displayVal || <span className="text-slate-300">-</span>}
                                </span>
                              </td>
                           );
                        })}

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex gap-2 justify-end items-center">
                            <BookingChatButton 
                              bookingId={booking.id} 
                              userId={user?.uid || ""} 
                              onClick={() => setChatBooking(booking)}
                            />
                          <Button 
                            onClick={() => setSelectedBooking(booking)} 
                            variant="default" 
                            className="h-8 px-3.5 rounded-md text-[12px] font-bold bg-slate-900 border border-slate-800 text-white hover:bg-indigo-600 transition-colors shadow-sm"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1 opacity-80" /> View
                          </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View (Zero horizontal scroll needed!) */}
            <div className="block md:hidden divide-y divide-slate-100 bg-[#fbfcfd]">
              {paginatedBookings.map((booking) => {
                const name = booking.clientName || booking.__clientName || "Unknown Client";
                const email = booking.clientEmail || booking.__email;
                const phone = booking.clientNumber;
                const jobType = booking.jobType || booking.__jobType || "Unspecified";
                let displayStatus = booking.status || "Pending";
                if (booking.paymentStatus === "Awaiting Approval") {
                    displayStatus = "Awaiting Approval";
                } else if (displayStatus === "Assigned") {
                    displayStatus = "Talent Assigned";
                }
                const status = displayStatus;
                const rawDate = booking.eventDate || "";
                const rawTime = booking.eventTime || "";

                let dateInfo = "Not set";
                let timeInfo = "";

                try {
                  if (rawDate) {
                    dateInfo = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(rawDate));
                  }
                  if (rawTime) {
                    timeInfo = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${rawTime}`));
                  }
                } catch (e) {
                  dateInfo = rawDate;
                  timeInfo = rawTime;
                }

                const address = booking.address || booking.__address || "Not specified";
                const talentCnt = booking.numEntertainers || "1";
                const amount = booking.payRate ? `$${booking.payRate}` : "-";

                return (
                  <div key={booking.id} className="p-4 space-y-3 bg-white hover:bg-slate-50/60 transition-colors">
                    {/* Top Row: Customer Avatar, Name, Contact + Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 text-indigo-600 font-bold text-sm">
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-black text-slate-900 leading-tight truncate">{name}</h4>
                          <p className="text-[11px] font-semibold text-slate-400 truncate mt-0.5">{email || phone || "No contact info"}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm shrink-0 ${
                        status === 'Inquiry' ? 'bg-violet-50 text-violet-600 border-violet-200' :
                        status === 'Pending' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                        status === 'Talent Assigned' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                        status === 'Awaiting Approval' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                        status === 'Deposit Paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                        status === 'Confirmed' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' :
                        status === 'Completed' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                        'bg-slate-50 text-slate-600 border-slate-200'
                      }`}>
                        {status}
                      </span>
                    </div>

                    {/* Middle Info Card */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/80 p-3 rounded-2xl border border-slate-100 font-medium">
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Booking ID</span>
                        <span className="font-mono text-slate-700 font-bold text-[11px]">#{booking.id.slice(0, 10).toUpperCase()}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Job / Service</span>
                        <span className="text-slate-800 font-bold truncate block">{jobType} ({talentCnt})</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Event Date</span>
                        <span className="text-slate-700 font-bold">{dateInfo} {timeInfo && `• ${timeInfo}`}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Pay Rate</span>
                        <span className="text-emerald-700 font-black">{amount}</span>
                      </div>
                      {address && address !== "Not specified" && (
                        <div className="col-span-2 pt-1 border-t border-slate-200/50">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Location</span>
                          <span className="text-slate-600 font-semibold line-clamp-1 block">{address}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="flex items-center gap-2 pt-1">
                      <BookingChatButton 
                        bookingId={booking.id} 
                        userId={user?.uid || ""} 
                        onClick={() => setChatBooking(booking)}
                      />
                      <Button 
                        onClick={() => setSelectedBooking(booking)} 
                        className="flex-1 h-9 rounded-xl text-xs font-bold bg-slate-900 hover:bg-indigo-600 text-white shadow-sm flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Details
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* No Search Results */}
            {filteredBookings.length === 0 && (
              <div className="p-12 text-center bg-transparent">
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No bookings match your exact criteria.</p>
              </div>
            )}
            
            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between rounded-b-3xl">
                <p className="text-[12px] font-bold text-slate-400 tracking-widest uppercase">
                  Showing <span className="text-slate-900 bg-white border border-slate-200 shadow-sm px-2 py-0.5 rounded mx-1">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-900 bg-white border border-slate-200 shadow-sm px-2 py-0.5 rounded mx-1">{Math.min(currentPage * itemsPerPage, filteredBookings.length)}</span> of <span className="text-slate-900 ml-1">{filteredBookings.length}</span>
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="h-8 px-4 rounded-md text-[12px] font-bold text-slate-700 bg-white border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] disabled:opacity-50 hover:bg-slate-50"
                  >
                    Previous
                  </Button>

                  <Button 
                    variant="outline" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="h-8 px-4 rounded-md text-[12px] font-bold text-slate-700 bg-white border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] disabled:opacity-50 hover:bg-slate-50"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

    </div>

    {selectedBooking && !showAssignModal && !manageTalentId && !showActivityModal && !showRateClientModal && (
      <BookingDetailsModal 
        booking={selectedBooking} 
        onSearch={setSearchQuery}
        onClose={() => setSelectedBooking(null)} 
        talentsDict={talentsDict}
        setShowAssignModal={setShowAssignModal}
        setManageTalentId={setManageTalentId}
        setShowActivityModal={setShowActivityModal}
        fetchAllCompanyTalents={fetchAllCompanyTalents}
        onApprovePayment={handleApprovePayment}
        onDeclinePayment={handleDeclinePayment}
        onRateClient={() => setShowRateClientModal(true)}
        userId={user?.uid || ""}
        onChat={() => { setChatBooking(selectedBooking); setSelectedBooking(null); }}
        onBookingUpdated={(updatedBooking) => {
          setSelectedBooking(updatedBooking);
          setBookings(prev => prev.map(b => b.id === updatedBooking.id ? updatedBooking : b));
        }}
        onBookingDeleted={(deletedId) => {
          setBookings(prev => prev.filter(b => b.id !== deletedId));
          setSelectedBooking(null);
        }}
      />
    )}

    {selectedBooking && showRateClientModal && (
      <AdminRateClientModal
        booking={selectedBooking}
        companyId={urlCompanyId}
        onClose={() => { setSelectedBooking(null); setShowRateClientModal(false); }}
        onCompleted={(updatedBooking) => {
          setBookings(prev => prev.map(b => b.id === updatedBooking.id ? updatedBooking : b));
          setSelectedBooking(null);
          setShowRateClientModal(false);
        }}
      />
    )}

    {manageTalentId && talentsDict[manageTalentId] && selectedBooking && (
      <TalentManagementModal 
        talent={talentsDict[manageTalentId]}
        booking={selectedBooking}
        allBookings={bookings}
        onUnassign={(reopen: boolean) => handleUnassign(manageTalentId, reopen)}
        onClose={() => setManageTalentId(null)}
      />
    )}

    {showAssignModal && selectedBooking && (
      <AssignTalentModal 
        booking={selectedBooking}
        allTalentRoster={allTalents}
        dictionary={talentsDict}
        loading={loadingAllTalents}
        onAssign={handleAssign}
        onClose={() => setShowAssignModal(false)}
      />
    )}

    {showActivityModal && selectedBooking && (
      <ActivityHistoryModal 
        booking={selectedBooking}
        dictionary={talentsDict}
        onClose={() => setShowActivityModal(false)}
      />
    )}

    {chatBooking && (
      <BookingChatModal 
        booking={chatBooking} 
        user={user} 
        onClose={() => setChatBooking(null)} 
      />
    )}
    </>
  );
}

// Extracted modals to src/components/bookings/AdminBookingModals.tsx