"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { 
  collection, doc, getDoc, setDoc, addDoc, updateDoc, 
  query, orderBy, onSnapshot, serverTimestamp 
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { X, Send, Lock, MessageSquare, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notifications";

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  createdAt: string;
}

interface BookingChatModalProps {
  booking: any;
  user: any; // AppUser from context
  onClose: () => void;
}

export function BookingChatModal({ booking, user, onClose }: BookingChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [liveBookingStatus, setLiveBookingStatus] = useState<string>(booking.status || "");
  const [chatClosedState, setChatClosedState] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const bookingId = booking.id;
  const currentStatus = liveBookingStatus || booking.status || "";
  const isClosed = chatClosedState || ["completed", "cancelled"].includes((currentStatus || "").toLowerCase());
  const chatTitle = booking.jobType || booking.__jobType || booking.notes?.split("\n")[0] || "Booking Chat";

  // Listen to live booking and chat status updates (e.g. cancellation by admin or client)
  useEffect(() => {
    if (!bookingId) return;

    const unsubBooking = onSnapshot(doc(db, "bookings", bookingId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.status) {
          setLiveBookingStatus(data.status);
        }
      }
    }, (err) => console.error("Error listening to booking status in chat:", err));

    const unsubChat = onSnapshot(doc(db, "chats", bookingId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if ((data.status && ["completed", "cancelled"].includes(data.status.toLowerCase())) || data.isClosed === true) {
          setChatClosedState(true);
        }
      }
    }, (err) => console.error("Error listening to chat status in modal:", err));

    return () => {
      unsubBooking();
      unsubChat();
    };
  }, [bookingId]);

  // 1. Initialize Chat Document (Self-Healing) & Subscribe to Messages
  useEffect(() => {
    if (!bookingId || !user) return;

    let unsubscribeMessages: () => void;

    async function setupChat() {
      try {
        const chatRef = doc(db, "chats", bookingId);
        const chatSnap = await getDoc(chatRef);

        if (!chatSnap.exists()) {
          // Initialize chat document if it doesn't exist yet
          await setDoc(chatRef, {
            bookingId: bookingId,
            companyId: booking.companyId,
            createdAt: new Date().toISOString(),
            lastMessageText: "Chat initialized.",
            lastSenderId: "system",
            lastMessageAt: new Date().toISOString(),
            lastRead: { [user.uid]: new Date().toISOString() }
          });
        } else {
          // Update lastRead for the current user
          await updateDoc(chatRef, {
            [`lastRead.${user.uid}`]: new Date().toISOString()
          });
        }

        // Subscribe to messages in real-time
        const messagesQuery = query(
          collection(db, "chats", bookingId, "messages"),
          orderBy("createdAt", "asc")
        );

        unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
          const msgs: Message[] = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          } as Message));
          setMessages(msgs);
          setInitializing(false);

          // Update lastRead when a new message arrives while chat is open
          if (msgs.length > 0) {
            updateDoc(chatRef, {
              [`lastRead.${user.uid}`]: new Date().toISOString()
            }).catch((err) => console.error("Failed to update lastRead:", err));
          }
        });

      } catch (err) {
        console.error("Failed to initialize booking chat:", err);
        setInitializing(false);
      }
    }

    setupChat();

    return () => {
      if (unsubscribeMessages) unsubscribeMessages();
    };
  }, [bookingId, user, booking.companyId]);

  // 2. Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, initializing]);

  // 3. Send Message Handler
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending || isClosed) return;

    setSending(true);
    const msgText = text.trim();
    setText("");

    try {
      // Add message document
      await addDoc(collection(db, "chats", bookingId, "messages"), {
        text: msgText,
        senderId: user.uid,
        senderName: user.name || user.email || "Unknown User",
        senderRole: user.role || "client",
        createdAt: new Date().toISOString()
      });

      // Update chat parent document
      await updateDoc(doc(db, "chats", bookingId), {
        lastMessageText: msgText,
        lastSenderId: user.uid,
        lastMessageAt: new Date().toISOString(),
        [`lastRead.${user.uid}`]: new Date().toISOString()
      });

      // Dispatch real-time message notifications
      try {
        const bookingRef = doc(db, "bookings", bookingId);
        const bookingSnap = await getDoc(bookingRef);
        if (bookingSnap.exists()) {
          const bookingData = bookingSnap.data();
          const companyId = bookingData.companyId;
          const clientId = bookingData.clientId;
          const talentId = bookingData.talentId;
          const selectedTalentIds = bookingData.selectedTalentIds || (bookingData.selectedTalentId ? [bookingData.selectedTalentId] : []);
          
          const notificationText = `You got a message from booking #${bookingId.substring(0, 8).toUpperCase()}`;
          const senderName = user.name || user.email || "Someone";
          
          // Target 1: Client (if sender is not client)
          if (clientId && clientId !== "guest" && clientId !== user.uid) {
            await sendNotification({
              userId: clientId,
              companyId,
              title: `New Message from ${senderName}`,
              message: notificationText,
              type: "booking",
              link: `/${companyId}/dashboard/client/bookings/all`
            });
          }

          // Target 2: Assigned Talents (if sender is not the talent)
          const allTalentsToNotify = new Set<string>();
          if (talentId && talentId !== user.uid) allTalentsToNotify.add(talentId);
          selectedTalentIds.forEach((id: string) => {
            if (id && id !== user.uid) allTalentsToNotify.add(id);
          });

          if (allTalentsToNotify.size > 0) {
            await Promise.all(
              Array.from(allTalentsToNotify).map((tid) => 
                sendNotification({
                  userId: tid,
                  companyId,
                  title: `New Message from ${senderName}`,
                  message: notificationText,
                  type: "booking",
                  link: `/${companyId}/dashboard/talent/bookings?tab=upcoming`
                })
              )
            );
          }

          // Target 3: Admins (notify all admins, excluding the sender if they are an admin/staff)
          await sendNotificationToAdmins(companyId, {
            title: `New Message from ${senderName}`,
            message: notificationText,
            type: "booking",
            link: `/${companyId}/dashboard/admin/bookings/all`
          }, user.uid);
        }
      } catch (notifyErr) {
        console.error("Failed to dispatch chat notifications:", notifyErr);
      }

    } catch (err) {
      console.error("Failed to send message:", err);
      // Put text back if it failed
      setText(msgText);
    } finally {
      setSending(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch ((role || "").toLowerCase()) {
      case "admin":
      case "staff":
      case "company_admin":
        return "bg-indigo-100 text-indigo-700 border-indigo-200";
      case "talent":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
    }
  };

  const formatMessageTime = (isoString: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl h-[80vh] flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-150 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-indigo-700 flex items-center justify-between shrink-0 text-white shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/15">
              <MessageSquare className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight truncate max-w-[280px] sm:max-w-xs">{chatTitle}</h3>
              <p className="text-[11px] text-indigo-200/80 font-mono tracking-wider">#{bookingId.slice(0, 8).toUpperCase()}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cancellation/Closed Banner */}
        {isClosed && (
          <div className="px-6 py-3 bg-rose-50 border-b border-rose-100 flex items-center gap-2 text-rose-700 text-xs font-semibold shrink-0">
            <Lock className="w-4 h-4 text-rose-500 shrink-0" />
            <span>This booking has been cancelled or completed. Chat session is closed and read-only.</span>
          </div>
        )}

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-50/50">
          {initializing ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs font-medium">
              Loading chat messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
              <MessageSquare className="w-8 h-8 text-slate-300 stroke-[1.5]" />
              <p className="text-xs font-semibold">No messages yet. Send a message to start chatting.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === user.uid;
              const isSystem = msg.senderRole === "system" || msg.senderId === "system";

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <div className="bg-slate-200/80 text-slate-600 text-[11px] font-semibold px-3 py-1 rounded-full shadow-2xs">
                      {msg.text}
                    </div>
                  </div>
                );
              }

              return (
                <div 
                  key={msg.id} 
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"} space-y-1`}
                >
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-[11px] font-bold text-slate-700">{msg.senderName}</span>
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${getRoleBadgeColor(msg.senderRole)}`}>
                      {msg.senderRole}
                    </span>
                  </div>
                  <div 
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs font-medium leading-relaxed shadow-xs ${
                      isMe 
                        ? "bg-indigo-600 text-white rounded-tr-xs" 
                        : "bg-white border border-slate-200/80 text-slate-800 rounded-tl-xs"
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-slate-400 px-1 font-mono">
                    {formatMessageTime(msg.createdAt)}
                  </span>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        {!isClosed && (
          <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your message..."
              disabled={sending}
              className="flex-1 h-12 bg-slate-50 border border-slate-200 rounded-2xl px-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
            />
            <Button
              type="submit"
              disabled={!text.trim() || sending}
              className="h-12 w-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-150 flex items-center justify-center shrink-0 transition-transform active:scale-95 disabled:scale-100 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
