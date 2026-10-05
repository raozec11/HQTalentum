"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
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
  Loader2, 
  MessageSquare, 
  Clock, 
  CheckCircle, 
  ArrowLeft,
  Send,
  User,
  Building2,
  Filter,
  Search,
  Check,
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

const CATEGORIES = [
  "Billing & Subscription",
  "Technical Issue",
  "Feature Request",
  "Booking & Talent Issue",
  "Other"
];

const STATUS_OPTIONS: SupportTicket["status"][] = ["Pending", "In Progress", "Resolved", "Closed"];

export default function MasterSupportPage() {
  const { user } = useAuth();
  
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showDetailMobile, setShowDetailMobile] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Form state for reply
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  // Fetch all tickets in realtime
  useEffect(() => {
    const q = query(
      collection(db, "support_tickets")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsData: SupportTicket[] = [];
      snapshot.forEach((doc) => {
        ticketsData.push({ id: doc.id, ...doc.data() } as SupportTicket);
      });
      // Sort client-side
      ticketsData.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setTickets(ticketsData);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching support tickets for master:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !user || !replyText.trim()) return;

    setSubmittingReply(true);
    try {
      const newReplyObj: TicketReply = {
        authorName: user.name || "Platform Support",
        authorEmail: user.email || "",
        role: "platform_admin",
        message: replyText.trim(),
        createdAt: new Date().toISOString()
      };

      const ticketRef = doc(db, "support_tickets", selectedTicket.id);
      
      // Update status to "In Progress" automatically when admin replies
      const newStatus = selectedTicket.status === "Pending" ? "In Progress" : selectedTicket.status;

      await updateDoc(ticketRef, {
        replies: arrayUnion(newReplyObj),
        updatedAt: new Date().toISOString(),
        status: newStatus
      });

      setReplyText("");
    } catch (err) {
      console.error(err);
      showError("Failed to send reply message.");
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleUpdateStatus = async (ticketId: string, newStatus: SupportTicket["status"]) => {
    try {
      const ticketRef = doc(db, "support_tickets", ticketId);
      await updateDoc(ticketRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      showSuccess(`Ticket status updated to ${newStatus}.`);
    } catch (err) {
      console.error(err);
      showError("Failed to update status.");
    }
  };

  const getStatusBadge = (status: SupportTicket["status"]) => {
    switch (status) {
      case "Pending":
        return <span className="bg-amber-500/10 text-amber-500 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Pending</span>;
      case "In Progress":
        return <span className="bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">In Progress</span>;
      case "Resolved":
        return <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Resolved</span>;
      case "Closed":
        return <span className="bg-slate-500/10 text-slate-400 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Closed</span>;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "Urgent":
        return "text-rose-455 font-extrabold";
      case "High":
        return "text-orange-400 font-bold";
      case "Medium":
        return "text-blue-400 font-medium";
      default:
        return "text-slate-400 font-medium";
    }
  };

  // Filter logic
  const filteredTickets = tickets.filter(t => {
    const matchesStatus = statusFilter === "All" || t.status === statusFilter;
    const matchesCategory = categoryFilter === "All" || t.category === categoryFilter;
    
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch = !term || 
      t.subject.toLowerCase().includes(term) ||
      t.companyName.toLowerCase().includes(term) ||
      t.creatorName.toLowerCase().includes(term) ||
      t.creatorEmail.toLowerCase().includes(term);

    return matchesStatus && matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <LifeBuoy className="w-8 h-8 text-indigo-600" />
          Master Helpdesk Support
        </h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Review, assign, reply, and update support tickets submitted by all client companies.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-[24px] border border-slate-100 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
          <Filter className="w-3.5 h-3.5" /> Filters
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by subject, company, email..."
              className="pl-10 h-11 bg-slate-50 border-slate-100 rounded-xl focus:bg-white text-xs sm:text-sm"
            />
          </div>

          <div className="flex flex-col space-y-1">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-11 rounded-xl bg-slate-50 border border-slate-100 focus:border-indigo-500 px-3 text-xs sm:text-sm font-semibold text-slate-600 outline-none"
            >
              <option value="All">All Statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col space-y-1">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-11 rounded-xl bg-slate-50 border border-slate-100 focus:border-indigo-500 px-3 text-xs sm:text-sm font-semibold text-slate-600 outline-none"
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
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
          <h3 className="text-lg font-bold text-slate-800">No Support Tickets</h3>
          <p className="text-slate-500 text-sm font-medium">
            There are no support tickets in the database. When client companies submit help requests, they will show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* List panel */}
          <div className={`lg:col-span-5 flex flex-col space-y-3 ${showDetailMobile ? "hidden lg:flex" : "flex"}`}>
            <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-4 overflow-y-auto max-h-[650px] space-y-3 no-scrollbar">
              <div className="flex items-center justify-between px-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Tickets ({filteredTickets.length})</p>
                {filteredTickets.length !== tickets.length && (
                  <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md">Filtered</span>
                )}
              </div>
              
              <div className="space-y-2">
                {filteredTickets.map((t) => {
                  const isSelected = t.id === selectedTicketId;
                  const formattedDate = new Date(t.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short"
                  });

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTicketId(t.id);
                        setShowDetailMobile(true);
                      }}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer text-left space-y-3 ${
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
                        <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-bold">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="line-clamp-1">{t.companyName}</span>
                        </div>
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

          {/* Detail Panel */}
          <div className={`lg:col-span-7 flex flex-col h-full min-h-[500px] ${!showDetailMobile ? "hidden lg:flex" : "flex"}`}>
            {selectedTicket ? (
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm flex flex-col h-full max-h-[650px] overflow-hidden">
                
                {/* Detail Header */}
                <div className="p-4 sm:p-5 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/40 shrink-0">
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
                  
                  {/* Status Dropdown Picker */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Update Status:</span>
                    <select
                      value={selectedTicket.status}
                      onChange={(e) => handleUpdateStatus(selectedTicket.id, e.target.value as any)}
                      className="h-8.5 rounded-lg bg-white border border-slate-200 focus:border-indigo-500 px-2.5 text-xs font-bold text-slate-700 outline-none"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Conversation Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 no-scrollbar">
                  
                  {/* Company Info */}
                  <div className="bg-indigo-50/25 border border-indigo-50/50 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-4 border-b border-indigo-500/10 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-indigo-600" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">{selectedTicket.companyName}</p>
                          <p className="text-[10px] text-slate-400 font-medium">Company Workspace ID: {selectedTicket.companyId}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs uppercase">
                          {selectedTicket.creatorName[0]}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-700">{selectedTicket.creatorName}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{selectedTicket.creatorEmail}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {new Date(selectedTicket.createdAt).toLocaleDateString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 whitespace-pre-wrap leading-relaxed font-medium pl-9 pt-1">
                      {selectedTicket.description}
                    </p>
                  </div>

                  {/* Conversation Replies */}
                  <div className="space-y-4">
                    {selectedTicket.replies && selectedTicket.replies.length > 0 ? (
                      selectedTicket.replies.map((reply, index) => {
                        const isMasterAdmin = reply.role === "platform_admin";
                        return (
                          <div 
                            key={index} 
                            className={`flex flex-col space-y-1.5 ${isMasterAdmin ? "items-end" : "items-start"}`}
                          >
                            <div className={`max-w-[85%] rounded-2xl p-4 text-left ${
                              isMasterAdmin 
                                ? "bg-indigo-600 text-white rounded-tr-none" 
                                : "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/50"
                            }`}>
                              <div className="flex items-center gap-2 mb-1.5">
                                {isMasterAdmin ? (
                                  <Shield className="w-3.5 h-3.5 text-indigo-250 shrink-0" />
                                ) : (
                                  <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                )}
                                <span className={`text-[10px] font-bold ${isMasterAdmin ? "text-indigo-150" : "text-slate-600"}`}>
                                  {isMasterAdmin ? "You (Platform Support)" : reply.authorName}
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
                        <p className="text-xs font-bold">No Reply Messages Yet</p>
                        <p className="text-[10px]">Send a reply message to update the company admin.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reply Form */}
                <form onSubmit={handleSendReply} className="p-4 border-t border-slate-50 bg-slate-50/20 flex gap-2 shrink-0">
                  <Input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write support reply..."
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

              </div>
            ) : (
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm flex-1 flex flex-col items-center justify-center text-center p-8">
                <HelpCircle className="w-12 h-12 text-slate-300 animate-pulse mb-3" />
                <h4 className="font-bold text-slate-700 text-base">Select a Ticket</h4>
                <p className="text-slate-400 text-xs font-medium max-w-xs mx-auto mt-1">
                  Select a support ticket from the list on the left to read history, update resolution progress, and respond back.
                </p>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
