"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Building2, Users, CheckCircle, XCircle, AlertOctagon, Activity, ArrowRight, CreditCard } from "lucide-react";
import Link from "next/link";

export default function MasterOverview() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [cSnap, uSnap] = await Promise.all([
        getDocs(collection(db, "companies")),
        getDocs(collection(db, "users")),
      ]);
      const comps: any[] = []; 
      cSnap.forEach(d => {
        if (d.id.toLowerCase() !== "talentum") {
          comps.push({ id: d.id, ...d.data() });
        }
      });
      const usrs: any[] = []; uSnap.forEach(d => usrs.push({ id: d.id, ...d.data() }));
      setCompanies(comps);
      setUsers(usrs);
      setLoading(false);
    }
    load();
  }, []);

  const active = companies.filter(c => !c.status || c.status === "active").length;
  const disabled = companies.filter(c => c.status === "disabled").length;
  const blacklisted = companies.filter(c => c.status === "blacklisted").length;

  const stats = [
    { label: "Total Companies", value: companies.length, icon: Building2, bg: "bg-indigo-50", color: "text-indigo-600" },
    { label: "Total Users", value: users.length, icon: Users, bg: "bg-emerald-50", color: "text-emerald-600" },
    { label: "Active", value: active, icon: CheckCircle, bg: "bg-emerald-50", color: "text-emerald-600" },
    { label: "Disabled", value: disabled, icon: XCircle, bg: "bg-amber-50", color: "text-amber-600" },
    { label: "Blacklisted", value: blacklisted, icon: AlertOctagon, bg: "bg-red-50", color: "text-red-600" },
    { label: "Platform Revenue", value: "$—", icon: Activity, bg: "bg-blue-50", color: "text-blue-600" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-extrabold text-[#1e1b4b] tracking-tight">Platform Overview</h1>
        <p className="text-slate-500 font-medium mt-0.5">A bird's-eye view of the entire Talentum SaaS platform.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
        {stats.map(({ label, value, icon: Icon, bg, color }) => (
          <div key={label} className="bg-white rounded-[20px] p-6 shadow-[0_4px_20px_rgb(0,0,0,0.04)] border border-slate-100 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.07)] transition-all duration-300">
            <div className={`w-11 h-11 ${bg} ${color} rounded-xl flex items-center justify-center mb-4`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="text-[34px] font-black text-[#1e1b4b] leading-none">{loading ? "—" : value}</div>
            <div className="text-[13px] font-medium text-slate-400 mt-1.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Link href="/master/companies" className="group bg-white rounded-[20px] p-6 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)] hover:border-indigo-200 hover:shadow-[0_8px_30px_rgba(79,70,229,0.08)] transition-all duration-300 flex items-center gap-5">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-indigo-100 transition-colors">
            <Building2 className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-extrabold text-[#1e1b4b]">Manage Companies</div>
            <div className="text-[13px] text-slate-400 font-medium mt-0.5">Create, edit, enable, disable or blacklist companies</div>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
        </Link>

        <Link href="/master/users" className="group bg-white rounded-[20px] p-6 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)] hover:border-emerald-200 hover:shadow-[0_8px_30px_rgba(16,185,129,0.08)] transition-all duration-300 flex items-center gap-5">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
            <Users className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-extrabold text-[#1e1b4b]">Manage Users</div>
            <div className="text-[13px] text-slate-400 font-medium mt-0.5">View, edit, enable or disable all platform users</div>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
        </Link>

        <Link href="/master/plans" className="group bg-white rounded-[20px] p-6 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)] hover:border-violet-200 hover:shadow-[0_8px_30px_rgba(139,92,246,0.08)] transition-all duration-300 flex items-center gap-5">
          <div className="w-14 h-14 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-violet-100 transition-colors">
            <CreditCard className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-extrabold text-[#1e1b4b]">Subscription Plans</div>
            <div className="text-[13px] text-slate-400 font-medium mt-0.5">Create, edit, and manage pricing plans for agency registration</div>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-violet-500 group-hover:translate-x-1 transition-all" />
        </Link>
      </div>

      {/* Recent Companies mini-table */}
      <div className="bg-white rounded-[20px] border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-extrabold text-[#1e1b4b] text-[16px]">Recent Companies</h2>
          <Link href="/master/companies" className="text-[13px] font-bold text-indigo-600 hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        {loading ? (
          <div className="py-10 text-center text-slate-400 font-medium">Loading...</div>
        ) : companies.length === 0 ? (
          <div className="py-10 text-center text-slate-400 font-medium">No companies yet.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {companies.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                  <span className="font-black text-indigo-600 text-[13px]">{c.name?.[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[#1e1b4b] text-[14px]">{c.name}</div>
                  <code className="text-[12px] text-slate-400">/{c.id}</code>
                </div>
                <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full border capitalize ${
                  c.status === "blacklisted" ? "bg-red-50 text-red-600 border-red-100" :
                  c.status === "disabled" ? "bg-amber-50 text-amber-600 border-amber-100" :
                  "bg-emerald-50 text-emerald-600 border-emerald-100"
                }`}>{c.status || "active"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
