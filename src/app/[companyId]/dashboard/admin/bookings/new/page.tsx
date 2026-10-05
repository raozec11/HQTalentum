"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, setDoc } from "firebase/firestore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, User, Phone, Mail, CalendarDays, Clock, MapPin, Briefcase, Users, DollarSign, FileText } from "lucide-react";
import { LocationSearchInput } from "@/components/bookings/LocationSearchInput";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { sendNotificationToAdmins, sendNotificationToTalents } from "@/lib/notifications";

function Section({ title }: { title: string }) {
  return (
    <div className="px-8 py-3 bg-gradient-to-r from-indigo-50 to-slate-50 border-t border-b border-slate-100">
      <p className="text-[11px] font-black text-indigo-500 uppercase tracking-widest">{title}</p>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon?: any; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-slate-500 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls = "h-11 rounded-xl border-slate-200 bg-white focus:bg-white focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-400 transition-all text-sm font-medium text-slate-800 placeholder:text-slate-400 shadow-none";
const selectCls = "h-11 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-400 transition-all text-sm font-medium text-slate-800 px-3 appearance-none w-full cursor-pointer";

export default function BookingFormPage() {
  const { user } = useAuth();
  const companyId = user?.companyId as string;
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [talentTypes, setTalentTypes] = useState<{ id: string; name: string }[]>([]);
  const [genders, setGenders] = useState<{ id: string; name: string }[]>([]);

  const [form, setForm] = useState({
    clientName: "", clientNumber: "", clientEmail: "",
    eventDate: "", eventTime: "", duration: "", address: "",
    state: "", city: "", __location: "",
    jobType: "", gender: "", numEntertainers: "1",
    femaleGuests: "0", maleGuests: "0",
    options: "", payRate: "", specialRequests: "",
    status: "Pending"
  });

  const formatPhoneNumber = (value: string) => {
    if (!value) return value;
    const phoneNumber = value.replace(/[^\d]/g, "");
    const phoneNumberLength = phoneNumber.length;
    if (phoneNumberLength < 4) return phoneNumber;
    if (phoneNumberLength < 7) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    }
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
  };

  const set = (field: string, value: string) => {
    if (field === "clientNumber") {
      const formatted = formatPhoneNumber(value);
      if (formatted.replace(/[^\d]/g, "").length > 10) return;
      setForm(prev => ({ ...prev, [field]: formatted }));
    } else {
      setForm(prev => ({ ...prev, [field]: value }));
    }
  };

  useEffect(() => {
    async function load() {
      try {
        // Simple fetch without orderBy to avoid composite index requirement
        const [typesSnap, gendersSnap] = await Promise.all([
          getDocs(query(
            collection(db, "companies", companyId, "talentTypes"),
            where("status", "==", "active")
          )),
          getDocs(query(
            collection(db, "companies", companyId, "genders"),
            where("status", "==", "active")
          ))
        ]);

        const types = typesSnap.docs
          .map(d => ({ id: d.id, name: d.data().name as string }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const gens = gendersSnap.docs
          .map(d => ({ id: d.id, name: d.data().name as string }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setTalentTypes(types);
        setGenders(gens);
      } catch (err) {
        console.error("Error loading dropdowns:", err);
      } finally {
        setFetching(false);
      }
    }
    if (companyId) load();
  }, [companyId]);

  const generateNumericId = () => {
    return Math.floor(1000000000 + Math.random() * 9000000000).toString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const bookingId = generateNumericId();
      const { __location, ...submitData } = form;

      await setDoc(doc(db, "bookings", bookingId), {
        ...submitData,
        id: bookingId,
        companyId: companyId.toLowerCase(),
        applicants: [],
        selectedTalentId: null,
        createdAt: new Date().toISOString()
      });

      // 1. Notify Admins about the new booking
      await sendNotificationToAdmins(companyId, {
        title: "New Booking Created!",
        message: `Booking #${bookingId.substring(0, 8)} for ${submitData.clientName || "a client"} has been created. Event on ${submitData.eventDate || "TBD"} in ${submitData.city || submitData.address || "TBD"}.`,
        type: "booking",
        link: `/${companyId}/dashboard/admin/bookings/all`
      });

      // 2. Broadcast to matching talents that a new gig is available
      await sendNotificationToTalents(companyId, {
        title: "New Gig Available!",
        message: `A new gig (#${bookingId.substring(0, 8)}) was just posted! Check your available jobs.`,
        type: "booking",
        link: `/${companyId}/dashboard/talent/bookings?tab=available`
      }, {
        ...submitData,
        id: bookingId,
      });

      showSuccess(`Booking created successfully! ID: ${bookingId}`);
      router.push(`/${companyId}/dashboard/admin/bookings/all`);
    } catch (err) {
      console.error("Error creating booking:", err);
      showError("Failed to create booking.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Booking</h1>
          <p className="text-sm text-slate-400 mt-0.5">Fill in the event details to register a new client booking.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[12px] font-semibold text-slate-500 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Draft · Pending
        </div>
      </div>

      {fetching ? (
        <div className="flex items-center justify-center h-52 bg-white border border-slate-200 rounded-2xl">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            <p className="text-sm text-slate-400">Loading form...</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

            {/* CLIENT */}
            <Section title="Client Information" />
            <div className="px-8 py-7 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5">
              <div className="sm:col-span-1">
                <Field label="Full Name" icon={User}>
                  <Input required value={form.clientName} onChange={e => set("clientName", e.target.value)} placeholder="John Smith" className={inputCls} />
                </Field>
              </div>
              <div>
                <Field label="Phone Number" icon={Phone}>
                  <Input required value={form.clientNumber} onChange={e => set("clientNumber", e.target.value)} placeholder="+1 234 567 890" className={inputCls} />
                </Field>
              </div>
              <div>
                <Field label="Email Address" icon={Mail}>
                  <Input required type="email" value={form.clientEmail} onChange={e => set("clientEmail", e.target.value)} placeholder="client@email.com" className={inputCls} />
                </Field>
              </div>
            </div>

            {/* EVENT */}
            <Section title="Event Details" />
            <div className="px-8 py-7 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5">
              <div>
                <Field label="Event Date" icon={CalendarDays}>
                  <Input required type="date" value={form.eventDate} onChange={e => set("eventDate", e.target.value)} className={inputCls} />
                </Field>
              </div>
              <div>
                <Field label="Event Time" icon={Clock}>
                  <Input required type="time" value={form.eventTime} onChange={e => set("eventTime", e.target.value)} className={inputCls} />
                </Field>
              </div>
              <div>
                <Field label="Duration" icon={Clock}>
                  <Input value={form.duration} onChange={e => set("duration", e.target.value)} placeholder="e.g. 4 Hours" className={inputCls} />
                </Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="Address" icon={MapPin}>
                  <Input required value={form.address} onChange={e => set("address", e.target.value)} placeholder="Full event address" className={inputCls} />
                </Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="City / State" icon={MapPin}>
                  <LocationSearchInput
                    value={form.__location}
                    onChange={(city, state, full) => {
                      setForm(prev => ({ ...prev, city, state, __location: full }));
                    }}
                    placeholder="Search city (e.g. Miami, FL)"
                  />
                </Field>
              </div>
            </div>

            {/* REQUIREMENTS */}
            <Section title="Requirements" />
            <div className="px-8 py-7 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5">
              <div>
                <Field label="Job Type / Service" icon={Briefcase}>
                  <div className="relative">
                    <select
                      required
                      value={form.jobType}
                      onChange={e => set("jobType", e.target.value)}
                      className={selectCls}
                    >
                      <option value="">
                        {talentTypes.length === 0 ? "No types available" : "Select type..."}
                      </option>
                      {talentTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                    <svg className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </Field>
              </div>
              <div>
                <Field label="Preferred Gender" icon={Users}>
                  <div className="relative">
                    <select
                      required
                      value={form.gender}
                      onChange={e => set("gender", e.target.value)}
                      className={selectCls}
                    >
                      <option value="">
                        {genders.length === 0 ? "No genders available" : "Select gender..."}
                      </option>
                      {genders.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                    </select>
                    <svg className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </Field>
              </div>
              <div>
                <Field label="# Entertainers" icon={Users}>
                  <Input type="number" min="1" value={form.numEntertainers} onChange={e => set("numEntertainers", e.target.value)} className={inputCls} />
                </Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="Additional Options">
                  <Input value={form.options} onChange={e => set("options", e.target.value)} placeholder="e.g. Stage, Lighting, Sound System" className={inputCls} />
                </Field>
              </div>
            </div>

            {/* GUESTS & PRICING */}
            <Section title="Guests & Pricing" />
            <div className="px-8 py-7 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5">
              <div>
                <Field label="# Female Guests">
                  <Input type="number" min="0" value={form.femaleGuests} onChange={e => set("femaleGuests", e.target.value)} className={inputCls} />
                </Field>
              </div>
              <div>
                <Field label="# Male Guests">
                  <Input type="number" min="0" value={form.maleGuests} onChange={e => set("maleGuests", e.target.value)} className={inputCls} />
                </Field>
              </div>
              <div>
                <Field label="Pay Rate ($)" icon={DollarSign}>
                  <Input required value={form.payRate} onChange={e => set("payRate", e.target.value)} placeholder="e.g. 200" className={inputCls} />
                </Field>
              </div>
            </div>

            {/* SPECIAL REQUESTS */}
            <Section title="Special Requests" />
            <div className="px-8 py-7">
              <Field label="Notes / Special Instructions" icon={FileText}>
                <textarea
                  value={form.specialRequests}
                  onChange={e => set("specialRequests", e.target.value)}
                  placeholder="Any special client requests or notes..."
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-400 transition-all text-sm font-medium text-slate-800 placeholder:text-slate-400 px-4 py-3 resize-none"
                />
              </Field>
            </div>

            {/* FOOTER */}
            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <p className="text-xs text-slate-400 hidden sm:block">All fields marked as required must be filled before submitting.</p>
              <div className="flex items-center gap-3 ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="h-10 px-6 rounded-xl font-semibold text-slate-600 border-slate-200 hover:bg-slate-100"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-10 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-500/20 flex items-center gap-2 transition-all"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Create Booking"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
