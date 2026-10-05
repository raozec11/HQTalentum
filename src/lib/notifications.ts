export type NotificationType = "alert" | "info" | "success" | "booking" | "system" | "error";

export interface NotificationPayload {
  userId: string;
  companyId?: string;
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
  recipientEmail?: string;
  recipientPhone?: string;
}

// Client-side single notification helper
export const sendNotification = async (payload: NotificationPayload) => {
  try {
    if (typeof window !== "undefined") {
      const res = await fetch("/api/notifications/send-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return await res.json();
    }
  } catch (error) {
    console.error("sendNotification failed:", error);
  }
};

// Client-side send to admins helper
export const sendNotificationToAdmins = async (
  companyId: string,
  payload: Omit<NotificationPayload, "userId">,
  excludeUserId?: string
) => {
  try {
    if (typeof window !== "undefined") {
      const res = await fetch("/api/notifications/send-to-admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, payload, excludeUserId }),
      });
      const data = await res.json();
      console.log("sendNotificationToAdmins response:", data);
      return data;
    }
  } catch (error) {
    console.error("sendNotificationToAdmins failed:", error);
  }
};

// Client-side send to matching talents helper
export const sendNotificationToTalents = async (
  companyId: string,
  payload: Omit<NotificationPayload, "userId">,
  bookingData?: any
) => {
  try {
    if (typeof window !== "undefined") {
      const res = await fetch("/api/notifications/send-to-talents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, payload, bookingData }),
      });
      const data = await res.json();
      console.log("sendNotificationToTalents response:", data);
      return data;
    }
  } catch (error) {
    console.error("sendNotificationToTalents failed:", error);
  }
};
