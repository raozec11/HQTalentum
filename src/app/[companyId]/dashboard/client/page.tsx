"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { 
  collection, query, where, onSnapshot, doc, updateDoc, 
  getDoc, addDoc, arrayUnion 
} from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { 
  Calendar, Star, DollarSign, MessageSquare, MapPin, 
  Clock, AlertCircle, ChevronRight, Check, X, Loader2, Sparkles, Plus, Award, CheckCircle2,
  Search, CreditCard
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";
import { showSuccess, showError } from "@/lib/alerts";

interface BookingRecord {
  id: string;
  clientName: string;
  clientEmail: string;
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
  clientReviewed?: boolean;
  clientRatingForTalent?: number;
}

export default function ClientDashboard() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [talents, setTalents] = useState<Record<string, any>>({});
  const [activeChatBooking, setActiveChatBooking] = useState<BookingRecord | null>(null);

  // Review Modal state
  const [reviewBooking, setReviewBooking] = useState<BookingRecord | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Advanced enhancements state
  const [activeTab, setActiveTab] = useState<"upcoming" | "pending" | "unpaid" | "unreviewed" | "completed" | "cancelled">("upcoming");
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Real-time Bookings snapshot listener
  useEffect(() => {
    if (!user || !companyId) return;

    const ids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));
    const results: Record<string, BookingRecord[]> = {};
    const unsubscribes: (() => void)[] = [];

    const setupListener = (queryKey: string, q: any) => {
      const unsub = onSnapshot(q, (snap: any) => {
        results[queryKey] = snap.docs.map((doc: any) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data
          } as any;
        });

        const merged = new Map<string, BookingRecord>();
        Object.values(results).forEach(list => {
          list.forEach(b => merged.set(b.id, b));
        });
        
        const data = Array.from(merged.values());

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
      }, (err: any) => {
        console.error("Client bookings listener error:", err);
      });
      unsubscribes.push(unsub);
    };

    const userEmail = user.email || "";
    ids.forEach((id, idx) => {
      setupListener(`client_bookings_uid_${idx}`, query(collection(db, "bookings"), where("companyId", "==", id), where("clientId", "==", user.uid)));
      if (userEmail) {
        setupListener(`client_bookings_email_${idx}`, query(collection(db, "bookings"), where("companyId", "==", id), where("clientEmail", "==", userEmail)));
      }
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [user, companyId]);

  // 2. Load Talents Directory (client-side lookup for profile photos & names)
  useEffect(() => {
    if (!companyId) return;
    
    const ids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));
    const unsubscribes = ids.map(id => {
      return onSnapshot(
        query(collection(db, "talents"), where("companyId", "==", id)),
        (snap) => {
          setTalents(prev => {
            const updated = { ...prev };
            snap.docs.forEach(doc => {
              updated[doc.id] = { id: doc.id, ...doc.data() };
            });
            return updated;
          });
        }
      );
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [companyId]);

  // 3. Real-time Chats listener (Subscribing individually to bookings)
  useEffect(() => {
    if (bookings.length === 0) {
      setChats([]);
      return;
    }

    const unsubscribes = bookings.map(b => {
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
          console.warn("Client chat listener error:", b.id, err);
        }
      );
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [bookings]);

  // 4. Dynamic Calculations
  const stats = useMemo(() => {
    const active = bookings.filter(b => b.status === "Confirmed" || b.status === "Assigned").length;
    const pending = bookings.filter(b => b.status === "Pending" || b.status === "Selected").length;
    const completed = bookings.filter(b => b.status === "Completed").length;
    
    // Unpaid bookings where a talent has been selected or assigned
    const pendingPaymentsCount = bookings.filter(b => {
      const hasTalent = b.selectedTalentId || b.talentId || (b.selectedTalentIds && b.selectedTalentIds.length > 0);
      const isPaid = b.paymentStatus === 'Paid';
      const isCancelled = b.status === 'Cancelled';
      return hasTalent && !isPaid && !isCancelled;
    }).length;

    return { active, pending, completed, pendingPaymentsCount };
  }, [bookings]);

  const upcomingBookings = useMemo(() => {
    const today = new Date(new Date().setHours(0, 0, 0, 0));
    return bookings
      .filter(b => (b.status === "Confirmed" || b.status === "Assigned") && b.eventDate)
      .map(b => ({ ...b, parsedDate: new Date(b.eventDate) }))
      .filter(b => b.parsedDate >= today)
      .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
  }, [bookings]);

  const pendingPaymentsList = useMemo(() => {
    return bookings.filter(b => {
      const hasTalent = b.selectedTalentId || b.talentId || (b.selectedTalentIds && b.selectedTalentIds.length > 0);
      const isPaid = b.paymentStatus === 'Paid';
      const isCancelled = b.status === 'Cancelled';
      return hasTalent && !isPaid && !isCancelled;
    });
  }, [bookings]);

  const pendingReviewsList = useMemo(() => {
    return bookings.filter(b => b.status === "Completed" && !b.clientReviewed && b.talentId);
  }, [bookings]);

  const chatSessions = useMemo(() => {
    const bookingMap = new Map(bookings.map(b => [b.id, b]));
    
    return chats
      .map(chat => {
        const booking = bookingMap.get(chat.bookingId);
        if (!booking) return null;
        
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

  const unreadMessagesCount = useMemo(() => {
    return chatSessions.filter(c => c.hasUnread).length;
  }, [chatSessions]);

  const tabBookingsList = useMemo(() => {
    switch (activeTab) {
      case "upcoming":
        return upcomingBookings;
      case "pending":
        return bookings.filter(b => b.status === "Pending" || b.status === "Selected");
      case "unpaid":
        return pendingPaymentsList;
      case "unreviewed":
        return pendingReviewsList;
      case "completed":
        return bookings.filter(b => b.status === "Completed");
      case "cancelled":
        return bookings.filter(b => b.status === "Cancelled");
      default:
        return [];
    }
  }, [activeTab, bookings, upcomingBookings, pendingPaymentsList, pendingReviewsList]);

  const filteredBookings = useMemo(() => {
    if (!searchQuery.trim()) return tabBookingsList;
    const queryLower = searchQuery.toLowerCase();
    return tabBookingsList.filter(b => {
      const performerId = b.talentId || b.selectedTalentId || (b.selectedTalentIds && b.selectedTalentIds[0]);
      const performerName = performerId ? (talents[performerId]?.name || talents[performerId]?.displayName || "") : "";
      
      return (
        b.jobType?.toLowerCase().includes(queryLower) ||
        b.city?.toLowerCase().includes(queryLower) ||
        b.state?.toLowerCase().includes(queryLower) ||
        performerName.toLowerCase().includes(queryLower) ||
        b.id.toLowerCase().includes(queryLower)
      );
    });
  }, [searchQuery, tabBookingsList, talents]);

  const getEmptyStateMessage = () => {
    switch (activeTab) {
      case "upcoming":
        return {
          title: "No upcoming active events scheduled",
          desc: "Explore the directory to find and request performers!",
          icon: <Calendar className="w-8 h-8 text-indigo-400" />
        };
      case "pending":
        return {
          title: "No pending requests",
          desc: "Your booking requests are either completed or assigned. Post a new job request above!",
          icon: <Clock className="w-8 h-8 text-amber-400" />
        };
      case "unpaid":
        return {
          title: "All payments caught up",
          desc: "You have no outstanding invoices to settle right now. Thank you!",
          icon: <CreditCard className="w-8 h-8 text-emerald-400" />
        };
      case "unreviewed":
        return {
          title: "No pending performer reviews",
          desc: "You have submitted reviews for all completed performer gigs. Great job!",
          icon: <Star className="w-8 h-8 text-indigo-400" />
        };
      case "completed":
        return {
          title: "No completed bookings yet",
          desc: "Completed events will display here with their feedback and earnings logs.",
          icon: <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        };
      case "cancelled":
        return {
          title: "No cancelled bookings",
          desc: "Your booking cancellation logs are clear.",
          icon: <X className="w-8 h-8 text-rose-400" />
        };
      default:
        return {
          title: "No bookings found",
          desc: "Try adjusting your search query or check other tabs.",
          icon: <Calendar className="w-8 h-8 text-slate-300" />
        };
    }
  };

  // 5. Review Submission Logic
  const handleSubmitReview = async () => {
    if (!reviewBooking || !reviewBooking.talentId) return;
    setSubmittingReview(true);
    try {
      const historyEntry = {
        type: 'completed',
        at: new Date().toISOString(),
        clientName: reviewBooking.clientName || "Client",
        rating,
        comment
      };

      // 1. Update Booking record
      await updateDoc(doc(db, "bookings", reviewBooking.id), {
        status: "Completed",
        clientMarkedComplete: true,
        clientReviewed: true,
        clientRatingForTalent: rating,
        clientCommentForTalent: comment,
        assignmentHistory: arrayUnion(historyEntry)
      });

      // 2. Add Review log doc
      await addDoc(collection(db, "reviews"), {
        bookingId: reviewBooking.id,
        companyId,
        fromId: user?.uid || "guest",
        toId: reviewBooking.talentId,
        fromRole: "client",
        rating,
        comment,
        createdAt: new Date().toISOString()
      });

      // 3. Update Talent metrics
      const tDocRef = doc(db, "talents", reviewBooking.talentId);
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
        await updateDoc(doc(db, "users", reviewBooking.talentId), {
          rating,
          reviewsCount: 1
        });
      }

      showSuccess("Review submitted successfully!");
      setReviewBooking(null);
      setRating(5);
      setComment("");
    } catch (e) {
      console.error(e);
      showError("Failed to submit review.");
    } finally {
      setSubmittingReview(false);
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

  const handleStatClick = (tabKey: "upcoming" | "pending" | "unpaid" | "unreviewed" | "completed" | "cancelled", targetId = "booking-center") => {
    setActiveTab(tabKey);
    setTimeout(() => {
      const el = document.getElementById(targetId);
      el?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading Client Hub...</p>
      </div>
    );
  }

  const showActionBanner = pendingPaymentsList.length > 0 || pendingReviewsList.length > 0;

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-700 pb-12 w-full px-4 sm:px-6 lg:px-8">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] md:text-[36px] font-black text-[#1e1b4b] tracking-tight leading-none">Client Hub</h1>
          <p className="text-slate-500 font-semibold mt-2">Welcome back, {user?.name || "Client"}. Track your bookings and requests.</p>
        </div>
        <button 
          onClick={() => router.push(`/${companyId}/dashboard/client/bookings/new`)}
          className="text-[13px] font-black text-white bg-indigo-600 hover:bg-indigo-700 px-6 py-3 rounded-2xl shadow-lg shadow-indigo-600/10 flex items-center gap-2 w-fit hover:scale-102 active:scale-98 transition-all"
        >
          <Plus className="w-4 h-4" /> Request New Booking
        </button>
      </div>

      {/* Dynamic Action Required Banner */}
      {showActionBanner && (
        <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-indigo-500/10 border border-slate-200/80 backdrop-blur-md rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-2xl shrink-0 animate-bounce">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-black text-[#1e1b4b] text-sm md:text-base leading-snug">Action Required on Your Bookings</h4>
              <p className="text-slate-500 text-xs font-semibold mt-1">
                {pendingPaymentsList.length > 0 && `💳 You have ${pendingPaymentsList.length} booking${pendingPaymentsList.length > 1 ? 's' : ''} awaiting payment.`}{" "}
                {pendingReviewsList.length > 0 && `⭐ You have ${pendingReviewsList.length} performer${pendingReviewsList.length > 1 ? 's' : ''} waiting for your review.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full md:w-auto">
            {pendingPaymentsList.length > 0 && (
              <button
                onClick={() => handleStatClick("unpaid")}
                className="flex-1 md:flex-none text-[11px] font-black text-white bg-slate-900 hover:bg-slate-800 px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95"
              >
                Pay Invoices
              </button>
            )}
            {pendingReviewsList.length > 0 && (
              <button
                onClick={() => handleStatClick("unreviewed")}
                className="flex-1 md:flex-none text-[11px] font-black text-[#1e1b4b] bg-amber-400 hover:bg-amber-500 px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95"
              >
                Rate Performers
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Statistics Row (6 Cards Grid) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        {/* Active Bookings Card */}
        <div 
          onClick={() => handleStatClick("upcoming")}
          className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-[28px] p-6 text-white shadow-xl shadow-indigo-600/10 hover:-translate-y-1 cursor-pointer transition-all duration-300"
        >
          <div className="flex flex-col h-full justify-between min-h-[100px]">
            <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-200" /> Active
            </span>
            <div>
              <span className="text-3xl font-black leading-none">{stats.active}</span>
              <p className="text-indigo-100 text-[10px] font-bold mt-1">Confirmed gigs</p>
            </div>
          </div>
        </div>

        {/* Pending Card */}
        <div 
          onClick={() => handleStatClick("pending")}
          className="bg-white rounded-[28px] p-6 border border-slate-200/60 shadow-xl shadow-slate-100/40 hover:-translate-y-1 cursor-pointer transition-all duration-300"
        >
          <div className="flex flex-col h-full justify-between min-h-[100px]">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> Pending
            </span>
            <div>
              <span className="text-3xl font-black text-slate-900 leading-none">{stats.pending}</span>
              <p className="text-slate-400 text-[10px] font-bold mt-1">Awaiting match</p>
            </div>
          </div>
        </div>

        {/* Completed Card */}
        <div 
          onClick={() => handleStatClick("completed")}
          className="bg-white rounded-[28px] p-6 border border-slate-200/60 shadow-xl shadow-slate-100/40 hover:-translate-y-1 cursor-pointer transition-all duration-300"
        >
          <div className="flex flex-col h-full justify-between min-h-[100px]">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Completed
            </span>
            <div>
              <span className="text-3xl font-black text-slate-900 leading-none">{stats.completed}</span>
              <p className="text-slate-400 text-[10px] font-bold mt-1">Past successful gigs</p>
            </div>
          </div>
        </div>

        {/* Upcoming Gigs Card */}
        <div 
          onClick={() => handleStatClick("upcoming")}
          className="bg-white rounded-[28px] p-6 border border-slate-200/60 shadow-xl shadow-slate-100/40 hover:-translate-y-1 cursor-pointer transition-all duration-300"
        >
          <div className="flex flex-col h-full justify-between min-h-[100px]">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" /> Upcoming
            </span>
            <div>
              <span className="text-3xl font-black text-slate-900 leading-none">{upcomingBookings.length}</span>
              <p className="text-slate-400 text-[10px] font-bold mt-1">Events starting today</p>
            </div>
          </div>
        </div>

        {/* Unread Messages Card */}
        <div 
          onClick={() => {
            const el = document.getElementById("active-channels-sidebar");
            el?.scrollIntoView({ behavior: "smooth" });
          }}
          className={`bg-white rounded-[28px] p-6 border shadow-xl shadow-slate-100/40 hover:-translate-y-1 cursor-pointer transition-all duration-300 ${
            unreadMessagesCount > 0 ? "border-amber-200 ring-2 ring-amber-400/20" : "border-slate-200/60"
          }`}
        >
          <div className="flex flex-col h-full justify-between min-h-[100px]">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <MessageSquare className={`w-4 h-4 text-sky-500 ${unreadMessagesCount > 0 ? "animate-bounce" : ""}`} /> Chats
            </span>
            <div>
              <span className={`text-3xl font-black leading-none ${unreadMessagesCount > 0 ? "text-amber-500 font-black" : "text-slate-900"}`}>
                {unreadMessagesCount}
              </span>
              <p className="text-slate-400 text-[10px] font-bold mt-1">Unread conversations</p>
            </div>
          </div>
        </div>

        {/* Awaiting Payments Card */}
        <div 
          onClick={() => handleStatClick("unpaid")}
          className={`bg-white rounded-[28px] p-6 border shadow-xl shadow-slate-100/40 hover:-translate-y-1 cursor-pointer transition-all duration-300 ${
            stats.pendingPaymentsCount > 0 ? "border-rose-200 ring-2 ring-rose-400/20" : "border-slate-200/60"
          }`}
        >
          <div className="flex flex-col h-full justify-between min-h-[100px]">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-rose-500" /> Payments
            </span>
            <div>
              <span className={`text-3xl font-black leading-none ${stats.pendingPaymentsCount > 0 ? "text-rose-500" : "text-slate-900"}`}>
                {stats.pendingPaymentsCount}
              </span>
              <p className="text-slate-400 text-[10px] font-bold mt-1">Awaiting invoice</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main split grid: Left tabbed Booking Center / Right messaging panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* Left Interactive Booking Center */}
        <div id="booking-center" className="xl:col-span-2 bg-white rounded-[32px] border border-slate-200/60 shadow-xl shadow-slate-100/40 p-8 flex flex-col justify-between min-h-[500px]">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-black text-[#1e1b4b] text-base md:text-lg uppercase tracking-wider">Booking Center</h3>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">Manage and track your performer agreements</p>
              </div>
              
              {/* Search Input */}
              <div className="relative w-full sm:w-64 shrink-0">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by role, city, name..."
                  className="w-full pl-10 pr-4 py-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            {/* Tab bar wrapping on mobile */}
            <div className="flex flex-wrap items-center gap-1.5 p-1.5 mb-6 bg-slate-100/60 rounded-[20px] border border-slate-200/40 w-fit">
              {[
                { id: "upcoming", label: "Upcoming Gigs", count: upcomingBookings.length },
                { id: "pending", label: "Pending Requests", count: bookings.filter(b => b.status === "Pending" || b.status === "Selected").length },
                { id: "unpaid", label: "Awaiting Payment", count: stats.pendingPaymentsCount },
                { id: "unreviewed", label: "Awaiting Review", count: pendingReviewsList.length },
                { id: "completed", label: "Completed", count: stats.completed },
                { id: "cancelled", label: "Cancelled", count: bookings.filter(b => b.status === "Cancelled").length }
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black shrink-0 transition-all duration-200 ${
                      isActive
                        ? "bg-slate-900 text-white shadow-md hover:scale-[1.02] active:scale-[0.98]"
                        : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold transition-all ${
                        isActive 
                          ? "bg-white/20 text-white" 
                          : "bg-slate-200 text-slate-600"
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Booking cards list */}
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
              {filteredBookings.length === 0 ? (
                (() => {
                  const empty = getEmptyStateMessage();
                  return (
                    <div className="text-sm text-slate-500 text-center py-20 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200/80 flex flex-col items-center justify-center p-6">
                      <div className="p-3 bg-white rounded-2xl shadow-sm mb-3">
                        {empty.icon}
                      </div>
                      <p className="font-bold text-slate-700 text-sm">{empty.title}</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-sm leading-relaxed">{empty.desc}</p>
                    </div>
                  );
                })()
              ) : (
                filteredBookings.map((item) => {
                  const tId = item.talentId || item.selectedTalentId || (item.selectedTalentIds && item.selectedTalentIds[0]);
                  const performer = tId ? talents[tId] : null;
                  const performerName = performer?.name || performer?.displayName || "Finding Performer Match...";
                  const performerImage = performer?.profileImage || performer?.photoUrl;
                  const initialString = performerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

                  // Status colors and borders
                  let statusColor = "bg-slate-50 text-slate-500 border-slate-100";
                  let leftBorderColor = "border-l-slate-300";
                  let avatarGradient = "from-[#1e1b4b] to-[#4f46e5]";

                  if (item.status === "Confirmed" || item.status === "Assigned") {
                    statusColor = "bg-emerald-50 text-emerald-700 border-emerald-100";
                    leftBorderColor = "border-l-emerald-500";
                    avatarGradient = "from-emerald-500 to-teal-600";
                  } else if (item.status === "Pending") {
                    statusColor = "bg-amber-50 text-amber-700 border-amber-100";
                    leftBorderColor = "border-l-amber-500";
                    avatarGradient = "from-amber-400 to-orange-500";
                  } else if (item.status === "Selected") {
                    statusColor = "bg-indigo-50 text-indigo-700 border-indigo-100 animate-pulse";
                    leftBorderColor = "border-l-indigo-500";
                    avatarGradient = "from-indigo-500 to-violet-600";
                  } else if (item.status === "Completed") {
                    statusColor = "bg-blue-50 text-blue-700 border-blue-100";
                    leftBorderColor = "border-l-blue-500";
                    avatarGradient = "from-blue-500 to-indigo-600";
                  } else if (item.status === "Cancelled") {
                    statusColor = "bg-rose-50 text-rose-700 border-rose-100";
                    leftBorderColor = "border-l-rose-500";
                    avatarGradient = "from-rose-500 to-pink-600";
                  }

                  const isUnpaid = (item.selectedTalentId || item.talentId || (item.selectedTalentIds && item.selectedTalentIds.length > 0)) && item.paymentStatus !== "Paid" && item.status !== "Cancelled";
                  const needsReview = item.status === "Completed" && !item.clientReviewed && item.talentId;
                  const hasUnread = chatSessions.some(c => c.booking.id === item.id && c.hasUnread);

                  return (
                    <div 
                      key={item.id} 
                      className={`group bg-white border border-slate-200/60 border-l-4 ${leftBorderColor} hover:border-indigo-200/80 p-5 rounded-[24px] flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5`}
                    >
                      <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="relative shrink-0">
                          {performerImage ? (
                            <img 
                              src={performerImage} 
                              alt={performerName} 
                              className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-md shadow-[#1e1b4b]/10"
                            />
                          ) : (
                            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${avatarGradient} border border-white/20 text-white flex items-center justify-center font-black text-sm shadow-md tracking-wider uppercase`}>
                              {initialString}
                            </div>
                          )}
                          {hasUnread && (
                            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500 shadow border border-white"></span>
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100/60 px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow-sm">{item.jobType}</span>
                            <span className={`text-[10px] font-black border px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow-sm ${statusColor}`}>{item.status}</span>
                            <span className="text-[11px] font-mono text-slate-400 font-bold">#{item.id.slice(0, 8).toUpperCase()}</span>
                          </div>

                          <h4 className="font-black text-slate-900 text-base tracking-tight leading-none">
                            {tId ? `Performer: ${performerName}` : "Finding Performer Match..."}
                          </h4>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-semibold">
                            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" /> {formatDate(item.eventDate)} @ {item.eventTime || "TBD"}</span>
                            <span>•</span>
                            <span className="flex items-center gap-0.5"><MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" /> {item.city}, {item.state}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-4 w-full md:w-auto border-t md:border-t-0 border-slate-100 pt-4 md:pt-0 shrink-0">
                        <div className="text-left md:text-right">
                          <span className="text-[10px] text-slate-400 font-black block uppercase tracking-wider animate-in">Pay Rate</span>
                          <span className="text-lg font-black text-slate-900">${Number(item.payRate || 0).toFixed(0)}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {tId && (
                            <button
                              onClick={() => setActiveChatBooking(item)}
                              className={`h-9 px-4 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all duration-200 shadow-sm border hover:scale-105 active:scale-95 ${
                                hasUnread 
                                  ? "border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 animate-pulse" 
                                  : "border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
                              }`}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Chat</span>
                            </button>
                          )}

                          {isUnpaid && (
                            <button
                              onClick={() => router.push(`/${companyId}/dashboard/client/payment/${item.id}`)}
                              className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 hover:scale-105 active:scale-95 text-white text-xs font-black transition-all duration-200 shadow-md shadow-slate-900/10 flex items-center gap-1.5"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Pay Invoice</span>
                            </button>
                          )}

                          {needsReview && (
                            <button
                              onClick={() => { setReviewBooking(item); setRating(5); setComment(""); }}
                              className="h-9 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 hover:scale-105 active:scale-95 text-white text-xs font-black transition-all duration-200 shadow-md shadow-amber-500/10 flex items-center gap-1.5"
                            >
                              <Award className="w-3.5 h-3.5" />
                              <span>Rate Performer</span>
                            </button>
                          )}

                          {item.clientReviewed && item.clientRatingForTalent && (
                            <div className="flex items-center gap-0.5 text-amber-500 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-100 font-black">
                              <Star className="w-3.5 h-3.5 fill-amber-500" />
                              <span className="text-xs font-black">{item.clientRatingForTalent}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-400 font-medium mt-6 border-t border-slate-100 pt-4">
            Total of {filteredBookings.length} booking record{filteredBookings.length !== 1 && 's'} listed in this category.
          </p>
        </div>

        {/* Right active chat conversations panel */}
        <div id="active-channels-sidebar" className="xl:col-span-1 bg-white rounded-[32px] border border-slate-200/60 shadow-xl shadow-slate-100/40 p-8 flex flex-col justify-between min-h-[450px]">
          <div>
            <h3 className="font-black text-[#1e1b4b] text-md uppercase tracking-wider mb-6">Active Channels</h3>
            
            {chatSessions.length === 0 ? (
              <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center">
                 <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
                 <p className="text-xs font-bold text-slate-500">No active chat channels.</p>
                 <p className="text-[10.5px] text-slate-400 mt-0.5">Chats activate when you select talents.</p>
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
                 {chatSessions.slice(0, 5).map(session => {
                   const { chat, booking, hasUnread, lastMessageAt } = session;
                    const pDoc = booking.talentId ? talents[booking.talentId] : null;
                    const performerName = pDoc?.name || pDoc?.displayName || "Performer";
                    const performerImage = pDoc?.profileImage || pDoc?.photoUrl;
                   const initialString = performerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                   
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
                       <div className="relative shrink-0">
                         {performerImage ? (
                           <img 
                             src={performerImage} 
                             alt={performerName} 
                             className="w-10 h-10 rounded-xl object-cover border border-slate-200"
                           />
                         ) : (
                           <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-150 flex items-center justify-center text-slate-500 font-bold text-xs">
                             {initialString}
                           </div>
                         )}
                         {hasUnread && (
                           <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500" />
                         )}
                       </div>

                       <div className="min-w-0 flex-1">
                         <div className="flex justify-between items-baseline gap-2">
                           <h5 className="font-black text-slate-900 text-xs truncate max-w-[120px]">{performerName}</h5>
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
              onClick={() => router.push(`/${companyId}/dashboard/client/bookings/all`)}
              className="text-xs font-black text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 hover:underline w-full justify-center"
            >
              See all booking records <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* DYNAMIC STAR RATING & REVIEW DIALOG */}
      {reviewBooking && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-slate-100 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-black text-slate-900">Review Performer</h3>
                <p className="text-xs text-slate-400 font-semibold mt-1">
                  Share your feedback for {talents[reviewBooking.talentId]?.name || "Talent Performer"}
                </p>
              </div>
              <button 
                onClick={() => setReviewBooking(null)}
                className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rate your experience</span>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="p-1 transition-transform active:scale-95 hover:scale-110"
                  >
                    <Star 
                      className={`w-8 h-8 transition-colors ${
                        star <= rating 
                          ? "text-amber-500 fill-amber-500" 
                          : "text-slate-200"
                      }`} 
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Write a comment</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="How was the performer's show, punctuality, and presence?"
                rows={4}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setReviewBooking(null)}
                className="flex-1 h-11 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-black rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={submittingReview}
                className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-lg shadow-indigo-600/10 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submittingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Submit Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Chat overlay dialog */}
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
