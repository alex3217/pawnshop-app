import { api } from "./apiClient";

export type InAppNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function getMyNotifications(signal?: AbortSignal) {
  const response = await api.get<{
    success: true;
    notifications: InAppNotification[];
  }>("/notifications", { signal });
  return response.notifications;
}

export async function markNotificationRead(id: string) {
  await api.patch(`/notifications/${encodeURIComponent(id)}/read`, {});
}
