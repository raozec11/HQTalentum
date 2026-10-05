"use client";

import { useState, use, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { CompanyProvider, useCompany } from "@/context/CompanyContext";
import SubscriptionLockScreen from "@/components/SubscriptionLockScreen";
import VerificationLockScreen from "@/components/VerificationLockScreen";
import TalentVerificationLockScreen from "@/components/TalentVerificationLockScreen";
import DisabledLockScreen from "@/components/DisabledLockScreen";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { sendNotificationToAdmins } from "@/lib/notifications";
import { useAuth } from "@/context/AuthContext";

function DashboardInner({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { companyData, loading } = useCompany();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!companyData || !companyData.id || loading) return;

    const checkTrialAlerts = async () => {
      if (companyData.trialEndDate) {
        const end = companyData.trialEndDate.toDate ? companyData.trialEndDate.toDate() : new Date(companyData.trialEndDate);
        const diff = end.getTime() - Date.now();

        if (diff > 0) {
          const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
          // Send warning if 1 day left and not sent yet
          if (daysLeft <= 1 && !companyData.trialWarning1DaySent) {
            try {
              await updateDoc(doc(db, "companies", companyData.id), {
                trialWarning1DaySent: true
              });
              await sendNotificationToAdmins(companyData.id, {
                title: "1 Day Remaining in Free Trial!",
                message: `Your free trial for "${companyData.name}" ends in 1 day (on ${end.toLocaleDateString("en-GB")}). Please subscribe to a plan to keep your workspace active.`,
                type: "alert"
              });
            } catch (err) {
              console.error("Error sending 1-day warning:", err);
            }
          }
        } else {
          // Trial has expired
          if (!companyData.trialExpiredNotificationSent && companyData.subscriptionStatus !== "active") {
            try {
              await updateDoc(doc(db, "companies", companyData.id), {
                trialExpiredNotificationSent: true
              });
              await sendNotificationToAdmins(companyData.id, {
                title: "Workspace Suspended - Trial Expired",
                message: `Your free trial for "${companyData.name}" has expired and access is suspended. Please subscribe to a plan to restore workspace access.`,
                type: "error"
              });
            } catch (err) {
              console.error("Error sending trial expired notification:", err);
            }
          }
        }
      }
    };

    checkTrialAlerts();
  }, [companyData, loading]);

  // If company context is loading, display spinner
  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-indigo-500"></div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-slate-500">Loading workspace...</p>
      </div>
    );
  }

  // If company is disabled/blacklisted by master admin — highest priority lock
  if (companyData?.status === "disabled" || companyData?.status === "blacklisted") {
    return <DisabledLockScreen companyData={companyData} />;
  }

  // If email is not verified, show verification lock screen
  if (companyData?.emailVerified === false) {
    return <VerificationLockScreen companyData={companyData} />;
  }

  // If logged in user is a talent and email is not verified, show talent verification lock screen
  if (user?.role === "talent" && !user?.emailVerified) {
    return <TalentVerificationLockScreen companyId={companyData?.id || ""} />;
  }

  // Calculate if company workspace is locked (trial expired and no paid active status)
  let isLocked = false;
  if (companyData) {
    let isTrialActive = false;
    let isTrialExpired = false;

    if (companyData.trialEndDate) {
      const end = companyData.trialEndDate.toDate ? companyData.trialEndDate.toDate() : new Date(companyData.trialEndDate);
      const diff = end.getTime() - Date.now();
      if (diff > 0) {
        isTrialActive = true;
      } else {
        isTrialExpired = true;
      }
    }

    if (isTrialExpired && companyData.subscriptionStatus !== "active") {
      isLocked = true;
    }
  }

  // If locked, override the dashboard with the lock screen
  if (isLocked) {
    return <SubscriptionLockScreen companyData={companyData} />;
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden relative">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transform lg:relative lg:translate-x-0 transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
         <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 w-full">
        <Navbar onMenuClick={() => setIsMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);

  return (
    <ProtectedRoute requireCompanyContext companyId={companyId}>
      <CompanyProvider>
        <DashboardInner>{children}</DashboardInner>
      </CompanyProvider>
    </ProtectedRoute>
  );
}
