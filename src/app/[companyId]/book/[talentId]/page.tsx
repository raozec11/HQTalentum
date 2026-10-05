"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, addDoc } from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { sendNotificationToAdmins, sendNotification } from "@/lib/notifications";

export default function BookTalentPage(props: { params: Promise<{ companyId: string, talentId: string }> }) {
  const params = use(props.params);
  const { user } = useAuth();
  const router = useRouter();

  const [talent, setTalent] = useState<any>(null);
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadTalent() {
      try {
        if (params.talentId === "open") {
          setTalent({ name: "Any Available Talent", id: "open" });
          setLoading(false);
          return;
        }

        const docRef = doc(db, "talents", params.talentId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const tData = docSnap.data();
          if (tData.status === "inactive") {
            setTalent({ id: docSnap.id, ...tData, isInactive: true });
          } else {
            setTalent({ id: docSnap.id, ...tData });
          }
        }
      } catch (err) {
        console.error("Failed to fetch talent", err);
      } finally {
        setLoading(false);
      }
    }
    loadTalent();
  }, [params.talentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showError("You need to sign in to book talent.");
      router.push(`/${params.companyId}/login`);
      return;
    }

    if (talent.isInactive || talent.status === "inactive") {
      showError("This talent is currently inactive and cannot receive new booking requests.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        companyId: params.companyId.toLowerCase(),
        clientId: user.uid,
        clientName: user.name || user.displayName || "Client",
        clientEmail: user.email,
        talentId: talent.id === "open" ? null : talent.id,
        talentName: talent.id === "open" ? null : (talent.displayName || talent.name),
        eventDate,
        eventTime,
        location,
        notes,
        status: "Pending", // Pending -> Assigned -> Confirmed -> Completed
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, "bookings"), payload);
      const bookingId = docRef.id;

      // 1. Notify Admins
      await sendNotificationToAdmins(params.companyId, {
        title: "New Booking Request!",
        message: `A client has requested a booking (#${bookingId.substring(0, 8)}) for talent: ${talent.name || talent.displayName || "Any Available Talent"}.`,
        type: "booking",
        link: `/${params.companyId}/dashboard/admin/bookings/all`
      });

      // 2. Notify Talent Directly if assigned/requested
      if (talent.id && talent.id !== "open") {
        await sendNotification({
          userId: talent.id,
          companyId: params.companyId,
          recipientEmail: talent.email || "",
          title: "Direct Booking Request!",
          message: `A client has requested to book you directly for an event. Check your dashboard!`,
          type: "booking",
          link: `/${params.companyId}/dashboard/talent/bookings?tab=available`
        });
      }

      showSuccess("Booking request submitted! An admin will review it shortly.");
      router.push(`/${params.companyId}/dashboard/client`);
    } catch (err) {
      console.error("Booking error", err);
      showError("Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading booking form...</div>;
  if (!talent) return <div>Talent not found.</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Booking Request</CardTitle>
          <CardDescription>
            Request to book <strong>{talent.name}</strong> for your event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Event Date</label>
                <Input 
                  type="date" 
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Event Time</label>
                <Input 
                  type="time" 
                  value={eventTime}
                  onChange={e => setEventTime(e.target.value)}
                  required 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Event Location</label>
              <Input 
                placeholder="City, Venue, or Address" 
                value={location}
                onChange={e => setLocation(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Special Instructions / Notes</label>
              <textarea 
                className="flex min-h-[100px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Tell us about the event..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
