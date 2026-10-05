"use client";

import { useState, useEffect, Suspense, use } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSearchParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  collection, query, where, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, addDoc
} from "firebase/firestore";
import {
  CalendarDays, Clock, MapPin, Briefcase, DollarSign, CheckCircle2,
  BellRing, Loader2, ChevronRight, Users, X, Check, Search, Calendar, LayoutGrid, GripVertical, FileText, Info, User, Star, Send, Filter, Activity
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { sendNotificationToAdmins, sendNotification } from "@/lib/notifications";
import { BookingChatButton } from "@/components/bookings/BookingChatButton";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";
import { EntityNotes } from "@/components/notes/EntityNotes";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Booking {
  id: string;
  clientName: string;
  clientEmail: string;
  clientNumber: string;
  eventDate: string;
  eventTime: string;
  duration: string;
  address: string;
  city: string;
  state: string;
  jobType: string;
  gender: string;
  numEntertainers: string;
  payRate: string;
  specialRequests: string;
  status: string;
  companyId: string;
  talentId?: string;
  selectedTalentId?: string;
  applicants?: string[];
  createdAt: string;
  [key: string]: any;
}

interface TalentProfile {
  gender: string | string[];
  talentType: string;
  categories: string[];
  locations: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function doesMatch(booking: Booking, profile: TalentProfile): boolean {
  const safeString = (val: any): string => {
    if (val === undefined || val === null) return "";
    if (typeof val === "string") return val;
    if (typeof val === "object") {
      return val.description || val.formatted_address || val.name || val.id || val.label || JSON.stringify(val) || "";
    }
    return String(val);
  };

  const talentLocations = (profile.locations || []).map((l) => safeString(l).toLowerCase().trim());
  const bookingCity = safeString(booking.city || booking.__city).toLowerCase().trim();
  const bookingState = safeString(booking.state || booking.__state).toLowerCase().trim();
  const bookingLocation = `${bookingCity} ${bookingState}`.trim();

  const locationMatch =
    talentLocations.length === 0 ||
    !bookingLocation ||
    talentLocations.some((loc) => {
       return (bookingCity && loc.includes(bookingCity)) || 
              (bookingState && loc.includes(bookingState)) || 
              (bookingLocation && loc.includes(bookingLocation)) ||
              (bookingLocation && bookingLocation.includes(loc));
    });

  const bookingGender = safeString(booking.gender).toLowerCase().trim();
  const talentGenders = (
    Array.isArray(profile.gender) 
      ? profile.gender 
      : [profile.gender]
  ).map((g) => safeString(g).toLowerCase().trim()).filter(Boolean);

  const genderMatch =
    !bookingGender ||
    bookingGender === "any" ||
    talentGenders.length === 0 ||
    talentGenders.some((g) => 
      g === bookingGender || 
      g.includes(bookingGender) || 
      bookingGender.includes(g) || 
      (bookingGender === "male" && g.includes("male")) || 
      (bookingGender === "female" && g.includes("female"))
    );

  const bookingJob = safeString(booking.jobType || booking.__jobType).toLowerCase().trim();
  
  const talentTypes = (
    Array.isArray(profile.talentType)
      ? profile.talentType
      : [profile.talentType]
  ).map((t) => safeString(t).toLowerCase().trim()).filter(Boolean);

  const talentCategories = (profile.categories || []).map((c) => safeString(c).toLowerCase().trim());
  
  const jobMatch =
    !bookingJob ||
    talentTypes.length === 0 ||
    talentTypes.some((t) => t === bookingJob || t.includes(bookingJob) || bookingJob.includes(t)) ||
    talentCategories.some((c) => c === bookingJob || c.includes(bookingJob) || bookingJob.includes(c));

  return locationMatch && genderMatch && jobMatch;
}

// ─── Table Config ─────────────────────────────────────────────────────────────
const BASE_COLUMNS = [
  { id: "id", label: "Booking ID" },
  { id: "date", label: "Event Date" },
  { id: "address", label: "Venue Location" },
  { id: "jobType", label: "Job Service" },
  { id: "amount", label: "Pay Rate" },
  { id: "status", label: "Booking Status" },
];

// ─── Main Page Content ────────────────────────────────────────────────────────
function BookingsContent({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [tab, setTab] = useState<"all" | "available" | "applied" | "offers" | "upcoming" | "complete" | "cancelled">("all");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [availableBookings, setAvailableBookings] = useState<Booking[]>([]);
  const [appliedBookings, setAppliedBookings] = useState<Booking[]>([]);
  const [offerBookings, setOfferBookings] = useState<Booking[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [completeBookings, setCompleteBookings] = useState<Booking[]>([]);
  const [cancelledBookings, setCancelledBookings] = useState<Booking[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [chatBooking, setChatBooking] = useState<Booking | null>(null);
  const [autoShowCustomOffer, setAutoShowCustomOffer] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  const [availableColumns, setAvailableColumns] = useState<typeof BASE_COLUMNS>(BASE_COLUMNS);
  const [columns, setColumns] = useState<string[]>(BASE_COLUMNS.map(c => c.id));
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [draggedColId, setDraggedColId] = useState<string | null>(null);

  useEffect(() => {
    const qTab = searchParams.get("tab");
    if (qTab && ["all", "available", "applied", "offers", "upcoming", "complete", "cancelled"].includes(qTab)) {
      setTab(qTab as any);
    }
  }, [searchParams]);

  const updateTab = (newTab: string) => {
    setTab(newTab as any);
    router.push(`/${companyId}/dashboard/talent/bookings?tab=${newTab}`);
  };

  useEffect(() => {
    if (!user) return;
    loadAll();
    const savedColsStr = localStorage.getItem(`talentum_talent_cols_${user.uid}`);
    if (savedColsStr) {
       const savedCols = JSON.parse(savedColsStr);
       const validCols = savedCols.filter((colId: string) => BASE_COLUMNS.some(dc => dc.id === colId));
       if (validCols.length > 0) setColumns(validCols);
    }
  }, [user]);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const normalizedCompanyId = companyId.toLowerCase();

      const [userSnap, talentSnap] = await Promise.all([
        getDoc(doc(db, "users", user.uid)),
        getDoc(doc(db, "talents", user.uid)),
      ]);

      const userData = userSnap.data() || {};
      
      if (userData.role !== 'talent') {
        console.warn("Non-talent user accessed talent portal, redirecting to appropriate view:", user.uid, userData.role);
        if (userData.role === 'admin' || userData.role === 'staff' || userData.role === 'company_admin') {
          router.push(`/${companyId}/dashboard/admin`);
        } else if (userData.role === 'client') {
          router.push(`/${companyId}/dashboard/client`);
        } else if (userData.role === 'platform_admin') {
          router.push(`/master`);
        } else {
          router.push(`/${companyId}/login`);
        }
        return;
      }

      const talentData = talentSnap.data() || {};
      
      const rawLocs = talentData.locations || userData.locations || userData.coverageArea || [];
      const safeLocs = Array.isArray(rawLocs) 
        ? rawLocs.map(l => typeof l === 'string' ? l : (l.description || l.name || JSON.stringify(l)))
        : [];
      if (safeLocs.length === 0 && userData.city) safeLocs.push(userData.city);

      const rawCats = talentData.categories || userData.categories || userData.services || [];
      const safeCats = Array.isArray(rawCats)
        ? rawCats.map(c => typeof c === 'string' ? c : JSON.stringify(c))
        : [];
      if (safeCats.length === 0 && userData.talentType) safeCats.push(userData.talentType);

      const profile: TalentProfile = {
        gender: userData.gender || talentData.gender || "",
        talentType: userData.talentType || talentData.talentType || "",
        categories: safeCats,
        locations: safeLocs,
      };

      const originalId = companyId;
      const ids = Array.from(new Set([originalId, originalId.toLowerCase(), originalId.toUpperCase()]));

      const querySet = ids.flatMap(id => [
        query(collection(db, "bookings"), where("companyId", "==", id), where("status", "==", "Pending")),
        query(collection(db, "bookings"), where("companyId", "==", id), where("applicants", "array-contains", user.uid)),
        query(collection(db, "bookings"), where("companyId", "==", id), where("selectedTalentId", "==", user.uid)),
        query(collection(db, "bookings"), where("companyId", "==", id), where("selectedTalentIds", "array-contains", user.uid)),
        query(collection(db, "bookings"), where("companyId", "==", id), where("talentId", "==", user.uid)),
      ]);

      const allSnaps = await Promise.all(querySet.map(q => getDocs(q)));
      
      const map = new Map<string, Booking>();
      const addDocs = (snap: any) => snap.docs.forEach((d: any) => map.set(d.id, { id: d.id, ...d.data() } as Booking));
      allSnaps.forEach(s => addDocs(s));
      
      const combined = Array.from(map.values());

      const available: Booking[] = [];
      const applied: Booking[] = [];
      const offers: Booking[] = [];
      const upcoming: Booking[] = [];
      const completed: Booking[] = [];
      const cancelled: Booking[] = [];

      combined.forEach(b => {
        const isApplicant = b.applicants?.includes(user.uid);
        const isSelected = b.selectedTalentId === user.uid || b.selectedTalentIds?.includes(user.uid);
        const isAssigned = b.talentId === user.uid;
        const hasDeclined = b.declinedTalentIds?.includes(user.uid) || 
          b.assignmentHistory?.some((h: any) => h.type === 'declined' && h.talentId === user.uid);

        if (hasDeclined) {
          cancelled.push(b);
        }
        else if (isAssigned) {
          if (b.status === "Completed") completed.push(b);
          else if (b.status === "Cancelled") cancelled.push(b);
          else upcoming.push(b);
        } 
        else if (isSelected && !isAssigned && b.status !== "Completed" && b.status !== "Cancelled") {
          offers.push(b);
        }
        else if (isApplicant && !isAssigned) {
          if (b.status === "Pending" || b.status === "Reviewing") applied.push(b);
        }
        else if (b.status === "Pending" && !isApplicant) {
          if (doesMatch(b, profile)) {
            available.push(b);
          }
        }
      });

      const sortDates = (arr: Booking[]) => arr.sort((a,b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
      
      setAvailableBookings(sortDates(available));
      setAppliedBookings(sortDates(applied));
      setOfferBookings(sortDates(offers));
      setUpcomingBookings(sortDates(upcoming));
      setCompleteBookings(completed.sort((a,b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()));
      setCancelledBookings(cancelled.sort((a,b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()));
      
      const allList = sortDates([...available, ...applied, ...offers, ...upcoming, ...completed, ...cancelled]);
      setAllBookings(allList);

    } catch (err: any) {
      console.error("[FIRESTORE_ERROR] Could not load bookings:", err);
    } finally {
      setLoading(false);
    }
  };

  const saveColumns = (newCols: string[]) => {
    setColumns(newCols);
    if (user) localStorage.setItem(`talentum_talent_cols_${user.uid}`, JSON.stringify(newCols));
  };
  const toggleColumn = (colId: string) => {
    if (columns.includes(colId)) saveColumns(columns.filter(c => c !== colId));
    else saveColumns([...columns, colId]);
  };
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

  const handleApply = async (bookingId: string, customOffer?: { proposedDate?: string; proposedTime?: string; proposedRate?: string }) => {
    if (!user) return;
    setAccepting(bookingId);
    try {
      const updateData: any = {
        applicants: arrayUnion(user.uid),
      };
      if (customOffer) {
        updateData[`customOffers.${user.uid}`] = {
          ...customOffer,
          submittedAt: new Date().toISOString()
        };
      }
      await updateDoc(doc(db, "bookings", bookingId), updateData);
      
      const pendingNode = availableBookings.find(b => b.id === bookingId) || allBookings.find(b => b.id === bookingId);
      if (pendingNode) {
        let proposedItemsDesc = "";
        let detailMessage = `${user.name || "A talent"} has applied to your booking #${bookingId.substring(0, 8)}.`;
        
        if (customOffer) {
          const parts: string[] = [];
          const details: string[] = [];
          
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

          if (customOffer.proposedDate && customOffer.proposedDate !== pendingNode.eventDate) {
            parts.push("date");
            details.push(`Proposed Date: ${formatDate(customOffer.proposedDate)} (original: ${formatDate(pendingNode.eventDate)})`);
          }
          if (customOffer.proposedTime && customOffer.proposedTime !== pendingNode.eventTime) {
            parts.push("time");
            details.push(`Proposed Time: ${formatTime(customOffer.proposedTime)} (original: ${formatTime(pendingNode.eventTime)})`);
          }
          if (customOffer.proposedRate && customOffer.proposedRate !== pendingNode.payRate) {
            parts.push("rate");
            details.push(`Proposed Pay Rate: $${customOffer.proposedRate}/hr (original: $${pendingNode.payRate}/hr)`);
          }
          
          proposedItemsDesc = parts.length > 0 ? ` with proposed terms (different ${parts.join("/")})` : "";
          if (details.length > 0) {
            detailMessage = `${user.name || "A talent"} has applied with custom terms for your booking #${bookingId.substring(0, 8)}:\n${details.join("\n")}`;
          }
        }

        // Broadcast to admins
        await sendNotificationToAdmins(companyId, {
          title: customOffer ? "New Custom Offer" : "New Talent Application",
          message: `${user.name || "A talent"} has applied for booking #${bookingId.substring(0, 8)}${proposedItemsDesc}.`,
          type: "info",
          link: `/${companyId}/dashboard/admin/bookings/all?bookingId=${bookingId}`
        });
        
        // Notify the client who created the gig
        const clientEmail = pendingNode.clientEmail || pendingNode.__email || pendingNode.__clientEmail || "";
        if (clientEmail) {
           const isGuest = !pendingNode.clientId || pendingNode.clientId === "guest";
           await sendNotification({
             userId: pendingNode.clientId || "guest",
             companyId,
             recipientEmail: clientEmail,
             title: customOffer ? "New Custom Offer!" : "New Applicant!",
             message: detailMessage,
             type: "info",
             link: isGuest ? `/${companyId}/guest/booking/${bookingId}` : `/${companyId}/dashboard/client/bookings/all?bookingId=${bookingId}`
           });
        }
      }
      if (pendingNode) {
        const updatedNode = {
          ...pendingNode,
          applicants: [...(pendingNode.applicants || []), user.uid],
          ...(customOffer ? {
            customOffers: {
              ...(pendingNode.customOffers || {}),
              [user.uid]: {
                ...customOffer,
                submittedAt: new Date().toISOString()
              }
            }
          } : {})
        };
        setAvailableBookings(prev => prev.filter(b => b.id !== bookingId));
        setAppliedBookings(prev => [updatedNode, ...prev]);
        setAllBookings(prev => prev.map(b => b.id === bookingId ? updatedNode : b));
      }
      setSelectedBooking(null);
      updateTab("applied");
    } catch (err) {
      console.error("Application failed:", err);
      showError("Failed to apply. Please try again.");
    } finally {
      setAccepting(null);
    }
  };

  const handleConfirmOffer = async (bookingId: string) => {
    if (!user) return;
    try {
      const [uSnap, tSnap] = await Promise.all([
        getDoc(doc(db, "users", user.uid)),
        getDoc(doc(db, "talents", user.uid))
      ]);
      if (uSnap.data()?.status === "inactive" || tSnap.data()?.status === "inactive") {
        showError("Your account is currently inactive. You cannot accept job offers while deactivated.");
        return;
      }
    } catch (e) {}

    setAccepting(bookingId);
    try {
      const offerNode = offerBookings.find(b => b.id === bookingId) || allBookings.find(b => b.id === bookingId);
      const isPaid = offerNode?.paymentStatus === "Paid" || offerNode?.status === "Confirmed";
      const newStatus = isPaid ? "Confirmed" : "Assigned";

      await updateDoc(doc(db, "bookings", bookingId), {
        talentId: user.uid,
        status: newStatus,
        assignmentHistory: arrayUnion({
          type: 'confirmed',
          talentId: user.uid,
          talentName: user.displayName || user.name || "Talent",
          at: new Date().toISOString()
        })
      });
      await sendNotificationToAdmins(companyId, {
        title: "Talent Confirmed Availability",
        message: `${user.name || "A talent"} has accepted the job and is confirmed for booking #${bookingId.substring(0, 8)}.`,
        type: "success",
        link: `/${companyId}/dashboard/admin/bookings/all`
      });
      
      const clientEmail = offerNode?.clientEmail || offerNode?.__email || offerNode?.__clientEmail || "";
      if (clientEmail) {
         await sendNotification({
           userId: offerNode?.clientId || "guest",
           companyId,
           recipientEmail: clientEmail,
           title: "Talent Confirmed!",
           message: `${user.name || "A talent"} has confirmed their assignment for your booking #${bookingId.substring(0, 8)}.`,
           type: "success",
           link: offerNode?.clientId && offerNode?.clientId !== "guest" ? `/${companyId}/dashboard/client/bookings/all` : undefined
         });
      }

      // Notify other applicants that the booking is now filled/closed
      if (offerNode) {
        const otherApplicants = (offerNode.applicants || []).filter((uid: string) => uid !== user.uid);
        if (otherApplicants.length > 0) {
          await Promise.all(
            otherApplicants.map(async (uid) => {
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
                companyId,
                recipientEmail: appEmail,
                title: "Booking Closed",
                message: `Thank you for applying. Another talent has been selected for booking #${bookingId.substring(0, 8)}, and the gig is now closed.`,
                type: "info",
                link: `/${companyId}/dashboard/talent/bookings?tab=all`
              });
            })
          );
        }
      }
      if (offerNode) {
        setOfferBookings(prev => prev.filter(b => b.id !== bookingId));
        setUpcomingBookings(prev => [{...offerNode, talentId: user.uid, status: "Assigned"}, ...prev]);
        setAllBookings(prev => prev.map(b => b.id === bookingId ? {...b, talentId: user.uid, status: "Assigned"} : b));
      }
      setSelectedBooking(null);
      updateTab("upcoming");
    } catch (err) {
      console.error("Confirmation failed:", err);
      showError("Failed to confirm booking.");
    } finally {
      setAccepting(null);
    }
  };

  const handleDeclineOffer = async (bookingId: string) => {
    if (!user) return;
    try {
      const [uSnap, tSnap] = await Promise.all([
        getDoc(doc(db, "users", user.uid)),
        getDoc(doc(db, "talents", user.uid))
      ]);
      if (uSnap.data()?.status === "inactive" || tSnap.data()?.status === "inactive") {
        showError("Your account is currently inactive. You cannot respond to job offers while deactivated.");
        return;
      }
    } catch (e) {}

    setAccepting(bookingId);
    try {
       const node = offerBookings.find(b => b.id === bookingId) || allBookings.find(b => b.id === bookingId);
       const currentSelected = node?.selectedTalentIds || (node?.selectedTalentId ? [node.selectedTalentId] : []);
       const remainingSelected = currentSelected.filter((uid: string) => uid !== user.uid);
       const newStatus = remainingSelected.length === 0 ? "Pending" : (node?.status || "Pending");

       const historyEntry = {
         type: 'declined',
         talentId: user.uid,
         talentName: user.displayName || user.name || "Talent",
         at: new Date().toISOString()
       };

       const activityLogEntry = {
         type: 'declined',
         title: 'Talent Declined Job',
         actorName: user.displayName || user.name || "Talent",
         actorId: user.uid,
         at: new Date().toISOString(),
         message: `${user.displayName || user.name || "Talent"} declined the job offer and was unassigned from booking #${bookingId.substring(0, 8)}.`
       };

       await updateDoc(doc(db, "bookings", bookingId), {
         selectedTalentId: remainingSelected[0] || null,
         selectedTalentIds: remainingSelected,
         status: newStatus,
         assignmentHistory: arrayUnion(historyEntry),
         activityLogs: arrayUnion(activityLogEntry),
         declinedTalentIds: arrayUnion(user.uid)
       });

       await sendNotificationToAdmins(companyId, {
         title: "Talent Declined Booking",
         message: `${user.name || "A talent"} has declined the assignment for booking #${bookingId.substring(0, 8)}.`,
         type: "alert",
         link: `/${companyId}/dashboard/admin/bookings/all`
       });
       
       const isGuestClient = !node?.clientId || node?.clientId === "guest" || String(node?.clientId).startsWith("guest_");
       const clientLink = isGuestClient 
         ? `/${companyId}/guest/booking/${bookingId}` 
         : `/${companyId}/dashboard/client/bookings/all`;

       const clientEmail = node?.clientEmail || node?.__email || node?.__clientEmail || "";
       if (clientEmail) {
          await sendNotification({
            userId: node?.clientId || "guest",
            companyId,
            recipientEmail: clientEmail,
            title: "Talent Unavailable",
            message: `${user.displayName || user.name || "A performer"} is unavailable for your booking #${bookingId.substring(0, 8)}. Please click below to select another talent.`,
            type: "alert",
            link: clientLink
          });
       }
       setOfferBookings(prev => prev.filter(b => b.id !== bookingId));
       updateTab("applied");
    } catch (err) {
      console.error("Decline failed", err);
    } finally {
      setAccepting(null);
      setSelectedBooking(null);
    }
  };

  const handleWithdrawApplication = async (bookingId: string) => {
    if (!user) return;
    const confirmed = await confirmAction({
      title: "Withdraw Application?",
      text: "Are you sure you want to withdraw your application for this gig?",
      icon: "warning",
      confirmButtonText: "Yes, withdraw",
      cancelButtonText: "No, keep it"
    });
    if (!confirmed) return;

    setAccepting(bookingId);
    try {
      const historyEntry = {
        type: 'withdrawn',
        talentId: user.uid,
        talentName: user.displayName || user.name || "Talent",
        at: new Date().toISOString()
      };
      await updateDoc(doc(db, "bookings", bookingId), {
        applicants: arrayRemove(user.uid),
        assignmentHistory: arrayUnion(historyEntry)
      });
      const node = appliedBookings.find(b => b.id === bookingId) || allBookings.find(b => b.id === bookingId);
      if (node) {
        await sendNotificationToAdmins(companyId, {
          title: "Talent Withdrew Application",
          message: `${user.name || "A talent"} has withdrawn their application for booking #${bookingId.substring(0, 8)}.`,
          type: "info",
          link: `/${companyId}/dashboard/admin/bookings/all`
        });
      }
      showSuccess("Application withdrawn successfully.");
      setAppliedBookings(prev => prev.filter(b => b.id !== bookingId));
      setAllBookings(prev => prev.map(b => b.id === bookingId ? { ...b, applicants: (b.applicants || []).filter((uid: string) => uid !== user.uid) } : b));
      setSelectedBooking(null);
    } catch (err) {
      console.error("Withdraw failed:", err);
      showError("Failed to withdraw application. Try again.");
    } finally {
      setAccepting(null);
    }
  };

  const handleHideGig = (bookingId: string) => {
    setAvailableBookings(prev => prev.filter(b => b.id !== bookingId));
    setAllBookings(prev => prev.filter(b => b.id !== bookingId));
    setSelectedBooking(null);
  };

  const TABS = [
    { id: "all",       label: "All",         icon: CalendarDays, count: allBookings.length },
    { id: "available", label: "Available",   icon: BellRing,     count: availableBookings.length },
    { id: "applied",   label: "Applied",     icon: Search,       count: appliedBookings.length },
    { id: "offers",    label: "Offers (Action Required)", icon: DollarSign, count: offerBookings.length },
    { id: "upcoming",  label: "Upcoming",    icon: Clock,        count: upcomingBookings.length },
    { id: "complete",  label: "History",     icon: CheckCircle2, count: completeBookings.length + cancelledBookings.length },
  ] as const;

  const dataset =
    tab === "all" ? allBookings :
    tab === "available" ? availableBookings :
    tab === "applied" ? appliedBookings :
    tab === "offers" ? offerBookings :
    tab === "upcoming" ? upcomingBookings :
    [...completeBookings, ...cancelledBookings];

  const filteredBookings = dataset.filter(b => {
    let fullText = "";
    Object.entries(b).forEach(([k, val]) => {
       if (!['clientName', 'clientEmail', 'clientNumber', '__clientName', '__email'].includes(k)) {
          fullText += val && typeof val === 'object' ? JSON.stringify(val) : String(val) + " ";
       }
    });
    fullText += ` ${b.id.toLowerCase()}`;
    return fullText.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const totalPages = Math.ceil(filteredBookings.length / itemsPerPage) || 1;
  const paginatedBookings = filteredBookings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => { setCurrentPage(1) }, [searchQuery, tab]);

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
             <p className="text-xs font-black text-indigo-600 uppercase tracking-widest leading-none mt-1">My Dashboard</p>
           </div>
           <h1 className="text-[32px] md:text-[40px] font-black text-slate-900 tracking-tight leading-none">Job Directory</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-row md:overflow-x-auto bg-slate-100 p-1.5 rounded-2xl gap-1.5 w-full">
        {TABS.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => updateTab(id)}
            className={`w-full md:min-w-max flex-1 flex items-center justify-center gap-1.5 h-10 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              tab === id
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {id === "offers" ? (
                <>
                  <span className="hidden md:inline">Offers (Action Required)</span>
                  <span className="md:hidden">Offers</span>
                </>
              ) : label}
            </span>
            {count > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ml-0.5 shrink-0 ${
                id === "offers" ? "bg-red-100 text-red-600 shadow-sm" :
                tab === id ? "bg-indigo-100 text-indigo-600" : "bg-slate-200 text-slate-500"
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Control Navigation Header */}
      {!loading && dataset.length > 0 && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200/60 relative z-10 w-full">
          
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 w-full max-w-[400px] transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400">
            <Search className="w-5 h-5 text-indigo-400" />
            <input 
              type="text" 
              placeholder="Search event details, jobs, addresses..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-none focus:ring-0 text-[15px] flex-1 outline-none text-slate-800 bg-transparent placeholder:text-slate-400 font-medium w-full"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600 bg-slate-200/50 rounded-full p-1"><X className="w-4 h-4" /></button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 relative z-30 justify-between md:justify-end">
            <div className="relative">
              <Button 
                variant="outline" 
                onClick={() => setShowColumnConfig(!showColumnConfig)}
                className={`h-[46px] px-5 rounded-xl font-bold shadow-sm transition-all border-slate-200 ${showColumnConfig ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 hover:text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                <LayoutGrid className="w-4 h-4 mr-2" />
                Table Views
              </Button>

              {showColumnConfig && (
                <div className="absolute right-0 top-14 w-[320px] bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 z-40 animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="text-sm font-black text-slate-800">Layout Settings</h3>
                    </div>
                    <button onClick={() => setShowColumnConfig(false)} className="text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-full transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                  
                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
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
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Table Card */}
      {loading ? (
        <Card className="flex flex-col items-center justify-center py-32 rounded-3xl border-slate-200/60 shadow-sm bg-white/50 backdrop-blur-xl">
           <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
           <p className="text-sm font-black text-slate-400 uppercase tracking-widest text-center">Syncing Marketplace...</p>
        </Card>
      ) : dataset.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-16 rounded-3xl border border-dashed border-slate-300 bg-slate-50/50">
           <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 mb-4">
             {tab === "available" && <BellRing    className="w-7 h-7 text-indigo-400" />}
             {tab === "applied"   && <Send        className="w-7 h-7 text-indigo-400" />}
             {tab === "upcoming"  && <CalendarDays className="w-7 h-7 text-indigo-400" />}
             {tab === "offers" && <DollarSign className="w-7 h-7 text-indigo-400" />}
             {tab === "all"       && <LayoutGrid   className="w-7 h-7 text-slate-400" />}
           </div>
           <p className="text-lg font-black text-slate-800 mb-1">
             {tab === "available"  ? "No available gigs right now" :
              tab === "applied" ? "No pending applications" :
              tab === "offers" ? "No offers awaiting confirmation" :
              tab === "upcoming" ? "No upcoming bookings" :
              "No records found"}
            </p>
            {tab !== "available" && (
              <Button onClick={() => updateTab("available")} className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 px-6 font-bold shadow-sm">
                View Available Gigs
              </Button>
            )}
         </Card>
      ) : (
        <>
        {/* Desktop View */}
        <Card className="hidden md:block overflow-hidden border-slate-200/60 shadow-md rounded-3xl bg-white">
          <div className="overflow-x-auto custom-scrollbar">
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
                    if (rawDate) {
                      dateInfo = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(rawDate));
                    }
                    if (rawTime) {
                      timeInfo = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${rawTime}`));
                    }
                  } catch (e) {}

                  const address = booking.address || booking.__address || `${booking.city}, ${booking.state}` || "Not specified";
                  const amount = booking.payRate ? `$${booking.payRate}` : "-";

                  const isApplied = tab === "applied" || booking.applicants?.includes(user?.uid||"");
                  const isOffer = tab === "offers" || booking.selectedTalentId === user?.uid;

                  return (
                    <tr key={booking.id} className="hover:bg-slate-50 transition-all group">
                      {columns.map(colId => {
                         if (colId === "id") return (
                           <td key={colId} className="py-3.5 px-4 whitespace-nowrap">
                             <span className="text-[12px] font-bold font-mono text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">
                                ID:{booking.id.slice(0,8)}
                             </span>
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

                         if (colId === "amount") return (
                           <td key={colId} className="py-3.5 px-4 whitespace-nowrap">
                             <span className="text-[13px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/50 shadow-sm">{amount}</span>
                           </td>
                         );

                         if (colId === "status") return (
                            <td key={colId} className="py-3.5 px-4 whitespace-nowrap">
                               {isOffer && booking.status === "Selected" ? (
                                  <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm bg-indigo-50 text-indigo-600 border-indigo-200">
                                    <CheckCircle2 className="w-3 h-3 mr-1.5"/> Client Selected You
                                  </span>
                               ) : isApplied && ['Pending','Reviewing'].includes(status) ? (
                                  <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm bg-blue-50 text-blue-600 border-blue-200">
                                    <Send className="w-3 h-3 mr-1.5"/> Applied (Under Review)
                                  </span>
                               ) : (
                                  <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm ${
                                    status === 'Pending' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                    status === 'Confirmed' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' :
                                    status === 'Completed' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                                    'bg-slate-50 text-slate-600 border-slate-200'
                                  }`}>
                                    {status === 'Pending' && <BellRing className="w-3 h-3 mr-1.5"/>}
                                    {status === 'Confirmed' && <CheckCircle2 className="w-3 h-3 mr-1.5"/>}
                                    {status}
                                  </span>
                               )}
                            </td>
                         );
                         
                         const val = booking[colId];
                         return <td key={colId} className="py-3.5 px-4"><span className="text-[13px] font-semibold text-slate-600 line-clamp-1">{val || "-"}</span></td>;
                      })}

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex gap-2 justify-end">
                           {(status === "Pending" && !isApplied) && (
                             <>
                               <Button 
                                  onClick={() => { setSelectedBooking(booking); setAutoShowCustomOffer(true); }}
                                  disabled={accepting === booking.id}
                                  className="h-8 px-3 rounded-md text-[12px] font-bold bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition shadow-sm"
                               >
                                  <DollarSign className="w-3.5 h-3.5 mr-1" /> Offer Custom Terms
                               </Button>
                               <Button 
                                  onClick={() => handleApply(booking.id)}
                                  disabled={accepting === booking.id}
                                  className="h-8 px-3 rounded-md text-[12px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm"
                               >
                                  <Send className="w-3.5 h-3.5 mr-1" /> Apply
                               </Button>
                             </>
                           )}
                            {(isOffer && !booking.talentId && booking.status !== "Completed" && booking.status !== "Cancelled") && (
                              <Button 
                                 onClick={() => handleConfirmOffer(booking.id)}
                                 disabled={accepting === booking.id}
                                 className="h-8 px-3 rounded-md text-[12px] font-bold bg-green-600 text-white hover:bg-green-700 transition"
                              >
                                 <Check className="w-3.5 h-3.5 mr-1" /> Confirm Final
                              </Button>
                            )}
                            {status === "Confirmed" && (
                              <Button 
                                 onClick={() => { setSelectedBooking(booking); setReviewModalOpen(true); }}
                                 className="h-8 px-3 rounded-md text-[12px] font-black bg-emerald-600 text-white hover:emerald-700 transition shadow-sm animate-pulse"
                              >
                                 <Check className="w-3.5 h-3.5 mr-1" /> Mark Completed
                              </Button>
                            )}
                            {status === "Completed" && !booking.talentReviewed && (
                              <Button 
                                 onClick={() => { setSelectedBooking(booking); setReviewModalOpen(true); }}
                                 className="h-8 px-3 rounded-md text-[12px] font-bold bg-amber-600 text-white hover:bg-amber-700 transition shadow-sm"
                              >
                                 <Star className="w-3.5 h-3.5 mr-1 fill-white" /> Review Client
                              </Button>
                           )}
                           {(() => {
                               const isAssignedOrSelected = 
                                 booking.talentId === user?.uid || 
                                 booking.selectedTalentId === user?.uid || 
                                 booking.selectedTalentIds?.includes(user?.uid || "");
                               return isAssignedOrSelected && (
                                 <BookingChatButton 
                                   bookingId={booking.id} 
                                   userId={user?.uid || ""} 
                                   onClick={() => setChatBooking(booking)}
                                 />
                               );
                           })()}
                           <Button 
                             onClick={() => { setSelectedBooking(booking); setAutoShowCustomOffer(false); }} 
                             variant="outline" 
                             className="h-8 px-3 rounded-md text-[12px] font-bold border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition shadow-sm"
                           >
                             <Info className="w-3.5 h-3.5 mr-1 text-slate-400" /> Details
                           </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Mobile View */}
        <div className="md:hidden space-y-4">
          {paginatedBookings.map((booking) => {
            const jobType = booking.jobType || booking.__jobType || "Unspecified";
            const status = booking.status || "Pending";
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
            } catch (e) {}

            const address = booking.address || booking.__address || `${booking.city}, ${booking.state}` || "Not specified";
            const amount = booking.payRate ? `$${booking.payRate}` : "-";
            const isApplied = tab === "applied" || booking.applicants?.includes(user?.uid||"");
            const isOffer = tab === "offers" || booking.selectedTalentId === user?.uid;

            return (
              <div key={booking.id} className="bg-white rounded-3xl border border-slate-200/60 p-5 shadow-sm space-y-4">
                {/* Header: ID + Status */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold font-mono text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">
                    ID:{booking.id.slice(0, 8)}
                  </span>
                  
                  {isOffer && booking.status === "Selected" ? (
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border bg-indigo-50 text-indigo-600 border-indigo-200">
                      Client Selected You
                    </span>
                  ) : isApplied && ['Pending','Reviewing'].includes(status) ? (
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border bg-blue-50 text-blue-600 border-blue-200">
                      Applied
                    </span>
                  ) : (
                    <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                      status === 'Pending' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                      status === 'Confirmed' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' :
                      'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {status}
                    </span>
                  )}
                </div>

                {/* Job type + Pay Rate */}
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-black text-slate-900">{jobType}</h4>
                  <span className="text-sm font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200/30">{amount}</span>
                </div>

                {/* Date & Location */}
                <div className="space-y-2 text-xs font-semibold text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>{dateInfo} {timeInfo && `· ${timeInfo}`}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{address}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100 justify-end">
                  {(status === "Pending" && !isApplied) && (
                    <>
                      <Button 
                        onClick={() => { setSelectedBooking(booking); setAutoShowCustomOffer(true); }}
                        disabled={accepting === booking.id}
                        className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition"
                      >
                        <DollarSign className="w-3.5 h-3.5 mr-0.5" /> Offer Terms
                      </Button>
                      <Button 
                        onClick={() => handleApply(booking.id)}
                        disabled={accepting === booking.id}
                        className="h-8 px-2.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition"
                      >
                        <Send className="w-3.5 h-3.5 mr-0.5" /> Apply
                      </Button>
                    </>
                  )}
                  {(isOffer && !booking.talentId && booking.status !== "Completed" && booking.status !== "Cancelled") && (
                    <Button 
                      onClick={() => handleConfirmOffer(booking.id)}
                      disabled={accepting === booking.id}
                      className="h-8 px-3 rounded-lg text-[11px] font-bold bg-green-600 text-white hover:bg-green-700 transition"
                    >
                      <Check className="w-3.5 h-3.5 mr-0.5" /> Confirm Final
                    </Button>
                  )}
                  {status === "Confirmed" && (
                    <Button 
                      onClick={() => { setSelectedBooking(booking); setReviewModalOpen(true); }}
                      className="h-8 px-3 rounded-lg text-[11px] font-black bg-emerald-600 text-white hover:bg-emerald-700 transition"
                    >
                      <Check className="w-3.5 h-3.5 mr-0.5" /> Mark Completed
                    </Button>
                  )}
                  {status === "Completed" && !booking.talentReviewed && (
                    <Button 
                      onClick={() => { setSelectedBooking(booking); setReviewModalOpen(true); }}
                      className="h-8 px-3 rounded-lg text-[11px] font-bold bg-amber-600 text-white hover:bg-amber-700 transition"
                    >
                      <Star className="w-3.5 h-3.5 mr-0.5 fill-white" /> Review Client
                    </Button>
                  )}
                  {(() => {
                    const isAssignedOrSelected = 
                      booking.talentId === user?.uid || 
                      booking.selectedTalentId === user?.uid || 
                      booking.selectedTalentIds?.includes(user?.uid || "");
                    return isAssignedOrSelected && (
                      <BookingChatButton 
                        bookingId={booking.id} 
                        userId={user?.uid || ""} 
                        onClick={() => setChatBooking(booking)}
                      />
                    );
                  })()}
                  <Button 
                    onClick={() => { setSelectedBooking(booking); setAutoShowCustomOffer(false); }} 
                    variant="outline" 
                    className="h-8 px-2.5 rounded-lg text-[11px] font-bold border-slate-200 text-slate-700 hover:bg-slate-100 transition"
                  >
                    <Info className="w-3.5 h-3.5 mr-0.5 text-slate-400" /> Details
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic Pagination & Info Footer */}
        {filteredBookings.length > 0 && (
          <div className="p-6 bg-white border border-slate-200/60 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm w-full mt-6">
            <span className="text-xs font-semibold text-slate-400">
              Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredBookings.length)} to {Math.min(currentPage * itemsPerPage, filteredBookings.length)} of {filteredBookings.length} bookings
            </span>
            
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold text-slate-600 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-40"
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      currentPage === page 
                        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-100" 
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold text-slate-600 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
        </>
      )}
    </div>

    {selectedBooking && !reviewModalOpen && (
      <BookingDetailsModal 
        booking={selectedBooking} 
        currentUserId={user?.uid||""}
        onChat={() => { setChatBooking(selectedBooking); setSelectedBooking(null); }}
        autoShowCustomOffer={autoShowCustomOffer}
        onApply={handleApply}
        onConfirm={handleConfirmOffer}
        onDecline={handleDeclineOffer}
        onWithdraw={handleWithdrawApplication}
        onHide={handleHideGig}
        onReviewClient={() => setReviewModalOpen(true)}
        accepting={accepting === selectedBooking.id}
        onClose={() => { setSelectedBooking(null); setAutoShowCustomOffer(false); }} 
      />
    )}
    
    {chatBooking && (
      <BookingChatModal 
        booking={chatBooking} 
        user={user} 
        onClose={() => setChatBooking(null)} 
      />
    )}

    {selectedBooking && reviewModalOpen && (
      <TalentRateClientModal
        booking={selectedBooking}
        companyId={companyId}
        onClose={() => { setSelectedBooking(null); setReviewModalOpen(false); }}
        onCompleted={(updatedBooking) => {
          loadAll();
          setSelectedBooking(null);
          setReviewModalOpen(false);
        }}
      />
    )}
    </>
  );
}

function BookingDetailsModal({ booking, currentUserId, onChat, autoShowCustomOffer, onApply, onHide, onConfirm, onDecline, onWithdraw, onReviewClient, accepting, onClose }: { 
  booking: any, 
  currentUserId: string,
  onChat: () => void,
  autoShowCustomOffer?: boolean,
  onApply: (id: string, customOffer?: { proposedDate?: string; proposedTime?: string; proposedRate?: string }) => void, 
  onHide: (id: string) => void, 
  onConfirm: (id: string) => void,
  onDecline: (id: string) => void,
  onWithdraw: (id: string) => void,
  onReviewClient: () => void,
  accepting: boolean,
  onClose: () => void 
}) {
  const [showActivity, setShowActivity] = useState(false);
  const getVal = (keys: string[]) => {
    for (const k of keys) if (booking[k]) return booking[k];
    return "";
  };

  const name = getVal(['clientName', '__clientName']) || "Unknown Client";
  const email = getVal(['clientEmail', '__email', '__clientEmail']);
  const phone = getVal(['clientNumber']);
  const address = getVal(['address', '__address']);
  const city = getVal(['city', '__city']) || booking.city || "";
  const state = getVal(['state', '__state']) || booking.state || "";
  const locationDetails = [address, city, state].filter(Boolean).join(", ");
  const date = getVal(['eventDate']) || booking.date;
  const time = getVal(['eventTime']);
  const duration = getVal(['duration']);
  const jobType = getVal(['jobType', '__jobType']);
  const gender = getVal(['gender', '__gender']);
  const numEntertainers = getVal(['numEntertainers']);
  const femaleGuests = getVal(['femaleGuests']);
  const maleGuests = getVal(['maleGuests']);
  const payRate = getVal(['payRate']) || booking.__budget;
  const options = getVal(['options']);
  const specialRequests = getVal(['specialRequests']);
  const status = booking.status || "Inquiry";

  const [showCustomOffer, setShowCustomOffer] = useState(autoShowCustomOffer || false);
  useEffect(() => {
    if (autoShowCustomOffer) {
      setShowCustomOffer(true);
    }
  }, [autoShowCustomOffer]);
  const [offerDate, setOfferDate] = useState(false);
  const [offerTime, setOfferTime] = useState(false);
  const [offerRate, setOfferRate] = useState(false);
  const [customDate, setCustomDate] = useState(date || "");
  const [customTime, setCustomTime] = useState(time || "");
  const [customRate, setCustomRate] = useState(payRate || "");
  
  const isApplied = booking.applicants?.includes(currentUserId);
  const isOffer = booking.selectedTalentId === currentUserId;

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

  const isAwaiting = booking.paymentStatus === 'Awaiting Approval' || status.toLowerCase() === 'awaiting approval';
  
  const STEPS = [
    { key: "Inquiry",         label: "Inquiry",         color: "#4f46e5" },
    { key: "Pending",         label: "Pending",         color: "#6366f1" },
    { key: "Talent Assigned", label: "Talent Assigned", color: "#3b82f6" },
    { key: "Pending Payment", label: isAwaiting ? "Awaiting Approval" : "Pending Payment", color: isAwaiting ? "#f97316" : "#0ea5e9" },
    { key: "Confirmed",       label: "Confirmed",       color: "#2563eb" },
    { key: "Completed",       label: "Completed",       color: "#1e3a8a" },
  ];

  let mappedStatus = "Inquiry";
  const sLow = status.toLowerCase();
  
  if (sLow === 'completed') mappedStatus = "Completed";
  else if (sLow === 'confirmed') mappedStatus = "Confirmed";
  else if (sLow === 'awaiting approval') mappedStatus = "Pending Payment";
  else if (sLow === 'deposit paid' || sLow === 'pending payment') mappedStatus = "Pending Payment";
  else if (['assigned', 'selected', 'reviewing', 'talent assigned'].includes(sLow) || booking.selectedTalentId || (booking.selectedTalentIds && booking.selectedTalentIds.length > 0)) mappedStatus = "Pending Payment";
  else if (['pending'].includes(sLow)) mappedStatus = "Pending";

  const currentStepIdx = Math.max(0, STEPS.findIndex(s => s.key === mappedStatus));

  return (
    <div 
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <style>{`
        @keyframes bModalIn { from { opacity:0; transform:scale(0.98) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .bmodal-in { animation: bModalIn 0.22s cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>
      <div
        className="bmodal-in w-[96%] sm:max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div
          className="px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between shrink-0"
          style={{ background: `linear-gradient(135deg, #4f46e5, #2563eb)` }}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-white font-black text-xl" style={{ background: 'rgba(255,255,255,0.18)' }}>
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-white font-black text-xl leading-tight">{jobType || "Gig Request"}</h2>
              <p className="text-white/60 text-xs font-mono mt-0.5 tracking-widest">#{booking.id.slice(0,10).toUpperCase()}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="text-[11px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest hidden sm:inline-block"
              style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
            >
              {isOffer && status === "Selected" ? "Client selected you" : isApplied && status === "Pending" ? "Under Review" : isAwaiting ? "Pending Payment Approval" : status}
            </span>
            <button onClick={() => setShowActivity(true)} className="flex items-center gap-1.5 text-xs font-bold text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors mr-2">
              <Activity className="w-4 h-4" /> Activity Log
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.15)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-2 sm:px-8 pt-5 pb-4 bg-white border-b border-slate-100 shrink-0 overflow-x-auto custom-scrollbar">
          <div className="flex items-start justify-between min-w-[500px] sm:min-w-0">
            {STEPS.map((step, i) => {
              const isDone    = i < currentStepIdx;
              const isCurrent = i === currentStepIdx;
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

        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-6 custom-scrollbar bg-slate-50/30">
          
           {isOffer && status === "Selected" && (
             <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 shadow-sm flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Star className="w-6 h-6 text-amber-600 fill-amber-600" />
                </div>
                <div>
                  <h4 className="font-black text-amber-900 text-lg">You are Selected!</h4>
                  <p className="text-sm font-bold text-amber-700">The client has picked you for this gig. Please finalize your confirmation below.</p>
                </div>
             </div>
           )}

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Event Details</span>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0"><Clock className="w-5 h-5 text-indigo-500" /></div>
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Date & Time</span>
                      <span className="text-sm font-bold text-slate-800">
                        {date
                          ? (() => {
                              try {
                                return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(date));
                              } catch { return date; }
                            })()
                          : "TBD"}
                        {time ? ` @ ${(() => { try { return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${time}`)); } catch { return time; } })()}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0"><MapPin className="w-5 h-5 text-rose-500" /></div>
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Location</span>
                      <span className="text-sm font-bold text-slate-800">{address || "TBD"}</span>
                    </div>
                  </div>
                  {(city || state) && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 10v11M16 10v11M12 10v11" /></svg>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">City &amp; State</span>
                        <span className="text-sm font-bold text-slate-800">{[city, state].filter(Boolean).join(", ") || "TBD"}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Compensation</span>
                </div>
                <div className="flex items-center justify-between pt-2">
                   <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Gig Rate</span>
                      <span className="text-3xl font-black text-emerald-600">${payRate}</span>
                   </div>
                   <div className="px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100 font-bold text-emerald-700 text-xs">
                      Paid Post-Event
                   </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <div className="w-6 h-6 rounded-md bg-slate-50 flex items-center justify-center">
                    <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Requirements</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Job Type</span>
                      <span className="text-[13px] font-bold text-slate-800">{jobType}</span>
                   </div>
                   <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Duration</span>
                      <span className="text-[13px] font-bold text-slate-800">{duration}</span>
                   </div>
                   <div className="col-span-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Genders</span>
                      <span className="text-[13px] font-bold text-slate-800">{gender || "Not Specified"}</span>
                   </div>
                </div>
              </div>

              {customFields.length > 0 && (
                <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <div className="w-6 h-6 rounded-md bg-slate-50 flex items-center justify-center">
                      <Filter className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Additional Info</span>
                  </div>
                  <div className="space-y-4">
                    {customFields.map(([k, v]) => (
                      <div key={k}>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                        <span className="text-[13px] font-bold text-slate-800">{v && typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Booking Notes and Activity Log */}
              {(() => {
                const isAssociated = isApplied || isOffer || booking.talentId === currentUserId || booking.selectedTalentIds?.includes(currentUserId);
                return isAssociated && (
                  <div className="col-span-1 md:col-span-2 mt-4">
                    <EntityNotes 
                      companyId={booking.companyId}
                      entityId={booking.id}
                      entityType="booking"
                      title="Booking Notes"
                      placeholder="Add a note to this booking..."
                    />
                  </div>
                );
              })()}
           </div>

           <div className="pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              {(() => {
                const assignedTalentIdsVal = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
                const isAssignedOrSelected = booking.talentId === currentUserId || assignedTalentIdsVal.includes(currentUserId);
                return isAssignedOrSelected && (
                  <BookingChatButton 
                    bookingId={booking.id} 
                    userId={currentUserId} 
                    onClick={onChat}
                    className="h-11 px-5"
                  />
                );
              })()}
              {(!isApplied && status === "Pending") && (
                 <div className="flex flex-col space-y-4 w-full animate-in fade-in duration-300">
                    {!showCustomOffer ? (
                      <div className="flex flex-wrap items-center justify-end gap-3">
                         <Button onClick={() => onHide(booking.id)} disabled={accepting} variant="outline" className="rounded-xl h-12 px-6 font-bold text-slate-500 border-slate-200 hover:bg-slate-50">Hide Offer</Button>
                         <Button onClick={() => setShowCustomOffer(true)} disabled={accepting} variant="outline" className="rounded-xl h-12 px-6 font-bold text-indigo-600 border-indigo-200 hover:bg-indigo-50">Offer Different Terms</Button>
                         <Button onClick={() => onApply(booking.id)} disabled={accepting} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-12 px-8 font-bold shadow-lg shadow-indigo-200">
                            {accepting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />} Apply to Gig
                         </Button>
                      </div>
                    ) : (
                      <div className="bg-indigo-50/40 border border-indigo-100/80 rounded-2xl p-5 space-y-4 w-full">
                         <h4 className="font-black text-indigo-950 text-sm">Propose Custom Terms for this Gig</h4>
                         <p className="text-xs text-indigo-600 font-semibold leading-relaxed">Select the items you would like to offer differently, specify your preferred terms, and click apply.</p>
                         
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* Checkbox & Input Date */}
                            <div className="bg-white rounded-xl p-4 border border-indigo-50 shadow-sm space-y-3">
                               <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                  <input 
                                     type="checkbox" 
                                     checked={offerDate} 
                                     onChange={(e) => setOfferDate(e.target.checked)} 
                                     className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                  />
                                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Different Date</span>
                               </label>
                               {offerDate && (
                                  <input 
                                     type="date" 
                                     value={customDate} 
                                     onChange={(e) => setCustomDate(e.target.value)} 
                                     className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                  />
                               )}
                            </div>

                            {/* Checkbox & Input Time */}
                            <div className="bg-white rounded-xl p-4 border border-indigo-50 shadow-sm space-y-3">
                               <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                  <input 
                                     type="checkbox" 
                                     checked={offerTime} 
                                     onChange={(e) => setOfferTime(e.target.checked)} 
                                     className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                  />
                                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Different Time</span>
                               </label>
                               {offerTime && (
                                  <input 
                                     type="time" 
                                     value={customTime} 
                                     onChange={(e) => setCustomTime(e.target.value)} 
                                     className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                  />
                               )}
                            </div>

                            {/* Checkbox & Input Rate */}
                            <div className="bg-white rounded-xl p-4 border border-indigo-50 shadow-sm space-y-3">
                               <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                  <input 
                                     type="checkbox" 
                                     checked={offerRate} 
                                     onChange={(e) => setOfferRate(e.target.checked)} 
                                     className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                  />
                                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Different Rate</span>
                               </label>
                               {offerRate && (
                                  <div className="relative">
                                     <span className="absolute left-3 top-2.5 text-slate-400 text-xs font-bold">$</span>
                                     <input 
                                        type="number" 
                                        min="1" 
                                        step="1"
                                        placeholder="0"
                                        value={customRate} 
                                        onChange={(e) => setCustomRate(e.target.value)} 
                                        className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-2.5 pl-7 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                     />
                                  </div>
                               )}
                            </div>
                         </div>

                         <div className="flex items-center justify-end gap-3 pt-2">
                            <Button onClick={() => setShowCustomOffer(false)} disabled={accepting} variant="outline" className="rounded-xl h-11 px-5 font-bold text-slate-500 border-slate-200 bg-white hover:bg-slate-50">Cancel</Button>
                            <Button 
                               disabled={accepting || (!offerDate && !offerTime && !offerRate)}
                               onClick={() => {
                                  const customOffer: any = {};
                                  if (offerDate) customOffer.proposedDate = customDate;
                                  if (offerTime) customOffer.proposedTime = customTime;
                                  if (offerRate) customOffer.proposedRate = customRate;
                                  onApply(booking.id, customOffer);
                               }}
                               className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 px-6 font-bold shadow-lg shadow-indigo-200"
                            >
                               {accepting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />} Apply with Custom Terms
                            </Button>
                         </div>
                      </div>
                    )}
                 </div>
              )}

              {(isOffer && !booking.talentId && status !== "Completed" && status !== "Cancelled") && (
                <div className="flex items-center justify-end gap-3">
                   <Button onClick={() => onDecline(booking.id)} disabled={accepting} variant="outline" className="rounded-xl h-12 px-8 font-bold text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600">Decline</Button>
                   <Button onClick={() => onConfirm(booking.id)} disabled={accepting} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-12 px-10 font-bold shadow-lg shadow-emerald-200">
                      {accepting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />} Finalize Confirmation
                   </Button>
                </div>
              )}
              
              {status === "Confirmed" && (
                <div className="flex items-center justify-end gap-3 w-full">
                   <Button onClick={onReviewClient} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-12 px-8 font-bold shadow-lg shadow-emerald-100 flex items-center gap-2">
                      <Check className="w-4 h-4" /> Mark Completed
                   </Button>
                </div>
              )}
              {status === "Completed" && !booking.talentReviewed && (
                <div className="flex items-center justify-end gap-3 w-full">
                   <Button onClick={onReviewClient} className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-12 px-8 font-bold shadow-lg shadow-amber-100 flex items-center gap-2">
                      <Star className="w-4 h-4 fill-white" /> Review Client
                   </Button>
                </div>
              )}
              {status === "Completed" && booking.talentReviewed && booking.clientReviewed && (
                <div className="space-y-3 w-full">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center"><Star className="w-3 h-3 text-white fill-white" /></div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Reviews (Both Parties Submitted)</p>
                  </div>
                  {/* Your Review of Client */}
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-2">
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Your Review of Client</p>
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(s => <Star key={s} className={`w-4 h-4 ${s <= (booking.talentRatingForClient || 5) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />)}
                    </div>
                    <p className="text-sm font-semibold text-slate-700">{booking.talentCommentForClient || "No written feedback provided."}</p>
                  </div>
                  {/* Client Review of You */}
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Client's Review of You</p>
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(s => <Star key={s} className={`w-4 h-4 ${s <= (booking.clientRatingForTalent || 5) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />)}
                    </div>
                    <p className="text-sm font-semibold text-slate-700">{booking.clientCommentForTalent || "No written feedback provided."}</p>
                  </div>
                </div>
              )}
              {(isApplied && status === "Pending") && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                   <p className="text-sm font-bold text-indigo-700 flex items-center gap-2">
                     <Clock className="w-4 h-4" /> Application Under Review · We'll notify you if selected.
                   </p>
                   <Button
                     onClick={() => onWithdraw(booking.id)}
                     disabled={accepting}
                     variant="outline"
                     className="shrink-0 h-10 px-5 rounded-xl font-bold text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 transition-all"
                   >
                     {accepting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <X className="w-4 h-4 mr-2" />}
                     Withdraw Application
                   </Button>
                </div>
              )}
           </div>
        </div>
      </div>
      {showActivity && <TalentActivityHistoryModal booking={booking} onClose={() => setShowActivity(false)} currentUserId={currentUserId} />}
    </div>
  );
}

export const TalentActivityHistoryModal = ({ booking, onClose, currentUserId }: any) => {
   const getTimeline = () => {
      const evts: any[] = [];
      
      if (booking.createdAt) evts.push({ type: 'created', at: booking.createdAt, icon: <Clock className="w-4 h-4 text-white" />, color: 'bg-blue-500', title: 'Booking Open', desc: `Client is currently looking for talents.` });

      if (booking.applicants && booking.applicants.includes(currentUserId)) {
         const simulatedAt = new Date(new Date(booking.createdAt).getTime() + 5000).toISOString();
         evts.push({ type: 'applied', at: simulatedAt, icon: <Users className="w-4 h-4 text-white" />, color: 'bg-indigo-500', title: 'You Applied', desc: `You expressed interest in this gig.` });
      }

      if (booking.assignmentHistory) {
         let ash: any[] = [];
         if (Array.isArray(booking.assignmentHistory)) ash = booking.assignmentHistory;
         else if (typeof booking.assignmentHistory === 'string') {
            try { ash = JSON.parse(booking.assignmentHistory); } catch (e) {}
         }
         ash.forEach((a: any) => {
            if (a.talentId === currentUserId) {
               let descText = "";
               let icon = <Clock className="w-4 h-4 text-white" />;
               let color = "bg-slate-500";
               let title = "Log Entry";

               if (a.type === 'assigned') {
                  descText = "Client selected/assigned you for this gig.";
                  icon = <Users className="w-4 h-4 text-white" />;
                  color = "bg-indigo-500";
                  title = "You Were Selected";
               } else if (a.type === 'confirmed') {
                  descText = "You finalized and accepted this gig offer.";
                  icon = <CheckCircle2 className="w-4 h-4 text-white" />;
                  color = "bg-emerald-500";
                  title = "You Confirmed Offer";
               } else if (a.type === 'declined') {
                  descText = "You declined this gig offer.";
                  icon = <X className="w-4 h-4 text-white" />;
                  color = "bg-red-500";
                  title = "You Declined Offer";
               } else if (a.type === 'withdrawn') {
                  descText = "You withdrew your application.";
                  icon = <X className="w-4 h-4 text-white" />;
                  color = "bg-rose-500";
                  title = "Application Withdrawn";
               } else {
                  descText = "Your assignment was withdrawn.";
                  icon = <X className="w-4 h-4 text-white" />;
                  color = "bg-slate-500";
                  title = "Assignment Removed";
               }

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
                     descText += ` Custom terms proposed: ${terms.join(", ")}.`;
                  }
               }

               evts.push({
                  type: a.type,
                  at: a.at,
                  icon,
                  color,
                  title,
                  desc: descText
               });
            }
         });
      }

      if (booking.receiptUploadedAt) evts.push({ type: 'payment_proof', at: booking.receiptUploadedAt, icon: <Activity className="w-4 h-4 text-white" />, color: 'bg-orange-500', title: 'Pending Payment', desc: `Client has submitted payment.` });
      if (booking.paidAt) evts.push({ type: 'payment_approved', at: booking.paidAt, icon: <CheckCircle2 className="w-4 h-4 text-white" />, color: 'bg-emerald-500', title: 'Payment Confirmed', desc: `Payment cleared.` });
      if (booking.status?.toLowerCase() === 'completed') evts.push({ type: 'completed', at: new Date().toISOString(), icon: <CheckCircle2 className="w-4 h-4 text-white" />, color: 'bg-indigo-800', title: 'Booking Completed', desc: `Gig finished.` });

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

export default function TalentBookingsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = use(params);
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500">Loading...</div>}>
      <BookingsContent companyId={companyId} />
    </Suspense>
  );
}

function TalentRateClientModal({ booking, companyId, onClose, onCompleted }: {
  booking: any,
  companyId: string,
  onClose: () => void,
  onCompleted: (updatedBooking: any) => void
}) {
  const { user } = useAuth();
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await addDoc(collection(db, "reviews"), {
        bookingId: booking.id,
        companyId,
        fromId: user.uid,
        toId: booking.clientId || "guest",
        fromRole: "talent",
        rating,
        comment,
        createdAt: new Date().toISOString()
      });

      const updates: any = {
        talentMarkedComplete: true,
        talentReviewed: true,
        talentRatingForClient: rating,
        talentCommentForClient: comment
      };

      if (booking.status === "Confirmed") {
        updates.status = "Completed";
        const historyEntry = {
          type: 'completed',
          at: new Date().toISOString(),
          talentName: user.displayName || user.email || "Talent",
          rating,
          comment
        };
        updates.assignmentHistory = arrayUnion(historyEntry);
      }

      await updateDoc(doc(db, "bookings", booking.id), updates);

      if (booking.clientId && booking.clientId !== "guest") {
        const clientUserRef = doc(db, "users", booking.clientId);
        const cSnap = await getDoc(clientUserRef);
        if (cSnap.exists()) {
          const cData = cSnap.data();
          const oldRating = Number(cData.clientRating) || 5;
          const oldCount = Number(cData.clientReviewsCount) || 0;
          const newCount = oldCount + 1;
          const newRating = ((oldRating * oldCount) + rating) / newCount;
          await updateDoc(clientUserRef, {
            clientRating: Number(newRating.toFixed(2)),
            clientReviewsCount: newCount
          });
        }
      }

      showSuccess("Review submitted successfully.");
      onCompleted({
        ...booking,
        status: "Completed",
        talentReviewed: true
      });
    } catch (e) {
      console.error(e);
      showError("Failed to submit review. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const name = booking.clientName || booking.__clientName || "Client";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
      <div className="w-[96%] sm:max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-white/20 rounded-xl"><Star className="w-5 h-5 text-amber-300 fill-amber-300" /></div>
             <h3 className="font-black text-lg">Review Client</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-20 h-20 rounded-[24px] bg-slate-100 border border-slate-200 flex items-center justify-center text-indigo-600 shadow-inner">
               <User className="w-10 h-10" />
            </div>
            <div>
               <h4 className="font-black text-slate-800 text-md">{name}</h4>
               <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">Booking Client</p>
            </div>
          </div>

          <div className="space-y-4">
             <div className="text-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Rate Your Experience</span>
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
                   placeholder="Describe your experience working with this client..."
                   value={comment}
                   onChange={e => setComment(e.target.value)}
                   rows={4}
                   className="w-full text-sm font-bold text-slate-800 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 placeholder:text-slate-400 bg-slate-50/50"
                />
             </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} className="rounded-xl font-bold h-11 px-5 border-slate-200 text-slate-600 hover:bg-slate-100 bg-white">Cancel</Button>
          <Button 
             disabled={loading} 
             onClick={handleSubmit} 
             className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold h-11 px-6 shadow-md shadow-emerald-100 flex items-center gap-2"
          >
             {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Submit Review
          </Button>
        </div>
      </div>
    </div>
  );
}
