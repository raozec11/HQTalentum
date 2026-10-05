"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { 
  CreditCard, Wallet, Clock, Loader2, DollarSign, 
  TrendingUp, Coins, Search
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface PaymentItem {
  id: string;
  clientName: string;
  clientEmail: string;
  eventDate: string;
  jobType: string;
  payRate: number;
  tipAmount: number;
  tipStatus?: string;
  status: string;
  paidAt?: string;
}

export default function TalentPaymentsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState<PaymentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  useEffect(() => {
    if (!user) return;
    fetchPayments();
  }, [user]);

  // Reset currentPage to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const fetchPayments = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "bookings"),
        where("talentId", "==", user.uid)
      );
      const snap = await getDocs(q);
      
      const list: PaymentItem[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          clientName: data.clientName || data.__clientName || "Unknown Client",
          clientEmail: data.clientEmail || data.__email || "",
          eventDate: data.eventDate || "",
          jobType: data.jobType || data.__jobType || "Unspecified",
          payRate: parseFloat(data.payRate || 0),
          tipAmount: parseFloat(data.tipAmount || 0),
          tipStatus: data.tipStatus || "",
          status: data.status || "Pending",
          paidAt: data.paidAt || ""
        };
      });

      list.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
      setEarnings(list);
    } catch (err) {
      console.error("Failed to fetch payments:", err);
    } finally {
      setLoading(false);
    }
  };

  // Calculations
  const totalEarned = earnings
    .filter(e => e.status === "Completed")
    .reduce((acc, curr) => acc + curr.payRate, 0);

  const pendingPayouts = earnings
    .filter(e => e.status === "Confirmed" || e.status === "Assigned")
    .reduce((acc, curr) => acc + curr.payRate, 0);

  const totalTips = earnings
    .filter(e => e.tipStatus === "Paid")
    .reduce((acc, curr) => acc + curr.tipAmount, 0);

  const lifetimeTotal = totalEarned + totalTips;

  // Filtered List
  const filteredEarnings = earnings.filter(e => {
    const matchesSearch = 
      e.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.jobType.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = 
      statusFilter === "All" ||
      (statusFilter === "Completed" && e.status === "Completed") ||
      (statusFilter === "Pending" && (e.status === "Assigned" || e.status === "Confirmed"));

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredEarnings.length / itemsPerPage) || 1;
  const paginatedEarnings = filteredEarnings.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Payments...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 px-4 animate-in fade-in duration-500">
      <div className="mb-4">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Payments & Earnings</h1>
        <p className="text-slate-500 mt-2 font-medium">Track your finished job revenues, tips, and pending payouts.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card className="rounded-[32px] border-slate-100 shadow-xl shadow-slate-200/50 bg-indigo-600 text-white overflow-hidden">
          <CardContent className="p-8 relative">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-white/20 p-3 rounded-2xl"><Wallet className="w-6 h-6" /></div>
              <span className="text-white/60 text-[10px] font-black uppercase tracking-widest">Lifetime Income</span>
            </div>
            <h2 className="text-4xl font-black">${lifetimeTotal.toFixed(2)}</h2>
            <p className="text-white/60 text-xs mt-2 font-medium">Gig pay + Tips combined</p>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-slate-100 shadow-xl shadow-slate-200/50">
          <CardContent className="p-8">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600"><TrendingUp className="w-6 h-6" /></div>
              <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Gig Earnings</span>
            </div>
            <h2 className="text-3xl font-black text-slate-900">${totalEarned.toFixed(2)}</h2>
            <p className="text-slate-500 text-xs mt-2 font-medium">Completed jobs pay rate</p>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-slate-100 shadow-xl shadow-slate-200/50">
          <CardContent className="p-8">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-orange-100 p-3 rounded-2xl text-orange-600"><Clock className="w-6 h-6" /></div>
              <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Pending Payouts</span>
            </div>
            <h2 className="text-3xl font-black text-slate-900">${pendingPayouts.toFixed(2)}</h2>
            <p className="text-slate-500 text-xs mt-2 font-medium">Assigned/Confirmed gigs</p>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-slate-100 shadow-xl shadow-slate-200/50">
          <CardContent className="p-8">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-amber-100 p-3 rounded-2xl text-amber-600"><Coins className="w-6 h-6" /></div>
              <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Tips Earned</span>
            </div>
            <h2 className="text-3xl font-black text-slate-900">${totalTips.toFixed(2)}</h2>
            <p className="text-slate-500 text-xs mt-2 font-medium">Additional tips received</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 w-full sm:max-w-md">
          <Search className="w-5 h-5 text-indigo-400" />
          <input 
            type="text" 
            placeholder="Search booking ID or client..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-none outline-none text-sm text-slate-800 bg-transparent placeholder:text-slate-400 w-full"
          />
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          {["All", "Completed", "Pending"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`flex-1 sm:flex-none h-10 px-6 rounded-2xl text-xs font-bold transition-all ${
                statusFilter === status 
                  ? "bg-slate-900 text-white" 
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Payment History List */}
      <Card className="rounded-[32px] border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden bg-white">
        <CardHeader className="p-8 border-b border-slate-100 bg-[#fbfcfd]">
          <CardTitle className="font-black text-slate-950">Earnings breakdown</CardTitle>
          <CardDescription className="font-medium text-slate-500">List of all bookings assigned to you and their payout status.</CardDescription>
        </CardHeader>
        
        {filteredEarnings.length === 0 ? (
          <CardContent className="p-20 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-[28px] flex items-center justify-center mx-auto mb-6 border border-slate-100">
              <CreditCard className="w-10 h-10 text-slate-200" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">No earnings found</h3>
            <p className="text-slate-500 max-w-sm mx-auto mt-2 font-medium">
              Gigs you are assigned to and completed will show up in this breakdown.
            </p>
          </CardContent>
        ) : (
          <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider">Event Details</th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider">Client / Customer</th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider">Job Type</th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider">Base Pay</th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider">Tip Amount</th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedEarnings.map((item) => {
                  let dateStr = "TBD";
                  try {
                    if (item.eventDate) {
                      dateStr = new Date(item.eventDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      });
                    }
                  } catch (e) {}

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-5 px-6">
                        <div className="flex flex-col gap-1">
                          <span className="text-[12px] font-bold font-mono text-slate-400">ID:{item.id.slice(0, 8).toUpperCase()}</span>
                          <span className="text-xs font-semibold text-slate-700">{dateStr}</span>
                        </div>
                      </td>
                      <td className="py-5 px-6">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">{item.clientName}</span>
                          {item.clientEmail && <span className="text-[11px] font-medium text-slate-400">{item.clientEmail}</span>}
                        </div>
                      </td>
                      <td className="py-5 px-6">
                        <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/40">{item.jobType}</span>
                      </td>
                      <td className="py-5 px-6">
                        <span className="text-sm font-black text-emerald-600">${item.payRate.toFixed(2)}</span>
                      </td>
                      <td className="py-5 px-6">
                        {item.tipAmount > 0 && item.tipStatus === "Paid" ? (
                          <span className="text-sm font-black text-amber-600 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded-md">+${item.tipAmount.toFixed(2)} Tip</span>
                        ) : (
                          <span className="text-sm font-bold text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-5 px-6">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm ${
                          item.status === 'Completed' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                          item.status === 'Confirmed' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' :
                          'bg-amber-50 text-amber-600 border-amber-200'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="md:hidden divide-y divide-slate-100">
            {paginatedEarnings.map((item) => {
              let dateStr = "TBD";
              try {
                if (item.eventDate) {
                  dateStr = new Date(item.eventDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  });
                }
              } catch (e) {}

              return (
                <div key={item.id} className="p-6 space-y-3">
                  {/* Header: ID + Status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold font-mono text-slate-400">
                      ID:{item.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-sm ${
                      item.status === 'Completed' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                      item.status === 'Confirmed' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' :
                      'bg-amber-50 text-amber-600 border-amber-200'
                    }`}>
                      {item.status}
                    </span>
                  </div>

                  {/* Client / Job details */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{item.clientName}</h4>
                    {item.clientEmail && <p className="text-[11px] font-medium text-slate-400">{item.clientEmail}</p>}
                  </div>

                  {/* Meta details: Date & Job type */}
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 pt-1">
                    <span>📅 {dateStr}</span>
                    <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200/40">{item.jobType}</span>
                  </div>

                  {/* Pricing / Payments */}
                  <div className="flex items-center justify-between gap-4 pt-2">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Base Pay</p>
                      <span className="text-sm font-black text-emerald-600">${item.payRate.toFixed(2)}</span>
                    </div>
                    {item.tipAmount > 0 && item.tipStatus === "Paid" && (
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Tip</p>
                        <span className="text-xs font-black text-amber-600 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded">+${item.tipAmount.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dynamic Pagination & Info Footer */}
          {filteredEarnings.length > 0 && (
            <div className="p-6 bg-white border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
              <span className="text-xs font-semibold text-slate-400">
                Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredEarnings.length)} to {Math.min(currentPage * itemsPerPage, filteredEarnings.length)} of {filteredEarnings.length} records
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
      </Card>
    </div>
  );
}
