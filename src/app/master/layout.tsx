"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Building2, Users, ShieldCheck, LogOut, Settings, CreditCard, LifeBuoy } from "lucide-react";
import { auth } from "@/lib/firebase";

export default function MasterLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && pathname !== "/master/login") {
      if (!user || user.role !== "platform_admin") {
        router.push("/master/login");
      }
    }
  }, [user, loading, router, pathname]);

  // If on login page, just render without the sidebar/auth wrapper
  if (pathname === "/master/login") {
    return <>{children}</>;
  }

  if (loading || !user || user.role !== "platform_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0F19]">
        <div className="w-10 h-10 rounded-full border-4 border-indigo-700 border-t-indigo-400 animate-spin"></div>
      </div>
    );
  }

  const navItems = [
    { href: "/master", label: "Overview", icon: LayoutDashboard },
    { href: "/master/companies", label: "Companies", icon: Building2 },
    { href: "/master/users", label: "All Users", icon: Users },
    { href: "/master/plans", label: "Subscription Plans", icon: CreditCard },
    { href: "/master/support", label: "Support Tickets", icon: LifeBuoy },
    { href: "/master/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="h-screen bg-slate-50 flex overflow-hidden relative">
      
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar — fixed height, no scroll */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 transform md:relative md:translate-x-0 transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
        w-64 bg-[#0f0c29] text-white flex flex-col shrink-0 h-full
      `}>
        {/* Logo */}
        <div className="px-6 py-7 border-b border-white/10 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)]">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[15px] font-black text-white">Talentum</div>
              <div className="text-[11px] font-bold text-indigo-300 uppercase tracking-widest">Master Admin</div>
            </div>
          </div>
          {/* Mobile Close Button */}
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-4 py-5 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-[14px] transition-all duration-200 ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-[0_4px_15px_rgba(79,70,229,0.4)]"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User & Logout */}
        <div className="px-4 py-5 border-t border-white/10 shrink-0">
          <div className="flex items-center gap-3 px-4 mb-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
              <span className="text-[13px] font-black text-indigo-300">{user.email?.[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-white truncate">{user.name || "Master Admin"}</div>
              <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
            </div>
          </div>
          <button
            onClick={() => auth.signOut().then(() => router.push("/master/login"))}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 font-semibold text-[13px] transition-all"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content — only this scrolls */}
      <div className="flex-1 flex flex-col h-full overflow-hidden w-full min-w-0">
        {/* Mobile Header for Hamburger */}
        <header className="md:hidden flex items-center px-4 h-16 bg-white border-b border-slate-200 shrink-0">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-2 text-slate-500 hover:text-indigo-600 transition-colors rounded-lg"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <span className="ml-2 font-bold text-slate-800">Master Console</span>
        </header>

        <main className="flex-1 h-full overflow-y-auto w-full">
          <div className="p-4 sm:p-5 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
