"use client";

import { useAuth, UserRole } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requireCompanyContext?: boolean;
  companyId?: string;
}

export default function ProtectedRoute({
  children,
  allowedRoles,
  requireCompanyContext = false,
  companyId,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Not logged in -> redirect to login
        if (companyId) {
          router.push(`/${companyId}/login`);
        } else {
          router.push("/login");
        }
        return;
      }

      // Check company context
      const dbCompanyId = String(user.companyId || "").trim().toLowerCase();
      const urlCompanyId = String(companyId || "").trim().toLowerCase();
      
      if (requireCompanyContext && companyId && dbCompanyId !== urlCompanyId && user.role !== "platform_admin") {
         router.push(`/${companyId}/login`); // or an unauthorized page
         return;
      }

      // Check role
      if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        // Unauthorized
        router.push(`/${companyId || "global"}/unauthorized`);
      }
    }
  }, [user, loading, router, allowedRoles, requireCompanyContext, companyId]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // Safe check
  const dbCompanyId = String(user?.companyId || "").trim().toLowerCase();
  const urlCompanyId = String(companyId || "").trim().toLowerCase();

  // Only render children if user exists and passes checks
  if (!user || 
     (requireCompanyContext && companyId && dbCompanyId !== urlCompanyId && user.role !== "platform_admin") ||
     (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role))) {
    return null;
  }

  return <>{children}</>;
}
