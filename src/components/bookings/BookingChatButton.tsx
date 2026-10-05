"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BookingChatButtonProps {
  bookingId: string;
  userId: string;
  className?: string;
  variant?: "outline" | "default" | "ghost" | "secondary";
  iconOnly?: boolean;
  onClick: () => void;
}

export function BookingChatButton({
  bookingId,
  userId,
  className = "",
  variant = "outline",
  iconOnly = false,
  onClick,
}: BookingChatButtonProps) {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!bookingId || !userId) return;

    // Subscribe to the chat document to track unread messages
    const unsubscribe = onSnapshot(
      doc(db, "chats", bookingId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const lastMessageAt = data.lastMessageAt;
          const lastSenderId = data.lastSenderId;
          const lastReadMap = data.lastRead || {};
          const myLastRead = lastReadMap[userId];

          // If the last message was sent by someone else
          if (lastMessageAt && lastSenderId !== userId) {
            if (!myLastRead) {
              setHasUnread(true);
            } else {
              const msgTime = new Date(lastMessageAt).getTime();
              const readTime = new Date(myLastRead).getTime();
              setHasUnread(msgTime > readTime);
            }
          } else {
            setHasUnread(false);
          }
        } else {
          setHasUnread(false);
        }
      },
      (err) => {
        console.error("Error listening to chat unread status:", err);
      }
    );

    return () => unsubscribe();
  }, [bookingId, userId]);

  if (iconOnly) {
    return (
      <button
        onClick={onClick}
        type="button"
        className={`relative p-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 transition-all hover:scale-105 active:scale-95 shadow-sm text-slate-800 hover:text-indigo-600 ${className}`}
        title="Open Chat"
      >
        <MessageSquare className="w-4 h-4 text-slate-700" />
        {hasUnread && (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white animate-pulse" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      type="button"
      className={`relative rounded-xl h-9 px-4 text-[12px] font-extrabold flex items-center justify-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm border ${
        hasUnread 
          ? "border-rose-600 text-white bg-rose-600 hover:bg-rose-700 shadow-md" 
          : "border-slate-300 text-slate-800 bg-white hover:bg-slate-50 hover:text-slate-900"
      } ${className}`}
    >
      <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${hasUnread ? "text-white animate-bounce" : "text-slate-600"}`} />
      <span className={hasUnread ? "text-white font-black" : "text-slate-800 font-extrabold"}>Chat</span>
      {hasUnread && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500 border border-white" />
        </span>
      )}
    </button>
  );
}
