"use client";

import { useState, useEffect, useMemo, Suspense, use } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc,
  Timestamp 
} from "firebase/firestore";
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval,
  isWithinInterval,
  parseISO,
  startOfDay,
  endOfDay,
  subDays
} from "date-fns";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Users, 
  DollarSign, 
  Filter, 
  Plus, 
  X, 
  Loader2,
  CalendarDays,
  ShieldOff,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// --- Types ---
interface BookingEvent {
  id: string;
  clientName: string;
  jobType: string;
  eventDate: string;
  eventTime: string;
  location: string;
  status: string;
  payRate?: string;
  id_short: string;
}

// --- Components ---

function BookingDetailModal({ event, onClose }: { event: BookingEvent; onClose: () => void }) {
  if (!event) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
      <div 
        className="w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative h-32 bg-gradient-to-br from-indigo-600 to-violet-700 p-8 flex items-end">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white hover:bg-white/10 rounded-full"
          >
            <X className="w-5 h-5" />
          </Button>
          <div className="text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 mb-1">Event Detail</p>
            <h2 className="text-2xl font-black">{event.jobType}</h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Client</span>
              <div className="flex items-center gap-2 text-[14px] font-bold text-slate-900">
                <Users className="w-4 h-4 text-indigo-500" />
                {event.clientName || "Direct Inquiry"}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Budget</span>
              <div className="flex items-center gap-2 text-[14px] font-bold text-emerald-600">
                <DollarSign className="w-4 h-4" />
                {event.payRate || "Negotiable"}
              </div>
            </div>
          </div>

          <div className="space-y-3">
             <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
                   <Clock className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Time</p>
                   <p className="text-[14px] font-bold text-slate-800">{format(parseISO(event.eventDate), 'EEE, MMM dd, yyyy')} @ {event.eventTime}</p>
                </div>
             </div>

             <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
                   <MapPin className="w-5 h-5 text-rose-500" />
                </div>
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</p>
                   <p className="text-[14px] font-bold text-slate-800">{event.location || "To be confirmed"}</p>
                </div>
             </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
             <div className="flex items-center gap-2">
                <span className={cn(
                  "w-2.5 h-2.5 rounded-full",
                  event.status === "Confirmed" ? "bg-emerald-500" : "bg-amber-500"
                )} />
                <span className="text-[13px] font-bold text-slate-600">{event.status} Booking</span>
             </div>
             <span className="text-[11px] font-mono text-slate-400 opacity-50">#{event.id_short}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarContent({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [bookings, setBookings] = useState<BookingEvent[]>([]);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<BookingEvent | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      setLoading(true);
      try {
        // 1. Fetch Blackout Dates
        const talentSnap = await getDoc(doc(db, "talents", user.uid));
        if (talentSnap.exists()) {
          const rawBlocked = talentSnap.data().blockedDates || [];
          // Support both legacy string array and new object array
          const parsedBlocked = rawBlocked.map((b: any) => typeof b === 'string' ? b : b.date);
          setBlockedDates(parsedBlocked);
        }

        // 2. Fetch Gigs (Satisfying Security Rules via multiple scoped queries)
        const originalId = companyId;
        const ids = Array.from(new Set([originalId, originalId.toLowerCase(), originalId.toUpperCase()]));
        
        const querySet = ids.flatMap(id => [
           query(collection(db, "bookings"), where("companyId", "==", id), where("status", "==", "Pending")),
           query(collection(db, "bookings"), where("companyId", "==", id), where("talentId", "==", user.uid)),
           query(collection(db, "bookings"), where("companyId", "==", id), where("selectedTalentId", "==", user.uid)),
           query(collection(db, "bookings"), where("companyId", "==", id), where("selectedTalentIds", "array-contains", user.uid)),
           query(collection(db, "bookings"), where("companyId", "==", id), where("applicants", "array-contains", user.uid))
        ]);
        
        const snaps = await Promise.all(querySet.map(q => getDocs(q)));
        const gigMap = new Map<string, BookingEvent>();
        
        snaps.forEach(snap => {
          snap.docs.forEach(d => {
            const b = d.data();
            if (!gigMap.has(d.id)) {
               gigMap.set(d.id, {
                 id: d.id,
                 id_short: d.id.slice(0, 8).toUpperCase(),
                 clientName: b.clientName || b.__clientName || "Direct Link",
                 jobType: b.jobType || b.__jobType || "Event Gig",
                 eventDate: b.eventDate || b.date,
                 eventTime: b.eventTime || "TBD",
                 location: b.address || b.__address || "On Site",
                 status: b.status,
                 payRate: b.payRate || b.__budget
               });
            }
          });
        });
        
        setBookings(Array.from(gigMap.values()));
      } catch (err) {
        console.error("Calendar fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user, companyId]);

  // --- Helpers ---
  const daysInMonth = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate));
    const end = endOfWeek(endOfMonth(currentDate));
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const daysInWeek = useMemo(() => {
    const start = startOfWeek(currentDate);
    const end = endOfWeek(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const getEventsForDay = (date: Date) => {
    const ds = format(date, 'yyyy-MM-dd');
    const isBlocked = blockedDates.includes(ds);
    const dayBookings = bookings.filter(b => isSameDay(parseISO(b.eventDate), date));
    return { isBlocked, dayBookings };
  };

  const next = () => setCurrentDate(view === 'month' ? addMonths(currentDate, 1) : addDays(currentDate, 7));
  const prev = () => setCurrentDate(view === 'month' ? subMonths(currentDate, 1) : subDays(currentDate, 7));
  const today = () => setCurrentDate(new Date());

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[500px] text-slate-400 gap-4">
       <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
       <p className="font-bold text-sm tracking-widest uppercase">Syncing your schedule...</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full animate-in fade-in slide-in-from-bottom-6 duration-700 pb-20">
      
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
        <div>
           <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                 <CalendarDays className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Booking Schedule</h1>
           </div>
           <p className="text-slate-500 font-medium">Manage your professional timeline and availability in one place.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
           <div className="bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-1">
              <Button 
                onClick={() => setView('month')}
                variant={view === 'month' ? 'default' : 'ghost'}
                className={cn(
                  "rounded-xl h-10 px-4 font-bold text-sm transition-all",
                  view === 'month' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
                )}
              >
                Monthly
              </Button>
              <Button 
                onClick={() => setView('week')}
                variant={view === 'week' ? 'default' : 'ghost'}
                className={cn(
                  "rounded-xl h-10 px-4 font-bold text-sm transition-all",
                  view === 'week' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
                )}
              >
                Weekly
              </Button>
           </div>

           <div className="flex items-center gap-2 bg-white rounded-2xl border border-slate-100 p-1.5 shadow-sm ml-auto sm:ml-0">
             <Button variant="ghost" size="icon" onClick={prev} className="rounded-xl h-10 w-10 text-slate-600 hover:bg-slate-50 transition-colors"><ChevronLeft className="w-5 h-5" /></Button>
             <span className="px-4 font-black text-slate-900 text-base min-w-[120px] text-center">
                {view === 'month' ? format(currentDate, 'MMMM yyyy') : `Week of ${format(startOfWeek(currentDate), 'MMM dd')}`}
             </span>
             <Button variant="ghost" size="icon" onClick={next} className="rounded-xl h-10 w-10 text-slate-600 hover:bg-slate-50 transition-colors"><ChevronRight className="w-5 h-5" /></Button>
           </div>

           <Button 
             onClick={today}
             variant="outline" 
             className="rounded-2xl h-[52px] px-6 border-2 border-slate-100 bg-white hover:border-indigo-500 hover:text-indigo-600 font-black text-sm transition-all shadow-sm"
           >
              Today
           </Button>
        </div>
      </div>

      {/* --- MONTH VIEW GRID --- */}
      {view === 'month' && (
        <div className="bg-white rounded-[28px] sm:rounded-[40px] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <div className="min-w-[600px] sm:min-w-0">
              {/* Day Labels */}
              <div className="grid grid-cols-7 border-b border-slate-50">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="py-3 sm:py-4 text-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{d}</span>
                  </div>
                ))}
              </div>

              {/* Grid Cells */}
              <div className="grid grid-cols-7">
            {daysInMonth.map((day, i) => {
              const { isBlocked, dayBookings } = getEventsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());

              return (
                <div 
                  key={i} 
                  className={cn(
                    "min-h-[140px] p-4 border-r border-b border-slate-50 last:border-r-0 transition-all group overflow-hidden relative",
                    !isCurrentMonth ? "bg-slate-50/40 opacity-40 select-none pointer-events-none" : "hover:bg-indigo-50/30"
                  )}
                >
                  <div className="flex justify-between items-center mb-4">
                    <span className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center text-[15px] font-black transition-all",
                      isToday ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "text-slate-800"
                    )}>
                      {format(day, 'd')}
                    </span>
                    {isBlocked && (
                      <span className="text-[9px] font-black bg-rose-100 text-rose-600 px-2 py-0.5 rounded-lg uppercase tracking-tighter shadow-sm border border-rose-200/50">Blocked</span>
                    )}
                  </div>

                  <div className="space-y-1.5 overflow-y-auto custom-scrollbar max-h-[80px]">
                    {dayBookings.map(gig => (
                       <button 
                         key={gig.id} 
                         onClick={() => setSelectedEvent(gig)}
                         className={cn(
                           "w-full text-left p-1.5 rounded-lg text-[10px] font-bold truncate transition-all active:scale-95 shadow-sm border",
                           gig.status === "Confirmed" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"
                         )}
                       >
                         {gig.jobType}
                       </button>
                    ))}
                  </div>

                  {/* Desktop Hover Hint */}
                  {isCurrentMonth && !isBlocked && (
                    <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/5 cursor-pointer pointer-events-none" />
                  )}
                </div>
              );
            })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- WEEKLY VIEW LIST --- */}
      {view === 'week' && (
        <div className="space-y-6">
           {daysInWeek.map((day, idx) => {
              const { isBlocked, dayBookings } = getEventsForDay(day);
              const isToday = isSameDay(day, new Date());
              
              return (
                <div key={idx} className={cn(
                   "bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col md:flex-row",
                   isToday ? "ring-2 ring-indigo-500 shadow-xl shadow-indigo-50" : ""
                )}>
                   <div className={cn(
                     "w-full md:w-48 p-6 flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center border-b md:border-b-0 md:border-r border-slate-50 shrink-0",
                     isToday ? "bg-indigo-600 text-white" : "bg-slate-50"
                   )}>
                      <div className="flex items-baseline md:flex-col gap-2">
                        <span className="text-3xl font-black">{format(day, 'dd')}</span>
                        <span className={cn(
                          "text-[12px] font-black uppercase tracking-widest opacity-60",
                          isToday ? "text-white" : "text-slate-400"
                        )}>{format(day, 'EEEE')}</span>
                      </div>
                      {isBlocked && (
                         <div className="flex items-center gap-1 text-[10px] font-black bg-rose-500/10 text-rose-500 px-3 py-1 rounded-full uppercase tracking-tighter mt-4 border border-rose-500/20">
                            <ShieldOff className="w-3 h-3" /> Unavailable
                         </div>
                      )}
                      {isToday && (
                         <span className="hidden md:block text-[10px] font-black bg-white/20 text-white px-3 py-1 rounded-full uppercase tracking-wider mt-4">Current Day</span>
                      )}
                   </div>

                   <div className="flex-1 p-4 md:p-6 min-h-[100px] flex items-center justify-center">
                      <div className="w-full flex flex-col gap-3">
                         {dayBookings.length > 0 ? (
                           dayBookings.map(gig => (
                             <div 
                               key={gig.id} 
                               className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-indigo-200 transition-all group"
                             >
                                <div className="flex items-center gap-4">
                                   <div className={cn(
                                     "w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:rotate-6",
                                      gig.status === "Confirmed" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                                   )}>
                                      {gig.status === "Confirmed" ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                                   </div>
                                   <div>
                                      <h4 className="font-black text-slate-900 leading-tight">{gig.jobType}</h4>
                                      <p className="text-xs font-bold text-slate-400 mt-0.5">{gig.eventTime} · {gig.clientName}</p>
                                   </div>
                                </div>
                                <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t sm:border-none border-slate-50">
                                   <span className={cn(
                                     "text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-widest",
                                     gig.status === "Confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                   )}>{gig.status}</span>
                                   <Button 
                                     onClick={() => setSelectedEvent(gig)}
                                     variant="ghost" 
                                     size="sm" 
                                     className="h-9 px-4 rounded-xl font-bold text-indigo-600 hover:bg-indigo-50"
                                   >
                                      Details
                                   </Button>
                                </div>
                             </div>
                           ))
                         ) : isBlocked ? (
                           <div className="text-center py-6">
                              <p className="text-[13px] font-bold text-slate-400 italic">No professional bookings accepted for this day.</p>
                           </div>
                         ) : (
                           <div className="text-center py-6 flex flex-col items-center gap-2">
                              <p className="text-[14px] font-bold text-slate-400">Pure Potential.</p>
                              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest opacity-60">You are fully available</p>
                           </div>
                         )}
                      </div>
                   </div>
                </div>
              );
           })}
        </div>
      )}

      {/* Booking Detail Modal */}
      {selectedEvent && (
        <BookingDetailModal 
          event={selectedEvent} 
          onClose={() => setSelectedEvent(null)} 
        />
      )}

      {/* Legend / Key */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-8 py-8 border-t border-slate-100">
         <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-200" />
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Confirmed Gig</span>
         </div>
         <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 shadow-lg shadow-amber-200" />
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Pending Selection</span>
         </div>
         <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 shadow-lg shadow-rose-200" />
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Blackout Period</span>
         </div>
      </div>
    </div>
  );
}

export default function TalentCalendarPage(props: { params: Promise<{ companyId: string }> }) {
  const params = use(props.params);
  return (
    <Suspense fallback={
       <div className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500 mb-4" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Loading Calendar Framework...</p>
       </div>
    }>
      <CalendarContent companyId={params.companyId} />
    </Suspense>
  );
}
