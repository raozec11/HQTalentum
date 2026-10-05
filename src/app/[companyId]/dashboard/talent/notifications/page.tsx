"use client";

import { useAuth } from "@/context/AuthContext";
import { NotificationsView } from "@/components/notifications/NotificationsView";

export default function TalentNotificationsPage() {
  const { user } = useAuth();

  if (!user) return null;

  return <NotificationsView userId={user.uid} />;
}
