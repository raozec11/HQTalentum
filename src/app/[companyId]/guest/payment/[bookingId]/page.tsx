"use client";

import { useEffect, useState, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { 
  CreditCard, Smartphone, ChevronLeft, Calendar, Briefcase, 
  Loader2, CheckCircle2, Upload, ScanLine, ShieldCheck, DollarSign,
  AlertCircle, MapPin, Clock, FileText, ArrowLeft, MessageSquare
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { showSuccess, showError } from "@/lib/alerts";
import { sendNotificationToAdmins } from "@/lib/notifications";
import { useAuth } from "@/context/AuthContext";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";
import { BookingChatButton } from "@/components/bookings/BookingChatButton";

export default function GuestPaymentPage(props: { params: Promise<{ companyId: string; bookingId: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  
  const companyId = params.companyId;
  const bookingId = params.bookingId;

  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<any>(null);
  const [companyData, setCompanyData] = useState<any>(null);
  
  const [activeMethod, setActiveMethod] = useState<"CashApp" | "Venmo" | "Credit Card" | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [processing, setProcessing] = useState(false);

  // Chat State
  const [showChatModal, setShowChatModal] = useState(false);

  const chatUser = useMemo(() => {
    if (user) return user;
    return {
      uid: booking?.clientId && booking?.clientId !== "guest" ? booking.clientId : `guest_${bookingId}`,
      name: booking?.clientName || "Guest Client",
      email: booking?.clientEmail || "",
      role: "client"
    };
  }, [user, booking, bookingId]);

  useEffect(() => {
    async function loadDetails() {
      if (!bookingId || !companyId) return;
      try {
        // Fetch Booking and Company in parallel
        const [bookingSnap, companySnap] = await Promise.all([
          getDoc(doc(db, "bookings", bookingId)),
          getDoc(doc(db, "companies", companyId.toLowerCase()))
        ]);

        if (bookingSnap.exists()) {
          const bData = bookingSnap.data();
          const bCompany = (bData?.companyId || companyId || "").toLowerCase();
          if (bCompany === companyId.toLowerCase()) {
            setBooking({ id: bookingSnap.id, ...bData });
          } else {
            showError("Invalid booking company context.");
          }
        } else {
          showError("Booking not found.");
        }

        if (companySnap.exists()) {
          setCompanyData(companySnap.data());
        } else {
          // Fallback if company config doesn't exist directly by ID
          setCompanyData({ name: companyId.toUpperCase() });
        }
      } catch (err) {
        console.error("Failed to load guest payment details:", err);
        setCompanyData({ name: companyId.toUpperCase() });
      } finally {
        setLoading(false);
      }
    }
    loadDetails();

    if (!bookingId) return;
    const unsub = onSnapshot(doc(db, "bookings", bookingId), (snap) => {
      if (snap.exists()) {
        const updatedData = { id: snap.id, ...snap.data() };
        setBooking(prev => prev ? { ...prev, ...updatedData } : updatedData);
      }
    });
    return () => unsub();
  }, [bookingId, companyId]);

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
        title: "Guest Payment Proof Submitted",
        message: `Guest client uploaded payment proof via ${activeMethod} for booking #${bookingId.substring(0, 8)}. Please review and approve.`,
        type: "success",
        link: `/${companyId}/dashboard/admin/payments/pending`
      });

      showSuccess("Payment receipt uploaded successfully! We will review and confirm your booking shortly.");
      router.push(`/${companyId}/guest/booking/${bookingId}`);
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50/50">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">Loading Invoice Details...</p>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100/50 px-4">
        <Card className="max-w-md w-full rounded-[36px] border-none shadow-2xl p-10 text-center bg-white">
          <div className="w-20 h-20 bg-rose-50 rounded-[28px] flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-rose-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Invoice Not Found</h2>
          <p className="text-slate-500 mt-3 font-medium text-sm leading-relaxed">This secure link is either expired, completed, or doesn't belong to the current company directory.</p>
        </Card>
      </div>
    );
  }

  const payRate = booking.payRate || booking.__budget || "0";
  const jobType = booking.jobType || booking.__jobType || "Gig Request";

  return (
    <div className="min-h-screen bg-slate-50/60 pb-24 text-slate-900 font-sans antialiased">
      
      {/* Brand Header */}
      <div className="relative bg-white/70 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-30 shadow-[0_4px_30px_rgba(0,0,0,0.02)]">
        {/* Glowing top line */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {companyData.logoUrl ? (
              <img src={companyData.logoUrl} alt={companyData.name} className="h-10 w-auto object-contain max-w-[160px] transition-transform duration-300 hover:scale-105" />
            ) : (
              <div className="h-10 w-10 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-xl flex items-center justify-center text-white font-extrabold text-base shadow-md shadow-indigo-200/50">
                {companyData.name?.substring(0, 2).toUpperCase() || "TL"}
              </div>
            )}
            <span className="font-extrabold text-slate-800 tracking-tight text-lg uppercase hidden sm:inline">{companyData.name}</span>
          </div>
          
          <div className="flex items-center gap-3">
            <BookingChatButton 
              bookingId={bookingId} 
              userId={chatUser.uid} 
              onClick={() => setShowChatModal(true)} 
              className="bg-white shadow-sm"
            />

            <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-teal-50/50 border border-emerald-200/65 px-4 py-2 rounded-full shadow-sm">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-[11px] font-black text-emerald-800 uppercase tracking-widest hidden sm:inline">Encrypted Checkout</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        {/* Back Button */}
        <button 
          onClick={() => router.push(`/${companyId}/guest/booking/${bookingId}`)}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold text-sm bg-white border border-slate-200 shadow-sm px-4 h-10 rounded-xl transition-all mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Review Page
        </button>

        {/* Dynamic Premium Header Hero */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-[32px] p-6 sm:p-10 mb-8 shadow-xl relative overflow-hidden">
          <div className="absolute right-0 bottom-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 space-y-3">
            <span className="bg-white/10 backdrop-blur text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-white/15">
              Secure Guest Payment
            </span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
              Pay Your Booking Invoice
            </h1>
            <p className="text-indigo-200/80 text-sm font-medium max-w-2xl leading-relaxed">
              Select one of the payment options configured by the company below to finalize your performer selection and confirm your event logistics.
            </p>
          </div>
        </div>

        {/* Content Columns Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Payment Methods (Left) */}
          <div className="lg:col-span-8 space-y-6">
            <Card className="p-6 rounded-[28px] border-slate-250 shadow-md bg-white space-y-5">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Select Payment Method</h3>
                <p className="text-xs text-slate-450 font-bold mt-1">Screenshot submission is required for manual payments.</p>
              </div>

              <div className="space-y-4">
                {/* CashApp */}
                {activeMethod !== 'CashApp' && (companyData.cashappQrUrl || companyData.cashappUsername) && (
                   <button 
                     onClick={() => { setActiveMethod("CashApp"); setReceiptFile(null); setReceiptPreview(""); }}
                     className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-emerald-100 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-300 transition-all group"
                   >
                     <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-emerald-550 text-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                         <Smartphone className="w-6 h-6" />
                       </div>
                       <div className="text-left">
                         <h3 className="font-extrabold text-slate-900 text-base">Pay with CashApp</h3>
                         <p className="text-xs font-semibold text-emerald-600">
                           {companyData.cashappQrUrl && companyData.cashappUsername
                             ? "Scan QR / pay username & upload receipt"
                             : companyData.cashappUsername
                             ? "Pay username & upload receipt"
                             : "Scan QR & upload receipt"}
                         </p>
                       </div>
                     </div>
                     <ChevronLeft className="w-5 h-5 text-emerald-400 group-hover:text-emerald-600 rotate-180" />
                   </button>
                )}

                {activeMethod === 'CashApp' && (companyData.cashappQrUrl || companyData.cashappUsername) && (
                   <div className="p-6 border-2 border-emerald-500 rounded-[24px] bg-emerald-50/20 space-y-6 animate-in slide-in-from-top-2">
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-emerald-550 text-white rounded-xl flex items-center justify-center shadow-sm shrink-0"><Smartphone className="w-5 h-5" /></div>
                         <h3 className="font-black text-emerald-950 text-lg">CashApp Payment</h3>
                       </div>
                       <button onClick={() => setActiveMethod(null)} className="text-xs font-bold text-emerald-600 hover:text-emerald-800">Change Method</button>
                     </div>

                     <div className="flex flex-col items-center gap-4">
                       {companyData.cashappQrUrl && (
                         <div className="bg-white p-4 rounded-3xl shadow-sm border border-emerald-100 inline-block">
                           <img src={companyData.cashappQrUrl} alt="CashApp QR" className="w-44 h-44 object-contain" />
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
                       <p className="text-xs font-semibold text-emerald-850 text-center leading-relaxed max-w-md mx-auto">
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
                             <span className="font-bold text-xs">Upload Screenshot</span>
                           </div>
                         )}
                         <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handleReceiptChange} />
                       </div>

                       <Button 
                         className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-black shadow-md shadow-emerald-600/10 text-white"
                         disabled={!receiptFile || processing}
                         onClick={handleSubmitManualPayment}
                       >
                         {processing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ScanLine className="w-5 h-5 mr-2" />}
                         Submit CashApp Receipt
                       </Button>
                     </div>
                   </div>
                )}

                {/* Venmo */}
                {activeMethod !== 'Venmo' && (companyData.venmoQrUrl || companyData.venmoUsername) && (
                   <button 
                     onClick={() => { setActiveMethod("Venmo"); setReceiptFile(null); setReceiptPreview(""); }}
                     className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-blue-100 bg-blue-50/40 hover:bg-blue-50 hover:border-blue-300 transition-all group"
                   >
                     <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-blue-500 text-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                         <span className="font-black text-2xl italic leading-none">V</span>
                       </div>
                       <div className="text-left">
                         <h3 className="font-extrabold text-slate-900 text-base">Pay with Venmo</h3>
                         <p className="text-xs font-semibold text-blue-600">
                           {companyData.venmoQrUrl && companyData.venmoUsername
                             ? "Scan QR / pay username & upload receipt"
                             : companyData.venmoUsername
                             ? "Pay username & upload receipt"
                             : "Scan QR & upload receipt"}
                         </p>
                       </div>
                     </div>
                     <ChevronLeft className="w-5 h-5 text-blue-400 group-hover:text-blue-600 rotate-180" />
                   </button>
                )}

                {activeMethod === 'Venmo' && (companyData.venmoQrUrl || companyData.venmoUsername) && (
                   <div className="p-6 border-2 border-blue-500 rounded-[24px] bg-blue-50/20 space-y-6 animate-in slide-in-from-top-2">
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-blue-500 text-white rounded-xl flex items-center justify-center shadow-sm font-black text-xl italic leading-none shrink-0">V</div>
                         <h3 className="font-black text-blue-950 text-lg">Venmo Payment</h3>
                       </div>
                       <button onClick={() => setActiveMethod(null)} className="text-xs font-bold text-blue-600 hover:text-blue-800">Change Method</button>
                     </div>

                     <div className="flex flex-col items-center gap-4">
                       {companyData.venmoQrUrl && (
                         <div className="bg-white p-4 rounded-3xl shadow-sm border border-blue-100 inline-block">
                           <img src={companyData.venmoQrUrl} alt="Venmo QR" className="w-44 h-44 object-contain" />
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
                       <p className="text-xs font-semibold text-blue-850 text-center leading-relaxed max-w-md mx-auto">
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
                             <span className="font-bold text-xs">Upload Screenshot</span>
                           </div>
                         )}
                         <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handleReceiptChange} />
                       </div>

                       <Button 
                         className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-black shadow-md shadow-blue-600/10 text-white"
                         disabled={!receiptFile || processing}
                         onClick={handleSubmitManualPayment}
                       >
                         {processing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ScanLine className="w-5 h-5 mr-2" />}
                         Submit Venmo Receipt
                       </Button>
                     </div>
                   </div>
                )}

                {/* Card - Stripe */}
                {activeMethod !== 'Credit Card' && activeMethod !== 'CashApp' && activeMethod !== 'Venmo' && companyData.stripeEnabled && (
                   <button 
                     onClick={handlePayCreditCard}
                     disabled={processing}
                     className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-indigo-155 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-300 transition-all group disabled:opacity-50"
                   >
                     <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                         <CreditCard className="w-6 h-6" />
                       </div>
                       <div className="text-left">
                         <h3 className="font-extrabold text-slate-900 text-base">Pay with Card</h3>
                         <p className="text-xs font-semibold text-indigo-600">Credit or debit card processed securely</p>
                       </div>
                     </div>
                     {processing ? <Loader2 className="w-6 h-6 animate-spin text-indigo-600" /> : <ChevronLeft className="w-5 h-5 text-indigo-400 group-hover:text-indigo-600 rotate-180" />}
                   </button>
                )}

                {!companyData.cashappQrUrl && !companyData.cashappUsername && !companyData.venmoQrUrl && !companyData.venmoUsername && !companyData.stripeEnabled && (
                  <div className="text-center py-10 px-4 text-slate-400 bg-slate-50 border border-dashed rounded-3xl">
                    <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3 opacity-60" />
                    <p className="text-sm font-bold text-slate-700 mb-1">No payment methods configured</p>
                    <p className="text-xs text-slate-450 font-semibold leading-relaxed">Please contact the workspace administrator to confirm payment details.</p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Invoice Summary (Right) */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="p-6 rounded-[28px] border-none shadow-lg bg-slate-900 text-white sticky top-24">
               <h3 className="font-black text-xl mb-6 flex items-center gap-2">
                 <FileText className="w-5 h-5 text-indigo-400" />
                 Invoice Summary
               </h3>
               
               <div className="space-y-4">
                 <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                   <div>
                     <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Service Requested</p>
                     <p className="font-bold text-slate-100 text-sm leading-snug">{jobType}</p>
                   </div>
                   <Briefcase className="w-5 h-5 text-slate-500 shrink-0" />
                 </div>

                 <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                   <div>
                     <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Booking ID</p>
                     <p className="font-mono text-xs font-bold text-slate-200 bg-slate-800 px-2 py-1 rounded inline-block">#{bookingId.slice(0,10).toUpperCase()}</p>
                   </div>
                 </div>

                 <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                   <div>
                     <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Event Date</p>
                     <p className="font-bold text-slate-100 text-sm">
                       {booking.eventDate ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(booking.eventDate)) : "TBD"}
                     </p>
                   </div>
                   <Calendar className="w-5 h-5 text-slate-500 shrink-0" />
                 </div>

                 <div className="flex items-start justify-between pb-6 border-b border-slate-800">
                   <div>
                     <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Venue Location</p>
                     <p className="font-bold text-slate-100 text-xs leading-normal">{booking.address}</p>
                     <p className="text-slate-400 text-[11px] mt-0.5">{booking.city}, {booking.state}</p>
                   </div>
                   <MapPin className="w-5 h-5 text-slate-500 shrink-0" />
                 </div>

                 <div className="pt-2">
                   <div className="flex items-center justify-between mb-1">
                     <p className="text-slate-400 font-bold text-sm">Total Due</p>
                     <p className="text-3xl font-black text-emerald-400">${payRate}</p>
                   </div>
                   <p className="text-[10px] text-slate-500 font-medium text-right">Includes all fees & taxes</p>
                 </div>
               </div>

               <div className="mt-8 bg-slate-800 p-4 rounded-2xl flex items-center gap-3">
                 <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                 <p className="text-xs text-slate-350 leading-relaxed font-semibold">
                   {activeMethod === 'CashApp' || activeMethod === 'Venmo' 
                     ? "For manual payments, your booking will be confirmed immediately after an admin verifies your screenshot."
                     : "Your booking will be confirmed automatically upon successful card payment."}
                 </p>
               </div>
            </Card>
          </div>

        </div>
      </div>

      {/* Floating Action Chat Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <BookingChatButton 
          bookingId={bookingId} 
          userId={chatUser.uid} 
          onClick={() => setShowChatModal(true)}
          className="h-14 px-6 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xl border-2 border-white text-sm font-black transition-all hover:scale-105"
        />
      </div>

      {/* Real-time Booking Chat Modal */}
      {showChatModal && (
        <BookingChatModal 
          booking={booking} 
          user={chatUser} 
          onClose={() => setShowChatModal(false)} 
        />
      )}
    </div>
  );
}
