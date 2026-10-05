"use client";

import { useState, useEffect, useMemo, use } from "react";
import { db } from "@/lib/firebase";
import {
  collection, getDocs, query, where
} from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import {
  BarChart2, TrendingUp, TrendingDown, DollarSign, Users, Calendar, CheckCircle2,
  XCircle, Clock, Download, Filter, RefreshCcw, Loader2, Star, Activity,
  ArrowUpRight, ArrowDownRight, Briefcase, Award, PieChart, BarChart,
  ChevronDown, Search, FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, parseISO, isValid
} from "date-fns";

// ─── Helpers ────────────────────────────────────────────────────────────────

const safeDate = (v: any): Date | null => {
  if (!v) return null;
  try {
    if (v?.toDate) return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
};

const parseAmount = (v: any): number => {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
};

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

// ─── Stat Card ───────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  change?: number;
  icon: React.ReactNode;
  gradient?: string;
  dark?: boolean;
}

function StatCard({ title, value, sub, change, icon, gradient, dark }: StatCardProps) {
  const up = change !== undefined && change >= 0;
  return (
    <div className={cn(
      "relative rounded-2xl p-6 overflow-hidden border transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl",
      dark
        ? "bg-gradient-to-br from-[#1e1b4b] to-indigo-800 border-indigo-700/30 shadow-[0_8px_30px_rgba(79,70,229,0.35)]"
        : gradient
          ? `${gradient} border-transparent shadow-[0_8px_30px_rgba(0,0,0,0.12)]`
          : "bg-white border-slate-100/60 shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
    )}>
      <div className="relative z-10">
        {/* Icon Box */}
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center mb-4 shadow-sm",
          dark ? "bg-white/15" : gradient ? "bg-white/25" : "bg-indigo-50 border border-indigo-100"
        )}>
          <span className={cn("w-5 h-5 flex items-center justify-center", dark || gradient ? "text-white" : "text-indigo-600")}>
            {icon}
          </span>
        </div>
        <div className={cn("text-[11px] font-bold uppercase tracking-widest mb-2",
          dark ? "text-indigo-300" : gradient ? "text-white/75" : "text-slate-400"
        )}>
          {title}
        </div>
        <div className={cn("text-[36px] font-black leading-none tracking-tight",
          dark || gradient ? "text-white" : "text-[#1e1b4b]"
        )}>
          {value}
        </div>
        <div className="flex items-center justify-between mt-2">
          {sub && <p className={cn("text-[13px] font-medium", dark || gradient ? "text-white/60" : "text-slate-400")}>{sub}</p>}
          {change !== undefined && (
            <span className={cn("flex items-center gap-1 text-[12px] font-bold px-2 py-0.5 rounded-full",
              up ? "bg-emerald-400/20 text-emerald-300" : "bg-rose-400/20 text-rose-300"
            )}>
              {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {fmtPct(Math.abs(change))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Mini Bar Chart ──────────────────────────────────────────────────────────

function MiniBar({ data, color = "#6366f1", height = 80 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((v, i) => (
        <div key={i} className="flex-1 rounded-t-sm transition-all duration-500" style={{
          height: `${(v / max) * 100}%`,
          backgroundColor: color,
          opacity: i === data.length - 1 ? 1 : 0.4 + (i / data.length) * 0.6
        }} />
      ))}
    </div>
  );
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────

function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  const r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="16" />
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dash = pct * circ;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={seg.color} strokeWidth="16"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              className="transition-all duration-700"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="flex flex-col gap-2">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="font-medium text-slate-600">{seg.label}</span>
            <span className="font-bold text-slate-800 ml-auto pl-4">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Horizontal Bar ──────────────────────────────────────────────────────────

function HorizBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="group">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[13px] font-semibold text-slate-700 truncate max-w-[60%]">{label}</span>
        <span className="text-[13px] font-bold text-slate-900">{value}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ─── Table ───────────────────────────────────────────────────────────────────

function ReportTable({ columns, rows }: {
  columns: string[];
  rows: (string | number | React.ReactNode)[][]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-slate-100">
            {columns.map((c, i) => (
              <th key={i} className={cn(
                "py-3 px-4 font-bold text-[11px] uppercase tracking-wider text-slate-400",
                i === 0 ? "text-left" : "text-right"
              )}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/60 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className={cn(
                  "py-3 px-4 font-medium text-slate-700",
                  j === 0 ? "text-left" : "text-right"
                )}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type RangeKey = "7d" | "30d" | "90d" | "6m" | "12m" | "all";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "6m", label: "6 Months" },
  { key: "12m", label: "12 Months" },
  { key: "all", label: "All Time" },
];

export default function AdminReportsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = use(props.params);
  const companyId = params.companyId;
  const { user: adminUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [talents, setTalents] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [range, setRange] = useState<RangeKey>("30d");
  const [activeTab, setActiveTab] = useState<"overview" | "bookings" | "revenue" | "talent" | "clients">("overview");
  const [refreshing, setRefreshing] = useState(false);

  // ── Fetch Data ─────────────────────────────────────────────────────────────

  const fetchData = async (silent = false) => {
    if (!companyId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const ids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));

      const [bSnaps, tSnap, cSnap] = await Promise.all([
        Promise.all(ids.map(id => getDocs(query(collection(db, "bookings"), where("companyId", "==", id))))),
        getDocs(query(collection(db, "talents"), where("companyId", "==", companyId))),
        getDocs(query(collection(db, "users"), where("companyId", "==", companyId), where("role", "==", "client"))),
      ]);

      const bMap = new Map<string, any>();
      bSnaps.forEach(snap => snap.docs.forEach(d => bMap.set(d.id, { id: d.id, ...d.data() })));
      setBookings(Array.from(bMap.values()));
      setTalents(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setClients(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Reports fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { if (companyId) fetchData(); }, [companyId]);

  // ── Date Range Filter ──────────────────────────────────────────────────────

  const cutoff = useMemo((): Date | null => {
    const now = new Date();
    if (range === "all") return null;
    if (range === "7d") return subMonths(now, 0.23 as unknown as number);
    if (range === "30d") return new Date(now.getTime() - 30 * 86400000);
    if (range === "90d") return new Date(now.getTime() - 90 * 86400000);
    if (range === "6m") return subMonths(now, 6);
    if (range === "12m") return subMonths(now, 12);
    return null;
  }, [range]);

  const filteredBookings = useMemo(() => {
    if (!cutoff) return bookings;
    return bookings.filter(b => {
      const d = safeDate(b.createdAt) || safeDate(b.eventDate);
      return d ? d >= cutoff : false;
    });
  }, [bookings, cutoff]);

  // ── Computed Metrics ───────────────────────────────────────────────────────

  const metrics = useMemo(() => {
    const total = filteredBookings.length;
    const confirmed = filteredBookings.filter(b => b.status === "Confirmed").length;
    const completed = filteredBookings.filter(b => b.status === "Completed" || b.status === "completed").length;
    const cancelled = filteredBookings.filter(b => b.status === "Cancelled" || b.status === "cancelled").length;
    const pending = filteredBookings.filter(b => b.status === "Pending" || b.status === "pending").length;
    const awaiting = filteredBookings.filter(b =>
      b.status === "Awaiting Approval" || b.status === "awaiting_approval" || b.status === "awaiting approval"
    ).length;

    const totalRevenue = filteredBookings
      .filter(b => b.paymentStatus === "Paid")
      .reduce((s, b) => s + parseAmount(b.payRate || b.totalAmount || b.amount), 0);

    const pendingRevenue = filteredBookings
      .filter(b => b.paymentStatus !== "Paid" && b.status !== "Cancelled")
      .reduce((s, b) => s + parseAmount(b.payRate || b.totalAmount || b.amount), 0);

    const conversionRate = total > 0 ? ((completed + confirmed) / total) * 100 : 0;
    const cancellationRate = total > 0 ? (cancelled / total) * 100 : 0;
    const avgValue = total > 0
      ? filteredBookings.reduce((s, b) => s + parseAmount(b.payRate || b.totalAmount || b.amount), 0) / total
      : 0;

    // Monthly revenue breakdown (last 6 months)
    const now = new Date();
    const months = eachMonthOfInterval({ start: subMonths(now, 5), end: now });
    const monthlyRevenue = months.map(m => {
      const ms = startOfMonth(m).getTime();
      const me = endOfMonth(m).getTime();
      return bookings.filter(b => {
        const d = safeDate(b.createdAt) || safeDate(b.eventDate);
        return d && d.getTime() >= ms && d.getTime() <= me && b.paymentStatus === "Paid";
      }).reduce((s, b) => s + parseAmount(b.payRate || b.totalAmount || b.amount), 0);
    });
    const monthLabels = months.map(m => format(m, "MMM"));

    // Monthly bookings count
    const monthlyBookings = months.map(m => {
      const ms = startOfMonth(m).getTime();
      const me = endOfMonth(m).getTime();
      return bookings.filter(b => {
        const d = safeDate(b.createdAt) || safeDate(b.eventDate);
        return d && d.getTime() >= ms && d.getTime() <= me;
      }).length;
    });

    // Job type distribution
    const jobTypes: Record<string, number> = {};
    filteredBookings.forEach(b => {
      const jt = b.jobType || b.eventType || "Other";
      jobTypes[jt] = (jobTypes[jt] || 0) + 1;
    });
    const jobTypeList = Object.entries(jobTypes).sort((a, b) => b[1] - a[1]).slice(0, 8);

    // Status breakdown
    const statusBreakdown = [
      { label: "Completed", value: completed, color: "#10b981" },
      { label: "Confirmed", value: confirmed, color: "#6366f1" },
      { label: "Pending", value: pending, color: "#f59e0b" },
      { label: "Awaiting", value: awaiting, color: "#f97316" },
      { label: "Cancelled", value: cancelled, color: "#ef4444" },
    ].filter(s => s.value > 0);

    // Top talent by bookings
    const talentBookings: Record<string, number> = {};
    const talentRevenue: Record<string, number> = {};
    filteredBookings.forEach(b => {
      const ids: string[] = b.selectedTalentIds || (b.selectedTalentId ? [b.selectedTalentId] : (b.talentId ? [b.talentId] : []));
      ids.forEach(id => {
        talentBookings[id] = (talentBookings[id] || 0) + 1;
        if (b.paymentStatus === "Paid") {
          talentRevenue[id] = (talentRevenue[id] || 0) + parseAmount(b.payRate || b.totalAmount || b.amount) / (ids.length || 1);
        }
      });
    });

    // Top clients
    const clientBookings: Record<string, number> = {};
    const clientRevenue: Record<string, number> = {};
    const clientNames: Record<string, string> = {};
    filteredBookings.forEach(b => {
      const cid = b.clientId || b.userId || "";
      if (!cid) return;
      clientBookings[cid] = (clientBookings[cid] || 0) + 1;
      clientNames[cid] = b.clientName || cid.substring(0, 8);
      if (b.paymentStatus === "Paid") {
        clientRevenue[cid] = (clientRevenue[cid] || 0) + parseAmount(b.payRate || b.totalAmount || b.amount);
      }
    });

    const topClients = Object.entries(clientBookings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({
        id, name: clientNames[id] || id.substring(0, 8), bookings: count,
        revenue: clientRevenue[id] || 0
      }));

    // Location breakdown
    const locationMap: Record<string, number> = {};
    filteredBookings.forEach(b => {
      const loc = b.state || b.city || b.address || "Unknown";
      locationMap[loc] = (locationMap[loc] || 0) + 1;
    });
    const topLocations = Object.entries(locationMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

    return {
      total, confirmed, completed, cancelled, pending, awaiting,
      totalRevenue, pendingRevenue, conversionRate, cancellationRate, avgValue,
      monthlyRevenue, monthlyBookings, monthLabels,
      jobTypeList, statusBreakdown,
      talentBookings, talentRevenue,
      topClients, topLocations,
      totalTalents: talents.length,
      totalClients: clients.length
    };
  }, [filteredBookings, talents, clients]);

  // ── Previous period comparison ────────────────────────────────────────────

  const prevPeriodMetrics = useMemo(() => {
    if (!cutoff) return null;
    const duration = new Date().getTime() - cutoff.getTime();
    const prevEnd = cutoff;
    const prevStart = new Date(cutoff.getTime() - duration);
    const prevBookings = bookings.filter(b => {
      const d = safeDate(b.createdAt) || safeDate(b.eventDate);
      return d ? d >= prevStart && d < prevEnd : false;
    });
    const prevRevenue = prevBookings
      .filter(b => b.paymentStatus === "Paid")
      .reduce((s, b) => s + parseAmount(b.payRate || b.totalAmount || b.amount), 0);
    return { count: prevBookings.length, revenue: prevRevenue };
  }, [bookings, cutoff]);

  const bookingChange = prevPeriodMetrics && prevPeriodMetrics.count > 0
    ? ((metrics.total - prevPeriodMetrics.count) / prevPeriodMetrics.count) * 100 : undefined;
  const revenueChange = prevPeriodMetrics && prevPeriodMetrics.revenue > 0
    ? ((metrics.totalRevenue - prevPeriodMetrics.revenue) / prevPeriodMetrics.revenue) * 100 : undefined;

  // ── Export CSV ────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const headers = ["ID", "Client", "Job Type", "Status", "Payment", "Amount", "Event Date", "Location"];
    const rows = filteredBookings.map(b => [
      b.id, b.clientName || "", b.jobType || "", b.status || "",
      b.paymentStatus || "", parseAmount(b.payRate || b.totalAmount || b.amount),
      b.eventDate || "", b.city || b.state || ""
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `report_${range}_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Export PDF ────────────────────────────────────────────────────────────

  const exportPDF = () => {
    const rangeLabel = RANGES.find(r => r.key === range)?.label || range;
    const generatedAt = format(new Date(), "MMMM d, yyyy 'at' h:mm a");

    const statusRows = [
      { label: "Completed", value: metrics.completed, color: "#10b981" },
      { label: "Confirmed", value: metrics.confirmed, color: "#6366f1" },
      { label: "Pending", value: metrics.pending, color: "#f59e0b" },
      { label: "Cancelled", value: metrics.cancelled, color: "#ef4444" },
    ];

    const bookingRows = filteredBookings.slice(0, 50).map(b => `
      <tr>
        <td>${b.clientName || "—"}</td>
        <td>${b.jobType || "—"}</td>
        <td><span class="badge badge-${(b.status || "pending").toLowerCase().replace(/ /g, "-")}">${b.status || "Pending"}</span></td>
        <td>${b.paymentStatus || "—"}</td>
        <td>${b.eventDate ? format(new Date(b.eventDate), "MMM d, yyyy") : "—"}</td>
        <td class="amount">${fmtCurrency(parseAmount(b.payRate || b.totalAmount || b.amount))}</td>
      </tr>`).join("");

    const talentRows = talentTableRows.slice(0, 15).map((t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${t.name}</td>
        <td>${t.bookings}</td>
        <td class="amount">${fmtCurrency(t.revenue)}</td>
      </tr>`).join("");

    const clientRows = metrics.topClients.slice(0, 15).map((c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${c.name}</td>
        <td>${c.bookings}</td>
        <td class="amount">${fmtCurrency(c.revenue)}</td>
      </tr>`).join("");

    const monthlyBarsHTML = metrics.monthlyBookings.map((v, i) => {
      const maxV = Math.max(...metrics.monthlyBookings, 1);
      const pct = Math.round((v / maxV) * 100);
      return `<div class="bar-item">
        <div class="bar-label">${metrics.monthLabels[i]}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${i === metrics.monthlyBookings.length - 1 ? "#6366f1" : "#c7d2fe"}"></div></div>
        <div class="bar-val">${v}</div>
      </div>`;
    }).join("");

    const revenueBarHTML = metrics.monthlyRevenue.map((v, i) => {
      const maxV = Math.max(...metrics.monthlyRevenue, 1);
      const pct = Math.round((v / maxV) * 100);
      return `<div class="bar-item">
        <div class="bar-label">${metrics.monthLabels[i]}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${i === metrics.monthlyRevenue.length - 1 ? "#10b981" : "#a7f3d0"}"></div></div>
        <div class="bar-val">${fmtCurrency(v)}</div>
      </div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Agency Report — ${rangeLabel}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',sans-serif;background:#f8fafc;color:#1e293b;font-size:13px;}
  .page{max-width:900px;margin:0 auto;background:#fff;}
  /* Cover */
  .cover{background:linear-gradient(135deg,#1e1b4b 0%,#4f46e5 60%,#7c3aed 100%);color:#fff;padding:56px 48px 48px;position:relative;overflow:hidden;}
  .cover::after{content:'';position:absolute;right:-60px;top:-60px;width:280px;height:280px;border-radius:50%;background:rgba(255,255,255,0.06);}
  .cover-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:100px;padding:6px 16px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:24px;}
  .cover h1{font-size:36px;font-weight:900;letter-spacing:-.5px;line-height:1.1;margin-bottom:8px;}
  .cover p{font-size:15px;color:rgba(255,255,255,0.7);margin-bottom:28px;}
  .cover-meta{display:flex;gap:24px;flex-wrap:wrap;}
  .cover-meta-item{background:rgba(255,255,255,0.12);border-radius:12px;padding:14px 20px;}
  .cover-meta-item .meta-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,0.55);margin-bottom:4px;}
  .cover-meta-item .meta-val{font-size:15px;font-weight:800;}
  /* Body */
  .body{padding:40px 48px;}
  /* Section */
  .section{margin-bottom:36px;}
  .section-title{font-size:16px;font-weight:800;color:#1e1b4b;border-left:4px solid #6366f1;padding-left:12px;margin-bottom:16px;}
  /* KPI Grid */
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px;}
  .kpi-card{border-radius:14px;padding:18px 16px;}
  .kpi-card.dark{background:linear-gradient(135deg,#1e1b4b,#4338ca);color:#fff;}
  .kpi-card.green{background:linear-gradient(135deg,#10b981,#059669);color:#fff;}
  .kpi-card.light{background:#f8fafc;border:1px solid #e2e8f0;}
  .kpi-card .kpi-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;opacity:.7;}
  .kpi-card .kpi-val{font-size:26px;font-weight:900;line-height:1;}
  .kpi-card .kpi-sub{font-size:11px;margin-top:5px;opacity:.65;}
  /* Table */
  table{width:100%;border-collapse:collapse;}
  thead tr{background:#f1f5f9;}
  th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;}
  th.right,td.amount{text-align:right;}
  td{padding:9px 12px;font-size:12px;border-bottom:1px solid #f1f5f9;color:#334155;}
  tr:last-child td{border-bottom:none;}
  tbody tr:nth-child(even){background:#fafafa;}
  /* Badges */
  .badge{display:inline-block;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700;}
  .badge-completed{background:#d1fae5;color:#065f46;}
  .badge-confirmed{background:#e0e7ff;color:#3730a3;}
  .badge-pending{background:#fef3c7;color:#92400e;}
  .badge-cancelled{background:#fee2e2;color:#991b1b;}
  .badge-awaiting-approval{background:#ffedd5;color:#9a3412;}
  /* Status grid */
  .status-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
  .status-item{border-radius:12px;padding:14px;text-align:center;}
  .status-item .s-val{font-size:28px;font-weight:900;}
  .status-item .s-label{font-size:10px;font-weight:700;text-transform:uppercase;margin-top:4px;color:#64748b;}
  /* Horizontal bars */
  .bar-item{display:flex;align-items:center;gap:12px;margin-bottom:10px;}
  .bar-label{width:60px;font-size:11px;font-weight:600;color:#475569;text-align:right;flex-shrink:0;}
  .bar-track{flex:1;height:8px;background:#f1f5f9;border-radius:100px;overflow:hidden;}
  .bar-fill{height:100%;border-radius:100px;transition:width .5s;}
  .bar-val{width:36px;font-size:11px;font-weight:700;color:#1e293b;text-align:right;flex-shrink:0;}
  /* Footer */
  .footer{text-align:center;padding:24px 48px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;}
  /* Print */
  @media print{
    body{background:#fff;}
    .page{max-width:none;}
    .cover{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .kpi-card.dark,.kpi-card.green{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
</style>
</head>
<body>
<div class="page">

  <!-- Cover -->
  <div class="cover">
    <div class="cover-badge">📊 Agency Analytics Report</div>
    <h1>Performance Report</h1>
    <p>Filtered Period: <strong>${rangeLabel}</strong></p>
    <div class="cover-meta">
      <div class="cover-meta-item"><div class="meta-label">Generated</div><div class="meta-val">${generatedAt}</div></div>
      <div class="cover-meta-item"><div class="meta-label">Total Bookings</div><div class="meta-val">${metrics.total}</div></div>
      <div class="cover-meta-item"><div class="meta-label">Revenue Collected</div><div class="meta-val">${fmtCurrency(metrics.totalRevenue)}</div></div>
      <div class="cover-meta-item"><div class="meta-label">Completion Rate</div><div class="meta-val">${metrics.conversionRate.toFixed(1)}%</div></div>
    </div>
  </div>

  <!-- Body -->
  <div class="body">

    <!-- KPI Cards -->
    <div class="section">
      <div class="section-title">Key Performance Indicators</div>
      <div class="kpi-grid">
        <div class="kpi-card dark">
          <div class="kpi-label">Total Bookings</div>
          <div class="kpi-val">${metrics.total}</div>
          <div class="kpi-sub">${metrics.confirmed} confirmed</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-label">Revenue Collected</div>
          <div class="kpi-val">${fmtCurrency(metrics.totalRevenue)}</div>
          <div class="kpi-sub">Paid bookings only</div>
        </div>
        <div class="kpi-card light">
          <div class="kpi-label">Completion Rate</div>
          <div class="kpi-val" style="color:#6366f1">${metrics.conversionRate.toFixed(1)}%</div>
          <div class="kpi-sub">${metrics.completed} completed</div>
        </div>
        <div class="kpi-card light">
          <div class="kpi-label">Avg. Booking Value</div>
          <div class="kpi-val" style="color:#1e1b4b">${fmtCurrency(metrics.avgValue)}</div>
          <div class="kpi-sub">${metrics.cancellationRate.toFixed(1)}% cancellation</div>
        </div>
      </div>
    </div>

    <!-- Status Breakdown -->
    <div class="section">
      <div class="section-title">Booking Status Breakdown</div>
      <div class="status-grid">
        ${statusRows.filter(s => s.value > 0).map(s => `
          <div class="status-item" style="background:${s.color}18;">
            <div class="s-val" style="color:${s.color}">${s.value}</div>
            <div class="s-label">${s.label}</div>
          </div>`).join("")}
        <div class="status-item" style="background:#fff7ed;">
          <div class="s-val" style="color:#f97316">${metrics.awaiting}</div>
          <div class="s-label">Awaiting</div>
        </div>
      </div>
    </div>

    <!-- Monthly Bookings -->
    <div class="section">
      <div class="section-title">Monthly Bookings Trend</div>
      ${monthlyBarsHTML}
    </div>

    <!-- Monthly Revenue -->
    <div class="section">
      <div class="section-title">Monthly Revenue (Paid)</div>
      ${revenueBarHTML}
    </div>

    <!-- Pending Revenue -->
    <div class="section">
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi-card light">
          <div class="kpi-label">Pending Revenue</div>
          <div class="kpi-val" style="color:#f97316">${fmtCurrency(metrics.pendingRevenue)}</div>
          <div class="kpi-sub">Awaiting collection</div>
        </div>
        <div class="kpi-card light">
          <div class="kpi-label">Active Talents</div>
          <div class="kpi-val" style="color:#6366f1">${metrics.totalTalents}</div>
          <div class="kpi-sub">Roster members</div>
        </div>
        <div class="kpi-card light">
          <div class="kpi-label">Total Clients</div>
          <div class="kpi-val" style="color:#10b981">${metrics.totalClients}</div>
          <div class="kpi-sub">Registered accounts</div>
        </div>
      </div>
    </div>

    <!-- Bookings Table -->
    <div class="section">
      <div class="section-title">Booking Details (${Math.min(filteredBookings.length, 50)} of ${filteredBookings.length})</div>
      <table>
        <thead><tr><th>Client</th><th>Job Type</th><th>Status</th><th>Payment</th><th>Event Date</th><th class="right">Amount</th></tr></thead>
        <tbody>${bookingRows || '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8">No bookings in this period</td></tr>'}</tbody>
      </table>
    </div>

    <!-- Top Talents -->
    ${talentTableRows.length > 0 ? `
    <div class="section">
      <div class="section-title">Top Talent Performance</div>
      <table>
        <thead><tr><th>#</th><th>Talent Name</th><th>Bookings</th><th class="right">Revenue</th></tr></thead>
        <tbody>${talentRows}</tbody>
      </table>
    </div>` : ""}

    <!-- Top Clients -->
    ${metrics.topClients.length > 0 ? `
    <div class="section">
      <div class="section-title">Top Client Report</div>
      <table>
        <thead><tr><th>#</th><th>Client</th><th>Bookings</th><th class="right">Revenue</th></tr></thead>
        <tbody>${clientRows}</tbody>
      </table>
    </div>` : ""}

  </div>

  <div class="footer">Generated by Talentum Agency Platform &bull; ${generatedAt} &bull; Period: ${rangeLabel}</div>
</div>

<script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=1000,height=800");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  // ── Talent Table rows ─────────────────────────────────────────────────────

  const talentTableRows = useMemo(() => {
    const talentMap: Record<string, { name: string; bookings: number; revenue: number; photo?: string }> = {};
    talents.forEach(t => {
      talentMap[t.id] = { name: t.displayName || t.name || "Unknown", bookings: 0, revenue: 0, photo: t.photoUrl || t.profileImage };
    });
    Object.entries(metrics.talentBookings).forEach(([id, count]) => {
      if (!talentMap[id]) talentMap[id] = { name: id.substring(0, 8), bookings: 0, revenue: 0 };
      talentMap[id].bookings = count;
      talentMap[id].revenue = metrics.talentRevenue[id] || 0;
    });
    return Object.values(talentMap)
      .filter(t => t.bookings > 0)
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 15);
  }, [talents, metrics]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center animate-pulse">
          <BarChart2 className="w-8 h-8 text-indigo-600" />
        </div>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Compiling Reports...</p>
      </div>
    );
  }

  const PALETTE = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"];

  const TAB_ITEMS: { key: typeof activeTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <BarChart2 className="w-4 h-4" /> },
    { key: "bookings", label: "Bookings", icon: <Calendar className="w-4 h-4" /> },
    { key: "revenue", label: "Revenue", icon: <DollarSign className="w-4 h-4" /> },
    { key: "talent", label: "Talent", icon: <Award className="w-4 h-4" /> },
    { key: "clients", label: "Clients", icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-[28px] md:text-[34px] font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-900 via-indigo-600 to-violet-600 tracking-tight">
            Analytics & Reports
          </h1>
          <p className="text-slate-500 font-medium mt-1 text-[14px]">
            Comprehensive performance insights for your agency
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Range Picker */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {RANGES.map(r => (
              <button key={r.key} onClick={() => setRange(r.key)}
                className={cn(
                  "px-3 py-2 text-[12px] font-bold transition-colors",
                  range === r.key
                    ? "bg-indigo-600 text-white"
                    : "text-slate-500 hover:bg-slate-50"
                )}>
                {r.label}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button onClick={() => fetchData(true)}
            className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors">
            <RefreshCcw className={cn("w-4 h-4 text-slate-500", refreshing && "animate-spin")} />
          </button>
          {/* Export CSV */}
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-[13px] font-bold rounded-xl shadow-sm hover:bg-slate-50 hover:scale-105 transition-all duration-200">
            <Download className="w-4 h-4 text-slate-500" />
            Export CSV
          </button>
          {/* Export PDF */}
          <button onClick={exportPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[13px] font-bold rounded-xl shadow-lg hover:shadow-indigo-300 hover:scale-105 transition-all duration-200">
            <FileText className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard dark title="Total Bookings" value={metrics.total} sub={`${metrics.confirmed} confirmed`}
          change={bookingChange} icon={<Calendar className="w-8 h-8" />} />
        <StatCard gradient="bg-gradient-to-br from-emerald-500 to-teal-500" title="Revenue Collected"
          value={fmtCurrency(metrics.totalRevenue)} sub="Paid bookings" change={revenueChange}
          icon={<DollarSign className="w-8 h-8" />} />
        <StatCard title="Completion Rate" value={`${metrics.conversionRate.toFixed(1)}%`}
          sub={`${metrics.completed} completed`} icon={<CheckCircle2 className="w-8 h-8" />} />
        <StatCard title="Avg. Booking Value" value={fmtCurrency(metrics.avgValue)}
          sub={`${metrics.cancellationRate.toFixed(1)}% cancellation`} icon={<TrendingUp className="w-8 h-8" />} />
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl border border-slate-100/60 shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
        <div className="flex border-b border-slate-100 overflow-x-auto">
          {TAB_ITEMS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-6 py-4 text-[13px] font-bold whitespace-nowrap transition-colors border-b-2",
                activeTab === t.key
                  ? "border-indigo-600 text-indigo-600 bg-indigo-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              )}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">

          {/* ════ OVERVIEW TAB ════ */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Monthly Bookings Bar */}
                <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-100">
                  <h3 className="text-[14px] font-extrabold text-slate-800 mb-1">Monthly Bookings</h3>
                  <p className="text-[12px] text-slate-400 mb-4">Last 6 months trend</p>
                  <div className="flex items-end gap-2 h-32">
                    {metrics.monthlyBookings.map((v, i) => {
                      const max = Math.max(...metrics.monthlyBookings, 1);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-400">{v > 0 ? v : ""}</span>
                          <div className="w-full rounded-t-lg transition-all duration-700"
                            style={{ height: `${(v / max) * 90}%`, minHeight: v > 0 ? 4 : 0, background: i === metrics.monthlyBookings.length - 1 ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#e0e7ff" }} />
                          <span className="text-[10px] font-bold text-slate-400">{metrics.monthLabels[i]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Status Donut */}
                <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-100">
                  <h3 className="text-[14px] font-extrabold text-slate-800 mb-1">Booking Status</h3>
                  <p className="text-[12px] text-slate-400 mb-4">Current period breakdown</p>
                  {metrics.statusBreakdown.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-slate-400 text-sm">No data available</div>
                  ) : (
                    <DonutChart segments={metrics.statusBreakdown} />
                  )}
                </div>
              </div>

              {/* Quick Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Pending Revenue", value: fmtCurrency(metrics.pendingRevenue), color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100" },
                  { label: "Active Talents", value: metrics.totalTalents, color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-100" },
                  { label: "Total Clients", value: metrics.totalClients, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
                  { label: "Cancellations", value: metrics.cancelled, color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-100" },
                ].map((item, i) => (
                  <div key={i} className={cn("rounded-xl p-4 border", item.bg, item.border)}>
                    <div className={cn("text-[24px] font-black", item.color)}>{item.value}</div>
                    <div className="text-[12px] font-semibold text-slate-500 mt-0.5">{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Job Type Breakdown */}
              <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-100">
                <h3 className="text-[14px] font-extrabold text-slate-800 mb-4">Top Job Types</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                  {metrics.jobTypeList.length === 0
                    ? <p className="text-slate-400 text-sm col-span-2">No data available</p>
                    : metrics.jobTypeList.map(([type, count], i) => (
                      <HorizBar key={type} label={type} value={count}
                        max={metrics.jobTypeList[0]?.[1] || 1} color={PALETTE[i % PALETTE.length]} />
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* ════ BOOKINGS TAB ════ */}
          {activeTab === "bookings" && (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: "Total", value: metrics.total, color: "#6366f1" },
                  { label: "Completed", value: metrics.completed, color: "#10b981" },
                  { label: "Confirmed", value: metrics.confirmed, color: "#8b5cf6" },
                  { label: "Pending", value: metrics.pending, color: "#f59e0b" },
                  { label: "Cancelled", value: metrics.cancelled, color: "#ef4444" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white rounded-xl border border-slate-100 p-4 text-center shadow-sm">
                    <div className="text-[28px] font-black" style={{ color }}>{value}</div>
                    <div className="text-[12px] font-bold text-slate-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {/* Monthly chart */}
              <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-100">
                <h3 className="text-[14px] font-extrabold text-slate-800 mb-4">Bookings per Month (Last 6 Months)</h3>
                <div className="flex items-end gap-3 h-36">
                  {metrics.monthlyBookings.map((v, i) => {
                    const max = Math.max(...metrics.monthlyBookings, 1);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[11px] font-bold text-slate-500">{v > 0 ? v : ""}</span>
                        <div className="w-full rounded-t-xl"
                          style={{
                            height: `${Math.max((v / max) * 120, v > 0 ? 8 : 0)}px`,
                            background: i === metrics.monthlyBookings.length - 1
                              ? "linear-gradient(135deg,#6366f1,#8b5cf6)"
                              : `rgba(99,102,241,${0.25 + (i / metrics.monthlyBookings.length) * 0.55})`
                          }} />
                        <span className="text-[11px] font-bold text-slate-400">{metrics.monthLabels[i]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Locations */}
              <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-100">
                <h3 className="text-[14px] font-extrabold text-slate-800 mb-4">Top Booking Locations</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                  {metrics.topLocations.length === 0
                    ? <p className="text-slate-400 text-sm">No location data</p>
                    : metrics.topLocations.map(([loc, count], i) => (
                      <HorizBar key={loc} label={loc} value={count}
                        max={metrics.topLocations[0]?.[1] || 1} color={PALETTE[i % PALETTE.length]} />
                    ))}
                </div>
              </div>

              {/* Booking Table */}
              <div className="bg-slate-50/60 rounded-2xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-[14px] font-extrabold text-slate-800">Recent Bookings</h3>
                </div>
                <ReportTable
                  columns={["Client", "Job Type", "Status", "Event Date", "Amount"]}
                  rows={filteredBookings.slice(0, 20).map(b => [
                    b.clientName || "—",
                    b.jobType || "—",
                    <span key="s" className={cn("px-2 py-0.5 rounded-full text-[11px] font-bold",
                      b.status === "Completed" ? "bg-emerald-100 text-emerald-700" :
                        b.status === "Confirmed" ? "bg-indigo-100 text-indigo-700" :
                          b.status === "Cancelled" ? "bg-rose-100 text-rose-700" :
                            "bg-amber-100 text-amber-700"
                    )}>{b.status || "Pending"}</span>,
                    b.eventDate ? format(new Date(b.eventDate), "MMM d, yyyy") : "—",
                    fmtCurrency(parseAmount(b.payRate || b.totalAmount || b.amount))
                  ])}
                />
              </div>
            </div>
          )}

          {/* ════ REVENUE TAB ════ */}
          {activeTab === "revenue" && (
            <div className="space-y-6">
              {/* Revenue KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg">
                  <div className="text-[12px] font-bold uppercase tracking-widest text-emerald-100 mb-3">Total Collected</div>
                  <div className="text-[36px] font-black">{fmtCurrency(metrics.totalRevenue)}</div>
                  <div className="text-emerald-200 text-[13px] mt-1">Paid bookings only</div>
                </div>
                <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-6 text-white shadow-lg">
                  <div className="text-[12px] font-bold uppercase tracking-widest text-orange-100 mb-3">Pending</div>
                  <div className="text-[36px] font-black">{fmtCurrency(metrics.pendingRevenue)}</div>
                  <div className="text-orange-200 text-[13px] mt-1">Awaiting collection</div>
                </div>
                <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-lg">
                  <div className="text-[12px] font-bold uppercase tracking-widest text-indigo-200 mb-3">Avg. Per Booking</div>
                  <div className="text-[36px] font-black">{fmtCurrency(metrics.avgValue)}</div>
                  <div className="text-indigo-200 text-[13px] mt-1">Across all bookings</div>
                </div>
              </div>

              {/* Monthly Revenue Bar */}
              <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-100">
                <h3 className="text-[14px] font-extrabold text-slate-800 mb-1">Monthly Revenue (Paid)</h3>
                <p className="text-[12px] text-slate-400 mb-5">Last 6 months</p>
                <div className="flex items-end gap-3 h-40">
                  {metrics.monthlyRevenue.map((v, i) => {
                    const max = Math.max(...metrics.monthlyRevenue, 1);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                        {v > 0 && <span className="text-[10px] font-bold text-slate-500">{fmtCurrency(v)}</span>}
                        <div className="w-full rounded-t-xl"
                          style={{
                            height: `${Math.max((v / max) * 130, v > 0 ? 8 : 2)}px`,
                            background: i === metrics.monthlyRevenue.length - 1
                              ? "linear-gradient(135deg,#10b981,#059669)"
                              : `rgba(16,185,129,${0.2 + (i / metrics.monthlyRevenue.length) * 0.65})`
                          }} />
                        <span className="text-[11px] font-bold text-slate-400">{metrics.monthLabels[i]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Revenue by Client Table */}
              <div className="bg-slate-50/60 rounded-2xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-[14px] font-extrabold text-slate-800">Revenue by Client</h3>
                </div>
                <ReportTable
                  columns={["Client", "Bookings", "Revenue Generated"]}
                  rows={metrics.topClients.map(c => [
                    c.name,
                    c.bookings,
                    fmtCurrency(c.revenue)
                  ])}
                />
              </div>

              {/* Revenue by Job Type */}
              <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-100">
                <h3 className="text-[14px] font-extrabold text-slate-800 mb-4">Revenue by Job Type</h3>
                {(() => {
                  const jtRev: Record<string, number> = {};
                  filteredBookings.filter(b => b.paymentStatus === "Paid").forEach(b => {
                    const jt = b.jobType || "Other";
                    jtRev[jt] = (jtRev[jt] || 0) + parseAmount(b.payRate || b.totalAmount || b.amount);
                  });
                  const sorted = Object.entries(jtRev).sort((a, b) => b[1] - a[1]).slice(0, 8);
                  const maxVal = sorted[0]?.[1] || 1;
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                      {sorted.length === 0
                        ? <p className="text-slate-400 text-sm">No revenue data</p>
                        : sorted.map(([type, rev], i) => (
                          <div key={type} className="group">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[13px] font-semibold text-slate-700 truncate max-w-[55%]">{type}</span>
                              <span className="text-[13px] font-bold text-slate-900">{fmtCurrency(rev)}</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${(rev / maxVal) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
                            </div>
                          </div>
                        ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ════ TALENT TAB ════ */}
          {activeTab === "talent" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm text-center">
                  <div className="text-[34px] font-black text-indigo-600">{metrics.totalTalents}</div>
                  <div className="text-[13px] font-semibold text-slate-500 mt-1">Total Talents</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm text-center">
                  <div className="text-[34px] font-black text-emerald-600">{Object.keys(metrics.talentBookings).length}</div>
                  <div className="text-[13px] font-semibold text-slate-500 mt-1">Active This Period</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm text-center">
                  <div className="text-[34px] font-black text-violet-600">
                    {metrics.total > 0
                      ? (metrics.total / Math.max(Object.keys(metrics.talentBookings).length, 1)).toFixed(1)
                      : "0"}
                  </div>
                  <div className="text-[13px] font-semibold text-slate-500 mt-1">Avg Bookings / Talent</div>
                </div>
              </div>

              {/* Top Talent By Bookings */}
              <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-100">
                <h3 className="text-[14px] font-extrabold text-slate-800 mb-4">Top Talents by Bookings</h3>
                <div className="space-y-3">
                  {talentTableRows.length === 0
                    ? <p className="text-slate-400 text-sm">No talent booking data</p>
                    : talentTableRows.slice(0, 10).map((t, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[11px] font-black shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[13px] font-semibold text-slate-700 truncate">{t.name}</span>
                            <span className="text-[13px] font-bold text-slate-900 ml-2">{t.bookings}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${(t.bookings / (talentTableRows[0]?.bookings || 1)) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
                          </div>
                        </div>
                        <div className="text-[12px] font-bold text-emerald-600 w-20 text-right shrink-0">
                          {fmtCurrency(t.revenue)}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Talent Full Table */}
              <div className="bg-slate-50/60 rounded-2xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-[14px] font-extrabold text-slate-800">Talent Performance Table</h3>
                </div>
                <ReportTable
                  columns={["Talent", "Bookings", "Revenue Generated"]}
                  rows={talentTableRows.map(t => [t.name, t.bookings, fmtCurrency(t.revenue)])}
                />
              </div>
            </div>
          )}

          {/* ════ CLIENTS TAB ════ */}
          {activeTab === "clients" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm text-center">
                  <div className="text-[34px] font-black text-indigo-600">{metrics.totalClients}</div>
                  <div className="text-[13px] font-semibold text-slate-500 mt-1">Total Clients</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm text-center">
                  <div className="text-[34px] font-black text-emerald-600">{metrics.topClients.length}</div>
                  <div className="text-[13px] font-semibold text-slate-500 mt-1">Active This Period</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm text-center">
                  <div className="text-[34px] font-black text-violet-600">
                    {metrics.topClients.length > 0
                      ? (metrics.total / metrics.topClients.length).toFixed(1)
                      : "0"}
                  </div>
                  <div className="text-[13px] font-semibold text-slate-500 mt-1">Avg Bookings / Client</div>
                </div>
              </div>

              {/* Top clients horizontal bars */}
              <div className="bg-slate-50/60 rounded-2xl p-5 border border-slate-100">
                <h3 className="text-[14px] font-extrabold text-slate-800 mb-4">Top Clients by Bookings</h3>
                <div className="space-y-3">
                  {metrics.topClients.length === 0
                    ? <p className="text-slate-400 text-sm">No client data available</p>
                    : metrics.topClients.map((c, i) => (
                      <div key={c.id} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-[11px] font-black shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[13px] font-semibold text-slate-700 truncate">{c.name}</span>
                            <span className="text-[13px] font-bold text-slate-900 ml-2">{c.bookings} bookings</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${(c.bookings / (metrics.topClients[0]?.bookings || 1)) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
                          </div>
                        </div>
                        <div className="text-[12px] font-bold text-emerald-600 w-20 text-right shrink-0">
                          {fmtCurrency(c.revenue)}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Client Table */}
              <div className="bg-slate-50/60 rounded-2xl border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-[14px] font-extrabold text-slate-800">Client Report Table</h3>
                </div>
                <ReportTable
                  columns={["Client", "Total Bookings", "Revenue Generated"]}
                  rows={metrics.topClients.map(c => [c.name, c.bookings, fmtCurrency(c.revenue)])}
                />
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
