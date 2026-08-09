import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getMyNotifications,
  markNotificationRead,
  type InAppNotification,
} from "../services/notifications";

type NotificationCenterProps = {
  placement?: "desktop" | "mobile";
};

export default function NotificationCenter({
  placement = "desktop",
}: NotificationCenterProps) {
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [markReadError, setMarkReadError] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pendingIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    getMyNotifications(controller.signal)
      .then((notifications) => {
        setItems(notifications);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadState("error");
      });
    return () => controller.abort();
  }, []);

  const unread = items.filter((item) => !item.readAt);

  useEffect(() => {
    function closeAndRestoreFocus() {
      const details = detailsRef.current;
      if (!details?.open) return;
      details.open = false;
      details.querySelector<HTMLElement>("summary")?.focus();
    }

    function handlePointerDown(event: PointerEvent) {
      if (!detailsRef.current?.contains(event.target as Node)) {
        closeAndRestoreFocus();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeAndRestoreFocus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  async function handleMarkRead(id: string) {
    if (pendingIdsRef.current.has(id)) return;
    pendingIdsRef.current.add(id);
    setPendingIds(new Set(pendingIdsRef.current));
    setMarkReadError(null);

    try {
      await markNotificationRead(id);
      setItems((current) =>
        current.map((entry) =>
          entry.id === id
            ? { ...entry, readAt: new Date().toISOString() }
            : entry,
        ),
      );
    } catch {
      setMarkReadError("Could not mark the notification as read. Try again.");
    } finally {
      pendingIdsRef.current.delete(id);
      setPendingIds(new Set(pendingIdsRef.current));
    }
  }

  return (
    <details
      className={`site-notifications site-notifications--${placement}`}
      ref={detailsRef}
    >
      <summary
        aria-label={`${unread.length} unread notification${unread.length === 1 ? "" : "s"}`}
        aria-controls={`site-notifications-panel-${placement}`}
      >
        {placement === "mobile" ? "Alerts" : "Notifications"} ({unread.length})
      </summary>
      <div
        className="site-notifications__panel"
        id={`site-notifications-panel-${placement}`}
        aria-label="Notifications"
      >
        <div className="site-notifications__heading">
          <strong>Notifications</strong>
          <span>{unread.length} unread</span>
        </div>
        {loadState === "loading" ? (
          <p className="site-notifications__state" role="status">
            Loading notifications…
          </p>
        ) : null}
        {loadState === "error" ? (
          <p className="site-notifications__state site-notifications__error" role="alert">
            Notifications could not be loaded. Close and try again later.
          </p>
        ) : null}
        {loadState === "ready" && unread.length === 0 ? (
          <p className="site-notifications__state">You’re all caught up.</p>
        ) : null}
        {markReadError ? (
          <p className="site-notifications__state site-notifications__error" role="alert">
            {markReadError}
          </p>
        ) : null}
        {unread.map((item) => (
          <article className="site-notifications__item" key={item.id}>
            <div className="site-notifications__item-heading">
              <strong className="site-notifications__title">{item.title}</strong>
              <span className="site-notifications__unread">Unread</span>
            </div>
            <p className="site-notifications__message">{item.message}</p>
            <time className="site-notifications__time" dateTime={item.createdAt}>
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(item.createdAt))}
            </time>
            <div className="site-notifications__actions">
              {item.actionUrl ? (
                <Link className="site-notifications__view" to={item.actionUrl}>
                  View
                </Link>
              ) : null}
              <button
                type="button"
                className="site-notifications__mark-read"
                disabled={pendingIds.has(item.id)}
                onClick={() => void handleMarkRead(item.id)}
              >
                {pendingIds.has(item.id) ? "Marking read…" : "Mark read"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}
