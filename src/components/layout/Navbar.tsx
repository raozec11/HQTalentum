"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import { useRouter, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Bell, Search, Info, CheckCircle2, AlertTriangle, Calendar, Menu, Settings, LogOut, X, Building2, Sparkles, Users, Crown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";

interface NavbarProps {
  onMenuClick?: () => void;
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const { user } = useAuth();
  const pathname = usePathname() || "";
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Active Portal Indicator resolution
  let portalInfo = {
    title: "Dashboard",
    badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200/80 shadow-indigo-100/50",
    dotColor: "bg-indigo-500 animate-pulse",
    icon: <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
  };

  if (pathname.includes("/dashboard/admin") || (user?.role && ["admin", "staff", "company_admin"].includes(user.role))) {
    portalInfo = {
      title: "Admin Panel",
      badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200/80 shadow-indigo-100/50",
      dotColor: "bg-indigo-500 animate-pulse",
      icon: <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
    };
  } else if (pathname.includes("/dashboard/talent") || user?.role === "talent") {
    portalInfo = {
      title: "Talent Panel",
      badgeBg: "bg-purple-50 text-purple-700 border-purple-200/80 shadow-purple-100/50",
      dotColor: "bg-purple-500 animate-pulse",
      icon: <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
    };
  } else if (pathname.includes("/dashboard/client") || user?.role === "client") {
    portalInfo = {
      title: "Client Panel",
      badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-emerald-100/50",
      dotColor: "bg-emerald-500 animate-pulse",
      icon: <Users className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
    };
  } else if (pathname.includes("/master") || user?.role === "platform_admin") {
    portalInfo = {
      title: "Master Panel",
      badgeBg: "bg-rose-50 text-rose-700 border-rose-200/80 shadow-rose-100/50",
      dotColor: "bg-rose-500 animate-pulse",
      icon: <Crown className="w-3.5 h-3.5 text-rose-600 shrink-0" />
    };
  }

  useEffect(() => setMounted(true), []);

  const handleLogoutClick = () => {
    setIsProfileDropdownOpen(false);
    setShowLogoutModal(true);
  };

  const handleLogoutConfirm = async () => {
    setShowLogoutModal(false);
    await auth.signOut();
    if (user?.companyId) {
      router.push(`/${user.companyId}/login`);
    } else {
      router.push("/login"); 
    }
  };

  const handleSettingsClick = () => {
    setIsProfileDropdownOpen(false);
    if (!user) return;
    if (user.role === "platform_admin") {
      router.push("/master");
    } else if (user.role === "talent") {
      router.push(`/${user.companyId}/dashboard/talent/profile`);
    } else {
      router.push(`/${user.companyId}/dashboard/${user.role}/settings`);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs
        .map(d => d.data())
        .sort((a: any, b: any) => {
          const aTime = a.createdAt?.toMillis?.() ?? new Date(a.createdAt || 0).getTime();
          const bTime = b.createdAt?.toMillis?.() ?? new Date(b.createdAt || 0).getTime();
          return bTime - aTime;
        });
      setUnreadCount(docs.filter((d: any) => d.isRead === false).length);
      const rawDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => {
          const aTime = a.createdAt?.toMillis?.() ?? new Date(a.createdAt || 0).getTime();
          const bTime = b.createdAt?.toMillis?.() ?? new Date(b.createdAt || 0).getTime();
          return bTime - aTime;
        });
      setRecentNotifications(rawDocs.slice(0, 4));
    });

    return () => unsubscribe();
  }, [user]);

  const handleViewAllNotifications = () => {
    setIsDropdownOpen(false);
    if (!user) return;
    if (user.role === "platform_admin") {
      router.push("/master/notifications");
    } else {
      router.push(`/${user.companyId}/dashboard/${user.role}/notifications`);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "alert": return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case "success": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "booking": return <Calendar className="w-4 h-4 text-indigo-500" />;
      case "info":
      case "system":
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <header className="h-16 sm:h-20 px-3 sm:px-8 bg-white flex items-center justify-between border-b shadow-sm flex-shrink-0 z-10 w-full">
      {/* Left: Menu button & Search */}
      <div className="flex items-center gap-3 shrink-0 sm:flex-1 sm:max-w-xs">
        <button 
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors"
          aria-label="Open Menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="relative w-full max-w-xs hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            className="w-full pl-10 bg-slate-50 border-slate-200 rounded-xl h-10 text-sm focus-visible:ring-indigo-500"
            placeholder="Search..." 
          />
        </div>
      </div>

      {/* Center: Active Panel Indicator Badge (Prominently visible on Mobile & Desktop) */}
      <div className="flex-1 flex items-center justify-center px-1">
        <div className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-black uppercase tracking-wider border shadow-sm transition-all ${portalInfo.badgeBg}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${portalInfo.dotColor}`} />
          {portalInfo.icon}
          <span className="whitespace-nowrap font-black">{portalInfo.title}</span>
        </div>
      </div>
      
      {/* Right: Notifications & Profile */}
      <div className="flex items-center gap-3 sm:gap-6 shrink-0">
        <div className="flex items-center gap-4 text-slate-500 relative">
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="relative hover:text-indigo-600 transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-white"></span>
                </span>
              )}
            </button>
            {isDropdownOpen && (
               <div className="absolute top-10 right-0 w-80 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                 <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <span className="font-bold text-slate-800">Notifications</span>
                    {unreadCount > 0 && <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">{unreadCount} New</span>}
                 </div>
                 <div className="max-h-80 overflow-y-auto">
                    {recentNotifications.length === 0 ? (
                       <div className="p-6 text-center text-slate-400 text-sm">No recent notifications</div>
                    ) : (
                       recentNotifications.map(notif => (
                          <div key={notif.id} className={`p-4 border-b border-slate-50 hover:bg-slate-50 cursor-pointer flex gap-3 transition-colors ${!notif.isRead ? 'bg-indigo-50/30' : ''}`} onClick={() => { setIsDropdownOpen(false); if (notif.link) router.push(notif.link); }}>
                             <div className="mt-0.5">{getIcon(notif.type)}</div>
                             <div className="flex-1 min-w-0">
                                <p className={`text-sm truncate ${!notif.isRead ? 'font-bold text-slate-900' : 'text-slate-700'}`}>{notif.title}</p>
                                <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{notif.message}</p>
                                <p className="text-[10px] text-slate-400 mt-1 font-medium">{notif.createdAt ? formatDistanceToNow(notif.createdAt.toDate(), { addSuffix: true }) : "Just now"}</p>
                             </div>
                             {!notif.isRead && <div className="w-2 h-2 bg-indigo-600 rounded-full mt-1.5 flex-shrink-0" />}
                          </div>
                       ))
                    )}
                 </div>
                 <div className="p-3 border-t border-slate-50 bg-slate-50 flex justify-center">
                    <button onClick={handleViewAllNotifications} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors w-full text-center">
                      View all notifications
                    </button>
                 </div>
               </div>
            )}
          </div>
        </div>
        <div className="h-8 w-px bg-slate-200 hidden sm:block" />
        
        <div className="relative" ref={profileDropdownRef}>
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border-2 transition-all ${isProfileDropdownOpen ? 'border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50' : 'border-indigo-100 bg-indigo-50 group-hover:border-indigo-300'}`}>
              {user?.photoUrl ? (
                <img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-indigo-700 font-bold text-sm">
                  {user?.name?.charAt(0) || "A"}
                </span>
              )}
            </div>
            <div className="text-sm font-medium text-slate-700 group-hover:text-indigo-600 transition-colors hidden sm:flex items-center gap-1">
              <span className="truncate max-w-[120px]">{user?.name || "Admin"}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-400 group-hover:text-indigo-600 ml-1 transition-transform ${isProfileDropdownOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
          
          {isProfileDropdownOpen && (
            <div className="absolute top-12 right-0 w-48 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 p-1">
              <div className="px-3 py-2 border-b border-slate-50 mb-1">
                <p className="text-xs font-bold text-slate-800 line-clamp-1">{user?.name}</p>
                <p className="text-[10px] text-slate-400 capitalize">{user?.role?.replace('_', ' ')}</p>
              </div>
              <button 
                onClick={handleSettingsClick}
                className="w-full text-left px-3 py-2 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
              <button 
                onClick={handleLogoutClick}
                className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Custom Logout Modal using Portal */}
      {showLogoutModal && mounted && createPortal(
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl relative overflow-hidden text-center animate-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-red-500" />
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-5 shrink-0 ring-4 ring-red-50/50">
              <LogOut className="w-8 h-8 ml-1" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Sign Out</h2>
            <p className="text-slate-500 font-medium mb-8 text-[13px] leading-relaxed px-2">Are you sure you want to sign out of your account? You will need to log back in to access your dashboard.</p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200/50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleLogoutConfirm}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 shadow-sm shadow-red-500/20 transition-all active:scale-[0.98]"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
