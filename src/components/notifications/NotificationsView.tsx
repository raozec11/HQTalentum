"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch } from "firebase/firestore";
import { Bell, Info, CheckCircle2, AlertTriangle, Calendar, Trash2, CheckCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { showSuccess, showError } from "@/lib/alerts";

interface NotificationsViewProps {
  userId: string;
}

export function NotificationsView({ userId }: NotificationsViewProps) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => {
          const aTime = a.createdAt?.toMillis?.() ?? new Date(a.createdAt || 0).getTime();
          const bTime = b.createdAt?.toMillis?.() ?? new Date(b.createdAt || 0).getTime();
          return bTime - aTime;
        });
      setNotifications(notifs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching notifications:", error);
      showError("Failed to load notifications. You may need to create a Firestore index.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), {
        isRead: true
      });
    } catch (error) {
      console.error("Error marking as read", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const batch = writeBatch(db);
      notifications.filter(n => !n.isRead).forEach(n => {
        const notifRef = doc(db, "notifications", n.id);
        batch.update(notifRef, { isRead: true });
      });
      await batch.commit();
      showSuccess("All notifications marked as read.");
    } catch (error) {
      console.error("Error marking all as read", error);
      showError("Failed to mark all as read.");
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "notifications", id));
      await batch.commit();
    } catch (error) {
      console.error("Error deleting notification", error);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to delete all notifications?")) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach(n => {
        batch.delete(doc(db, "notifications", n.id));
      });
      await batch.commit();
      showSuccess("All notifications cleared.");
    } catch (error) {
      console.error("Error clearing all notifications", error);
      showError("Failed to clear notifications.");
    }
  };

  const handleClick = (notif: any) => {
    if (!notif.isRead) {
      handleMarkAsRead(notif.id);
    }
    if (notif.link) {
      router.push(notif.link);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "alert": return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case "success": return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case "booking": return <Calendar className="w-5 h-5 text-indigo-500" />;
      case "info":
      case "system":
      default: return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getBgColor = (type: string, isRead: boolean) => {
    if (isRead) return "bg-white";
    switch (type) {
      case "alert": return "bg-red-50";
      case "success": return "bg-green-50";
      case "booking": return "bg-indigo-50";
      case "info":
      case "system":
      default: return "bg-blue-50";
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 mt-8 px-4 sm:px-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center border border-indigo-100">
            <Bell className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Notifications</h1>
            <p className="text-slate-500 font-medium mt-1">
              {unreadCount > 0 ? `You have ${unreadCount} unread messages` : "You're all caught up!"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {notifications.length > 0 && (
            <>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 border-2 border-indigo-100 text-indigo-600 bg-white rounded-xl font-bold hover:bg-indigo-50 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span className="whitespace-nowrap">Mark all read</span>
                </button>
              )}
              <button
                onClick={handleClearAll}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 border-2 border-red-100 text-red-600 bg-white rounded-xl font-bold hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className="whitespace-nowrap">Clear all</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden min-h-[400px]">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-16 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <Bell className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">No notifications yet</h3>
            <p className="text-slate-500 max-w-sm">When you have new updates, alerts, or messages, they will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`p-5 flex items-start gap-4 transition-colors cursor-pointer hover:bg-slate-50 ${getBgColor(notif.type, notif.isRead)}`}
              >
                <div className="mt-1 flex-shrink-0">
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h4 className={`text-sm font-bold capitalize truncate ${notif.isRead ? "text-slate-700" : "text-slate-900"}`}>
                      {notif.title}
                    </h4>
                    <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                      {notif.createdAt ? formatDistanceToNow(notif.createdAt.toDate(), { addSuffix: true }) : "Just now"}
                    </span>
                  </div>
                  <p className={`text-sm leading-relaxed ${notif.isRead ? "text-slate-500" : "text-slate-700 font-medium"}`}>
                    {notif.message}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!notif.isRead && (
                    <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" title="Unread" />
                  )}
                  <button
                    onClick={(e) => handleDelete(notif.id, e)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 sm:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
