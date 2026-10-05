"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc, orderBy, query, serverTimestamp
} from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { UsersRound, Plus, Pencil, Trash2, Check, X, Search, ChevronLeft, ChevronRight, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Gender {
  id: string;
  name: string;
  status: "active" | "inactive";
}

const PAGE_SIZE = 8;

export default function GendersPage() {
  const { user } = useAuth();
  const companyId = user?.companyId as string;
  const [genders, setGenders] = useState<Gender[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const collectionRef = collection(db, "companies", companyId, "genders");

  const fetchGenders = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collectionRef, orderBy("name")));
      setGenders(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } finally { setLoading(false); }
  };

  useEffect(() => { if (companyId) fetchGenders(); }, [companyId]);

  const filtered = useMemo(() =>
    genders.filter(g => g.name.toLowerCase().includes(search.toLowerCase())),
    [genders, search]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeCount = genders.filter(g => g.status === "active").length;

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "companies", companyId, "genders", editingId), { name: formName.trim() });
      } else {
        await addDoc(collectionRef, { name: formName.trim(), status: "active", createdAt: serverTimestamp() });
      }
      setFormName(""); setEditingId(null); setShowForm(false);
      fetchGenders();
    } finally { setSaving(false); }
  };

  const toggleStatus = async (g: Gender) => {
    await updateDoc(doc(db, "companies", companyId, "genders", g.id), {
      status: g.status === "active" ? "inactive" : "active"
    });
    fetchGenders();
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, "companies", companyId, "genders", id));
    setDeleteConfirm(null);
    fetchGenders();
  };

  const startEdit = (g: Gender) => { setEditingId(g.id); setFormName(g.name); setShowForm(true); };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="bg-violet-100 p-2 rounded-xl">
              <UsersRound className="w-5 h-5 text-violet-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Genders</h1>
          </div>
          <p className="text-sm text-slate-500 ml-11">Define gender options for talent profiles</p>
        </div>
        <Button
          onClick={() => { setShowForm(true); setEditingId(null); setFormName(""); }}
          className="bg-violet-600 hover:bg-violet-700 text-white gap-2 shadow-md shadow-violet-500/25 rounded-xl h-10 px-5"
        >
          <Plus className="w-4 h-4" /> Add Gender
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total", value: genders.length, color: "bg-violet-500" },
          { label: "Active", value: activeCount, color: "bg-emerald-500" },
          { label: "Inactive", value: genders.length - activeCount, color: "bg-slate-400" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
            <div className={cn("w-2.5 h-8 rounded-full", s.color)} />
            <div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-600 font-semibold">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200/60 rounded-2xl p-5 shadow-sm animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-violet-100 p-1.5 rounded-lg">
              {editingId ? <Pencil className="w-4 h-4 text-violet-600" /> : <Plus className="w-4 h-4 text-violet-600" />}
            </div>
            <h2 className="text-sm font-semibold text-slate-700">{editingId ? "Edit Gender" : "Add New Gender"}</h2>
          </div>
          <div className="flex gap-3">
            <Input
              placeholder="e.g. Male, Female, Female - Gay Friendly..."
              value={formName}
              onChange={e => setFormName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              className="flex-1 h-10 rounded-xl border-slate-200 bg-white focus:border-violet-500 focus:ring-violet-500/10 focus:ring-4"
              autoFocus
            />
            <Button onClick={handleSave} disabled={saving || !formName.trim()} className="bg-violet-600 hover:bg-violet-700 text-white h-10 px-5 gap-2 rounded-xl shadow-sm">
              <Check className="w-4 h-4" /> {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setFormName(""); setEditingId(null); }} className="h-10 px-4 rounded-xl gap-2">
              <X className="w-4 h-4" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search genders..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 h-9 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 transition-all bg-slate-50"
            />
          </div>
          <span className="text-xs text-slate-600 font-semibold whitespace-nowrap">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="p-14 text-center">
            <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading...</p>
          </div>
        ) : paginated.length === 0 ? (
          <div className="p-14 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <UsersRound className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-600 font-semibold">{search ? "No results found" : "No genders defined yet"}</p>
            <p className="text-slate-400 text-sm mt-1">{search ? "Try a different search term" : `Click "Add Gender" to get started.`}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {paginated.map((g, i) => (
              <div key={g.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/80 transition-colors group">
                <span className="text-xs font-bold text-slate-500 w-5 text-center shrink-0">{(page - 1) * PAGE_SIZE + i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{g.name}</p>
                </div>
                <button
                  onClick={() => toggleStatus(g)}
                  className={cn(
                    "flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full transition-all duration-200 border",
                    g.status === "active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
                  )}
                >
                  {g.status === "active"
                    ? <ToggleRight className="w-4 h-4 text-emerald-500" />
                    : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                  {g.status === "active" ? "Active" : "Inactive"}
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(g)} className="p-2 rounded-xl text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {deleteConfirm === g.id ? (
                    <div className="flex items-center gap-1 bg-red-50 border border-red-100 rounded-xl px-2 py-1">
                      <span className="text-xs text-red-500 font-medium">Delete?</span>
                      <button onClick={() => handleDelete(g.id)} className="text-xs font-bold text-red-600 px-1.5 py-0.5 rounded">Yes</button>
                      <button onClick={() => setDeleteConfirm(null)} className="text-xs font-bold text-slate-500 px-1.5 py-0.5 rounded">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(g.id)} className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs text-slate-600 font-semibold">Page {page} of {totalPages} · {filtered.length} items</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} className={cn("w-7 h-7 rounded-lg text-xs font-semibold transition-all", p === page ? "bg-violet-600 text-white shadow-sm" : "text-slate-500 hover:bg-white border border-slate-200")}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 transition-all">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
