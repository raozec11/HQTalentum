"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, onSnapshot, arrayUnion, addDoc } from "firebase/firestore";
import {
  CalendarDays, Clock, MapPin, Briefcase, DollarSign, CheckCircle2,
  BellRing, Loader2, ChevronRight, Users, X, Check, Search, Calendar, LayoutGrid, GripVertical, FileText, Info, User, Star, Activity, Banknote, CreditCard, Smartphone, Gift
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notifications";
import { BookingChatButton } from "@/components/bookings/BookingChatButton";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";
import { EntityNotes } from "@/components/notes/EntityNotes";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Booking {
  id: string;
  status: string;
  companyId: string;
  talentId?: string;
  selectedTalentId?: string;
  applicants?: string[];
  createdAt: string;
  [key: string]: any;
}

// ─── Table Config ─────────────────────────────────────────────────────────────
const BASE_COLUMNS = [
  { id: "id", label: "Booking ID" },
  { id: "date", label: "Event Date" },
  { id: "address", label: "Venue Location" },
  { id: "jobType", label: "Requested Talent" },
  { id: "amount", label: "Budget" },
  { id: "status", label: "Booking Status" },
];

export function ClientBookingsView({ companyId, viewType }: { companyId: string, viewType: "pending" | "confirmed" | "history" | "cancelled" | "all" }) {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [talentsDict, setTalentsDict] = useState<Record<string, any>>({});
  
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [modalMode, setModalMode] = useState<"details" | "applicants" | "rate_talent" | null>(null);
  const [chatBooking, setChatBooking] = useState<Booking | null>(null);
  const [noteEntity, setNoteEntity] = useState<{ id: string; type: "talent" | "client"; name: string } | null>(null);

  const [availableColumns, setAvailableColumns] = useState<typeof BASE_COLUMNS>(BASE_COLUMNS);
  const [columns, setColumns] = useState<string[]>(BASE_COLUMNS.map(c => c.id));
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [draggedColId, setDraggedColId] = useState<string | null>(null);



  // Real-time listener cleanup
  const [unsubscribeBookings, setUnsubscribeBookings] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!user) return;

    const savedColsStr = localStorage.getItem(`talentum_client_cols_${user.uid}`);
    if (savedColsStr) {
       const savedCols = JSON.parse(savedColsStr);
       const validCols = savedCols.filter((colId: string) => BASE_COLUMNS.some(dc => dc.id === colId));
       if (validCols.length > 0) setColumns(validCols);
    }

    loadAll();

    // Cleanup listener on unmount
    return () => {
      unsubscribeBookings?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const ids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));

      // ── Real-time listener so "Review Applicants" appears instantly ──
      const clientQueries: any[] = [];
      const userEmail = user.email || "";

      ids.forEach(id => {
        // Query by clientId
        clientQueries.push(
          query(
            collection(db, "bookings"),
            where("companyId", "==", id),
            where("clientId", "==", user.uid)
          )
        );
        // Query by clientEmail if exists
        if (userEmail) {
          clientQueries.push(
            query(
              collection(db, "bookings"),
              where("companyId", "==", id),
              where("clientEmail", "==", userEmail)
            )
          );
        }
      });

      const results: Record<number, Booking[]> = {};
      const initialized = new Set<number>();

      const unsubs = clientQueries.map((q, index) =>
        onSnapshot(q, (snap) => {
          results[index] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
          initialized.add(index);

          if (initialized.size === clientQueries.length) {
            // Merge all results
            const bookingMap = new Map<string, Booking>();
            Object.values(results).forEach(list => {
              list.forEach(b => bookingMap.set(b.id, b));
            });

            const data = Array.from(bookingMap.values());
            data.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

            // Auto-link guest bookings (matching clientEmail but without clientId or with different clientId) to user.uid
            data.forEach(async (b) => {
              if (
                b.clientEmail && 
                user.email && 
                b.clientEmail.toLowerCase() === user.email.toLowerCase() && 
                (!b.clientId || b.clientId === "guest" || b.clientId !== user.uid)
              ) {
                try {
                  await updateDoc(doc(db, "bookings", b.id), {
                    clientId: user.uid
                  });
                  console.log(`Auto-linked booking ${b.id} to client UID ${user.uid}`);
                } catch (err) {
                  console.error(`Failed to auto-link booking ${b.id}:`, err);
                }
              }
            });

            setBookings(data);
            setLoading(false);

            // Fetch talent profiles for any new UIDs
            const uids = new Set<string>();
            data.forEach(b => {
              if (b.talentId) uids.add(b.talentId);
              if (b.selectedTalentId) uids.add(b.selectedTalentId);
              if (b.applicants) b.applicants.forEach((uid: string) => uids.add(uid));
            });
            fetchTalentProfiles(Array.from(uids));
          }
        }, (err) => {
          console.error("Booking listener error:", err);
          initialized.add(index);
          if (initialized.size === clientQueries.length) setLoading(false);
        })
      );
      const cleanup = () => unsubs.forEach(u => u());
      setUnsubscribeBookings(() => cleanup);

    } catch (err) {
      console.error("Error loading bookings:", err);
      setLoading(false);
    }
  };

  // Fetch talent profiles for applicants, selected, etc.
  const fetchTalentProfiles = async (uids: string[]) => {
    if (!uids.length) return;
    const dict: Record<string, any> = {};
    await Promise.all(uids.map(async (uid) => {
       const [userSnap, talentSnap] = await Promise.all([
         getDoc(doc(db, "users", uid)),
         getDoc(doc(db, "talents", uid))
       ]);
       if (userSnap.exists() || talentSnap.exists()) {
         const userData = userSnap.data() || {};
         const talentData = talentSnap.data() || {};
         dict[uid] = {
           ...userData,
           ...talentData,
           displayName: talentData.displayName || talentData.name || userData.name || userData.displayName || "Unknown Talent",
           profileImage: talentData.photoUrl || talentData.profileImage || userData.photoUrl || userData.profileImage || null,
           locations: talentData.locations || userData.locations || (userData.city ? [userData.city] : []),
           talentType: talentData.talentType || userData.talentType || "Performer"
         };
       }
    }));
    setTalentsDict(prev => ({ ...prev, ...dict }));
  };

  const saveColumns = (newCols: string[]) => { setColumns(newCols); if (user) localStorage.setItem(`talentum_client_cols_${user.uid}`, JSON.stringify(newCols)); };
  const toggleColumn = (colId: string) => saveColumns(columns.includes(colId) ? columns.filter(c => c !== colId) : [...columns, colId]);
  const handleDragStart = (e: React.DragEvent, colId: string) => { setDraggedColId(colId); e.dataTransfer.effectAllowed = "move"; };
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

  const handleSelectTalent = async (bookingId: string, talentUid: string) => {
    setActing(bookingId);
    try {
      const targetBooking = bookings.find(b => b.id === bookingId);
      if (!targetBooking) return;

      const limit = parseInt(targetBooking.noOfEntertainers || targetBooking.numEntertainers || 1);
      const currentSelected = targetBooking.selectedTalentIds || (targetBooking.selectedTalentId ? [targetBooking.selectedTalentId] : []);
      
      if (currentSelected.includes(talentUid)) return;
      if (currentSelected.length >= limit) {
         showError(`You have already reached the maximum limit of ${limit} entertainers for this booking.`);
         return;
      }

      const newIds = [...currentSelected, talentUid];
      const newStatus = newIds.length >= limit ? "Selected" : targetBooking.status || "Pending";

      const customOffer = targetBooking.customOffers?.[talentUid];
      const updates: any = {
        selectedTalentIds: newIds,
        selectedTalentId: newIds[0] || null,
        status: newStatus
      };

      const historyEntry: any = {
        type: 'assigned',
        talentId: talentUid,
        at: new Date().toISOString(),
        clientName: user?.displayName || user?.email || "Client"
      };

      if (customOffer && limit === 1) {
        const changes: string[] = [];
        
        const formatTime = (t: string) => {
          try {
             return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${t}`));
          } catch (e) {
             return t;
          }
        };

        const formatDate = (d: string) => {
          try {
             return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(d));
          } catch (e) {
             return d;
          }
        };

        const hasDateChange = customOffer.proposedDate && customOffer.proposedDate !== targetBooking.eventDate;
        const hasTimeChange = customOffer.proposedTime && customOffer.proposedTime !== targetBooking.eventTime;
        const hasRateChange = customOffer.proposedRate && customOffer.proposedRate !== targetBooking.payRate;

        if (hasDateChange) {
          changes.push(`
            <div style="display:flex; flex-direction:column; align-items:center; padding: 6px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Date</span>
              <div style="display:flex; align-items:center; gap: 8px; margin-top: 4px;">
                <span style="font-size: 12px; text-decoration: line-through; color: #94a3b8; font-weight: 600;">${formatDate(targetBooking.eventDate)}</span>
                <span style="font-size: 12px; font-weight: 700; color: #64748b;">&rarr;</span>
                <span style="font-size: 14px; font-weight: 800; color: #b45309;">${formatDate(customOffer.proposedDate)}</span>
              </div>
            </div>
          `);
        }
        if (hasTimeChange) {
          changes.push(`
            <div style="display:flex; flex-direction:column; align-items:center; padding: 6px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Time</span>
              <div style="display:flex; align-items:center; gap: 8px; margin-top: 4px;">
                <span style="font-size: 12px; text-decoration: line-through; color: #94a3b8; font-weight: 600;">${formatTime(targetBooking.eventTime)}</span>
                <span style="font-size: 12px; font-weight: 700; color: #64748b;">&rarr;</span>
                <span style="font-size: 14px; font-weight: 800; color: #b45309;">${formatTime(customOffer.proposedTime)}</span>
              </div>
            </div>
          `);
        }
        if (hasRateChange) {
          changes.push(`
            <div style="display:flex; flex-direction:column; align-items:center; padding: 6px 0; border-bottom: 0;">
              <span style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Pay Rate</span>
              <div style="display:flex; align-items:center; gap: 8px; margin-top: 4px;">
                <span style="font-size: 12px; text-decoration: line-through; color: #94a3b8; font-weight: 600;">$${targetBooking.payRate}</span>
                <span style="font-size: 12px; font-weight: 700; color: #64748b;">&rarr;</span>
                <span style="font-size: 14px; font-weight: 800; color: #047857;">$${customOffer.proposedRate}</span>
              </div>
            </div>
          `);
        }

        if (changes.length > 0) {
          const confirmed = await confirmAction({
            title: "Accept Custom Offer?",
            html: `
              <div style="text-align: left;">
                <p style="font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 12px;">
                  This talent has proposed different terms. If you select them, your booking logistics and pay rate will automatically update to match their proposal:
                </p>
                <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 16px; padding: 16px; margin-bottom: 12px;">
                  ${changes.join("")}
                </div>
                <p style="font-size: 12px; color: #e11d48; font-weight: 700; margin-top: 12px;">
                  Note: Your booking details will be updated instantly and you will pay $${customOffer.proposedRate || targetBooking.payRate} now.
                </p>
              </div>
            `,
            icon: "warning",
            confirmButtonText: "Accept & Update Booking",
            cancelButtonText: "Cancel"
          });
          if (!confirmed) return;

          if (customOffer.proposedDate) updates.eventDate = customOffer.proposedDate;
          if (customOffer.proposedTime) updates.eventTime = customOffer.proposedTime;
          if (customOffer.proposedRate) updates.payRate = customOffer.proposedRate;

          historyEntry.customTerms = {
            proposedDate: customOffer.proposedDate || null,
            proposedTime: customOffer.proposedTime || null,
            proposedRate: customOffer.proposedRate || null,
            originalDate: targetBooking.eventDate || null,
            originalTime: targetBooking.eventTime || null,
            originalRate: targetBooking.payRate || null
          };
        }
      }

      updates.assignmentHistory = arrayUnion(historyEntry);

      await updateDoc(doc(db, "bookings", bookingId), updates);
      
      // Add system message to booking chat
      try {
        const talentName = talentsDict[talentUid]?.displayName || "Talent";
        const chatRef = doc(db, "chats", bookingId);
        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) {
          await setDoc(chatRef, {
            bookingId: bookingId,
            companyId: targetBooking.companyId || companyId,
            createdAt: new Date().toISOString(),
            lastMessageText: `${talentName} Connected`,
            lastSenderId: "system",
            lastMessageAt: new Date().toISOString(),
            lastRead: {}
          });
        }
        await addDoc(collection(db, "chats", bookingId, "messages"), {
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
      } catch (chatErr) {
        console.error("Failed to post system message to chat:", chatErr);
      }
      
      await sendNotification({
        userId: talentUid,
        companyId,
        recipientEmail: talentsDict[talentUid]?.email || "",
        title: "Selected for Gig!",
        message: `You have been selected for booking #${bookingId.substring(0, 8)}. Please confirm your availability in your offers tab!`,
        type: "success",
        link: `/${companyId}/dashboard/talent/bookings?tab=offers`
      });

      // Send selection confirmation & payment instruction to client ONLY when all required talents are selected
      const isAllSelected = newIds.length >= limit;
      if (isAllSelected && targetBooking.clientId && targetBooking.clientId !== "guest") {
        await sendNotification({
          userId: targetBooking.clientId,
          companyId,
          recipientEmail: targetBooking.clientEmail || "",
          title: "Your invoice is pending",
          message: `All required performers have been selected for your event! Please complete the invoice payment of $${updates.payRate || targetBooking.payRate || targetBooking.__budget || 0} to finalize this booking.`,
          type: "info",
          link: `/${companyId}/dashboard/client/payment/${bookingId}`
        });
      }
      
      const localUpdatedBooking = {
         ...targetBooking,
         ...updates,
         assignmentHistory: [...(targetBooking.assignmentHistory || []), historyEntry]
      };

      setBookings(prev => prev.map(b => b.id === bookingId ? localUpdatedBooking : b));
      if (selectedBooking && selectedBooking.id === bookingId) {
         setSelectedBooking(localUpdatedBooking);
      }
    } catch(err) {
      console.error(err);
      showError("Failed to offer gig to talent. Try again.");
    } finally {
      setActing(null);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    const confirmed = await confirmAction({
      title: "Cancel Booking?",
      text: "Are you sure you want to cancel this booking? This action cannot be undone.",
      icon: "warning",
      confirmButtonText: "Yes, cancel it",
      cancelButtonText: "No, keep it"
    });
    if (!confirmed) return;

    setActing(bookingId);
    try {
      await updateDoc(doc(db, "bookings", bookingId), {
        status: "Cancelled"
      });

      // Close chat session in Firestore and add system message
      try {
        const chatRef = doc(db, "chats", bookingId);
        await setDoc(chatRef, {
          status: "Cancelled",
          isClosed: true,
          lastMessageText: "Booking has been cancelled by client.",
          lastSenderId: "system",
          lastMessageAt: new Date().toISOString()
        }, { merge: true });

        await addDoc(collection(db, "chats", bookingId, "messages"), {
          text: "Booking has been cancelled by client. Chat session is now closed.",
          senderId: "system",
          senderName: "System",
          senderRole: "system",
          createdAt: new Date().toISOString()
        });
      } catch (chatErr) {
        console.error("Failed to update chat doc on client cancellation:", chatErr);
      }

      const targetBooking = bookings.find(b => b.id === bookingId);
      if (targetBooking) {
        // Only notify talents who applied / showed interest
        const applicantIds: string[] = targetBooking.applicants || [];

        await Promise.all(applicantIds.map(talentUid =>
          sendNotification({
            userId: talentUid,
            companyId,
            title: "Booking Cancelled",
            message: `A booking you applied for (#${bookingId.substring(0, 8).toUpperCase()}) has been cancelled by the client.`,
            type: "error",
            link: `/${companyId}/dashboard/talent/bookings?tab=complete`
          })
        ));

        // Notify company admins
        await sendNotificationToAdmins(companyId, {
          title: "Booking Cancelled by Client",
          message: `Client has cancelled booking #${bookingId.substring(0, 8).toUpperCase()}.`,
          type: "alert",
          link: `/${companyId}/dashboard/admin/bookings/cancelled`
        });
      }

      showSuccess("Booking has been cancelled successfully.");
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: "Cancelled" } : b));
      if (selectedBooking && selectedBooking.id === bookingId) {
        setSelectedBooking(prev => prev ? { ...prev, status: "Cancelled" } : null);
      }
    } catch (err) {
      console.error(err);
      showError("Failed to cancel booking. Try again.");
    } finally {
      setActing(null);
    }
  };

  const pendingBookings = bookings.filter(b => !b.status || !["Confirmed", "Completed", "Cancelled"].includes(b.status));
  const confirmedBookings = bookings.filter(b => b.status === "Confirmed");
  const cancelledBookings = bookings.filter(b => b.status === "Cancelled");
  const historyBookings = bookings.filter(b => ["Completed"].includes(b.status));

  const dataset = 
    viewType === "pending" ? pendingBookings : 
    viewType === "confirmed" ? confirmedBookings : 
    viewType === "cancelled" ? cancelledBookings :
    viewType === "history" ? historyBookings : 
    bookings;

  const filteredBookings = dataset.filter(b => {
    let fullText = Object.values(b).map(val => val && typeof val === 'object' ? JSON.stringify(val) : String(val)).join(" ") + ` ${b.id}`;
    return fullText.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const totalPages = Math.ceil(filteredBookings.length / itemsPerPage) || 1;
  const paginatedBookings = filteredBookings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => { setCurrentPage(1) }, [searchQuery, viewType]);

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
             <p className="text-xs font-black text-indigo-600 uppercase tracking-widest leading-none mt-1">Client Dashboard</p>
           </div>
           <h1 className="text-[32px] md:text-[40px] font-black text-slate-900 tracking-tight leading-none">
             {viewType === "pending" && "Pending Bookings"}
             {viewType === "confirmed" && "Confirmed Bookings"}
             {viewType === "cancelled" && "Cancelled Bookings"}
             {viewType === "history" && "Booking History"}
             {viewType === "all" && "All Bookings"}
           </h1>
        </div>
        <Button onClick={() => router.push(`/${companyId}/dashboard/client/bookings/new`)} className="bg-slate-900 text-white rounded-xl h-11 px-6 font-bold shadow-sm hover:bg-indigo-600 transition-all">
           Request New Talent
        </Button>
      </div>



      {!loading && dataset.length > 0 && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200/60 relative z-10 w-full">
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 w-full max-w-[400px] transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400">
            <Search className="w-5 h-5 text-indigo-400" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none focus:ring-0 text-[15px] flex-1 outline-none text-slate-800 bg-transparent placeholder:text-slate-400 font-medium w-full"
            />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600 bg-slate-200/50 rounded-full p-1"><X className="w-4 h-4" /></button>}
          </div>

          <div className="relative z-30 flex justify-end">
             <Button 
                variant="outline" 
                onClick={() => setShowColumnConfig(!showColumnConfig)}
                className={`h-[46px] px-5 rounded-xl font-bold shadow-sm transition-all border-slate-200 ${showColumnConfig ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                <LayoutGrid className="w-4 h-4 mr-2" /> Settings
              </Button>

              {showColumnConfig && (
                <div className="absolute right-0 top-14 w-[280px] sm:w-[300px] max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 z-40 animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-200">
                    <h3 className="text-sm font-black text-slate-800">Layout Settings</h3>
                    <button onClick={() => setShowColumnConfig(false)} className="text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-full"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {columns.map(colId => {
                      const colDef = availableColumns.find(c => c.id === colId);
                      if (!colDef) return null;
                      return (
                        <div key={colId} draggable onDragStart={(e) => handleDragStart(e, colId)} onDragOver={(e) => handleDragOver(e, colId)} onDragEnd={handleDragEnd} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-slate-100 shadow-sm cursor-grab">
                          <label className="flex items-center gap-3 cursor-pointer pointer-events-none">
                            <input type="checkbox" checked readOnly className="rounded border-slate-300 text-indigo-600 w-4 h-4 pointer-events-auto" onClick={() => toggleColumn(colId)} />
                            <span className="text-sm font-bold text-slate-700">{colDef.label}</span>
                          </label>
                          <GripVertical className="w-4 h-4 text-slate-300" />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
          </div>
        </div>
      )}

      {loading ? (
        <Card className="flex flex-col items-center justify-center py-32 rounded-3xl border-slate-200/60 shadow-sm bg-white/50"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" /><p className="text-sm font-black text-slate-400 uppercase tracking-widest text-center">Loading Bookings...</p></Card>
      ) : dataset.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-16 rounded-3xl border border-dashed border-slate-300 bg-slate-50/50">
           <p className="text-lg font-black text-slate-800 mb-1">No bookings found</p>
           <Button onClick={() => router.push(`/${companyId}/directory`)} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 px-6 font-bold shadow-sm">Request Talent</Button>
        </Card>
      ) : (
        <Card className="overflow-hidden border-slate-200/60 shadow-md rounded-3xl bg-white">
          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b-2 border-slate-100 bg-[#fbfcfd]">
                  {columns.map(colId => {
                     const colDef = availableColumns.find(c => c.id === colId);
                     return <th key={colId} className="py-3 px-4 text-[11px] font-black text-slate-400 uppercase tracking-[0.1em] whitespace-nowrap">{colDef?.label}</th>
                  })}
                  <th className="py-3 px-4 text-[11px] font-black text-slate-400 uppercase tracking-[0.1em] text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 bg-white">
                {paginatedBookings.map((booking) => {
                  const jobType = booking.jobType || booking.__jobType || "Unspecified";
                  const status = booking.status || "Pending";
                  const rawDate = booking.eventDate || "";
                  const rawTime = booking.eventTime || "";
                  
                  let dateInfo = "Not set";
                  let timeInfo = "";
                  try {
                    if (rawDate) dateInfo = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(rawDate));
                    if (rawTime) timeInfo = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${rawTime}`));
                  } catch (e) {}

                  const address = booking.address || booking.__address || `${booking.city}, ${booking.state}` || "Not specified";
                  const amount = booking.payRate ? `$${booking.payRate}` : "-";
                  const applicantsCount = booking.applicants?.length || 0;
                  const isAwaiting = booking.paymentStatus === 'Awaiting Approval' || status.toLowerCase() === 'awaiting approval';

                  return (
                    <tr key={booking.id} className="hover:bg-slate-50 transition-all group">
                      {columns.map(colId => {
                         if (colId === "id") return <td key={colId} className="py-3.5 px-4"><span className="text-[12px] font-bold font-mono text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">ID:{booking.id.slice(0,8)}</span></td>;
                         if (colId === "date") return <td key={colId} className="py-3.5 px-4"><div className="flex flex-col"><span className="text-[13px] font-bold text-slate-700">{dateInfo}</span>{timeInfo && <span className="text-[11px] font-semibold text-slate-400 mt-0.5 uppercase">{timeInfo}</span>}</div></td>;
                         if (colId === "address") return <td key={colId} className="py-3.5 px-4 min-w-[200px]"><p className="text-[13px] font-semibold text-slate-600 line-clamp-1">{address}</p></td>;
                         if (colId === "jobType") return <td key={colId} className="py-3.5 px-4 min-w-[150px]"><span className="text-[13px] font-bold text-slate-800 bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-sm">{jobType}</span></td>;
                         if (colId === "amount") return <td key={colId} className="py-3.5 px-4"><span className="text-[13px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/50">{amount}</span></td>;
                         
                         if (colId === "status") return (
                            <td key={colId} className="py-3.5 px-4 whitespace-nowrap">
                               <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm ${
                                  isAwaiting ? 'bg-orange-50 text-orange-600 border-orange-200' :
                                  status === 'Pending' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                  status === 'Reviewing' || applicantsCount > 0 ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                  status === 'Selected' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' :
                                  status === 'Confirmed' ? 'bg-green-50 text-green-600 border-green-200' :
                                  status === 'Assigned' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                  'bg-slate-50 text-slate-600 border-slate-200'
                               }`}>
                                  {isAwaiting ? "Payment Approval" :
                                   (status === 'Pending' && applicantsCount === 0) ? "Pending Broadcast" : 
                                   (status === 'Pending' && applicantsCount > 0) ? "Action Required" :
                                   status === 'Assigned' ? "Pending Payment" :
                                   status}
                               </span>
                            </td>
                         );
                         const val = booking[colId];
                         return <td key={colId} className="py-3.5 px-4"><span className="text-[13px] font-semibold text-slate-600 line-clamp-1">{val || "-"}</span></td>;
                      })}

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex gap-2 justify-end">
                            {booking.status === "Confirmed" && (
                              <Button 
                                onClick={() => { setSelectedBooking(booking); setModalMode("rate_talent"); }} 
                                className="h-8 px-3 rounded-md text-[12px] font-black bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                              >
                                Mark Completed
                              </Button>
                            )}
                            {(() => {
                              const limit = parseInt(booking.noOfEntertainers || booking.numEntertainers || "0") || 0;
                              const currentSelected = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
                              
                              if (["Confirmed", "Completed", "Cancelled"].includes(booking.status)) {
                                return null;
                              }

                              if (booking.status === "Selected" || booking.status === "Assigned") {
                                if (isAwaiting) {
                                  return (
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 text-orange-600 border border-orange-200 shadow-sm animate-pulse">
                                      Awaiting Approval
                                    </span>
                                  );
                                }
                                return (
                                  <Button 
                                    onClick={() => router.push(`/${companyId}/dashboard/client/payment/${booking.id}`)} 
                                    className="h-8 px-3 rounded-md text-[12px] font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm animate-pulse"
                                  >
                                    Pay Now
                                  </Button>
                                );
                              }

                              if (applicantsCount > 0) {
                                return (
                                  <Button 
                                    onClick={() => { setSelectedBooking(booking); setModalMode("applicants"); }} 
                                    className="h-8 px-3 rounded-md text-[12px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm animate-pulse"
                                  >
                                     Review Applicants ({applicantsCount})
                                  </Button>
                                );
                              }
                              return null;
                            })()}
                            <BookingChatButton 
                              bookingId={booking.id} 
                              userId={user?.uid || ""} 
                              onClick={() => setChatBooking(booking)}
                            />
                           <Button onClick={() => { setSelectedBooking(booking); setModalMode("details"); }} variant="outline" className="h-8 px-3 rounded-md text-[12px] font-bold border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm">
                             Details
                           </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards List View */}
          <div className="block sm:hidden p-4 space-y-4 bg-slate-50/50">
            {paginatedBookings.map((booking) => {
              const jobType = booking.jobType || booking.__jobType || "Unspecified";
              const status = booking.status || "Pending";
              const rawDate = booking.eventDate || "";
              const rawTime = booking.eventTime || "";
              
              let dateInfo = "Not set";
              let timeInfo = "";
              try {
                if (rawDate) dateInfo = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(rawDate));
                if (rawTime) timeInfo = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${rawTime}`));
              } catch (e) {}

              const address = booking.address || booking.__address || `${booking.city}, ${booking.state}` || "Not specified";
              const amount = booking.payRate ? `$${booking.payRate}` : "-";
              const applicantsCount = booking.applicants?.length || 0;
              const isAwaiting = booking.paymentStatus === 'Awaiting Approval' || status.toLowerCase() === 'awaiting approval';

              // Status colors and borders
              let statusColor = "bg-slate-50 text-slate-500 border-slate-100";
              let leftBorderColor = "border-l-slate-300";
              
              if (isAwaiting) {
                statusColor = "bg-orange-50 text-orange-600 border-orange-200";
                leftBorderColor = "border-l-orange-500";
              } else if (status === 'Pending' && applicantsCount === 0) {
                statusColor = "bg-amber-50 text-amber-600 border-amber-200";
                leftBorderColor = "border-l-amber-500";
              } else if (status === 'Pending' && applicantsCount > 0) {
                statusColor = "bg-blue-50 text-blue-600 border-blue-200 animate-pulse";
                leftBorderColor = "border-l-blue-500";
              } else if (status === 'Selected') {
                statusColor = "bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse";
                leftBorderColor = "border-l-indigo-500";
              } else if (status === 'Confirmed') {
                statusColor = "bg-green-50 text-green-700 border-green-200";
                leftBorderColor = "border-l-emerald-500";
              } else if (status === 'Assigned') {
                statusColor = "bg-blue-50 text-blue-700 border-blue-200";
                leftBorderColor = "border-l-blue-500";
              } else if (status === 'Completed') {
                statusColor = "bg-blue-50 text-blue-700 border-blue-100";
                leftBorderColor = "border-l-blue-500";
              } else if (status === 'Cancelled') {
                statusColor = "bg-rose-50 text-rose-700 border-rose-100";
                leftBorderColor = "border-l-rose-500";
              }

              return (
                <div 
                  key={booking.id}
                  className={`bg-white border border-slate-200/60 border-l-4 ${leftBorderColor} p-5 rounded-[22px] shadow-sm hover:shadow-md transition-all space-y-4`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded">
                        ID: {booking.id.slice(0, 8).toUpperCase()}
                      </span>
                      <h3 className="text-sm font-black text-slate-800 pt-1 leading-tight">{jobType}</h3>
                    </div>
                    <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border shadow-sm ${statusColor}`}>
                      {isAwaiting ? "Payment Approval" :
                       (status === 'Pending' && applicantsCount === 0) ? "Pending Broadcast" : 
                       (status === 'Pending' && applicantsCount > 0) ? "Action Required" :
                       status === 'Assigned' ? "Pending Payment" :
                       status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 pt-2 pb-2 text-xs font-semibold text-slate-500 border-t border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span>{dateInfo} {timeInfo && `@ ${timeInfo}`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                      <span className="truncate">{address}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Budget</span>
                      <span className="text-sm font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200/50">{amount}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    {booking.status === "Confirmed" && (
                      <Button 
                        onClick={() => { setSelectedBooking(booking); setModalMode("rate_talent"); }} 
                        className="h-9 px-4 rounded-xl text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                      >
                        Mark Completed
                      </Button>
                    )}
                    {(() => {
                      if (["Confirmed", "Completed", "Cancelled"].includes(booking.status)) {
                        return null;
                      }

                      if (booking.status === "Selected" || booking.status === "Assigned") {
                        if (isAwaiting) {
                          return (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 text-orange-600 border border-orange-200 shadow-sm">
                              Awaiting Approval
                            </span>
                          );
                        }
                        return (
                          <Button 
                            onClick={() => router.push(`/${companyId}/dashboard/client/payment/${booking.id}`)} 
                            className="h-9 px-4 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                          >
                            Pay Now
                          </Button>
                        );
                      }

                      if (applicantsCount > 0) {
                        return (
                          <Button 
                            onClick={() => { setSelectedBooking(booking); setModalMode("applicants"); }} 
                            className="h-9 px-4 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                          >
                            Review Applicants ({applicantsCount})
                          </Button>
                        );
                      }
                      return null;
                    })()}
                    <BookingChatButton 
                      bookingId={booking.id} 
                      userId={user?.uid || ""} 
                      onClick={() => setChatBooking(booking)}
                    />
                    <Button 
                      onClick={() => { setSelectedBooking(booking); setModalMode("details"); }} 
                      variant="outline" 
                      className="h-9 px-4 rounded-xl text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm"
                    >
                      Details
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-[#fbfcfd] flex flex-col sm:flex-row items-center justify-between gap-4 rounded-b-3xl">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                Showing {Math.min(filteredBookings.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(filteredBookings.length, currentPage * itemsPerPage)} of {filteredBookings.length} Bookings
              </span>
              <div className="flex items-center gap-3">
                <Button 
                  disabled={currentPage === 1} 
                  onClick={() => setCurrentPage(p => p - 1)} 
                  variant="outline"
                  className="h-9 px-4 rounded-xl text-xs font-black border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
                >
                  Prev
                </Button>
                <span className="text-xs font-black text-slate-700 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                  Page {currentPage} of {totalPages}
                </span>
                <Button 
                  disabled={currentPage === totalPages} 
                  onClick={() => setCurrentPage(p => p + 1)} 
                  variant="outline"
                  className="h-9 px-4 rounded-xl text-xs font-black border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>

    {selectedBooking && modalMode !== "rate_talent" && (
      <ClientBookingDetailsModal 
        booking={selectedBooking} 
        mode={modalMode}
        userId={user?.uid || ""}
        onChat={() => { setChatBooking(selectedBooking); setSelectedBooking(null); setModalMode(null); }}
        talentsDict={talentsDict}
        onSelect={handleSelectTalent}
        onCancel={handleCancelBooking}
        onMarkCompleted={() => { setModalMode("rate_talent"); }}
        acting={!!acting}
        onClose={() => { setSelectedBooking(null); setModalMode(null); }} 
        onViewNotes={(id: string, type: "talent" | "client", name: string) => setNoteEntity({ id, type, name })}
      />
    )}
    
    {noteEntity && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setNoteEntity(null)}>
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden relative border border-slate-200" onClick={e => e.stopPropagation()}>
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <h3 className="font-black text-slate-800 text-base">Notes on {noteEntity.name}</h3>
            <button onClick={() => setNoteEntity(null)} className="text-slate-400 hover:text-slate-700 bg-slate-200/50 p-2 rounded-full"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5 bg-white">
            <EntityNotes 
              companyId={companyId}
              entityId={noteEntity.id}
              entityType={noteEntity.type as any}
              title={`Internal Notes`}
              placeholder={`Add an internal note about this ${noteEntity.type}...`}
            />
          </div>
        </div>
      </div>
    )}
    
    {chatBooking && (
      <BookingChatModal 
        booking={chatBooking} 
        user={user} 
        onClose={() => setChatBooking(null)} 
      />
    )}

    {selectedBooking && modalMode === "rate_talent" && (
      <ClientRateTalentModal
        booking={selectedBooking}
        companyId={companyId}
        onClose={() => { setSelectedBooking(null); setModalMode(null); }}
        onCompleted={(updatedBooking) => {
          setBookings(prev => prev.map(b => b.id === updatedBooking.id ? updatedBooking : b));
          setSelectedBooking(null);
          setModalMode(null);
        }}
      />
    )}
    </>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function ClientBookingDetailsModal({ booking, mode, userId, onChat, talentsDict, onSelect, onCancel, onMarkCompleted, acting, onClose, onViewNotes }: any) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const rawDeclined = booking.declinedTalentIds || [];
  const historyDeclined = (booking.assignmentHistory || [])
    ?.filter((h: any) => h.type === "declined" && h.talentId)
    ?.map((h: any) => h.talentId) || [];
  const allDeclinedUids = Array.from(new Set([...rawDeclined, ...historyDeclined])) as string[];
  const applicants = Array.from(new Set([...(booking.applicants || []), ...allDeclinedUids]));
  const status = booking.status || "Pending";
  
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
  
  const filteredApplicants = applicants.filter((uid: string) => {
     const t = talentsDict[uid];
     if (!t) return false;
     const text = `${t.name||''} ${t.firstName||''} ${t.lastName||''} ${t.talentType||''} ${t.skills?.join(' ')||''}`.toLowerCase();
     return text.includes(searchQuery.toLowerCase());
  });
  
  const isAwaiting = booking.paymentStatus === 'Awaiting Approval' || status.toLowerCase() === 'awaiting approval';
  const STEPS = [
    { key: "Inquiry",         label: "Inquiry",         color: "#4f46e5" },
    { key: "Pending",         label: "Pending Search",  color: "#6366f1" },
    { key: "Talent Assigned", label: "Talent Found",    color: "#3b82f6" },
    { key: "Pending Payment", label: isAwaiting ? "Awaiting Approval" : "Pending Payment", color: isAwaiting ? "#f97316" : "#0ea5e9" },
    { key: "Confirmed",       label: "Confirmed",       color: "#2563eb" },
    { key: "Completed",       label: "Completed",       color: "#1e3a8a" },
  ];

  let mappedStatus = "Inquiry";
  const sLow = status.toLowerCase();
  
  if (sLow === 'completed') mappedStatus = "Completed";
  else if (sLow === 'confirmed') mappedStatus = "Confirmed";
  else if (isAwaiting) mappedStatus = "Pending Payment";
  else if (sLow === 'deposit paid' || sLow === 'pending payment') mappedStatus = "Pending Payment";
  else if (['assigned', 'selected', 'reviewing', 'talent assigned'].includes(sLow) || booking.selectedTalentId || (booking.selectedTalentIds && booking.selectedTalentIds.length > 0)) mappedStatus = "Pending Payment";
  else if (['pending'].includes(sLow)) mappedStatus = "Pending";

  const currentStepIdx = Math.max(0, STEPS.findIndex(s => s.key === mappedStatus));

  const getVal = (keys: string[]) => {
    for (const k of keys) if (booking[k]) return booking[k];
    return "";
  };

  const date = getVal(['eventDate']) || booking.date;
  const time = getVal(['eventTime']);
  const duration = getVal(['duration']);
  const jobType = getVal(['jobType', '__jobType']);
  const gender = getVal(['gender', '__gender']);
  const numEntertainers = getVal(['numEntertainers']);
  const payRate = getVal(['payRate']) || booking.__budget;
  const address = getVal(['address', '__address']);
  const city = getVal(['city', '__city']) || booking.city || "";
  const state = getVal(['state', '__state']) || booking.state || "";
  const locationDetails = [address, city, state].filter(Boolean).join(", ");

  return (
    <div 
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-slate-50 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        
        {mode === 'applicants' ? (
          <div className="px-6 py-5 flex items-center justify-between bg-slate-900 shrink-0">
            <div className="flex items-center gap-4">
              <h2 className="text-white font-black text-xl">Applicant Review #{booking.id.slice(0,8)}</h2>
              <span className="bg-white/10 text-white px-2 py-1 text-xs font-bold uppercase rounded-md tracking-wider">{status}</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowActivity(true)} className="flex items-center gap-1.5 text-xs font-bold text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors">
                <Activity className="w-4 h-4" /> Activity Log
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5 flex items-center justify-between shrink-0" style={{ background: `linear-gradient(135deg, #4f46e5, #2563eb)` }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-white font-black text-xl" style={{ background: 'rgba(255,255,255,0.18)' }}>
                <Briefcase className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-white font-black text-xl leading-tight">Event Details</h2>
                <p className="text-white/60 text-xs font-mono mt-0.5 tracking-widest">#{booking.id.slice(0,10).toUpperCase()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowActivity(true)} className="flex items-center gap-1.5 text-xs font-bold text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors mr-2">
                <Activity className="w-4 h-4" /> Activity Log
              </button>
              <span className="text-[11px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest hidden sm:inline-block" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
                {isAwaiting ? "Pending Payment Approval" : status}
              </span>
              <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 hover:text-white transition-colors" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {mode === 'details' && (
          <div className="px-8 pt-5 pb-4 bg-white border-b border-slate-100 shrink-0">
            <div className="flex items-start justify-between">
              {STEPS.map((step, i) => {
                const isDone    = i < currentStepIdx;
                const isCurrent = i === currentStepIdx;
                const dotColor  = (isDone || isCurrent) ? step.color : '#cbd5e1';
                const labelColor = isCurrent ? step.color : isDone ? '#64748b' : '#94a3b8';
                return (
                  <div key={step.key} className="flex flex-col items-center flex-1 min-w-0 relative">
                    {i > 0 && <div className="absolute top-[14px] right-[50%] h-[2px] w-full" style={{ left: '-50%', right: '50%', background: isDone ? step.color : '#e2e8f0', zIndex: 0 }} />}
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 relative z-10 shadow-sm transition-all" style={{ background: isCurrent ? step.color : isDone ? step.color : '#f1f5f9', border: `2px solid ${dotColor}` }}>
                      {isDone ? <CheckCircle2 className="w-4 h-4 text-white" /> : isCurrent ? <span className="w-2.5 h-2.5 rounded-full bg-white" /> : <span className="text-[10px] font-black" style={{ color: '#94a3b8' }}>{i + 1}</span>}
                    </div>
                    <span className="mt-2 text-center leading-tight font-black text-[10px] uppercase tracking-wider px-1" style={{ color: labelColor, maxWidth: 72 }}>{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="overflow-y-auto custom-scrollbar flex-1 p-6 space-y-6">
          
          {mode === 'applicants' && (
             <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden flex flex-col max-h-[500px]">
                <div className="bg-indigo-50 border-b border-indigo-100 p-4 shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center"><Users className="w-5 h-5"/></div>
                     <div>
                       <div className="flex items-center gap-2">
                          <h3 className="font-black text-indigo-900 text-lg">Review Applicants</h3>
                          {(() => {
                            const limit = parseInt(booking.noOfEntertainers || booking.numEntertainers || 1);
                            const currentSelected = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
                            return (
                               <span className="text-[10px] font-black text-indigo-600 bg-white border border-indigo-200 px-2 py-0.5 rounded-md">
                                  {currentSelected.length} / {limit} Selected
                               </span>
                            )
                          })()}
                       </div>
                       <p className="text-sm font-semibold text-indigo-500">Pick talents to fulfill your event requirements.</p>
                     </div>
                   </div>
                   <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-indigo-200 shadow-sm">
                      <Search className="w-4 h-4 text-indigo-400" />
                      <input 
                        type="text" 
                        placeholder="Search talents..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="border-none outline-none text-sm text-slate-800 bg-transparent placeholder:text-slate-400 w-full sm:w-[200px]"
                      />
                   </div>
                </div>
                <div className="overflow-y-auto custom-scrollbar p-5">
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {filteredApplicants.map((uid: string) => {
                         const talent = talentsDict[uid];
                         if (!talent) return null;
                         const tname = talent.displayName || talent.name || `${talent.firstName || ''} ${talent.lastName || ''}`.trim() || 'Unknown Talent';
                         const rating = talent.rating || 5.0;
                         const loc = `${talent.city || ''} ${talent.state ? ', ' + talent.state : ''}`.trim() || talent.locations?.join(", ") || "Unspecified Location";
                         
                         const customOffer = booking.customOffers?.[uid];
                         const currentSelected = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
                         const isSelected = currentSelected.includes(uid);
                         const isDeclined = allDeclinedUids.includes(uid);
                         const limit = parseInt(booking.noOfEntertainers || booking.numEntertainers || 1);
                         const isFull = currentSelected.length >= limit;

                         return (
                            <div 
                               key={uid} 
                               className={`bg-white rounded-2xl border-2 p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-all ${
                                  isDeclined ? "border-rose-200 bg-rose-50/10" : isSelected ? "border-emerald-500/80 bg-emerald-50/10" : "border-slate-200/70 hover:border-indigo-400"
                               }`}
                            >
                               {/* Talent Header Info */}
                               <div className="space-y-4">
                                  <div className="flex items-start justify-between gap-3">
                                     <div className="flex items-center gap-3">
                                        {talent.profileImage ? (
                                          <img src={talent.profileImage} alt={tname} className="w-12 h-12 rounded-xl object-cover bg-slate-100 border border-slate-200 shadow-sm" />
                                        ) : (
                                          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 font-black text-lg">{tname?.charAt(0)}</div>
                                        )}
                                        <div>
                                           <h4 className="font-bold text-slate-900 text-sm leading-tight">{tname}</h4>
                                           <p className="text-xs font-semibold text-slate-400 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" /> {loc}</p>
                                        </div>
                                     </div>
                                     <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100/60 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                           {talent.talentType || "Performer"}
                                        </span>
                                        <div className="flex items-center gap-1 text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-100/50 px-2 py-0.5 rounded-md">
                                           <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> {rating}
                                        </div>
                                     </div>
                                  </div>

                                  {/* Status / Custom Offer Badge */}
                                  {isDeclined ? (
                                     <div className="p-3 bg-rose-50 border border-rose-200/80 rounded-xl space-y-1">
                                        <div className="text-[10px] font-black text-rose-800 uppercase tracking-widest flex items-center gap-1.5">
                                           <X className="w-3.5 h-3.5 text-rose-600 stroke-[3]" /> Talent Unavailable
                                        </div>
                                        <p className="text-xs font-black text-rose-800">Talent Declined the Job</p>
                                     </div>
                                  ) : customOffer ? (
                                     <div className="p-3 bg-amber-50/50 border border-amber-200/60 rounded-xl space-y-2">
                                        <div className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5">
                                           <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Proposed Custom Terms
                                        </div>
                                        <div className="grid grid-cols-1 gap-1.5 pl-1">
                                           {customOffer.proposedDate && (
                                              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                 <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                                 <span className="text-slate-400 font-medium">Date:</span>
                                                 <span className="text-amber-800 font-extrabold">
                                                    {(() => {
                                                       try {
                                                          return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(customOffer.proposedDate));
                                                       } catch (e) {
                                                          return customOffer.proposedDate;
                                                       }
                                                    })()}
                                                 </span>
                                              </div>
                                           )}
                                           {customOffer.proposedTime && (
                                              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                 <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                                 <span className="text-slate-400 font-medium">Time:</span>
                                                 <span className="text-amber-800 font-extrabold">
                                                    {(() => {
                                                       try {
                                                          return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${customOffer.proposedTime}`));
                                                       } catch (e) {
                                                          return customOffer.proposedTime;
                                                       }
                                                    })()}
                                                 </span>
                                              </div>
                                           )}
                                           {customOffer.proposedRate && (
                                              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                 <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                 <span className="text-slate-400 font-medium">Pay Rate:</span>
                                                 <span className="text-emerald-700 font-extrabold">${customOffer.proposedRate}</span>
                                              </div>
                                           )}
                                        </div>
                                     </div>
                                  ) : null}
                               </div>

                               {/* Talent Card Footer Actions */}
                               <div className="flex items-center justify-end gap-2.5 pt-4 mt-4 border-t border-slate-100 shrink-0">
                                  <button
                                     onClick={() => onViewNotes(uid, "talent", tname)}
                                     className="inline-flex h-9 items-center px-3.5 rounded-xl text-xs font-bold border border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 transition-colors gap-1.5"
                                  >
                                     <FileText className="w-3.5 h-3.5" /> Notes
                                  </button>
                                  <a 
                                     href={`/${booking.companyId}/talent/${talent.customUrl || talent.urlSlug || uid}`} 
                                     target="_blank" 
                                     rel="noopener noreferrer" 
                                     className="inline-flex h-9 items-center px-4 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                                  >
                                     View Profile
                                  </a>
                                  {isDeclined ? (
                                     <button disabled className="h-9 px-4 rounded-xl text-xs font-black bg-rose-50 text-rose-700 border border-rose-200/90 opacity-100 cursor-default inline-flex items-center gap-1.5">
                                        <X className="w-4 h-4 stroke-[3]" /> Talent Declined Job
                                     </button>
                                  ) : isSelected ? (
                                     <button disabled className="h-9 px-4 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm opacity-100 cursor-default inline-flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4" /> Selected
                                     </button>
                                  ) : (
                                     <Button 
                                       onClick={() => onSelect(booking.id, uid)} 
                                       disabled={acting || isFull} 
                                       className="h-9 px-5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors disabled:bg-slate-300 disabled:text-slate-500"
                                     >
                                       Select Talent
                                     </Button>
                                  )}
                               </div>
                            </div>
                          )
                      })}
                   </div>
                   {filteredApplicants.length === 0 && (
                      <div className="text-center py-16 text-slate-400 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-3 mt-5">
                         <Users className="w-12 h-12 mx-auto stroke-[1.5] opacity-25 text-indigo-500" />
                         <p className="text-sm font-bold">No talents have applied for this job yet.</p>
                      </div>
                   )}
                </div>
             </div>
          )}

          {mode === 'details' && (
             <div className="space-y-6">
                {currentStepIdx === 3 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                     <div>
                        <h4 className="font-black text-amber-900 text-sm">Action Required: Payment Pending</h4>
                        <p className="text-amber-700 text-xs font-semibold mt-1">Please complete your payment to finalize this booking. <strong className="font-bold">Your booking will be officially confirmed after payment.</strong></p>
                     </div>
                     <a 
                       href={`/${booking.companyId}/dashboard/client/payment/${booking.id}`} 
                       className="bg-indigo-600 text-white hover:bg-indigo-700 px-6 h-10 rounded-xl font-bold flex items-center justify-center shadow-md shrink-0 transition-all whitespace-nowrap"
                     >
                       Pay Now
                     </a>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Event */}
                  <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center"><Calendar className="w-3.5 h-3.5 text-indigo-500" /></div>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Event Timing</span>
                    </div>
                    <div className="space-y-3 pt-1">
                      {date && (
                        <div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Event Date</span>
                          <span className="text-sm font-bold text-slate-800">{new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(date))}</span>
                        </div>
                      )}
                      {time && (
                        <div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Event Time</span>
                          <span className="text-sm font-bold text-slate-800">{new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${time}`))}</span>
                        </div>
                      )}
                      {duration && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Duration</span><span className="text-sm font-bold text-slate-800">{duration}</span></div>}
                      {locationDetails && (
                        <div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Venue Location</span>
                          <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5 leading-snug">
                             <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" /> {locationDetails}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Job & Pricing */}
                  <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center"><Briefcase className="w-3.5 h-3.5 text-indigo-500" /></div>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Job & Summary</span>
                    </div>
                    <div className="space-y-2.5">
                      {jobType && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Job Type</span><span className="text-sm font-bold text-slate-800">{jobType}</span></div>}
                      {gender && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Gender</span><span className="text-sm font-bold text-slate-800">{gender}</span></div>}
                      {numEntertainers && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Entertainers</span><span className="text-sm font-bold text-slate-800">{numEntertainers}</span></div>}
                    </div>
                    {payRate && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Budget Rate</span>
                        <span className="text-xl font-black text-emerald-600">${payRate}</span>
                      </div>
                    )}
                  </div>
                </div>

                {(() => {
                  const sIds = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
                  if (sIds.length === 0) return null;
                  
                  return (
                    <div className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-sm space-y-4">
                       <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center"><Star className="w-3.5 h-3.5 text-indigo-500" /></div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Selected Talent(s) {sIds.length}</span>
                          </div>
                       </div>
                       
                       <div className="space-y-4">
                         {sIds.map((tid: string) => {
                           const tData = talentsDict[tid] || {};
                           const imgUrl = tData.profileImage || tData.photoUrl; // Handle different image keys
                           return (
                             <div key={tid} className="flex flex-col sm:flex-row items-center justify-between gap-4 p-3 bg-indigo-50/30 rounded-xl border border-indigo-50">
                                <div className="flex items-center gap-4">
                                   {imgUrl ? (
                                      <img src={imgUrl} alt="Selected Talent" className="w-16 h-16 rounded-2xl object-cover bg-slate-100 shadow-sm border-2 border-indigo-50" />
                                   ) : (
                                      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xl border-2 border-indigo-50">
                                         {tData.displayName?.charAt(0) || tData.name?.charAt(0) || "T"}
                                      </div>
                                   )}
                                   <div>
                                      <h4 className="font-black text-slate-900 text-lg leading-tight">{tData.displayName || tData.name || "Talent Found"}</h4>
                                      <p className="text-sm font-bold text-indigo-500 mt-0.5">{tData.talentType || "Service Performer"}</p>
                                   </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                     onClick={() => onViewNotes(tid, "talent", tData.displayName || tData.name || "Talent")}
                                     className="h-10 px-5 rounded-xl font-bold bg-[#5046E5]/10 border border-[#5046E5]/20 text-[#5046E5] hover:bg-[#5046E5]/20 transition-all flex items-center shadow-sm whitespace-nowrap gap-1.5"
                                  >
                                     <FileText className="w-4 h-4" /> Notes
                                  </button>
                                  <a 
                                     href={`/${booking.companyId}/talent/${tData.customUrl || tData.urlSlug || tid}`} 
                                     target="_blank" 
                                     rel="noopener noreferrer"
                                     className="h-10 px-6 rounded-xl font-bold bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 transition-all flex items-center shadow-sm whitespace-nowrap"
                                  >
                                     View Full Profile
                                  </a>
                                </div>
                             </div>
                           );
                         })}
                       </div>
                    </div>
                  );
                })()}

                {booking.paymentReceiptUrl && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                     <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                        <div className="w-6 h-6 rounded-md bg-orange-50 flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-orange-500"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Payment Proof / Receipt</span>
                     </div>
                     <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                        <a 
                          href={booking.paymentReceiptUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="block w-28 h-28 rounded-2xl border border-orange-200 overflow-hidden shrink-0 hover:opacity-95 transition-opacity bg-slate-50 shadow-md"
                        >
                          <img src={booking.paymentReceiptUrl} alt="Payment Receipt" className="w-full h-full object-cover" />
                        </a>
                        <div className="space-y-2 text-center sm:text-left">
                          <p className="text-sm font-bold text-slate-600">Payment Method: <span className="font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{booking.paymentMethod || "Direct"}</span></p>
                          <p className="text-sm font-bold text-slate-600">Payment Status: <span className="font-extrabold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">{booking.paymentStatus || "Awaiting Approval"}</span></p>
                          {booking.receiptUploadedAt && (
                            <p className="text-xs font-semibold text-slate-400 mt-1">
                              Uploaded At: {new Date(booking.receiptUploadedAt).toLocaleString()}
                            </p>
                          )}
                          <a 
                            href={booking.paymentReceiptUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-xs font-black text-indigo-600 hover:text-indigo-800 hover:underline inline-block pt-1.5"
                          >
                            View Fullscreen Receipt ↗
                          </a>
                        </div>
                     </div>
                  </div>
                )}

                {customFields.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                     <h3 className="font-black text-slate-800 text-sm tracking-widest uppercase border-b border-slate-100 pb-2">Additional Submission Data</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {customFields.map(([key, val]) => {
                           const displayTitle = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                           const displayVal = val && typeof val === 'object' ? JSON.stringify(val) : String(val);
                           return (
                             <div key={key}>
                               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">{displayTitle}</span>
                               <span className="text-sm font-semibold text-slate-800 p-2.5 bg-slate-50 rounded-lg border border-slate-100 block">{displayVal || "-"}</span>
                             </div>
                           )
                        })}
                     </div>
                  </div>
                )}
                <div className="mt-6">
                  <EntityNotes 
                    companyId={booking.companyId}
                    entityId={booking.id}
                    entityType="booking"
                    title="Booking Notes"
                    placeholder="Add a note to this booking..."
                  />
                </div>
             </div>
          )}
        </div>

        {mode === 'details' && (
          <div className="px-6 py-4 bg-slate-100 border-t border-slate-200/60 flex items-center justify-end gap-3 shrink-0">
             <BookingChatButton 
                bookingId={booking.id} 
                userId={userId} 
                onClick={onChat}
                className="h-11 px-5"
             />
             <Button
                variant="outline"
                onClick={onClose}
                className="h-11 px-6 rounded-xl font-bold border-slate-200 text-slate-700 hover:bg-slate-200 transition-all bg-white"
             >
                Close
             </Button>
             {status === "Confirmed" && (
                <Button
                   onClick={onMarkCompleted}
                   className="bg-emerald-600 text-white hover:bg-emerald-700 h-11 px-6 rounded-xl font-bold shadow-md shadow-emerald-200 transition-all flex items-center gap-2"
                >
                   <Check className="w-4 h-4" /> Mark Completed
                </Button>
             )}
             {!["Confirmed", "Completed", "Cancelled"].includes(status) && (
               <Button
                  disabled={acting}
                  onClick={() => onCancel(booking.id)}
                  className="bg-rose-600 text-white hover:bg-rose-700 h-11 px-6 rounded-xl font-bold shadow-md shadow-rose-200 transition-all flex items-center gap-2"
               >
                  {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Cancel Booking
               </Button>
             )}
          </div>
        )}
      </div>
      {showActivity && (
         <ClientActivityHistoryModal booking={booking} dictionary={talentsDict} onClose={() => setShowActivity(false)} />
      )}
    </div>
  )
}

export const ClientActivityHistoryModal = ({ booking, dictionary, onClose }: any) => {
   const getTimeline = () => {
      const evts: any[] = [];
      
      // 1. Created
      if (booking.createdAt) {
         evts.push({ type: 'created', at: booking.createdAt, icon: <Clock className="w-4 h-4 text-white" />, color: 'bg-blue-500', title: 'Booking Submitted', desc: `You submitted the inquiry.` });
      }

      // 2. Talent Applied
      if (booking.applicants && booking.applicants.length > 0) {
         const simulatedAt = new Date(new Date(booking.createdAt).getTime() + 1000).toISOString();
         evts.push({ type: 'applied', at: simulatedAt, icon: <Users className="w-4 h-4 text-white" />, color: 'bg-indigo-500', title: 'Talents Applied', desc: `${booking.applicants.length} talent(s) submitted availability.` });
      }

      // 3. Assignment History
      if (booking.assignmentHistory) {
         let ash: any[] = [];
         if (Array.isArray(booking.assignmentHistory)) ash = booking.assignmentHistory;
         else if (typeof booking.assignmentHistory === 'string') {
            try { ash = JSON.parse(booking.assignmentHistory); } catch (e) {}
         }
         ash.forEach((a: any) => {
            const tName = a.talentName || dictionary[a.talentId]?.displayName || dictionary[a.talentId]?.name || "a talent";
            let titleText = a.type === 'assigned' ? 'Talent Assigned' : a.type === 'declined' ? 'Talent Declined Job' : 'Talent Removed';
            let descText = a.type === 'assigned' 
              ? `Assigned to @${tName}.` 
              : a.type === 'declined' 
              ? `@${tName} declined the job offer and was unassigned.` 
              : `Assignment changed.`;
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
               title: a.type === 'assigned' ? 'Talent Assigned' : 'Talent Removed',
               desc: descText
            });
         });
      }

      // 4. Payment Proof
      if (booking.receiptUploadedAt) {
         evts.push({ type: 'payment_proof', at: booking.receiptUploadedAt, icon: <Activity className="w-4 h-4 text-white" />, color: 'bg-orange-500', title: 'Payment Proof Submitted', desc: `You uploaded a payment receipt.` });
      }

      // 5. Payment Declined
      if (booking.declinedAt) {
         evts.push({ type: 'payment_declined', at: booking.declinedAt, icon: <X className="w-4 h-4 text-white" />, color: 'bg-red-500', title: 'Payment Declined', desc: `Admin declined payment. Reason: ${booking.paymentDeclineReason || 'None given'}.` });
      }

      // 6. Paid / Confirmed
      if (booking.paidAt) {
         evts.push({ type: 'payment_approved', at: booking.paidAt, icon: <CheckCircle2 className="w-4 h-4 text-white" />, color: 'bg-emerald-500', title: 'Payment Approved & Confirmed', desc: `Payment and booking successfully confirmed.` });
      }

      // 7. Completed
      if (booking.status?.toLowerCase() === 'completed') {
         const cTime = new Date().toISOString();
         evts.push({ type: 'completed', at: cTime, icon: <CheckCircle2 className="w-4 h-4 text-white" />, color: 'bg-indigo-800', title: 'Booking Completed', desc: `Gig has concluded successfully.` });
      }

      return evts;
   };
   
   const history = getTimeline().sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime());

   return (
     <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className="bg-white rounded-3xl w-[96%] sm:max-w-xl shadow-2xl relative z-20 overflow-hidden border border-slate-200 flex flex-col">
           <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-indigo-500" />
                 </div>
                 <h2 className="text-xl font-bold text-slate-900">Activity Log</h2>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
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
                           <p className="text-xs font-bold text-slate-500 mt-1">{h.desc}</p>
                        </div>
                     </div>
                   ))}
                </div>
              )}
           </div>
           <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100">
             <button onClick={onClose} className="w-full h-12 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all shadow-sm">Close Activity Log</button>
           </div>
        </div>
     </div>
   )
}

export function ClientRateTalentModal({ booking, companyId, onClose, onCompleted }: {
  booking: any,
  companyId: string,
  onClose: () => void,
  onCompleted: (updatedBooking: any) => void
}) {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [talentInfo, setTalentInfo] = useState<any>(null);
  const [companyConfig, setCompanyConfig] = useState<any>(null);

  // Tip state
  const [selectedTip, setSelectedTip] = useState<number | "custom" | 0>(0);
  const [customTip, setCustomTip] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"" | "cashapp" | "venmo" | "card">("");

  useEffect(() => {
    async function fetchTalentAndCompany() {
      if (booking.talentId) {
        try {
          const snap = await getDoc(doc(db, "talents", booking.talentId));
          if (snap.exists()) {
            setTalentInfo(snap.data());
          } else {
            const uSnap = await getDoc(doc(db, "users", booking.talentId));
            if (uSnap.exists()) setTalentInfo(uSnap.data());
          }
        } catch (e) {
          console.error(e);
        }
      }
      try {
        const cSnap = await getDoc(doc(db, "companies", companyId));
        if (cSnap.exists()) {
          setCompanyConfig(cSnap.data());
        }
      } catch (e) {
        console.error("Failed to load company config for tip modal:", e);
      }
    }
    fetchTalentAndCompany();
  }, [booking.talentId, companyId]);

  useEffect(() => {
    if (companyConfig) {
      if (companyConfig.cashappQrUrl) {
        setPaymentMethod("cashapp");
      } else if (companyConfig.venmoQrUrl) {
        setPaymentMethod("venmo");
      } else if (companyConfig.stripeEnabled) {
        setPaymentMethod("card");
      } else {
        setPaymentMethod("");
      }
    }
  }, [companyConfig]);

  const getTipAmount = () => {
    if (selectedTip === 0) return 0;
    if (selectedTip === "custom") return parseFloat(customTip) || 0;
    return selectedTip;
  };

  const handleSubmit = async () => {
    if (!booking.talentId) return;
    const tipAmount = getTipAmount();
    
    // Guard if tip is added but no payment method configured
    if (tipAmount > 0 && PAYMENT_METHODS.length === 0) {
      showError("No payment methods are configured by the company to process tips. Please select No Tip.");
      return;
    }
    
    setLoading(true);
    try {
      const historyEntry = {
        type: 'completed',
        at: new Date().toISOString(),
        clientName: booking.clientName || booking.__clientName || "Client",
        rating,
        comment,
        ...(tipAmount > 0 ? { tipAmount, tipPaymentMethod: paymentMethod } : {})
      };

      await updateDoc(doc(db, "bookings", booking.id), {
        status: "Completed",
        clientMarkedComplete: true,
        clientReviewed: true,
        clientRatingForTalent: rating,
        clientCommentForTalent: comment,
        ...(tipAmount > 0 ? { tipAmount, tipPaymentMethod: paymentMethod, tipStatus: "pending" } : {}),
        assignmentHistory: arrayUnion(historyEntry)
      });

      await addDoc(collection(db, "reviews"), {
        bookingId: booking.id,
        companyId,
        fromId: booking.clientId || "guest",
        toId: booking.talentId,
        fromRole: "client",
        rating,
        comment,
        createdAt: new Date().toISOString()
      });

      const tDocRef = doc(db, "talents", booking.talentId);
      const tSnap = await getDoc(tDocRef);
      if (tSnap.exists()) {
        const tData = tSnap.data();
        const oldRating = Number(tData.rating) || 5;
        const oldCount = Number(tData.reviewsCount) || 0;
        const newCount = oldCount + 1;
        const newRating = ((oldRating * oldCount) + rating) / newCount;
        
        await updateDoc(tDocRef, {
          rating: Number(newRating.toFixed(2)),
          reviewsCount: newCount
        });
      } else {
        await updateDoc(doc(db, "users", booking.talentId), {
          rating,
          reviewsCount: 1
        });
      }

      if (tipAmount > 0 && paymentMethod === "card") {
        const stripeCheckoutRes = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bookingId: booking.id,
            companyId,
            paymentType: "tip",
            tipAmount,
            jobType: booking.jobType || booking.__jobType || "Gig Request",
          }),
        });

        if (!stripeCheckoutRes.ok) {
          const errData = await stripeCheckoutRes.json();
          throw new Error(errData.error || "Failed to create checkout session");
        }

        const checkoutData = await stripeCheckoutRes.json();
        if (checkoutData.url) {
          window.location.href = checkoutData.url;
          return;
        } else {
          throw new Error("No checkout URL returned from server.");
        }
      }

      showSuccess(tipAmount > 0 
        ? `Gig completed! Review submitted. Tip of $${tipAmount} via ${paymentMethod} is noted as pending.`
        : "Gig marked as completed and review submitted."
      );
      onCompleted({
        ...booking,
        status: "Completed",
        clientMarkedComplete: true,
        clientReviewed: true,
        clientRatingForTalent: rating,
        clientCommentForTalent: comment,
        ...(tipAmount > 0 ? { tipAmount, tipPaymentMethod: paymentMethod, tipStatus: "pending" } : {}),
        assignmentHistory: [
          ...(booking.assignmentHistory || []),
          historyEntry
        ]
      });
    } catch (e) {
      console.error(e);
      showError("Failed to submit review. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const name = talentInfo?.displayName || talentInfo?.name || "Talent Performer";
  const photo = talentInfo?.photoUrl || talentInfo?.profileImage || null;
  const payRate = booking.payRate || 0;

  const TIP_PRESETS = [
    { label: "No Tip", value: 0 },
    { label: "10%", value: Math.round(payRate * 0.10) },
    { label: "15%", value: Math.round(payRate * 0.15) },
    { label: "20%", value: Math.round(payRate * 0.20) },
    { label: "Custom", value: "custom" as const },
  ];

  const PAYMENT_METHODS = [
    ...(companyConfig?.cashappQrUrl ? [{ id: "cashapp", label: "Cash App", icon: Smartphone, color: "bg-emerald-50 border-emerald-200 text-emerald-700", activeColor: "bg-emerald-600 border-emerald-600 text-white", comingSoon: false }] : []),
    ...(companyConfig?.venmoQrUrl ? [{ id: "venmo", label: "Venmo", icon: Banknote, color: "bg-sky-50 border-sky-200 text-sky-700", activeColor: "bg-sky-600 border-sky-600 text-white", comingSoon: false }] : []),
    ...(companyConfig?.stripeEnabled ? [{ id: "card", label: "Card", icon: CreditCard, color: "bg-violet-50 border-violet-200 text-violet-700", activeColor: "bg-violet-600 border-violet-600 text-white", comingSoon: false }] : []),
  ];

  const tipAmount = getTipAmount();
  const showPaymentMethods = selectedTip !== 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      <div className="w-[96%] sm:max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-white/20 rounded-xl"><Star className="w-5 h-5 text-amber-300 fill-amber-300" /></div>
             <div>
               <h3 className="font-black text-lg leading-tight">Rate Your Experience</h3>
               <p className="text-white/60 text-xs font-semibold">Mark gig complete &amp; leave a review</p>
             </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh] custom-scrollbar">
          {/* Talent Card */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-20 h-20 rounded-[24px] bg-slate-100 border border-slate-200 overflow-hidden shadow-inner">
               {photo ? <img src={photo} alt={name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><User className="w-10 h-10" /></div>}
            </div>
            <div>
               <h4 className="font-black text-slate-800 text-md">{name}</h4>
               <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">{talentInfo?.talentType || "Service Performer"}</p>
            </div>
          </div>

          {/* Star Rating */}
          <div className="space-y-4">
             <div className="text-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Your Star Rating</span>
                <div className="flex items-center justify-center gap-2">
                   {[1, 2, 3, 4, 5].map((star) => {
                      const isActive = hoverRating !== null ? star <= hoverRating : star <= rating;
                      return (
                         <button
                            key={star}
                            onClick={() => setRating(star)}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(null)}
                            className="p-1 transition-all hover:scale-125 focus:outline-none"
                         >
                            <Star 
                               className={`w-9 h-9 transition-colors ${isActive ? 'fill-amber-400 text-amber-400 drop-shadow-md' : 'text-slate-200'}`} 
                            />
                         </button>
                      )
                   })}
                </div>
             </div>

             <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Share Your Feedback</label>
                <textarea
                   placeholder="Describe your experience with this talent (punctuality, performance, attitude, etc.)..."
                   value={comment}
                   onChange={e => setComment(e.target.value)}
                   rows={3}
                   className="w-full text-sm font-bold text-slate-800 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 placeholder:text-slate-400 bg-slate-50/50"
                />
             </div>
          </div>

          {/* Tip Section */}
          <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
                <Gift className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-black text-amber-900">Add a Tip</p>
                <p className="text-[10px] font-semibold text-amber-700/80">Show your appreciation for great service</p>
              </div>
            </div>

            {/* Tip Preset Buttons */}
            <div className="flex flex-wrap gap-2">
              {TIP_PRESETS.map(preset => (
                <button
                  key={String(preset.value)}
                  onClick={() => setSelectedTip(preset.value as any)}
                  className={`h-9 px-4 rounded-xl text-[12px] font-black border transition-all ${
                    selectedTip === preset.value 
                      ? 'bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-200' 
                      : 'bg-white border-amber-200 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  {preset.label}{preset.value !== 0 && preset.value !== "custom" ? ` ($${preset.value})` : ""}
                </button>
              ))}
            </div>

            {/* Custom Tip Input */}
            {selectedTip === "custom" && (
              <div className="flex items-center gap-3 bg-white border border-amber-200 rounded-xl px-3 py-2">
                <span className="text-amber-700 font-black text-lg">$</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Enter custom amount..."
                  value={customTip}
                  onChange={e => setCustomTip(e.target.value)}
                  className="flex-1 text-sm font-bold text-slate-800 outline-none bg-transparent placeholder:text-slate-400"
                />
              </div>
            )}

            {/* Payment Method — only shown when tip > 0 */}
            {showPaymentMethods && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Pay Tip Via</p>
                {PAYMENT_METHODS.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_METHODS.map(method => {
                        const Icon = method.icon;
                        const isActive = paymentMethod === method.id;
                        return (
                          <button
                            key={method.id}
                            onClick={() => { if (!method.comingSoon) setPaymentMethod(method.id as any); }}
                            disabled={method.comingSoon}
                            className={`flex items-center gap-2 h-9 px-3.5 rounded-xl text-[12px] font-black border transition-all ${
                              method.comingSoon 
                                ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-60' 
                                : isActive ? method.activeColor + ' shadow-md' : method.color + ' hover:opacity-80'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {method.label}
                            {method.comingSoon && <span className="text-[9px] font-bold ml-1 opacity-70">(soon)</span>}
                          </button>
                        );
                      })}
                    </div>
                    {tipAmount > 0 && paymentMethod && (
                      <p className="text-[11px] font-bold text-amber-700 bg-amber-100 px-3 py-2 rounded-lg mt-1">
                        {paymentMethod === "card" 
                          ? `💰 A tip of <strong>$${tipAmount}</strong> will be processed securely via Credit/Debit card.`
                          : `💰 A tip of <strong>$${tipAmount}</strong> will be noted. Payment via <strong className="capitalize">${paymentMethod}</strong> is pending — you'll finalize it directly with the talent.`
                        }
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-100/50 px-3 py-2 rounded-lg mt-1">
                    ⚠️ No payment methods are currently configured by the company to accept tips.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} className="rounded-xl font-bold h-11 px-5 border-slate-200 text-slate-600 hover:bg-slate-100 bg-white">Cancel</Button>
          <Button 
             disabled={loading} 
             onClick={handleSubmit} 
             className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold h-11 px-6 shadow-md shadow-emerald-100 flex items-center gap-2"
          >
             {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
             {tipAmount > 0 ? `Submit + Tip $${tipAmount}` : "Mark Completed & Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
