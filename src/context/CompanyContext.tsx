"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface CompanyData {
  id: string;
  name: string;
  logoUrl?: string;
  brandColor?: string;
  brandSecondary?: string;
  brandAccent?: string;
  brandText?: string;
  // Payment QR codes & Usernames
  cashappQrUrl?: string;
  venmoQrUrl?: string;
  cashappUsername?: string;
  venmoUsername?: string;
  // Additional optional fields stored in Firestore
  [key: string]: any;
}

interface CompanyContextType {
  companyData: CompanyData | null;
  loading: boolean;
  refreshCompanyData: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType>({
  companyData: null,
  loading: true,
  refreshCompanyData: async () => {},
});

export const CompanyProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const rawId = params?.companyId as string;
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);

  // Canonical ID resolution: prefer user.companyId if it matches slug (ignoring case)
  const companyId = React.useMemo(() => {
    if (!rawId) return null;
    if (user?.companyId && user.companyId.toLowerCase() === rawId.toLowerCase()) {
      return user.companyId;
    }
    return rawId;
  }, [user?.companyId, rawId]);

  const fetchCompanyData = async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    try {
      const docRef = doc(db, "companies", companyId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setCompanyData({ id: docSnap.id, ...docSnap.data() } as CompanyData);
      }
    } catch (error) {
      console.error("Error fetching company data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId || authLoading) return;

    const unsubscribe = onSnapshot(
      doc(db, "companies", companyId), 
      (doc) => {
        if (doc.exists()) {
          const data = doc.data() as any;
          const { id, ...rest } = data;
          setCompanyData({ id: doc.id, ...rest });
          
          // Apply CSS variables
          if (data.brandColor) {
             document.documentElement.style.setProperty('--brand-primary', data.brandColor);
             // Generate secondary/accent if not provided (simple dark-then-darker logic for now)
             document.documentElement.style.setProperty('--brand-secondary', data.brandSecondary || adjustColor(data.brandColor, -20));
             document.documentElement.style.setProperty('--brand-accent', data.brandAccent || adjustColor(data.brandColor, -40));
             document.documentElement.style.setProperty('--brand-text', data.brandText || (getContrastYIQ(data.brandColor) === 'black' ? '#000000' : '#ffffff'));
          }
        }
        setLoading(false);
      },
      (error) => {
        console.error("Snapshot error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [companyId]);

  return (
    <CompanyContext.Provider value={{ companyData, loading, refreshCompanyData: fetchCompanyData }}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => useContext(CompanyContext);

// Helper to darken/lighten color
function adjustColor(col: string, amt: number) {
  let usePound = false;
  if (col[0] === "#") {
    col = col.slice(1);
    usePound = true;
  }
  const num = parseInt(col, 16);
  let r = (num >> 16) + amt;
  if (r > 255) r = 255; else if (r < 0) r = 0;
  let b = ((num >> 8) & 0x00FF) + amt;
  if (b > 255) b = 255; else if (b < 0) b = 0;
  let g = (num & 0x0000FF) + amt;
  if (g > 255) g = 255; else if (g < 0) g = 0;
  return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
}

// Helper to get contrast color (black or white)
function getContrastYIQ(hexcolor: string) {
  hexcolor = hexcolor.replace("#", "");
  const r = parseInt(hexcolor.substring(0, 2), 16);
  const g = parseInt(hexcolor.substring(2, 4), 16);
  const b = parseInt(hexcolor.substring(4, 6), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? 'black' : 'white';
}
