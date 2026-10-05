"use client";

import { useState, useEffect, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot } from "firebase/firestore";
import { 
  Calendar, Clock, MapPin, Briefcase, DollarSign, User, Users, 
  CheckCircle, Loader2, ArrowLeft, Star, FileText, Check, X, ShieldCheck,
  UserCheck, AlertCircle, Award, Sparkles, Phone, Mail, Compass, MessageSquare
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { sendNotificationToAdmins, sendNotification } from "@/lib/notifications";
import { useAuth } from "@/context/AuthContext";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";
import { BookingChatButton } from "@/components/bookings/BookingChatButton";

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
  selectedTalentId?: string | null;
  selectedTalentIds?: string[];
  applicants?: string[];
  customOffers?: Record<string, {
    proposedDate?: string;
    proposedTime?: string;
    proposedRate?: string;
    submittedAt?: string;
  }>;
  createdAt: string;
}

interface TalentData {
  uid: string;
  name: string;
  displayName?: string;
  username?: string;
  customUrl?: string;
  urlSlug?: string;
  photoUrl?: string;
  profileImage?: string;
  talentType?: string;
  categories?: string[];
  locations?: string[];
  city?: string;
  state?: string;
  rating?: number;
  email?: string;
}

export default function GuestBookingReviewPage(props: { params: Promise<{ companyId: string; bookingId: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [companyLogo, setCompanyLogo] = useState("");
  
  // All fetched performer profiles
  const [performers, setPerformers] = useState<Record<string, TalentData>>({});
  const [activeTab, setActiveTab] = useState<"applicants" | "hired">("applicants");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [performersLoading, setPerformersLoading] = useState(false);

  // Chat State
  const [showChatModal, setShowChatModal] = useState(false);

  const chatUser = useMemo(() => {
    if (user) return user;
    return {
      uid: booking?.clientId && booking?.clientId !== "guest" ? booking.clientId : `guest_${booking?.id || params.bookingId}`,
      name: booking?.clientName || "Guest Client",
      email: booking?.clientEmail || "",
      role: "client"
    };
  }, [user, booking, params.bookingId]);

  const safeFormatDate = (dateStr?: string) => {
    if (!dateStr) return "Not Specified";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d);
    } catch (e) {
      return dateStr;
    }
  };

  const safeFormatTime = (timeStr?: string) => {
    if (!timeStr) return "Not Specified";
    try {
      if (/[a-zA-Z]/.test(timeStr)) return timeStr;
      const d = new Date(`2000-01-01T${timeStr}`);
      if (isNaN(d.getTime())) return timeStr;
      return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
    } catch (e) {
      return timeStr;
    }
  };

  const fetchDetails = async () => {
    try {
      const companyIdClean = (params.companyId || "").toLowerCase();
      const bookingRef = doc(db, "bookings", params.bookingId);
      const companyRef = doc(db, "companies", companyIdClean);

      // 1. Fetch booking and company in parallel for super-fast initial render
      const [bookingSnap, companySnap] = await Promise.all([
        getDoc(bookingRef),
        getDoc(companyRef)
      ]);

      if (!bookingSnap.exists()) {
        setBooking(null);
        setLoading(false);
        return;
      }

      const raw = bookingSnap.data() || {};
      const bookingData = { id: bookingSnap.id, ...raw } as Booking;
      const bCompany = (raw.companyId || params.companyId || "").toLowerCase();
      
      // Verify company matches safely
      if (bCompany !== companyIdClean) {
        setBooking(null);
        setLoading(false);
        return;
      }

      setBooking(bookingData);

      if (companySnap.exists()) {
        const cData = companySnap.data();
        setCompanyName(cData.name || params.companyId.toUpperCase());
        setCompanyLogo(cData.logoUrl || cData.logo || "");
      } else {
        setCompanyName(params.companyId.toUpperCase());
      }

      // UNBLOCK UI IMMEDIATELY - Don't wait for performer profile network calls!
      setLoading(false);

      // 2. Fetch applicants, hired performers, and declined performers in background
      const applicantIds = bookingData.applicants || [];
      const hiredIds = bookingData.selectedTalentIds || (bookingData.selectedTalentId ? [bookingData.selectedTalentId] : []);
      const rawDeclined = (bookingData as any).declinedTalentIds || [];
      const historyDeclined = (bookingData as any).assignmentHistory
        ?.filter((h: any) => h.type === "declined" && h.talentId)
        ?.map((h: any) => h.talentId) || [];
      const allDeclinedUids = Array.from(new Set([...rawDeclined, ...historyDeclined])) as string[];

      const allTargetUids = Array.from(new Set([...applicantIds, ...hiredIds, ...allDeclinedUids]));

      if (allTargetUids.length > 0) {
        setPerformersLoading(true);
        const profilesMap: Record<string, TalentData> = {};
        await Promise.all(
          allTargetUids.map(async (uid) => {
            try {
              const [userSnap, talentSnap] = await Promise.all([
                getDoc(doc(db, "users", uid)).catch(() => null),
                getDoc(doc(db, "talents", uid)).catch(() => null)
              ]);
              const uData = userSnap && userSnap.exists ? userSnap.data() : {};
              const tData = talentSnap && talentSnap.exists ? talentSnap.data() : {};
              
              const resolvedName = tData.displayName || tData.name || uData.name || uData.displayName || "Unknown Performer";
              const photo = tData.photoUrl || tData.profileImage || uData.photoUrl || uData.profileImage || "";
              
              profilesMap[uid] = {
                uid,
                name: resolvedName,
                displayName: resolvedName,
                username: tData.username || "",
                customUrl: tData.customUrl || tData.urlSlug || "",
                photoUrl: photo,
                profileImage: photo,
                talentType: tData.talentType || uData.talentType || "",
                categories: tData.categories || uData.categories || [],
                locations: tData.locations || uData.locations || [],
                city: tData.city || uData.city || "",
                state: tData.state || uData.state || "",
                rating: tData.rating || uData.rating || 5.0,
                email: uData.email || tData.email || ""
              };
            } catch (e) {
              console.error(`Failed to fetch profile for performer: ${uid}`, e);
            }
          })
        );
        setPerformers(profilesMap);
        setPerformersLoading(false);
      } else {
        setPerformers({});
      }
    } catch (err) {
      console.error("Failed to fetch guest booking review details:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();

    if (!params.bookingId) return;
    const unsub = onSnapshot(doc(db, "bookings", params.bookingId), (snap) => {
      if (snap.exists()) {
        const updatedData = { id: snap.id, ...snap.data() } as Booking;
        setBooking(prev => prev ? { ...prev, ...updatedData } : updatedData);
      }
    }, (err) => console.error("Error subscribing to guest booking updates:", err));

    return () => unsub();
  }, [params.bookingId, params.companyId]);

  const handleAcceptTalent = async (talent: TalentData) => {
    if (!booking) return;
    
    const limit = parseInt(booking.numEntertainers || "1");
    const currentSelected = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
    
    if (currentSelected.includes(talent.uid)) return;
    if (currentSelected.length >= limit) {
      showError(`You have already hired the maximum limit of ${limit} entertainers.`);
      return;
    }

    const customOffer = booking.customOffers?.[talent.uid];
    const newSelectedIds = [...currentSelected, talent.uid];
    const newStatus = newSelectedIds.length >= limit ? "Selected" : booking.status || "Pending";

    const updates: any = {
      selectedTalentIds: newSelectedIds,
      selectedTalentId: newSelectedIds[0] || null,
      status: newStatus
    };

    const historyEntry: any = {
      type: "assigned",
      talentId: talent.uid,
      talentName: talent.name,
      at: new Date().toISOString(),
      clientName: booking.clientName || "Client (Guest)"
    };

    // Format dates/times for comparisons
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

    let confirmHtml = `<div class="text-left space-y-3 text-slate-600 text-sm">
      <p class="font-semibold text-slate-800 text-md">Are you sure you want to hire <strong>${talent.name}</strong>?</p>
      <p>By selecting this performer, they will be officially reserved for your event.</p>`;

    if (customOffer && limit === 1) {
      const changes: string[] = [];
      const hasDateChange = customOffer.proposedDate && customOffer.proposedDate !== booking.eventDate;
      const hasTimeChange = customOffer.proposedTime && customOffer.proposedTime !== booking.eventTime;
      const hasRateChange = customOffer.proposedRate && customOffer.proposedRate !== booking.payRate;

      if (hasDateChange) {
        changes.push(`
          <div class="flex flex-col items-center py-2 border-b border-slate-100">
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</span>
            <div class="flex items-center gap-2 mt-1">
              <span class="line-through text-slate-400">${formatDate(booking.eventDate)}</span>
              <span class="text-slate-400">&rarr;</span>
              <span class="font-extrabold text-amber-600">${formatDate(customOffer.proposedDate)}</span>
            </div>
          </div>
        `);
      }
      if (hasTimeChange) {
        changes.push(`
          <div class="flex flex-col items-center py-2 border-b border-slate-100">
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</span>
            <div class="flex items-center gap-2 mt-1">
              <span class="line-through text-slate-400">${formatTime(booking.eventTime)}</span>
              <span class="text-slate-400">&rarr;</span>
              <span class="font-extrabold text-amber-600">${formatTime(customOffer.proposedTime)}</span>
            </div>
          </div>
        `);
      }
      if (hasRateChange) {
        changes.push(`
          <div class="flex flex-col items-center py-2">
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pay Rate</span>
            <div class="flex items-center gap-2 mt-1">
              <span class="line-through text-slate-400">$${booking.payRate}/hr</span>
              <span class="text-slate-400">&rarr;</span>
              <span class="font-extrabold text-emerald-600">$${customOffer.proposedRate}/hr</span>
            </div>
          </div>
        `);
      }

      if (changes.length > 0) {
        confirmHtml += `
          <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-3">
            <p class="text-xs font-bold text-amber-800 mb-2">Note: This is a custom offer. Selecting this performer will automatically update your event logistics:</p>
            ${changes.join("")}
          </div>
          <p class="text-xs text-rose-500 font-extrabold mt-3">Your booking details will update instantly and the checkout price will match the new rate of $${customOffer.proposedRate || booking.payRate}/hr.</p>
        `;
        
        if (customOffer.proposedDate) updates.eventDate = customOffer.proposedDate;
        if (customOffer.proposedTime) updates.eventTime = customOffer.proposedTime;
        if (customOffer.proposedRate) updates.payRate = customOffer.proposedRate;

        historyEntry.customTerms = {
          proposedDate: customOffer.proposedDate || null,
          proposedTime: customOffer.proposedTime || null,
          proposedRate: customOffer.proposedRate || null,
          originalDate: booking.eventDate || null,
          originalTime: booking.eventTime || null,
          originalRate: booking.payRate || null
        };
      }
    }

    confirmHtml += `</div>`;

    const confirmed = await confirmAction({
      title: "Confirm Booking Selection",
      html: confirmHtml,
      icon: "warning",
      confirmButtonText: "Confirm Hire",
      cancelButtonText: "Cancel"
    });

    if (!confirmed) return;

    setActionLoading(talent.uid);
    try {
      updates.assignmentHistory = arrayUnion(historyEntry);
      
      const bookingRef = doc(db, "bookings", booking.id);
      await updateDoc(bookingRef, updates);

      // Notify Admin
      await sendNotificationToAdmins(params.companyId, {
        title: `${booking.clientName || "Client"} Hired Talent`,
        message: `Client (${booking.clientName}) hired ${talent.name} for booking #${booking.id.substring(0, 8)}.`,
        type: "success",
        link: `/${params.companyId}/dashboard/admin/bookings/all`
      });

      // Notify Talent (Always trigger notification; server resolves email & phone automatically if empty)
      await sendNotification({
        userId: talent.uid,
        companyId: params.companyId,
        recipientEmail: talent.email || "",
        title: "Congratulations! You are Selected!",
        message: `You have been selected by the client for booking #${booking.id.substring(0, 8)}. Please review details on your dashboard and confirm your final availability.`,
        type: "success",
        link: `/${params.companyId}/dashboard/talent/bookings?tab=offers`
      });

      // Notify Client (Guest) that invoice is pending ONLY when all required talents have been selected
      const isAllSelected = newSelectedIds.length >= limit;
      if (isAllSelected && booking.clientEmail) {
        await sendNotification({
          userId: "guest",
          companyId: params.companyId,
          recipientEmail: booking.clientEmail,
          title: "Your invoice is pending",
          message: `All required performers have been selected for your event! Please complete the invoice payment of $${updates.payRate || booking.payRate || booking.__budget || 0} to finalize this booking.`,
          type: "info",
          link: `/${params.companyId}/guest/payment/${booking.id}`
        });
      }

      showSuccess("Performer selected successfully! We will finalize the event shortly.");
      await fetchDetails();
      setActiveTab("hired");
    } catch (err) {
      console.error("Failed to select applicant:", err);
      showError("Failed to confirm selection. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineTalent = async (talentUid: string, talentName: string) => {
    if (!booking) return;

    const confirmed = await confirmAction({
      title: "Decline Application?",
      text: `Are you sure you want to decline ${talentName}'s application for your event?`,
      icon: "warning",
      confirmButtonText: "Yes, Decline",
      cancelButtonText: "No, Keep"
    });

    if (!confirmed) return;

    setActionLoading(talentUid);
    try {
      const bookingRef = doc(db, "bookings", booking.id);
      await updateDoc(bookingRef, {
        applicants: arrayRemove(talentUid)
      });

      showSuccess("Application declined.");
      await fetchDetails();
    } catch (err) {
      console.error("Failed to decline applicant:", err);
      showError("Failed to decline application.");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-5">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
          <p className="text-slate-500 font-bold text-xs uppercase tracking-widest animate-pulse">Syncing Event Workspace...</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100/50 px-4">
        <Card className="max-w-md w-full rounded-[36px] border-none shadow-2xl p-10 text-center bg-white">
          <div className="w-20 h-20 bg-rose-50 rounded-[28px] flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-rose-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Access Link Invalid</h2>
          <p className="text-slate-500 mt-3 font-medium text-sm leading-relaxed">This secure link is either expired, completed, or doesn't belong to the current company directory. Please verify with your agency administrator.</p>
        </Card>
      </div>
    );
  }

  const limit = parseInt(booking.numEntertainers || "1");
  const selectedTalentIds = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
  const selectedCount = selectedTalentIds.length;
  const progressPercent = Math.min((selectedCount / limit) * 100, 100);

  // Divide fetched performers into Applicants & Hired groups
  const applicantPerformers = (booking.applicants || [])
    .filter(uid => !selectedTalentIds.includes(uid))
    .map(uid => performers[uid])
    .filter(Boolean);

  const hiredPerformers = selectedTalentIds
    .map(uid => performers[uid])
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-50/60 pb-24 text-slate-900 font-sans antialiased">
      
      {/* Brand Header */}
      <div className="relative bg-white/70 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-30 shadow-[0_4px_30px_rgba(0,0,0,0.02)]">
        {/* Glowing top line */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {companyLogo ? (
              <img src={companyLogo} alt={companyName} className="h-10 w-auto object-contain max-w-[160px] transition-transform duration-300 hover:scale-105" />
            ) : (
              <div className="h-10 w-10 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-xl flex items-center justify-center text-white font-extrabold text-base shadow-md shadow-indigo-200/50">
                T
              </div>
            )}
            <span className="font-extrabold text-slate-800 tracking-tight text-lg uppercase hidden sm:inline">{companyName}</span>
          </div>
          
          <div className="flex items-center gap-3">
            <BookingChatButton 
              bookingId={booking.id} 
              userId={chatUser.uid} 
              onClick={() => setShowChatModal(true)} 
              className="bg-white shadow-sm"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        {/* Dynamic Premium Header Hero */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-[32px] p-6 sm:p-10 mb-8 shadow-xl relative overflow-hidden">
          {/* Subtle decorations */}
          <div className="absolute right-0 bottom-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-1/3 top-0 w-64 h-64 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center flex-wrap gap-2.5">
                <span className="bg-white/10 backdrop-blur text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-white/15">
                  Guest Dashboard
                </span>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                  booking.status === "Pending" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                  booking.status === "Selected" ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" :
                  booking.status === "Confirmed" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                  "bg-white/10 text-white border-white/20"
                }`}>
                  {booking.status}
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
                Review Entertainers for Your Event
              </h1>
              <p className="text-indigo-200/80 text-sm font-medium max-w-2xl leading-relaxed">
                Review pending applications, compare custom rate proposals, and choose who you want to hire. Everything is automatically synced with our secure system.
              </p>
            </div>
            
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 min-w-[200px] shrink-0">
              <div className="flex items-center justify-between text-xs font-black text-indigo-200 uppercase tracking-wider mb-2">
                <span>Selected</span>
                <span>{selectedCount} of {limit} Booked</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-400 to-indigo-500 rounded-full transition-all duration-700"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-[11px] font-medium text-white/60">
                {selectedCount >= limit ? "✓ Event is fully hired" : `Requires ${limit - selectedCount} more entertainer${(limit - selectedCount) !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Booking Overview Card (Left) */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="rounded-[30px] border-slate-200/80 shadow-md bg-white overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-[#fbfcfd] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-500" />
                  <span className="text-sm font-black text-slate-800 tracking-tight uppercase">Event Summary</span>
                </div>
                <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
                  #{booking.id.substring(0, 8)}
                </span>
              </div>

              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                  
                  <div className="flex gap-3">
                    <div className="bg-indigo-50 p-2.5 rounded-xl shrink-0"><Briefcase className="w-4.5 h-4.5 text-indigo-600" /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Job Category</p>
                      <p className="text-sm font-bold text-slate-800 leading-snug mt-0.5">{booking.jobType || "General Service"}</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="bg-indigo-50 p-2.5 rounded-xl shrink-0"><Calendar className="w-4.5 h-4.5 text-indigo-600" /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</p>
                      <p className="text-sm font-bold text-slate-800 leading-snug mt-0.5">
                        {safeFormatDate(booking.eventDate)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="bg-indigo-50 p-2.5 rounded-xl shrink-0"><Clock className="w-4.5 h-4.5 text-indigo-600" /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Time & Duration</p>
                      <p className="text-sm font-bold text-slate-800 leading-snug mt-0.5">
                        {safeFormatTime(booking.eventTime)}
                        {booking.duration ? ` · (${booking.duration})` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="bg-indigo-50 p-2.5 rounded-xl shrink-0"><MapPin className="w-4.5 h-4.5 text-indigo-600" /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Venue Location</p>
                      <p className="text-sm font-bold text-slate-800 leading-snug mt-0.5">{booking.address}</p>
                      <p className="text-xs font-semibold text-slate-400 mt-0.5">{booking.city}, {booking.state}</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="bg-emerald-50 p-2.5 rounded-xl shrink-0"><DollarSign className="w-4.5 h-4.5 text-emerald-600" /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Original Rate</p>
                      <p className="text-md font-extrabold text-emerald-600 leading-snug mt-0.5">${booking.payRate}/hr</p>
                    </div>
                  </div>
                  
                </div>

                {booking.specialRequests && (
                  <div className="pt-5 border-t border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Event Instructions</p>
                    <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl text-xs font-semibold text-slate-600 leading-relaxed italic">
                      "{booking.specialRequests}"
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100">
                  <Button 
                    onClick={() => setShowChatModal(true)}
                    className="w-full h-11 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs flex items-center justify-center gap-2 border border-indigo-200/60 shadow-xs"
                  >
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    <span>Open Booking Chat</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performers Navigation & List (Right) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Custom Premium Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-2xl w-full border border-slate-200">
              <button
                onClick={() => setActiveTab("applicants")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-black transition-all ${
                  activeTab === "applicants"
                    ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Compass className="w-4 h-4 shrink-0" />
                <span>Applicants</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md min-w-[20px] font-bold ${
                  activeTab === "applicants" ? "bg-indigo-150 text-indigo-600" : "bg-slate-200 text-slate-500"
                }`}>
                  {applicantPerformers.length}
                </span>
              </button>
              
              <button
                onClick={() => setActiveTab("hired")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-black transition-all ${
                  activeTab === "hired"
                    ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Award className="w-4 h-4 shrink-0" />
                <span>Hired Crew</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md min-w-[20px] font-bold ${
                  activeTab === "hired" ? "bg-indigo-150 text-indigo-600" : "bg-slate-200 text-slate-500"
                }`}>
                  {hiredPerformers.length}
                </span>
              </button>
            </div>

            {/* Render selected performer lists */}
            <div className="space-y-6">
              {activeTab === "applicants" ? (
                // Applicants Tab
                <>
                  {applicantPerformers.map((talent) => {
                    const customOffer = booking.customOffers?.[talent.uid];
                    const rawDeclined = (booking as any).declinedTalentIds || [];
                    const historyDeclined = (booking as any).assignmentHistory
                      ?.filter((h: any) => h.type === "declined" && h.talentId)
                      ?.map((h: any) => h.talentId) || [];
                    const isDeclined = rawDeclined.includes(talent.uid) || historyDeclined.includes(talent.uid);
                    
                    return (
                      <div 
                        key={talent.uid}
                        className={`bg-white rounded-[28px] border p-5 sm:p-7 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group ${
                          isDeclined ? "border-rose-200/90 bg-rose-50/10" : "border-slate-200/80 hover:border-indigo-400"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
                          
                          {/* Left Profile Identity */}
                          <div className="flex gap-4 items-start">
                            {talent.photoUrl ? (
                              <img 
                                src={talent.photoUrl} 
                                alt={talent.name} 
                                className="w-16 h-16 sm:w-20 sm:h-20 rounded-[22px] object-cover bg-slate-50 border border-slate-200/70 shadow-sm"
                              />
                            ) : (
                              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[22px] bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 font-black text-2xl shadow-inner shrink-0">
                                {talent.name.charAt(0)}
                              </div>
                            )}

                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-extrabold text-slate-900 text-md sm:text-lg leading-tight capitalize">{talent.name}</h3>
                              </div>

                              <p className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-300" />
                                {talent.city ? `${talent.city}, ${talent.state}` : (talent.locations?.[0] || "Global Area")}
                              </p>

                              <div className="flex items-center gap-1 text-[11px] font-extrabold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg w-max shadow-sm">
                                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> 
                                {Number(talent.rating || 5).toFixed(1)}
                              </div>
                              
                              {(() => {
                                const catsSet = new Set<string>();
                                const addCats = (val: any) => {
                                  if (Array.isArray(val)) {
                                    val.forEach(v => { if (typeof v === "string" && v.trim()) catsSet.add(v.trim()); });
                                  } else if (typeof val === "string" && val.trim()) {
                                    val.split(",").forEach(v => { if (v.trim()) catsSet.add(v.trim()); });
                                  }
                                };
                                addCats(talent.talentType);
                                addCats(talent.categories);
                                const catList = Array.from(catsSet);
                                const displayList = catList.length > 0 ? catList : ["Performer"];

                                return (
                                  <div className="flex flex-wrap gap-1.5 pt-1">
                                    {displayList.slice(0, 4).map(cat => (
                                      <span key={cat} className="text-[10px] font-black text-indigo-600 bg-indigo-50/80 border border-indigo-100 px-2.5 py-0.5 rounded-md uppercase tracking-wider shadow-2xs">
                                        {cat}
                                      </span>
                                    ))}
                                    {displayList.length > 4 && (
                                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                        +{displayList.length - 4} More
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Right Offer Terms Summary */}
                          <div className="shrink-0 w-full sm:w-max">
                            {isDeclined ? (
                              <div className="bg-rose-50 border border-rose-200/80 rounded-[20px] p-4 space-y-1 text-xs font-bold text-rose-700 shadow-2xs">
                                <div className="text-[9px] font-black text-rose-800 uppercase tracking-widest flex items-center gap-1.5 border-b border-rose-200/50 pb-1">
                                  <X className="w-3.5 h-3.5 text-rose-600 stroke-[3]" /> 
                                  Talent Unavailable
                                </div>
                                <p className="pt-1 text-rose-800 font-extrabold">Talent Declined the Job</p>
                                <p className="text-[11px] text-rose-600 font-medium">This performer has declined the offer and is unavailable.</p>
                              </div>
                            ) : customOffer ? (
                              <div className="bg-amber-50 border border-amber-200/80 rounded-[20px] p-4 space-y-2.5">
                                <div className="text-[9px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5 border-b border-amber-200/50 pb-1">
                                  <Sparkles className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> 
                                  Proposed Custom Offer
                                </div>
                                
                                <div className="space-y-1.5 text-xs font-bold text-slate-700">
                                  {customOffer.proposedDate && (
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                      <span className="text-slate-400 font-medium w-9">Date:</span>
                                      <span className="text-amber-850">
                                        {safeFormatDate(customOffer.proposedDate)}
                                      </span>
                                    </div>
                                  )}

                                  {customOffer.proposedTime && (
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                      <span className="text-slate-400 font-medium w-9">Time:</span>
                                      <span className="text-amber-850">
                                        {safeFormatTime(customOffer.proposedTime)}
                                      </span>
                                    </div>
                                  )}

                                  {customOffer.proposedRate && (
                                    <div className="flex items-center gap-2">
                                      <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <span className="text-slate-400 font-medium w-9">Rate:</span>
                                      <span className="text-emerald-700 font-black">${customOffer.proposedRate}/hr</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                Standard Offer Terms
                              </div>
                            )}
                          </div>

                        </div>

                        {/* Card Bottom Actions Area */}
                        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 mt-6 border-t border-slate-100">
                          <a 
                            href={`/${params.companyId}/talent/${talent.customUrl || talent.username || talent.uid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-10 px-5 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors flex items-center justify-center"
                          >
                            View Portfolio
                          </a>

                          {isDeclined ? (
                            <div className="h-10 px-5 rounded-xl text-xs font-black bg-rose-50 text-rose-700 border border-rose-200/90 flex items-center justify-center gap-1.5 shadow-2xs">
                              <X className="w-4 h-4 stroke-[3]" /> Talent Declined Job
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => handleDeclineTalent(talent.uid, talent.name)}
                                disabled={actionLoading !== null}
                                className="h-10 px-5 rounded-xl text-xs font-bold border border-rose-200 text-rose-600 bg-rose-50/20 hover:bg-rose-50 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                              >
                                <X className="w-3.5 h-3.5" /> Decline
                              </button>

                              <Button
                                onClick={() => handleAcceptTalent(talent)}
                                disabled={actionLoading !== null || selectedCount >= limit}
                                className="h-10 px-6 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all flex items-center justify-center gap-1 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                              >
                                {actionLoading === talent.uid ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                Hire Performer
                              </Button>
                            </>
                          )}
                        </div>

                      </div>
                    );
                  })}

                  {performersLoading ? (
                    <Card className="text-center py-16 border border-slate-200 bg-white rounded-[32px] p-6 shadow-sm">
                      <Loader2 className="w-8 h-8 mx-auto text-indigo-600 animate-spin mb-3" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading Performer Profiles...</p>
                    </Card>
                  ) : applicantPerformers.length === 0 ? (
                    <Card className="text-center py-20 border border-dashed border-slate-350 bg-slate-100/30 rounded-[32px] p-6">
                      <Users className="w-12 h-12 mx-auto text-indigo-300 opacity-60 mb-4 stroke-[1.5]" />
                      <h4 className="text-lg font-black text-slate-800">No Applicants Yet</h4>
                      <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">Performer matches are pending. As soon as entertainers apply or accept matching invitations, they will appear here.</p>
                    </Card>
                  ) : null}
                </>
              ) : (
                // Hired Tab
                <>
                  {hiredPerformers.map((talent) => {
                    const customOffer = booking.customOffers?.[talent.uid];
                    
                    return (
                      <div 
                        key={talent.uid}
                        className="bg-white rounded-[28px] border-2 border-emerald-500 p-5 sm:p-7 shadow-md relative overflow-hidden"
                      >
                        {/* Hired Stamp */}
                        <div className="absolute right-0 top-0 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-bl-2xl flex items-center gap-1">
                          <Check className="w-3 h-3 stroke-[3]" /> Hired Performer
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
                          
                          {/* Identity Details */}
                          <div className="flex gap-4 items-start pt-2 sm:pt-0">
                            {talent.photoUrl ? (
                              <img 
                                src={talent.photoUrl} 
                                alt={talent.name} 
                                className="w-16 h-16 sm:w-20 sm:h-20 rounded-[22px] object-cover bg-slate-50 border border-slate-200/70 shadow-sm"
                              />
                            ) : (
                              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[22px] bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 font-black text-2xl shrink-0">
                                {talent.name.charAt(0)}
                              </div>
                            )}

                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-extrabold text-slate-900 text-md sm:text-lg leading-tight capitalize">{talent.name}</h3>
                                <span className="bg-emerald-50 border border-emerald-100 text-emerald-600 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md">
                                  {talent.talentType || "Performer"}
                                </span>
                              </div>

                              <p className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-300" />
                                {talent.city ? `${talent.city}, ${talent.state}` : (talent.locations?.[0] || "Global Area")}
                              </p>

                              <div className="flex items-center gap-1 text-[11px] font-extrabold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg w-max shadow-sm">
                                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> 
                                {Number(talent.rating || 5).toFixed(1)}
                              </div>
                            </div>
                          </div>

                          {/* Price/Terms details */}
                          <div className="shrink-0 w-full sm:w-max">
                            {customOffer ? (
                              <div className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-4 text-xs font-bold text-slate-600 space-y-1">
                                <span className="text-[9px] font-black text-amber-800 uppercase tracking-widest block mb-1">Hired Custom Rate</span>
                                <p><span className="text-slate-400 font-medium">Hired Rate:</span> <strong className="text-emerald-700 font-black">${customOffer.proposedRate}/hr</strong></p>
                                <p><span className="text-slate-400 font-medium">Target Date:</span> <strong className="text-slate-700">
                                  {safeFormatDate(customOffer.proposedDate || booking.eventDate)}
                                </strong></p>
                              </div>
                            ) : (
                              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-xs font-bold text-slate-600 space-y-1">
                                <span className="text-[9px] font-black text-emerald-800 uppercase tracking-widest block mb-1">Hired Booking Terms</span>
                                <p><span className="text-slate-400 font-medium">Hired Rate:</span> <strong className="text-emerald-700 font-black">${booking.payRate}/hr</strong></p>
                              </div>
                            )}
                          </div>

                        </div>

                        {/* Card bottom details */}
                        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 mt-6 border-t border-slate-100">
                          <a 
                            href={`/${params.companyId}/talent/${talent.customUrl || talent.username || talent.uid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-10 px-5 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors flex items-center justify-center"
                          >
                            View Portfolio
                          </a>
                          
                          <span className="h-10 px-5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Selection Finalized
                          </span>
                        </div>

                      </div>
                    );
                  })}

                  {hiredPerformers.length === 0 && (
                    <Card className="text-center py-20 border border-dashed border-slate-200 bg-slate-100/30 rounded-[32px] p-6">
                      <UserCheck className="w-12 h-12 mx-auto text-slate-350 opacity-60 mb-4 stroke-[1.5]" />
                      <h4 className="text-lg font-black text-slate-800">No Performers Selected</h4>
                      <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">You have not selected or hired any performers for this event yet. Go to the "Applicants" tab to select your talent.</p>
                    </Card>
                  )}
                </>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* Floating Action Chat Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <BookingChatButton 
          bookingId={booking.id} 
          userId={chatUser.uid} 
          onClick={() => setShowChatModal(true)}
          className="h-14 px-6 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xl border-2 border-white text-sm font-black transition-all hover:scale-105"
        />
      </div>

      {/* Real-time Booking Chat Modal */}
      {showChatModal && (
        <BookingChatModal 
          booking={booking} 
          user={chatUser} 
          onClose={() => setShowChatModal(false)} 
        />
      )}
    </div>
  );
}
