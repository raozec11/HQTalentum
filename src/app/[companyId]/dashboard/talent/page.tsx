"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { 
  collection, query, where, onSnapshot, doc, updateDoc, 
  getDoc, arrayUnion 
} from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { 
  Calendar, Star, DollarSign, MessageSquare, MapPin, 
  Clock, AlertCircle, ChevronRight, Check, X, Loader2, Sparkles, User
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notifications";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";
import { showSuccess, showError } from "@/lib/alerts";

interface BookingRecord {
  id: string;
  clientName: string;
  clientEmail: string;
  clientGender?: string;
  eventDate: string;
  eventTime?: string;
  duration?: number;
  address?: string;
  city: string;
  state: string;
  jobType: string;
  payRate: number;
  tipAmount: number;
  tipStatus: string;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  applicants: string[];
  talentId: string;
  selectedTalentId: string;
  selectedTalentIds?: string[];
  assignmentHistory?: any[];
  clientId?: string;
}

export default function TalentDashboard() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [activeChatBooking, setActiveChatBooking] = useState<BookingRecord | null>(null);

  const [talentProfile, setTalentProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [verifyingPhone, setVerifyingPhone] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [otpCodeInput, setOtpCodeInput] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpVerifyError, setOtpVerifyError] = useState("");

  const refreshTalentProfile = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, "talents", user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTalentProfile(data);
        const p = data.phone || data.phoneNumber || data.mobile || "";
        setPhoneInput(p);
      }
    } catch (err) {
      console.error("Error refreshing profile:", err);
    }
  };

  useEffect(() => {
    if (!user) return;
    async function loadTalentProfile() {
      if (!user) return;
      try {
        const docRef = doc(db, "talents", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTalentProfile(data);
          const p = data.phone || data.phoneNumber || data.mobile || "";
          setPhoneInput(p);
        }
      } catch (err) {
        console.error("Error loading talent profile:", err);
      } finally {
        setProfileLoading(false);
      }
    }
    loadTalentProfile();
  }, [user]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput.trim()) {
      showError("Please enter a valid phone number.");
      return;
    }
    setSendingOtp(true);
    setOtpVerifyError("");
    try {
      const res = await fetch("/api/notifications/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.uid, phone: phoneInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOtpSent(true);
        showSuccess("Verification code sent to your phone!");
      } else {
        showError(data.error || "Failed to send verification code.");
      }
    } catch (err: any) {
      console.error(err);
      showError("Failed to send code.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCodeInput.trim() || otpCodeInput.trim().length !== 6) {
      setOtpVerifyError("Please enter the 6-digit code.");
      return;
    }
    setVerifyingPhone(true);
    setOtpVerifyError("");
    try {
      const res = await fetch("/api/notifications/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.uid, code: otpCodeInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showSuccess("Phone number verified successfully!");
        setOtpSent(false);
        setOtpCodeInput("");
        await refreshTalentProfile();
      } else {
        setOtpVerifyError(data.error || "Verification failed.");
      }
    } catch (err: any) {
      console.error(err);
      setOtpVerifyError("Verification failed.");
    } finally {
      setVerifyingPhone(false);
    }
  };

  // 1. Real-time Bookings snapshot listeners
  useEffect(() => {
    if (!user || !companyId) return;

    const ids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));
    const results: Record<string, BookingRecord[]> = {};
    const unsubscribes: (() => void)[] = [];

    const setupListener = (queryKey: string, q: any) => {
      const unsub = onSnapshot(q, (snap: any) => {
        results[queryKey] = snap.docs.map((docSnap: any) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            clientName: data.clientName || data.__clientName || "Unknown Client",
            clientEmail: data.clientEmail || data.__email || data.__clientEmail || "",
            clientGender: data.gender || data.__gender || "any",
            eventDate: data.eventDate || "",
            eventTime: data.eventTime || "",
            duration: parseFloat(data.duration || 0),
            address: data.address || data.__address || "",
            city: data.city || data.__city || "",
            state: data.state || data.__state || "",
            jobType: data.jobType || data.__jobType || "Unspecified",
            payRate: parseFloat(data.payRate || 0),
            tipAmount: parseFloat(data.tipAmount || 0),
            tipStatus: data.tipStatus || "",
            status: data.status || "Pending",
            paymentStatus: data.paymentStatus || "",
            paymentMethod: data.paymentMethod || "",
            applicants: data.applicants || [],
            talentId: data.talentId || "",
            selectedTalentId: data.selectedTalentId || "",
            selectedTalentIds: data.selectedTalentIds || [],
            assignmentHistory: data.assignmentHistory || [],
            clientId: data.clientId || "",
            clientReviewed: data.clientReviewed || false,
            clientRatingForTalent: data.clientRatingForTalent || 0
          } as any;
        });

        // Merge all snapshot arrays
        const merged = new Map<string, BookingRecord>();
        Object.values(results).forEach(list => {
          list.forEach(b => merged.set(b.id, b));
        });
        setBookings(Array.from(merged.values()));
        setLoading(false);
      }, (err: any) => {
        console.error("Bookings listener error:", err);
      });
      unsubscribes.push(unsub);
    };

    ids.forEach((id, idx) => {
      setupListener(`app_${idx}`, query(collection(db, "bookings"), where("companyId", "==", id), where("applicants", "array-contains", user.uid)));
      setupListener(`sel_${idx}`, query(collection(db, "bookings"), where("companyId", "==", id), where("selectedTalentId", "==", user.uid)));
      setupListener(`sel_arr_${idx}`, query(collection(db, "bookings"), where("companyId", "==", id), where("selectedTalentIds", "array-contains", user.uid)));
      setupListener(`tal_${idx}`, query(collection(db, "bookings"), where("companyId", "==", id), where("talentId", "==", user.uid)));
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [user, companyId]);

  // 2. Real-time Chats listener (Subscribing individually to bookings the user is a member of to avoid security rule conflicts)
  useEffect(() => {
    // Filter bookings where user is a participant (assigned, selected, or applicant)
    const chatMemberBookings = bookings.filter(b => {
      const isConfirmed = b.talentId === user?.uid;
      const isSelected = b.selectedTalentId === user?.uid || b.selectedTalentIds?.includes(user?.uid || "");
      const isApplicant = b.applicants?.includes(user?.uid || "");
      return isConfirmed || isSelected || isApplicant;
    });

    if (chatMemberBookings.length === 0) {
      setChats([]);
      return;
    }

    const unsubscribes = chatMemberBookings.map(b => {
      return onSnapshot(
        doc(db, "chats", b.id),
        (docSnap) => {
          if (docSnap.exists()) {
            const chatData = { id: docSnap.id, ...docSnap.data() };
            setChats(prev => {
              const map = new Map<string, any>();
              prev.forEach(c => map.set(c.id, c));
              map.set(chatData.id, chatData);
              return Array.from(map.values());
            });
          }
        },
        (err) => {
          console.warn("Failed to listen to individual chat:", b.id, err);
        }
      );
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [bookings, user]);

  // 3. Dynamic Calculation Hooks
  const pendingOffers = useMemo(() => {
    return bookings.filter(b => {
      const isSelected = b.selectedTalentId === user?.uid || b.selectedTalentIds?.includes(user?.uid || "");
      const isAssigned = b.talentId === user?.uid;
      return isSelected && !isAssigned && b.status !== "Cancelled";
    });
  }, [bookings, user]);

  const upcomingGigs = useMemo(() => {
    const today = new Date(new Date().setHours(0, 0, 0, 0));
    return bookings
      .filter(b => b.talentId === user?.uid && (b.status === "Confirmed" || b.status === "Assigned") && b.eventDate)
      .map(b => ({ ...b, parsedDate: new Date(b.eventDate) }))
      .filter(b => b.parsedDate >= today)
      .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
  }, [bookings, user]);

  const nextGig = useMemo(() => {
    return upcomingGigs[0] || null;
  }, [upcomingGigs]);

  const monthlyEarnings = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return bookings
      .filter(b => {
        if (b.talentId !== user?.uid || b.status !== "Completed" || !b.eventDate) return false;
        const ed = new Date(b.eventDate);
        return ed.getMonth() === currentMonth && ed.getFullYear() === currentYear;
      })
      .reduce((sum, b) => {
        const base = b.payRate || 0;
        const tips = b.tipStatus === "Paid" ? (b.tipAmount || 0) : 0;
        return sum + base + tips;
      }, 0);
  }, [bookings, user]);

  const averageRating = useMemo(() => {
    const reviewedBookings = bookings.filter(b => b.talentId === user?.uid && (b as any).clientReviewed && typeof (b as any).clientRatingForTalent === "number" && (b as any).clientRatingForTalent > 0);
    if (reviewedBookings.length === 0) return { avg: "5.0", count: 0 };
    const sum = reviewedBookings.reduce((s, b) => s + ((b as any).clientRatingForTalent || 0), 0);
    return {
      avg: (sum / reviewedBookings.length).toFixed(1),
      count: reviewedBookings.length
    };
  }, [bookings, user]);

  const chatSessions = useMemo(() => {
    const bookingMap = new Map(bookings.map(b => [b.id, b]));
    
    return chats
      .map(chat => {
        const booking = bookingMap.get(chat.bookingId);
        if (!booking) return null; // Only show chats for bookings the talent is involved in
        
        // Calculate unread status
        const lastMessageAt = chat.lastMessageAt;
        const lastSenderId = chat.lastSenderId;
        const lastReadMap = chat.lastRead || {};
        const myLastRead = lastReadMap[user?.uid || ""];

        let hasUnread = false;
        if (lastMessageAt && lastSenderId !== user?.uid) {
          if (!myLastRead) hasUnread = true;
          else hasUnread = new Date(lastMessageAt).getTime() > new Date(myLastRead).getTime();
        }

        return {
          chat,
          booking,
          hasUnread,
          lastMessageAt: chat.lastMessageAt || chat.createdAt || ""
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b!.lastMessageAt).getTime() - new Date(a!.lastMessageAt).getTime()) as {
        chat: any;
        booking: BookingRecord;
        hasUnread: boolean;
        lastMessageAt: string;
      }[];
  }, [chats, bookings, user]);

  // 4. Booking Acceptance and Decline Actions
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
      const offerNode = bookings.find(b => b.id === bookingId);
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
      
      const clientEmail = offerNode?.clientEmail || (offerNode as any)?.__email || (offerNode as any)?.__clientEmail || "";
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

      // Notify other applicants that booking is filled
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

      showSuccess("Booking confirmed successfully!");
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
      const node = bookings.find(b => b.id === bookingId);
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
      
      const clientEmail = node?.clientEmail || (node as any)?.__email || (node as any)?.__clientEmail || "";
      if (clientEmail) {
         await sendNotification({
           userId: node?.clientId || "guest",
           companyId,
           recipientEmail: clientEmail,
           title: "Talent Unavailable",
           message: `${user.name || "A talent"} is unavailable for your booking #${bookingId.substring(0, 8)}. Please select another talent.`,
           type: "alert",
           link: node?.clientId && node?.clientId !== "guest" ? `/${companyId}/dashboard/client/bookings/all` : undefined
         });
      }

      showSuccess("Offer declined.");
    } catch (err) {
      console.error("Decline failed:", err);
      showError("Failed to decline offer.");
    } finally {
      setAccepting(null);
    }
  };

  // Helper relative time parser
  const formatRelativeTime = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.round(diffMs / 60000);
      const diffHours = Math.round(diffMs / 3600000);
      const diffDays = Math.round(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch (e) {
      return "";
    }
  };

  // Helper date formatter
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "TBD";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    } catch (e) {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading Portal Feed...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-700 pb-12 w-full px-4 sm:px-6 lg:px-8">
      
      {/* Header and availability banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] md:text-[36px] font-black text-[#1e1b4b] tracking-tight leading-none">Talent Portal</h1>
          <p className="text-slate-500 font-semibold mt-2">Welcome back, {user?.name || "Performer"}. Here is your live operations feed.</p>
        </div>
        <div className="text-[13px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200/50 px-5 py-2.5 rounded-2xl shadow-sm flex items-center gap-2.5 w-fit">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          Status: Available for Gigs
        </div>
      </div>

      {/* Phone Number Verification Card */}
      {talentProfile && !talentProfile.phoneVerified && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50/50 border border-amber-200/80 rounded-[32px] p-6 sm:p-8 shadow-[0_4px_24px_rgba(245,158,11,0.05)] grid grid-cols-1 lg:grid-cols-12 gap-6 items-center animate-in slide-in-from-top duration-300 w-full min-w-0">
          <div className="lg:col-span-7 space-y-3 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-amber-950 uppercase tracking-wider truncate">Verification Checklist</h3>
                <p className="text-slate-500 font-semibold text-xs mt-0.5">Please verify your contact details to enable active bookings.</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3 pt-2">
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-3.5 py-1.5 rounded-xl text-xs font-bold text-emerald-700">
                <Check className="w-3.5 h-3.5" /> Email Verified
              </div>
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-600">
                <X className="w-3.5 h-3.5" /> Contact Number Unverified
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white rounded-2xl p-4 sm:p-5 border border-amber-100/80 shadow-sm w-full min-w-0">
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-3 w-full min-w-0">
                <label className="text-xs font-bold text-slate-700 block">Verify Contact Number</label>
                <div className="flex flex-col sm:flex-row gap-2.5 w-full min-w-0">
                  <input 
                    type="tel"
                    placeholder="Enter phone number (e.g. +15551234567)"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 min-w-0 w-full"
                    required
                  />
                  <button 
                    type="submit"
                    disabled={sendingOtp || !phoneInput.trim()}
                    className="h-10 px-5 bg-amber-500 hover:bg-amber-600 active:scale-95 transition-all text-white text-xs font-extrabold rounded-xl shrink-0 flex items-center justify-center gap-1.5 shadow-sm shadow-amber-500/10 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    {sendingOtp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Send Code"}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                  We'll send a 6-digit OTP code to verify this phone number for bookings & alerts.
                </p>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-3 w-full min-w-0">
                <div className="flex justify-between items-baseline flex-wrap gap-1">
                  <label className="text-xs font-bold text-slate-700 block">Enter Verification Code</label>
                  <button 
                    type="button" 
                    onClick={() => setOtpSent(false)} 
                    className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    Change Number
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5 w-full min-w-0">
                  <input 
                    type="text"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    value={otpCodeInput}
                    onChange={e => setOtpCodeInput(e.target.value.replace(/\D/g, ""))}
                    className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl text-center text-sm font-black tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 min-w-0 w-full"
                    required
                  />
                  <button 
                    type="submit"
                    disabled={verifyingPhone || otpCodeInput.length !== 6}
                    className="h-10 px-5 bg-slate-900 hover:bg-slate-800 active:scale-95 transition-all text-white text-xs font-extrabold rounded-xl shrink-0 flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    {verifyingPhone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Verify Code"}
                  </button>
                </div>
                {otpVerifyError && (
                  <p className="text-[10px] text-red-500 font-bold">{otpVerifyError}</p>
                )}
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold pt-1 flex-wrap gap-1">
                  <span>Code sent to {phoneInput}</span>
                  <button 
                    type="button" 
                    onClick={handleSendOtp} 
                    className="text-amber-600 hover:text-amber-700 underline font-bold cursor-pointer"
                  >
                    Resend Code
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Statistics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 w-full min-w-0">
        {/* Next gig widget */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-[28px] p-6 sm:p-7 text-white shadow-xl shadow-indigo-600/10 hover:-translate-y-0.5 transition-all duration-300 min-w-0">
          <div className="flex flex-col h-full justify-between min-w-0">
            <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-4 sm:mb-6 flex items-center gap-2 truncate">
              <Calendar className="w-4 h-4 text-indigo-200 shrink-0" /> Next Gig Schedule
            </span>
            <div className="min-w-0">
              {nextGig ? (
                <>
                  <span className="text-xl sm:text-2xl font-black leading-tight block truncate min-w-0">
                    {formatDate(nextGig.eventDate)}
                  </span>
                  <p className="text-indigo-100 text-[12px] font-bold mt-1.5 flex items-center gap-1 truncate">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" /> {nextGig.jobType}
                  </p>
                </>
              ) : (
                <>
                  <span className="text-xl sm:text-2xl font-black leading-tight block truncate min-w-0">None Scheduled</span>
                  <p className="text-indigo-200 text-[11px] font-semibold mt-1 truncate">Accept offers to get booked</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Monthly earnings card */}
        <div className="bg-white rounded-[28px] p-6 sm:p-7 border border-slate-200/60 shadow-xl shadow-slate-100/40 hover:-translate-y-0.5 transition-all duration-300 min-w-0">
          <div className="flex flex-col h-full justify-between min-w-0">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 sm:mb-6 flex items-center gap-2 truncate">
              <DollarSign className="w-4 h-4 text-emerald-500 shrink-0" /> Earnings (Current Month)
            </span>
            <div className="min-w-0">
              <span className="text-2xl sm:text-3xl font-black text-slate-900 leading-none block truncate min-w-0">${monthlyEarnings.toLocaleString()}</span>
              <p className="text-slate-400 text-[12px] font-bold mt-1.5 truncate">Completed gig rates + tips</p>
            </div>
          </div>
        </div>

        {/* Average review stars card */}
        <div className="bg-white rounded-[28px] p-6 sm:p-7 border border-slate-200/60 shadow-xl shadow-slate-100/40 hover:-translate-y-0.5 transition-all duration-300 min-w-0">
          <div className="flex flex-col h-full justify-between min-w-0">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 sm:mb-6 flex items-center gap-2 truncate">
              <Star className="w-4 h-4 text-amber-500 animate-pulse shrink-0" /> Portal Rating
            </span>
            <div className="min-w-0">
              <span className="text-2xl sm:text-3xl font-black text-[#1e293b] flex items-baseline gap-1 leading-none truncate min-w-0">
                {averageRating.avg}
                <span className="text-[14px] font-bold text-slate-400">/5</span>
              </span>
              <p className="text-slate-400 text-[12px] font-bold mt-1.5 truncate">Based on {averageRating.count} review logs</p>
            </div>
          </div>
        </div>

        {/* Action item count widget */}
        <div className="bg-white rounded-[28px] p-6 sm:p-7 border border-slate-200/60 shadow-xl shadow-slate-100/40 hover:-translate-y-0.5 transition-all duration-300 min-w-0">
          <div className="flex flex-col h-full justify-between min-w-0">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 sm:mb-6 flex items-center gap-2 truncate">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" /> Pending Offers
            </span>
            <div className="min-w-0">
              <span className={`text-2xl sm:text-3xl font-black leading-none block truncate min-w-0 ${pendingOffers.length > 0 ? "text-rose-500 animate-pulse" : "text-slate-900"}`}>
                {pendingOffers.length}
              </span>
              <p className="text-slate-400 text-[12px] font-bold mt-1.5 truncate">Selected by clients for review</p>
            </div>
          </div>
        </div>
      </div>

      {/* 5. URGENT OFFERS CARD: Render if there are selected bookings waiting for action */}
      {pendingOffers.length > 0 && (
        <Card className="rounded-[32px] border-rose-200/80 bg-rose-50/20 shadow-xl shadow-rose-950/5 p-8 border-2">
          <CardHeader className="p-0 mb-6">
            <div className="flex items-center gap-2">
              <span className="flex h-3.5 w-3.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
              </span>
              <CardTitle className="font-black text-rose-950 text-lg uppercase tracking-wider">Urgent Offers: Action Required</CardTitle>
            </div>
            <CardDescription className="text-rose-800 font-semibold text-xs mt-1">
              You have been selected by clients for the following gigs. Please review and confirm your availability.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 grid grid-cols-1 md:grid-cols-2 gap-6">
            {pendingOffers.map(offer => (
              <div 
                key={offer.id} 
                className="bg-white border border-rose-100 shadow-sm p-6 rounded-2xl flex flex-col justify-between gap-6"
              >
                {/* Details layout */}
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[11px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-md uppercase tracking-wider">
                      {offer.jobType}
                    </span>
                    <span className="text-[12px] font-bold text-slate-900 font-mono">
                      ID: {offer.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                  <h4 className="font-black text-slate-900 text-md">{offer.clientName}</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatDate(offer.eventDate)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{offer.eventTime || "TBD"} ({offer.duration ? `${offer.duration}h` : "N/A"})</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:col-span-2">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />
                      <span className="truncate">{[offer.city, offer.state].filter(Boolean).join(", ") || "Venue Details TBD"}</span>
                    </div>
                  </div>
                </div>

                {/* Offer Action Buttons layout */}
                <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
                  <div className="text-sm font-black text-emerald-600 flex-1">
                    Rate: ${offer.payRate.toFixed(2)}
                  </div>
                  
                  <button
                    onClick={() => handleDeclineOffer(offer.id)}
                    disabled={accepting !== null}
                    className="h-9 px-4 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-black flex items-center gap-1 transition-all disabled:opacity-50"
                  >
                    {accepting === offer.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    Decline
                  </button>

                  <button
                    onClick={() => handleConfirmOffer(offer.id)}
                    disabled={accepting !== null}
                    className="h-9 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1 transition-all disabled:opacity-50 shadow-md shadow-slate-900/10"
                  >
                    {accepting === offer.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Confirm Booking
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Main split grid: Left schedule / Right messaging panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* Left schedule widget */}
        <div className="xl:col-span-2 bg-white rounded-[32px] border border-slate-200/60 shadow-xl shadow-slate-100/40 p-8 flex flex-col justify-between min-h-[450px]">
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-[#1e1b4b] text-md uppercase tracking-wider">Upcoming Schedule</h3>
              <button 
                onClick={() => router.push(`/${companyId}/dashboard/talent/bookings?tab=upcoming`)}
                className="text-xs font-black text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 hover:underline"
              >
                View calendar <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            {upcomingGigs.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200/80 flex flex-col items-center justify-center">
                 <Calendar className="w-8 h-8 text-slate-300 mb-2" />
                 <p className="font-bold">You have no upcoming events.</p>
                 <p className="text-[11px] text-slate-400 mt-0.5">Update your availability or apply for jobs to get booked!</p>
              </div>
            ) : (
              <div className="space-y-4">
                 {upcomingGigs.slice(0, 4).map(gig => {
                   // Search for unread chat in this gig
                   const hasUnread = chatSessions.some(c => c.booking.id === gig.id && c.hasUnread);
                   
                   return (
                     <div 
                       key={gig.id} 
                       className="group border border-slate-100 hover:border-slate-200/80 hover:bg-slate-50/40 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
                     >
                       <div className="flex items-center gap-4">
                         <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600 shrink-0">
                           <Calendar className="w-5 h-5" />
                         </div>
                         <div className="space-y-1">
                           <h4 className="font-black text-slate-900 text-sm">{gig.clientName}</h4>
                           <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-semibold">
                             <span className="text-indigo-600 font-bold">{gig.jobType}</span>
                             <span>•</span>
                             <span>{formatDate(gig.eventDate)} @ {gig.eventTime || "TBD"}</span>
                             <span>•</span>
                             <span className="flex items-center gap-0.5"><MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" /> {gig.city}, {gig.state}</span>
                           </div>
                         </div>
                       </div>
                       
                       <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-none pt-3 sm:pt-0">
                         <span className="text-sm font-black text-emerald-600">
                           ${gig.payRate.toFixed(0)}
                         </span>

                         <button
                           onClick={() => setActiveChatBooking(gig)}
                           className={`h-9 px-4 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm border ${
                             hasUnread 
                               ? "border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 animate-pulse" 
                               : "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
                           }`}
                         >
                           <MessageSquare className="w-3.5 h-3.5" />
                           <span>Chat</span>
                           {hasUnread && (
                             <span className="w-2 h-2 rounded-full bg-rose-500" />
                           )}
                         </button>
                       </div>
                     </div>
                   );
                 })}
              </div>
            )}
          </div>

          {upcomingGigs.length > 0 && (
             <p className="text-[11px] text-slate-400 font-medium mt-6 border-t border-slate-100 pt-4">
               Gigs require attendance at the specified event hours. Contact coordinates via the booking chat interface.
             </p>
          )}
        </div>

        {/* Right messaging widgets panel */}
        <div className="xl:col-span-1 bg-white rounded-[32px] border border-slate-200/60 shadow-xl shadow-slate-100/40 p-8 flex flex-col justify-between min-h-[450px]">
          <div>
            <h3 className="font-black text-[#1e1b4b] text-md uppercase tracking-wider mb-6">Active Channels</h3>
            
            {chatSessions.length === 0 ? (
              <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center">
                 <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
                 <p className="text-xs font-bold text-slate-500">No active chat sessions.</p>
                 <p className="text-[10.5px] text-slate-400 mt-0.5">Chats activate when you apply for gigs.</p>
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
                 {chatSessions.slice(0, 5).map(session => {
                   const { chat, booking, hasUnread, lastMessageAt } = session;
                   return (
                     <div
                       key={chat.id}
                       onClick={() => setActiveChatBooking(booking)}
                       className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                         hasUnread 
                           ? "border-indigo-100 bg-indigo-50/30 hover:bg-indigo-50/50" 
                           : "border-slate-100 hover:border-slate-200/60 hover:bg-slate-50/50"
                       }`}
                     >
                       <div className="min-w-0 flex-1">
                         <div className="flex justify-between items-baseline gap-2">
                           <h5 className="font-black text-slate-900 text-xs truncate max-w-[120px]">{booking.clientName}</h5>
                           <span className="text-[9.5px] font-black text-slate-400 shrink-0 font-mono">
                             {formatRelativeTime(lastMessageAt)}
                           </span>
                         </div>
                         <p className="text-[10.5px] font-bold text-indigo-600 truncate mt-0.5">{booking.jobType}</p>
                         <p className="text-[11px] text-slate-400 font-semibold truncate mt-1">
                           {chat.lastMessageText || "No messages logged yet."}
                         </p>
                       </div>
                       
                       {hasUnread && (
                         <span className="w-2.5 h-2.5 bg-rose-500 rounded-full shrink-0 shadow-sm shadow-rose-500/35 animate-pulse" />
                       )}
                     </div>
                   );
                 })}
              </div>
            )}
          </div>
          
          <div className="border-t border-slate-100 pt-4 mt-6">
            <button 
              onClick={() => router.push(`/${companyId}/dashboard/talent/bookings?tab=all`)}
              className="text-xs font-black text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 hover:underline w-full justify-center"
            >
              See all operational logs <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 6. Dynamic Chat overlay dialog */}
      {activeChatBooking && (
        <BookingChatModal 
          booking={activeChatBooking}
          user={user}
          onClose={() => setActiveChatBooking(null)}
        />
      )}
      
    </div>
  );
}
