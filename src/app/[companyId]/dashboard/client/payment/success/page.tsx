"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { showSuccess, showError } from "@/lib/alerts";
import { sendNotificationToAdmins, sendNotification } from "@/lib/notifications";
import { Loader2, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  
  const companyId = params.companyId as string;
  const bookingId = searchParams.get("bookingId");
  const sessionId = searchParams.get("session_id");
  const paymentType = searchParams.get("paymentType") || "booking";

  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!bookingId || !sessionId) {
      setStatus("failed");
      setErrorMessage("Missing payment parameters.");
      return;
    }

    const safeBookingId = bookingId as string;
    let isMounted = true;

    async function verifyPayment() {
      try {
        const verifyRes = await fetch(`/api/stripe/verify?session_id=${sessionId}&bookingId=${safeBookingId}&paymentType=${paymentType}`);
        const data = await verifyRes.json();

        if (!isMounted) return;

        if (data.paid) {
          // Client-side fallback write if the server-side update didn't go through
          if (!data.updateSuccessful) {
            console.log("Server update failed or bypassed. Executing client-side fallback write...");
            try {
              if (paymentType === "tip") {
                await updateDoc(doc(db, "bookings", safeBookingId), {
                  tipStatus: "Paid",
                  tipStripePaymentIntentId: data.stripePaymentIntentId || null,
                  tipPaidAt: new Date().toISOString()
                });
              } else {
                await updateDoc(doc(db, "bookings", safeBookingId), {
                  status: "Confirmed",
                  paymentMethod: "Credit Card",
                  paymentStatus: "Paid",
                  stripePaymentIntentId: data.stripePaymentIntentId || null,
                  paidAt: new Date().toISOString()
                });
              }
            } catch (dbErr) {
              console.error("Client-side fallback write failed too:", dbErr);
            }
          }

          // Trigger admin notifications
          try {
            if (paymentType === "tip") {
              await sendNotificationToAdmins(companyId, {
                title: "Tip Received!",
                message: `Client has successfully tipped via Credit Card for booking #${safeBookingId.substring(0, 8).toUpperCase()}.`,
                type: "success",
                link: `/${companyId}/dashboard/admin/bookings/all`
              });
            } else {
              await sendNotificationToAdmins(companyId, {
                title: "Payment Received!",
                message: `Client has successfully paid via Credit Card for booking #${safeBookingId.substring(0, 8).toUpperCase()}. The booking is now Confirmed.`,
                type: "success",
                link: `/${companyId}/dashboard/admin/bookings/all`
              });
            }
          } catch (notifErr) {
            console.error("Failed to send admin payment notification:", notifErr);
          }

          // Trigger client notification
          try {
            const bookingSnap = await getDoc(doc(db, "bookings", safeBookingId));
            if (bookingSnap.exists()) {
              const bData = bookingSnap.data();
              const clientId = bData.clientId;
              const clientEmail = bData.clientEmail;
              
              if (clientId && clientId !== "guest") {
                if (paymentType === "tip") {
                  await sendNotification({
                    userId: clientId,
                    companyId,
                    recipientEmail: clientEmail || "",
                    title: "Tip Payment Successful",
                    message: `Your tip payment for booking #${safeBookingId.substring(0, 8).toUpperCase()} has been processed successfully. Thank you!`,
                    type: "success",
                    link: `/${companyId}/dashboard/client/bookings?tab=history`
                  });
                } else {
                  await sendNotification({
                    userId: clientId,
                    companyId,
                    recipientEmail: clientEmail || "",
                    title: "Payment Confirmed!",
                    message: `Payment successful! Your booking #${safeBookingId.substring(0, 8).toUpperCase()} is now Confirmed.`,
                    type: "success",
                    link: `/${companyId}/dashboard/client/bookings?tab=confirmed`
                  });
                }
              }
            }
          } catch (clientNotifErr) {
            console.error("Failed to send client payment notification:", clientNotifErr);
          }

          setStatus("success");
          if (paymentType === "tip") {
            showSuccess("Tip payment successful! Thank you.");
          } else {
            showSuccess("Payment successful! Your booking is now confirmed.");
          }
          
          // Auto redirect after 4 seconds
          setTimeout(() => {
            if (isMounted) {
              if (paymentType === "tip") {
                router.push(`/${companyId}/dashboard/client/bookings?tab=history`);
              } else {
                router.push(`/${companyId}/dashboard/client/bookings?tab=confirmed`);
              }
            }
          }, 4000);
        } else {
          setStatus("failed");
          setErrorMessage(data.error || "Payment was not fully processed.");
        }
      } catch (err: any) {
        console.error("Verification error:", err);
        if (isMounted) {
          setStatus("failed");
          setErrorMessage("Failed to verify payment status.");
        }
      }
    }

    verifyPayment();

    return () => {
      isMounted = false;
    };
  }, [bookingId, sessionId, companyId, paymentType, router]);

  if (status === "verifying") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
        <h2 className="text-2xl font-black text-slate-800">Verifying Payment...</h2>
        <p className="text-sm font-semibold text-slate-500 max-w-sm">We are confirming your transaction with Stripe. Please do not close or refresh this page.</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 max-w-md mx-auto px-4">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center shadow-md ring-4 ring-rose-50/50">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900">Payment Verification Failed</h2>
          <p className="text-sm font-bold text-slate-500 leading-relaxed">{errorMessage}</p>
        </div>
        <Button 
          onClick={() => router.push(`/${companyId}/dashboard/client`)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 px-8 rounded-xl shadow-md w-full"
        >
          Go to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 max-w-md mx-auto px-4 animate-in fade-in duration-300">
      <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center shadow-md ring-4 ring-emerald-50/50">
        <CheckCircle2 className="w-8 h-8" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-black text-slate-900">
          {paymentType === "tip" ? "Tip Payment Successful!" : "Payment Successful!"}
        </h2>
        <p className="text-sm font-bold text-slate-500 leading-relaxed">
          {paymentType === "tip" 
            ? "Your tip has been successfully processed. Thank you for your appreciation! You will be redirected in a few seconds..."
            : "Your booking has been successfully confirmed. You will be redirected to your dashboard in a few seconds..."}
        </p>
      </div>
      <Button 
        onClick={() => router.push(`/${companyId}/dashboard/client/bookings?tab=${paymentType === "tip" ? "history" : "confirmed"}`)}
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-8 rounded-xl shadow-md flex items-center gap-2"
      >
        Go to Bookings <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Loading...</p>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
