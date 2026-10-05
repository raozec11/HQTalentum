"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";

/**
 * Loads the current platform user's permissions from Firestore platform_roles/{role}
 * and returns a hasPermission(id) helper.
 */
export function usePlatformPermissions() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.role) { setLoading(false); return; }
    async function load() {
      try {
        if (!user || (!user.role)) return;
        const roleSnap = await getDoc(doc(db, "platform_roles", user.role));
        if (roleSnap.exists()) {
          setPermissions(roleSnap.data().permissions || []);
        } else {
          setPermissions([]); // unknown role = no permissions
        }
      } catch (e) {
        console.error("Failed to load permissions:", e);
        setPermissions([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.role]);

  const hasPermission = (permId: string): boolean => permissions.includes(permId);

  return { permissions, hasPermission, permissionsLoading: loading };
}
