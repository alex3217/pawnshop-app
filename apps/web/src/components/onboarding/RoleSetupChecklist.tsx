import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link } from "react-router-dom";
import type { Role } from "../../services/auth";
import "../../styles/role-setup-checklist.css";

type RoleSetupChecklistProps = {
  role: Role | null;
};

type ChecklistItem = {
  id: string;
  label: string;
  description: string;
  href: string;
};

type FloatingPosition = {
  x: number;
  y: number;
};

type ShortcutDragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  lastPosition: FloatingPosition;
};

const CHECKLIST_VERSION = "v1";

function checklistStorageKey(role: Role) {
  return `pawnloop-role-checklist-${role}-${CHECKLIST_VERSION}`;
}

function collapsedStorageKey(role: Role) {
  return `pawnloop-role-checklist-collapsed-${role}-${CHECKLIST_VERSION}`;
}

function dismissedStorageKey(role: Role) {
  return `pawnloop-role-checklist-dismissed-${role}-${CHECKLIST_VERSION}`;
}

function shortcutHiddenStorageKey(role: Role) {
  return `pawnloop-role-checklist-shortcut-hidden-${role}-${CHECKLIST_VERSION}`;
}

function shortcutPositionStorageKey(role: Role) {
  return `pawnloop-role-checklist-shortcut-position-${role}-${CHECKLIST_VERSION}`;
}

function getChecklistItems(role: Role): ChecklistItem[] {
  if (role === "OWNER") {
    return [
      {
        id: "shop-profile",
        label: "Complete shop profile",
        description: "Add your business name, contact details, and shop information.",
        href: "/owner/onboarding",
      },
      {
        id: "shop-location",
        label: "Add a location",
        description: "Set the address and operating details for your pawn shop.",
        href: "/owner/locations",
      },
      {
        id: "first-item",
        label: "Create your first item",
        description: "Add inventory manually or scan an item.",
        href: "/owner/items/new",
      },
      {
        id: "scan-item",
        label: "Try the scanner",
        description: "Scan a barcode, QR code, SKU, or pawn tag.",
        href: "/owner/scan-console",
      },
      {
        id: "publish-inventory",
        label: "Review inventory",
        description: "Confirm your items are accurate and ready for buyers.",
        href: "/owner/inventory",
      },
      {
        id: "staff",
        label: "Review staff access",
        description: "Invite staff or confirm owner-only access.",
        href: "/owner/staff",
      },
      {
        id: "subscription",
        label: "Review your plan",
        description: "Check limits, usage, billing, and available upgrades.",
        href: "/owner/subscription",
      },
    ];
  }

  return [
    {
      id: "buyer-dashboard",
      label: "Open your dashboard",
      description: "Review bids, offers, saved items, and nearby inventory.",
      href: "/buyer/dashboard",
    },
    {
      id: "marketplace",
      label: "Browse the Marketplace",
      description: "Search available items from PawnLoop sellers and shops.",
      href: "/marketplace",
    },
    {
      id: "location",
      label: "Use Item Locator",
      description: "Find inventory and pawn shops near your location.",
      href: "/buyer/item-locator",
    },
    {
      id: "watchlist",
      label: "Save an item",
      description: "Add an item to your Watchlist for quick access.",
      href: "/watchlist",
    },
    {
      id: "offers",
      label: "Review offers",
      description: "Send, receive, and manage marketplace offers.",
      href: "/offers",
    },
    {
      id: "auctions",
      label: "Browse auctions",
      description: "Review active auctions and place a test bid.",
      href: "/auctions",
    },
    {
      id: "sell-pawn",
      label: "Explore selling or pawning",
      description: "Submit an item to sell or request a pawn offer.",
      href: "/buyer/sell-item",
    },
  ];
}

function readCompleted(role: Role): string[] {
  try {
    const raw = window.localStorage.getItem(checklistStorageKey(role));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function readCollapsed(role: Role) {
  try {
    return window.localStorage.getItem(collapsedStorageKey(role)) === "true";
  } catch {
    return false;
  }
}

function readDismissed(role: Role) {
  if (role !== "OWNER") return false;

  try {
    return window.localStorage.getItem(dismissedStorageKey(role)) === "true";
  } catch {
    return false;
  }
}

function readShortcutHidden(role: Role) {
  if (role !== "OWNER") return false;

  try {
    return (
      window.localStorage.getItem(shortcutHiddenStorageKey(role)) === "true"
    );
  } catch {
    return false;
  }
}

function readShortcutPosition(role: Role): FloatingPosition | null {
  if (role !== "OWNER") return null;

  try {
    const raw = window.localStorage.getItem(shortcutPositionStorageKey(role));
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    return Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)
      ? { x: parsed.x, y: parsed.y }
      : null;
  } catch {
    return null;
  }
}

function hasCollapsedPreference(role: Role) {
  try {
    return window.localStorage.getItem(collapsedStorageKey(role)) !== null;
  } catch {
    return false;
  }
}

function clampShortcutPosition(
  position: FloatingPosition,
  element: HTMLElement | null,
): FloatingPosition {
  const margin = 12;
  const width = element?.offsetWidth ?? 220;
  const height = element?.offsetHeight ?? 48;
  const headerBottom =
    document.querySelector<HTMLElement>(".site-header")
      ?.getBoundingClientRect().bottom ?? 0;
  const minimumY = Math.max(margin, headerBottom + margin);

  return {
    x: Math.min(
      Math.max(margin, position.x),
      Math.max(margin, window.innerWidth - width - margin),
    ),
    y: Math.min(
      Math.max(minimumY, position.y),
      Math.max(minimumY, window.innerHeight - height - margin),
    ),
  };
}

export default function RoleSetupChecklist({
  role,
}: RoleSetupChecklistProps) {
  const supportedRole = role === "OWNER" || role === "CONSUMER";

  const items = useMemo(
    () => (supportedRole ? getChecklistItems(role) : []),
    [role, supportedRole],
  );

  const [completed, setCompleted] = useState<string[]>(() =>
    supportedRole ? readCompleted(role) : [],
  );

  const [collapsed, setCollapsed] = useState(() =>
    supportedRole ? readCollapsed(role) : false,
  );

  const [dismissed, setDismissed] = useState(() =>
    supportedRole ? readDismissed(role) : false,
  );

  const [shortcutHidden, setShortcutHidden] = useState(() =>
    supportedRole ? readShortcutHidden(role) : false,
  );

  const [shortcutPosition, setShortcutPosition] =
    useState<FloatingPosition | null>(() =>
      supportedRole ? readShortcutPosition(role) : null,
    );

  const shortcutRef = useRef<HTMLElement | null>(null);
  const shortcutPositionRef = useRef<FloatingPosition | null>(
    shortcutPosition,
  );
  const shortcutDragRef = useRef<ShortcutDragState | null>(null);

  const [hasManualCollapsePreference, setHasManualCollapsePreference] =
    useState(() =>
      supportedRole ? hasCollapsedPreference(role) : false,
    );

  useEffect(() => {
    if (!supportedRole) return;

    setCompleted(readCompleted(role));
    setCollapsed(readCollapsed(role));
    setDismissed(readDismissed(role));
    setShortcutHidden(readShortcutHidden(role));
    setShortcutPosition(readShortcutPosition(role));
    setHasManualCollapsePreference(hasCollapsedPreference(role));
  }, [role, supportedRole]);

  useEffect(() => {
    shortcutPositionRef.current = shortcutPosition;
  }, [shortcutPosition]);

  useEffect(() => {
    if (role !== "OWNER") return;

    const restoreFromSetupTab = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const url = new URL(anchor.href, window.location.origin);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== "/owner/onboarding"
      ) {
        return;
      }

      setDismissed(false);
      setShortcutHidden(false);
      setCollapsed(false);
      setHasManualCollapsePreference(true);

      try {
        window.localStorage.setItem(dismissedStorageKey(role), "false");
        window.localStorage.setItem(shortcutHiddenStorageKey(role), "false");
        window.localStorage.setItem(collapsedStorageKey(role), "false");
      } catch {
        // Ignore storage errors.
      }
    };

    document.addEventListener("click", restoreFromSetupTab, true);

    return () => {
      document.removeEventListener("click", restoreFromSetupTab, true);
    };
  }, [role]);

  useEffect(() => {
    if (role !== "OWNER" || !dismissed || shortcutHidden) return;

    const keepShortcutVisible = () => {
      const current = shortcutPositionRef.current;
      if (!current) return;

      const next = clampShortcutPosition(current, shortcutRef.current);
      if (next.x === current.x && next.y === current.y) return;

      shortcutPositionRef.current = next;
      setShortcutPosition(next);

      try {
        window.localStorage.setItem(
          shortcutPositionStorageKey(role),
          JSON.stringify(next),
        );
      } catch {
        // Ignore storage errors.
      }
    };

    keepShortcutVisible();
    window.addEventListener("resize", keepShortcutVisible);

    return () => {
      window.removeEventListener("resize", keepShortcutVisible);
    };
  }, [dismissed, role, shortcutHidden]);

  useEffect(() => {
    if (!supportedRole || hasManualCollapsePreference) return;

    const mediaQuery = window.matchMedia("(max-width: 1100px)");

    const syncResponsiveState = (event?: MediaQueryListEvent) => {
      setCollapsed(event ? event.matches : mediaQuery.matches);
    };

    syncResponsiveState();
    mediaQuery.addEventListener("change", syncResponsiveState);

    return () => {
      mediaQuery.removeEventListener("change", syncResponsiveState);
    };
  }, [hasManualCollapsePreference, supportedRole]);

  if (!supportedRole) return null;

  const activeRole = role as Extract<Role, "OWNER" | "CONSUMER">;

  const completedCount = items.filter((item) =>
    completed.includes(item.id),
  ).length;

  const progress =
    items.length > 0
      ? Math.round((completedCount / items.length) * 100)
      : 0;

  function toggleItem(itemId: string) {
    setCompleted((current) => {
      const next = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId];

      try {
        window.localStorage.setItem(
          checklistStorageKey(activeRole),
          JSON.stringify(next),
        );
      } catch {
        // Checklist still works for the current session.
      }

      return next;
    });
  }

  function toggleCollapsed() {
    setHasManualCollapsePreference(true);

    setCollapsed((current) => {
      const next = !current;

      try {
        window.localStorage.setItem(
          collapsedStorageKey(activeRole),
          String(next),
        );
      } catch {
        // Ignore storage errors.
      }

      return next;
    });
  }

  function resetChecklist() {
    setCompleted([]);

    try {
      window.localStorage.removeItem(checklistStorageKey(activeRole));
    } catch {
      // Ignore storage errors.
    }
  }

  function dismissOwnerSetup() {
    if (activeRole !== "OWNER") return;

    setDismissed(true);
    setShortcutHidden(false);

    try {
      window.localStorage.setItem(dismissedStorageKey(activeRole), "true");
      window.localStorage.setItem(
        shortcutHiddenStorageKey(activeRole),
        "false",
      );
    } catch {
      // Ignore storage errors.
    }
  }

  function permanentlyHideOwnerSetup() {
    if (activeRole !== "OWNER") return;

    setShortcutHidden(true);

    try {
      window.localStorage.setItem(
        shortcutHiddenStorageKey(activeRole),
        "true",
      );
    } catch {
      // Ignore storage errors.
    }
  }

  function returnToOwnerSetup() {
    if (activeRole !== "OWNER") return;

    setDismissed(false);
    setShortcutHidden(false);
    setCollapsed(false);
    setHasManualCollapsePreference(true);

    try {
      window.localStorage.setItem(dismissedStorageKey(activeRole), "false");
      window.localStorage.setItem(
        shortcutHiddenStorageKey(activeRole),
        "false",
      );
      window.localStorage.setItem(collapsedStorageKey(activeRole), "false");
    } catch {
      // Ignore storage errors.
    }
  }

  function saveShortcutPosition(position: FloatingPosition) {
    shortcutPositionRef.current = position;
    setShortcutPosition(position);

    try {
      window.localStorage.setItem(
        shortcutPositionStorageKey(activeRole),
        JSON.stringify(position),
      );
    } catch {
      // Ignore storage errors.
    }
  }

  function startShortcutDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0) return;

    const element = shortcutRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const startingPosition = clampShortcutPosition(
      { x: rect.left, y: rect.top },
      element,
    );

    saveShortcutPosition(startingPosition);

    shortcutDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      lastPosition: startingPosition,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveShortcut(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = shortcutDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const next = clampShortcutPosition(
      {
        x: event.clientX - drag.offsetX,
        y: event.clientY - drag.offsetY,
      },
      shortcutRef.current,
    );

    drag.lastPosition = next;
    shortcutPositionRef.current = next;
    setShortcutPosition(next);
    event.preventDefault();
  }

  function finishShortcutDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const drag = shortcutDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    saveShortcutPosition(drag.lastPosition);
    shortcutDragRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (activeRole === "OWNER" && dismissed) {
    if (shortcutHidden) return null;

    return (
      <aside
        ref={shortcutRef}
        className="role-checklist role-checklist-collapsed role-checklist-return"
        aria-label="Return to pawn shop owner setup"
        style={
          shortcutPosition
            ? {
                left: `${shortcutPosition.x}px`,
                top: `${shortcutPosition.y}px`,
                right: "auto",
                bottom: "auto",
              }
            : undefined
        }
      >
        <div className="role-checklist-return-actions">
          <button
            type="button"
            className="role-checklist-drag-handle"
            aria-label="Move owner setup shortcut"
            title="Drag to move"
            onPointerDown={startShortcutDrag}
            onPointerMove={moveShortcut}
            onPointerUp={finishShortcutDrag}
            onPointerCancel={finishShortcutDrag}
          >
            <span aria-hidden="true">⋮⋮</span>
          </button>

          <button
            type="button"
            className="role-checklist-remove-button"
            onClick={permanentlyHideOwnerSetup}
            aria-label="Remove owner setup shortcut from screen"
            title="Remove from screen"
          >
            <span aria-hidden="true">×</span>
          </button>

          <button
            type="button"
            className="role-checklist-return-button"
            onClick={returnToOwnerSetup}
            aria-label="Owner setup"
          >
            <span className="role-checklist-return-label">Owner setup</span>
            <span
              className="role-checklist-return-label-short"
              aria-hidden="true"
            >
              Setup
            </span>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={
        collapsed
          ? "role-checklist role-checklist-collapsed"
          : "role-checklist"
      }
      aria-label={
        role === "OWNER"
          ? "Pawn shop owner setup checklist"
          : "Buyer setup checklist"
      }
    >
      <div className="role-checklist-header">
        <div>
          <span className="role-checklist-eyebrow">
            {role === "OWNER" ? "Owner setup" : "Buyer setup"}
          </span>
          <strong>
            {completedCount} of {items.length} complete
          </strong>
        </div>

        <div className="role-checklist-header-actions">
          <button
            type="button"
            className="role-checklist-collapse"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
          >
            {collapsed ? "Open" : "Hide"}
          </button>

          {activeRole === "OWNER" ? (
            <button
              type="button"
              className="role-checklist-close"
              onClick={dismissOwnerSetup}
            >
              Close setup
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="role-checklist-progress"
        aria-label={`${progress}% complete`}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      {!collapsed ? (
        <>
          <div
            className="role-checklist-items"
            tabIndex={0}
            aria-label={
              activeRole === "OWNER"
                ? "Owner setup checklist items"
                : "Buyer setup checklist items"
            }
          >
            {items.map((item) => {
              const isComplete = completed.includes(item.id);

              return (
                <article
                  key={item.id}
                  className={
                    isComplete
                      ? "role-checklist-item complete"
                      : "role-checklist-item"
                  }
                >
                  <button
                    type="button"
                    className="role-checklist-check"
                    onClick={() => toggleItem(item.id)}
                    aria-label={
                      isComplete
                        ? `Mark ${item.label} incomplete`
                        : `Mark ${item.label} complete`
                    }
                  >
                    {isComplete ? "✓" : ""}
                  </button>

                  <div>
                    <Link to={item.href}>{item.label}</Link>
                    <p>{item.description}</p>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="role-checklist-footer">
            <span>{progress}% complete</span>

            <button type="button" onClick={resetChecklist}>
              Reset
            </button>
          </div>
        </>
      ) : null}
    </aside>
  );
}
