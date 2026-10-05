"use client";

import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";

export default function SubscriptionSuccessPage(props: {
  params: Promise<{ companyId: string }>;
}) {
  const params = use(props.params);
  const companyId = params.companyId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { user } = useAuth();

  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [amountPaid, setAmountPaid] = useState<number | null>(null);
  const [planName, setPlanName] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setErrorMessage("No payment session was found. Please verify your billing settings.");
      setVerifying(false);
      return;
    }

    async function verifyPayment() {
      try {
        // 1. Verify Stripe session via server-side API route (no admin SDK needed)
        const res = await fetch(`/api/stripe/subscription-verify?session_id=${sessionId}`);
        const data = await res.json();

        if (!res.ok || !data.paid) {
          // Log failed payment to Firestore (client-side, authenticated)
          try {
            const paymentsRef = collection(db, "companies", companyId, "subscriptionPayments");
            const dupSnap = await getDocs(
              query(paymentsRef, where("stripeSessionId", "==", sessionId))
            );
            if (dupSnap.empty) {
              await addDoc(paymentsRef, {
                amount: data.price || 0,
                billingPeriod: `${data.planName || "Starter"} Plan (${data.period === "Lifetime" ? "Lifetime" : "Monthly"})`,
                paymentMethod: "Stripe Checkout",
                status: "Failed",
                stripeSessionId: sessionId,
                createdAt: serverTimestamp(),
              });
            }
          } catch (writeErr) {
            console.warn("Could not log failed payment:", writeErr);
          }
          setErrorMessage(
            data.error || "We could not verify your payment. Please check your bank statement."
          );
          return;
        }

        // 2. Payment is confirmed — write to Firestore from client (user is authenticated)
        const { planId, planName: plan, price, period, stripeSessionId } = data;

        const paymentsRef = collection(db, "companies", companyId, "subscriptionPayments");
        const dupSnap = await getDocs(
          query(paymentsRef, where("stripeSessionId", "==", stripeSessionId))
        );

        if (dupSnap.empty) {
          // Log successful payment
          await addDoc(paymentsRef, {
            amount: price,
            billingPeriod: `${plan} Plan (${period === "Lifetime" ? "Lifetime" : "Monthly"})`,
            paymentMethod: "Stripe Checkout",
            status: "Paid",
            stripeSessionId,
            paidAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          });

          // Update company subscription status
          const updateData: any = {
            subscriptionStatus: "active",
            selectedPlan: planId,
            trialWarningSent: false,
          };

          if (period && period.toLowerCase() !== "lifetime") {
            const nextDate = new Date();
            nextDate.setMonth(nextDate.getMonth() + 1);
            updateData.nextPaymentDate = nextDate;
          }

          await updateDoc(doc(db, "companies", companyId), updateData);

          // Send a notification to the current user
          if (user?.uid) {
            try {
              await addDoc(collection(db, "notifications"), {
                userId: user.uid,
                companyId,
                title: "Workspace Subscription Activated",
                message: `Your payment of $${price} was processed via Stripe. Your workspace is now active.`,
                type: "success",
                link: `/${companyId}/dashboard/admin/subscription`,
                isRead: false,
                createdAt: serverTimestamp(),
              });
            } catch (notifErr) {
              console.warn("Notification send failed:", notifErr);
            }
          }
        }

        setAmountPaid(price);
        setPlanName(plan);
        setSuccess(true);
      } catch (err) {
        console.error("Payment verification failed:", err);
        setErrorMessage("A network error occurred while verifying your payment. Please reload the page.");
      } finally {
        setVerifying(false);
      }
    }

    verifyPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 font-sans bg-[#fafafa]">
      <div className="w-full max-w-md bg-white rounded-[32px] border border-slate-100 p-8 shadow-[0_15px_50px_rgba(0,0,0,0.03)] text-center space-y-8">

        {verifying && (
          <div className="space-y-6 py-6">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-indigo-950">Verifying Transaction</h2>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest animate-pulse">
                Contacting Stripe Payment Gateways...
              </p>
            </div>
          </div>
        )}

        {!verifying && success && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-305">
            {/* Success Icon */}
            <div className="w-20 h-20 mx-auto bg-emerald-50 rounded-[24px] flex items-center justify-center border border-emerald-100 shadow-[0_10px_30px_rgba(16,185,129,0.1)]">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full text-emerald-600 text-[10px] font-black uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" /> Activated successfully
              </div>
              <h2 className="text-2xl font-black text-indigo-950 tracking-tight">
                Subscription Renewed
              </h2>
            </div>

            {amountPaid !== null && (
              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 text-xs font-semibold text-slate-500 space-y-1.5 max-w-xs mx-auto">
                <div className="flex justify-between">
                  <span>Workspace Plan:</span>
                  <span className="text-slate-800 font-bold">{planName} Plan</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount Charged:</span>
                  <span className="text-emerald-600 font-extrabold">${amountPaid}</span>
                </div>
                <div className="flex justify-between">
                  <span>Billing Period:</span>
                  <span className="text-slate-800 font-bold">Monthly</span>
                </div>
              </div>
            )}

            <p className="text-slate-500 text-sm leading-relaxed max-w-xs mx-auto font-medium">
              Thank you! Your payment was processed successfully. All workspace features have been
              unlocked immediately.
            </p>

            <Button
              onClick={() => router.push(`/${companyId}/dashboard/admin`)}
              className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-[0_5px_15px_rgba(0,0,0,0.1)] border-0"
            >
              Go to Dashboard <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {!verifying && !success && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-305">
            <div className="w-20 h-20 mx-auto bg-rose-50 rounded-[24px] flex items-center justify-center border border-rose-100 shadow-[0_10px_30px_rgba(244,63,94,0.1)]">
              <AlertTriangle className="w-10 h-10 text-rose-500" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-rose-950 tracking-tight">
                Verification Failed
              </h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                Transaction Status Error
              </p>
            </div>

            <p className="text-rose-600/90 text-sm leading-relaxed max-w-xs mx-auto font-semibold bg-rose-50/50 p-4 rounded-2xl border border-rose-100">
              {errorMessage}
            </p>

            <div className="flex flex-col gap-3 pt-2">
              <Button
                onClick={() => router.push(`/${companyId}/dashboard/admin/subscription`)}
                className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 border-0"
              >
                Return to Subscription &amp; Billing
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
