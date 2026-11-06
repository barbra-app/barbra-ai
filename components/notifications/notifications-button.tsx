"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Megaphone, Mic2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFirebaseIdToken } from "@/lib/firebase/client";
import type { AppNotification } from "@/lib/domain/analytics";

export function NotificationsButton() {
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const unreadCount = notifications?.filter((item) => !item.read).length ?? 0;

  async function load() {
    const token = await getFirebaseIdToken();
    if (!token) return;
    const response = await fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const payload = await response.json() as { data: AppNotification[] };
    setNotifications(payload.data);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function markRead(id: string) {
    setNotifications((current) => current?.map((item) => (item.id === id ? { ...item, read: true } : item)) ?? current);
    const token = await getFirebaseIdToken();
    if (!token) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  return (
    <div className="notifications-root">
      <button
        className="notifications-trigger"
        aria-label="Abrir notificaciones"
        aria-controls="notifications-panel"
        popoverTarget="notifications-panel"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && <span className="notifications-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      <section className="notifications-panel" id="notifications-panel" aria-label="Notificaciones" popover="auto" ref={panelRef}>
        <header className="notifications-header">
          <strong>Notificaciones</strong>
          <button popoverTarget="notifications-panel" popoverTargetAction="hide" aria-label="Cerrar notificaciones"><X className="size-4" /></button>
        </header>
        {!notifications || notifications.length === 0 ? (
          <div className="notifications-empty">
            <BellOff className="size-5" />
            <p>No tienes notificaciones por ahora</p>
          </div>
        ) : (
          <ul className="notifications-list">
            {notifications.map((item) => (
              <li key={item.id} className={cn("notifications-item", !item.read && "unread")}>
                <button onClick={() => markRead(item.id)}>
                  <span className="notifications-item-icon">
                    {item.type === "artist_created" ? <Mic2 className="size-4" /> : <Megaphone className="size-4" />}
                  </span>
                  <span className="notifications-item-body">
                    <strong>{item.title}</strong>
                    <p>{item.message}</p>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
