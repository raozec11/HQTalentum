"use client";

import { useState, useEffect, use } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import {
  Calendar, Loader2, Search, XCircle, User, MapPin, Clock, Briefcase, DollarSign,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BookingDetailsModal,
  ActivityHistoryModal,
} from "@/components/bookings/AdminBookingModals";
import { BookingChatModal } from "@/components/bookings/BookingChatModal";

export default function AdminCancelledBookingsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = use(props.params);
  const { user } = useAuth();
  const companyId = params.companyId;

  const [bookings, setBookings] = useState<any[]>([]);
  const [talentsDict, setTalentsDict] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [chatBooking, setChatBooking] = useState<any>(null);
  const itemsPerPage = 10;

  useEffect(() => {
    if (!user) return;
    loadCancelled();
  }, [user]);

  const loadCancelled = async () => {
    setLoading(true);
    try {
      const ids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));
      const snaps = await Promise.all(
        ids.map(id =>
          getDocs(query(collection(db, "bookings"), where("companyId", "==", id), where("status", "==", "Cancelled")))
        )
      );
      const map = new Map<string, any>();
      snaps.forEach(snap => snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() })));
      const data = Array.from(map.values());
      data.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setBookings(data);

      const uids = new Set<string>();
      data.forEach(b => {
        if (b.talentId) uids.add(b.talentId);
        if (b.selectedTalentId) uids.add(b.selectedTalentId);
        if (b.applicants) b.applicants.forEach((id: string) => uids.add(id));
        if (b.selectedTalentIds) b.selectedTalentIds.forEach((id: string) => uids.add(id));
      });

      if (uids.size > 0) {
        const dict: Record<string, any> = {};
        await Promise.all(
          Array.from(uids).map(async (uid) => {
            const [uSnap, tSnap] = await Promise.all([
              getDoc(doc(db, "users", uid)),
              getDoc(doc(db, "talents", uid))
            ]);
            if (uSnap.exists() || tSnap.exists()) {
              const uD = uSnap.exists() ? uSnap.data() : {};
              const tD = tSnap.exists() ? tSnap.data() : {};
              dict[uid] = {
                id: uid,
                ...uD,
                ...tD,
                displayName: tD.displayName || tD.name || uD.name || uD.displayName || uD.email || "Talent",
                profileImage: tD.profileImage || tD.photoUrl || uD.profileImage || uD.photoUrl || null,
                talentType: tD.talentType || "Performer"
              };
            }
          })
        );
        setTalentsDict(dict);
      }
    } catch (err) {
      console.error("Failed to load cancelled bookings:", err);
    } finally {
      setLoading(false);
    }
  };

  const getVal = (b: any, keys: string[]) => {
    for (const k of keys) if (b[k]) return b[k];
    return "—";
  };

  const filtered = bookings.filter(b => {
    const text = JSON.stringify(b).toLowerCase();
    return text.includes(searchQuery.toLowerCase());
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
            </div>
          </div>
          <p className="text-slate-500 font-medium">Loading cancelled bookings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-4 pb-16 w-full px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200/60 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-rose-500 rounded-xl shadow-lg shadow-rose-200">
              <XCircle className="w-5 h-5 text-white" />
            </div>
            <p className="text-xs font-black text-rose-500 uppercase tracking-widest leading-none mt-1">Admin Dashboard</p>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">Cancelled Bookings</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium">
            {bookings.length} booking{bookings.length !== 1 ? "s" : ""} cancelled in total
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search cancelled bookings…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-400 transition-all"
          />
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <Card className="p-16 text-center border-dashed border-2 border-slate-200 bg-slate-50/50 rounded-2xl shadow-none">
          <div className="w-20 h-20 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner">
            <XCircle className="w-10 h-10 text-rose-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-700 mb-2">No Cancelled Bookings</h3>
          <p className="text-slate-400 text-sm max-w-xs mx-auto">
            {searchQuery ? "No results match your search." : "There are no cancelled bookings yet."}
          </p>
        </Card>
      )}

      {/* Table */}
      {paginated.length > 0 && (
        <Card className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-rose-50 to-pink-50 border-b border-rose-100">
                  <th className="px-4 py-3.5 text-left font-bold text-rose-700 text-xs uppercase tracking-wider whitespace-nowrap">Booking ID</th>
                  <th className="px-4 py-3.5 text-left font-bold text-rose-700 text-xs uppercase tracking-wider whitespace-nowrap">Client</th>
                  <th className="px-4 py-3.5 text-left font-bold text-rose-700 text-xs uppercase tracking-wider whitespace-nowrap">Event Date</th>
                  <th className="px-4 py-3.5 text-left font-bold text-rose-700 text-xs uppercase tracking-wider whitespace-nowrap">Venue</th>
                  <th className="px-4 py-3.5 text-left font-bold text-rose-700 text-xs uppercase tracking-wider whitespace-nowrap">Service</th>
                  <th className="px-4 py-3.5 text-left font-bold text-rose-700 text-xs uppercase tracking-wider whitespace-nowrap">Budget</th>
                  <th className="px-4 py-3.5 text-left font-bold text-rose-700 text-xs uppercase tracking-wider whitespace-nowrap">Booked On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((b, i) => (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedBooking(b)}
                    className="hover:bg-rose-50/40 transition-colors group cursor-pointer"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                        #{b.id.substring(0, 8).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-rose-500" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-[13px]">
                            {getVal(b, ["clientName", "__clientName"])}
                          </p>
                          <p className="text-xs text-slate-400">
                            {getVal(b, ["clientEmail", "__email", "__clientEmail"])}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-slate-600 text-[13px]">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {getVal(b, ["eventDate"])}
                        {b.eventTime && <span className="text-slate-400 text-xs">· {b.eventTime}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-slate-600 text-[13px]">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[180px]">{getVal(b, ["address", "__address"])}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-slate-600 text-[13px]">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {getVal(b, ["jobType", "__jobType"])}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-slate-600 text-[13px]">
                        <DollarSign className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {b.payRate || b.__budget || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-xs">
                      {b.createdAt ? new Date(b.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View (Zero horizontal scroll needed!) */}
          <div className="block md:hidden divide-y divide-slate-100 bg-white">
            {paginated.map((b) => {
              const clientName = getVal(b, ["clientName", "__clientName"]);
              const clientEmail = getVal(b, ["clientEmail", "__email", "__clientEmail"]);
              const venue = getVal(b, ["address", "__address"]);
              const service = getVal(b, ["jobType", "__jobType"]);
              const budget = b.payRate || b.__budget ? `$${b.payRate || b.__budget}` : "—";
              const bookedOn = b.createdAt ? new Date(b.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

              return (
                <div key={b.id} onClick={() => setSelectedBooking(b)} className="p-4 space-y-3 bg-white hover:bg-rose-50/30 transition-colors cursor-pointer">
                  {/* Top Row: Avatar + Name + Cancelled Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600 font-bold text-sm">
                        {clientName !== "—" ? clientName.charAt(0).toUpperCase() : "C"}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-slate-900 leading-tight truncate">{clientName}</h4>
                        <p className="text-[11px] font-semibold text-slate-400 truncate mt-0.5">{clientEmail !== "—" ? clientEmail : "No email"}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                      Cancelled
                    </span>
                  </div>

                  {/* Middle Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/80 p-3 rounded-2xl border border-slate-100 font-medium">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Booking ID</span>
                      <span className="font-mono text-slate-700 font-bold text-[11px]">#{b.id.slice(0, 10).toUpperCase()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Service</span>
                      <span className="text-slate-800 font-bold truncate block">{service}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Event Date</span>
                      <span className="text-slate-700 font-bold">{getVal(b, ["eventDate"])} {b.eventTime && `• ${b.eventTime}`}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Budget</span>
                      <span className="text-emerald-700 font-black">{budget}</span>
                    </div>
                    {venue !== "—" && (
                      <div className="col-span-2 pt-1 border-t border-slate-200/50">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Venue Location</span>
                        <span className="text-slate-600 font-semibold line-clamp-1 block">{venue}</span>
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-400 font-medium text-right">
                    Booked on: {bookedOn}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
              <p className="text-xs text-slate-500">
                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 px-3 text-xs rounded-lg"
                >
                  Previous
                </Button>
                <span className="text-xs font-bold text-slate-600 px-2">{currentPage} / {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 px-3 text-xs rounded-lg"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {selectedBooking && !showActivityModal && !chatBooking && (
        <BookingDetailsModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          talentsDict={talentsDict}
          setShowAssignModal={() => {}}
          setManageTalentId={() => {}}
          setShowActivityModal={setShowActivityModal}
          fetchAllCompanyTalents={async () => {}}
          onApprovePayment={() => {}}
          onDeclinePayment={() => {}}
          onRateClient={() => {}}
          userId={user?.uid || ""}
          onChat={() => { setChatBooking(selectedBooking); setSelectedBooking(null); }}
          onBookingUpdated={(updated) => {
            setSelectedBooking(updated);
            setBookings(prev => prev.map(b => b.id === updated.id ? updated : b));
          }}
          onBookingDeleted={(deletedId) => {
            setBookings(prev => prev.filter(b => b.id !== deletedId));
            setSelectedBooking(null);
          }}
        />
      )}

      {showActivityModal && selectedBooking && (
        <ActivityHistoryModal
          booking={selectedBooking}
          dictionary={talentsDict}
          onClose={() => setShowActivityModal(false)}
        />
      )}

      {chatBooking && (
        <BookingChatModal
          booking={chatBooking}
          user={user}
          onClose={() => setChatBooking(null)}
        />
      )}
    </div>
  );
}
