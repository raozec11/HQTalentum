"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Search, CheckCircle2, Clock, CreditCard, DollarSign, X } from "lucide-react";
import { showSuccess, showError } from "@/lib/alerts";
import { sendNotification } from "@/lib/notifications";

export default function PendingPaymentsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]); // manual pending approvals
  const [stripeBookings, setStripeBookings] = useState<any[]>([]);
  const [stripeTips, setStripeTips] = useState<any[]>([]);
  const [subTab, setSubTab] = useState<"pending" | "stripe_bookings" | "stripe_tips">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null);
  const [declineBookingId, setDeclineBookingId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  useEffect(() => {
    fetchPayments();
  }, [companyId]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "bookings"),
        where("companyId", "==", companyId)
      );
      const snap = await getDocs(q);
      
      const manualPending: any[] = [];
      const stripeB: any[] = [];
      const stripeT: any[] = [];
      
      snap.forEach(d => {
        const data = { id: d.id, ...d.data() } as any;
        
        // 1. Manual Payments Awaiting Approval
        if (data.paymentStatus === "Awaiting Approval" && data.paymentReceiptUrl) {
          manualPending.push(data);
        }
        
        // 2. Stripe Booking Payments
        const isStripeBooking = data.paymentMethod?.toLowerCase() === "stripe" || 
                               data.paymentMethod?.toLowerCase() === "card" || 
                               data.paymentMethod?.toLowerCase() === "credit card" || 
                               !!data.stripePaymentIntentId;
        if (isStripeBooking && data.paymentStatus === "Paid") {
          stripeB.push(data);
        }
        
        // 3. Stripe Tip Payments
        const isStripeTip = data.tipPaymentMethod?.toLowerCase() === "stripe" || 
                           data.tipPaymentMethod?.toLowerCase() === "card" || 
                           data.tipPaymentMethod?.toLowerCase() === "credit card" || 
                           !!data.tipStripePaymentIntentId;
        if (isStripeTip && data.tipStatus === "Paid") {
          stripeT.push(data);
        }
      });
      
      // Sort manual approvals by receipt uploaded date or created date
      manualPending.sort((a: any, b: any) => new Date(b.receiptUploadedAt || b.createdAt || 0).getTime() - new Date(a.receiptUploadedAt || a.createdAt || 0).getTime());
      
      // Sort Stripe bookings by paid date or created date
      stripeB.sort((a: any, b: any) => new Date(b.paidAt || b.createdAt || 0).getTime() - new Date(a.paidAt || a.createdAt || 0).getTime());
      
      // Sort Stripe tips by tip paid date or paid date
      stripeT.sort((a: any, b: any) => new Date(b.tipPaidAt || b.paidAt || b.createdAt || 0).getTime() - new Date(a.tipPaidAt || a.paidAt || a.createdAt || 0).getTime());
      
      setBookings(manualPending);
      setStripeBookings(stripeB);
      setStripeTips(stripeT);
    } catch (err) {
      console.error(err);
      showError("Failed to load payments.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (booking: any) => {
    setProcessingId(booking.id);
    try {
      await updateDoc(doc(db, "bookings", booking.id), {
        status: "Confirmed",
        paymentStatus: "Paid",
        paidAt: new Date().toISOString()
      });

      if (booking.clientId) {
        await sendNotification({
          companyId,
          userId: booking.clientId,
          recipientEmail: booking.clientEmail || "",
          title: "Payment Approved!",
          message: `Your manual payment via ${booking.paymentMethod} for booking #${booking.id.substring(0,8)} has been approved. Your booking is now Confirmed.`,
          type: "success",
          link: `/${companyId}/dashboard/client/bookings?tab=confirmed`
        });
      }

      showSuccess("Payment approved successfully!");
      setBookings(prev => prev.filter(b => b.id !== booking.id));
    } catch (err) {
      console.error(err);
      showError("Failed to approve payment. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineSubmit = async () => {
    if (!declineBookingId) return;
    if (!declineReason.trim()) {
      showError("Please provide a reason for declining the payment.");
      return;
    }
    
    setProcessingId(declineBookingId);
    try {
      const booking = bookings.find(b => b.id === declineBookingId);
      await updateDoc(doc(db, "bookings", declineBookingId), {
        paymentStatus: "Declined",
        paymentDeclineReason: declineReason,
        paymentReceiptUrl: null,
        declinedAt: new Date().toISOString()
      });

      if (booking?.clientId) {
        await sendNotification({
          companyId,
          userId: booking.clientId,
          recipientEmail: booking.clientEmail || "",
          title: "Payment Declined",
          message: `Your manual payment for booking #${declineBookingId.substring(0,8)} was declined. Reason: ${declineReason}. Please try submitting payment again.`,
          type: "alert",
          link: `/${companyId}/dashboard/client/payment/${declineBookingId}`
        });
      }

      showSuccess("Payment declined successfully.");
      setBookings(prev => prev.filter(b => b.id !== declineBookingId));
      setDeclineBookingId(null);
      setDeclineReason("");
    } catch (err) {
      console.error(err);
      showError("Failed to decline payment.");
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (ts: any): string => {
    if (!ts) return "—";
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return "—"; }
  };

  const filteredBookings = bookings.filter(b => 
    b.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (b.clientName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.paymentMethod || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredStripeBookings = stripeBookings.filter(b => 
    b.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (b.clientName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.stripePaymentIntentId || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.clientEmail || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredStripeTips = stripeTips.filter(b => 
    b.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (b.clientName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.tipStripePaymentIntentId || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.talentName || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="h-full min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Payments & Approvals</h1>
          <p className="text-slate-500 font-medium">
            {subTab === "pending" && "Review and approve screenshots of manual payments (CashApp, Venmo)."}
            {subTab === "stripe_bookings" && "View booking payments settled securely via Stripe checkout."}
            {subTab === "stripe_tips" && "View client tips and gratuities paid to talents via Stripe."}
          </p>
        </div>
        
        <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 border border-slate-200 shadow-sm w-full md:w-[300px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder={
              subTab === "pending" 
                ? "Search pending approvals..." 
                : subTab === "stripe_bookings" 
                ? "Search Stripe bookings..." 
                : "Search Stripe tips..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-none outline-none text-sm text-slate-800 bg-transparent placeholder:text-slate-400 w-full"
          />
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
        <button
          type="button"
          onClick={() => setSubTab("pending")}
          className={`h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer border ${
            subTab === "pending"
              ? "bg-[#1e1b4b] text-white border-[#1e1b4b] shadow-md"
              : "bg-white hover:bg-slate-50 text-slate-500 border-slate-200"
          }`}
        >
          <Clock className="w-3.5 h-3.5" /> Manual Pending ({bookings.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab("stripe_bookings")}
          className={`h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer border ${
            subTab === "stripe_bookings"
              ? "bg-[#1e1b4b] text-white border-[#1e1b4b] shadow-md"
              : "bg-white hover:bg-slate-50 text-slate-500 border-slate-200"
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" /> Stripe Bookings ({stripeBookings.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab("stripe_tips")}
          className={`h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer border ${
            subTab === "stripe_tips"
              ? "bg-[#1e1b4b] text-white border-[#1e1b4b] shadow-md"
              : "bg-white hover:bg-slate-50 text-slate-500 border-slate-200"
          }`}
        >
          <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> Stripe Tips ({stripeTips.length})
        </button>
      </div>

      {/* Tab 1: Manual Pending Approvals */}
      {subTab === "pending" && (
        <>
          {booksEmptyState()}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredBookings.map((b) => (
              <Card key={b.id} className="p-0 rounded-3xl overflow-hidden shadow-sm border-slate-200 flex flex-col md:flex-row bg-white">
                {/* Left side: Receipt Thumbnail */}
                <div 
                  className="w-full md:w-48 h-48 md:h-auto bg-slate-900 relative group cursor-pointer shrink-0"
                  onClick={() => setPreviewReceipt(b.paymentReceiptUrl)}
                >
                  {b.paymentReceiptUrl ? (
                    <img src={b.paymentReceiptUrl} alt="Receipt" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600 italic text-sm">No Image</div>
                  )}
                  <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white font-bold text-sm bg-black/50 px-3 py-1.5 rounded-lg backdrop-blur-sm">View Full Screen</span>
                  </div>
                </div>

                {/* Right side: Details */}
                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-black text-slate-900">{b.clientName || "Unknown Client"}</h3>
                        <p className="text-xs font-mono text-slate-500">#{b.id.substring(0,10).toUpperCase()}</p>
                      </div>
                      <span className={`px-2 py-1 text-[10px] font-black rounded uppercase tracking-widest ${
                        b.paymentMethod === 'CashApp' ? 'bg-emerald-100 text-emerald-700' :
                        b.paymentMethod === 'Venmo' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {b.paymentMethod || "Manual"}
                      </span>
                    </div>
                    
                    <div className="space-y-1 mt-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500 font-medium">Service</span>
                        <span className="font-bold text-slate-800">{b.jobType || "-"}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500 font-medium">Amount Due</span>
                        <span className="font-black text-emerald-600">${b.payRate || b.__budget || b.totalBudget || "0"}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500 font-medium">Submitted At</span>
                        <span className="font-bold text-slate-800">
                          {b.receiptUploadedAt ? formatDate(b.receiptUploadedAt) : "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-4">
                    <Button 
                      onClick={() => setDeclineBookingId(b.id)}
                      disabled={processingId === b.id}
                      variant="outline"
                      className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold rounded-xl h-11 shadow-sm"
                    >
                      Decline
                    </Button>
                    <Button 
                      onClick={() => handleApprove(b)}
                      disabled={processingId === b.id}
                      className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl h-11 shadow-sm"
                    >
                      {processingId === b.id ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                      Approve Payment
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Tab 2: Stripe Bookings */}
      {subTab === "stripe_bookings" && (
        <>
          {filteredStripeBookings.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-12 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                <CreditCard className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="text-xl font-black text-slate-800">No Stripe Bookings</h3>
              <p className="text-slate-500 font-medium max-w-md mx-auto mt-2">
                There are no Stripe booking payments recorded for this company.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-sm">
              {/* Mobile Card Layout */}
              <div className="block md:hidden divide-y divide-slate-100">
                {filteredStripeBookings.map((b) => (
                  <div key={b.id} className="p-4 space-y-2.5 text-xs font-semibold">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] text-slate-400 font-mono block">Booking Ref: #{b.id.substring(0, 8).toUpperCase()}</span>
                        <h4 className="font-extrabold text-slate-800 text-[13px] mt-0.5">{b.clientName || "Unnamed Client"}</h4>
                      </div>
                      <span className="text-[#1e1b4b] font-black text-sm">${(b.payRate || b.__budget || b.totalBudget || 0)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 space-y-1">
                      <div>Job Type: <span className="text-slate-700 font-bold">{b.jobType || "Event Services"}</span></div>
                      <div className="truncate">Stripe ID: <span className="text-indigo-600 font-mono text-[10px]">{b.stripePaymentIntentId || b.stripeCheckoutSessionId || "Card Payment"}</span></div>
                      <div>Paid Date: <span className="text-slate-500">{formatDate(b.paidAt || b.createdAt)}</span></div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table Layout */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs font-medium border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-150 text-slate-500 font-black tracking-wider text-[10px] uppercase">
                    <tr>
                      <th className="px-6 py-4">Paid Date</th>
                      <th className="px-6 py-4">Booking Ref</th>
                      <th className="px-6 py-4">Client</th>
                      <th className="px-6 py-4">Job Type</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Stripe Intent ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredStripeBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-slate-500">{formatDate(b.paidAt || b.createdAt)}</td>
                        <td className="px-6 py-4 font-mono font-bold text-slate-400">#{b.id.substring(0, 8).toUpperCase()}</td>
                        <td className="px-6 py-4">
                          <span className="font-extrabold text-slate-800 block">{b.clientName || "Unnamed Client"}</span>
                          <span className="text-slate-400 text-[10px] block mt-0.5">{b.clientEmail || ""}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-700">{b.jobType || "Event Services"}</td>
                        <td className="px-6 py-4 font-black text-slate-900">${(b.payRate || b.__budget || b.totalBudget || 0)}</td>
                        <td className="px-6 py-4 font-mono text-slate-500 text-[10.5px] truncate max-w-[200px]" title={b.stripePaymentIntentId || b.stripeCheckoutSessionId}>{b.stripePaymentIntentId || b.stripeCheckoutSessionId || "Card Payment"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab 3: Stripe Tips */}
      {subTab === "stripe_tips" && (
        <>
          {filteredStripeTips.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-12 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                <DollarSign className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="text-xl font-black text-slate-800">No Stripe Tips</h3>
              <p className="text-slate-500 font-medium max-w-md mx-auto mt-2">
                No Stripe tip payments recorded for this company.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-sm">
              {/* Mobile Card Layout */}
              <div className="block md:hidden divide-y divide-slate-100">
                {filteredStripeTips.map((b) => (
                  <div key={b.id} className="p-4 space-y-2.5 text-xs font-semibold">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] text-slate-400 font-mono block">Booking Ref: #{b.id.substring(0, 8).toUpperCase()}</span>
                        <h4 className="font-extrabold text-slate-800 text-[13px] mt-0.5">{b.clientName || "Unnamed Client"}</h4>
                      </div>
                      <span className="text-emerald-700 font-black text-sm">${(b.tipAmount || 0)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 space-y-1">
                      <div>Recipient Talent: <span className="text-slate-700 font-bold">{b.talentName || "Talent"}</span></div>
                      <div className="truncate">Stripe ID: <span className="text-indigo-600 font-mono text-[10px]">{b.tipStripePaymentIntentId || "Card"}</span></div>
                      <div>Paid Date: <span className="text-slate-600">{formatDate(b.tipPaidAt || b.paidAt || b.createdAt)}</span></div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table Layout */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs font-medium border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-150 text-slate-500 font-black tracking-wider text-[10px] uppercase">
                    <tr>
                      <th className="px-6 py-4">Paid Date</th>
                      <th className="px-6 py-4">Booking Ref</th>
                      <th className="px-6 py-4">Client</th>
                      <th className="px-6 py-4">Recipient Talent</th>
                      <th className="px-6 py-4">Tip Amount</th>
                      <th className="px-6 py-4">Stripe Intent ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredStripeTips.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-slate-500">{formatDate(b.tipPaidAt || b.paidAt || b.createdAt)}</td>
                        <td className="px-6 py-4 font-mono font-bold text-slate-400">#{b.id.substring(0, 8).toUpperCase()}</td>
                        <td className="px-6 py-4">
                          <span className="font-extrabold text-slate-800 block">{b.clientName || "Unnamed Client"}</span>
                          <span className="text-slate-400 text-[10px] block mt-0.5">{b.clientEmail || ""}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-700">{b.talentName || "Talent"}</td>
                        <td className="px-6 py-4 font-black text-emerald-600">${(b.tipAmount || 0)}</td>
                        <td className="px-6 py-4 font-mono text-slate-500 text-[10.5px] truncate max-w-[200px]" title={b.tipStripePaymentIntentId}>{b.tipStripePaymentIntentId || "Card Payment"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {previewReceipt && (
        <div 
          className="fixed inset-0 z-[9999] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPreviewReceipt(null)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center">
            <button 
              onClick={() => setPreviewReceipt(null)}
              className="absolute -top-12 right-0 md:-right-12 text-white/50 hover:text-white bg-white/10 p-2 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img 
              src={previewReceipt} 
              alt="Receipt Fullscreen" 
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" 
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {declineBookingId && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={() => setDeclineBookingId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-red-50/50">
              <h3 className="font-black text-red-900 text-lg">Decline Payment</h3>
              <button onClick={() => setDeclineBookingId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Reason for Declining</label>
                <textarea 
                  value={declineReason}
                  onChange={e => setDeclineReason(e.target.value)}
                  className="w-full min-h-[100px] border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 resize-none"
                  placeholder="E.g., Amount does not match, image is blurry..."
                />
              </div>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                The client will be notified immediately and asked to resubmit their payment proof. The current receipt will be discarded.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 rounded-b-2xl">
              <Button variant="ghost" onClick={() => setDeclineBookingId(null)} className="font-bold text-slate-600">Cancel</Button>
              <Button onClick={handleDeclineSubmit} disabled={processingId === declineBookingId} className="bg-red-600 hover:bg-red-700 text-white font-bold shadow-sm">
                {processingId === declineBookingId ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirm Decline
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );

  function booksEmptyState() {
    if (filteredBookings.length > 0) return null;
    return (
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-12 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
          <CheckCircle2 className="w-10 h-10 text-slate-300" />
        </div>
        <h3 className="text-xl font-black text-slate-800">All Caught Up!</h3>
        <p className="text-slate-500 font-medium max-w-md mx-auto mt-2">
          There are no pending manual payments requiring your approval at this time.
        </p>
      </div>
    );
  }
}
