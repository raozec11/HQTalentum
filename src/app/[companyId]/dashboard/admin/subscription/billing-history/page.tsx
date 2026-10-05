"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { useCompany } from "@/context/CompanyContext";
import {
  Loader2, Receipt, ArrowLeft, CheckCircle2, XCircle,
  Clock, TrendingUp, DollarSign, CalendarDays, CreditCard,
} from "lucide-react";

interface PaymentRecord {
  id: string;
  amount: number;
  billingPeriod: string;
  paymentMethod: string;
  status: string;
  paidAt?: any;
  createdAt: any;
  stripeSessionId?: string;
}

export default function BillingHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const { companyData } = useCompany();

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  useEffect(() => {
    if (companyData?.id) fetchHistory();
  }, [companyData?.id]);

  const fetchHistory = async () => {
    if (!companyData?.id) return;
    try {
      setLoading(true);
      const q = query(
        collection(db, "companies", companyData.id, "subscriptionPayments"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentRecord)));
    } catch (err) {
      console.error("Failed to load billing history:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (ts: any): string => {
    if (!ts) return "—";
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return "—"; }
  };

  const getStatusConfig = (status: string) => {
    switch (status?.toLowerCase()) {
      case "paid":
        return {
          cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
          dot: "bg-emerald-500",
          icon: <CheckCircle2 className="w-3.5 h-3.5" />,
          label: "Paid",
        };
      case "failed":
        return {
          cls: "bg-rose-50 text-rose-700 border border-rose-200",
          dot: "bg-rose-500",
          icon: <XCircle className="w-3.5 h-3.5" />,
          label: "Failed",
        };
      default:
        return {
          cls: "bg-amber-50 text-amber-700 border border-amber-200",
          dot: "bg-amber-500",
          icon: <Clock className="w-3.5 h-3.5" />,
          label: status || "Pending",
        };
    }
  };

  const totalPaid = payments.filter(p => p.status === "Paid").reduce((s, p) => s + (p.amount || 0), 0);
  const totalTx = payments.length;
  const failedCount = payments.filter(p => p.status === "Failed").length;
  const lastPaid = payments.find(p => p.status === "Paid");

  return (
    <div className="max-w-4xl mx-auto pb-20 px-3 sm:px-6">

      {/* ── Header ───────────────────────────────────── */}
      <div className="mb-8 pt-2">
        <button
          onClick={() => router.push(`/${companyId}/dashboard/admin/subscription`)}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-indigo-600 mb-4 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Subscription
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Billing History</h1>
            <p className="text-slate-400 font-medium text-sm mt-1">All transactions for your workspace subscription.</p>
          </div>
          <button
            onClick={() => router.push(`/${companyId}/dashboard/admin/subscription`)}
            className="self-start sm:self-auto flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-100 hover:border-indigo-600 px-4 py-2.5 rounded-xl transition-all"
          >
            <CreditCard className="w-4 h-4" />
            Manage Plan
          </button>
        </div>
      </div>

      {/* ── Summary Stats ─────────────────────────────── */}
      {!loading && totalTx > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {[
            {
              label: "Total Paid",
              value: `$${totalPaid.toFixed(2)}`,
              icon: DollarSign,
              gradient: "from-emerald-500 to-teal-600",
              bg: "bg-emerald-50",
              text: "text-emerald-700",
            },
            {
              label: "Transactions",
              value: totalTx,
              icon: TrendingUp,
              gradient: "from-indigo-500 to-violet-600",
              bg: "bg-indigo-50",
              text: "text-indigo-700",
            },
            {
              label: "Last Payment",
              value: lastPaid ? formatDate(lastPaid.paidAt || lastPaid.createdAt) : "—",
              icon: CalendarDays,
              gradient: "from-blue-500 to-cyan-600",
              bg: "bg-blue-50",
              text: "text-blue-700",
            },
            {
              label: "Failed",
              value: failedCount,
              icon: XCircle,
              gradient: failedCount > 0 ? "from-rose-500 to-pink-600" : "from-slate-400 to-slate-500",
              bg: failedCount > 0 ? "bg-rose-50" : "bg-slate-50",
              text: failedCount > 0 ? "text-rose-700" : "text-slate-500",
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-sm`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{stat.label}</p>
                  <p className={`text-lg sm:text-xl font-black mt-0.5 ${stat.text}`}>{stat.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Transaction List ──────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="px-5 sm:px-6 py-5 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
            <Receipt className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-extrabold text-slate-900 text-base">Transaction Records</h2>
            <p className="text-xs text-slate-400 font-medium">
              {loading ? "Loading..." : `${totalTx} ${totalTx === 1 ? "transaction" : "transactions"}`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
            <p className="text-sm font-bold text-slate-400">Loading transactions...</p>
          </div>
        ) : payments.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center gap-4 px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
              <Receipt className="w-8 h-8 text-slate-400 stroke-[1.5]" />
            </div>
            <div>
              <p className="text-slate-700 font-extrabold text-base">No transactions yet</p>
              <p className="text-slate-400 text-sm font-medium mt-1 max-w-xs">
                Your payment history will appear here after your first subscription.
              </p>
            </div>
            <button
              onClick={() => router.push(`/${companyId}/dashboard/admin/subscription`)}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-black rounded-xl shadow-lg shadow-indigo-500/25 transition-all hover:-translate-y-0.5"
            >
              Subscribe Now
            </button>
          </div>
        ) : (
          <>
            {/* Desktop table header */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <div className="col-span-5">Plan / Period</div>
              <div className="col-span-2">Method</div>
              <div className="col-span-2">Date</div>
              <div className="col-span-1 text-right">Amount</div>
              <div className="col-span-2 text-right">Status</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-100">
              {payments.map((p, idx) => {
                const sc = getStatusConfig(p.status);
                return (
                  <div
                    key={p.id}
                    className="px-5 sm:px-6 py-4 hover:bg-slate-50/60 transition-colors"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    {/* Mobile layout */}
                    <div className="sm:hidden flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-slate-800 text-sm truncate">
                          {p.billingPeriod || "Monthly Subscription"}
                        </p>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">
                          {p.paidAt ? formatDate(p.paidAt) : formatDate(p.createdAt)} · {p.paymentMethod || "Stripe"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <p className="font-black text-slate-900">${p.amount}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${sc.cls}`}>
                          {sc.icon} {sc.label}
                        </span>
                      </div>
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-5">
                        <p className="font-extrabold text-slate-800 text-sm">
                          {p.billingPeriod || "Monthly Subscription"}
                        </p>
                        {p.stripeSessionId && (
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                            {p.stripeSessionId.slice(0, 24)}…
                          </p>
                        )}
                      </div>
                      <div className="col-span-2 text-sm font-semibold text-slate-500">
                        {p.paymentMethod || "Stripe"}
                      </div>
                      <div className="col-span-2 text-sm font-semibold text-slate-500">
                        {p.paidAt ? formatDate(p.paidAt) : formatDate(p.createdAt)}
                      </div>
                      <div className="col-span-1 text-right font-black text-slate-900">
                        ${p.amount}
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black ${sc.cls}`}>
                          {sc.icon} {sc.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
