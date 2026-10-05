"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  CreditCard, 
  Wallet, 
  Receipt, 
  Loader2, 
  ArrowLeft, 
  Printer, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Eye, 
  Sparkles, 
  ReceiptText, 
  Search, 
  Filter, 
  X, 
  ChevronDown, 
  RotateCcw,
  SlidersHorizontal,
  Calendar,
  DollarSign
} from "lucide-react";

interface Transaction {
  id: string;
  bookingId: string;
  date: string;
  amount: number;
  type: "Booking Payment" | "Tip / Gratuity";
  method: string;
  status: "Paid" | "Pending" | "Awaiting Approval" | "Failed" | "Declined";
  jobType: string;
  eventDate: string;
  booking: any;
}

export default function ClientPaymentsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { companyData } = useCompany();
  const companyId = params.companyId as string;

  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Search & Filtering State
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "booking" | "tip">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending" | "failed">("all");
  const [methodFilter, setMethodFilter] = useState<"all" | "card" | "manual">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "amount_desc" | "amount_asc">("newest");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    async function loadPayments() {
      if (!user?.uid || !companyId) return;
      try {
        const userEmail = user.email || "";
        const qUid = query(
          collection(db, "bookings"),
          where("clientId", "==", user.uid),
          where("companyId", "==", companyId)
        );
        
        const promises = [getDocs(qUid)];
        if (userEmail) {
          const qEmail = query(
            collection(db, "bookings"),
            where("clientEmail", "==", userEmail),
            where("companyId", "==", companyId)
          );
          promises.push(getDocs(qEmail));
        }

        const snapshots = await Promise.all(promises);
        const bookingMap = new Map<string, any>();
        
        snapshots.forEach(snap => {
          snap.docs.forEach(doc => {
            bookingMap.set(doc.id, { id: doc.id, ...doc.data() });
          });
        });

        setBookings(Array.from(bookingMap.values()));
      } catch (err) {
        console.error("Failed to load payments:", err);
      } finally {
        setLoading(false);
      }
    }
    loadPayments();
  }, [user, companyId]);

  const transactions: Transaction[] = [];
  let lifetimeGigsPaid = 0;
  let lifetimeTipsPaid = 0;
  let pendingPaymentsCount = 0;

  bookings.forEach(b => {
    // 1. Gig Payment Mapping
    const payRate = parseFloat(b.payRate || b.__budget || "0");
    if (payRate > 0) {
      const isCard = b.paymentMethod?.toLowerCase() === "card" || 
                     b.paymentMethod?.toLowerCase() === "credit card" || 
                     b.paymentMethod?.toLowerCase() === "stripe" ||
                     !!b.stripePaymentIntentId;
      let txStatus = b.paymentStatus || "Pending";
      
      // Credit card logic: strictly Paid or Failed (Pending/Awaiting Approval are mapped to Failed)
      if (isCard) {
        txStatus = b.paymentStatus === "Paid" ? "Paid" : "Failed";
      }

      if (txStatus === "Paid") {
        lifetimeGigsPaid += payRate;
      } else if (txStatus === "Pending" || txStatus === "Awaiting Approval") {
        pendingPaymentsCount++;
      }

      transactions.push({
        id: `gig-${b.id}`,
        bookingId: b.id,
        date: b.paidAt || b.receiptUploadedAt || b.createdAt || new Date().toISOString(),
        amount: payRate,
        type: "Booking Payment",
        method: b.paymentMethod || "N/A",
        status: txStatus,
        jobType: b.jobType || b.__jobType || "Gig Request",
        eventDate: b.eventDate || "TBD",
        booking: b
      });
    }

    // 2. Tip Payment Mapping
    const tipAmount = parseFloat(b.tipAmount || "0");
    if (tipAmount > 0) {
      const isTipCard = b.tipPaymentMethod?.toLowerCase() === "card" || 
                        b.tipPaymentMethod?.toLowerCase() === "credit card" || 
                        b.tipPaymentMethod?.toLowerCase() === "stripe" ||
                        !!b.tipStripePaymentIntentId;
      let tipTxStatus = b.tipStatus === "Paid" ? "Paid" : b.tipStatus || "Pending";

      // Credit card logic: strictly Paid or Failed for tips too
      if (isTipCard) {
        tipTxStatus = b.tipStatus === "Paid" ? "Paid" : "Failed";
      }

      if (tipTxStatus === "Paid") {
        lifetimeTipsPaid += tipAmount;
      } else if (tipTxStatus === "Pending" || tipTxStatus === "pending" || tipTxStatus === "Awaiting Approval") {
        pendingPaymentsCount++;
      }

      transactions.push({
        id: `tip-${b.id}`,
        bookingId: b.id,
        date: b.tipPaidAt || b.paidAt || b.createdAt || new Date().toISOString(),
        amount: tipAmount,
        type: "Tip / Gratuity",
        method: b.tipPaymentMethod || "N/A",
        status: tipTxStatus,
        jobType: `Tip for Talent - ${b.jobType || b.__jobType || "Gig"}`,
        eventDate: b.eventDate || "TBD",
        booking: b
      });
    }
  });

  // Apply search query and filters
  const filteredTransactions = transactions.filter(tx => {
    // Search filter
    const matchesSearch = 
      tx.bookingId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.jobType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.method.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Type filter
    if (typeFilter !== "all") {
      if (typeFilter === "booking" && tx.type !== "Booking Payment") return false;
      if (typeFilter === "tip" && tx.type !== "Tip / Gratuity") return false;
    }

    // Status filter
    if (statusFilter !== "all") {
      const statusLower = tx.status.toLowerCase();
      if (statusFilter === "paid" && statusLower !== "paid") return false;
      if (statusFilter === "pending" && (statusLower !== "pending" && statusLower !== "awaiting approval")) return false;
      if (statusFilter === "failed" && (statusLower !== "failed" && statusLower !== "declined")) return false;
    }

    // Method filter
    if (methodFilter !== "all") {
      const methodLower = tx.method.toLowerCase();
      const isCardMethod = methodLower === "card" || methodLower === "credit card" || methodLower === "stripe";
      if (methodFilter === "card" && !isCardMethod) return false;
      if (methodFilter === "manual" && isCardMethod) return false;
    }

    return true;
  });

  // Apply sorting
  filteredTransactions.sort((a, b) => {
    if (sortBy === "newest") {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
    if (sortBy === "oldest") {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
    if (sortBy === "amount_desc") {
      return b.amount - a.amount;
    }
    if (sortBy === "amount_asc") {
      return a.amount - b.amount;
    }
    return 0;
  });

  // Active filter helper pills
  const activeFilterPills = [];
  if (typeFilter !== "all") {
    activeFilterPills.push({
      id: "type",
      label: `Type: ${typeFilter === "booking" ? "Bookings" : "Tips"}`,
      clear: () => setTypeFilter("all")
    });
  }
  if (statusFilter !== "all") {
    activeFilterPills.push({
      id: "status",
      label: `Status: ${statusFilter === "paid" ? "Paid" : statusFilter === "pending" ? "Pending" : "Failed"}`,
      clear: () => setStatusFilter("all")
    });
  }
  if (methodFilter !== "all") {
    activeFilterPills.push({
      id: "method",
      label: `Method: ${methodFilter === "card" ? "Credit Card" : "Manual"}`,
      clear: () => setMethodFilter("all")
    });
  }
  if (sortBy !== "newest") {
    let sortLabel = "Sort: Newest";
    if (sortBy === "oldest") sortLabel = "Sort: Oldest";
    if (sortBy === "amount_desc") sortLabel = "Sort: High to Low";
    if (sortBy === "amount_asc") sortLabel = "Sort: Low to High";
    activeFilterPills.push({
      id: "sort",
      label: sortLabel,
      clear: () => setSortBy("newest")
    });
  }

  const isFiltersActive = activeFilterPills.length > 0 || searchQuery !== "";

  const handleResetFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setMethodFilter("all");
    setSortBy("newest");
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Loading Payment History...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 px-4 sm:px-6 lg:px-8 mt-6">
      {/* Premium Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-100/80 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-indigo-100/50">
              Billing Hub
            </span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">Payments & Invoices</h1>
          <p className="text-slate-400 font-bold text-xs mt-1.5">View your transaction history, check statuses, and print invoices.</p>
        </div>
        <Button 
          onClick={() => router.back()} 
          variant="outline" 
          className="flex items-center gap-2 text-slate-600 bg-white border border-slate-200/80 hover:bg-slate-50 transition-all font-bold text-xs h-9 px-4 rounded-xl shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Button>
      </div>

      {/* Stats Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Total Gigs Paid */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.01)] hover:shadow-md transition-all duration-300 p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-indigo-500/5 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-tr from-indigo-500 to-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-indigo-100">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Gigs Total Paid</p>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight mt-0.5">
                ${lifetimeGigsPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </h2>
            </div>
          </div>
        </div>

        {/* Total Tips Paid */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.01)] hover:shadow-md transition-all duration-300 p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/5 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-tr from-emerald-500 to-teal-500 text-white rounded-2xl flex items-center justify-center shadow-md shadow-emerald-100">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Tips Total Paid</p>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight mt-0.5">
                ${lifetimeTipsPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </h2>
            </div>
          </div>
        </div>

        {/* Pending / Actions */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.01)] hover:shadow-md transition-all duration-300 p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-500/5 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-orange-500 text-white rounded-2xl flex items-center justify-center shadow-md shadow-amber-100">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Pending Verification</p>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight mt-0.5">
                {pendingPaymentsCount}
              </h2>
            </div>
          </div>
        </div>
      </div>

      {/* Main Filter & Transaction Container */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.015)] overflow-hidden">
        
        {/* Simple & Dynamic Filters Header */}
        <div className="p-6 border-b border-slate-100 space-y-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h3 className="font-black text-slate-800 text-lg">Transaction History</h3>
              <p className="text-slate-400 font-bold text-xs mt-0.5">Filters dynamically adjust below.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
              {/* Search Bar */}
              <div className="relative flex-1 lg:flex-none lg:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search service, ID, method..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all bg-slate-50/30"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Advanced Filters Button */}
              <Button
                onClick={() => setShowFilters(!showFilters)}
                variant="outline"
                className={`h-10 px-4 rounded-xl flex items-center gap-2 font-bold text-xs transition-all ${
                  showFilters || isFiltersActive
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100/50"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {activeFilterPills.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-indigo-600 text-white rounded-full text-[9px] font-black">
                    {activeFilterPills.length}
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showFilters ? "rotate-180" : ""}`} />
              </Button>

              {/* Reset Filters when active */}
              {isFiltersActive && (
                <Button
                  onClick={handleResetFilters}
                  variant="ghost"
                  className="h-10 px-3 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </Button>
              )}
            </div>
          </div>

          {/* Expandable Advanced Filters Panel */}
          {showFilters && (
            <div className="p-5 bg-slate-50/50 rounded-2xl border border-slate-150/40 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-in slide-in-from-top-2 duration-200">
              
              {/* Type Filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</label>
                <select
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value as any)}
                  className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                >
                  <option value="all">All Types</option>
                  <option value="booking">Booking Payments</option>
                  <option value="tip">Tips / Gratuity</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed / Declined</option>
                </select>
              </div>

              {/* Payment Method Filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Method</label>
                <select
                  value={methodFilter}
                  onChange={e => setMethodFilter(e.target.value as any)}
                  className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                >
                  <option value="all">All Methods</option>
                  <option value="card">Credit Card (Stripe)</option>
                  <option value="manual">Manual (QR Codes)</option>
                </select>
              </div>

              {/* Sort By Filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sort By</label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="amount_desc">Highest Amount</option>
                  <option value="amount_asc">Lowest Amount</option>
                </select>
              </div>

            </div>
          )}

          {/* Active Pills Display */}
          {activeFilterPills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1">Active:</span>
              {activeFilterPills.map(pill => (
                <span 
                  key={pill.id} 
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200/40"
                >
                  {pill.label}
                  <button 
                    onClick={pill.clear}
                    className="hover:text-rose-500 transition-colors text-slate-400 ml-0.5"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

        </div>

        {/* Transactions Section */}
        {filteredTransactions.length === 0 ? (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <Receipt className="w-7 h-7 text-slate-300" />
            </div>
            <div className="space-y-1">
              <h3 className="text-md font-bold text-slate-800">No transactions match filters</h3>
              <p className="text-slate-400 text-xs font-semibold max-w-xs mx-auto leading-relaxed">Try adjusting your filters or search terms.</p>
            </div>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-3.5 px-6">Date</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4">Ref ID</th>
                    <th className="py-3.5 px-4">Description</th>
                    <th className="py-3.5 px-4">Amount</th>
                    <th className="py-3.5 px-4">Method</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs font-bold text-slate-700">
                  {filteredTransactions.map(tx => {
                    const statusLower = tx.status.toLowerCase();
                    const isPaid = statusLower === "paid";
                    const isAwaiting = statusLower === "awaiting approval" || statusLower === "pending";
                    const isCardPayment = tx.method.toLowerCase() === "card" || tx.method.toLowerCase() === "credit card" || tx.method.toLowerCase() === "stripe";

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/20 transition-colors">
                        <td className="py-4 px-6 text-slate-400">
                          {new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            tx.type === "Tip / Gratuity" ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-indigo-50 text-indigo-700 border-indigo-100"
                          }`}>
                            {tx.type === "Tip / Gratuity" ? "Tip" : "Booking"}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-mono text-slate-400 font-medium">
                          #{tx.bookingId.substring(0, 8).toUpperCase()}
                        </td>
                        <td className="py-4 px-4 max-w-[200px] truncate font-medium text-slate-650">{tx.jobType}</td>
                        <td className="py-4 px-4 text-slate-900 font-black">${tx.amount.toFixed(2)}</td>
                        <td className="py-4 px-4 font-semibold text-slate-400">
                          {isCardPayment ? (
                            <span className="flex items-center gap-1">
                              <CreditCard className="w-3.5 h-3.5 text-indigo-500" /> Card
                            </span>
                          ) : (
                            tx.method
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${
                            isPaid ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : isAwaiting ? "bg-amber-50 border-amber-200 text-amber-700"
                            : "bg-rose-50 border-rose-200 text-rose-700"
                          }`}>
                            {isPaid && <CheckCircle className="w-2.5 h-2.5" />}
                            {isAwaiting && <Clock className="w-2.5 h-2.5" />}
                            {!isPaid && !isAwaiting && <AlertTriangle className="w-2.5 h-2.5" />}
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <Button 
                            onClick={() => { setSelectedTx(tx); setShowModal(true); }}
                            variant="ghost" 
                            size="sm" 
                            className="h-8 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50/50 font-black text-xs gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5" /> Invoice
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked List View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredTransactions.map(tx => {
                const statusLower = tx.status.toLowerCase();
                const isPaid = statusLower === "paid";
                const isAwaiting = statusLower === "awaiting approval" || statusLower === "pending";
                const isCardPayment = tx.method.toLowerCase() === "card" || tx.method.toLowerCase() === "credit card" || tx.method.toLowerCase() === "stripe";

                return (
                  <div 
                    key={tx.id} 
                    className={`p-5 space-y-3 relative border-l-4 ${
                      isPaid ? "border-l-emerald-500" : isAwaiting ? "border-l-amber-500" : "border-l-rose-500"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">
                          {new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        <h4 className="font-black text-slate-800 text-sm mt-0.5">{tx.jobType}</h4>
                        <span className="font-mono text-[10px] text-slate-450 mt-0.5 block">Ref: #{tx.bookingId.substring(0, 8).toUpperCase()}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-black text-slate-900 block">${tx.amount.toFixed(2)}</span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 block">
                          {isCardPayment ? "Credit Card" : tx.method}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center text-[9px] font-black px-2 py-0.5 rounded-full border ${
                          tx.type === "Tip / Gratuity" ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-indigo-50 text-indigo-700 border-indigo-100"
                        }`}>
                          {tx.type === "Tip / Gratuity" ? "Tip" : "Booking"}
                        </span>

                        <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                          isPaid ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : isAwaiting ? "bg-amber-50 border-amber-200 text-amber-700"
                          : "bg-rose-50 border-rose-200 text-rose-700"
                        }`}>
                          {tx.status}
                        </span>
                      </div>

                      <Button 
                        onClick={() => { setSelectedTx(tx); setShowModal(true); }}
                        variant="outline" 
                        size="sm" 
                        className="h-8 rounded-lg border-slate-200 hover:bg-slate-50 font-bold text-xs text-slate-650"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> View Invoice
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Invoice Modal Overlay */}
      {showModal && selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 no-print" onClick={() => setShowModal(false)}>
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body * {
                visibility: hidden;
              }
              #printable-invoice, #printable-invoice * {
                visibility: visible;
              }
              #printable-invoice {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                margin: 0;
                padding: 0;
                box-shadow: none;
                border: none;
                background: white !important;
                color: black !important;
              }
              .no-print {
                display: none !important;
              }
            }
          ` }} />

          <div 
            className="w-[96%] sm:max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150" 
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Actions Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><ReceiptText className="w-4 h-4 text-slate-500" /> Print Receipt / Invoice</span>
              <div className="flex gap-2">
                <Button 
                  onClick={handlePrint}
                  className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5 shadow-sm shadow-indigo-100"
                >
                  <Printer className="w-3.5 h-3.5" /> Print / PDF
                </Button>
                <Button 
                  onClick={() => setShowModal(false)}
                  variant="outline"
                  className="h-9 px-3 rounded-xl border-slate-200 text-slate-500 hover:bg-slate-100 font-bold text-xs bg-white"
                >
                  Close
                </Button>
              </div>
            </div>

            {/* Scrollable Printable Invoice Content */}
            <div className="flex-1 overflow-y-auto p-8 sm:p-10 bg-white" id="printable-invoice">
              <div className="space-y-8 max-w-xl mx-auto bg-white">
                
                {/* Logo & Inv Details Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-slate-100">
                  <div className="space-y-1">
                    {companyData?.logoUrl ? (
                      <img src={companyData.logoUrl} alt={companyData?.name || "Company Logo"} className="h-10 w-auto object-contain mb-2" />
                    ) : (
                      <div className="bg-indigo-600 text-white rounded-xl h-10 px-4 flex items-center justify-center font-black text-lg w-fit select-none">
                        {companyData?.name?.substring(0, 2).toUpperCase() || "TL"}
                      </div>
                    )}
                    <h3 className="text-lg font-black text-slate-900">{companyData?.name || "Talentum App"}</h3>
                    <p className="text-xs text-slate-400 font-semibold">Professional Entertainment Network</p>
                  </div>
                  <div className="text-left sm:text-right space-y-1 sm:pt-2">
                    <h2 className="text-xl font-black text-indigo-600 uppercase tracking-wide">Receipt / Invoice</h2>
                    <p className="text-xs font-mono font-bold text-slate-400">
                      INV-{selectedTx.bookingId.substring(0, 8).toUpperCase()}-{selectedTx.type === "Tip / Gratuity" ? "TIP" : "GIG"}
                    </p>
                    <p className="text-xs font-bold text-slate-500">
                      Date Paid: <strong className="text-slate-800">{new Date(selectedTx.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>
                    </p>
                  </div>
                </div>

                {/* Billing Addresses Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm font-semibold">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Bill To</span>
                    <p className="text-slate-800 font-black leading-none">{selectedTx.booking.clientName || selectedTx.booking.__clientName || user?.name || "Client"}</p>
                    <p className="text-slate-500 text-xs font-bold">{selectedTx.booking.clientEmail || selectedTx.booking.__email || user?.email || ""}</p>
                    <p className="text-slate-500 text-xs font-bold">{selectedTx.booking.clientNumber || ""}</p>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Event Details</span>
                    <p className="text-slate-800 font-black leading-none">{selectedTx.jobType}</p>
                    <p className="text-slate-500 text-xs font-bold mt-1">Date: {selectedTx.eventDate ? new Date(selectedTx.eventDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "TBD"}</p>
                    <p className="text-slate-500 text-xs font-bold leading-normal max-w-xs">{selectedTx.booking.address || selectedTx.booking.__address || "Location TBD"}</p>
                  </div>
                </div>

                {/* Line Item Pricing Table */}
                <div className="space-y-3 pt-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Details</span>
                  <div className="border border-slate-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-55 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                          <th className="py-3 px-5">Description</th>
                          <th className="py-3 px-5 text-center">Qty</th>
                          <th className="py-3 px-5 text-right">Rate</th>
                          <th className="py-3 px-5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm font-bold text-slate-700">
                        <tr>
                          <td className="py-4 px-5">
                            <p className="text-slate-800 font-black">{selectedTx.type === "Tip / Gratuity" ? "Gratuity Tip" : "Gig Booking Payment"}</p>
                            <p className="text-xs text-slate-400 font-semibold mt-1">
                              {selectedTx.type === "Tip / Gratuity" 
                                ? `Talent Performance Tip - Booking #${selectedTx.bookingId.substring(0, 8).toUpperCase()}`
                                : `Entertainment Services - Booking #${selectedTx.bookingId.substring(0, 8).toUpperCase()}`}
                            </p>
                          </td>
                          <td className="py-4 px-5 text-center font-medium">1</td>
                          <td className="py-4 px-5 text-right font-medium">${selectedTx.amount.toFixed(2)}</td>
                          <td className="py-4 px-5 text-right font-black text-slate-900">${selectedTx.amount.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Total Summary Breakdown */}
                <div className="flex justify-end pt-4">
                  <div className="w-64 space-y-2 text-sm font-bold text-slate-500">
                    <div className="flex justify-between items-center">
                      <span>Subtotal:</span>
                      <span className="text-slate-800 font-semibold">${selectedTx.amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                      <span>Tax / Fees:</span>
                      <span className="text-slate-800 font-semibold">$0.00</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-955 font-black text-lg pt-1">
                      <span>Amount Paid:</span>
                      <span className="text-indigo-650">${selectedTx.amount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Transaction Metadata Detail */}
                <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-2xl p-5 space-y-2 text-xs font-bold text-indigo-900/80">
                  <div className="flex items-center gap-1.5 text-indigo-950 mb-1"><Sparkles className="w-4 h-4 text-indigo-500" /> Transaction details</div>
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
                    <div>Payment Method: <span className="text-slate-700 capitalize">{selectedTx.method === "card" || selectedTx.method.toLowerCase() === "credit card" ? "Credit Card" : selectedTx.method}</span></div>
                    <div>Payment Status: <span className="text-slate-700">{selectedTx.status}</span></div>
                    {selectedTx.booking.stripePaymentIntentId && selectedTx.type !== "Tip / Gratuity" && (
                      <div className="col-span-2 truncate">Payment ID: <span className="text-slate-600 font-mono text-[10px]">{selectedTx.booking.stripePaymentIntentId}</span></div>
                    )}
                    {selectedTx.booking.tipStripePaymentIntentId && selectedTx.type === "Tip / Gratuity" && (
                      <div className="col-span-2 truncate">Payment ID: <span className="text-slate-600 font-mono text-[10px]">{selectedTx.booking.tipStripePaymentIntentId}</span></div>
                    )}
                    {selectedTx.booking.paymentReceiptUrl && selectedTx.method.toLowerCase() !== "card" && selectedTx.method.toLowerCase() !== "credit card" && selectedTx.method.toLowerCase() !== "stripe" && (
                      <div className="col-span-2 mt-1.5">
                        <a 
                          href={selectedTx.booking.paymentReceiptUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-850 font-black underline no-print"
                        >
                          View Uploaded Payment Proof Receipt ➔
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Message */}
                <div className="text-center text-[10px] font-semibold text-slate-400 pt-6">
                  <p>If you have any questions about this receipt, please contact {companyData?.name || "us"}.</p>
                  <p className="mt-1">Thank you for choosing Talentum Network!</p>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
