"use client";

import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc, 
  arrayUnion 
} from "firebase/firestore";
import { 
  ShieldOff, 
  LogOut, 
  Mail, 
  Ban, 
  LifeBuoy, 
  ArrowLeft, 
  Plus, 
  Loader2, 
  MessageSquare, 
  Clock, 
  Send, 
  User, 
  Shield, 
  HelpCircle 
} from "lucide-react";

interface TicketReply {
  authorName: string;
  authorEmail: string;
  role: string;
  message: string;
  createdAt: any;
}

interface SupportTicket {
  id: string;
  companyId: string;
  companyName: string;
  creatorId: string;
  creatorName: string;
  creatorEmail: string;
  subject: string;
  category: string;
  priority: string;
  description: string;
  status: "Pending" | "In Progress" | "Resolved" | "Closed";
  createdAt: any;
  updatedAt: any;
  replies?: TicketReply[];
}

interface DisabledLockScreenProps {
  companyData: any;
}

const CATEGORIES = [
  "Billing & Subscription",
  "Technical Issue",
  "Feature Request",
  "Booking & Talent Issue",
  "Other"
];

const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

export default function DisabledLockScreen({ companyData }: DisabledLockScreenProps) {
  const { user } = useAuth();
  const isBlacklisted = companyData?.status === "blacklisted";

  const statusLabel   = isBlacklisted ? "Account Blacklisted" : "Account Disabled";
  const headline      = isBlacklisted ? "This workspace has been blacklisted" : "This workspace has been disabled";
  const IconEl        = isBlacklisted ? Ban : ShieldOff;
  const iconBg        = isBlacklisted
    ? "bg-rose-500/15 border-rose-500/30 shadow-[0_0_50px_rgba(239,68,68,0.2)]"
    : "bg-orange-500/15 border-orange-500/30 shadow-[0_0_50px_rgba(249,115,22,0.2)]";
  const iconColor     = isBlacklisted ? "text-rose-400" : "text-orange-400";
  const badgeColor    = isBlacklisted ? "text-rose-500" : "text-orange-400";
  const glowBg1       = isBlacklisted ? "bg-rose-600/10"   : "bg-orange-600/10";
  const glowBg2       = isBlacklisted ? "bg-rose-600/5"    : "bg-amber-600/5";
  const dotColor      = isBlacklisted ? "bg-rose-500/70"   : "bg-orange-500/70";

  const bullets = isBlacklisted
    ? [
        "All dashboard access has been permanently suspended.",
        "This workspace has been flagged for policy violations.",
        "Contact support immediately if you believe this is a mistake.",
      ]
    : [
        "All dashboard access has been temporarily suspended.",
        "Your data is safe and fully preserved.",
        "Contact support to restore your account.",
      ];

  // Helpdesk States
  const [showHelpdesk, setShowHelpdesk] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showDetailMobile, setShowDetailMobile] = useState(false);

  // New ticket state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("Technical Issue");
  const [priority, setPriority] = useState("Medium");
  const [description, setDescription] = useState("");
  const [submittingTicket, setSubmittingTicket] = useState(false);

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  // Realtime tickets fetch (client-sorted to avoid composite index error)
  useEffect(() => {
    if (!showHelpdesk || !companyData?.id) return;

    setLoadingTickets(true);
    const q = query(
      collection(db, "support_tickets"),
      where("companyId", "==", companyData.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsData: SupportTicket[] = [];
      snapshot.forEach((doc) => {
        ticketsData.push({ id: doc.id, ...doc.data() } as SupportTicket);
      });
      // Sort client-side
      ticketsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTickets(ticketsData);
      setLoadingTickets(false);
    }, (err) => {
      console.error("Error fetching support tickets in lock screen:", err);
      setLoadingTickets(false);
    });

    return () => unsubscribe();
  }, [showHelpdesk, companyData?.id]);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyData || !user) return;
    if (!subject.trim() || !description.trim()) return;

    setSubmittingTicket(true);
    try {
      const ticketPayload = {
        companyId: companyData.id,
        companyName: companyData.name || "Unnamed Agency",
        creatorId: user.uid,
        creatorName: user.name || "Workspace Admin",
        creatorEmail: user.email || "",
        subject: subject.trim(),
        category,
        priority,
        description: description.trim(),
        status: "Pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        replies: []
      };

      await addDoc(collection(db, "support_tickets"), ticketPayload);
      
      setSubject("");
      setCategory("Technical Issue");
      setPriority("Medium");
      setDescription("");
      setIsCreateModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !user || !replyText.trim()) return;

    setSubmittingReply(true);
    try {
      const newReplyObj: TicketReply = {
        authorName: user.name || "Workspace User",
        authorEmail: user.email || "",
        role: user.role || "staff",
        message: replyText.trim(),
        createdAt: new Date().toISOString()
      };

      const ticketRef = doc(db, "support_tickets", selectedTicket.id);
      await updateDoc(ticketRef, {
        replies: arrayUnion(newReplyObj),
        updatedAt: new Date().toISOString(),
        status: selectedTicket.status === "Closed" || selectedTicket.status === "Resolved" ? "Pending" : selectedTicket.status
      });

      setReplyText("");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingReply(false);
    }
  };

  const getStatusBadge = (status: SupportTicket["status"]) => {
    switch (status) {
      case "Pending":
        return <span className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Pending</span>;
      case "In Progress":
        return <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">In Progress</span>;
      case "Resolved":
        return <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Resolved</span>;
      case "Closed":
        return <span className="bg-white/10 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Closed</span>;
    }
  };

  if (showHelpdesk) {
    return (
      <div className="fixed inset-0 z-[99999] bg-[#09090b] overflow-y-auto font-sans">
        <div className={`absolute top-1/4 left-1/4 w-[250px] sm:w-[500px] h-[250px] sm:h-[500px] ${glowBg1} rounded-full blur-[80px] sm:blur-[140px] pointer-events-none`} />
        <div className={`absolute bottom-1/3 right-1/4 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] ${glowBg2} rounded-full blur-[60px] sm:blur-[120px] pointer-events-none`} />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.025] pointer-events-none" />

        <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="relative z-10 w-full max-w-4xl bg-white/[0.04] backdrop-blur-[40px] border border-white/10 rounded-3xl p-5 sm:p-8 shadow-2xl flex flex-col space-y-6">
            
            {/* Helpdesk Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowHelpdesk(false);
                    setSelectedTicketId(null);
                    setShowDetailMobile(false);
                  }}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                    <LifeBuoy className="w-5 h-5 text-indigo-400" />
                    Support Helpdesk
                  </h2>
                  <p className="text-slate-400 text-xs font-medium">
                    Workspace: <strong className="text-white">{companyData?.name || "this agency"}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                Create Support Ticket
              </button>
            </div>

            {loadingTickets ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-455" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="bg-white/[0.02] rounded-2xl border border-white/5 p-10 text-center max-w-md mx-auto space-y-4">
                <HelpCircle className="w-10 h-10 text-indigo-400 mx-auto" />
                <h3 className="font-bold text-white text-base">No Tickets Submitted</h3>
                <p className="text-slate-400 text-xs">
                  Create a support ticket below to describe your account recovery or billing issues.
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="bg-white/10 hover:bg-white/15 text-white border border-white/10 rounded-xl px-4 py-2 font-bold text-xs transition-all cursor-pointer"
                >
                  Submit Ticket
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                
                {/* Tickets list */}
                <div className={`md:col-span-5 flex flex-col space-y-3 ${showDetailMobile ? "hidden md:flex" : "flex"}`}>
                  <div className="bg-black/35 border border-white/5 rounded-2xl p-3 overflow-y-auto h-[350px] md:h-[480px] space-y-2 no-scrollbar">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Your Tickets ({tickets.length})</p>
                    {tickets.map((t) => {
                      const isSelected = t.id === selectedTicketId;
                      return (
                        <div
                          key={t.id}
                          onClick={() => {
                            setSelectedTicketId(t.id);
                            setShowDetailMobile(true);
                          }}
                          className={`p-3 rounded-xl border transition-all cursor-pointer text-left space-y-2.5 ${
                            isSelected 
                              ? "bg-white/10 border-white/20" 
                              : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-500 text-[10px] font-mono">#{t.id.slice(-6).toUpperCase()}</span>
                            {getStatusBadge(t.status)}
                          </div>
                          <div>
                            <h4 className="font-bold text-white text-xs sm:text-sm line-clamp-1">{t.subject}</h4>
                            <p className="text-[10px] text-slate-400">{t.category}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Details / Conversation Pane */}
                <div className={`md:col-span-7 flex flex-col ${!showDetailMobile ? "hidden md:flex" : "flex"}`}>
                  {selectedTicket ? (
                    <div className="bg-black/35 border border-white/5 rounded-2xl flex flex-col h-[350px] md:h-[480px] overflow-hidden">
                      {/* Header */}
                      <div className="p-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowDetailMobile(false)}
                            className="md:hidden p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
                          >
                            <ArrowLeft className="w-4 h-4" />
                          </button>
                          <div>
                            <h4 className="font-bold text-white text-xs sm:text-sm line-clamp-1">{selectedTicket.subject}</h4>
                            <span className="text-slate-500 text-[10px] font-mono">#{selectedTicket.id.slice(-6).toUpperCase()}</span>
                          </div>
                        </div>
                        {getStatusBadge(selectedTicket.status)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
                        {/* Initial Description */}
                        <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2 text-[10px]">
                            <span className="font-bold text-slate-350">{selectedTicket.creatorName}</span>
                            <span className="text-slate-500">
                              {new Date(selectedTicket.createdAt).toLocaleDateString("en-GB", {
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {selectedTicket.description}
                          </p>
                        </div>

                        {/* Replies */}
                        <div className="space-y-3">
                          {selectedTicket.replies && selectedTicket.replies.length > 0 ? (
                            selectedTicket.replies.map((reply, idx) => {
                              const isAdminRole = reply.role === "platform_admin";
                              return (
                                <div
                                  key={idx}
                                  className={`flex flex-col space-y-1 ${isAdminRole ? "items-start" : "items-end"}`}
                                >
                                  <div className={`max-w-[85%] rounded-xl p-3 text-left ${
                                    isAdminRole 
                                      ? "bg-white/10 text-white rounded-tl-none border border-white/5" 
                                      : "bg-indigo-600 text-white rounded-tr-none"
                                  }`}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span className="text-[9px] font-bold text-slate-300">
                                        {isAdminRole ? "Platform Support" : reply.authorName}
                                      </span>
                                    </div>
                                    <p className="text-xs leading-relaxed whitespace-pre-wrap">
                                      {reply.message}
                                    </p>
                                  </div>
                                  <span className="text-[9px] text-slate-500 px-1">
                                    {new Date(reply.createdAt).toLocaleDateString("en-GB", {
                                      hour: "2-digit",
                                      minute: "2-digit"
                                    })}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-center py-4 text-slate-500 space-y-1">
                              <MessageSquare className="w-5 h-5 mx-auto opacity-40" />
                              <p className="text-[10px]">No Messages Yet</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Reply Input */}
                      {selectedTicket.status !== "Closed" ? (
                        <form onSubmit={handleSendReply} className="p-2 border-t border-white/5 bg-black/20 flex gap-2 shrink-0">
                          <input
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write message..."
                            className="flex-1 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-xs h-10 outline-none focus:border-white/20"
                            disabled={submittingReply}
                          />
                          <button
                            type="submit"
                            disabled={submittingReply || !replyText.trim()}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 w-10 p-0 rounded-xl shrink-0 flex items-center justify-center border-0 cursor-pointer"
                          >
                            {submittingReply ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>
                        </form>
                      ) : (
                        <div className="p-3 bg-white/5 text-center text-[10px] text-slate-500 font-bold shrink-0">
                          This support ticket is closed.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl flex-1 flex flex-col items-center justify-center text-center p-6 h-[350px] md:h-[480px]">
                      <HelpCircle className="w-8 h-8 text-slate-500 mb-2" />
                      <h4 className="font-bold text-white text-xs">Select Ticket</h4>
                      <p className="text-slate-400 text-[10px] max-w-xs mt-1">
                        Select a support ticket from the list on the left to read replies or write messages.
                      </p>
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>
        </div>

        {/* Create Ticket Modal Overlay */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#18181b] rounded-3xl w-full max-w-md shadow-2xl border border-white/10 p-6 space-y-5 animate-in scale-in duration-200">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <h3 className="font-black text-white text-base sm:text-lg flex items-center gap-2">
                  <LifeBuoy className="w-5 h-5 text-indigo-400" />
                  New Support Ticket
                </h3>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-slate-400 hover:text-white font-bold p-1 rounded-lg hover:bg-white/5 transition-all text-xs border-0 bg-transparent cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateTicket} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Subject</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Account disabled restoration request"
                    className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-xs outline-none focus:border-white/20"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full h-10 rounded-xl bg-[#1f1f23] border border-white/10 text-white px-2 text-xs outline-none"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Priority</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-full h-10 rounded-xl bg-[#1f1f23] border border-white/10 text-white px-2 text-xs outline-none"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your issue..."
                    className="w-full rounded-xl bg-white/5 border border-white/10 text-white p-3 text-xs outline-none focus:border-white/20 min-h-[100px]"
                    required
                  />
                </div>

                <div className="pt-3 border-t border-white/5 flex items-center justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    className="h-10 rounded-xl font-bold border border-white/10 bg-white/5 text-white px-4 text-xs cursor-pointer hover:bg-white/10 transition-all"
                    onClick={() => setIsCreateModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-10 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all active:scale-[0.98] text-xs border-0 cursor-pointer"
                    disabled={submittingTicket}
                  >
                    {submittingTicket ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Submit"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[99999] bg-[#09090b] overflow-y-auto font-sans">
      {/* Background glows */}
      <div className={`absolute top-1/4 left-1/4 w-[250px] sm:w-[500px] h-[250px] sm:h-[500px] ${glowBg1} rounded-full blur-[80px] sm:blur-[140px] pointer-events-none`} />
      <div className={`absolute bottom-1/3 right-1/4 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] ${glowBg2} rounded-full blur-[60px] sm:blur-[120px] pointer-events-none`} />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.025] pointer-events-none" />

      <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="relative z-10 w-full max-w-lg">
          {/* Main card */}
          <div className="bg-white/[0.04] backdrop-blur-[40px] border border-white/10 rounded-3xl sm:rounded-[36px] p-5 sm:p-10 shadow-2xl space-y-6 sm:space-y-7">

            {/* Icon + Title */}
            <div className="flex flex-col items-center text-center space-y-4 sm:space-y-5">
              {/* Pulsing icon */}
              <div className="relative">
                <div className={`absolute inset-0 rounded-full ${isBlacklisted ? "bg-rose-500/20" : "bg-orange-500/20"} animate-ping scale-125`} />
                <div className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-[28px] flex items-center justify-center border ${iconBg}`}>
                  <IconEl className={`w-8 h-8 sm:w-10 sm:h-10 ${iconColor}`} />
                </div>
              </div>

              <div className="space-y-2">
                <p className={`text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] ${badgeColor}`}>
                  {statusLabel}
                </p>
                <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight px-1">
                  {headline}
                </h1>
                <p className="text-slate-400 text-xs sm:text-sm font-medium max-w-xs mx-auto">
                  The <strong className="text-white">&ldquo;{companyData?.name || "this agency"}&rdquo;</strong> workspace
                  has been {isBlacklisted ? "blacklisted" : "disabled"} by the platform administrator.
                </p>
              </div>
            </div>

            {/* Info bullets */}
            <div className="bg-black/30 border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center pb-2 border-b border-white/[0.05]">
                What this means
              </p>
              <div className="space-y-2.5">
                {bullets.map((line, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs text-slate-400 font-medium">
                    <div className={`w-1.5 h-1.5 rounded-full ${dotColor} mt-1.5 shrink-0`} />
                    {line}
                  </div>
                ))}
              </div>
            </div>

            {/* Contact support */}
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 text-center">
                Contact Support
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch w-full">
                <button
                  onClick={() => setShowHelpdesk(true)}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 text-xs font-bold text-white hover:text-white bg-indigo-650 hover:bg-indigo-755 border border-indigo-500/30 px-5 py-2.5 rounded-xl transition-all cursor-pointer border-0 shadow-md shadow-indigo-600/10"
                >
                  <LifeBuoy className="w-3.5 h-3.5" />
                  Open Support Ticket Helpdesk
                </button>
                
                <a
                  href="mailto:support@talentum.app"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 text-xs font-bold text-indigo-300 hover:text-white bg-indigo-500/15 hover:bg-indigo-500/30 border border-indigo-500/20 px-5 py-2.5 rounded-xl transition-all"
                >
                  <Mail className="w-3.5 h-3.5" />
                  support@talentum.app
                </a>
              </div>
            </div>

            {/* Footer: user info + sign out */}
            <div className="border-t border-white/[0.06] pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              {user && (
                <p className="text-[11px] font-medium text-slate-500 text-center sm:text-left break-all max-w-full">
                  Signed in as{" "}
                  <span className="text-slate-400 font-mono block sm:inline">{user.email}</span>
                </p>
              )}
              <button
                onClick={() => signOut(auth)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 text-xs sm:text-sm font-bold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/40 px-4 py-2 sm:py-2.5 rounded-xl transition-all shrink-0"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>

          {/* Watermark */}
          <p className="text-center text-[10px] font-bold text-slate-700 mt-6 tracking-[0.2em] uppercase">
            Talentum · {statusLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
