"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { 
  collection, query, where, onSnapshot, getDocs, doc, updateDoc
} from "firebase/firestore";
import { 
  CheckSquare, PlusSquare, ArrowRightCircle, PlusCircle, Clock, 
  CalendarDays, Users, DollarSign, Activity, Loader2, User, AlertCircle
} from "lucide-react";
import { sendNotificationToAdmins } from "@/lib/notifications";

const PLAN_DEFAULTS = {
  starter: { name: "Starter", price: 49 },
  professional: { name: "Professional", price: 99 },
  enterprise: { name: "Enterprise", price: 199 }
};

function getSubscriptionBadge(company: any) {
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

  // Calculate Next Payment Date
  let nextPaymentDate: Date | null = null;
  if (isActive) {
    if (company.nextPaymentDate) {
      nextPaymentDate = company.nextPaymentDate.toDate ? company.nextPaymentDate.toDate() : new Date(company.nextPaymentDate);
    } else if (company.trialEndDate) {
      const trialEnd = company.trialEndDate.toDate ? company.trialEndDate.toDate() : new Date(company.trialEndDate);
      const next = new Date(trialEnd);
      if (company.customPricePeriod === "lifetime") {
        nextPaymentDate = null;
      } else {
        next.setMonth(next.getMonth() + 1);
        nextPaymentDate = next;
      }
    }
    
    if (!nextPaymentDate && company.customPricePeriod !== "lifetime") {
      const today = new Date();
      today.setMonth(today.getMonth() + 1);
      nextPaymentDate = today;
    }
  }

  return {
    planName,
    isTrialActive,
    isTrialExpired,
    trialDaysLeft,
    isActive,
    nextPaymentDate,
  };
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [talentsList, setTalentsList] = useState<any[]>([]);
  const [usersDict, setUsersDict] = useState<Record<string, any>>({});
  const [talentsDict, setTalentsDict] = useState<Record<string, any>>({});
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [plansDict, setPlansDict] = useState<Record<string, any>>(PLAN_DEFAULTS);

  useEffect(() => {
    if (!companyId) return;

    setLoading(true);
    const cids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));

    // Fetch subscription plans
    getDocs(collection(db, "subscriptionPlans")).then(snap => {
      if (!snap.empty) {
        const dict: Record<string, any> = {};
        snap.forEach(d => {
          const data = d.data();
          const planId = (data.name || "").toLowerCase();
          dict[planId] = {
            name: data.name,
            price: data.price
          };
        });
        setPlansDict(dict);
      }
    }).catch(err => {
      console.error("Error fetching subscription plans in admin dashboard:", err);
    });

    // Listen to company details
    const unsubscribeCompany = onSnapshot(doc(db, "companies", companyId), (docSnap) => {
      if (docSnap.exists()) {
        setCompany({ id: docSnap.id, ...docSnap.data() });
      }
    }, (err) => {
      console.error("Error loading company details in admin dashboard:", err);
    });

    // Listen to bookings
    const bQuery = query(collection(db, "bookings"), where("companyId", "in", cids));
    const unsubscribeBookings = onSnapshot(bQuery, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBookings(data);
    }, (err) => {
      console.error("Error loading bookings in admin dashboard:", err);
    });

    // Listen to talents
    const tQuery = query(collection(db, "talents"), where("companyId", "in", cids));
    const unsubscribeTalents = onSnapshot(tQuery, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTalentsList(data);
      
      const dict: Record<string, any> = {};
      snap.docs.forEach(doc => {
        dict[doc.id] = doc.data();
      });
      setTalentsDict(dict);
    }, (err) => {
      console.error("Error loading talents in admin dashboard:", err);
    });

    // Listen to users (to get client/talent user accounts)
    const uQuery = query(collection(db, "users"), where("companyId", "in", cids));
    const unsubscribeUsers = onSnapshot(uQuery, (snap) => {
      const updatedDict: Record<string, any> = {};
      snap.docs.forEach(d => {
        updatedDict[d.id] = d.data();
      });
      setUsersDict(updatedDict);
    }, (err) => {
      console.error("Error loading users in admin dashboard:", err);
    });

    // Listen to logs
    const lQuery = query(collection(db, "talent_activity_logs"), where("companyId", "in", cids));
    const unsubscribeLogs = onSnapshot(lQuery, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActivityLogs(data);
    }, (err) => {
      console.error("Error loading logs in admin dashboard:", err);
    });

    // Initial load Promise to disable spinner
    Promise.all([getDocs(bQuery), getDocs(tQuery)])
      .then(() => {
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error in initial load:", err);
        setLoading(false);
      });

    return () => {
      unsubscribeBookings();
      unsubscribeTalents();
      unsubscribeUsers();
      unsubscribeLogs();
      unsubscribeCompany();
    };
  }, [companyId]);

  // Proactive free trial warnings alert triggered client-side
  useEffect(() => {
    if (!company) return;
    
    const checkTrialWarning = async () => {
      if (company.trialEndDate && !company.trialWarningSent) {
        const end = company.trialEndDate.toDate ? company.trialEndDate.toDate() : new Date(company.trialEndDate);
        const diff = end.getTime() - Date.now();
        if (diff > 0) {
          const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
          if (daysLeft <= 3) {
            try {
              // Update flag in db to avoid duplicate notifications
              await updateDoc(doc(db, "companies", company.id), {
                trialWarningSent: true
              });
              
              // Notify company admins
              await sendNotificationToAdmins(company.id, {
                title: "Free Trial Ending Soon!",
                message: `Your free trial for "${company.name}" will expire in ${daysLeft} days (on ${end.toLocaleDateString("en-GB")}). Subscribe to a paid plan to keep using all features.`,
                type: "alert"
              });
            } catch (err) {
              console.error("Failed to send trial warning notification:", err);
            }
          }
        }
      }
    };
    
    checkTrialWarning();
  }, [company]);

  // Compute stats
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const todayStr = now.toISOString().split('T')[0];

  // 1. Upcoming Events count in the current month (Confirmed or Assigned)
  const upcomingEventsThisMonth = bookings.filter(b => {
    if (!b.eventDate) return false;
    const bd = new Date(b.eventDate);
    return bd.getFullYear() === currentYear && bd.getMonth() === currentMonth && (b.status === "Confirmed" || b.status === "Assigned");
  });
  const upcomingCount = upcomingEventsThisMonth.length;

  // 2. Pending Requires Attention count
  const pendingCount = bookings.filter(b => b.status === "Pending" || b.paymentStatus === "Awaiting Approval").length;

  // 3. Available Talents
  const totalTalents = talentsList.length;

  // 4. Payments Due
  let unpaidSum = 0;
  bookings.forEach(b => {
    if (b.paymentStatus !== "Paid" && b.status !== "Cancelled" && b.status !== "Completed") {
      const rateStr = b.payRate || b.totalAmount || b.amount || "0";
      const num = parseFloat(String(rateStr).replace(/[^0-9.]/g, ''));
      if (!isNaN(num)) {
        unpaidSum += num;
      }
    }
  });

  const formatCurrency = (val: number) => {
    if (val >= 1000) {
      return `$${(val / 1000).toFixed(1)}k`;
    }
    return `$${val.toLocaleString()}`;
  };

  const getDayLabel = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const today = new Date();
      const eventDate = new Date(dateStr);
      
      today.setHours(0,0,0,0);
      eventDate.setHours(0,0,0,0);
      
      const diffTime = eventDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Tomorrow";
      
      return eventDate.toLocaleDateString('en-US', { weekday: 'long' });
    } catch {
      return "";
    }
  };

  const formatEventDate = (dateStr: string) => {
    if (!dateStr) return "N/A";
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("en-US", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "EV";
    return name
      .split(' ')
      .map(n => n.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const getAssignedTalentsString = (b: any) => {
    const ids = b.selectedTalentIds || (b.selectedTalentId ? [b.selectedTalentId] : (b.talentId ? [b.talentId] : []));
    if (ids.length === 0) return "Unassigned";
    return ids.map((id: string) => {
      const talent = talentsDict[id] || usersDict[id];
      return talent?.displayName || talent?.name || "Talent";
    }).join(", ");
  };

  // Sort and filter upcoming events table list
  const upcomingEventsList = bookings
    .filter(b => b.status !== "Cancelled" && b.status !== "Completed" && (b.eventDate >= todayStr || !b.eventDate))
    .sort((a, b) => {
      if (!a.eventDate) return 1;
      if (!b.eventDate) return -1;
      return a.eventDate.localeCompare(b.eventDate);
    })
    .slice(0, 4);

  // Dynamic Recent Activities
  const activities: any[] = [];
  
  bookings.forEach(b => {
    if (b.createdAt) {
      activities.push({
        id: `booking-new-${b.id}`,
        type: 'booking_new',
        title: `New booking request: ${b.jobType || 'Event'}`,
        description: `Client: ${b.clientName || 'Unknown'} - Status: ${b.status || 'Pending'}`,
        time: b.createdAt,
        icon: 'plus',
        color: 'text-indigo-500 bg-indigo-50 border-indigo-100/50'
      });
    }
    
    if (b.paymentStatus === 'Awaiting Approval' && b.receiptUploadedAt) {
      activities.push({
        id: `booking-pay-${b.id}`,
        type: 'payment_awaiting',
        title: `Manual payment received`,
        description: `Awaiting approval for booking #${b.id.substring(0,8)}`,
        time: b.receiptUploadedAt,
        icon: 'dollar',
        color: 'text-orange-500 bg-orange-50 border-orange-100/50'
      });
    }

    if (b.assignedAt) {
      const tName = b.selectedTalentId && (talentsDict[b.selectedTalentId]?.displayName || usersDict[b.selectedTalentId]?.name) || 'Talent';
      activities.push({
        id: `booking-assign-${b.id}`,
        type: 'booking_assigned',
        title: `${tName} assigned`,
        description: `Assigned to booking #${b.id.substring(0,8)}`,
        time: b.assignedAt,
        icon: 'check',
        color: 'text-emerald-500 bg-emerald-50 border-emerald-100/50'
      });
    }
  });

  activityLogs.forEach(log => {
    const tName = talentsDict[log.talentId]?.displayName || usersDict[log.talentId]?.name || 'Talent';
    activities.push({
      id: log.id,
      type: 'talent_log',
      title: `${tName} profile update`,
      description: log.actionStr || 'Profile action recorded',
      time: log.timestamp,
      icon: 'user',
      color: 'text-blue-500 bg-blue-50 border-blue-100/50'
    });
  });

  // Sort by time descending
  activities.sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());
  const recentActivities = activities.slice(0, 8);

  const renderActivityIcon = (iconName: string) => {
    switch (iconName) {
      case 'plus':
        return <PlusSquare className="w-[18px] h-[18px]" />;
      case 'dollar':
        return <DollarSign className="w-[18px] h-[18px]" />;
      case 'check':
        return <CheckSquare className="w-[18px] h-[18px]" />;
      case 'user':
        return <User className="w-[18px] h-[18px]" />;
      default:
        return <Activity className="w-[18px] h-[18px]" />;
    }
  };

  const formatTimeAgo = (timeStr: any) => {
    if (!timeStr) return "";
    try {
      const date = new Date(timeStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHrs = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHrs / 24);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHrs < 24) return `${diffHrs}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4 w-full">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-4 pb-12 w-full px-4 sm:px-6 lg:px-8">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] md:text-[36px] font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-900 via-indigo-700 to-indigo-500 tracking-tight leading-tight">Agency Dashboard</h1>
          <p className="text-slate-500 font-medium mt-1">Welcome back. Here is what's happening today.</p>
        </div>
        <div className="text-[13px] font-bold text-slate-600 bg-white/80 backdrop-blur-xl px-5 py-2.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white flex items-center gap-2.5 w-fit">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          Live Overview
        </div>
      </div>

      {/* Subscription Status Card */}
      {company && (() => {
        const { planName, isTrialActive, isTrialExpired, trialDaysLeft, isActive, nextPaymentDate } = getSubscriptionBadge(company);
        
        // Determine original price and interval
        const planKey = (company.selectedPlan || "starter").toLowerCase();
        const planInfo = plansDict[planKey] || plansDict["starter"] || PLAN_DEFAULTS.starter;
        const defaultPrice = planInfo.price;
        const displayPlanName = planInfo.name || planName;
        
        // Check custom price
        const hasCustomPrice = company.customPrice !== undefined && company.customPrice !== null;
        const activePrice = hasCustomPrice ? company.customPrice : defaultPrice;
        const activePeriod = hasCustomPrice ? (company.customPricePeriod === "lifetime" ? "Lifetime" : company.customPricePeriod || "month") : "month";
        
        // Render colors/status
        let badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-250";
        let badgeText = "Active Subscription";
        let cardBg = "bg-gradient-to-r from-slate-50 via-white to-white border-slate-205";
        
        if (isTrialActive) {
          badgeColor = "bg-amber-50 text-amber-700 border-amber-250";
          badgeText = `Free Trial (${trialDaysLeft} days remaining)`;
          cardBg = "bg-gradient-to-r from-amber-50/20 via-white to-white border-amber-205/60";
        } else if (isTrialExpired) {
          badgeColor = "bg-rose-50 text-rose-700 border-rose-250 animate-pulse";
          badgeText = "Subscription Required (Trial Expired)";
          cardBg = "bg-gradient-to-r from-rose-50/20 via-white to-white border-rose-205/60";
        }

        const formattedEndDate = company.trialEndDate 
          ? (company.trialEndDate.toDate ? company.trialEndDate.toDate() : new Date(company.trialEndDate)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          : "—";

        if (isActive) {
          return null;
        }

        return (
          <div className={`border rounded-[28px] p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-all ${cardBg}`}>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${badgeColor}`}>
                  {badgeText}
                </span>
                {hasCustomPrice && (
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-205 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    Special Pricing Offer Active
                  </span>
                )}
              </div>
              
              <div className="space-y-1">
                <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  Plan: <span className="text-indigo-600">{displayPlanName}</span>
                </h2>
                <div className="text-sm font-bold text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>Price:</span>
                  {hasCustomPrice ? (
                    <>
                      <span className="line-through text-slate-400 font-semibold">${defaultPrice}/month</span>
                      <span className="text-emerald-600 font-black">${activePrice} / {activePeriod === "Lifetime" ? "Lifetime" : `per ${activePeriod}`}</span>
                    </>
                  ) : (
                    <span className="text-slate-800 font-black">${defaultPrice}/month</span>
                  )}
                  {company.customPriceEndDate && (
                    <span className="text-slate-400 font-medium">(Offer ends: {new Date(company.customPriceEndDate.toDate ? company.customPriceEndDate.toDate() : company.customPriceEndDate).toLocaleDateString("en-GB")})</span>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full md:w-auto flex flex-col items-start md:items-end justify-between border-t md:border-t-0 border-slate-100 pt-4 md:pt-0 gap-3">
              <div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle className={`w-3.5 h-3.5 ${isTrialExpired ? "text-rose-500" : isTrialActive ? "text-amber-500" : "text-emerald-500"}`} />
                  {isActive ? (
                    activePeriod === "Lifetime" ? "Billing Status" : "Next Payment Date"
                  ) : (
                    isTrialActive ? "Trial Ends On" : "Next Payment Date"
                  )}
                </div>
                <div className="text-lg font-black text-slate-800 mt-1">
                  {isActive ? (
                    activePeriod === "Lifetime" ? "Lifetime Paid" : (nextPaymentDate ? nextPaymentDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—")
                  ) : (
                    isTrialActive ? formattedEndDate : (company.trialEndDate ? formattedEndDate : "—")
                  )}
                </div>
                {isTrialExpired && (
                  <div className="text-xs text-rose-500 font-bold mt-1.5 max-w-[280px] md:text-right">
                    Please subscribe to a plan to continue running your agency campaigns.
                  </div>
                )}
              </div>

              {/* Buy Subscription Button — shown during trial or after expiry */}
              {(isTrialActive || isTrialExpired) && (
                <button
                  onClick={() => router.push(`/${companyId}/dashboard/admin/subscription`)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[13px] font-black tracking-wide shadow-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
                    isTrialExpired
                      ? "bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 text-white shadow-rose-200"
                      : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-200"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  {isTrialExpired ? "Renew Subscription" : "Buy Subscription Now"}
                </button>
              )}
            </div>
          </div>
        );
      })()}


      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Upcoming */}
        <div 
          onClick={() => router.push(`/${companyId}/dashboard/admin/bookings/all`)}
          className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-[24px] p-6 outline-none border-none shadow-[0_8px_30px_rgba(59,130,246,0.3)] hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(59,130,246,0.4)] transition-all duration-300 group overflow-hidden relative cursor-pointer"
        >
          <div className="absolute -right-6 -top-6 text-blue-400/30 group-hover:rotate-12 transition-transform duration-500">
             <CalendarDays className="w-32 h-32" />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <span className="text-[14px] font-bold text-blue-100 uppercase tracking-wider mb-4 flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Upcoming</span>
            <div>
              <span className="text-[42px] font-black text-white leading-none tracking-tight">{upcomingCount}</span>
              <p className="text-blue-100/80 text-[13px] font-medium mt-1">Events this month</p>
            </div>
          </div>
        </div>
        
        {/* Card 2: Pending */}
        <div 
          onClick={() => router.push(`/${companyId}/dashboard/admin/bookings/all`)}
          className="bg-white rounded-[24px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all duration-300 group relative overflow-hidden cursor-pointer"
        >
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-orange-500"></div>
           <div className="flex flex-col h-full justify-between">
            <span className="text-[14px] font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-orange-500" /> Pending</span>
            <div>
              <span className="text-[42px] font-black text-[#1e293b] leading-none tracking-tight group-hover:text-orange-600 transition-colors">{pendingCount}</span>
              <p className="text-slate-400 text-[13px] font-medium mt-1">Requires your attention</p>
            </div>
          </div>
        </div>

        {/* Card 3: Talents */}
        <div 
          onClick={() => router.push(`/${companyId}/dashboard/admin/talents`)}
          className="bg-white rounded-[24px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all duration-300 group relative overflow-hidden cursor-pointer"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-500"></div>
           <div className="flex flex-col h-full justify-between">
            <span className="text-[14px] font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-emerald-500" /> Talent</span>
            <div>
              <span className="text-[42px] font-black text-[#1e293b] leading-none tracking-tight group-hover:text-emerald-600 transition-colors">{totalTalents}</span>
              <p className="text-slate-400 text-[13px] font-medium mt-1">Roster members</p>
            </div>
          </div>
        </div>

        {/* Card 4: Payments */}
        <div 
          onClick={() => router.push(`/${companyId}/dashboard/admin/payments/pending`)}
          className="bg-gradient-to-br from-[#1e1b4b] to-indigo-900 rounded-[24px] p-6 shadow-[0_8px_30px_rgba(30,27,75,0.4)] hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(30,27,75,0.5)] transition-all duration-300 group relative overflow-hidden cursor-pointer"
        >
          <div className="absolute -right-4 -bottom-4 text-indigo-400/20 group-hover:scale-110 transition-transform duration-500">
             <DollarSign className="w-32 h-32" />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <span className="text-[14px] font-bold text-indigo-200 uppercase tracking-wider mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Payments</span>
            <div>
              <span className="text-[42px] font-black text-white leading-none tracking-tight">{formatCurrency(unpaidSum)}</span>
              <p className="text-indigo-200/80 text-[13px] font-medium mt-1">Due to be collected</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Upcoming Events Table */}
        <div className="xl:col-span-2 bg-white/70 backdrop-blur-xl border border-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-6 border-b border-slate-100/80">
            <div>
              <h3 className="font-extrabold text-[#1e1b4b] text-[18px]">Upcoming Events</h3>
              <p className="text-slate-500 text-[13px] font-medium mt-1">Manage your event schedule pipeline</p>
            </div>
            <button 
              onClick={() => router.push(`/${companyId}/dashboard/admin/bookings/all`)}
              className="text-[13px] font-bold text-[#5046E5] hover:text-[#4338CA] flex items-center gap-1.5 bg-indigo-50/50 hover:bg-indigo-50 px-4 py-2 rounded-full transition-colors border border-indigo-100/50 shadow-sm"
            >
              View All <ArrowRightCircle className="w-4 h-4" />
            </button>
          </div>
          
          <div className="divide-y divide-slate-100/80 text-[14px]">
            {upcomingEventsList.length === 0 ? (
              <div className="p-16 text-center text-slate-400">
                <CalendarDays className="w-10 h-10 mb-2 stroke-[1.2] opacity-40 mx-auto" />
                <p className="text-xs font-bold uppercase tracking-wider">No upcoming events scheduled</p>
              </div>
            ) : (
              upcomingEventsList.map((booking) => {
                const dateLabel = getDayLabel(booking.eventDate);
                const assignedTalentStr = getAssignedTalentsString(booking);
                const initials = getInitials(booking.jobType || booking.clientName);
                
                const assignedIds = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : (booking.talentId ? [booking.talentId] : []));
                const assignedImages = assignedIds
                  .map((id: string) => talentsDict[id]?.photoUrl || talentsDict[id]?.profileImage || usersDict[id]?.profileImage || null)
                  .filter(Boolean);

                return (
                  <div 
                    key={booking.id}
                    onClick={() => router.push(`/${companyId}/dashboard/admin/bookings/all`)}
                    className="p-6 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-white/50 transition-colors group cursor-pointer relative"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="w-24 flex flex-col sm:items-center justify-center shrink-0">
                      <span className="font-bold text-[#1e1b4b] text-[16px]">{formatEventDate(booking.eventDate)}</span>
                      {dateLabel && (
                        <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 border ${
                          dateLabel === "Today" ? "text-emerald-600 bg-emerald-50 border-emerald-100/50" :
                          dateLabel === "Tomorrow" ? "text-blue-600 bg-blue-50 border-blue-100/50" :
                          "text-slate-500 border-transparent"
                        }`}>
                          {dateLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 items-center gap-4">
                      {assignedImages.length > 0 ? (
                        <div className="flex -space-x-3 w-12 shrink-0">
                          {assignedImages.slice(0, 2).map((img: string, idx: number) => (
                            <img 
                              key={idx}
                              src={img} 
                              className="w-10 h-10 rounded-xl border-2 border-white object-cover shadow-sm relative"
                              style={{ zIndex: 10 - idx }}
                              alt="Talent" 
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200 shadow-sm shrink-0">
                          <span className="font-black text-[14px]">{initials}</span>
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-[#1e1b4b] text-[15px] group-hover:text-indigo-600 transition-colors">{booking.jobType || "Event"}</div>
                        <div className="text-slate-500 text-[13px] font-medium mt-0.5 flex items-center gap-1.5">
                           <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div> {booking.city || booking.address || "Unspecified Location"}
                           <span className="text-slate-300">|</span>
                           <span className="text-slate-400 font-semibold">{assignedTalentStr}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center sm:justify-end shrink-0">
                      <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold border backdrop-blur-sm ${
                        booking.status === 'Confirmed' ? 'bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]' :
                        booking.status === 'Assigned' ? 'bg-[#f5f3ff] text-[#6d28d9] border-[#ddd6fe]' :
                        booking.status === 'Pending' ? 'bg-[#fff7ed] text-[#ea580c] border-[#ffedd5]' :
                        'bg-slate-50 text-slate-600 border-slate-200/50'
                      }`}>
                        {booking.status === 'Confirmed' && <CheckSquare className="w-3.5 h-3.5" />}
                        {booking.status === 'Pending' && <Clock className="w-3.5 h-3.5 animate-pulse" />}
                        {booking.status || 'Pending'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Activity List */}
        <div className="xl:col-span-1 bg-white/70 backdrop-blur-xl border border-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col">
          <div className="px-6 py-6 border-b border-slate-100/80">
            <h3 className="font-extrabold text-[#1e1b4b] text-[18px]">Recent Activity</h3>
            <p className="text-slate-500 text-[13px] font-medium mt-1">Latest updates from your team</p>
          </div>
          
          <div className="divide-y divide-slate-100/80 text-[14px] font-medium text-slate-700 flex-1 overflow-y-auto max-h-[400px]">
            {recentActivities.length === 0 ? (
              <div className="p-16 text-center text-slate-400">
                <Activity className="w-10 h-10 mb-2 stroke-[1.2] opacity-40 mx-auto" />
                <p className="text-xs font-bold uppercase tracking-wider">No recent activity recorded</p>
              </div>
            ) : (
              recentActivities.map((act) => (
                <div 
                  key={act.id} 
                  onClick={() => {
                    if (act.type.startsWith('booking')) {
                      router.push(`/${companyId}/dashboard/admin/bookings/all`);
                    } else if (act.type === 'payment_awaiting') {
                      router.push(`/${companyId}/dashboard/admin/payments/pending`);
                    } else {
                      router.push(`/${companyId}/dashboard/admin/talents`);
                    }
                  }}
                  className="px-6 py-4 flex items-start gap-4 hover:bg-white/50 transition-colors cursor-pointer group"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 border ${act.color}`}>
                    {renderActivityIcon(act.icon)}
                  </div>
                  <div className="flex-1">
                    <div className="leading-snug text-[13px] font-bold text-[#1e1b4b]">{act.title}</div>
                    <div className="text-[12px] text-slate-500 mt-0.5">{act.description}</div>
                    <div className="text-[11px] text-slate-400 mt-1 font-semibold">{formatTimeAgo(act.time)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-auto p-4 border-t border-slate-100 bg-slate-50/30 flex justify-center">
             <button 
               onClick={() => router.push(`/${companyId}/dashboard/admin/bookings/all`)}
               className="text-[12px] font-bold text-slate-500 hover:text-slate-800 uppercase tracking-wider"
             >
               View Full History
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
