"use client";

import { useState, useEffect, use } from "react";
import { getCompanyBookings, getCompanyTalents } from "@/lib/db-utils";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, User } from "lucide-react";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { useAuth } from "@/context/AuthContext";
import { BookingChatButton } from "@/components/bookings/BookingChatButton";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";

export default function AdminBookingsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = use(props.params);
  const { user } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [talents, setTalents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatBooking, setChatBooking] = useState<any | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [bData, tData] = await Promise.all([
          getCompanyBookings(params.companyId),
          getCompanyTalents(params.companyId)
        ]);
        
        // Sort bookings by creation date DESC
        const sorted = (bData || []).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setBookings(sorted);
        setTalents(tData || []);
      } catch (err) {
        console.error("Failed to load data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [params.companyId]);

  const updateBookingStatus = async (bookingId: string, status: string, talentId?: string, talentName?: string) => {
    try {
      const payload: any = { status };
      if (talentId) {
        payload.talentId = talentId;
        payload.talentName = talentName;
      }
      
      await updateDoc(doc(db, "bookings", bookingId), payload);
      
      // Opt. trigger email/SMS here (mock for now)
      if (status === "Assigned") {
        showInfo(`Assigned ${talentName}. SMS & Email queued.`);
      }

      setBookings(bookings.map(b => b.id === bookingId ? { ...b, ...payload } : b));
    } catch (err) {
      console.error(err);
      showError("Failed to update booking status.");
    }
  };

  if (loading) return <div>Loading bookings...</div>;

  return (
    <>
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-4 pb-12 w-full px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] md:text-[36px] font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-900 via-indigo-700 to-indigo-500 tracking-tight leading-tight">Booking Pipeline</h1>
          <p className="text-slate-500 font-medium mt-1">Review all incoming client events and assign talent.</p>
        </div>
        <div className="text-[13px] font-bold text-slate-600 bg-white/80 backdrop-blur-xl px-5 py-2.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white flex items-center gap-2.5 w-fit">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
          </span>
          Total Bookings: <span className="text-indigo-600 font-black">{bookings.length}</span>
        </div>
      </div>

      <div className="bg-white/70 backdrop-blur-xl border border-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-6 border-b border-slate-100/80 bg-slate-50/30">
          <h3 className="font-extrabold text-[#1e1b4b] text-[18px]">All Bookings</h3>
        </div>

        <div className="divide-y divide-slate-100/80 text-[14px]">
          {bookings.length === 0 ? (
             <div className="p-10 text-center text-slate-500">No bookings found for your company.</div>
          ) : (
            bookings.map((booking) => (
              <div key={booking.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-white/50 transition-colors group relative">
                
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity ${
                  booking.status === 'Pending' ? 'bg-orange-500' :
                  booking.status === 'Assigned' ? 'bg-blue-500' :
                  booking.status === 'Confirmed' ? 'bg-emerald-500' :
                  'bg-slate-400'
                }`}></div>

                <div className="flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-[18px] font-black text-[#1e1b4b] group-hover:text-indigo-600 transition-colors">{booking.notes?.split('\n')[0] || "Event Booking"}</h3>
                    <span className={`px-3 py-1 text-[11px] uppercase tracking-wider rounded-md font-black border ${
                      booking.status === 'Pending' ? 'bg-orange-50 text-orange-600 border-orange-200/50 shadow-[0_2px_10px_rgba(249,115,22,0.1)]' :
                      booking.status === 'Assigned' ? 'bg-blue-50 text-blue-600 border-blue-200/50 shadow-[0_2px_10px_rgba(59,130,246,0.1)]' :
                      booking.status === 'Confirmed' ? 'bg-emerald-50 text-emerald-600 border-emerald-200/50 shadow-[0_2px_10px_rgba(16,185,129,0.1)]' :
                      'bg-slate-50 text-slate-500 border-slate-200/50 shadow-sm'
                    }`}>
                      {booking.status}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] font-medium text-slate-500">
                    <div className="flex items-center gap-1.5 bg-slate-100/80 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200/50">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {booking.eventDate} at {booking.eventTime}
                    </div>
                    <div className="flex items-center gap-1.5">
                       <MapPin className="w-3.5 h-3.5 text-slate-400" />
                       {booking.location || booking.address || [booking.city, booking.state].filter(Boolean).join(", ") || "Not specified"}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <div className="text-[13px] bg-white border border-slate-100 shadow-sm px-3 py-1.5 rounded-xl font-medium flex items-center gap-2">
                       <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center">
                         <User className="w-3 h-3 text-slate-500" />
                       </div>
                       Client: <span className="font-bold text-slate-800">{booking.clientName}</span>
                    </div>

                    {booking.talentId && (
                      <div className="text-[13px] bg-indigo-50/50 border border-indigo-100 shadow-sm px-3 py-1.5 rounded-xl font-medium flex items-center gap-2 text-indigo-700">
                         <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div> 
                         Talent: <span className="font-bold">{booking.talentName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 w-full md:w-auto shrink-0 mt-4 md:mt-0">
                  <BookingChatButton 
                    bookingId={booking.id} 
                    userId={user?.uid || ""} 
                    onClick={() => setChatBooking(booking)}
                    className="w-full md:w-[150px] h-12 rounded-xl text-sm"
                  />
                  <a href={`/${params.companyId}/dashboard/admin/bookings/${booking.id}`} className="w-full">
                    <Button variant="outline" className="w-full md:w-[150px] text-indigo-600 border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 font-bold rounded-xl h-12 transition-all shadow-sm hover:shadow-md group-hover:scale-105 duration-300">
                      View Details
                    </Button>
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
    
    {chatBooking && (
      <BookingChatModal 
        booking={chatBooking} 
        user={user} 
        onClose={() => setChatBooking(null)} 
      />
    )}
    </>
  );
}
