"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type UserRole = "client" | "talent" | "staff" | "company_admin" | "admin" | "platform_admin" | null;

export interface AppUser {
  uid: string;
  email: string;
  role: UserRole;
  companyId: string | null;
  name: string;
  displayName?: string; // Standardized field
  photoUrl?: string;
  profileImage?: string; // Fallback mapping
  emailVerified: boolean;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refreshUser: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (firebaseUser: FirebaseUser) => {
    const [userDoc, talentDoc] = await Promise.all([
      getDoc(doc(db, "users", firebaseUser.uid)),
      getDoc(doc(db, "talents", firebaseUser.uid))
    ]);

    if (userDoc.exists() || talentDoc.exists()) {
      const userData = userDoc.data() || {};
      const talentData = talentDoc.data() || {};
      let role = userData.role || talentData.role || null;
      const companyId = userData.companyId || talentData.companyId || null;

      // Auto-repair: If user matches company owner/admin, restore role to "admin"
      if (companyId && firebaseUser.email) {
        try {
          const compSnap = await getDoc(doc(db, "companies", companyId));
          if (compSnap.exists()) {
            const cData = compSnap.data();
            const isOwner = (cData.adminEmail && cData.adminEmail.toLowerCase() === firebaseUser.email.toLowerCase()) || cData.adminId === firebaseUser.uid;
            if (isOwner && role !== "admin" && role !== "platform_admin") {
              const { updateDoc } = await import("firebase/firestore");
              await updateDoc(doc(db, "users", firebaseUser.uid), { role: "admin" });
              role = "admin";
            }
          }
        } catch (e) {
          console.warn("AuthContext admin role repair error:", e);
        }
      }

      return {
        uid: firebaseUser.uid,
        email: firebaseUser.email || userData.email || talentData.email || "",
        role: role,
        companyId: companyId,
        name: talentData.displayName || talentData.name || userData.name || userData.displayName || "",
        photoUrl: talentData.photoUrl || talentData.profileImage || userData.photoUrl || userData.profileImage || "",
        emailVerified: firebaseUser.emailVerified,
      };
    } else {
      return {
        uid: firebaseUser.uid,
        email: firebaseUser.email || "",
        role: null,
        companyId: null,
        name: "",
        emailVerified: firebaseUser.emailVerified,
      };
    }
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      setLoading(true);
      try {
        await auth.currentUser.reload();
        const updated = await fetchUserData(auth.currentUser);
        setUser(updated);
      } catch (error) {
        console.error("Error refreshing user data:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        try {
          const uData = await fetchUserData(firebaseUser);
          setUser(uData);
        } catch (error) {
          console.error("Error fetching user data on auth state change:", error);
          setUser(null);
        } finally {
          setLoading(false);
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
