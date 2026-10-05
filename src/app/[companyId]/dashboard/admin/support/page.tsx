"use client";

import { useState, useEffect } from "react";
import { useCompany } from "@/context/CompanyContext";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc, 
  arrayUnion 
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { showSuccess, showError } from "@/lib/alerts";
import { 
  LifeBuoy, 
  Plus, 
  Loader2, 
  MessageSquare, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  ArrowLeft,
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
  createdAt: any; // ISO string or Timestamp
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

export default function SupportPage() {
  const { companyData } = useCompany();
  const { user } = useAuth();
  
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showDetailMobile, setShowDetailMobile] = useState(false);

  // Form states for new ticket
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("Technical Issue");
  const [priority, setPriority] = useState("Medium");
  const [description, setDescription] = useState("");
  const [submittingTicket, setSubmittingTicket] = useState(false);

  // Form state for reply
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  // Fetch tickets in realtime
  useEffect(() => {
    if (!companyData?.id) return;

    const q = query(
      collection(db, "support_tickets"),
      where("companyId", "==", companyData.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsData: SupportTicket[] = [];
      snapshot.forEach((doc) => {
        ticketsData.push({ id: doc.id, ...doc.data() } as SupportTicket);
      });
      // Sort client-side to avoid Firestore composite index requirement
      ticketsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTickets(ticketsData);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching support tickets:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [companyData?.id]);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyData || !user) return;
    if (!subject.trim() || !description.trim()) {
      showError("Please fill out subject and description.");
      return;
    }

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
      
      // Reset form
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
        // Automatically reopen if closed/resolved when client replies
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

  const handleCloseTicket = async (ticketId: string) => {
    try {
      const ticketRef = doc(db, "support_tickets", ticketId);
      await updateDoc(ticketRef, {
        status: "Closed",
        updatedAt: new Date().toISOString()
      });
      showSuccess("Ticket marked as Closed.");
    } catch (err) {
      console.error(err);
      showError("Failed to close ticket.");
    }
  };

  const getStatusBadge = (status: SupportTicket["status"]) => {
    switch (status) {
      case "Pending":
        return <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Pending</span>;
      case "In Progress":
        return <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">In Progress</span>;
      case "Resolved":
        return <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Resolved</span>;
      case "Closed":
        return <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Closed</span>;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "Urgent":
        return "text-rose-500 font-extrabold";
      case "High":
        return "text-orange-500 font-bold";
      case "Medium":
        return "text-blue-500 font-medium";
      default:
        return "text-slate-400 font-medium";
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-2 sm:p-4 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <LifeBuoy className="w-8 h-8 text-indigo-600" />
            Support Helpdesk
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Need help? Generate a support ticket and our platform administrators will resolve it.
          </p>
        </div>
        <Button 
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 px-5 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/10"
        >
          <Plus className="w-4 h-4" />
          Create Support Ticket
        </Button>
      </div>

      {loading ? (
        <div className="h-96 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center max-w-md mx-auto space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto">
            <HelpCircle className="w-8 h-8 text-indigo-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">No Support Tickets Yet</h3>
          <p className="text-slate-500 text-sm font-medium">
            Whenever you have queries or issues, create a support ticket to get assistance.
          </p>
          <Button 
            onClick={() => setIsCreateModalOpen(true)}
            variant="outline"
            className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold"
          >
            Create Your First Ticket
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Ticket List View */}
          <div className={`lg:col-span-5 flex flex-col space-y-3 ${showDetailMobile ? "hidden lg:flex" : "flex"}`}>
            <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-4 overflow-y-auto max-h-[650px] space-y-3 no-scrollbar">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2">Your Tickets ({tickets.length})</p>
              
              <div className="space-y-2">
                {tickets.map((t) => {
                  const isSelected = t.id === selectedTicketId;
                  const formattedDate = new Date(t.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "2-digit"
                  });

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTicketId(t.id);
                        setShowDetailMobile(true);
                      }}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer text-left space-y-3.5 ${
                        isSelected 
                          ? "bg-indigo-50/40 border-indigo-250 shadow-sm ring-1 ring-indigo-500/10" 
                          : "bg-white hover:bg-slate-50 border-slate-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-slate-400 text-[11px] font-bold font-mono">#{t.id.slice(-6).toUpperCase()}</span>
                        {getStatusBadge(t.status)}
                      </div>
                      
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-800 text-sm sm:text-base line-clamp-1">{t.subject}</h4>
                        <p className="text-xs text-slate-500 font-medium">{t.category}</p>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 border-t border-slate-50 pt-2.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-300" />
                          {formattedDate}
                        </span>
                        <span className="flex items-center gap-1.5">
                          Priority: <strong className={getPriorityColor(t.priority)}>{t.priority}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Ticket Detail & Chat View */}
          <div className={`lg:col-span-7 flex flex-col h-full min-h-[500px] ${!showDetailMobile ? "hidden lg:flex" : "flex"}`}>
            {selectedTicket ? (
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm flex flex-col h-full max-h-[650px] overflow-hidden">
                
                {/* Detail Header */}
                <div className="p-4 sm:p-5 border-b border-slate-50 flex items-center justify-between gap-4 bg-slate-50/40 shrink-0">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setShowDetailMobile(false)}
                      className="lg:hidden p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-xs font-bold font-mono">#{selectedTicket.id.slice(-6).toUpperCase()}</span>
                        {getStatusBadge(selectedTicket.status)}
                      </div>
                      <h3 className="font-bold text-slate-800 text-base sm:text-lg mt-0.5 line-clamp-1">{selectedTicket.subject}</h3>
                    </div>
                  </div>
                  
                  {selectedTicket.status !== "Closed" && (
                    <Button
                      onClick={() => handleCloseTicket(selectedTicket.id)}
                      variant="outline"
                      className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 border-slate-200 text-xs font-bold px-3.5 py-1.5 h-8.5 rounded-lg shrink-0"
                    >
                      Close Ticket
                    </Button>
                  )}
                </div>

                {/* Messages Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 no-scrollbar">
                  
                  {/* Original Description */}
                  <div className="bg-indigo-50/25 border border-indigo-50/50 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs uppercase">
                          {selectedTicket.creatorName[0]}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-700">{selectedTicket.creatorName}</p>
                          <p className="text-[10px] text-slate-400 font-medium">Ticket Creator</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {new Date(selectedTicket.createdAt).toLocaleDateString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 whitespace-pre-wrap leading-relaxed font-medium pl-9">
                      {selectedTicket.description}
                    </p>
                  </div>

                  {/* Replies */}
                  <div className="space-y-4">
                    {selectedTicket.replies && selectedTicket.replies.length > 0 ? (
                      selectedTicket.replies.map((reply, index) => {
                        const isMasterAdmin = reply.role === "platform_admin";
                        return (
                          <div 
                            key={index} 
                            className={`flex flex-col space-y-1.5 ${isMasterAdmin ? "items-start" : "items-end"}`}
                          >
                            <div className={`max-w-[85%] rounded-2xl p-4 text-left ${
                              isMasterAdmin 
                                ? "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/50" 
                                : "bg-indigo-600 text-white rounded-tr-none"
                            }`}>
                              <div className="flex items-center gap-2 mb-1.5">
                                {isMasterAdmin ? (
                                  <Shield className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                ) : (
                                  <User className="w-3.5 h-3.5 text-indigo-250 shrink-0" />
                                )}
                                <span className={`text-[10px] font-bold ${isMasterAdmin ? "text-slate-600" : "text-indigo-150"}`}>
                                  {isMasterAdmin ? "Platform Support" : reply.authorName}
                                </span>
                              </div>
                              <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-medium">
                                {reply.message}
                              </p>
                            </div>
                            <span className="text-[9px] text-slate-400 font-medium px-2">
                              {new Date(reply.createdAt).toLocaleDateString("en-GB", {
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-6 text-slate-400 space-y-1">
                        <MessageSquare className="w-6 h-6 mx-auto opacity-40 text-slate-500" />
                        <p className="text-xs font-bold">No Messages Yet</p>
                        <p className="text-[10px]">Awaiting support review or write a reply.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reply Form */}
                {selectedTicket.status !== "Closed" ? (
                  <form onSubmit={handleSendReply} className="p-4 border-t border-slate-50 bg-slate-50/20 flex gap-2 shrink-0">
                    <Input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Write your response..."
                      className="flex-1 rounded-xl bg-white border-slate-200 text-xs sm:text-sm h-11"
                      disabled={submittingReply}
                    />
                    <Button
                      type="submit"
                      disabled={submittingReply || !replyText.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 w-11 p-0 rounded-xl shrink-0 flex items-center justify-center"
                    >
                      {submittingReply ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </form>
                ) : (
                  <div className="p-4 border-t border-slate-50 bg-slate-100/35 text-center text-xs text-slate-500 font-bold shrink-0">
                    This ticket is Closed. You can reopen it by creating a new message, but we recommend creating a new ticket instead if you have a new issue.
                  </div>
                )}

              </div>
            ) : (
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm flex-1 flex flex-col items-center justify-center text-center p-8">
                <HelpCircle className="w-12 h-12 text-slate-300 animate-pulse mb-3" />
                <h4 className="font-bold text-slate-700 text-base">Select a Ticket</h4>
                <p className="text-slate-400 text-xs font-medium max-w-xs mx-auto mt-1">
                  Click on any ticket in the list on the left to view conversation history, check resolution updates, or send replies.
                </p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Create Ticket Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl border border-slate-100 p-6 sm:p-8 space-y-6 animate-in scale-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <h3 className="font-black text-slate-900 text-lg sm:text-xl flex items-center gap-2">
                <LifeBuoy className="w-6 h-6 text-indigo-600" />
                New Support Ticket
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg hover:bg-slate-100 transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4">
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 px-0.5 uppercase tracking-wider">Subject</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Stripe checkout fails with 402 error"
                  className="h-11 rounded-xl bg-slate-50 border-slate-100 focus:bg-white text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 px-0.5 uppercase tracking-wider">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-11 rounded-xl bg-slate-50 border border-slate-100 focus:border-indigo-500 px-3 text-xs sm:text-sm font-medium text-slate-700 outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 px-0.5 uppercase tracking-wider">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full h-11 rounded-xl bg-slate-50 border border-slate-100 focus:border-indigo-500 px-3 text-xs sm:text-sm font-medium text-slate-700 outline-none"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 px-0.5 uppercase tracking-wider">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detail the issue or help request here. Include details about how to reproduce it if technical."
                  className="rounded-xl bg-slate-50 border-slate-100 focus:bg-white text-sm min-h-[120px]"
                  required
                />
              </div>

              <div className="pt-4 border-t border-slate-50 flex items-center justify-end gap-3 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl font-bold border-slate-200 text-xs sm:text-sm"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all active:scale-[0.98] text-xs sm:text-sm"
                  disabled={submittingTicket}
                >
                  {submittingTicket ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Submit Ticket"
                  )}
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
