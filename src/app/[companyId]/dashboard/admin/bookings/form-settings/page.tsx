"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Check, Settings2, Plus, Trash2, Pencil, X, AlignLeft, AlignJustify, Mail, Hash, List, CheckSquare,
  Circle, Type, Minus, ToggleRight, ToggleLeft, Lock, Columns, Square, GripVertical, Copy, Link as LinkIcon, ExternalLink, DollarSign, MapPin, CalendarDays, Clock
} from "lucide-react";
import { LocationSearchInput } from "@/components/bookings/LocationSearchInput";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";

// ─── Types ────────────────────────────────────────────────────────────────────
type FieldType =
  | "short_text" | "long_text" | "email" | "number"
  | "dropdown" | "single_choice" | "multi_choice"
  | "paragraph" | "divider" | "pay_rate" | "location_search" | "date" | "time";

interface FormElement {
  id: string;
  type: FieldType;
  label?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  content?: string;
  width?: "half" | "full";
  locked?: boolean;
}

const LOCKED_FIELDS: FormElement[] = [
  { id: "__email",     type: "email",      label: "Email Address",      placeholder: "client@email.com",     required: true, locked: true, width: "half" },
  { id: "__eventDate", type: "date",       label: "Event Date",         placeholder: "YYYY-MM-DD",          required: true, locked: true, width: "half" },
  { id: "__eventTime", type: "time",       label: "Event Time",         placeholder: "HH:MM",               required: true, locked: true, width: "half" },
  { id: "__jobType",   type: "short_text", label: "Job Type / Service", placeholder: "e.g. Buff Butler",     required: true, locked: true, width: "half" },
  { id: "__gender",    type: "short_text", label: "Preferred Gender",   placeholder: "e.g. Male",            required: true, locked: true, width: "half" },
  { id: "__address",   type: "short_text", label: "Address",            placeholder: "Full event address",   required: true, locked: true, width: "full" },
  { id: "__location",  type: "location_search", label: "City / State",  placeholder: "Search city...",       required: true, locked: true, width: "half" },
];

const ELEMENT_TYPES: { type: FieldType; label: string; icon: any; color: string }[] = [
  { type: "short_text",    label: "Short Text",     icon: AlignLeft,    color: "bg-blue-50 text-blue-600 border-blue-200" },
  { type: "long_text",     label: "Long Text",      icon: AlignJustify, color: "bg-blue-50 text-blue-600 border-blue-200" },
  { type: "email",         label: "Email",          icon: Mail,         color: "bg-violet-50 text-violet-600 border-violet-200" },
  { type: "number",        label: "Number",         icon: Hash,         color: "bg-green-50 text-green-600 border-green-200" },
  { type: "pay_rate",      label: "Payrate ($)",    icon: DollarSign,   color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  { type: "dropdown",      label: "Dropdown",       icon: List,         color: "bg-orange-50 text-orange-600 border-orange-200" },
  { type: "single_choice", label: "Single Choice",  icon: Circle,       color: "bg-pink-50 text-pink-600 border-pink-200" },
  { type: "multi_choice",  label: "Multi Choice",   icon: CheckSquare,  color: "bg-pink-50 text-pink-600 border-pink-200" },
  { type: "paragraph",     label: "Paragraph",      icon: Type,         color: "bg-slate-50 text-slate-600 border-slate-200" },
  { type: "divider",       label: "Section Divider",icon: Minus,        color: "bg-indigo-50 text-indigo-600 border-indigo-200" },
  { type: "date",          label: "Date",           icon: CalendarDays, color: "bg-teal-50 text-teal-600 border-teal-200" },
  { type: "time",          label: "Time",           icon: Clock,        color: "bg-teal-50 text-teal-600 border-teal-200" },
];

const getMeta = (type: FieldType) => {
  return ELEMENT_TYPES.find(e => e.type === type) || { type: "short_text", label: "Unknown", icon: Mail, color: "bg-slate-50 text-slate-600 border-slate-200" };
};const uid = () => Math.random().toString(36).slice(2, 10);

const makeDefault = (type: FieldType): FormElement => {
  const base: FormElement = { id: uid(), type, width: "half" };
  if (type === "paragraph") return { ...base, content: "Enter paragraph text here...", width: "full" };
  if (type === "divider") return { ...base, label: "Section Title", width: "full" };
  if (type === "long_text") return { ...base, label: "Untitled", placeholder: "", required: false, width: "full" };
  if (["dropdown","single_choice","multi_choice"].includes(type))
    return { ...base, label: "Untitled", required: false, options: ["Option 1","Option 2"] };
  if (type === "pay_rate") return { ...base, label: "Pay Rate ($)", required: true, placeholder: "e.g. 200" };
  return { ...base, label: "Untitled", placeholder: "", required: false };
};

const buildDefaultTemplate = (): FormElement[] => [
  { id: uid(), type: "divider",     label: "Client Information",  width: "full" },
  { id: uid(), type: "short_text", label: "Full Name",           placeholder: "John Smith",          required: true,  width: "half" },
  { id: uid(), type: "short_text", label: "Phone Number",        placeholder: "(XXX) XXX-XXXX",      required: true,  width: "half" },
  { id: "__email",   type: "email",      label: "Email Address",      placeholder: "client@email.com",   required: true,  locked: true, width: "half" },
  { id: uid(), type: "divider",     label: "Event Details",       width: "full" },
  { id: "__eventDate", type: "date", label: "Event Date",        placeholder: "YYYY-MM-DD",          required: true,  locked: true, width: "half" },
  { id: "__eventTime", type: "time", label: "Event Time",        placeholder: "HH:MM",               required: true,  locked: true, width: "half" },
  { id: uid(), type: "short_text", label: "Duration",            placeholder: "e.g. 4 Hours",        required: false, width: "half" },
  { id: "__address", type: "short_text", label: "Address",            placeholder: "Full event address", required: true,  locked: true, width: "full" },
  { id: "__location", type: "location_search", label: "City / State", placeholder: "Search city...",      required: true,  locked: true, width: "half" },
  { id: uid(), type: "divider",     label: "Requirements",        width: "full" },
  { id: "__jobType", type: "short_text", label: "Job Type / Service", placeholder: "e.g. Buff Butler",   required: true,  locked: true, width: "half" },
  { id: "__gender",  type: "short_text", label: "Preferred Gender",   placeholder: "e.g. Male",          required: true,  locked: true, width: "half" },
  { id: uid(), type: "number",     label: "# Entertainers",      required: false, width: "half" },
  { id: uid(), type: "short_text", label: "Additional Options",  placeholder: "e.g. Stage, Lighting", required: false, width: "full" },
  { id: uid(), type: "divider",     label: "Guests & Pricing",    width: "full" },
  { id: uid(), type: "number",     label: "# Female Guests",     required: false, width: "half" },
  { id: uid(), type: "number",     label: "# Male Guests",       required: false, width: "half" },
  { id: uid(), type: "short_text", label: "Pay Rate ($)",        placeholder: "e.g. 200",            required: true,  width: "half" },
];


export default function FormSettingsPage() {
  const { user } = useAuth();
  const companyId = user?.companyId as string;
  const [activeForm, setActiveForm] = useState<"default"|"custom">("default");
  const [elements, setElements] = useState<FormElement[]>([]);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const [showShare, setShowShare] = useState(false);
  
  const [dropdowns, setDropdowns] = useState<{ talentTypes: any[]; genders: any[] }>({ talentTypes: [], genders: [] });
  const [draggedId, setDraggedId] = useState<string|null>(null);

  const customUrl = typeof window !== 'undefined' ? `${window.location.origin}/${companyId}/bookings/custom` : '';
  const defaultUrl = typeof window !== 'undefined' ? `${window.location.origin}/${companyId}/bookings/default` : '';
  const iframeCode = `<iframe src="${activeForm === 'custom' ? customUrl : defaultUrl}" width="100%" height="800" style="border:none;" allowfullscreen></iframe>`;

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  
  const copyToClipboard = (text: string, type: 'link'|'iframe') => {
    navigator.clipboard.writeText(text);
    if(type === 'link') { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }
    else { setCopiedIframe(true); setTimeout(() => setCopiedIframe(false), 2000); }
  };

  useEffect(() => {
    async function load() {
      if (!companyId) return;
      try {
        const snap = await getDoc(doc(db, "companies", companyId, "settings", "bookingForm"));
        if (snap.exists()) {
          const d = snap.data();
          setActiveForm(d.activeForm || "default");
          const saved: FormElement[] = d.customElements || [];
          const existing = new Set(saved.map(e => e.id));
          const toAdd = LOCKED_FIELDS.filter(f => !existing.has(f.id));
          setElements([...toAdd, ...saved]);
        } else {
          setElements([...LOCKED_FIELDS]);
        }

        const [tSnap, gSnap] = await Promise.all([
          getDocs(query(collection(db, "companies", companyId, "talentTypes"), where("status", "==", "active"))),
          getDocs(query(collection(db, "companies", companyId, "genders"), where("status", "==", "active"))),
        ]);
        setDropdowns({
          talentTypes: tSnap.docs.map(d => ({ id: d.id, name: d.data().name })).sort((a,b) => a.name.localeCompare(b.name)),
          genders: gSnap.docs.map(d => ({ id: d.id, name: d.data().name })).sort((a,b) => a.name.localeCompare(b.name)),
        });
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, [companyId]);

  const addElement = (type: FieldType) => {
    setElements(prev => [...prev, makeDefault(type)]);
    setPreview(false);
  };
  const copyDefaultForm = () => {
    setElements(buildDefaultTemplate());
    setPreview(false);
  };
  const remove = (id: string) => {
    setElements(prev => prev.filter(e => e.id !== id || e.locked));
    if (editingId === id) setEditingId(null);
  };
  const update = (id: string, patch: Partial<FormElement>) =>
    setElements(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "companies", companyId, "settings", "bookingForm"), { activeForm, customElements: elements });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { showError("Failed to save."); }
    finally { setSaving(false); }
  };

  // Drag and Drop Logic
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    setElements(prev => {
      const gidx = prev.findIndex(item => item.id === draggedId);
      const tidx = prev.findIndex(item => item.id === targetId);
      if (gidx === -1 || tidx === -1) return prev;
      const arr = [...prev];
      const [draggedItem] = arr.splice(gidx, 1);
      arr.splice(tidx, 0, draggedItem);
      return arr;
    });
  };
  const handleDragEnd = () => setDraggedId(null);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2 rounded-xl"><Settings2 className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-xl font-bold text-slate-900">Form Builder</h1><p className="text-xs text-slate-400">Design the booking form your clients will use.</p></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowShare(true)} className="h-9 px-4 rounded-xl text-sm font-semibold text-slate-700 border-slate-200 flex items-center gap-2">
            <LinkIcon className="w-4 h-4"/> Share Form
          </Button>
          <Button variant="outline" onClick={() => setPreview(p => !p)} className="h-9 px-4 rounded-xl text-sm font-semibold text-slate-700 border-slate-200">{preview ? "← Edit" : "Preview"}</Button>
          <Button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1.5">{saving ? <Loader2 className="w-4 h-4 animate-spin"/> : saved ? <Check className="w-4 h-4"/> : null}{saving ? "Saving..." : saved ? "Saved!" : "Save Form"}</Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 flex-wrap shadow-sm">
        <p className="text-sm font-bold text-slate-600 shrink-0">Active Form for Clients:</p>
        <div className="flex gap-3">
          {(["default","custom"] as const).map(mode => (
            <button key={mode} onClick={() => setActiveForm(mode)} className={`h-9 px-5 rounded-xl text-sm font-semibold border transition-all capitalize ${activeForm === mode ? "bg-indigo-600 border-indigo-600 text-white shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>{mode}</button>
          ))}
        </div>
        <p className="text-xs text-slate-400">{activeForm === "default" ? "Clients see the standard booking form." : "Clients see the form you built below."}</p>
      </div>

      {showShare && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl relative">
            <button onClick={() => setShowShare(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"><X className="w-5 h-5"/></button>
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-5"><LinkIcon className="w-6 h-6"/></div>
            <h2 className="text-xl font-bold text-slate-900">Share & Embed Form</h2>
            <p className="text-sm text-slate-500 mt-1 mb-6">Clients will need to log into your platform to submit this booking form.</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Custom Form (Public)</label>
                <div className="flex gap-2">
                  <Input readOnly value={customUrl} className="font-mono text-sm pl-4 h-11 rounded-xl bg-slate-50 border-slate-200" />
                  <Button onClick={() => copyToClipboard(customUrl, 'link')} variant="outline" className="h-11 px-4 shrink-0 rounded-xl border-slate-200 text-slate-600 font-semibold">{copiedLink ? <Check className="w-4 h-4 text-green-500"/> : <Copy className="w-4 h-4"/>}</Button>
                  <Button onClick={() => window.open(customUrl, '_blank')} className="h-11 px-4 shrink-0 rounded-xl bg-slate-800 hover:bg-slate-900 text-white"><ExternalLink className="w-4 h-4"/></Button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Standard Form (Default)</label>
                <div className="flex gap-2">
                  <Input readOnly value={defaultUrl} className="font-mono text-sm pl-4 h-11 rounded-xl bg-slate-50 border-slate-200" />
                  <Button onClick={() => copyToClipboard(defaultUrl, 'link')} variant="outline" className="h-11 px-4 shrink-0 rounded-xl border-slate-200 text-slate-600 font-semibold">{copiedLink ? <Check className="w-4 h-4 text-green-500"/> : <Copy className="w-4 h-4"/>}</Button>
                  <Button onClick={() => window.open(defaultUrl, '_blank')} className="h-11 px-4 shrink-0 rounded-xl bg-slate-800 hover:bg-slate-900 text-white"><ExternalLink className="w-4 h-4"/></Button>
                </div>
              </div>


              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Embed Interface (Iframe)</label>
                <div className="relative">
                  <textarea readOnly value={iframeCode} rows={3} className="w-full font-mono text-[13px] p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 resize-none focus:outline-none" />
                  <Button onClick={() => copyToClipboard(iframeCode, 'iframe')} variant="outline" className="absolute top-3 right-3 h-8 px-3 rounded-lg border-slate-200 text-slate-600 text-xs font-bold bg-white">{copiedIframe ? <><Check className="w-3.5 h-3.5 mr-1 text-green-500"/>Copied</> : <><Copy className="w-3.5 h-3.5 mr-1"/>Copy Code</>}</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {preview ? <PreviewPanel elements={elements} dropdowns={dropdowns} /> : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden sticky top-4">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60"><p className="text-xs font-black text-indigo-500 uppercase tracking-widest">Add Element</p></div>
            
            {/* Standard Elements */}
            <div className="p-3 grid grid-cols-1 gap-1 border-b border-slate-100">
              {ELEMENT_TYPES.filter(e => e.type !== "email").map(({ type, label, icon: Icon, color }) => (
                <button key={type} onClick={() => addElement(type)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 text-sm font-medium text-left transition-colors group border border-transparent hover:border-slate-200">
                  <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${color}`}><Icon className="w-3.5 h-3.5" /></div>
                  {label}
                  <Plus className="w-4 h-4 ml-auto text-slate-300 group-hover:text-indigo-500 transition-colors" />
                </button>
              ))}
            </div>

            {/* Required Elements Toolkit */}
            <div className="p-3 grid grid-cols-1 gap-1">
              {LOCKED_FIELDS.map((lf) => {
                const isAdded = elements.some(e => e.id === lf.id);
                return (
                  <button key={lf.id} onClick={() => !isAdded && setElements(prev => [...prev, lf])} disabled={isAdded}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors group border border-transparent ${isAdded ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50 text-slate-700 hover:border-slate-200"}`}>
                    <div className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 bg-amber-50 text-amber-600 border-amber-200">
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-sm font-medium">{lf.label}</span>
                    <Plus className={`w-4 h-4 ml-auto transition-colors ${isAdded ? "text-transparent" : "text-slate-300 group-hover:text-amber-500"}`} />
                  </button>
                );
              })}
            </div>

            <div className="p-3 pt-0 mt-3 border-t border-slate-100">
               <button onClick={copyDefaultForm} className="mt-3 w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold transition-all">
                  <Plus className="w-4 h-4" /> Copy Default Form
                </button>
            </div>
          </div>

          <div className="space-y-3">
            {elements.map((el) => (
              <ElementCard key={el.id} element={el}
                isEditing={editingId === el.id}
                onEdit={() => setEditingId(editingId === el.id ? null : el.id)}
                onDelete={() => remove(el.id)}
                onChange={p => update(el.id, p)}
                onDragStart={(e) => handleDragStart(e, el.id)}
                onDragOver={(e) => handleDragOver(e, el.id)}
                onDragEnd={handleDragEnd}
                isDragged={draggedId === el.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ElementCard({ element, isEditing, onEdit, onDelete, onChange, onDragStart, onDragOver, onDragEnd, isDragged }: {
  element: FormElement; isEditing: boolean;
  onEdit: ()=>void; onDelete: ()=>void; onChange: (p: Partial<FormElement>)=>void;
  onDragStart: (e:any)=>void; onDragOver: (e:any)=>void; onDragEnd: ()=>void; isDragged: boolean;
}) {
  const meta = getMeta(element.type);
  const Icon = meta.icon;

  return (
    <div 
      draggable 
      onDragStart={onDragStart} 
      onDragOver={onDragOver} 
      onDragEnd={onDragEnd}
      className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all ${isDragged ? "opacity-40 scale-95" : ""} ${isEditing ? "border-indigo-300 ring-2 ring-indigo-500/10" : "border-slate-200 hover:border-slate-300"}`}
    >
      <div className="flex items-center gap-3 px-5 py-3.5 cursor-grab active:cursor-grabbing">
        <GripVertical className="w-5 h-5 text-slate-300 hover:text-slate-500 shrink-0" />
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${meta.color}`}><Icon className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0 pointer-events-none">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-800 truncate">{element.type === "paragraph" ? (element.content?.slice(0,50) || "Paragraph") : element.label || "Untitled"}</p>
            {element.locked && <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-lg shrink-0"><Lock className="w-2.5 h-2.5" /> Required</span>}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-slate-400">{meta.label}</p><span className="text-[10px] text-slate-300">·</span><p className="text-[11px] text-slate-400">{element.width === "full" ? "Full width" : "Half width"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className={`p-1.5 rounded-lg transition-colors ${isEditing ? "text-indigo-600 bg-indigo-50" : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"}`}><Pencil className="w-4 h-4"/></button>
          {!element.locked && <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4"/></button>}
        </div>
      </div>

      {isEditing && (
        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-5 space-y-4">
          {element.type === "paragraph" && (
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Content</label>
              <textarea rows={3} value={element.content||""} onChange={e=>onChange({content:e.target.value})} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 resize-none"/>
            </div>
          )}
          {element.type === "divider" && (
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Section Title</label>
              <Input value={element.label||""} onChange={e=>onChange({label:e.target.value})} className="h-9 rounded-xl text-sm" placeholder="e.g. Event Details"/>
            </div>
          )}
          {!["paragraph","divider"].includes(element.type) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Label</label>
                <Input value={element.label||""} onChange={e=>onChange({label:e.target.value})} className="h-9 rounded-xl text-sm"/>
              </div>
              {!["single_choice","multi_choice","dropdown"].includes(element.type) && (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Placeholder</label>
                  <Input value={element.placeholder||""} onChange={e=>onChange({placeholder:e.target.value})} className="h-9 rounded-xl text-sm"/>
                </div>
              )}
              {!element.locked && (
                <div className="flex items-center gap-3">
                  <button onClick={()=>onChange({required:!element.required})} className="shrink-0">{element.required ? <ToggleRight className="w-6 h-6 text-indigo-500"/> : <ToggleLeft className="w-6 h-6 text-slate-300"/>}</button>
                  <label className="text-sm font-medium text-slate-700">Required field</label>
                </div>
              )}
            </div>
          )}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Column Width</label>
            <div className="flex gap-2">
              <button onClick={()=>onChange({width:"half"})} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${element.width!=="full" ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}><Columns className="w-4 h-4"/> Half (2 columns)</button>
              <button onClick={()=>onChange({width:"full"})} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${element.width==="full" ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}><Square className="w-4 h-4"/> Full width</button>
            </div>
          </div>
          {["dropdown","single_choice","multi_choice"].includes(element.type) && (
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Options</label>
              <div className="space-y-2">
                {(element.options||[]).map((opt,i)=>(
                  <div key={i} className="flex gap-2 items-center"><Input value={opt} onChange={e=>{const o=[...(element.options||[])];o[i]=e.target.value;onChange({options:o})}} className="h-9 rounded-xl text-sm flex-1"/><button onClick={()=>onChange({options:element.options?.filter((_,j)=>j!==i)})} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"><X className="w-4 h-4"/></button></div>
                ))}
                <button onClick={()=>onChange({options:[...(element.options||[]),`Option ${(element.options?.length||0)+1}`]})} className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 mt-1"><Plus className="w-4 h-4"/> Add option</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewPanel({ elements, dropdowns }: { elements: FormElement[], dropdowns: {talentTypes:any[], genders:any[]} }) {
  const inputCls = "w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none";
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60"><p className="text-xs font-black text-indigo-500 uppercase tracking-widest">Live Preview — Client View</p></div>
      <div className="p-0">
        {elements.length===0 && <p className="text-slate-400 text-sm text-center py-12">No elements added yet.</p>}
        {(() => {
          const groups: {divider?: FormElement; fields: FormElement[]}[] = [];
          let current: {divider?: FormElement; fields: FormElement[]} = {fields:[]};
          elements.forEach(el => {
            if (el.type === "divider") {
              if (current.fields.length > 0 || current.divider) groups.push(current);
              current = { divider: el, fields: [] };
            } else current.fields.push(el);
          });
          if (current.fields.length > 0 || current.divider) groups.push(current);
          return groups.map((grp, gi) => (
            <div key={gi}>
              {grp.divider && <div className="px-8 py-3 bg-gradient-to-r from-indigo-50 to-slate-50 border-t border-b border-slate-100"><p className="text-[11px] font-black text-indigo-500 uppercase tracking-widest">{grp.divider.label || "Section"}</p></div>}
              <div className="px-8 py-6 grid grid-cols-2 gap-x-6 gap-y-5">
                {grp.fields.map(baseEl => {
                  let el = { ...baseEl };
                  if (el.id === "__eventDate") el.type = "date";
                  if (el.id === "__eventTime") el.type = "time";
                  
                  const isFullWidth = el.width === "full" || el.type === "long_text" || el.type === "paragraph";
                  
                  // SPECIAL RENDER FOR JOB/GENDER
                  if (el.id === "__jobType") return (
                    <div key={el.id} className={isFullWidth ? "col-span-2" : ""}>
                      <label className="block text-[12px] font-semibold text-slate-500 mb-1.5">{el.label} {el.required && <span className="text-red-400">*</span>}</label>
                      <div className="relative">
                        <select className={`${inputCls} appearance-none cursor-pointer`} disabled><option>Select type...</option>{dropdowns.talentTypes.map(t=><option key={t.id}>{t.name}</option>)}</select>
                        <svg className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                      </div>
                    </div>
                  );
                  if (el.id === "__gender") return (
                    <div key={el.id} className={isFullWidth ? "col-span-2" : ""}>
                      <label className="block text-[12px] font-semibold text-slate-500 mb-1.5">{el.label} {el.required && <span className="text-red-400">*</span>}</label>
                      <div className="relative">
                        <select className={`${inputCls} appearance-none cursor-pointer`} disabled><option>Select gender...</option>{dropdowns.genders.map(g=><option key={g.id}>{g.name}</option>)}</select>
                        <svg className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                      </div>
                    </div>
                  );

                  return (
                    <div key={el.id} className={isFullWidth ? "col-span-2" : ""}>
                      {el.type === "paragraph"
                        ? <p className="text-sm text-slate-500 leading-relaxed">{el.content}</p>
                        : (<>
                          <label className="block text-[12px] font-semibold text-slate-500 mb-1.5">{el.label} {el.required && <span className="text-red-400">*</span>}</label>
                          {el.type === "location_search" && (
                            <LocationSearchInput
                              value=""
                              onChange={() => { }}
                              placeholder={el.placeholder || "Search city..."}
                            />
                          )}
                          {el.type === "long_text" && <textarea rows={3} placeholder={el.placeholder} className={`${inputCls} h-auto py-2.5 resize-none`} disabled/>}
                          {(el.type === "short_text"||el.type==="email"||el.type==="number"||el.type==="date"||el.type==="time") && <input type={el.type === "email" ? "email" : el.type === "number" ? "number" : el.type === "date" ? "date" : el.type === "time" ? "time" : "text"} placeholder={el.placeholder} className={inputCls} disabled/>}
                          {el.type === "dropdown" && <select className={`${inputCls} appearance-none`} disabled><option>Select…</option>{el.options?.map((o,i)=><option key={i}>{o}</option>)}</select>}
                          {el.type === "pay_rate" && (
                            <div className="relative">
                              <div className="absolute left-3 top-3 text-slate-400 text-sm">$</div>
                              <input type="number" placeholder="200" className={`${inputCls} pl-7`} disabled/>
                            </div>
                          )}
                          {el.type === "single_choice" && <div className="space-y-2 mt-1">{el.options?.map((o,i)=><label key={i} className="flex items-center gap-2.5"><input type="radio" disabled className="accent-indigo-600"/><span className="text-sm text-slate-700">{o}</span></label>)}</div>}
                          {el.type === "multi_choice" && <div className="space-y-2 mt-1">{el.options?.map((o,i)=><label key={i} className="flex items-center gap-2.5"><input type="checkbox" disabled className="accent-indigo-600 rounded"/><span className="text-sm text-slate-700">{o}</span></label>)}</div>}
                        </>)}
                    </div>
                  );
                })}
              </div>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}
