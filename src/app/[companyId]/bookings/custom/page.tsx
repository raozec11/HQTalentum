"use client";

import BookingForm from "@/components/bookings/BookingForm";
import { useParams } from "next/navigation";

export default function CustomBookingPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  return (
    <div className="min-h-screen bg-slate-50 pt-12">
      <BookingForm companyId={companyId} mode="custom" />
    </div>
  );
}
