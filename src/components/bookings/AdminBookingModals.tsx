"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  addDoc,
  deleteDoc
} from "firebase/firestore";
import {
  Calendar,
  Loader2,
  Eye,
  User,
  Mail,
  Briefcase,
  X,
  Phone,
  MapPin,
  Clock,
  Users,
  DollarSign,
  CheckCircle2,
  ChevronRight,
  FileText,
  Info,
  Search,
  History,
  Activity,
  Star,
  Trash2,
  RotateCcw,
  Edit3,
  Save,
  RefreshCw,
  UserX,
  XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showSuccess, showError, confirmAction } from "@/lib/alerts";
import { BookingChatButton } from "@/components/bookings/BookingChatButton";
import { LocationSearchInput } from "@/components/bookings/LocationSearchInput";
import { sendNotification, sendNotificationToTalents } from "@/lib/notifications";
import { EntityNotes } from "@/components/notes/EntityNotes";

function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

// ─── Booking Details Modal Component ──────────────────────────────────────────

export function BookingDetailsModal({
  booking,
  onSearch,
  onClose,
  talentsDict,
  setShowAssignModal,
  setManageTalentId,
  setShowActivityModal,
  fetchAllCompanyTalents,
  onApprovePayment,
  onDeclinePayment,
  onRateClient,
  userId,
  onChat,
  isMaster = false,
  onBookingUpdated,
  onBookingDeleted
}: {
  booking: any;
  onSearch?: (val: string) => void;
  onClose: () => void;
  talentsDict: Record<string, any>;
  setShowAssignModal: (v: boolean) => void;
  setManageTalentId: (v: string | null) => void;
  setShowActivityModal: (v: boolean) => void;
  fetchAllCompanyTalents: () => void;
  onApprovePayment: (b: any) => void;
  onDeclinePayment: (b: any, r: string) => void;
  onRateClient?: () => void;
  userId: string;
  onChat: () => void;
  isMaster?: boolean;
  onBookingUpdated?: (b: any) => void;
  onBookingDeleted?: (bookingId: string) => void;
}) {
  const { user } = useAuth();
  const [currentBooking, setCurrentBooking] = useState(booking);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [localTalentsDict, setLocalTalentsDict] = useState<Record<string, any>>({});

  useEffect(() => {
    setCurrentBooking(booking);
  }, [booking]);

  const activeBooking = currentBooking || booking;

  useEffect(() => {
    let isMounted = true;
    async function fetchMissingTalents() {
      const assignedIds: string[] = activeBooking.selectedTalentIds ||
        (activeBooking.selectedTalentId ? [activeBooking.selectedTalentId] : (activeBooking.talentId ? [activeBooking.talentId] : []));
      const applicantIds: string[] = activeBooking.applicants || [];
      const neededIds = Array.from(new Set([...assignedIds, ...applicantIds])).filter(Boolean);

      const missing = neededIds.filter(id => !talentsDict?.[id]?.displayName && !localTalentsDict[id]?.displayName);
      if (missing.length === 0) return;

      const fetched: Record<string, any> = {};
      await Promise.all(
        missing.map(async (uid) => {
          try {
            const [uSnap, tSnap] = await Promise.all([
              getDoc(doc(db, "users", uid)),
              getDoc(doc(db, "talents", uid))
            ]);
            if (uSnap.exists() || tSnap.exists()) {
              const uD = uSnap.exists() ? uSnap.data() : {};
              const tD = tSnap.exists() ? tSnap.data() : {};
              fetched[uid] = {
                id: uid,
                ...uD,
                ...tD,
                displayName: tD.displayName || tD.name || uD.name || uD.displayName || uD.email || "Talent",
                profileImage: tD.profileImage || tD.photoUrl || uD.profileImage || uD.photoUrl || null,
                talentType: tD.talentType || "Performer",
                rating: tD.rating || uD.rating || null
              };
            }
          } catch (e) {
            console.error("Error fetching missing talent doc in modal:", e);
          }
        })
      );

      if (isMounted && Object.keys(fetched).length > 0) {
        setLocalTalentsDict(prev => ({ ...prev, ...fetched }));
      }
    }

    fetchMissingTalents();
    return () => { isMounted = false; };
  }, [activeBooking, talentsDict]);

  const effectiveTalentsDict = useMemo(() => {
    return { ...(talentsDict || {}), ...localTalentsDict };
  }, [talentsDict, localTalentsDict]);

  const handleConfirmCancel = async (reason: string) => {
    setCancelling(true);
    try {
      const bRef = doc(db, "bookings", activeBooking.id);
      const cancellerName = user?.displayName || user?.email || "Admin";
      const newActivity = {
        id: `act_${Date.now()}`,
        type: "cancelled",
        at: new Date().toISOString(),
        title: "Booking Cancelled",
        desc: `Cancelled by ${cancellerName}. Reason: ${reason}`,
        performedBy: cancellerName
      };

      const updated = {
        status: "Cancelled",
        cancelledAt: new Date().toISOString(),
        cancelledById: user?.uid || "",
        cancelledByName: cancellerName,
        cancelledByEmail: user?.email || "",
        cancellationReason: reason,
        updatedAt: new Date().toISOString(),
        activityLogs: arrayUnion(newActivity)
      };

      await updateDoc(bRef, updated);

      // Close chat session in Firestore and add system message
      try {
        const chatRef = doc(db, "chats", activeBooking.id);
        await setDoc(chatRef, {
          status: "Cancelled",
          isClosed: true,
          lastMessageText: "Booking has been cancelled by admin.",
          lastSenderId: "system",
          lastMessageAt: new Date().toISOString()
        }, { merge: true });

        await addDoc(collection(db, "chats", activeBooking.id, "messages"), {
          text: `Booking has been cancelled by ${cancellerName}. Chat session is now closed.`,
          senderId: "system",
          senderName: "System",
          senderRole: "system",
          createdAt: new Date().toISOString()
        });
      } catch (chatErr) {
        console.error("Failed to update chat doc on cancellation:", chatErr);
      }

      const assignedTalents: string[] = activeBooking.selectedTalentIds ||
        (activeBooking.selectedTalentId ? [activeBooking.selectedTalentId] : []);

      for (const tid of assignedTalents) {
        await sendNotification({
          userId: tid,
          companyId: activeBooking.companyId,
          title: "Booking Cancelled",
          message: `Booking #${activeBooking.id.slice(0, 8)} has been cancelled by admin. Reason: ${reason}`,
          type: "alert",
          link: `/${activeBooking.companyId}/dashboard/talent/bookings`
        });
      }

      showSuccess("Booking cancelled successfully.");
      const updatedObj = {
        ...activeBooking,
        ...updated,
        activityLogs: [...(activeBooking.activityLogs || []), newActivity]
      };
      setCurrentBooking(updatedObj);
      onBookingUpdated?.(updatedObj);
    } catch (err: any) {
      console.error("Failed to cancel booking:", err);
      showError(err.message || "Failed to cancel booking.");
    } finally {
      setCancelling(false);
      setShowCancelReasonModal(false);
    }
  };

  const handleCancelBooking = () => {
    setShowCancelReasonModal(true);
  };

  const handleDeleteBooking = async () => {
    const confirmed = await confirmAction(
      `Are you sure you want to permanently delete booking #${activeBooking.id.slice(0, 8)}?\n\nThis will remove the booking and cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, "bookings", activeBooking.id));
      showSuccess("Booking deleted successfully.");
      onBookingDeleted?.(activeBooking.id);
      onClose();
    } catch (err: any) {
      console.error("Failed to delete booking:", err);
      showError(err.message || "Failed to delete booking.");
    } finally {
      setDeleting(false);
    }
  };

  // Extract standard fields
  const getVal = (keys: string[]) => {
    for (const k of keys) if (activeBooking[k]) return activeBooking[k];
    return "";
  };

  const name = getVal(["clientName", "__clientName"]) || "Unknown Client";
  const email = getVal(["clientEmail", "__email"]);
  const phone = getVal(["clientNumber"]);
  const address = getVal(["address", "__address"]);
  const city = getVal(["city", "__city"]) || booking.city || "";
  const state = getVal(["state", "__state"]) || booking.state || "";
  const locationDetails = [address, city, state].filter(Boolean).join(", ");
  const date = getVal(["eventDate"]);
  const time = getVal(["eventTime"]);
  const duration = getVal(["duration"]);
  const jobType = getVal(["jobType", "__jobType"]);
  const gender = getVal(["gender", "__gender"]);
  const numEntertainers = getVal(["numEntertainers"]);
  const femaleGuests = getVal(["femaleGuests"]);
  const maleGuests = getVal(["maleGuests"]);
  const payRate = getVal(["payRate"]);
  const options = getVal(["options"]);
  const specialRequests = getVal(["specialRequests"]);
  const status = booking.status || "Inquiry";
  const createdAt = booking.createdAt ? new Date(booking.createdAt).toLocaleString() : "Unknown";

  // Custom fields
  const standardKeys = [
    "clientName", "__clientName", "clientNumber", "clientPhone", "__clientPhone",
    "clientEmail", "__email", "__clientEmail", "eventDate", "eventTime", "duration",
    "address", "__address", "city", "__city", "state", "__state", "location",
    "jobType", "__jobType", "gender", "__gender", "numEntertainers", "noOfEntertainers",
    "femaleGuests", "maleGuests", "payRate", "options", "__options", "specialRequests", "notes", "__notes",
    "status", "id", "companyId", "clientId", "createdAt", "updatedAt", "updated_at", "formMode",
    "talentId", "selectedTalentId", "applicants", "selectedTalentIds", "assignmentHistory", "assignedAt",
    "activityLogs", "activity_logs", "cancelledAt", "cancelledById", "cancelledByName", "cancelledByEmail",
    "cancellationReason", "cancelledReason", "cancelledBy", "cancelledRole", "cancelled_at", "cancelled_by_id",
    "paymentReceiptUrl", "receiptUploadedAt", "paymentMethod", "paymentStatus",
    "clientMarkedComplete", "talentMarkedComplete", "clientReviewed", "talentReviewed",
    "clientRatingForTalent", "clientCommentForTalent", "talentRatingForClient", "talentCommentForClient",
    "tipAmount", "tipPaymentMethod", "tipStatus", "clientInternallyRated", "paidAt", "declinedAt",
    "paymentDeclineReason", "customOffers", "checkoutSessionId", "stripePaymentIntentId",
    "clientEvaluation", "internalEvaluation", "declinedTalentIds", "declined_talent_ids", "declinedTalents"
  ];
  const customFields = Object.entries(booking).filter(([k, v]) => {
    if (standardKeys.includes(k) || k.startsWith("__")) return false;
    const lowerKey = k.toLowerCase();
    if (
      lowerKey.includes("cancel") ||
      lowerKey.includes("updated") ||
      lowerKey.includes("created") ||
      lowerKey.includes("activity") ||
      lowerKey.includes("history") ||
      lowerKey.includes("offer") ||
      lowerKey.includes("applicant") ||
      lowerKey.includes("receipt") ||
      lowerKey.includes("evaluation") ||
      lowerKey.includes("rating") ||
      lowerKey.includes("review") ||
      lowerKey.includes("stripe") ||
      lowerKey.includes("checkout") ||
      lowerKey.includes("declin")
    ) {
      return false;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) return false;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") return false;
    return true;
  });

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Determine pipeline step completion statically
  const assignedTalentIdsVal = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
  const hasTalent = assignedTalentIdsVal.length > 0;
  const isPaid = booking.paymentStatus === "Paid" || status.toLowerCase() === "confirmed" || status.toLowerCase() === "completed";
  const isAwaiting = booking.paymentStatus === "Awaiting Approval" || status.toLowerCase() === "awaiting approval";

  const STEPS = [
    { key: "Inquiry", label: "Inquiry", color: "#4f46e5", isDone: true, isActive: false },
    { key: "Pending", label: "Pending", color: "#6366f1", isDone: true, isActive: !hasTalent && !isPaid && !isAwaiting },
    { key: "Talent Assigned", label: "Talent Assigned", color: "#3b82f6", isDone: hasTalent, isActive: hasTalent && !isPaid && !isAwaiting },
    { key: "Pending Payment", label: isAwaiting ? "Awaiting Approval" : "Pending Payment", color: isAwaiting ? "#f97316" : "#0ea5e9", isDone: isPaid, isActive: isAwaiting },
    { key: "Confirmed", label: "Confirmed", color: "#2563eb", isDone: isPaid, isActive: isPaid && status.toLowerCase() !== "completed" },
    { key: "Completed", label: "Completed", color: "#1e3a8a", isDone: status.toLowerCase() === "completed", isActive: status.toLowerCase() === "completed" }
  ];

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      >
      <style>{`
        @keyframes bModalIn { from { opacity:0; transform:scale(0.98) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .bmodal-in { animation: bModalIn 0.22s cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>
      <div
        className="bmodal-in relative w-[96%] sm:max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Gradient Header - blue/indigo theme */}
        <div
          className="relative px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-blue-700 text-white shrink-0 pr-14 sm:pr-16"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Title & Status */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/10 flex items-center justify-center font-bold text-white shrink-0 border border-white/10">
                <FileText className="w-4 h-4 text-indigo-200" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-white font-extrabold text-base sm:text-lg leading-tight whitespace-nowrap">Booking Overview</h2>
                  <span
                    className="text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-white/15 text-white border border-white/10 whitespace-nowrap"
                  >
                    {isAwaiting ? "Pending Payment Approval" : status}
                  </span>
                </div>
                <p className="text-indigo-200/70 text-xs font-mono tracking-widest mt-0.5 truncate">#{booking.id.slice(0, 10).toUpperCase()}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
              <BookingChatButton
                bookingId={activeBooking.id}
                userId={userId}
                onClick={onChat}
                className="whitespace-nowrap bg-white/10 hover:bg-white/20 border-white/20 hover:border-white/30 text-white hover:text-indigo-200 h-8 sm:h-9 px-3 rounded-lg text-[11px] font-bold"
              />
              <button
                onClick={() => setShowActivityModal(true)}
                className="whitespace-nowrap flex items-center gap-1 px-2.5 sm:px-3 py-1.5 h-8 sm:h-9 rounded-lg text-[11px] font-bold text-white shadow-sm transition-all bg-white/10 hover:bg-white/20 border border-white/10 shrink-0"
              >
                <Activity className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Activity Log</span>
                <span className="sm:hidden">Activity</span>
              </button>
              {!isMaster && (
                <>
                  {status !== "Cancelled" && (
                    <>
                      <button
                        onClick={() => setShowEditModal(true)}
                        className="whitespace-nowrap flex items-center gap-1 px-2.5 sm:px-3 py-1.5 h-8 sm:h-9 rounded-lg text-[11px] font-bold text-white shadow-sm transition-all bg-white/15 hover:bg-white/25 border border-white/10 shrink-0"
                      >
                        <Edit3 className="w-3.5 h-3.5 shrink-0" />
                        <span>Edit</span>
                      </button>
                      <button
                        disabled={cancelling}
                        onClick={handleCancelBooking}
                        className="whitespace-nowrap flex items-center gap-1 px-2.5 sm:px-3 py-1.5 h-8 sm:h-9 rounded-lg text-[11px] font-bold text-amber-100 shadow-sm transition-all bg-amber-600/80 hover:bg-amber-600 border border-amber-400/30 shrink-0"
                        title="Cancel Booking"
                      >
                        {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                        <span>Cancel</span>
                      </button>
                    </>
                  )}
                  <button
                    disabled={deleting}
                    onClick={handleDeleteBooking}
                    className="whitespace-nowrap flex items-center gap-1 px-2.5 sm:px-3 py-1.5 h-8 sm:h-9 rounded-lg text-[11px] font-bold text-rose-100 shadow-sm transition-all bg-rose-600/80 hover:bg-rose-600 border border-rose-400/30 shrink-0"
                    title="Delete Booking"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Trash2 className="w-3.5 h-3.5 shrink-0" />}
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ALWAYS FIXED TOP-RIGHT CLOSE BUTTON */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/90 hover:text-white transition-colors z-10 shrink-0"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Stepper - dot + label per step */}
        <div className="px-3 sm:px-8 py-3.5 bg-white border-b border-slate-100 shrink-0 overflow-x-auto custom-scrollbar">
          <div className="flex items-start justify-between min-w-[320px] sm:min-w-0 gap-1">
            {STEPS.map((step, i) => {
              const isDone = step.isDone;
              const isCurrent = step.isActive;
              const dotColor = (isDone || isCurrent) ? step.color : "#cbd5e1";
              const labelColor = isCurrent ? step.color : isDone ? "#64748b" : "#94a3b8";

              // Compact labels for small screens
              const mobileLabel =
                step.key === "Talent Assigned" ? "Assigned" :
                step.key === "Pending Payment" ? (isAwaiting ? "Awaiting" : "Payment") :
                step.label;

              return (
                <div key={step.key} className="flex flex-col items-center flex-1 min-w-0 relative">
                  {/* Connector line before dot (except first) */}
                  {i > 0 && (
                    <div
                      className="absolute top-[13px] right-[50%] h-[2px] w-full"
                      style={{
                        left: "-50%",
                        right: "50%",
                        background: isDone ? step.color : "#e2e8f0",
                        zIndex: 0
                      }}
                    />
                  )}
                  {/* Dot */}
                  <div
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center shrink-0 relative z-10 shadow-sm transition-all"
                    style={{
                      background: isCurrent ? step.color : isDone ? step.color : "#f1f5f9",
                      border: `2px solid ${dotColor}`
                    }}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    ) : isCurrent ? (
                      <span className="w-2 h-2 rounded-full bg-white" />
                    ) : (
                      <span className="text-[9px] sm:text-[10px] font-black" style={{ color: "#94a3b8" }}>
                        {i + 1}
                      </span>
                    )}
                  </div>
                  {/* Label */}
                  <span
                    className="mt-1.5 text-center leading-tight font-black text-[9px] sm:text-[10px] uppercase tracking-wider px-0.5 max-w-[55px] sm:max-w-[80px]"
                    style={{ color: labelColor }}
                    title={step.label}
                  >
                    <span className="sm:hidden">{mobileLabel}</span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* CANCELLED BOOKING READ-ONLY BANNER */}
        {status === "Cancelled" && (
          <div className="px-4 sm:px-6 py-3 bg-rose-50 border-b border-rose-100 flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
              <XCircle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-rose-900 uppercase tracking-wider">Booking Cancelled</p>
              <p className="text-[11px] font-semibold text-rose-700 mt-0.5 leading-tight">
                This booking has been cancelled and cannot be edited. Client and talent links have been severed and no further notifications will be sent.
              </p>
            </div>
          </div>
        )}

        {isAwaiting && (
          <div className="px-4 sm:px-6 py-4 bg-orange-50/50 border-b border-orange-100 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                <p className="text-[13px] font-bold text-orange-900">Manual payment proof is awaiting review.</p>
              </div>
              <div className="flex items-center gap-2">
                {booking.paymentReceiptUrl && (
                  <button
                    onClick={() => setPreviewImage(booking.paymentReceiptUrl)}
                    className="h-8 px-3 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] shadow-sm flex items-center justify-center transition-colors"
                  >
                    View Receipt
                  </button>
                )}
                <button
                  onClick={() => onApprovePayment(booking)}
                  className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm flex items-center justify-center transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => {
                    const reason = prompt("Enter a reason for declining the payment:");
                    if (reason) onDeclinePayment(booking, reason);
                  }}
                  className="h-8 px-3 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold text-[11px] shadow-sm flex items-center justify-center transition-colors"
                >
                  Decline
                </button>
              </div>
            </div>
            {booking.paymentReceiptUrl && (
              <button
                onClick={() => setPreviewImage(booking.paymentReceiptUrl)}
                className="block w-full max-w-[240px] h-24 rounded-lg border border-orange-200 overflow-hidden shadow-sm hover:opacity-90 transition-opacity"
              >
                <img src={booking.paymentReceiptUrl} alt="Receipt" className="w-full h-full object-cover" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4 custom-scrollbar bg-slate-50/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Customer</span>
                </div>
                {/* Registration Status */}
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    booking.clientId && booking.clientId !== "guest"
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                      : "bg-slate-50 text-slate-400 border border-slate-100"
                  }`}
                >
                  {booking.clientId && booking.clientId !== "guest" ? "Registered" : "Guest"}
                </span>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-bold text-slate-900">{name}</p>
                {phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600 font-semibold">{phone}</span>
                  </div>
                )}
                {email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600 font-semibold truncate">{email}</span>
                  </div>
                )}
                {address && (
                  <div className="flex items-start gap-2 pt-2">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-600 font-semibold leading-relaxed line-clamp-2">{address}</span>
                  </div>
                )}
              </div>
              {/* History Button */}
              <div className="pt-3 flex flex-col gap-2">
                <button
                  className="w-full h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center gap-2 text-[11px] font-bold text-indigo-600 hover:bg-slate-100 hover:border-slate-300 transition-all group"
                  onClick={() => {
                    onSearch?.(email || name);
                    onClose();
                  }}
                >
                  <History className="w-3.5 h-3.5 group-hover:rotate-[-15deg] transition-transform" />
                  Customer History
                </button>

                {status === "Completed" && (
                  <button
                    className="w-full h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center gap-2 text-[11px] font-black text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-all group"
                    onClick={onRateClient}
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    {isMaster
                      ? "View Internal Evaluation"
                      : (booking.clientInternallyRated ? "Edit Internal Evaluation" : "Evaluate Client (Internal)")}
                  </button>
                )}
              </div>
            </div>

            {/* Event */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Event</span>
              </div>
              <div className="space-y-3 pt-1">
                {date && (
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Event Date</span>
                    <span className="text-sm font-bold text-slate-800">
                      {new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric" }).format(new Date(date))}
                    </span>
                  </div>
                )}
                {time && (
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Event Time</span>
                    <span className="text-sm font-bold text-slate-800">
                      {new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(`2000-01-01T${time}`))}
                    </span>
                  </div>
                )}
                {duration && (
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Duration</span>
                    <span className="text-sm font-bold text-slate-800">{duration}</span>
                  </div>
                )}
                {locationDetails && (
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Venue Location</span>
                    <span className="text-sm font-bold text-slate-800 flex items-start gap-1.5 leading-snug">
                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" /> {locationDetails}
                    </span>
                  </div>
                )}
                {!date && !time && !duration && !locationDetails && <p className="text-xs text-slate-400 italic">No details provided</p>}
              </div>
            </div>

            {/* Assigned Talent Section */}
            {(() => {
              const limit = parseInt(booking.noOfEntertainers || booking.numEntertainers || 1);
              const assignedTalentIds = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
              const isCancelled = status === "Cancelled";
              const isCompleted = status === "Completed";
              const isDisabled = isCompleted || isCancelled || isMaster;

              return (
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col min-h-[260px]">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100/50 mb-3">
                    <div className="flex items-center gap-5">
                      <h3 className="text-sm font-bold text-slate-900">Assigned Talent</h3>
                      {assignedTalentIds.length > 0 && !isCancelled && (
                        <div className="flex items-center gap-1.5 ml-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_4px_rgba(16,185,129,0.4)]" />
                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Live</span>
                        </div>
                      )}
                      {isCancelled && (
                        <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100 uppercase tracking-wider ml-1">
                          Disabled (Cancelled)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                        {assignedTalentIds.length} / {limit} Limit
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 flex-1">
                    {/* Selected Talent Rows */}
                    {assignedTalentIds.map((tid: string) => {
                      const tData = effectiveTalentsDict[tid] || booking.selectedTalentDetails?.[tid] || booking.talentDetails?.[tid] || {};
                      const displayName = tData.displayName || tData.name || booking.selectedTalentName || booking.talentName || booking.assignedTalentName || (tid ? "Talent" : "Unknown Talent");
                      const profileImage = tData.profileImage || tData.photoUrl || booking.selectedTalentPhoto || booking.talentPhoto || null;
                      const talentType = tData.talentType || booking.talentType || "Performer";

                      return (
                        <div
                          key={tid}
                          className={`flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-100 rounded-xl transition-all ${
                            isDisabled ? "cursor-default opacity-85" : "hover:bg-slate-100 hover:border-indigo-200 cursor-pointer group"
                          }`}
                          onClick={() => {
                            if (isDisabled) return;
                            setManageTalentId(tid);
                          }}
                        >
                          {profileImage ? (
                            <img src={profileImage} alt="Talent" className="w-11 h-11 rounded-lg object-cover shadow-sm bg-white" />
                          ) : (
                            <div className="w-11 h-11 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-indigo-300 font-bold text-lg">
                              {displayName?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-slate-900 text-[13px] leading-tight truncate">{displayName}</h4>
                            <p className="text-[10px] font-medium text-slate-400 mt-0.5 truncate">{talentType}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {!isDisabled && <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />}
                            {tData.rating && (
                              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-100/50">
                                <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                                <span className="text-[9px] font-black text-amber-700">{tData.rating}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Add Talent Row (hidden if limit reached or booking completed or cancelled or is master) */}
                    {assignedTalentIds.length < limit && !isCompleted && !isCancelled && !isMaster && (
                      <div
                        className="flex items-center gap-3 p-2.5 bg-white border border-dashed border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/20 transition-all cursor-pointer group"
                        onClick={() => {
                          fetchAllCompanyTalents();
                          setShowAssignModal(true);
                        }}
                      >
                        <div className="w-11 h-11 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
                          <Users className="w-5 h-5 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[13px] font-bold text-indigo-600 flex items-center gap-1 transition-colors group-hover:text-indigo-700">
                            <span className="text-lg leading-none">+</span> Add Talent
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {assignedTalentIds.length === 0 && !isCancelled && (
                    <div className="mt-4 p-2.5 bg-indigo-50/50 rounded-lg border border-indigo-100/50">
                      <p className="text-[9px] font-bold text-indigo-400 leading-normal text-center">
                        Assign a performer to this booking to go live.
                      </p>
                    </div>
                  )}

                  {assignedTalentIds.length === 0 && isCancelled && (
                    <div className="mt-4 p-2.5 bg-rose-50/60 rounded-lg border border-rose-100">
                      <p className="text-[10px] font-bold text-rose-500 leading-normal text-center">
                        Booking was cancelled before any talent was assigned.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Job & Pricing */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center">
                  <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Job & Pricing</span>
              </div>
              <div className="space-y-2.5">
                {jobType && (
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Job Type</span>
                    <span className="text-sm font-bold text-slate-800">{jobType}</span>
                  </div>
                )}
                {gender && (
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Gender</span>
                    <span className="text-sm font-bold text-slate-800">{gender}</span>
                  </div>
                )}
                {numEntertainers && (
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Entertainers</span>
                    <span className="text-sm font-bold text-slate-800">{numEntertainers}</span>
                  </div>
                )}
              </div>
              {payRate && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pay Rate</span>
                  <span className="text-xl font-black text-emerald-600">${payRate}</span>
                </div>
              )}
            </div>
          </div>

          {/* Guests */}
          {(femaleGuests || maleGuests) && (
            <div className="grid grid-cols-2 gap-4">
              {femaleGuests && (
                <div className="bg-white rounded-xl p-4 border border-pink-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-pink-400 uppercase tracking-widest block">Female Guests</span>
                    <span className="text-3xl font-black text-pink-600 mt-0.5 block">{femaleGuests}</span>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-pink-50 flex items-center justify-center">
                    <Users className="w-6 h-6 text-pink-300" />
                  </div>
                </div>
              )}
              {maleGuests && (
                <div className="bg-white rounded-xl p-4 border border-blue-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">Male Guests</span>
                    <span className="text-3xl font-black text-blue-600 mt-0.5 block">{maleGuests}</span>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-300" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Additional & Custom Fields */}
          {(options || specialRequests || customFields.length > 0) && (
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Additional Details</span>
              </div>

              {options && (
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Options</span>
                  <p className="text-sm text-slate-700 font-medium bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100 leading-relaxed">
                    {options}
                  </p>
                </div>
              )}
              {specialRequests && (
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Special Requests</span>
                  <p className="text-sm text-slate-700 font-medium bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100 leading-relaxed whitespace-pre-wrap">
                    {specialRequests}
                  </p>
                </div>
              )}

              {customFields.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                  {customFields.map(([key, value]) => {
                    const label = key
                      .replace(/^__/, "")
                      .replace(/_/g, " ")
                      .replace(/([A-Z])/g, " $1")
                      .trim();
                    const displayVal = Array.isArray(value) ? value.join(", ") : String(value || "");
                    return (
                      <div
                        key={key}
                        className={`bg-slate-50 rounded-lg p-3 border border-slate-100 ${displayVal.length > 35 ? "col-span-2 sm:col-span-3" : ""}`}
                      >
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 truncate">{label}</span>
                        <p className="text-sm font-bold text-slate-900 break-words leading-snug">
                          {displayVal || <span className="text-slate-300 font-normal italic">—</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Completion Status — shown for Confirmed/Completed bookings */}
          {(status === "Confirmed" || status === "Completed") && (
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Completion Status</span>
                {booking.clientMarkedComplete && booking.talentMarkedComplete && (
                  <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-600 text-white uppercase tracking-wider">
                    Fully Complete
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`rounded-xl p-3 border flex items-center gap-3 ${
                    booking.clientMarkedComplete ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${booking.clientMarkedComplete ? "bg-emerald-500" : "bg-slate-200"}`}>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${booking.clientMarkedComplete ? "text-emerald-600" : "text-slate-400"}`}>
                      Client
                    </p>
                    <p className={`text-xs font-bold mt-0.5 ${booking.clientMarkedComplete ? "text-emerald-900" : "text-slate-500"}`}>
                      {booking.clientMarkedComplete ? "Marked Complete ✓" : "Pending..."}
                    </p>
                  </div>
                </div>
                <div
                  className={`rounded-xl p-3 border flex items-center gap-3 ${
                    booking.talentMarkedComplete ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${booking.talentMarkedComplete ? "bg-emerald-500" : "bg-slate-200"}`}>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${booking.talentMarkedComplete ? "text-emerald-600" : "text-slate-400"}`}>
                      Talent
                    </p>
                    <p className={`text-xs font-bold mt-0.5 ${booking.talentMarkedComplete ? "text-emerald-900" : "text-slate-500"}`}>
                      {booking.talentMarkedComplete ? "Marked Complete ✓" : "Pending..."}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between px-1 pt-1">
                <div className="flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Reviews</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                      booking.clientReviewed ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-400 border-slate-200"
                    }`}
                  >
                    Client {booking.clientReviewed ? "★ Done" : "○ Pending"}
                  </span>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                      booking.talentReviewed ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-400 border-slate-200"
                    }`}
                  >
                    Talent {booking.talentReviewed ? "★ Done" : "○ Pending"}
                  </span>
                </div>
              </div>
              {booking.tipAmount > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-center justify-between">
                  <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Tip (Client Added)</span>
                  <span className="text-sm font-black text-amber-900">
                    ${booking.tipAmount} <span className="capitalize font-semibold text-amber-700 text-[11px]">via {booking.tipPaymentMethod}</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Internal Staff Notes Section */}
          <div className="pt-3">
            <EntityNotes
              companyId={activeBooking.companyId}
              entityId={activeBooking.id}
              entityType="booking"
              title="Admin & Staff Internal Notes"
              placeholder="Add an internal note about this booking..."
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
            <span>Submitted: {createdAt}</span>
            <span className="font-mono opacity-60">{booking.id}</span>
          </div>
        </div>
        {/* Image Preview Overlay */}
        {previewImage && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 rounded-2xl">
            <div className="relative max-w-[90%] max-h-[90%]">
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute -top-10 right-0 text-white hover:text-slate-200 p-2 bg-black/20 hover:bg-black/40 rounded-full transition-colors"
                title="Close receipt preview"
              >
                <X className="w-5 h-5" />
              </button>
              <img src={previewImage} alt="Receipt Preview" className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl ring-1 ring-white/20" />
            </div>
          </div>
        )}

        {showCancelReasonModal && (
          <CancelBookingReasonModal
            booking={activeBooking}
            onClose={() => setShowCancelReasonModal(false)}
            onConfirm={handleConfirmCancel}
          />
        )}
        {showEditModal && (
          <EditBookingModal
            booking={activeBooking}
            onClose={() => setShowEditModal(false)}
            onSaveSuccess={(updated) => {
              setCurrentBooking(updated);
              onBookingUpdated?.(updated);
            }}
          />
        )}
      </div>
    </div>
    </ModalPortal>
  );
}

// ─── Cancel Booking Reason Modal ──────────────────────────────────────────────
export function CancelBookingReasonModal({
  booking,
  onClose,
  onConfirm,
}: {
  booking: any;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      showError("Please enter a cancellation reason.");
      return;
    }
    setLoading(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={e => e.stopPropagation()}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 leading-tight">Cancel Booking</h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">#{booking.id.slice(0, 10).toUpperCase()}</p>
            </div>
          </div>
          <button onClick={onClose} type="button" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Reason for Cancellation <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Client requested cancellation due to schedule change or weather..."
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-800 font-medium"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="h-9 text-xs rounded-xl font-bold">
              Dismiss
            </Button>
            <Button type="submit" disabled={loading} className="h-9 text-xs rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Confirm Cancellation
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Sub-Modals & Component helpers
export const TalentManagementModal = ({ talent, booking, onUnassign, onClose, allBookings }: any) => {
  if (!booking || !talent) return null;
  const completedCount = allBookings.filter((b: any) => b.selectedTalentId === talent.id && b.status === "Completed").length;

  const getAssignedDate = () => {
    if (!booking.assignedAt) return "N/A";
    try {
      const date = booking.assignedAt.seconds ? new Date(booking.assignedAt.seconds * 1000) : new Date(booking.assignedAt);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch (e) {
      return "N/A";
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white rounded-3xl w-[96%] sm:max-w-md shadow-2xl relative z-20 overflow-hidden border border-slate-200 flex flex-col">
        {/* Top Image Section */}
        <div className="relative h-48 bg-slate-900 flex items-center justify-center">
          {talent.profileImage ? (
            <img src={talent.profileImage} alt={talent.displayName} className="w-full h-full object-cover opacity-60" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 opacity-80" />
          )}
          <div className="absolute bottom-[-40px] left-4 sm:left-8 w-24 h-24 rounded-2xl bg-white p-1.5 shadow-xl border border-slate-100">
            {talent.profileImage ? (
              <img src={talent.profileImage} alt="Avatar" className="w-full h-full object-cover rounded-xl" />
            ) : (
              <div className="w-full h-full bg-slate-100 rounded-xl flex items-center justify-center text-indigo-400 text-3xl font-black">
                {talent.displayName?.charAt(0)}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/40 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-8 pt-14 sm:pt-14 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{talent.displayName}</h2>
              <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="text-sm font-black text-amber-700">{talent.rating || "New"}</span>
              </div>
            </div>
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-[0.1em]">{talent.talentType || "Performer"}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Experience</span>
              <p className="text-sm font-bold text-slate-900">{completedCount} Bookings</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Assigned On</span>
              <p className="text-sm font-bold text-slate-900">{getAssignedDate()}</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={() => onUnassign(false)}
              className="w-full h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Unassign Talent
            </button>
            <button
              onClick={() => onUnassign(true)}
              className="w-full h-12 bg-indigo-600 rounded-xl flex items-center justify-center gap-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              Unassign & Reopen Job
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export const AssignTalentModal = ({ booking, onClose, onAssign, allTalentRoster, dictionary, loading }: any) => {
  const [tab, setTab] = useState<"interested" | "similar" | "all">("interested");
  const [search, setSearch] = useState("");

  if (!booking) return null;

  const getInterested = () => allTalentRoster.filter((t: any) => t.status !== "inactive" && booking.applicants?.includes(t.id));
  const getSimilar = () =>
    allTalentRoster.filter((t: any) => {
      if (t.status === "inactive") return false;
      // Must not be already applied or assigned
      if (booking.applicants?.includes(t.id)) return false;
      const assigned = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
      if (assigned.includes(t.id)) return false;

      let score = 0;
      // 1. Job Type / Category
      if (t.talentType === booking.jobType) score += 2;

      // 2. Gender Match
      const bGender = String(booking.gender || "").toLowerCase().trim();
      const tGenders = (Array.isArray(t.gender) ? t.gender : [t.gender]).map((g: any) => String(g || "").toLowerCase().trim()).filter(Boolean);
      if (bGender && (bGender === "any" || tGenders.includes(bGender))) score += 1;

      // 3. Coverage Area / Location
      const bLoc = [booking.city, booking.state, booking.address].filter(Boolean).join(" ").toLowerCase();
      const tLocs = (t.locations || []).join(" ").toLowerCase() + " " + [t.city, t.state].filter(Boolean).join(" ").toLowerCase();

      // If booking has location data and talent matches any part of it
      if (bLoc && tLocs && (bLoc.includes(tLocs.split(" ")[0]) || tLocs.includes(bLoc.split(" ")[0]))) score += 1;

      return score >= 2; // Requires jobType match or multiple partial matches
    });
  const getAll = () =>
    allTalentRoster.filter((t: any) => {
      if (t.status === "inactive") return false;
      const assigned = booking.selectedTalentIds || (booking.selectedTalentId ? [booking.selectedTalentId] : []);
      return !assigned.includes(t.id);
    });

  const activeList = tab === "interested" ? getInterested() : tab === "similar" ? getSimilar() : getAll();
  const filtered = activeList.filter(
    (t: any) => t.displayName?.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={onClose} />
      <div className="bg-white rounded-3xl w-[96%] sm:max-w-2xl h-[90vh] sm:h-[85vh] shadow-2xl relative z-20 overflow-hidden border border-slate-200 flex flex-col animate-in slide-in-from-bottom-4">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-2 sm:pb-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Assign Talent</h2>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Found {activeList.length} potential matches</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-xl">
            {(["interested", "similar", "all"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                  tab === t ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Find talent by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 text-sm font-bold placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pt-2 sm:pt-2 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest">Accessing Roster...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-300">
              <Users className="w-16 h-16 opacity-10" />
              <p className="text-sm font-bold">No results match your current search.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-50/50 transition-all group"
                >
                  {t.profileImage ? (
                    <img src={t.profileImage} alt={t.displayName} className="w-12 h-12 rounded-xl object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300 font-black text-xl">
                      {t.displayName?.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 text-base">{t.displayName}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{t.talentType || "Performer"}</span>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                      <span className="text-xs font-medium text-slate-400 truncate">{t.email}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onAssign(t.id)}
                    className="px-5 h-10 bg-indigo-600 rounded-xl text-xs font-black text-white hover:bg-slate-900 transition-all shadow-md shadow-indigo-100 active:scale-95"
                  >
                    ASSIGN
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ActivityHistoryModal = ({ booking, dictionary, onClose }: any) => {
  const getTimeline = () => {
    const evts: any[] = [];
    const seen = new Set<string>();

    const addEvt = (evt: any) => {
      const key = `${evt.type}_${evt.at?.slice(0, 16)}_${evt.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        evts.push(evt);
      }
    };

    // 1. Created
    if (booking.createdAt) {
      const creatorName = booking.createdByName || booking.clientName || booking.__clientName || "Client";
      const creatorEmail = booking.createdByEmail || booking.clientEmail || booking.__email || "";
      addEvt({
        type: "created",
        at: booking.createdAt,
        icon: <Clock className="w-4 h-4 text-white" />,
        color: "bg-blue-500",
        title: "Booking Created",
        desc: `Booking created by ${creatorName}${creatorEmail ? ` (${creatorEmail})` : ""}.`
      });
    }

    // 2. Cancellation
    if (booking.cancelledAt || booking.status?.toLowerCase() === "cancelled" || booking.cancellationReason) {
      const canceller = booking.cancelledByName || booking.cancelledByEmail || "Admin";
      const reason = booking.cancellationReason ? `Reason: "${booking.cancellationReason}"` : "No reason specified";
      addEvt({
        type: "cancelled",
        at: booking.cancelledAt || booking.updatedAt || new Date().toISOString(),
        icon: <XCircle className="w-4 h-4 text-white" />,
        color: "bg-rose-600",
        title: "Booking Cancelled",
        desc: `Cancelled by ${canceller}. ${reason}`
      });
    }

    // 3. Talent Applicants
    if (booking.applicants && booking.applicants.length > 0) {
      const simulatedAt = new Date(new Date(booking.createdAt || Date.now()).getTime() + 1000).toISOString();
      addEvt({
        type: "applied",
        at: simulatedAt,
        icon: <Users className="w-4 h-4 text-white" />,
        color: "bg-indigo-500",
        title: "Talents Applied",
        desc: `${booking.applicants.length} talent(s) submitted availability.`
      });
    }

    // 4. Assignment History
    if (booking.assignmentHistory) {
      let ash: any[] = [];
      if (Array.isArray(booking.assignmentHistory)) ash = booking.assignmentHistory;
      else if (typeof booking.assignmentHistory === "string") {
        try { ash = JSON.parse(booking.assignmentHistory); } catch (e) {}
      }
      ash.forEach(a => {
        const tName = a.talentName || dictionary[a.talentId]?.displayName || dictionary[a.talentId]?.name || "Talent";
        const actor = a.adminName || a.clientName || "Admin";
        let titleText = a.type === "assigned" ? "Talent Assigned" : a.type === "declined" ? "Talent Declined Job" : "Talent Removed";
        let descText =
          a.type === "assigned"
            ? `Assigned @${tName} by ${actor}`
            : a.type === "declined"
            ? `@${tName} declined the job offer and was unassigned.`
            : `Removed @${tName} by ${actor} ${a.reopened ? "(Job Reopened)" : ""}`;
        if (a.customTerms) {
          const terms: string[] = [];
          if (a.customTerms.proposedRate && a.customTerms.proposedRate !== a.customTerms.originalRate) {
            terms.push(`Rate changed to $${a.customTerms.proposedRate} (was $${a.customTerms.originalRate})`);
          }
          if (a.customTerms.proposedDate && a.customTerms.proposedDate !== a.customTerms.originalDate) {
            terms.push(`Date changed to ${a.customTerms.proposedDate}`);
          }
          if (a.customTerms.proposedTime && a.customTerms.proposedTime !== a.customTerms.originalTime) {
            terms.push(`Time changed to ${a.customTerms.proposedTime}`);
          }
          if (terms.length > 0) {
            descText += ` Custom terms: ${terms.join(", ")}.`;
          }
        }
        addEvt({
          type: a.type,
          at: a.at || new Date().toISOString(),
          icon: a.type === "assigned" ? <Users className="w-4 h-4 text-white" /> : a.type === "declined" ? <XCircle className="w-4 h-4 text-white" /> : <Trash2 className="w-4 h-4 text-white" />,
          color: a.type === "assigned" ? "bg-emerald-500" : a.type === "declined" ? "bg-rose-600" : "bg-rose-500",
          title: titleText,
          desc: descText
        });
      });
    }

    // 5. Explicit Activity Logs
    if (booking.activityLogs && Array.isArray(booking.activityLogs)) {
      booking.activityLogs.forEach((act: any) => {
        addEvt({
          type: act.type || "custom",
          at: act.at || act.timestamp || new Date().toISOString(),
          icon: act.type === "cancelled" ? <XCircle className="w-4 h-4 text-white" /> :
                act.type === "edited" ? <Edit3 className="w-4 h-4 text-white" /> :
                act.type === "payment_approved" ? <CheckCircle2 className="w-4 h-4 text-white" /> :
                act.type === "payment_declined" ? <X className="w-4 h-4 text-white" /> :
                <Activity className="w-4 h-4 text-white" />,
          color: act.type === "cancelled" ? "bg-rose-600" :
                 act.type === "edited" ? "bg-amber-500" :
                 act.type === "payment_approved" ? "bg-emerald-500" :
                 "bg-indigo-600",
          title: act.title || "System Activity",
          desc: act.desc || act.details || "Activity recorded."
        });
      });
    }

    // 6. Payment Proof
    if (booking.receiptUploadedAt) {
      addEvt({
        type: "payment_proof",
        at: booking.receiptUploadedAt,
        icon: <Activity className="w-4 h-4 text-white" />,
        color: "bg-orange-500",
        title: "Payment Proof Submitted",
        desc: `Client uploaded a manual payment receipt (${booking.paymentMethod || "Unknown"}).`
      });
    }

    // 7. Payment Declined
    if (booking.declinedAt) {
      addEvt({
        type: "payment_declined",
        at: booking.declinedAt,
        icon: <X className="w-4 h-4 text-white" />,
        color: "bg-red-500",
        title: "Payment Declined",
        desc: `Admin declined payment. Reason: ${booking.paymentDeclineReason || "None given"}.`
      });
    }

    // 8. Paid / Confirmed
    if (booking.paidAt) {
      addEvt({
        type: "payment_approved",
        at: booking.paidAt,
        icon: <CheckCircle2 className="w-4 h-4 text-white" />,
        color: "bg-emerald-500",
        title: "Payment Approved & Confirmed",
        desc: `Payment and booking successfully confirmed.`
      });
    }

    // 9. Completed
    if (booking.status?.toLowerCase() === "completed") {
      addEvt({
        type: "completed",
        at: booking.completedAt || booking.updatedAt || new Date().toISOString(),
        icon: <CheckCircle2 className="w-4 h-4 text-white" />,
        color: "bg-indigo-800",
        title: "Booking Completed",
        desc: `Gig has concluded successfully.`
      });
    }

    return evts;
  };

  const history = getTimeline().sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white rounded-3xl w-[96%] sm:max-w-xl shadow-2xl relative z-20 overflow-hidden border border-slate-200 flex flex-col">
        <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Activity className="w-5 h-5 text-indigo-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Activity Log</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-4 sm:p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {history.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-3">
              <Clock className="w-12 h-12 mx-auto stroke-[1.5] opacity-20" />
              <p className="text-sm font-medium">No activity recorded for this booking.</p>
            </div>
          ) : (
            <div className="space-y-8 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
              {history.map((h: any, i: number) => (
                <div key={i} className="flex gap-6 relative">
                  <div className={`w-10 h-10 rounded-full border-4 border-white shadow-md z-10 flex items-center justify-center ${h.color}`}>
                    {h.icon}
                  </div>
                  <div className="flex-1 space-y-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        {new Date(h.at).toLocaleDateString()} at{" "}
                        {new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-slate-900">{h.title}</p>
                    <p className="text-xs font-bold text-slate-500 mt-1">{h.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full h-12 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all shadow-sm"
          >
            Close Activity Log
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export function AdminRateClientModal({
  booking,
  companyId,
  onClose,
  onCompleted
}: {
  booking: any;
  companyId: string;
  onClose: () => void;
  onCompleted: (updatedBooking: any) => void;
}) {
  const { user } = useAuth();
  const [punctuality, setPunctuality] = useState(5);
  const [communication, setCommunication] = useState(5);
  const [reliability, setReliability] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadExistingRating() {
      try {
        const q = query(collection(db, "client_internal_ratings"), where("bookingId", "==", booking.id));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setPunctuality(data.punctuality || 5);
          setCommunication(data.communication || 5);
          setReliability(data.reliability || 5);
          setComment(data.comment || "");
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadExistingRating();
  }, [booking.id]);

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, "client_internal_ratings"), where("bookingId", "==", booking.id));
      const snap = await getDocs(q);

      const ratingData = {
        bookingId: booking.id,
        companyId,
        clientId: booking.clientId || "guest",
        adminId: user.uid,
        adminName: user.displayName || user.email || "Admin/Staff",
        punctuality,
        communication,
        reliability,
        comment,
        createdAt: new Date().toISOString()
      };

      if (!snap.empty) {
        await updateDoc(doc(db, "client_internal_ratings", snap.docs[0].id), ratingData);
      } else {
        await addDoc(collection(db, "client_internal_ratings"), ratingData);
      }

      await updateDoc(doc(db, "bookings", booking.id), {
        clientInternallyRated: true
      });

      showSuccess("Internal client evaluation saved successfully.");
      onCompleted({
        ...booking,
        clientInternallyRated: true
      });
    } catch (e) {
      console.error(e);
      showError("Failed to submit internal rating. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const name = booking.clientName || booking.__clientName || "Client";

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      >
      <div className="w-[96%] sm:max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-800 to-slate-950 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <Star className="w-5 h-5 text-amber-300 fill-amber-300" />
            </div>
            <div>
              <h3 className="font-black text-lg">Staff Evaluation</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Internal Client Rating System</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar bg-slate-50/30">
          <div className="p-4 bg-amber-50/50 border border-amber-200/50 rounded-2xl flex items-center gap-3 text-amber-800 text-xs font-semibold">
            <Info className="w-4 h-4 shrink-0 text-amber-600" />
            <span>This rating is private and only visible to administrators, staff, and company personnel.</span>
          </div>

          <div className="space-y-4">
            {/* Punctuality */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Punctuality</span>
                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{punctuality} / 5</span>
              </div>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button key={star} onClick={() => setPunctuality(star)} className="focus:outline-none transition-transform active:scale-95">
                    <Star className={`w-7 h-7 ${star <= punctuality ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Communication */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Communication</span>
                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{communication} / 5</span>
              </div>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button key={star} onClick={() => setCommunication(star)} className="focus:outline-none transition-transform active:scale-95">
                    <Star className={`w-7 h-7 ${star <= communication ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Reliability */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Reliability & Attitude</span>
                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{reliability} / 5</span>
              </div>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button key={star} onClick={() => setReliability(star)} className="focus:outline-none transition-transform active:scale-95">
                    <Star className={`w-7 h-7 ${star <= reliability ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Private Staff Comment */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Private Staff Comments</label>
              <textarea
                placeholder="Enter private notes about this client (e.g. client was demanding but paid immediately, highly recommended...)"
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                className="w-full text-sm font-bold text-slate-800 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 placeholder:text-slate-400 bg-slate-50/50"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} className="rounded-xl font-bold h-11 px-5 border-slate-200 text-slate-600 hover:bg-slate-100 bg-white">
            Cancel
          </Button>
          <Button
            disabled={loading}
            onClick={handleSubmit}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold h-11 px-6 shadow-md shadow-indigo-100 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save Evaluation
          </Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

// ─── Edit Booking Modal Component ─────────────────────────────────────────────

export function EditBookingModal({
  booking,
  onClose,
  onSaveSuccess
}: {
  booking: any;
  onClose: () => void;
  onSaveSuccess: (updatedBooking: any) => void;
}) {
  const { user } = useAuth();
  const [formData, setFormData] = useState<any>({
    clientName: booking.clientName || booking.__clientName || "",
    clientEmail: booking.clientEmail || booking.__email || "",
    clientNumber: booking.clientNumber || booking.clientPhone || "",
    eventDate: booking.eventDate || "",
    eventTime: booking.eventTime || "",
    duration: booking.duration || "",
    address: booking.address || booking.__address || "",
    city: booking.city || booking.__city || "",
    state: booking.state || booking.__state || "",
    location: booking.location || "",
    jobType: booking.jobType || booking.__jobType || "",
    gender: booking.gender || booking.__gender || "",
    noOfEntertainers: booking.noOfEntertainers || booking.numEntertainers || "1",
    femaleGuests: booking.femaleGuests || "",
    maleGuests: booking.maleGuests || "",
    payRate: booking.payRate || "",
    options: booking.options || "",
    specialRequests: booking.specialRequests || booking.notes || "",
  });

  const [customFields, setCustomFields] = useState<Record<string, any>>(() => {
    const extra: Record<string, any> = {};
    const standardKeys = [
      "clientName", "__clientName", "clientNumber", "clientPhone", "__clientPhone", "clientEmail", "__email", "__clientEmail",
      "eventDate", "eventTime", "duration", "address", "__address", "city", "__city", "state", "__state",
      "location", "jobType", "__jobType", "gender", "__gender", "numEntertainers", "noOfEntertainers",
      "femaleGuests", "maleGuests", "payRate", "options", "__options", "specialRequests", "notes", "__notes",
      "status", "id", "companyId", "clientId", "createdAt", "updatedAt", "updated_at", "formMode",
      "talentId", "selectedTalentId", "applicants", "selectedTalentIds", "assignmentHistory", "assignedAt",
      "activityLogs", "activity_logs", "cancelledAt", "cancelledById", "cancelledByName", "cancelledByEmail",
      "cancellationReason", "cancelledReason", "cancelledBy", "cancelledRole", "cancelled_at", "cancelled_by_id",
      "paymentReceiptUrl", "receiptUploadedAt", "paymentMethod", "paymentStatus", "clientMarkedComplete",
      "talentMarkedComplete", "clientReviewed", "talentReviewed", "clientRatingForTalent",
      "clientCommentForTalent", "talentRatingForClient", "talentCommentForClient", "tipAmount",
      "tipPaymentMethod", "tipStatus", "clientInternallyRated", "paidAt", "declinedAt",
      "paymentDeclineReason", "customOffers", "checkoutSessionId", "stripePaymentIntentId",
      "clientEvaluation", "internalEvaluation", "declinedTalentIds", "declined_talent_ids", "declinedTalents"
    ];
    Object.entries(booking).forEach(([k, v]) => {
      if (!standardKeys.includes(k) && !k.startsWith("__")) {
        const lowerKey = k.toLowerCase();
        if (
          lowerKey.includes("cancel") ||
          lowerKey.includes("updated") ||
          lowerKey.includes("created") ||
          lowerKey.includes("activity") ||
          lowerKey.includes("history") ||
          lowerKey.includes("offer") ||
          lowerKey.includes("applicant") ||
          lowerKey.includes("receipt") ||
          lowerKey.includes("evaluation") ||
          lowerKey.includes("rating") ||
          lowerKey.includes("review") ||
          lowerKey.includes("stripe") ||
          lowerKey.includes("checkout") ||
          lowerKey.includes("declin")
        ) {
          return;
        }
        if (v && typeof v === "object" && !Array.isArray(v)) return;
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") return;
        extra[k] = v;
      }
    });
    return extra;
  });

  const [saving, setSaving] = useState(false);
  const [promptStep, setPromptStep] = useState<'none' | 'confirmReopen' | 'confirmUnassign'>('none');

  // Dynamic DB Dropdown states for company
  const [dbTalentTypes, setDbTalentTypes] = useState<string[]>([]);
  const [dbGenders, setDbGenders] = useState<string[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);

  useEffect(() => {
    async function loadCompanyDropdowns() {
      const cId = booking.companyId;
      if (!cId) return;
      setLoadingDropdowns(true);
      try {
        const [tSnap, gSnap] = await Promise.all([
          getDocs(query(collection(db, "companies", cId, "talentTypes"), where("status", "==", "active"))),
          getDocs(query(collection(db, "companies", cId, "genders"), where("status", "==", "active"))),
        ]);

        let types = tSnap.docs.map(d => d.data().name as string).filter(Boolean).sort((a,b) => a.localeCompare(b));
        let gens = gSnap.docs.map(d => d.data().name as string).filter(Boolean).sort((a,b) => a.localeCompare(b));

        // Fallback: If no active status filter match, fetch without status filter
        if (types.length === 0) {
          const allTypesSnap = await getDocs(collection(db, "companies", cId, "talentTypes"));
          types = allTypesSnap.docs.map(d => d.data().name as string).filter(Boolean).sort((a,b) => a.localeCompare(b));
        }
        if (gens.length === 0) {
          const allGensSnap = await getDocs(collection(db, "companies", cId, "genders"));
          gens = allGensSnap.docs.map(d => d.data().name as string).filter(Boolean).sort((a,b) => a.localeCompare(b));
        }

        setDbTalentTypes(types);
        setDbGenders(gens);
      } catch (err) {
        console.error("Error loading dropdown options for edit modal:", err);
      } finally {
        setLoadingDropdowns(false);
      }
    }
    loadCompanyDropdowns();
  }, [booking.companyId]);

  const handleChange = (field: string, val: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: val }));
  };

  const handleCustomChange = (key: string, val: any) => {
    setCustomFields((prev: any) => ({ ...prev, [key]: val }));
  };

  const handleSaveClick = (e: React.FormEvent) => {
    e.preventDefault();

    if (booking.status === "Cancelled") {
      showError("This booking is cancelled and cannot be edited.");
      return;
    }

    const oldAddress = String(booking.address || booking.__address || "").trim().toLowerCase();
    const oldCity = String(booking.city || booking.__city || "").trim().toLowerCase();
    const oldState = String(booking.state || booking.__state || "").trim().toLowerCase();
    const oldLocation = String(booking.location || "").trim().toLowerCase();

    const newAddress = String(formData.address || "").trim().toLowerCase();
    const newCity = String(formData.city || "").trim().toLowerCase();
    const newState = String(formData.state || "").trim().toLowerCase();
    const newLocation = String(formData.location || "").trim().toLowerCase();

    const isLocationChanged =
      oldAddress !== newAddress ||
      oldCity !== newCity ||
      oldState !== newState ||
      oldLocation !== newLocation;

    if (isLocationChanged) {
      setPromptStep("confirmReopen");
    } else {
      executeSave({ reopen: false, unassign: false });
    }
  };

  const executeSave = async ({ reopen, unassign }: { reopen: boolean; unassign: boolean }) => {
    setSaving(true);
    try {
      const bookingRef = doc(db, "bookings", booking.id);

      const newLocationSummary = [formData.address, formData.city, formData.state].filter(Boolean).join(", ") || formData.location || "Updated Location";

      const updatedPayload: any = {
        ...customFields,
        clientName: formData.clientName,
        __clientName: formData.clientName,
        clientEmail: formData.clientEmail,
        __email: formData.clientEmail,
        clientNumber: formData.clientNumber,
        clientPhone: formData.clientNumber,
        eventDate: formData.eventDate,
        eventTime: formData.eventTime,
        duration: formData.duration,
        address: formData.address,
        __address: formData.address,
        city: formData.city,
        __city: formData.city,
        state: formData.state,
        __state: formData.state,
        location: newLocationSummary,
        jobType: formData.jobType,
        __jobType: formData.jobType,
        gender: formData.gender,
        __gender: formData.gender,
        noOfEntertainers: formData.noOfEntertainers,
        numEntertainers: formData.noOfEntertainers,
        femaleGuests: formData.femaleGuests,
        maleGuests: formData.maleGuests,
        payRate: formData.payRate,
        options: formData.options,
        specialRequests: formData.specialRequests,
        notes: formData.specialRequests,
        updatedAt: new Date().toISOString()
      };

      const assignedTalentIds: string[] = booking.selectedTalentIds ||
        (booking.selectedTalentId ? [booking.selectedTalentId] :
        (booking.talentId ? [booking.talentId] : []));

      if (reopen) {
        updatedPayload.status = "Pending";

        if (unassign) {
          updatedPayload.selectedTalentIds = [];
          updatedPayload.selectedTalentId = null;
          updatedPayload.talentId = null;
          updatedPayload.talentName = null;

          // Notify unassigned talents
          for (const tid of assignedTalentIds) {
            await sendNotification({
              userId: tid,
              companyId: booking.companyId,
              title: "Unassigned from Booking (Location Updated)",
              message: `You have been unassigned from booking #${booking.id.slice(0, 8)} because the event location/details were updated by admin.`,
              type: "alert",
              link: `/${booking.companyId}/dashboard/talent/bookings`
            });
          }

          // Broadcast to matching talents
          await sendNotificationToTalents(
            booking.companyId,
            {
              title: "Job Reopened - Location Updated!",
              message: `Booking #${booking.id.slice(0, 8)} location was updated to ${newLocationSummary}. Apply now!`,
              type: "booking",
              link: `/${booking.companyId}/dashboard/talent/bookings`
            },
            { ...booking, ...updatedPayload }
          );
        } else {
          // Keep assigned talents, notify them of location change
          for (const tid of assignedTalentIds) {
            await sendNotification({
              userId: tid,
              companyId: booking.companyId,
              title: "Booking Location & Details Updated",
              message: `The event location/details for booking #${booking.id.slice(0, 8)} that you are assigned to have been updated. New Location: ${newLocationSummary}. Please check your dashboard.`,
              type: "info",
              link: `/${booking.companyId}/dashboard/talent/bookings`
            });
          }

          // Reopen/broadcast to talents
          await sendNotificationToTalents(
            booking.companyId,
            {
              title: "Job Updated & Open for Applications",
              message: `Booking #${booking.id.slice(0, 8)} details were updated (${newLocationSummary}). Apply now in your available tab!`,
              type: "booking",
              link: `/${booking.companyId}/dashboard/talent/bookings`
            },
            { ...booking, ...updatedPayload }
          );
        }
      } else {
        // Not reopened
        // Notify assigned talents
        for (const tid of assignedTalentIds) {
          await sendNotification({
            userId: tid,
            companyId: booking.companyId,
            title: "Booking Details Updated",
            message: `The event details for booking #${booking.id.slice(0, 8)} have been updated by admin. New Location: ${newLocationSummary}. Check your dashboard.`,
            type: "info",
            link: `/${booking.companyId}/dashboard/talent/bookings`
          });
        }

        // Notify client
        if (formData.clientEmail || booking.clientId) {
          await sendNotification({
            userId: booking.clientId || "guest",
            companyId: booking.companyId,
            title: "Your Booking Details Have Been Updated",
            message: `Your booking #${booking.id.slice(0, 8)} details have been updated by the admin (${newLocationSummary}). Please check your portal.`,
            type: "booking",
            recipientEmail: formData.clientEmail,
            recipientPhone: formData.clientNumber,
            link: booking.clientId && booking.clientId !== "guest"
              ? `/${booking.companyId}/dashboard/client/bookings`
              : `/${booking.companyId}/guest/booking/${booking.id}`
          });
        }
      }

      const editorName = user?.displayName || user?.email || "Admin";
      const editActivity = {
        id: `act_${Date.now()}`,
        type: "edited",
        at: new Date().toISOString(),
        title: "Booking Details Updated",
        desc: `Details updated by ${editorName}.`,
        performedBy: editorName
      };

      updatedPayload.activityLogs = arrayUnion(editActivity);

      await updateDoc(bookingRef, updatedPayload);
      showSuccess("Booking details updated successfully!");
      onSaveSuccess({
        ...booking,
        ...updatedPayload,
        activityLogs: [...(booking.activityLogs || []), editActivity]
      });
      onClose();
    } catch (err: any) {
      console.error("Failed to update booking details:", err);
      showError(err.message || "Failed to update booking details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-[96%] sm:max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-700 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-bold">
              <Edit3 className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <h2 className="font-extrabold text-lg leading-tight">Edit Booking Details</h2>
              <p className="text-xs text-indigo-200/70 font-mono">#{booking.id.slice(0, 10).toUpperCase()}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSaveClick} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50">
          {/* Customer Info Section */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-xs font-black text-indigo-600 uppercase tracking-widest">
              <User className="w-4 h-4" /> Customer Information
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Customer Name</label>
                <Input value={formData.clientName} onChange={e => handleChange("clientName", e.target.value)} required className="bg-white" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Customer Email</label>
                <Input type="email" value={formData.clientEmail} onChange={e => handleChange("clientEmail", e.target.value)} className="bg-white" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Customer Phone</label>
                <Input value={formData.clientNumber} onChange={e => handleChange("clientNumber", e.target.value)} className="bg-white" />
              </div>
            </div>
          </div>

          {/* Event & Job Section */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-xs font-black text-indigo-600 uppercase tracking-widest">
              <Calendar className="w-4 h-4" /> Event & Job Details
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Event Date</label>
                <Input type="date" value={formData.eventDate} onChange={e => handleChange("eventDate", e.target.value)} className="bg-white" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Event Time</label>
                <Input type="time" value={formData.eventTime} onChange={e => handleChange("eventTime", e.target.value)} className="bg-white" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Duration</label>
                <Input value={formData.duration} onChange={e => handleChange("duration", e.target.value)} placeholder="e.g. 3 Hours" className="bg-white" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Job Type / Service</label>
                <div className="relative">
                  <select
                    value={formData.jobType}
                    onChange={e => handleChange("jobType", e.target.value)}
                    className="w-full h-10 px-3 border border-slate-300 rounded-md text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none pr-8"
                  >
                    <option value="">
                      {loadingDropdowns ? "Loading services..." : dbTalentTypes.length === 0 ? "Select Job Type / Service..." : "Select Job Type / Service..."}
                    </option>
                    {formData.jobType && !dbTalentTypes.includes(formData.jobType) && (
                      <option value={formData.jobType}>{formData.jobType}</option>
                    )}
                    {dbTalentTypes.map((t, idx) => (
                      <option key={idx} value={t}>{t}</option>
                    ))}
                  </select>
                  <ChevronRight className="w-4 h-4 text-slate-400 absolute right-2.5 top-3 rotate-90 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Required Gender</label>
                <div className="relative">
                  <select
                    value={formData.gender}
                    onChange={e => handleChange("gender", e.target.value)}
                    className="w-full h-10 px-3 border border-slate-300 rounded-md text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none pr-8"
                  >
                    <option value="">
                      {loadingDropdowns ? "Loading genders..." : "Any / Both"}
                    </option>
                    {formData.gender && !dbGenders.includes(formData.gender) && formData.gender !== "Any / Both" && (
                      <option value={formData.gender}>{formData.gender}</option>
                    )}
                    {dbGenders.map((g, idx) => (
                      <option key={idx} value={g}>{g}</option>
                    ))}
                  </select>
                  <ChevronRight className="w-4 h-4 text-slate-400 absolute right-2.5 top-3 rotate-90 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Number of Entertainers</label>
                <Input type="number" min="1" value={formData.noOfEntertainers} onChange={e => handleChange("noOfEntertainers", e.target.value)} className="bg-white" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Pay Rate / Budget ($)</label>
                <Input value={formData.payRate} onChange={e => handleChange("payRate", e.target.value)} placeholder="e.g. 350" className="bg-white" />
              </div>
            </div>
          </div>

          {/* Location Section */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-widest">
                <MapPin className="w-4 h-4 text-rose-500" /> Event Venue & Location
              </div>
              <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-bold">
                ⚠️ Changing Location triggers Reopen options
              </span>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Quick Location Search</label>
              <LocationSearchInput
                value={formData.location}
                onChange={(city, state, full) => {
                  setFormData((prev: any) => ({
                    ...prev,
                    city: city || prev.city,
                    state: state || prev.state,
                    location: full
                  }));
                }}
                placeholder="Search US City, State..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div className="sm:col-span-3">
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Street Address</label>
                <Input value={formData.address} onChange={e => handleChange("address", e.target.value)} placeholder="e.g. 123 Main St, Suite 400" className="bg-white" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">City</label>
                <Input value={formData.city} onChange={e => handleChange("city", e.target.value)} placeholder="e.g. Las Vegas" className="bg-white" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">State</label>
                <Input value={formData.state} onChange={e => handleChange("state", e.target.value)} placeholder="e.g. NV" className="bg-white" />
              </div>
            </div>
          </div>

          {/* Notes & Extra Section */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-xs font-black text-indigo-600 uppercase tracking-widest">
              <FileText className="w-4 h-4" /> Guest Breakdown & Notes
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Female Guests Count</label>
                <Input value={formData.femaleGuests} onChange={e => handleChange("femaleGuests", e.target.value)} placeholder="e.g. 15" className="bg-white" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Male Guests Count</label>
                <Input value={formData.maleGuests} onChange={e => handleChange("maleGuests", e.target.value)} placeholder="e.g. 10" className="bg-white" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Options / Package Details</label>
                <Input value={formData.options} onChange={e => handleChange("options", e.target.value)} placeholder="e.g. VIP Package, Sound System included" className="bg-white" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Special Requests / Notes</label>
                <textarea
                  rows={3}
                  value={formData.specialRequests}
                  onChange={e => handleChange("specialRequests", e.target.value)}
                  placeholder="Enter special instructions or requests..."
                  className="w-full p-3 border border-slate-300 rounded-xl text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {Object.keys(customFields).length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-2">Custom Form Fields</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(customFields).map(([k, v]) => {
                    const label = k.replace(/^__/, "").replace(/_/g, " ").replace(/([A-Z])/g, " $1").trim();
                    return (
                      <div key={k}>
                        <label className="text-[10px] font-bold text-slate-500 capitalize block mb-1">{label}</label>
                        <Input value={String(v || "")} onChange={e => handleCustomChange(k, e.target.value)} className="bg-white" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl font-bold h-11 px-5 border-slate-200 text-slate-600 hover:bg-slate-100 bg-white">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold h-11 px-7 shadow-lg shadow-indigo-100 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
            </Button>
          </div>
        </form>
      </div>

      {/* Confirmation Step 1: Location Changed -> Reopen? */}
      {promptStep === "confirmReopen" && (
        <div className="fixed inset-0 z-[2147483648] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600 shadow-sm">
              <RefreshCw className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Location Details Changed!</h3>
              <p className="text-xs font-semibold text-slate-500 mt-2 leading-relaxed">
                You have updated the event location/city/state. Do you want to <strong className="text-indigo-600 font-bold">reopen this job</strong> to find new matching talents in the updated location?
              </p>
            </div>
            <div className="space-y-2.5 pt-2">
              <Button
                type="button"
                onClick={() => setPromptStep("confirmUnassign")}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Yes, Reopen Job
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => executeSave({ reopen: false, unassign: false })}
                variant="outline"
                className="w-full h-11 border-slate-200 text-slate-700 font-bold text-sm rounded-xl hover:bg-slate-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-slate-500" />} No, Keep Current Status
              </Button>
              <button
                type="button"
                onClick={() => setPromptStep("none")}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 pt-1 block mx-auto"
              >
                Go back to editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Step 2: Reopen Yes -> Unassign Old Talents? */}
      {promptStep === "confirmUnassign" && (
        <div className="fixed inset-0 z-[2147483648] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto text-amber-600 shadow-sm">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Unassign Current Talents?</h3>
              <p className="text-xs font-semibold text-slate-500 mt-2 leading-relaxed">
                Do you want to <strong className="text-amber-600 font-bold">unassign old/currently assigned talent(s)</strong> from this job, or keep them assigned while reopening?
              </p>
            </div>
            <div className="space-y-2.5 pt-2">
              <Button
                type="button"
                disabled={saving}
                onClick={() => executeSave({ reopen: true, unassign: true })}
                className="w-full h-11 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-amber-200 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />} Yes, Unassign Old Talents
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => executeSave({ reopen: true, unassign: false })}
                variant="outline"
                className="w-full h-11 border-slate-200 text-slate-700 font-bold text-sm rounded-xl hover:bg-slate-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4 text-indigo-500" />} No, Keep Talents Assigned
              </Button>
              <button
                type="button"
                onClick={() => setPromptStep("none")}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 pt-1 block mx-auto"
              >
                Go back to editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ModalPortal>
  );
}
