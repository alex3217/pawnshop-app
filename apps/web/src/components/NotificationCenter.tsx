import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getMyNotifications,
  markNotificationRead,
  type InAppNotification,
} from "../services/notifications";

export default function NotificationCenter() {
  const [items, setItems] = useState<InAppNotification[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    getMyNotifications(controller.signal)
      .then(setItems)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const unread = items.filter((item) => !item.readAt);
  if (unread.length === 0) return null;

  return (
    <details className="site-notifications">
      <summary aria-label={`${unread.length} unread notifications`}>
        Notifications ({unread.length})
      </summary>
      <div className="site-notifications__panel">
        {unread.map((item) => (
          <article key={item.id}>
            <strong>{item.title}</strong>
            <p>{item.message}</p>
            <div>
              {item.actionUrl ? <Link to={item.actionUrl}>View</Link> : null}
              <button
                type="button"
                onClick={() => {
                  void markNotificationRead(item.id).then(() =>
                    setItems((current) =>
                      current.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, readAt: new Date().toISOString() }
                          : entry,
                      ),
                    ),
                  );
                }}
              >
                Mark read
              </button>
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}
