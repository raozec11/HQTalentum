"use client";

import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, Calendar, Settings, CreditCard, BarChart2, Award, ChevronDown, ChevronRight, X, DollarSign, LifeBuoy } from "lucide-react";
import { useState, useEffect } from "react";

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const { user } = useAuth();
  const params = useParams();
  const pathname = usePathname();
  const companyId = params.companyId as string;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Automatically keep the current active route expanded
    setExpanded(prev => {
      const newState = { ...prev };
      links.forEach(link => {
        if (pathname.startsWith(link.href)) {
          newState[link.href.split('/').pop() || link.label] = true;
        }
      });
      return newState;
    });
  }, [pathname]);

  if (!user || !companyId) return null;

  const role = user.role;
  const portalLabel = role === "admin" ? "Admin Portal" : role === "staff" ? "Staff Portal" : role === "talent" ? "Talent Portal" : role === "client" ? "Client Portal" : `${role} Portal`;

  let links: { label: string; href: string; icon: any; subItems?: { label: string; href: string }[] }[] = [];

  if (role === "admin" || role === "staff") {
    links = [
      { label: "Dashboard", href: `/${companyId}/dashboard/admin`, icon: LayoutDashboard },
      { 
        label: "Talent", 
        href: `/${companyId}/dashboard/admin/talents`, 
        icon: Users,
        subItems: [
          { label: "All Talents", href: `/${companyId}/dashboard/admin/talents` },
          { label: "Pending Updates", href: `/${companyId}/dashboard/admin/talents/pendingupdate` },
          { label: "Talent Types", href: `/${companyId}/dashboard/admin/talents/types` },
          { label: "Genders", href: `/${companyId}/dashboard/admin/talents/genders` },
          { label: "Locations", href: `/${companyId}/dashboard/admin/talents/locations` },
        ]
      },
      { 
        label: "Bookings", 
        href: `/${companyId}/dashboard/admin/bookings`, 
        icon: Calendar,
        subItems: [
          { label: "All Bookings", href: `/${companyId}/dashboard/admin/bookings/all` },
          { label: "Cancelled Bookings", href: `/${companyId}/dashboard/admin/bookings/cancelled` },
          { label: "Booking Form", href: `/${companyId}/dashboard/admin/bookings/new` },
          { label: "Form Settings", href: `/${companyId}/dashboard/admin/bookings/form-settings` },
        ]
      },
      { label: "Clients", href: `/${companyId}/dashboard/admin/clients`, icon: Users },
      { label: "Calendar", href: `/${companyId}/dashboard/admin/calendar`, icon: Calendar },
      { 
        label: "Payments", 
        href: `/${companyId}/dashboard/admin/payments`, 
        icon: DollarSign,
        subItems: [
          { label: "Pending Payments", href: `/${companyId}/dashboard/admin/payments/pending` }
        ]
      },
      { label: "Reports", href: `/${companyId}/dashboard/admin/reports`, icon: BarChart2 },
      { 
        label: "Subscription & Billing", 
        href: `/${companyId}/dashboard/admin/subscription`, 
        icon: CreditCard,
        subItems: [
          { label: "Plans & Upgrade", href: `/${companyId}/dashboard/admin/subscription` },
          { label: "Billing History", href: `/${companyId}/dashboard/admin/subscription/billing-history` },
        ]
      },
      { label: "Support Tickets", href: `/${companyId}/dashboard/admin/support`, icon: LifeBuoy },
      { 
        label: "Settings", 
        href: `/${companyId}/dashboard/admin/settings`, 
        icon: Settings,
        subItems: [
          { label: "Company Settings", href: `/${companyId}/dashboard/admin/settings` },
          { label: "Payment Settings", href: `/${companyId}/dashboard/admin/payment-settings` }
        ]
      },
    ];
  } else if (role === "talent") {
    links = [
      { label: "Dashboard", href: `/${companyId}/dashboard/talent`, icon: LayoutDashboard },
      { label: "My Profile", href: `/${companyId}/dashboard/talent/profile`, icon: Users },
      { label: "Availability", href: `/${companyId}/dashboard/talent/calendar`, icon: Calendar },
      { 
        label: "Bookings", 
        href: `/${companyId}/dashboard/talent/bookings`, 
        icon: Calendar,
        subItems: [
          { label: "All Bookings", href: `/${companyId}/dashboard/talent/bookings?tab=all` },
          { label: "Pending Bookings", href: `/${companyId}/dashboard/talent/bookings?tab=pending` },
          { label: "Upcoming Bookings", href: `/${companyId}/dashboard/talent/bookings?tab=upcoming` },
          { label: "Complete Bookings", href: `/${companyId}/dashboard/talent/bookings?tab=complete` },
          { label: "Cancelled Bookings", href: `/${companyId}/dashboard/talent/bookings?tab=cancelled` },
        ]
      },
      { label: "Payments", href: `/${companyId}/dashboard/talent/payments`, icon: CreditCard },
      { label: "Reports", href: `/${companyId}/dashboard/talent/reports`, icon: BarChart2 },
    ];
  } else if (role === "client") {
    links = [
      { label: "Dashboard", href: `/${companyId}/dashboard/client`, icon: LayoutDashboard },
      { 
        label: "Bookings", 
        href: `/${companyId}/dashboard/client/bookings`, 
        icon: Calendar,
        subItems: [
          { label: "Pending Bookings", href: `/${companyId}/dashboard/client/bookings/pending` },
          { label: "Confirmed Bookings", href: `/${companyId}/dashboard/client/bookings/confirmed` },
          { label: "Cancelled Bookings", href: `/${companyId}/dashboard/client/bookings/cancelled` },
          { label: "Booking History", href: `/${companyId}/dashboard/client/bookings/history` },
          { label: "All Bookings", href: `/${companyId}/dashboard/client/bookings/all` },
        ]
      },
      { label: "New Booking", href: `/${companyId}/dashboard/client/bookings/new`, icon: Calendar },
      { label: "Payments", href: `/${companyId}/dashboard/client/payments`, icon: CreditCard },
      { label: "Profile", href: `/${companyId}/dashboard/client/profile`, icon: Settings },
    ];
  }

  const toggleExpand = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="w-64 bg-[#5046E5] h-full flex flex-col font-sans border-r border-[#4338CA]/30 shadow-xl z-10 overflow-y-auto">
      <div className="p-6 flex items-center justify-between sticky top-0 bg-[#5046E5] z-10 border-b border-[#4338CA]/30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-1.5 rounded-md">
            <Award className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-white leading-tight">Talentum</div>
            <div className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest leading-none mt-0.5">{portalLabel}</div>
          </div>
        </div>
        
        {/* Mobile Close Button */}
        {onClose && (
          <button 
            onClick={onClose}
            className="lg:hidden p-1 text-indigo-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-4 py-2 space-y-1">
        {links.map((link) => {
          const isActive = pathname === link.href || 
            (link.href !== `/${companyId}/dashboard/admin` && pathname.startsWith(link.href + "/")) ||
            (link.subItems?.some(s => pathname === s.href || pathname.startsWith(s.href + "/")) ?? false);
          const Icon = link.icon;
          const hasSubs = !!link.subItems && link.subItems.length > 0;
          const menuKey = link.href.split('/').pop() || link.label;
          const isExpanded = expanded[menuKey];

          return (
            <div key={link.href} className="flex flex-col">
              {hasSubs ? (
                <button
                  onClick={() => toggleExpand(menuKey)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 w-full",
                    isActive || isExpanded
                      ? "bg-[#3730A3] text-white shadow-inner" 
                      : "text-indigo-100 hover:bg-[#4338CA] hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn("w-[18px] h-[18px]", isActive || isExpanded ? "text-white" : "text-indigo-200")} />
                    {link.label}
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-indigo-300" /> : <ChevronRight className="w-4 h-4 text-indigo-300" />}
                </button>
              ) : (
                <Link
                  href={link.href}
                  onClick={() => onClose?.()}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                    pathname === link.href
                      ? "bg-[#3730A3] text-white shadow-inner" 
                      : "text-indigo-100 hover:bg-[#4338CA] hover:text-white"
                  )}
                >
                  <Icon className={cn("w-[18px] h-[18px]", pathname === link.href ? "text-white" : "text-indigo-200")} />
                  {link.label}
                </Link>
              )}

              {/* Submenu Dropdown */}
              {hasSubs && isExpanded && (
                <div className="mt-1 ml-4 pl-4 border-l-2 border-[#3730A3] flex flex-col space-y-1 animate-in slide-in-from-top-2 duration-200">
                  {link.subItems!.map((sub) => {
                    const isSubActive = pathname === sub.href;
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={() => onClose?.()}
                        className={cn(
                          "px-3 py-2 rounded-md text-[13px] font-medium transition-all duration-200 block",
                          isSubActive
                            ? "bg-[#4338CA] text-white"
                            : "text-indigo-200 hover:text-white hover:bg-[#4338CA]/50"
                        )}
                      >
                        {sub.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
