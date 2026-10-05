"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, where, addDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { LocationSearchInput } from "@/components/bookings/LocationSearchInput";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { sendNotificationToAdmins, sendNotificationToTalents } from "@/lib/notifications";

type FieldType = "short_text"|"long_text"|"email"|"number"|"dropdown"|"single_choice"|"multi_choice"|"paragraph"|"divider"|"pay_rate"|"location_search"|"date"|"time";

interface FormElement {
  id: string; type: FieldType;
  label?: string; placeholder?: string; required?: boolean;
  options?: string[]; content?: string;
  width?: "half" | "full";
  locked?: boolean;
}

const inputCls = "w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-400 transition-all placeholder:text-slate-400";

interface BookingFormProps {
  companyId: string;
  mode: "default" | "custom";
}

export default function BookingForm({ companyId, mode }: BookingFormProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [elements, setElements] = useState<FormElement[]>([]);
  const [dropdowns, setDropdowns] = useState<{ talentTypes: {id:string;name:string}[]; genders: {id:string;name:string}[] }>({ talentTypes: [], genders: [] });
  const [formValues, setFormValues] = useState<Record<string, string | string[]>>({});

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

  const val = (id: string) => formValues[id] as string || "";
  const set = (id: string, v: string | string[]) => {
    // Only format as phone if it's explicitly a client number or has 'phone' in the ID
    if (typeof v === "string" && (id === "clientNumber" || id === "__clientNumber" || id.toLowerCase().includes("phone"))) {
      const formatted = formatPhoneNumber(v);
      if (formatted.replace(/[^\d]/g, "").length > 10) return;
      setFormValues(prev => ({ ...prev, [id]: formatted }));
    } else {
      setFormValues(prev => ({ ...prev, [id]: v }));
    }
  };

  useEffect(() => {
    async function load() {
      try {
        if (mode === "custom") {
          const snap = await getDoc(doc(db, "companies", companyId, "settings", "bookingForm"));
          if (snap.exists()) {
            setElements(snap.data().customElements || []);
          }
        }

        // Load dropdowns for both modes
        const [t, g] = await Promise.all([
          getDocs(query(collection(db, "companies", companyId, "talentTypes"), where("status", "==", "active"))),
          getDocs(query(collection(db, "companies", companyId, "genders"), where("status", "==", "active"))),
        ]);
        setDropdowns({
          talentTypes: t.docs.map(d => ({ id: d.id, name: d.data().name })).sort((a,b) => a.name.localeCompare(b.name)),
          genders: g.docs.map(d => ({ id: d.id, name: d.data().name })).sort((a,b) => a.name.localeCompare(b.name)),
        });
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    if (companyId) load();
  }, [companyId, mode]);

  const generateNumericId = () => {
    return Math.floor(1000000000 + Math.random() * 9000000000).toString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let finalValues: any = {};
      if (mode === "custom") {
        elements.forEach(el => {
          if (el.type !== "divider" && el.type !== "paragraph") {
            const v = formValues[el.id];
            if (v !== undefined && v !== "") {
              let keyToSave = el.id;
              // Map internal locked IDs to standard database keys
              if (el.id === "__email") keyToSave = "clientEmail";
              else if (el.id === "__address") keyToSave = "address";
              else if (el.id === "__state") keyToSave = "state";
              else if (el.id === "__city") keyToSave = "city";
              else if (el.id === "__eventDate") keyToSave = "eventDate";
              else if (el.id === "__eventTime") keyToSave = "eventTime";
              else if (el.id === "__jobType") keyToSave = "jobType";
              else if (el.id === "__gender") keyToSave = "gender";
              else if (!el.locked && el.label) {
                // Generate an auto slug from the label if it's a custom non-locked field
                keyToSave = el.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '') || el.id;
              }
              finalValues[keyToSave] = v;
            }
          }
        });
        // Extract city/state — prefer values directly set by LocationSearchInput's onChange callback
        // Only fall back to comma-splitting the full location string if needed
        const locElement = elements.find(el => el.type === "location_search");
        const customLocVal = locElement ? (formValues[locElement.id] as string) : "";
        if (customLocVal) {
          const parts = customLocVal.split(",").map((p: string) => p.trim());
          if (!finalValues.city) finalValues.city = formValues.city as string || parts[0] || "";
          if (!finalValues.state) finalValues.state = formValues.state as string || parts[1] || "";
        }
      } else {
        // Default mode — spread all form values, clean up __location key
        finalValues = { ...formValues };
        if (finalValues.__location) {
          delete finalValues.__location;
        }
      }

      // ── ALWAYS ensure city + state are written and normalized ──
      const locElementId = mode === "custom"
        ? elements.find(el => el.type === "location_search")?.id
        : "__location";
      const rawLoc = (locElementId ? formValues[locElementId] : "") as string;

      let parsedCity = "";
      let parsedState = "";
      if (rawLoc) {
        const parts = rawLoc.split(",").map((p: string) => p.trim());
        parsedCity = parts[0] || "";
        parsedState = parts[1] || "";
      }

      // Final values selection
      const finalCity = (formValues.city as string) || parsedCity || (finalValues.city as string) || "";
      const finalState = (formValues.state as string) || parsedState || (finalValues.state as string) || "";

      finalValues.city = finalCity;
      finalValues.state = finalState;

      // Fallback from address field if city or state is still missing
      if ((!finalValues.city || !finalValues.state) && formValues.address) {
        const parts = (formValues.address as string).split(",").map((p: string) => p.trim());
        if (!finalValues.city) finalValues.city = parts[0] || "";
        if (!finalValues.state) finalValues.state = parts[1] || "";
      }

      // Ensure location field is always set for compatibility with admin dashboard views
      if (!finalValues.location) {
        finalValues.location = finalValues.address || [finalValues.city, finalValues.state].filter(Boolean).join(", ") || "";
      }

      // Enforce minimum 1 entertainer
      const rawNum = finalValues.numEntertainers || finalValues.noOfEntertainers || "";
      const parsedNum = parseInt(String(rawNum)) || 0;
      if (parsedNum < 1) {
        if (finalValues.numEntertainers !== undefined || mode === "default") {
          finalValues.numEntertainers = "1";
        }
        if (finalValues.noOfEntertainers !== undefined) {
          finalValues.noOfEntertainers = "1";
        }
      } else {
        if (finalValues.numEntertainers !== undefined) finalValues.numEntertainers = String(parsedNum);
        if (finalValues.noOfEntertainers !== undefined) finalValues.noOfEntertainers = String(parsedNum);
      }

      const bookingId = generateNumericId();
      const { setDoc } = await import("firebase/firestore");

      await setDoc(doc(db, "bookings", bookingId), {
        ...finalValues,
        id: bookingId,
        clientId: user?.uid || "guest",
        companyId,
        formMode: mode,
        status: "Pending",
        applicants: [],
        selectedTalentId: null,
        createdAt: new Date().toISOString(),
      });
      await sendNotificationToAdmins(companyId, {
        title: "New Booking Submitted!",
        message: `A new booking request (#${bookingId.substring(0, 8)}) was just submitted.`,
        type: "booking",
        link: `/${companyId}/dashboard/admin/bookings/all`
      });
      // Broadcast to matching talents that a new gig is available
      await sendNotificationToTalents(companyId, {
        title: "New Gig Available!",
        message: `A new gig (#${bookingId.substring(0, 8)}) was just posted! Check your available jobs.`,
        type: "booking",
        link: `/${companyId}/dashboard/talent/bookings?tab=available`
      }, {
        ...finalValues,
        id: bookingId,
      });
      showSuccess(`Booking submitted successfully! ID: ${bookingId}`);
      if (user) {
        router.push(`/${companyId}/dashboard/client/bookings`);
      }
    } catch (error) { 
      console.error("Booking error:", error);
      showError("Failed to submit."); 
    }
    finally { setSubmitting(false); }
  };

  const renderElement = (el: FormElement) => {
    if (el.type === "divider") return null;
    if (el.type === "paragraph") return (
      <p key={el.id} className="text-sm text-slate-500 leading-relaxed col-span-full">{el.content}</p>
    );

    // Normalize legacy short_text fields that should be native date/time pickers
    if (el.id === "__eventDate") el = { ...el, type: "date" };
    if (el.id === "__eventTime") el = { ...el, type: "time" };

    const isWide = el.width === "full" || el.type === "long_text";

    // SPECIAL HANDLING FOR LOCKED DROPDOWN FIELDS
    if (el.id === "__jobType") return (
      <div key={el.id} className={isWide ? "col-span-full" : ""}>
        <label className="block text-[12px] font-semibold text-slate-500 mb-1.5">{el.label} {el.required && <span className="text-red-400">*</span>}</label>
        <div className="relative">
          <select required={el.required} value={val(el.id)} onChange={e => set(el.id, e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
            <option value="">Select type...</option>
            {dropdowns.talentTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <svg className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
        </div>
      </div>
    );
    if (el.id === "__gender") return (
      <div key={el.id} className={isWide ? "col-span-full" : ""}>
        <label className="block text-[12px] font-semibold text-slate-500 mb-1.5">{el.label} {el.required && <span className="text-red-400">*</span>}</label>
        <div className="relative">
          <select required={el.required} value={val(el.id)} onChange={e => set(el.id, e.target.value)} className={`${inputCls} appearance-none cursor-pointer text-sm`}>
            <option value="">Select gender...</option>
            {dropdowns.genders.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
          </select>
          <svg className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
        </div>
      </div>
    );

    return (
      <div key={el.id} className={isWide ? "col-span-full" : ""}>
        <label className="block text-[12px] font-semibold text-slate-500 mb-1.5">
          {el.label} {el.required && <span className="text-red-400">*</span>}
        </label>
        {el.type === "long_text" && (
          <textarea rows={4} required={el.required} placeholder={el.placeholder}
            value={val(el.id)} onChange={e => set(el.id, e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-400 resize-none placeholder:text-slate-400" />
        )}
        {(el.type === "short_text" || el.type === "email" || el.type === "number" || el.type === "date" || el.type === "time") && (
          <input className={inputCls} type={el.type === "email" ? "email" : el.type === "number" ? "number" : el.type === "date" ? "date" : el.type === "time" ? "time" : "text"}
            required={el.required} placeholder={el.placeholder}
            value={val(el.id)} onChange={e => set(el.id, e.target.value)} />
        )}
        {el.type === "pay_rate" && (
          <div className="relative">
            <div className="absolute left-3 top-3 text-slate-400 text-sm">$</div>
            <input className={`${inputCls} pl-7`} type="number" step="0.01"
              required={el.required} placeholder="e.g. 200"
              value={val(el.id)} onChange={e => set(el.id, e.target.value)} />
          </div>
        )}
        {el.type === "location_search" && (
          <LocationSearchInput
            value={val(el.id)}
            onChange={(city, state, full) => {
              set(el.id, full);
              set("city", city);
              set("state", state);
            }}
            placeholder={el.placeholder || "Search city (e.g. Miami, FL)"}
          />
        )}
        {el.type === "dropdown" && (
          <div className="relative">
            <select required={el.required} className={`${inputCls} appearance-none cursor-pointer`}
              value={val(el.id)} onChange={e => set(el.id, e.target.value)}>
              <option value="">Select...</option>
              {el.options?.map((o, i) => <option key={i} value={o}>{o}</option>)}
            </select>
            <svg className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
          </div>
        )}
        {el.type === "single_choice" && (
          <div className="space-y-2 mt-1">
            {el.options?.map((o, i) => (
              <label key={i} className="flex items-center gap-2.5 cursor-pointer group">
                <input type="radio" name={el.id} value={o} required={el.required && !val(el.id)}
                  checked={val(el.id) === o} onChange={() => set(el.id, o)}
                  className="accent-indigo-600 w-4 h-4" />
                <span className="text-sm text-slate-700">{o}</span>
              </label>
            ))}
          </div>
        )}
        {el.type === "multi_choice" && (
          <div className="space-y-2 mt-1">
            {el.options?.map((o, i) => {
              const current = (formValues[el.id] as string[] || []);
              const checked = current.includes(o);
              return (
                <label key={i} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={checked}
                    onChange={() => set(el.id, checked ? current.filter(v => v !== o) : [...current, o])}
                    className="accent-indigo-600 w-4 h-4 rounded" />
                  <span className="text-sm text-slate-700">{o}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  // ─── Default Form Layout ───────────────────────────────────────────────────
  if (mode === "default") return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">New Booking Request</h1>
        <p className="text-sm text-slate-400 mt-0.5">Fill in the event details below to submit your booking.</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {[
            { header: "Client Information", fields: [
              { id:"clientName", label:"Full Name", type:"text", req:true, ph:"John Smith", wide:false},
              { id:"clientNumber", label:"Phone Number", type:"tel", req:true, ph:"(XXX) XXX-XXXX", wide:false},
              { id:"clientEmail", label:"Email Address", type:"email", req:true, ph:"client@email.com", wide:false},
            ]},
            { header: "Event Details", fields: [
              { id:"eventDate", label:"Event Date", type:"date", req:true, wide:false},
              { id:"eventTime", label:"Event Time", type:"time", req:true, wide:false},
              { id:"duration", label:"Duration", type:"text", ph:"e.g 4 Hours", wide:false},
              { id:"address", label:"Address", type:"text", req:true, ph:"Full event address", wide:true},
              { id:"__location", label:"City / State", type:"location_search", req:true, wide:false},
            ]},
            { header: "Requirements", fields: [
              { id:"jobType", label:"Job Type / Service", type:"select_type", req:true, wide:false},
              { id:"gender", label:"Preferred Gender", type:"select_gender", req:true, wide:false},
              { id:"numEntertainers", label:"# Entertainers", type:"number", wide:false},
              { id:"options", label:"Additional Options", type:"text", ph:"e.g. Stage, Lighting", wide:true},
            ]},
            { header: "Guests & Pricing", fields: [
              { id:"femaleGuests", label:"# Female Guests", type:"number", wide:false},
              { id:"maleGuests", label:"# Male Guests", type:"number", wide:false},
              { id:"payRate", label:"Pay Rate ($)", type:"text", req:true, wide:false},
            ]},
          ].map(section => (
            <div key={section.header}>
              <div className="px-4 sm:px-8 py-3 bg-gradient-to-r from-indigo-50 to-slate-50 border-t border-b border-slate-100">
                <p className="text-[11px] font-black text-indigo-500 uppercase tracking-widest">{section.header}</p>
              </div>
              <div className="px-4 sm:px-8 py-6 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5">
                {section.fields.map((f:any) => (
                  <div key={f.id} className={f.wide ? "sm:col-span-3" : ""}>
                    <label className="block text-[12px] font-semibold text-slate-500 mb-1.5">{f.label} {f.req && <span className="text-red-400">*</span>}</label>
                    {f.type === "location_search" ? (
                      <LocationSearchInput
                        value={val("__location")}
                        onChange={(city, state, full) => {
                          set("__location", full);
                          set("city", city);
                          set("state", state);
                        }}
                        placeholder="Search city (e.g. Miami, FL)"
                      />
                    ) : f.type === "select_type" ? (
                      <div className="relative">
                        <select required value={val(f.id)} onChange={e => set(f.id, e.target.value)} className={`${inputCls} appearance-none cursor-pointer text-sm`}>
                          <option value="">Select type...</option>
                          {dropdowns.talentTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                        </select>
                        <svg className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                      </div>
                    ) : f.type === "select_gender" ? (
                      <div className="relative">
                        <select required value={val(f.id)} onChange={e => set(f.id, e.target.value)} className={`${inputCls} appearance-none cursor-pointer text-sm`}>
                          <option value="">Select gender...</option>
                          {dropdowns.genders.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                        </select>
                        <svg className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                      </div>
                    ) : (
                      <input className={inputCls} type={f.type} required={f.req} placeholder={f.ph}
                        value={val(f.id)} onChange={e => set(f.id, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="px-4 sm:px-8 py-6">
            <label className="block text-[12px] font-semibold text-slate-500 mb-1.5">Special Requests</label>
            <textarea rows={4} value={val("specialRequests")} onChange={e => set("specialRequests", e.target.value)}
              placeholder="Any notes or special requests..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 resize-none placeholder:text-slate-400" />
          </div>
          <div className="px-4 sm:px-8 py-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-3">
            <Button type="submit" disabled={submitting} className="h-10 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-2">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting...</> : "Submit Booking"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );

  // ─── Custom Form Layout ────────────────────────────────────────────────────
  const groups: { divider?: FormElement; fields: FormElement[] }[] = [];
  let currentSec: { divider?: FormElement; fields: FormElement[] } = { fields: [] };
  elements.forEach(el => {
    if (el.type === "divider") {
      if (currentSec.fields.length > 0 || currentSec.divider) groups.push(currentSec);
      currentSec = { divider: el, fields: [] };
    } else {
      currentSec.fields.push(el);
    }
  });
  if (currentSec.fields.length > 0 || currentSec.divider) groups.push(currentSec);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">New Booking Request</h1>
        <p className="text-sm text-slate-400 mt-0.5">Fill in the details below to submit your event booking.</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {groups.map((grp, gi) => (
            <div key={gi}>
              {grp.divider && (
                <div className="px-4 sm:px-8 py-3 bg-gradient-to-r from-indigo-50 to-slate-50 border-t border-b border-slate-100">
                  <p className="text-[11px] font-black text-indigo-500 uppercase tracking-widest">{grp.divider.label || "Section"}</p>
                </div>
              )}
              {grp.fields.length > 0 && (
                <div className="px-4 sm:px-8 py-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                  {grp.fields.map(el => renderElement(el))}
                </div>
              )}
            </div>
          ))}
          <div className="px-4 sm:px-8 py-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-3">
            <Button type="submit" disabled={submitting} className="h-10 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-2">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting...</> : "Submit Booking"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
