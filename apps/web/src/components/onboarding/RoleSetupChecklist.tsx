import { useEffect, useMemo, useState } from "react";
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

const CHECKLIST_VERSION = "v1";

function checklistStorageKey(role: Role) {
  return `pawnloop-role-checklist-${role}-${CHECKLIST_VERSION}`;
}

function collapsedStorageKey(role: Role) {
  return `pawnloop-role-checklist-collapsed-${role}-${CHECKLIST_VERSION}`;
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

function hasCollapsedPreference(role: Role) {
  try {
    return window.localStorage.getItem(collapsedStorageKey(role)) !== null;
  } catch {
    return false;
  }
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

  const [hasManualCollapsePreference, setHasManualCollapsePreference] =
    useState(() =>
      supportedRole ? hasCollapsedPreference(role) : false,
    );

  useEffect(() => {
    if (!supportedRole) return;

    setCompleted(readCompleted(role));
    setCollapsed(readCollapsed(role));
    setHasManualCollapsePreference(hasCollapsedPreference(role));
  }, [role, supportedRole]);

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

        <button
          type="button"
          className="role-checklist-collapse"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
        >
          {collapsed ? "Open" : "Hide"}
        </button>
      </div>

      <div
        className="role-checklist-progress"
        aria-label={`${progress}% complete`}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      {!collapsed ? (
        <>
          <div className="role-checklist-items">
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
