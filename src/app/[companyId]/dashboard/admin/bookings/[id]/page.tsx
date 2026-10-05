"use client";

import { useState, useEffect, use } from "react";
import { getCompanyBookings, getCompanyTalents } from "@/lib/db-utils";
import { db } from "@/lib/firebase";
import { doc, updateDoc, getDoc, deleteDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { ChevronRight, User, Phone, Mail, FileText, CheckCircle2, Circle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { EntityNotes } from "@/components/notes/EntityNotes";
import { EditBookingModal } from "@/components/bookings/AdminBookingModals";

export default function BookingDetailsPage(props: { params: Promise<{ companyId: string, id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [booking, setBooking] = useState<any>(null);
  const [talents, setTalents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const docRef = doc(db, "bookings", params.id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setBooking({ id: docSnap.id, ...docSnap.data() });
        }
        
        const tData = await getCompanyTalents(params.companyId);
        setTalents(tData || []);
      } catch (err) {
        console.error("Failed to load booking details", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [params.companyId, params.id]);

  const updateBookingStatus = async (status: string, talentId?: string, talentName?: string) => {
    try {
      const payload: any = { status };
      if (talentId) {
        payload.talentId = talentId;
        payload.talentName = talentName;
      }
      await updateDoc(doc(db, "bookings", params.id), payload);
      setBooking({ ...booking, ...payload });
      showSuccess(`Booking updated to ${status}`);
    } catch (err) {
      console.error(err);
      showError("Failed to update booking status.");
    }
  };

  const handleDeleteBooking = async () => {
    const confirmed = await confirmAction(
      `Are you sure you want to permanently delete booking #${params.id.slice(0, 8)}? This action cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, "bookings", params.id));
      showSuccess("Booking deleted successfully.");
      router.push(`/${params.companyId}/dashboard/admin/bookings/all`);
    } catch (err: any) {
      console.error("Failed to delete booking:", err);
      showError(err.message || "Failed to delete booking.");
    } finally {
      setDeleting(false);
    }
  };

  const assignTalent = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const selectedTalent = talents.find(t => t.id === selectedId);
    if(selectedTalent) {
      updateBookingStatus("Assigned", selectedId, selectedTalent.name);
    }
  };

  if (loading) return <div className="p-10 text-center text-slate-500">Loading booking details...</div>;
  if (!booking) return <div className="p-10 text-center text-red-500">Booking not found.</div>;

  const eventTitle = booking.notes?.split('\n')[0] || "Event Booking";

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-4 pb-20 w-full px-4 sm:px-6 lg:px-8">
      
      {/* Header and Actions */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center text-[13px] text-slate-500 font-medium mb-2">
            <Link href={`/${params.companyId}/dashboard/admin/bookings`} className="hover:text-indigo-600 transition-colors">Bookings</Link>
            <ChevronRight className="w-4 h-4 mx-1 opacity-50" />
            <span className="text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">{eventTitle}</span>
          </div>
          <h1 className="text-[32px] font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-900 to-indigo-600 tracking-tight">{eventTitle}</h1>
        </div>
        <div className="flex items-center gap-3">
          {booking.status !== "Cancelled" && (
            <>
              <Button variant="outline" onClick={() => setShowEditModal(true)} className="text-[13px] font-bold shadow-sm h-10 px-5 rounded-full hover:bg-slate-50 border-slate-200">Edit</Button>
              <Button variant="outline" className="text-[13px] font-bold shadow-sm h-10 px-5 rounded-full text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => updateBookingStatus("Cancelled")}>Cancel Booking</Button>
              <Button className="text-[13px] font-bold shadow-sm h-10 px-5 rounded-full bg-[#16a34a] hover:bg-[#15803d]" onClick={() => updateBookingStatus("Completed")}>Mark as Completed</Button>
            </>
          )}
          {booking.status === "Cancelled" && (
            <span className="px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">
              Cancelled
            </span>
          )}
          <Button
            variant="outline"
            disabled={deleting}
            onClick={handleDeleteBooking}
            className="text-[13px] font-bold shadow-sm h-10 px-4 rounded-full text-red-700 bg-red-50 border-red-200 hover:bg-red-100 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
            Delete Booking
          </Button>
        </div>
      </div>

      {/* Date and Location Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-6 text-[14px]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800">Event Date:</span>
          <span className="text-slate-600">{booking.eventDate} | {booking.eventTime}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800">Location:</span>
          <span className="text-slate-600">{booking.location || booking.address || [booking.city, booking.state].filter(Boolean).join(", ") || "Not specified"}</span>
        </div>
      </div>

      {/* Progress Bar (Visual representation) */}
      <div className="bg-[#5046E5] w-full rounded-[24px] sm:rounded-full flex flex-col sm:flex-row sm:items-center justify-between text-white text-[12px] font-bold overflow-hidden shadow-md">
         <div className="flex-1 text-center py-3 sm:py-2.5 bg-[#4f46e5]/40 border-b sm:border-b-0 sm:border-r border-indigo-400/30">Inquiry &gt;</div>
         <div className={`flex-1 text-center py-3 sm:py-2.5 border-b sm:border-b-0 sm:border-r border-indigo-400/30 ${['Assigned', 'Confirmed', 'Completed'].includes(booking.status) ? 'bg-[#4f46e5]/60' : ''}`}>Talent Assigned &gt;</div>
         <div className={`flex-1 text-center py-3 sm:py-2.5 border-b sm:border-b-0 sm:border-r border-indigo-400/30 ${['Confirmed', 'Completed'].includes(booking.status) ? 'bg-[#4f46e5]/80' : ''}`}>Deposit Paid &gt;</div>
         <div className={`flex-1 text-center py-3 sm:py-2.5 border-b sm:border-b-0 sm:border-r border-indigo-400/30 ${['Confirmed', 'Completed'].includes(booking.status) ? 'bg-[#4338ca]' : ''}`}>Confirmed &gt;</div>
         <div className={`flex-1 text-center py-3 sm:py-2.5 ${booking.status === 'Completed' ? 'bg-[#16a34a]' : ''}`}>Completed</div>
      </div>

      {/* Main Content Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-6 lg:gap-8">
        
        {/* Left Column */}
        <div className="space-y-6 lg:space-y-8">
          
          {/* Assigned Talent Card */}
          <div className="bg-white border border-slate-200/60 rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100/80 bg-slate-50/50">
              <h3 className="font-bold text-[#1e1b4b] text-[16px] flex items-center gap-2">
                <span className="w-1.5 h-6 bg-indigo-500 rounded-full inline-block"></span>
                Assigned Talent
              </h3>
            </div>
            <div className="p-6">
              {booking.talentId ? (
                <div className="flex items-center gap-4 bg-gradient-to-r from-indigo-50/50 to-white border border-indigo-100/50 rounded-xl p-4 shadow-sm group">
                   <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0 border border-indigo-200/50 group-hover:scale-105 transition-transform">
                     <User className="text-indigo-600 w-6 h-6" />
                   </div>
                   <div>
                     <div className="font-bold text-[#1e1b4b] text-[15px] group-hover:text-indigo-600 transition-colors">{booking.talentName}</div>
                     <div className="text-[12px] font-medium text-slate-500 mt-0.5 uppercase tracking-wider">Assigned Performer</div>
                   </div>
                </div>
              ) : (
                <div className="space-y-4">
                   <div className="text-[13px] text-slate-500 mb-2 font-medium bg-slate-50 p-3 rounded-lg border border-slate-100">
                     {booking.status === "Cancelled" 
                       ? "Booking was cancelled before any talent was assigned." 
                       : <>No talent assigned yet. Target: <span className="font-bold text-slate-800">{booking.talentName || "Any suitable talent"}</span></>}
                   </div>
                   {booking.status !== "Cancelled" && (
                     <select 
                       className="w-full text-[14px] font-medium border border-slate-200 rounded-xl p-3 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                       onChange={assignTalent}
                       defaultValue=""
                     >
                        <option value="" disabled>Select internal talent to assign...</option>
                        {talents.map(t => <option key={t.id} value={t.id}>{t.name} ({t.service || "Entertainer"})</option>)}
                     </select>
                   )}
                </div>
              )}
              
              {booking.talentId && booking.status !== "Completed" && booking.status !== "Cancelled" && (
                 <div className="mt-5">
                   <Button variant="outline" className="w-full text-[13px] border-dashed font-bold text-indigo-600 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl h-11">
                      + Modify Assignment
                   </Button>
                 </div>
              )}
            </div>
          </div>

          {/* Payment Status Card */}
          <div className="bg-white border border-slate-200/60 rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100/80 bg-slate-50/50">
              <h3 className="font-bold text-[#1e1b4b] text-[16px] flex items-center gap-2">
                <span className="w-1.5 h-6 bg-emerald-500 rounded-full inline-block"></span>
                Payment Status
              </h3>
            </div>
            <div className="p-6 space-y-5">
               <div className="flex items-center justify-between bg-emerald-50/50 p-4 rounded-xl border border-emerald-100/50">
                 <div className="flex items-center gap-3">
                   <div className="bg-white p-1.5 rounded-lg shadow-sm border border-emerald-100">
                     <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                   </div>
                   <span className="text-[14px] text-slate-700 font-medium"><strong>Deposit Paid:</strong> <span className="text-emerald-700 bg-emerald-100/50 px-2 py-0.5 rounded-md">$300</span></span>
                 </div>
                 <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-emerald-200/50">Confirmed</span>
               </div>
               <div className="border-b border-slate-100"></div>
               <div className="flex items-center justify-between bg-orange-50/50 p-4 rounded-xl border border-orange-100/50">
                 <div className="flex items-center gap-3">
                   <div className="bg-white p-1.5 rounded-lg shadow-sm border border-orange-100">
                     <Circle className="w-5 h-5 text-orange-400" />
                   </div>
                   <span className="text-[14px] text-slate-700 font-medium"><strong>Balance Due:</strong> <span className="text-orange-700 bg-orange-100/50 px-2 py-0.5 rounded-md">$500</span></span>
                 </div>
                 <Button variant="outline" size="sm" className="h-8 text-[12px] font-bold rounded-full bg-white border-slate-200 hover:bg-slate-50 shadow-sm transition-all hover:shadow text-slate-700">Send Invoice</Button>
               </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6 lg:space-y-8">
          
          {/* Client Details Card */}
          <div className="bg-white border border-slate-200/60 rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100/80 bg-slate-50/50">
              <h3 className="font-bold text-[#1e1b4b] text-[16px] flex items-center gap-2">
                <span className="w-1.5 h-6 bg-slate-800 rounded-full inline-block"></span>
                Client Details
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0 border border-indigo-200/50">
                  <User className="w-6 h-6 text-[#5046E5]" />
                </div>
                <div>
                  <div className="font-bold text-[#1e1b4b] text-[16px]">{booking.clientName}</div>
                  <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mt-0.5">Primary Contact</div>
                </div>
              </div>
              
              <div className="grid gap-4 pt-2">
                <div className="flex items-center gap-3 text-[14px] text-slate-600 font-medium bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                  <div className="bg-slate-50 p-2 rounded-lg"><Phone className="w-4 h-4 text-slate-500" /></div>
                  <span className="text-slate-700">{booking.clientPhone || "Phone not provided"}</span>
                </div>
                <div className="flex items-center gap-3 text-[14px] text-slate-600 font-medium bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                  <div className="bg-slate-50 p-2 rounded-lg"><Mail className="w-4 h-4 text-slate-500" /></div>
                  <span className="text-slate-700">{booking.clientEmail}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Booking Specifics Card */}
          <div className="bg-white border border-slate-200/60 rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100/80 bg-slate-50/50">
              <h3 className="font-bold text-[#1e1b4b] text-[16px] flex items-center gap-2">
                <span className="w-1.5 h-6 bg-blue-500 rounded-full inline-block"></span>
                Booking Details
              </h3>
            </div>
            <div className="p-6 space-y-4">
               <div className="grid grid-cols-3 text-[14px] py-2 border-b border-slate-100 last:border-0 items-center gap-4">
                 <div className="text-slate-500 font-medium">Client Budget</div>
                 <div className="col-span-2 font-bold text-[#1e1b4b] bg-slate-50 px-3 py-1.5 rounded-lg inline-block w-fit">$800</div>
               </div>
               <div className="grid grid-cols-3 text-[14px] py-2 border-b border-slate-100 last:border-0 items-center gap-4">
                 <div className="text-slate-500 font-medium">Talent Required</div>
                 <div className="col-span-2 font-bold text-[#1e1b4b] bg-slate-50 px-3 py-1.5 rounded-lg inline-block w-fit">1 Performer</div>
               </div>
               <div className="grid grid-cols-3 text-[14px] py-2 items-start gap-4 mt-2">
                 <div className="text-slate-500 font-medium pt-1">Special Notes</div>
                 <div className="col-span-2 font-medium text-slate-700 italic border-l-2 border-indigo-200 pl-3 bg-indigo-50/30 py-2 rounded-r-lg">
                   "{booking.notes || "No special notes provided."}"
                 </div>
               </div>
            </div>
          </div>

        </div>
      </div>

      {/* Internal Staff Notes */}
      <div className="mt-8">
        <EntityNotes 
          companyId={params.companyId}
          entityId={params.id}
          entityType="booking"
          title="Admin & Staff Internal Notes"
          placeholder="Add an internal note about this booking..."
        />
      </div>

      {showEditModal && (
        <EditBookingModal
          booking={booking}
          onClose={() => setShowEditModal(false)}
          onSaveSuccess={(updated) => setBooking(updated)}
        />
      )}
    </div>
  );
}
