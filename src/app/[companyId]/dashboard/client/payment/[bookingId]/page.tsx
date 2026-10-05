"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useCompany } from "@/context/CompanyContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Smartphone, ChevronLeft, Calendar, Briefcase, Loader2, CheckCircle2, Upload, ScanLine } from "lucide-react";
import { showSuccess, showError } from "@/lib/alerts";
import { sendNotificationToAdmins } from "@/lib/notifications";

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  
  const companyId = params.companyId as string;
  const bookingId = params.bookingId as string;
  
  const { companyData } = useCompany();

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<any>(null);
  
  const [activeMethod, setActiveMethod] = useState<"CashApp" | "Venmo" | "Credit Card" | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    async function loadBooking() {
      if (!bookingId) return;
      try {
        const snap = await getDoc(doc(db, "bookings", bookingId));
        if (snap.exists()) {
          setBooking({ id: snap.id, ...snap.data() });
        } else {
          showError("Booking not found.");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadBooking();
  }, [bookingId]);

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      setReceiptPreview(URL.createObjectURL(file));
    }
  };

  const uploadReceipt = async (): Promise<string | null> => {
    if (!receiptFile) return null;
    try {
      const formData = new FormData();
      formData.append("file", receiptFile);
      formData.append("bookingId", bookingId);
      
      const res = await fetch("/api/upload-receipt", {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      return data.url;
    } catch (error) {
      console.error("Error uploading receipt:", error);
      return null;
    }
  };

  const handleSubmitManualPayment = async () => {
    if (!receiptFile || !activeMethod) return;
    
    setProcessing(true);
    try {
      const receiptUrl = await uploadReceipt();
      if (!receiptUrl) throw new Error("Failed to upload receipt");

      await updateDoc(doc(db, "bookings", bookingId), {
        paymentStatus: "Awaiting Approval",
        paymentMethod: activeMethod,
        paymentReceiptUrl: receiptUrl,
        receiptUploadedAt: new Date().toISOString()
      });
      
      await sendNotificationToAdmins(companyId, {
        title: "Payment Proof Submitted",
        message: `Client uploaded payment proof via ${activeMethod} for booking #${bookingId.substring(0, 8)}. Please review and approve.`,
        type: "success",
        link: `/${companyId}/dashboard/admin/payments/pending`
      });

      showSuccess(`Payment receipt uploaded successfully! We will review and confirm your booking shortly.`);
      router.push(`/${companyId}/dashboard/client/bookings?tab=pending`);
    } catch (err) {
      console.error(err);
      showError("Submission failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const handlePayCreditCard = async () => {
    setProcessing(true);
    try {
      const payRate = booking?.payRate || booking?.__budget || "0";
      const jobType = booking?.jobType || booking?.__jobType || "Gig Request";
      const eventDate = booking?.eventDate || "TBD";

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookingId,
          companyId,
          payRate,
          jobType,
          eventDate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create checkout session");
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned from server.");
      }
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Payment initialization failed. Please try again.");
      setProcessing(false);
    }
  };

  if (loading || !companyData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Loading Payment Details...</p>
      </div>
    );
  }

  if (!booking) return null;

  const payRate = booking.payRate || booking.__budget || "0";
  const jobType = booking.jobType || booking.__jobType || "Gig Request";

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-4 pb-16 w-full px-4 sm:px-6 lg:px-8 mt-6">
      
      <button 
        onClick={() => router.back()} 
        className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold text-sm bg-white border border-slate-200 shadow-sm px-4 h-10 rounded-xl transition-all"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Payment Options Column */}
        <div className="flex-1 space-y-6">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mb-2">Complete Payment</h1>
            <p className="text-slate-500 font-medium">Select a payment method below to confirm your booking.</p>
          </div>

          <Card className="p-6 rounded-3xl border-slate-200/60 shadow-md bg-white space-y-4">
            
            {/* CashApp Step 1 */}
            {activeMethod !== 'CashApp' && (companyData.cashappQrUrl || companyData.cashappUsername) && (
               <button 
                 onClick={() => { setActiveMethod("CashApp"); setReceiptFile(null); setReceiptPreview(""); }}
                 className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-emerald-100 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 transition-all group"
               >
                 <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-sm">
                     <Smartphone className="w-6 h-6" />
                   </div>
                   <div className="text-left">
                     <h3 className="font-black text-slate-900 text-lg">Pay with CashApp</h3>
                     <p className="text-xs font-semibold text-emerald-600">
                       {companyData.cashappQrUrl && companyData.cashappUsername
                         ? "Scan QR / pay username & upload receipt"
                         : companyData.cashappUsername
                         ? "Pay username & upload receipt"
                         : "Scan QR & upload receipt"}
                     </p>
                   </div>
                 </div>
                 <ChevronRightIcon className="w-5 h-5 text-emerald-400 group-hover:text-emerald-600" />
               </button>
            )}

            {/* CashApp Active State (Step 2) */}
            {activeMethod === 'CashApp' && (companyData.cashappQrUrl || companyData.cashappUsername) && (
               <div className="p-6 border-2 border-emerald-500 rounded-2xl bg-emerald-50/50 space-y-6 animate-in slide-in-from-top-2">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 bg-emerald-500 text-white rounded-lg flex items-center justify-center shadow-sm"><Smartphone className="w-5 h-5" /></div>
                     <h3 className="font-black text-emerald-950 text-xl">CashApp Payment</h3>
                   </div>
                   <button onClick={() => setActiveMethod(null)} className="text-sm font-bold text-emerald-600 hover:text-emerald-800">Cancel</button>
                 </div>

                 <div className="flex flex-col items-center gap-4">
                   {companyData.cashappQrUrl && (
                     <div className="bg-white p-4 rounded-3xl shadow-sm border border-emerald-100 inline-block">
                       <img src={companyData.cashappQrUrl} alt="CashApp QR" className="w-48 h-48 object-contain" />
                     </div>
                   )}

                   {companyData.cashappUsername && (
                     <div className="text-center bg-white border border-emerald-100 p-3 rounded-2xl max-w-xs w-full shadow-sm">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">CashApp Username</span>
                       <span className="text-sm font-black text-emerald-600 font-mono">${companyData.cashappUsername}</span>
                     </div>
                   )}
                 </div>
                 
                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-emerald-800 text-center">
                      {companyData.cashappQrUrl && companyData.cashappUsername ? (
                        <>Scan the QR code or pay to username <strong className="font-black font-mono">${companyData.cashappUsername}</strong> to pay <strong className="font-black">${payRate}</strong> via CashApp. Once paid, screenshot the receipt and upload it below to verify your payment.</>
                      ) : companyData.cashappUsername ? (
                        <>Pay <strong className="font-black">${payRate}</strong> to username <strong className="font-black font-mono">${companyData.cashappUsername}</strong> via CashApp. Once paid, screenshot the receipt and upload it below to verify your payment.</>
                      ) : (
                        <>Scan the QR code above to pay <strong className="font-black">${payRate}</strong> via CashApp. Once paid, screenshot the receipt and upload it below to verify your payment.</>
                      )}
                    </p>
                    
                    <div className="relative group w-full h-[120px] rounded-2xl border-2 border-dashed border-emerald-300 bg-white flex items-center justify-center transition-all hover:border-emerald-500 overflow-hidden cursor-pointer">
                       {receiptPreview ? (
                         <img src={receiptPreview} className="w-full h-full object-cover opacity-80" alt="Receipt preview" />
                       ) : (
                         <div className="flex flex-col items-center text-emerald-600">
                           <Upload className="w-6 h-6 mb-2" />
                           <span className="font-bold text-sm">Upload Screenshot</span>
                         </div>
                       )}
                       <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handleReceiptChange} />
                    </div>

                    <Button 
                      className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-black shadow-lg shadow-emerald-600/20"
                      disabled={!receiptFile || processing}
                      onClick={handleSubmitManualPayment}
                    >
                      {processing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ScanLine className="w-5 h-5 mr-2" />}
                      Submit CashApp Receipt
                    </Button>
                  </div>
               </div>
            )}

            {/* Venmo Step 1 */}
            {activeMethod !== 'Venmo' && (companyData.venmoQrUrl || companyData.venmoUsername) && (
               <button 
                 onClick={() => { setActiveMethod("Venmo"); setReceiptFile(null); setReceiptPreview(""); }}
                 className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-blue-100 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-all group"
               >
                 <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-blue-500 text-white rounded-xl flex items-center justify-center shadow-sm">
                     <span className="font-black text-2xl italic leading-none">V</span>
                   </div>
                   <div className="text-left">
                     <h3 className="font-black text-slate-900 text-lg">Pay with Venmo</h3>
                     <p className="text-xs font-semibold text-blue-600">
                       {companyData.venmoQrUrl && companyData.venmoUsername
                         ? "Scan QR / pay username & upload receipt"
                         : companyData.venmoUsername
                         ? "Pay username & upload receipt"
                         : "Scan QR & upload receipt"}
                     </p>
                   </div>
                 </div>
                 <ChevronRightIcon className="w-5 h-5 text-blue-400 group-hover:text-blue-600" />
               </button>
            )}

            {/* Venmo Active State (Step 2) */}
            {activeMethod === 'Venmo' && (companyData.venmoQrUrl || companyData.venmoUsername) && (
               <div className="p-6 border-2 border-blue-500 rounded-2xl bg-blue-50/50 space-y-6 animate-in slide-in-from-top-2">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 bg-blue-500 text-white rounded-lg flex items-center justify-center shadow-sm font-black text-xl italic leading-none">V</div>
                     <h3 className="font-black text-blue-950 text-xl">Venmo Payment</h3>
                   </div>
                   <button onClick={() => setActiveMethod(null)} className="text-sm font-bold text-blue-600 hover:text-blue-800">Cancel</button>
                 </div>

                 <div className="flex flex-col items-center gap-4">
                   {companyData.venmoQrUrl && (
                     <div className="bg-white p-4 rounded-3xl shadow-sm border border-blue-100 inline-block">
                       <img src={companyData.venmoQrUrl} alt="Venmo QR" className="w-48 h-48 object-contain" />
                     </div>
                   )}

                   {companyData.venmoUsername && (
                     <div className="text-center bg-white border border-blue-100 p-3 rounded-2xl max-w-xs w-full shadow-sm">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Venmo Username</span>
                       <span className="text-sm font-black text-blue-600 font-mono">@{companyData.venmoUsername}</span>
                     </div>
                   )}
                 </div>
                 
                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-blue-850 text-center">
                      {companyData.venmoQrUrl && companyData.venmoUsername ? (
                        <>Scan the QR code or pay to username <strong className="font-black font-mono">@{companyData.venmoUsername}</strong> to pay <strong className="font-black">${payRate}</strong> via Venmo. Once paid, screenshot the receipt and upload it below to verify your payment.</>
                      ) : companyData.venmoUsername ? (
                        <>Pay <strong className="font-black">${payRate}</strong> to username <strong className="font-black font-mono">@{companyData.venmoUsername}</strong> via Venmo. Once paid, screenshot the receipt and upload it below to verify your payment.</>
                      ) : (
                        <>Scan the QR code above to pay <strong className="font-black">${payRate}</strong> via Venmo. Once paid, screenshot the receipt and upload it below to verify your payment.</>
                      )}
                    </p>
                    
                    <div className="relative group w-full h-[120px] rounded-2xl border-2 border-dashed border-blue-300 bg-white flex items-center justify-center transition-all hover:border-blue-500 overflow-hidden cursor-pointer">
                       {receiptPreview ? (
                         <img src={receiptPreview} className="w-full h-full object-cover opacity-80" alt="Receipt preview" />
                       ) : (
                         <div className="flex flex-col items-center text-blue-600">
                           <Upload className="w-6 h-6 mb-2" />
                           <span className="font-bold text-sm">Upload Screenshot</span>
                         </div>
                       )}
                       <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handleReceiptChange} />
                    </div>

                    <Button 
                      className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-black shadow-lg shadow-blue-600/20"
                      disabled={!receiptFile || processing}
                      onClick={handleSubmitManualPayment}
                    >
                      {processing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ScanLine className="w-5 h-5 mr-2" />}
                      Submit Venmo Receipt
                    </Button>
                  </div>
               </div>
            )}

            {activeMethod !== 'Credit Card' && activeMethod !== 'CashApp' && activeMethod !== 'Venmo' && companyData.stripeEnabled && (
               <button 
                 onClick={handlePayCreditCard}
                 disabled={processing}
                 className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-indigo-100 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 transition-all group disabled:opacity-50"
               >
                 <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-sm">
                     <CreditCard className="w-6 h-6" />
                   </div>
                   <div className="text-left">
                     <h3 className="font-black text-slate-900 text-lg">Pay with Card</h3>
                     <p className="text-xs font-semibold text-indigo-600">Credit or debit processed securely</p>
                   </div>
                 </div>
                 {processing ? <Loader2 className="w-6 h-6 animate-spin text-indigo-600" /> : <ChevronRightIcon className="w-5 h-5 text-indigo-400 group-hover:text-indigo-600" />}
               </button>
            )}

            {!companyData.cashappQrUrl && !companyData.cashappUsername && !companyData.venmoQrUrl && !companyData.venmoUsername && !companyData.stripeEnabled && (
              <div className="text-center py-8 px-4 text-slate-400 bg-slate-50 border border-dashed rounded-3xl">
                <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-2 opacity-60" />
                <p className="text-sm font-bold text-slate-700 mb-1">No payment methods configured</p>
                <p className="text-xs text-slate-450 font-semibold">Please contact the workspace administrator to confirm payment details.</p>
              </div>
            )}
            
          </Card>
        </div>

        {/* Invoice Column */}
        <div className="w-full md:w-[350px] shrink-0">
          <Card className="p-6 rounded-3xl border-slate-200/60 shadow-lg bg-slate-900 text-white sticky top-24">
             <h3 className="font-black text-xl mb-6">Invoice Summary</h3>
             
             <div className="space-y-4">
               <div className="flex items-start justify-between pb-4 border-b border-slate-700">
                 <div>
                   <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Service</p>
                   <p className="font-bold text-slate-100">{jobType}</p>
                 </div>
                 <Briefcase className="w-5 h-5 text-slate-500" />
               </div>

               <div className="flex items-start justify-between pb-4 border-b border-slate-700">
                 <div>
                   <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Booking ID</p>
                   <p className="font-mono text-xs font-bold text-slate-200 bg-slate-800 px-2 py-1 rounded inline-block">#{booking.id.slice(0,10).toUpperCase()}</p>
                 </div>
               </div>

               <div className="flex items-start justify-between pb-6 border-b border-slate-700">
                 <div>
                   <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Event Date</p>
                   <p className="font-bold text-slate-100">
                     {booking.eventDate ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(booking.eventDate)) : "TBD"}
                   </p>
                 </div>
                 <Calendar className="w-5 h-5 text-slate-500" />
               </div>

               <div className="pt-2">
                 <div className="flex items-center justify-between mb-1">
                   <p className="text-slate-400 font-bold">Total Amount</p>
                   <p className="text-3xl font-black text-emerald-400">${payRate}</p>
                 </div>
                 <p className="text-xs text-slate-500 font-medium text-right shadow-sm">Includes all fees & taxes</p>
               </div>
             </div>

             <div className="mt-8 bg-slate-800 p-4 rounded-xl flex items-center gap-3">
               <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
               <p className="text-xs text-slate-300 font-medium whitespace-pre-wrap">
                 {activeMethod === 'CashApp' || activeMethod === 'Venmo' 
                   ? "For manual payments, your booking will be confirmed immediately after an admin verifies your screenshot."
                   : "Your booking will be confirmed automatically upon successful payment."}
               </p>
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ChevronRightIcon({ className }: { className: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
  );
}
