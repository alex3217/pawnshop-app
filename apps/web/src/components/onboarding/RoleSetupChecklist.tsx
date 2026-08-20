import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import type { Role } from "../../services/auth";
import { getMyShops, getShopOnboardingProgress } from "../../services/shops";
import { emptyOwnerReadiness, type OwnerReadinessItem, type OwnerReadinessSummary } from "../../services/ownerOnboardingReadiness";
import { ownerSetupHref, selectActiveOwnerShopId, subscribeToActiveOwnerShop } from "../../services/ownerActiveShop";
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
    const parsed = JSON.parse(
      window.localStorage.getItem(checklistStorageKey(role)) || "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export default function RoleSetupChecklist({
  role,
}: RoleSetupChecklistProps) {
  const supportedRole = role === "OWNER" || role === "CONSUMER";
  const activeRole = supportedRole ? role : null;
  const items = useMemo(
    () => (activeRole ? getChecklistItems(activeRole) : []),
    [activeRole],
  );
  const [completed, setCompleted] = useState<string[]>(() =>
    activeRole ? readCompleted(activeRole) : [],
  );
  const [ownerProgress, setOwnerProgress] = useState<OwnerReadinessSummary>(emptyOwnerReadiness);
  const [ownerShopId, setOwnerShopId] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const closePanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  const closePanelAndRestoreFocus = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!activeRole) return;
    setCompleted(readCompleted(activeRole));
    setIsOpen(false);
  }, [activeRole]);

  useEffect(() => {
    if (activeRole !== "OWNER") return;
    const controller = new AbortController();
    let refreshVersion = 0;
    const refresh = async (preferredShopId = "") => {
      const version = ++refreshVersion;
      try {
        const shops = await getMyShops(controller.signal);
        if (controller.signal.aborted || version !== refreshVersion) return;
        const shopId = selectActiveOwnerShopId(shops, preferredShopId);
        setOwnerShopId(shopId);
        const progress = shopId
          ? await getShopOnboardingProgress(shopId, controller.signal)
          : emptyOwnerReadiness();
        if (controller.signal.aborted || version !== refreshVersion) return;
        setOwnerProgress(progress);
      } catch (error) {
        if (!controller.signal.aborted && version === refreshVersion) console.warn("[owner-setup] Unable to refresh progress", error);
      }
    };
    const onRefresh = () => void refresh();
    const unsubscribe = subscribeToActiveOwnerShop((shopId) => void refresh(shopId));
    void refresh();
    window.addEventListener("pawnloop:owner-setup-updated", onRefresh);
    return () => {
      refreshVersion += 1;
      controller.abort();
      window.removeEventListener("pawnloop:owner-setup-updated", onRefresh);
      unsubscribe();
    };
  }, [activeRole]);

  useEffect(() => {
    if (!isOpen) return;

    closeRef.current?.focus();
    const header = document.querySelector<HTMLElement>(".site-header");

    const updateAvailableViewport = () => {
      const headerBottom = Math.max(
        0,
        header?.getBoundingClientRect().bottom || 0,
      );
      containerRef.current?.style.setProperty(
        "--role-setup-viewport-top",
        `${headerBottom}px`,
      );
    };
    const headerObserver =
      header && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateAvailableViewport)
        : null;

    updateAvailableViewport();
    if (header && headerObserver) {
      headerObserver.observe(header);
    }
    window.addEventListener("resize", updateAvailableViewport);

    const closeOnOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        closePanel();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePanelAndRestoreFocus();
    };

    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      headerObserver?.disconnect();
      window.removeEventListener("resize", updateAvailableViewport);
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [closePanel, closePanelAndRestoreFocus, isOpen]);

  if (!activeRole) return null;

  const displayedItems = activeRole === "OWNER" ? ownerProgress.items : items;
  const completedCount = activeRole === "OWNER"
    ? ownerProgress.completedCount
    : items.filter((item) => completed.includes(item.id)).length;
  const totalCount = activeRole === "OWNER" ? ownerProgress.totalCount : items.length;
  const progress = activeRole === "OWNER"
    ? ownerProgress.percentComplete
    : totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  function toggleItem(itemId: string) {
    setCompleted((current) => {
      const next = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId];
      try {
        window.localStorage.setItem(
          checklistStorageKey(activeRole as Role),
          JSON.stringify(next),
        );
      } catch {
        // Checklist still works for the current session.
      }
      return next;
    });
  }

  function resetChecklist() {
    setCompleted([]);
    try {
      window.localStorage.removeItem(checklistStorageKey(activeRole as Role));
    } catch {
      // Ignore storage errors.
    }
  }

  return (
    <div
      className={
        isOpen
          ? "role-setup-control role-setup-control-open"
          : "role-setup-control"
      }
      ref={containerRef}
    >
      {isOpen ? (
        <aside
          id="role-setup-panel"
          className="role-checklist"
          aria-label={
            activeRole === "OWNER"
              ? "Pawn shop owner setup checklist"
              : "Buyer setup checklist"
          }
        >
          <div className="role-checklist-header">
            <div>
              <span className="role-checklist-eyebrow">
                {activeRole === "OWNER" ? "Owner setup" : "Buyer setup"}
              </span>
              <strong>
                {completedCount} of {totalCount} complete
              </strong>
            </div>
            <button
              ref={closeRef}
              type="button"
              className="role-checklist-close"
              onClick={closePanelAndRestoreFocus}
            >
              Close setup
            </button>
          </div>

          <div
            className="role-checklist-progress"
            aria-label={`${progress}% complete`}
          >
            <span style={{ width: `${progress}%` }} />
          </div>

          <div
            className="role-checklist-items"
            tabIndex={0}
            aria-label={`${activeRole === "OWNER" ? "Owner" : "Buyer"} setup checklist items`}
          >
            {displayedItems.map((item) => {
              const ownerItem = activeRole === "OWNER" ? item as OwnerReadinessItem : null;
              const isComplete = ownerItem ? ownerItem.complete : completed.includes(item.id);
              return (
                <article
                  key={item.id}
                  className={
                    isComplete
                      ? "role-checklist-item complete"
                      : "role-checklist-item"
                  }
                >
                  {activeRole === "OWNER" ? (
                    <span className="role-checklist-check" aria-hidden="true">{isComplete ? "✓" : ""}</span>
                  ) : (
                    <button type="button" className="role-checklist-check" onClick={() => toggleItem(item.id)} aria-label={isComplete ? `Mark ${item.label} incomplete` : `Mark ${item.label} complete`}>
                      {isComplete ? "✓" : ""}
                    </button>
                  )}
                  <div>
                    <Link to={ownerItem ? ownerSetupHref(ownerItem.complete ? ownerItem.editHref : ownerItem.href, ownerShopId) : item.href} onClick={closePanel}>
                      {item.label}
                    </Link>
                    <p>{item.description}</p>
                    {ownerItem ? <Link to={ownerSetupHref(isComplete ? ownerItem.editHref : ownerItem.href, ownerShopId)} onClick={closePanel}>{isComplete ? "Edit" : "Complete setup"}</Link> : null}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="role-checklist-footer">
            <span>{progress}% complete</span>
            {activeRole === "OWNER" ? (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  window.dispatchEvent(
                    new CustomEvent(
                      "pawnloop:open-navigation-assistance",
                      {
                        detail: {
                          returnFocusTarget: triggerRef.current,
                        },
                      },
                    ),
                  );
                }}
              >
                Navigation Assistance
              </button>
            ) : null}
            {activeRole !== "OWNER" ? <button type="button" onClick={resetChecklist}>Reset</button> : null}
          </div>
        </aside>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        className="role-setup-trigger"
        aria-expanded={isOpen}
        aria-controls="role-setup-panel"
        onClick={() => {
          if (isOpen) {
            closePanelAndRestoreFocus();
            return;
          }
          setIsOpen(true);
        }}
      >
        <span>{activeRole === "OWNER" ? "Owner setup" : "Buyer setup"}</span>
        <strong>{completedCount}/{totalCount}</strong>
      </button>
    </div>
  );
}
