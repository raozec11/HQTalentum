"use client";

import { useState, useEffect, useMemo, use } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, updateDoc, getDoc, setDoc, arrayUnion, serverTimestamp, addDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import {
  Calendar as CalendarIcon, Search, Mail, Phone, ChevronLeft, ChevronRight, UserCircle, Star, FileText, X, Briefcase, Clock, MapPin, CreditCard, Info, User, CheckCircle2, XCircle,
  Eye, Loader2, DollarSign, Activity, Trash2, RotateCcw, ChevronDown, History, Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { showSuccess, showError } from "@/lib/alerts";
import { sendNotification, sendNotificationToAdmins, sendNotificationToTalents } from "@/lib/notifications";
import { BookingChatButton } from "@/components/bookings/BookingChatButton";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";
import { Button } from "@/components/ui/button";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subDays,
  subMonths,
  format,
  isToday,
  isSameMonth,
  addWeeks,
  subWeeks,
  parseISO
} from "date-fns";

const getStatusBadgeStyles = (status: string) => {
  const normalized = (status || "Pending").toLowerCase();
  switch (normalized) {
    case "confirmed":
      return { bg: "bg-emerald-500", text: "text-emerald-700", border: "border-emerald-250", label: "Confirmed" };
    case "pending":
      return { bg: "bg-amber-500", text: "text-amber-700", border: "border-amber-250", label: "Pending" };
    case "completed":
      return { bg: "bg-slate-400", text: "text-slate-600", border: "border-slate-200", label: "Completed" };
    case "cancelled":
      return { bg: "bg-rose-500", text: "text-rose-700", border: "border-rose-250", label: "Cancelled" };
    case "awaiting approval":
    case "awaiting_approval":
      return { bg: "bg-orange-500", text: "text-orange-755", border: "border-orange-250", label: "Awaiting Approval" };
    default:
      return { bg: "bg-indigo-500", text: "text-indigo-700", border: "border-indigo-250", label: status };
  }
};

export default function AdminCalendarPage(props: { params: Promise<{ companyId: string }> }) {
  const params = use(props.params);
  const companyId = params.companyId;
  const { user: adminUser } = useAuth();

  const [bookings, setBookings] = useState<any[]>([]);
  const [talentsDict, setTalentsDict] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Calendar Controls State
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  // Filtering State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Details & Sub-Modal Overlay States
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [manageTalentId, setManageTalentId] = useState<string | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [allTalents, setAllTalents] = useState<any[]>([]);
  const [loadingAllTalents, setLoadingAllTalents] = useState(false);
  const [showRateClientModal, setShowRateClientModal] = useState(false);
  const [chatBooking, setChatBooking] = useState<any | null>(null);

  // Month date calculations
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);

  const monthDays = useMemo(() => {
    const arr = [];
    let day = gridStart;
    while (day <= gridEnd) {
      arr.push(day);
      day = addDays(day, 1);
    }
    return arr;
  }, [gridStart, gridEnd]);

  // Week date calculations
  const weekStart = startOfWeek(currentDate);
  const weekDays = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 7; i++) {
      arr.push(addDays(weekStart, i));
    }
    return arr;
  }, [weekStart]);

  const handlePrev = () => {
    if (viewMode === "month") {
      setCurrentDate(prev => subMonths(prev, 1));
    } else {
      setCurrentDate(prev => subWeeks(prev, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === "month") {
      setCurrentDate(prev => addMonths(prev, 1));
    } else {
      setCurrentDate(prev => addWeeks(prev, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const fetchBookings = async () => {
    if (!companyId) return;
    setLoading(true);
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
      const list = Array.from(bookingMap.values()) as any[];
      
      list.sort((a, b) => {
        const dA = a.eventDate ? new Date(a.eventDate).getTime() : 0;
        const dB = b.eventDate ? new Date(b.eventDate).getTime() : 0;
        return dB - dA;
      });
      setBookings(list);

      // Extract talent IDs and fetch profile info
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
      console.error("Error fetching bookings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchBookings();
    }
  }, [companyId]);

  const updateBookingState = (bookingId: string, updates: any) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, ...updates } : b));
    if (selectedBooking?.id === bookingId) {
      setSelectedBooking((prev: any) => ({ ...prev, ...updates }));
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
    if (!selectedBooking) return;
    
    const limit = parseInt(selectedBooking.noOfEntertainers || selectedBooking.numEntertainers || 1);
    const currentAssigned = selectedBooking.selectedTalentIds || (selectedBooking.selectedTalentId ? [selectedBooking.selectedTalentId] : []);
    
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
    const newStatus = newIds.length >= limit ? "Assigned" : (selectedBooking.status || "Pending");

    const updates = {
      selectedTalentIds: newIds,
      selectedTalentId: newIds[0] || null, 
      status: newStatus,
      assignedAt: serverTimestamp(),
      assignmentHistory: arrayUnion(historyEntry)
    };

    try {
      await updateDoc(doc(db, "bookings", selectedBooking.id), updates);

      try {
        const talentName = talentsDict[talentId]?.displayName || allTalents.find(t => t.id === talentId)?.displayName || "Talent";
        const chatRef = doc(db, "chats", selectedBooking.id);
        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) {
          await setDoc(chatRef, {
            bookingId: selectedBooking.id,
            companyId: companyId,
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
        companyId: companyId,
        recipientEmail: talentsDict[talentId]?.email || "",
        title: "New Job Assignment",
        message: `You've been assigned to a new booking! Please review & confirm.`,
        type: "booking",
        link: `/${companyId}/dashboard/talent/bookings?tab=offers`
      });

      const otherApplicants = (selectedBooking.applicants || []).filter((uid: string) => !newIds.includes(uid));
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
              message: `Thank you for applying. Another talent has been selected for booking #${selectedBooking.id.substring(0, 8)}, and the gig is now closed.`,
              type: "info",
              link: `/${companyId}/dashboard/talent/bookings?tab=all`
            });
          })
        );
      }

      updateBookingState(selectedBooking.id, { ...updates, assignedAt: new Date().toISOString() });
      setShowAssignModal(false);
      showSuccess("Talent assigned successfully.");
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
      await updateDoc(doc(db, "bookings", selectedBooking.id), updates);

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
      
      await sendNotification({
        userId: talentIdToRemove,
        companyId: companyId,
        recipientEmail: talentsDict[talentIdToRemove]?.email || "",
        title: "Unassigned from Booking",
        message: `You have been removed from the booking #${selectedBooking.id.substring(0, 8)}.`,
        type: "alert",
        link: `/${companyId}/dashboard/talent/bookings?tab=all`
      });

      if (reopen) {
        try {
          await sendNotificationToAdmins(companyId, {
            title: "Job Reopened",
            message: `Booking #${selectedBooking.id.substring(0, 8)} has been reopened and is now available for applications.`,
            type: "booking",
            link: `/${companyId}/dashboard/admin/bookings/all`
          });
          await sendNotificationToTalents(companyId, {
            title: "Job Reopened - Apply Now!",
            message: `Booking #${selectedBooking.id.substring(0, 8)} is reopened! Apply now in your available tab.`,
            type: "booking",
            link: `/${companyId}/dashboard/talent/bookings?tab=available`
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
      showSuccess("Performer unassigned successfully.");
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

  // Deep Filters Implementation
  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const bStatus = (b.status || "Pending").toLowerCase();
      const statusMatch = statusFilter === "All" || 
        (statusFilter === "Pending" && bStatus === "pending") ||
        (statusFilter === "Confirmed" && bStatus === "confirmed") ||
        (statusFilter === "Completed" && bStatus === "completed") ||
        (statusFilter === "Cancelled" && bStatus === "cancelled") ||
        (statusFilter === "Awaiting Approval" && (b.paymentStatus === 'Awaiting Approval' || bStatus === 'awaiting approval'));
      
      const searchStr = searchQuery.toLowerCase();
      const searchMatch = !searchQuery || 
        b.id?.toLowerCase().includes(searchStr) ||
        (b.clientName || b.__clientName || "").toLowerCase().includes(searchStr) ||
        (b.jobType || b.service || "").toLowerCase().includes(searchStr) ||
        (b.city || "").toLowerCase().includes(searchStr);
        
      return statusMatch && searchMatch;
    });
  }, [bookings, searchQuery, statusFilter]);

  const getBookingsForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return filteredBookings.filter(b => b.eventDate === dateStr);
  };

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
        
        {/* Header Title Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-150">
                <CalendarIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 leading-tight">Booking Calendar</h1>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">Manage schedules, assignments, and payments visually</p>
              </div>
            </div>
          </div>

          {/* Month/Week Navigation & Mode Selection Toggles */}
          <div className="flex items-center flex-wrap gap-3">
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              <button
                onClick={() => setViewMode("month")}
                className={cn(
                  "px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all focus:outline-none",
                  viewMode === "month" ? "bg-indigo-600 text-white shadow" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setViewMode("week")}
                className={cn(
                  "px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all focus:outline-none",
                  viewMode === "week" ? "bg-indigo-600 text-white shadow" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Weekly
              </button>
            </div>

            <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <button onClick={handlePrev} className="p-2.5 hover:bg-slate-50 border-r border-slate-100 text-slate-600"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={handleToday} className="px-4 py-2 hover:bg-slate-50 border-r border-slate-100 text-xs font-bold uppercase tracking-wider text-slate-700">Today</button>
              <button onClick={handleNext} className="p-2.5 hover:bg-slate-50 text-slate-600"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm relative z-10">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client, service, ID or city..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 h-10 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 bg-slate-50/50 focus:ring-4 focus:ring-indigo-100 transition-all font-semibold"
            />
          </div>
          <div className="relative w-full sm:w-56">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full h-10 pl-3 pr-8 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50/50 focus:outline-none focus:border-indigo-600 appearance-none cursor-pointer focus:ring-4 focus:ring-indigo-100 transition-all"
            >
              <option value="All">All Booking Statuses</option>
              <option value="Pending">Status: Pending</option>
              <option value="Confirmed">Status: Confirmed</option>
              <option value="Completed">Status: Completed</option>
              <option value="Cancelled">Status: Cancelled</option>
              <option value="Awaiting Approval">Status: Awaiting Approval</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Calendar Grid Section */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-24 text-center">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Accessing Calendar Data...</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden p-1">
            
            {/* Header Banner - Month Name */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-wider">
                {viewMode === "month" ? format(currentDate, "MMMM yyyy") : `Week of ${format(weekStart, "MMM d, yyyy")}`}
              </h2>
              <span className="text-xs text-slate-500 font-bold uppercase tracking-widest bg-white border border-slate-200 shadow-sm px-3.5 py-1.5 rounded-xl">
                 {filteredBookings.length} Scheduled
              </span>
            </div>

            {/* Monthly View Grid */}
            {viewMode === "month" && (
              <div className="flex flex-col w-full">
                
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 border-b border-slate-100 text-center py-3.5 text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                    <div key={day} className="flex-1">{day}</div>
                  ))}
                </div>

                {/* Day Grid cells */}
                <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 border-t border-slate-100">
                  {monthDays.map((day, idx) => {
                    const isCurrentMonth = isSameMonth(day, currentDate);
                    const dayBookings = getBookingsForDate(day);
                    const today = isToday(day);

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "min-h-[120px] p-2 flex flex-col justify-start relative group hover:bg-slate-50/20 transition-all",
                          !isCurrentMonth && "bg-slate-50/50 opacity-40"
                        )}
                      >
                        {/* Day Number */}
                        <div className="flex justify-between items-center mb-1">
                          <span
                            className={cn(
                              "text-xs font-black w-6 h-6 flex items-center justify-center rounded-full leading-none",
                              today ? "bg-indigo-600 text-white font-extrabold shadow shadow-indigo-150" : "text-slate-650"
                            )}
                          >
                            {format(day, "d")}
                          </span>
                        </div>

                        {/* Cell Bookings */}
                        <div className="space-y-1 flex-1 overflow-y-auto max-h-[85px] custom-scrollbar">
                          {dayBookings.slice(0, 3).map(b => {
                            const badge = getStatusBadgeStyles(b.status);
                            let formattedTime = "";
                            if (b.eventTime) {
                              try {
                                formattedTime = format(parseISO(`2000-01-01T${b.eventTime}`), "h:mm a");
                              } catch {
                                formattedTime = b.eventTime;
                              }
                            }

                            return (
                              <div
                                key={b.id}
                                onClick={() => setSelectedBooking(b)}
                                className="px-2 py-1 text-[11px] font-black rounded-lg border border-slate-150 bg-white hover:bg-indigo-50/60 hover:border-indigo-200 shadow-sm cursor-pointer transition-all flex items-center gap-1.5 truncate group/pill hover:translate-x-0.5"
                                title={`${b.clientName || "Unknown"} - ${b.jobType || "Event"}`}
                              >
                                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", badge.bg)} />
                                {formattedTime && <span className="text-[9px] text-slate-400 font-bold shrink-0">{formattedTime}</span>}
                                <span className="truncate text-slate-700 font-extrabold">{b.clientName || b.jobType || "Booking"}</span>
                              </div>
                            );
                          })}

                          {dayBookings.length > 3 && (
                            <div 
                              onClick={() => {
                                // Just open the first item or let them view all details
                                setSelectedBooking(dayBookings[0]);
                              }} 
                              className="text-[10px] font-black text-indigo-600 pl-2 cursor-pointer hover:underline py-0.5"
                            >
                              +{dayBookings.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Weekly View Grid */}
            {viewMode === "week" && (
              <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-slate-100 bg-slate-50/10">
                {weekDays.map((day, idx) => {
                  const dayBookings = getBookingsForDate(day);
                  const today = isToday(day);

                  return (
                    <div key={idx} className={cn("flex flex-col min-h-[400px] bg-white", today && "bg-indigo-50/10")}>
                      
                      {/* Day Lane Header */}
                      <div className={cn(
                        "px-4 py-3 text-center border-b border-slate-100 flex flex-col justify-center items-center gap-1",
                        today ? "bg-indigo-50/40 text-indigo-700" : "bg-slate-50/30 text-slate-655"
                      )}>
                        <span className="text-[11px] font-black uppercase tracking-widest">{format(day, "eee")}</span>
                        <span className={cn(
                          "text-lg font-black w-8 h-8 flex items-center justify-center rounded-full leading-none",
                          today ? "bg-indigo-600 text-white shadow shadow-indigo-150" : "text-slate-800"
                        )}>
                          {format(day, "d")}
                        </span>
                      </div>

                      {/* Day Bookings Column */}
                      <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[500px] custom-scrollbar bg-white">
                        {dayBookings.length === 0 ? (
                          <div className="py-12 text-center text-slate-300">
                            <span className="text-[11px] font-bold uppercase tracking-wider">No Bookings</span>
                          </div>
                        ) : (
                          dayBookings.map(b => {
                            const badge = getStatusBadgeStyles(b.status);
                            let formattedTime = "";
                            if (b.eventTime) {
                              try {
                                formattedTime = format(parseISO(`2000-01-01T${b.eventTime}`), "h:mm a");
                              } catch {
                                formattedTime = b.eventTime;
                              }
                            }

                            return (
                              <div
                                key={b.id}
                                onClick={() => setSelectedBooking(b)}
                                className="p-3 bg-white border border-slate-250 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-50/50 rounded-2xl cursor-pointer transition-all space-y-2.5 relative group hover:-translate-y-0.5"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className={cn(
                                    "text-[9px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full border shadow-sm inline-flex items-center gap-1 shrink-0",
                                    badge.text, badge.border, "bg-white"
                                  )}>
                                    <span className={cn("w-1 h-1 rounded-full", badge.bg)} />
                                    {badge.label}
                                  </span>
                                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">${b.payRate || "0"}</span>
                                </div>
                                
                                <div className="min-w-0">
                                  <h4 className="font-extrabold text-[13px] text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors truncate">
                                    {b.clientName || "Unknown Client"}
                                  </h4>
                                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{b.jobType || "Unspecified Gig"}</p>
                                </div>

                                <div className="pt-2 border-t border-slate-100 flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                                  {formattedTime && (
                                    <div className="flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5 text-slate-450 shrink-0" />
                                      <span>{formattedTime}</span>
                                    </div>
                                  )}
                                  {(b.city || b.state) && (
                                    <div className="flex items-center gap-1">
                                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                      <span className="truncate">{[b.city, b.state].filter(Boolean).join(", ")}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Details & Sub-Modal Overlays - Rendered Outside Constrained Layout */}
      {selectedBooking && !showAssignModal && !manageTalentId && !showActivityModal && !showRateClientModal && (
        <BookingDetailsModal 
          booking={selectedBooking} 
          onSearch={(val) => { setSearchQuery(val); }} 
          onClose={() => setSelectedBooking(null)} 
          talentsDict={talentsDict}
          setShowAssignModal={setShowAssignModal}
          setManageTalentId={setManageTalentId}
          setShowActivityModal={setShowActivityModal}
          fetchAllCompanyTalents={fetchAllCompanyTalents}
          onApprovePayment={handleApprovePayment}
          onDeclinePayment={handleDeclinePayment}
          onRateClient={() => setShowRateClientModal(true)}
          userId={adminUser?.uid || ""}
          onChat={() => { setChatBooking(selectedBooking); setSelectedBooking(null); }}
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

      {manageTalentId && talentsDict[manageTalentId] && selectedBooking && (
        <TalentManagementModal 
          talent={talentsDict[manageTalentId]}
          booking={selectedBooking}
          allBookings={bookings}
          onUnassign={(reopen: boolean) => handleUnassign(manageTalentId, reopen)}
          onClose={() => setManageTalentId(null)}
        />
      )}

      {showActivityModal && selectedBooking && (
        <ActivityHistoryModal 
          booking={selectedBooking}
          dictionary={talentsDict}
          onClose={() => setShowActivityModal(false)}
        />
      )}

      {showRateClientModal && selectedBooking && (
        <AdminRateClientModal
          booking={selectedBooking}
          companyId={companyId}
          onClose={() => { setSelectedBooking(null); setShowRateClientModal(false); }}
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

// ─── Administrative Sub-modal Components ─────────────────────────────────────

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

        <div className="px-2 sm:px-8 pt-5 pb-4 bg-white border-b border-slate-100 shrink-0 overflow-x-auto custom-scrollbar">
          <div className="flex items-start justify-between min-w-[500px] sm:min-w-0">
            {STEPS.map((step, i) => {
              const isDone    = step.isDone;
              const isCurrent = step.isActive;
              const dotColor  = (isDone || isCurrent) ? step.color : '#cbd5e1';
              const labelColor = isCurrent ? step.color : isDone ? '#64748b' : '#94a3b8';
              return (
                <div key={step.key} className="flex flex-col items-center flex-1 min-w-0 relative">
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
                <span className="w-2.5 h-2.5 rounded-full bg-orange-505 animate-pulse" />
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
                  className="w-full h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center gap-2 text-[11px] font-bold text-indigo-650 hover:bg-slate-100 hover:border-slate-300 transition-all group font-black uppercase tracking-wider cursor-pointer"
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
                  <CalendarIcon className="w-3.5 h-3.5 text-indigo-500" />
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
                            <div className="w-11 h-11 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-indigo-300 font-bold text-lg">
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
                                 <span className="text-[9px] font-black text-amber-705">{tData.rating}</span>
                              </div>
                            )}
                         </div>
                      </div>
                      )
                    })}

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
                    <p className={`text-xs font-bold mt-0.5 ${booking.clientMarkedComplete ? 'text-emerald-900' : 'text-slate-550'}`}>
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
                    <p className={`text-xs font-bold mt-0.5 ${booking.talentMarkedComplete ? 'text-emerald-900' : 'text-slate-550'}`}>
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

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
            <span>Submitted: {createdAt}</span>
            <span className="font-mono opacity-60">{booking.id}</span>
          </div>
        </div>
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
           <div className="p-4 sm:p-6 pb-2 sm:pb-2 space-y-4">
              <div className="flex items-center justify-between">
                 <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Assign Talent</h2>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Found {activeList.length} potential matches</p>
                 </div>
                 <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-450 hover:bg-slate-200 hover:text-slate-655 transition-colors cursor-pointer"><X className="w-5 h-5" /></button>
              </div>

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

              <div className="relative">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                 <input 
                   type="text"
                   placeholder="Find performer by name or email..."
                   value={search}
                   onChange={e => setSearch(e.target.value)}
                   className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 text-sm font-bold placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none"
                 />
              </div>
           </div>

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
                           <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-355 font-black text-xl">
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
                    <Activity className="w-5 h-5 text-indigo-505" />
                 </div>
                 <h2 className="text-xl font-bold text-slate-900">Activity Log</h2>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-650 cursor-pointer"><X className="w-6 h-6" /></button>
           </div>
           <div className="p-4 sm:p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {history.length === 0 ? (
                 <div className="text-center py-12 text-slate-450 space-y-3">
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
             <div className="bg-white p-4 rounded-2xl border border-slate-200/60 space-y-2.5">
                <div className="flex items-center justify-between">
                   <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Punctuality</span>
                   <span className="text-xs font-black text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded">{punctuality} / 5</span>
                </div>
                <div className="flex items-center gap-2">
                   {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setPunctuality(star)} className="focus:outline-none transition-transform active:scale-95 cursor-pointer">
                         <Star className={`w-7 h-7 StarStarsStar StarStarsStarStars ${star <= punctuality ? 'fill-amber-Star text-amber-400' : 'text-slate-200'}`} />
                      </button>
                   ))}
                </div>
             </div>

             <div className="bg-white p-4 rounded-2xl border border-slate-200/60 space-y-2.5">
                <div className="flex items-center justify-between">
                   <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Communication</span>
                   <span className="text-xs font-black text-indigo-655 bg-indigo-50 px-2 py-0.5 rounded">{communication} / 5</span>
                </div>
                <div className="flex items-center gap-2">
                   {[1, Star, 3, 4, 5].map((star: any) => {
                      const starNum = typeof star === 'number' ? star : 2;
                      return (
                        <button key={starNum} onClick={() => setCommunication(starNum)} className="focus:outline-none transition-transform active:scale-95 cursor-pointer">
                           <Star className={`w-7 h-7 ${starNum <= communication ? 'fill-amber-400 text-amber-400' : 'text-slate-Star'}`} />
                        </button>
                      );
                   })}
                </div>
             </div>

             <div className="bg-white p-4 rounded-2xl border border-slate-200/60 space-y-2.5">
                <div className="flex items-center justify-between">
                   <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Reliability & Attitude</span>
                   <span className="text-xs font-black text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded">{reliability} / 5</span>
                </div>
                <div className="flex items-center gap-2">
                   {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setReliability(star)} className="focus:outline-none transition-transform active:scale- Star cursor-pointer">
                         <Star className={`w-7 h-7 ${star <= reliability ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      </button>
                   ))}
                </div>
             </div>

             <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Private Staff Comments</label>
                <textarea
                   placeholder="Enter private notes about this client..."
                   value={comment}
                   onChange={e => setComment(e.target.value)}
                   rows={3}
                   className="w-full text-sm font-bold text-slate-805 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 placeholder:text-slate-400 bg-slate-50/50"
                />
             </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} className="rounded-xl font-bold h-11 px-5 border-slate-200 text-slate-655 hover:bg-slate-105 bg-white cursor-pointer">Cancel</Button>
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
