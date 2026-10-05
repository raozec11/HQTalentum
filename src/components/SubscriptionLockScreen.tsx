"use client";

import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { 
  Lock, 
  CreditCard, 
  Loader2, 
  ShieldCheck, 
  LogOut, 
  LifeBuoy, 
  ArrowLeft, 
  Plus, 
  MessageSquare, 
  Clock, 
  Send, 
  User, 
  Shield, 
  HelpCircle 
} from "lucide-react";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc, 
  arrayUnion,
  getDocs,
  orderBy
} from "firebase/firestore";
import { showError, showSuccess } from "@/lib/alerts";
import { useAuth } from "@/context/AuthContext";

const PLAN_DEFAULTS = {
  starter: { id: "starter", name: "Starter", price: 49 },
  professional: { id: "professional", name: "Professional", price: 99 },
  enterprise: { id: "enterprise", name: "Enterprise", price: 199 }
};

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

const CATEGORIES = [
  "Billing & Subscription",
  "Technical Issue",
  "Feature Request",
  "Booking & Talent Issue",
  "Other"
];

const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

interface SubscriptionLockScreenProps {
  companyData: any;
}

export default function SubscriptionLockScreen({ companyData }: SubscriptionLockScreenProps) {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<"starter" | "professional" | "enterprise">("starter");
  const [processing, setProcessing] = useState(false);
  const [plans, setPlans] = useState<any[]>(Object.values(PLAN_DEFAULTS));

  useEffect(() => {
    async function fetchPlans() {
      try {
        const snap = await getDocs(
          query(collection(db, "subscriptionPlans"), orderBy("order", "asc"))
        );
        if (!snap.empty) {
          const loaded: any[] = [];
          snap.forEach(d => {
            const data = d.data();
            const planId = (data.name || "").toLowerCase();
            loaded.push({
              id: planId,
              name: data.name,
              price: data.price
            });
          });
          setPlans(loaded);
        }
      } catch (err) {
        console.error("Failed to load plans in SubscriptionLockScreen:", err);
      }
    }
    fetchPlans();
  }, []);

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

  useEffect(() => {
    if (companyData?.selectedPlan) {
      setSelectedPlan(companyData.selectedPlan.toLowerCase() as any);
    }
  }, [companyData?.selectedPlan]);

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
      console.error("Error fetching support tickets in subscription screen:", err);
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
      showSuccess("Support ticket created successfully!");
      
      setSubject("");
      setCategory("Technical Issue");
      setPriority("Medium");
      setDescription("");
      setIsCreateModalOpen(false);
    } catch (err) {
      console.error(err);
      showError("Failed to create support ticket.");
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
      showError("Failed to send message.");
    } finally {
      setSubmittingReply(false);
    }
  };

  // Calculate pricing (supporting custom pricing offers if active)
  const hasCustomPrice = companyData?.customPrice !== undefined && companyData?.customPrice !== null;
  const activePlanId = hasCustomPrice ? (companyData?.selectedPlan || "starter") : selectedPlan;
  const planInfo = plans.find(p => p.id === activePlanId) || plans.find(p => p.id === "starter") || PLAN_DEFAULTS.starter;
  const price = hasCustomPrice ? companyData.customPrice : planInfo.price;
  const period = hasCustomPrice ? (companyData.customPricePeriod === "lifetime" ? "Lifetime" : companyData.customPricePeriod || "month") : "month";

  const handlePayNow = async () => {
    if (!companyData?.id) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/stripe/subscription-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: companyData.id,
          planId: activePlanId
        })
      });

      const data = await res.json();
      if (res.ok && data.freeActivated) {
        showSuccess("Workspace subscription activated successfully!");
        window.location.reload();
        return;
      }

      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        showError(data.error || "Failed to initiate payment session. Please try again.");
      }
    } catch (err) {
      console.error(err);
      showError("Failed to connect to payment gateway.");
    } finally {
      setProcessing(false);
    }
  };

  // Determine if the logged-in user is an admin
  const isAdmin = user && (
    user.role === "admin" || 
    user.role === "company_admin" || 
    user.role === "staff" || 
    user.role === "platform_admin"
  );

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

  // Render Helpdesk View
  if (showHelpdesk) {
    return (
      <div className="fixed inset-0 z-[99999] bg-[#09090b] overflow-y-auto font-sans">
        <div className="absolute top-1/4 left-1/4 w-[250px] sm:w-[500px] h-[250px] sm:h-[500px] bg-rose-500/10 rounded-full blur-[80px] sm:blur-[140px] pointer-events-none" />
        <div className="absolute bottom-1/3 right-1/4 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] bg-indigo-500/5 rounded-full blur-[60px] sm:blur-[120px] pointer-events-none" />
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
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer border-0 bg-transparent"
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
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 border-0"
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
                  Create a support ticket below to describe your billing issues or subscription questions.
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="bg-white/10 hover:bg-white/15 text-white border border-white/10 rounded-xl px-4 py-2 font-bold text-xs transition-all cursor-pointer border-0"
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
                            className="md:hidden p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 border-0 bg-transparent cursor-pointer"
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
                    placeholder="e.g. Stripe checkout fails with 402 error"
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

  // If the user is NOT an admin, render the workspace suspended screen with sign out option
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-[99999] bg-[#09090b] overflow-y-auto font-sans">
        {/* Sleek background details */}
        <div className="absolute top-1/4 left-1/4 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] bg-rose-500/10 rounded-full blur-[80px] sm:blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[250px] sm:w-[500px] h-[250px] sm:h-[500px] bg-indigo-500/5 rounded-full blur-[100px] sm:blur-[150px] pointer-events-none"></div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none"></div>

        <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-6">
          <div className="relative z-10 w-full max-w-md bg-white/[0.03] backdrop-blur-[40px] border border-white/10 rounded-3xl sm:rounded-[32px] p-5 sm:p-10 shadow-2xl text-center space-y-6 sm:space-y-8">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-rose-500/10 rounded-[20px] sm:rounded-[24px] flex items-center justify-center border border-rose-500/20 shadow-[0_0_40px_rgba(239,68,68,0.15)]">
              <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-rose-500 animate-pulse" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Workspace Suspended</h1>
              <p className="text-indigo-400 text-[10px] sm:text-xs font-black uppercase tracking-widest">Action Required By Administrator</p>
            </div>

            <p className="text-slate-400 text-xs sm:text-[14px] leading-relaxed max-w-xs mx-auto font-medium">
              The workspace for <strong className="text-white">"{companyData?.name || "this agency"}"</strong> is temporarily suspended due to an outstanding subscription balance.
            </p>
            
            <div className="p-4 sm:p-5 bg-black/40 rounded-2xl border border-white/5 text-[11px] sm:text-[12px] text-slate-400 text-left space-y-2.5">
              <p className="font-bold text-slate-300 text-center pb-2 border-b border-white/5">Suspension Notice</p>
              <p>• The free trial period or active billing cycle has ended.</p>
              <p>• An authorized workspace administrator must log in and submit the payment to restore immediate access.</p>
            </div>

            <div className="flex flex-col gap-3 pt-2 w-full">
              <button
                onClick={() => signOut(auth)}
                className="w-full h-12 bg-white hover:bg-slate-100 text-[#09090b] font-bold text-xs sm:text-[14px] rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer shadow-[0_8px_20px_rgba(255,255,255,0.05)] border-0"
              >
                <LogOut className="w-4 h-4" /> Sign Out & Return
              </button>
              {user && (
                <p className="text-[10px] font-semibold text-slate-500 break-all px-2">
                  Logged in as: <span className="text-slate-400 font-mono">{user.email}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Admin lock screen view with Stripe Checkout trigger
  return (
    <div className="fixed inset-0 z-[99999] bg-[#09090b] overflow-y-auto font-sans">
      <div className="absolute top-[10%] left-[20%] w-[250px] sm:w-[500px] h-[250px] sm:h-[500px] bg-indigo-600/10 rounded-full blur-[80px] sm:blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[10%] right-[20%] w-[300px] sm:w-[600px] h-[300px] sm:h-[600px] bg-emerald-600/5 rounded-full blur-[100px] sm:blur-[150px] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none"></div>

      <div className="min-h-full flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 relative z-10 my-4 sm:my-8">
          
          {/* Left column: Padlock lock info and plan choice */}
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6 text-white pr-0 lg:pr-6">
            <div className="flex items-center gap-3">
              <div className="bg-rose-500/10 p-3.5 rounded-[20px] border border-rose-500/20 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
                <Lock className="w-6 h-6 sm:w-8 sm:h-8 text-rose-500 animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight">Workspace Suspended</h1>
                <p className="text-slate-400 text-[10px] sm:text-xs font-black uppercase tracking-widest mt-0.5">Subscription Action Required</p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-[24px] p-5 space-y-3 backdrop-blur-md">
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                Your free trial for <strong className="text-white">"{companyData?.name}"</strong> ended on{" "}
                <strong className="text-rose-400">
                  {companyData?.trialEndDate 
                    ? (companyData.trialEndDate.toDate ? companyData.trialEndDate.toDate() : new Date(companyData.trialEndDate)).toLocaleDateString("en-GB")
                    : "N/A"
                  }
                </strong>.
              </p>
              <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed font-medium">
                Please choose a plan and submit the payment via Stripe to restore full workspace capabilities immediately.
              </p>
            </div>

            {!hasCustomPrice ? (
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Select Subscription Plan</label>
                <div className="grid grid-cols-3 gap-3">
                  {plans.map((p) => (
                    <div 
                      key={p.id}
                      onClick={() => setSelectedPlan(p.id as any)}
                      className={`cursor-pointer border rounded-2xl p-3 sm:p-4 text-center transition-all duration-300 flex flex-col justify-between h-24 sm:h-28 relative overflow-hidden ${
                        selectedPlan === p.id 
                          ? "border-indigo-500 bg-indigo-500/15 shadow-[0_0_20px_rgba(99,102,241,0.15)]" 
                          : "border-white/10 hover:border-white/20 bg-white/5"
                      }`}
                    >
                      {selectedPlan === p.id && (
                        <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500" />
                      )}
                      <span className="text-[10px] sm:text-xs font-bold text-slate-300">{p.name}</span>
                      <div>
                        <span className="text-base sm:text-lg font-black text-white">${p.price}</span>
                        <span className="text-[9px] sm:text-[10px] text-slate-500 block mt-0.5">/mo</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-indigo-955/20 border border-indigo-500/30 rounded-[24px] p-5 space-y-2">
                <span className="text-xs font-black uppercase text-indigo-400 tracking-wider">Custom Offer Applied</span>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-bold text-slate-400">Custom Price Rate</span>
                  <span className="text-2xl font-black text-emerald-400">
                    ${companyData.customPrice} <span className="text-xs text-slate-500 font-medium">/{period}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  You will be charged the discounted custom pricing offer immediately.
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-[10px] sm:text-xs text-slate-500 break-all text-center sm:text-left">Logged in as: <strong className="text-slate-400">{user?.email}</strong></span>
              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                <button
                  onClick={() => setShowHelpdesk(true)}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-350 transition-colors bg-transparent border-0 cursor-pointer flex items-center gap-1.5"
                >
                  <LifeBuoy className="w-3.5 h-3.5" />
                  Support Helpdesk
                </button>
                <button 
                  onClick={() => signOut(auth)}
                  className="text-xs font-bold text-rose-455 hover:text-rose-400 transition-colors bg-transparent border-0 cursor-pointer flex items-center gap-1.5"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Right column: Secure Checkout Trigger Card */}
          <div className="lg:col-span-6 bg-white/[0.03] border border-white/10 rounded-3xl sm:rounded-[36px] p-5 sm:p-8 shadow-2xl flex flex-col justify-center space-y-5 sm:space-y-6 backdrop-blur-xl">
            <div className="flex items-center gap-3 pb-4 border-b border-white/5">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shrink-0">
                <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-sm sm:text-base">Checkout securely with Stripe</h3>
                <p className="text-slate-400 text-[10px] sm:text-xs font-medium">Card information is never stored locally.</p>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 text-[11px] sm:text-xs text-slate-400 space-y-2">
              <div className="flex justify-between">
                <span>Target Plan:</span>
                <span className="text-white font-bold capitalize">{activePlanId} Plan</span>
              </div>
              <div className="flex justify-between">
                <span>Billing Interval:</span>
                <span className="text-white font-bold capitalize">{period}ly</span>
              </div>
              <div className="flex justify-between">
                <span>Total Due Now:</span>
                <span className="text-emerald-400 font-bold">${price}</span>
              </div>
            </div>

            <button 
              onClick={handlePayNow}
              disabled={processing}
              className="w-full h-12 sm:h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer border-0 shadow-indigo-500/15"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> {Number(price) <= 0 ? "Activating Workspace..." : "Creating Payment Session..."}
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" /> {Number(price) <= 0 ? "Activate Workspace ($0) & Unlock" : `Pay Now ($${price}) & Unlock`}
                </>
              )}
            </button>

            <p className="text-[9px] sm:text-[10px] text-slate-500 text-center font-medium leading-relaxed">
              {Number(price) <= 0 
                ? "Upon clicking Activate, your workspace subscription will be extended and unlocked immediately." 
                : "Upon clicking Pay Now, you will be redirected to the secure Stripe Checkout portal to complete your transaction. Once processed, you will return here and your workspace will be unlocked automatically."
              }
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
