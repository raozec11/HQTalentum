"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useParams } from "next/navigation";
import BookingForm from "@/components/bookings/BookingForm";
import { Loader2 } from "lucide-react";

export default function ClientBookingNewPage() {
  const params = useParams();
  const { user } = useAuth();
  const companyId = params.companyId as string;

  const [loading, setLoading] = useState(true);
  const [activeForm, setActiveForm] = useState<"default" | "custom">("default");

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, "companies", companyId, "settings", "bookingForm"));
        if (snap.exists()) {
          setActiveForm(snap.data().activeForm || "default");
        }
      } catch (e) {
        console.error("Error loading form settings:", e);
      } finally {
        setLoading(false);
      }
    }
    if (companyId) load();
  }, [companyId]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
    </div>
  );

  return (
    <div className="pt-6">
      <BookingForm companyId={companyId} mode={activeForm} />
    </div>
  );
}
