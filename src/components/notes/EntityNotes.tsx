"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Send, Trash2, FileText, User, Lock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showSuccess, showError, confirmAction } from "@/lib/alerts";

type NoteVisibility = "all" | "master_only";

interface Note {
  id: string;
  companyId: string;
  entityId: string;
  entityType: "booking" | "talent" | "client" | "company";
  authorId: string;
  authorName: string;
  authorRole: "master" | "admin" | "staff" | "client" | "talent";
  text: string;
  createdAt: any;
  visibility?: NoteVisibility; // undefined = "all" for backward compat
}

interface EntityNotesProps {
  companyId: string;
  entityId: string;
  entityType: "booking" | "talent" | "client" | "company";
  title?: string;
  placeholder?: string;
}

const ROLE_COLORS: Record<string, string> = {
  master: "bg-purple-100 text-purple-700 border-purple-200",
  admin: "bg-indigo-100 text-indigo-700 border-indigo-200",
  staff: "bg-blue-100 text-blue-700 border-blue-200",
  client: "bg-emerald-100 text-emerald-700 border-emerald-200",
  talent: "bg-amber-100 text-amber-700 border-amber-200",
};

export function EntityNotes({
  companyId,
  entityId,
  entityType,
  title = "Notes",
  placeholder = "Add an internal staff note..."
}: EntityNotesProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  // Visibility selector — only relevant for platform_admin (master)
  const [visibility, setVisibility] = useState<NoteVisibility>("all");

  const isMaster = user?.role === "platform_admin";

  const isStaffOrAdmin =
    user?.role === "admin" ||
    user?.role === "company_admin" ||
    user?.role === "staff" ||
    isMaster;

  useEffect(() => {
    if (!entityId || !user) return;

    setLoading(true);

    let q;
    if (isStaffOrAdmin) {
      q = query(
        collection(db, "notes"),
        where("companyId", "==", companyId),
        where("entityId", "==", entityId)
      );
    } else {
      q = query(
        collection(db, "notes"),
        where("companyId", "==", companyId),
        where("entityId", "==", entityId),
        where("authorId", "==", user.uid)
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        let list: Note[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as Note);
        });

        // Filter out master_only notes for non-master users
        if (!isMaster) {
          list = list.filter((n) => !n.visibility || n.visibility === "all");
        }

        // Sort in-memory (newest last)
        list.sort((a, b) => {
          const t1 = a.createdAt?.seconds || 0;
          const t2 = b.createdAt?.seconds || 0;
          return t1 - t2;
        });

        setNotes(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading notes:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [entityId, user]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;

    setSaving(true);
    try {
      let resolvedRole: "master" | "admin" | "staff" | "client" | "talent" = "staff";
      if (user.role === "platform_admin") {
        resolvedRole = "master";
      } else if (user.role === "company_admin" || user.role === "admin") {
        resolvedRole = "admin";
      } else if (user.role === "staff") {
        resolvedRole = "staff";
      } else if (user.role === "client") {
        resolvedRole = "client";
      } else if (user.role === "talent") {
        resolvedRole = "talent";
      }

      const notePayload: any = {
        companyId: companyId || user.companyId || "",
        entityId,
        entityType,
        authorId: user.uid,
        authorName: user.name || user.displayName || user.email || "Unknown User",
        authorRole: resolvedRole,
        text: text.trim(),
        visibility: isMaster ? visibility : "all",
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, "notes"), notePayload);
      setText("");
      // Keep visibility selection as-is so master can batch-add notes of same type
    } catch (err) {
      console.error("Failed to add note:", err);
      showError("Failed to add note. Please check permissions.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const confirmed = await confirmAction("Are you sure you want to delete this note? This action cannot be undone.");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "notes", noteId));
      showSuccess("Note deleted successfully.");
    } catch (err) {
      console.error("Failed to delete note:", err);
      showError("Failed to delete note.");
    }
  };

  const formatNoteTime = (ts: any) => {
    if (!ts) return "Just now";
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="bg-white border border-slate-200/60 rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col h-full min-h-[320px] lg:min-h-0">
      <div className="px-6 py-5 border-b border-slate-100/80 bg-slate-50/50 flex items-center justify-between shrink-0">
        <h3 className="font-bold text-[#1e1b4b] text-[16px] flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-500" />
          {title}
        </h3>
        <span className="text-xs font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
          {notes.length} {notes.length === 1 ? "Note" : "Notes"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 lg:max-h-none min-h-[150px] bg-slate-50/30">
        {loading ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <FileText className="w-10 h-10 mb-2 stroke-[1.2] opacity-40 text-slate-400" />
            <p className="text-xs font-bold uppercase tracking-wider">No notes recorded yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => {
              const isAuthor = user && note.authorId === user.uid;
              const isMasterOnly = note.visibility === "master_only";
              return (
                <div
                  key={note.id}
                  className={`p-4 rounded-xl border shadow-sm relative group transition-all ${
                    isMasterOnly
                      ? "bg-purple-50/40 border-purple-100 hover:border-purple-200"
                      : "bg-white border-slate-100 hover:border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center border shrink-0 ${
                        isMasterOnly ? "bg-purple-100 border-purple-200" : "bg-slate-100 border-slate-200"
                      }`}>
                        {isMasterOnly
                          ? <Lock className="w-3.5 h-3.5 text-purple-600" />
                          : <User className="w-4 h-4 text-slate-500" />
                        }
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                          <span className="truncate">{note.authorName}</span>
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                              ROLE_COLORS[note.authorRole] || "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {note.authorRole}
                          </span>
                          {isMasterOnly && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-purple-100 text-purple-700 border-purple-200 flex items-center gap-1 shrink-0">
                              <Lock className="w-2.5 h-2.5" /> Master Only
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {formatNoteTime(note.createdAt)}
                        </span>
                      </div>
                    </div>

                    {isAuthor && (
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="text-slate-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                        title="Delete Note"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap font-medium pl-9">
                    {note.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {user && (
        <div className="border-t border-slate-100 bg-white shrink-0">

          {/* Visibility picker — master/platform_admin only */}
          {isMaster && (
            <div className="px-5 pt-3 pb-0">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                Note Visibility
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility("all")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                    visibility === "all"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200"
                      : "bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-600"
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Visible to Company & Staff
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("master_only")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                    visibility === "master_only"
                      ? "bg-purple-600 text-white border-purple-600 shadow-sm shadow-purple-200"
                      : "bg-white text-slate-500 border-slate-200 hover:border-purple-200 hover:text-purple-600"
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Masters Only (Private)
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-1.5 pb-1">
                {visibility === "master_only"
                  ? "🔒 This note will only be visible to platform managers. Company admins & staff cannot see it."
                  : "🌐 This note will be visible to company admins and staff as well."}
              </p>
            </div>
          )}

          {!isMaster && (
            <div className="px-5 pt-3 pb-0.5">
              <p className="text-[11px] text-slate-500 font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                {user.role === "admin" || user.role === "company_admin" || user.role === "staff"
                  ? "Internal Note: Only visible to agency admins and staff."
                  : "Private Note: This note is private and only visible to you and the agency/staff."}
              </p>
            </div>
          )}

          <form
            onSubmit={handleAddNote}
            className="p-4 pt-2 flex gap-2"
          >
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              placeholder={placeholder}
              rows={1}
              required
              className={`flex-1 min-h-[42px] max-h-[120px] rounded-xl border px-3 py-2 text-[13px] font-medium outline-none transition-all resize-none bg-slate-50/50 overflow-y-hidden ${
                visibility === "master_only" && isMaster
                  ? "border-purple-200 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  : "border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              }`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAddNote(e);
                }
              }}
            />
            <Button
              type="submit"
              disabled={saving || !text.trim()}
              className={`text-white rounded-xl w-10 h-10 p-0 flex items-center justify-center shrink-0 self-end transition-all ${
                visibility === "master_only" && isMaster
                  ? "bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-200"
                  : "bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200"
              }`}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
