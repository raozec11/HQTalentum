"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Building2, Users, Calendar, Shield, Zap, Sparkles, LayoutGrid, CheckCircle2,
  ArrowRight, Star, MessageSquare, CreditCard, Settings, Layout, Menu, X
} from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col relative overflow-hidden font-sans">
      
      {/* Background gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#4f46e5]/10 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#312e81]/15 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute top-[30%] right-[10%] w-[350px] h-[350px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* Modern Floating Header */}
      <header className="sticky top-0 z-40 w-full bg-[#070b13]/60 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black tracking-tight text-white bg-clip-text">
              Talentum
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pillars" className="hover:text-white transition-colors">Agencies</a>
            <a href="#mockup" className="hover:text-white transition-colors">Interface</a>
          </nav>

          {/* Desktop Right Side */}
          <div className="hidden md:flex items-center gap-3">
            <button 
              onClick={() => router.push("/login")}
              className="text-sm font-bold text-slate-300 hover:text-white px-4 py-2 rounded-xl transition-all"
            >
              Access Workspace
            </button>
            <button 
              onClick={() => router.push("/register-agency")}
              className="text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/10 hover:scale-105 active:scale-95 transition-all"
            >
              Register Agency
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-400 hover:text-white transition-colors"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#070b13]/95 backdrop-blur-2xl px-6 py-6 space-y-6 animate-in fade-in slide-in-from-top-4 duration-200">
            <nav className="flex flex-col gap-4 text-base font-semibold text-slate-400">
              <a 
                href="#features" 
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-white transition-colors py-2"
              >
                Features
              </a>
              <a 
                href="#pillars" 
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-white transition-colors py-2"
              >
                Agencies
              </a>
              <a 
                href="#mockup" 
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-white transition-colors py-2"
              >
                Interface
              </a>
            </nav>
            <div className="border-t border-white/5 pt-6 flex flex-col gap-3">
              <button 
                onClick={() => {
                  setMobileMenuOpen(false);
                  router.push("/login");
                }}
                className="w-full py-3 text-center text-sm font-bold text-slate-300 hover:text-white bg-white/5 rounded-xl border border-white/10 transition-all"
              >
                Access Workspace
              </button>
              <button 
                onClick={() => {
                  setMobileMenuOpen(false);
                  router.push("/register-agency");
                }}
                className="w-full py-3 text-center text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-600/10 transition-all"
              >
                Register Agency
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-16 md:pt-24 pb-20 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/25 rounded-full text-indigo-400 text-xs font-black tracking-wide uppercase mb-6 animate-pulse">
          <Sparkles className="w-3.5 h-3.5" /> Next-Gen Multi-Tenant Platform
        </div>
        
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-tight leading-[1.15] max-w-5xl">
          The Operating System for <span className="bg-gradient-to-r from-indigo-400 via-violet-500 to-sky-400 bg-clip-text text-transparent">Entertainment Agencies</span>
        </h1>
        
        <p className="text-slate-400 text-base sm:text-xl font-medium mt-6 max-w-3xl leading-relaxed">
          Broadcast casting calls, coordinate bookings, manage custom profiles, handle invoicing, and secure client relations under your own branded agency portal.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mt-10 w-full sm:w-auto">
          <button 
            onClick={() => router.push("/login")}
            className="w-full sm:w-auto h-12 px-8 rounded-xl bg-white text-slate-950 font-black text-sm hover:bg-slate-100 transition-all flex items-center justify-center gap-2 shadow-xl shadow-white/5 hover:-translate-y-0.5"
          >
            Access Workspace <ArrowRight className="w-4 h-4 text-slate-950" />
          </button>
          <button 
            onClick={() => router.push("/register-agency")}
            className="w-full sm:w-auto h-12 px-8 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-black text-sm hover:scale-102 active:scale-98 transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5"
          >
            Launch Your Agency <Building2 className="w-4 h-4 text-indigo-400" />
          </button>
        </div>

        {/* Dashboard Mockup Representation */}
        <div id="mockup" className="scroll-mt-24 w-full max-w-5xl mt-20 p-2 sm:p-4 bg-white/5 border border-white/10 rounded-[32px] shadow-2xl relative z-10">
          <div className="bg-[#070b13] border border-white/5 rounded-[24px] overflow-hidden flex flex-col md:flex-row min-h-[420px]">
            {/* Sidebar Representation */}
            <div className="w-full md:w-60 border-r border-white/5 p-5 flex flex-col justify-between shrink-0 bg-slate-900/20">
              <div className="space-y-6">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
                  <span className="font-bold text-xs text-white">Agency Dashboard</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 px-3 py-2 bg-white/5 text-white rounded-lg text-xs font-bold"><Layout className="w-4 h-4 text-indigo-400" /> Overview</div>
                  <div className="flex items-center gap-2.5 px-3 py-2 text-slate-400 hover:text-white rounded-lg text-xs font-semibold"><Users className="w-4 h-4" /> Talents list</div>
                  <div className="flex items-center gap-2.5 px-3 py-2 text-slate-400 hover:text-white rounded-lg text-xs font-semibold"><Calendar className="w-4 h-4" /> Bookings</div>
                  <div className="flex items-center gap-2.5 px-3 py-2 text-slate-400 hover:text-white rounded-lg text-xs font-semibold"><CreditCard className="w-4 h-4" /> Invoices</div>
                </div>
              </div>
              <div className="pt-6 border-t border-white/5 flex items-center gap-2.5 px-1">
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold">JD</div>
                <div className="text-left min-w-0">
                  <p className="text-[11px] font-bold text-white truncate">John Doe</p>
                  <p className="text-[9.5px] text-slate-500 font-semibold truncate">Agency Admin</p>
                </div>
              </div>
            </div>

            {/* Content Mockup Body */}
            <div className="flex-1 p-6 md:p-8 space-y-6 text-left bg-slate-950/40">
              <div className="flex justify-between items-center pb-4 border-b border-white/5">
                <div>
                  <h4 className="text-sm font-black text-white">Active Gigs Tracker</h4>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Live monitoring of booked performers</p>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">Live System</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Performer Card Mockup */}
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-3 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center font-black text-xs">AC</div>
                      <div>
                        <h5 className="text-xs font-bold text-white">Alex Carter</h5>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5 flex items-center gap-1"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /> 4.9 Performer</p>
                      </div>
                    </div>
                    <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 px-2 py-0.5 rounded font-black uppercase">Confirmed</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-semibold space-y-1">
                    <p className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-indigo-400" /> Jun 11, 2026 @ 18:17</p>
                    <p className="flex items-center gap-1">📍 New York City, NY</p>
                  </div>
                </div>

                {/* Performer Card Mockup 2 */}
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-3 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 animate-pulse" />
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 text-white flex items-center justify-center font-black text-xs">MC</div>
                      <div>
                        <h5 className="text-xs font-bold text-white">Maria C.</h5>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5 flex items-center gap-1"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /> 5.0 Dancer</p>
                      </div>
                    </div>
                    <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded font-black uppercase">Selected</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-semibold space-y-1">
                    <p className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-indigo-400" /> Jun 15, 2026 @ 20:00</p>
                    <p className="flex items-center gap-1">📍 Los Angeles, CA</p>
                  </div>
                </div>
              </div>

              {/* Invoicing Section Mockup */}
              <div className="p-4 bg-slate-900/40 border border-white/5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-orange-500/10 text-orange-400 border border-orange-500/25 rounded-xl"><CreditCard className="w-4 h-4" /></div>
                  <div>
                    <h5 className="text-xs font-bold text-white">Invoice ID: #61978439</h5>
                    <p className="text-[10.5px] text-slate-400 font-semibold mt-0.5">Awaiting Stripe transaction approval</p>
                  </div>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <span className="text-[9px] text-slate-500 block uppercase font-black">Total Paid</span>
                  <span className="text-sm font-black text-emerald-400">$350.00</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars Breakdown */}
      <section id="pillars" className="scroll-mt-20 relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-white/5">
        <div className="text-center space-y-3 mb-16">
          <h2 className="text-3xl sm:text-4xl font-black text-white">Tailored Solutions for Your Entire Workflow</h2>
          <p className="text-slate-400 text-sm sm:text-base font-semibold max-w-xl mx-auto">One portal to connect agencies, clients, and performers seamlessly.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Agencies */}
          <div className="bg-[#0b0f19] border border-white/5 hover:border-indigo-500/30 p-8 rounded-3xl space-y-6 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 group-hover:scale-110 transition-all">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Agency Managers</h3>
            <p className="text-slate-400 text-sm font-medium leading-relaxed">
              Accept registrations, review applicant portfolios, assign jobs, control payout terms, write central announcements, and monitor total earnings dynamically.
            </p>
          </div>

          {/* Performers */}
          <div className="bg-[#0b0f19] border border-white/5 hover:border-violet-500/30 p-8 rounded-3xl space-y-6 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 text-violet-400 flex items-center justify-center border border-violet-500/20 group-hover:scale-110 transition-all">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Performers &amp; Talents</h3>
            <p className="text-slate-400 text-sm font-medium leading-relaxed">
              Create gorgeous portfolios, set location bounds, apply for available gigs, accept client offers, chat directly on assigned gigs, and log payout transactions.
            </p>
          </div>

          {/* Clients */}
          <div className="bg-[#0b0f19] border border-white/5 hover:border-sky-500/30 p-8 rounded-3xl space-y-6 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20 group-hover:scale-110 transition-all">
              <Star className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Clients</h3>
            <p className="text-slate-400 text-sm font-medium leading-relaxed">
              Browse profiles using robust filters, apply secure Stripe checkouts, direct message performers, log payment receipts, and submit ratings.
            </p>
          </div>
        </div>
      </section>

      {/* Features Showcase Grid */}
      <section id="features" className="scroll-mt-20 relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-white/5">
        <div className="text-center space-y-3 mb-16">
          <h2 className="text-3xl sm:text-4xl font-black text-white">Core Capabilities</h2>
          <p className="text-slate-400 text-sm sm:text-base font-semibold max-w-xl mx-auto">Engineered to drive growth, trust, and speed for agencies.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          
          <div className="p-6 bg-[#0b0f19] border border-white/5 rounded-2xl space-y-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center justify-center"><Zap className="w-5 h-5"/></div>
            <h4 className="font-bold text-white text-base">Instant Open Bids</h4>
            <p className="text-slate-400 text-xs font-semibold leading-relaxed">Cast open bookings to list matching talents automatically. Let performers apply instantly.</p>
          </div>

          <div className="p-6 bg-[#0b0f19] border border-white/5 rounded-2xl space-y-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/25 flex items-center justify-center"><MessageSquare className="w-5 h-5"/></div>
            <h4 className="font-bold text-white text-base">Unified Booking Chat</h4>
            <p className="text-slate-400 text-xs font-semibold leading-relaxed">Direct message performers individually under each booking to organize scheduling safely.</p>
          </div>

          <div className="p-6 bg-[#0b0f19] border border-white/5 rounded-2xl space-y-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/25 flex items-center justify-center"><CreditCard className="w-5 h-5"/></div>
            <h4 className="font-bold text-white text-base">Stripe &amp; Manual Payments</h4>
            <p className="text-slate-400 text-xs font-semibold leading-relaxed">Process credit cards securely via Stripe checkout or upload Venmo/CashApp verification receipts.</p>
          </div>

          <div className="p-6 bg-[#0b0f19] border border-white/5 rounded-2xl space-y-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 flex items-center justify-center"><Star className="w-5 h-5"/></div>
            <h4 className="font-bold text-white text-base">Feedback &amp; Reviews</h4>
            <p className="text-slate-400 text-xs font-semibold leading-relaxed">Double-sided ratings for performers and clients. Maintain standard reputation scores.</p>
          </div>

          <div className="p-6 bg-[#0b0f19] border border-white/5 rounded-2xl space-y-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/25 flex items-center justify-center"><Settings className="w-5 h-5"/></div>
            <h4 className="font-bold text-white text-base">Custom Brand Styling</h4>
            <p className="text-slate-400 text-xs font-semibold leading-relaxed">Agencies set custom primary colors, secondary tones, and upload logos to personalize dashboards.</p>
          </div>

          <div className="p-6 bg-[#0b0f19] border border-white/5 rounded-2xl space-y-4">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/25 flex items-center justify-center"><Shield className="w-5 h-5"/></div>
            <h4 className="font-bold text-white text-base">Multi-Tenant Isolation</h4>
            <p className="text-slate-400 text-xs font-semibold leading-relaxed">Every agency workspace enjoys isolated databases, custom registrations, and staff controls.</p>
          </div>
        </div>
      </section>

      {/* Platform Stats */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-16 border-t border-white/5 text-center">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <span className="text-3xl sm:text-5xl font-black text-white">100%</span>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Mobile Responsive</p>
          </div>
          <div>
            <span className="text-3xl sm:text-5xl font-black text-white">Stripe</span>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Integrated Payments</p>
          </div>
          <div>
            <span className="text-3xl sm:text-5xl font-black text-white">Real-Time</span>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Chat Channels</p>
          </div>
          <div>
            <span className="text-3xl sm:text-5xl font-black text-white">Isolated</span>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Multi-Tenant data</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-slate-950/40 border-t border-white/5 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
            <span className="text-sm font-black text-white">Talentum Portal Engine</span>
          </div>
          <p className="text-xs text-slate-500 font-bold">&copy; {new Date().getFullYear()} Talentum. All rights reserved.</p>
          <div className="flex gap-6 text-xs font-semibold text-slate-500">
            <a href="/terms" className="hover:text-slate-300">Terms of Service</a>
            <a href="/master/login" className="hover:text-slate-300">Platform Admin Portal</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
