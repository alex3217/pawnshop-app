import { useMemo, useState } from "react";
import { Joyride } from "react-joyride";
import type { Step } from "react-joyride";
import type { Role } from "../../services/auth";
import "../../styles/navigation-tour.css";

type NavigationTourProps = {
  role: Role | null;
};

const TOUR_VERSION = "v1";

function storageKey(role: Role | null) {
  return `pawnloop-navigation-tour-${role || "GUEST"}-${TOUR_VERSION}`;
}

function hasCompletedTour(role: Role | null) {
  if (typeof window === "undefined") return true;

  try {
    return window.localStorage.getItem(storageKey(role)) === "complete";
  } catch {
    return false;
  }
}

function markTourComplete(role: Role | null) {
  try {
    window.localStorage.setItem(storageKey(role), "complete");
  } catch {
    // Tour still works when storage is unavailable.
  }
}

function guestSteps(): Step[] {
  return [
    {
      target: '[data-tour="brand"]',
      title: "Welcome to PawnLoop",
      content:
        "Use the PawnLoop logo to return to the home page from anywhere on the website.",
      placement: "bottom",
    },
    {
      target: '[data-tour="primary-navigation"]',
      title: "Browse PawnLoop",
      content:
        "Use this navigation to open the Marketplace, Item Locator, pawn shops, auctions, login, and registration.",
      placement: "bottom",
    },
    {
      target: '[data-tour="main-content"]',
      title: "Page content",
      content:
        "The information and actions for the selected page appear in this area.",
      placement: "top",
    },
    {
      target: '[data-tour="theme-toggle"]',
      title: "Choose your display",
      content:
        "Switch between light and dark themes whenever you need better visibility.",
      placement: "bottom",
    },
  ];
}

function buyerSteps(): Step[] {
  return [
    {
      target: '[data-tour="brand"]',
      title: "Welcome to your PawnLoop account",
      content:
        "Select the PawnLoop logo whenever you need to return to the home page.",
      placement: "bottom",
    },
    {
      target: '[data-tour="role-badge"]',
      title: "Your account role",
      content:
        "This badge shows the role currently active on your account and links to your dashboard.",
      placement: "bottom",
    },
    {
      target: '[data-tour="primary-navigation"]',
      title: "Buyer navigation",
      content:
        "Browse items, locate merchandise, sell or pawn an item, visit shops, manage offers, and participate in auctions.",
      placement: "bottom",
    },
    {
      target: '[data-tour="workspace-menu"]',
      title: "Saved buyer tools",
      content:
        "Open this menu to reach your Watchlist, Saved Searches, bids, wins, and other account tools.",
      placement: "bottom",
    },
    {
      target: '[data-tour="dashboard-button"]',
      title: "Buyer dashboard",
      content:
        "Your dashboard summarizes nearby items, bids, offers, watchlist activity, and saved matches.",
      placement: "bottom",
    },
    {
      target: '[data-tour="main-content"]',
      title: "Complete your task",
      content:
        "Listings, forms, search tools, scanner workflows, and transaction details appear here.",
      placement: "top",
    },
  ];
}

function ownerSteps(): Step[] {
  return [
    {
      target: '[data-tour="brand"]',
      title: "Welcome to PawnLoop",
      content:
        "Use the PawnLoop logo to return to the public home page at any time.",
      placement: "bottom",
    },
    {
      target: '[data-tour="role-badge"]',
      title: "Owner account",
      content:
        "This badge confirms that you are using the Pawn Shop Owner workspace.",
      placement: "bottom",
    },
    {
      target: '[data-tour="primary-navigation"]',
      title: "Main marketplace navigation",
      content:
        "Browse the public marketplace, shops, auctions, item locator, and customer selling tools.",
      placement: "bottom",
    },
    {
      target: '[data-tour="workspace-menu"]',
      title: "Owner Tools",
      content:
        "Manage inventory, locations, staff, auctions, subscriptions, scanning, bulk uploads, and integrations.",
      placement: "bottom",
    },
    {
      target: '[data-tour="dashboard-button"]',
      title: "Owner dashboard",
      content:
        "Review your setup checklist, inventory, offers, auctions, staff, and shop activity.",
      placement: "bottom",
    },
    {
      target: '[data-tour="main-content"]',
      title: "Your working area",
      content:
        "The selected owner workflow appears here. Follow the page prompts to complete each task.",
      placement: "top",
    },
  ];
}

function getSteps(role: Role | null): Step[] {
  if (role === "OWNER") return ownerSteps();
  if (role === "CONSUMER") return buyerSteps();
  return guestSteps();
}

export default function NavigationTour({ role }: NavigationTourProps) {
  const [run, setRun] = useState(() => !hasCompletedTour(role));
  const steps = useMemo(() => getSteps(role), [role]);

  function handleEvent(data: { type: string; status: string }) {
    const tourEnded =
      data.type === "tour:end" ||
      data.status === "finished" ||
      data.status === "skipped";

    if (tourEnded) {
      markTourComplete(role);
      setRun(false);
    }
  }

  function restartTour() {
    setRun(false);

    window.setTimeout(() => {
      setRun(true);
    }, 0);
  }

  return (
    <>
      <Joyride
        onEvent={handleEvent}
        continuous
        run={run}
        steps={steps}
        options={{
          zIndex: 10000,
          primaryColor: "#2563eb",
          textColor: "#172033",
          backgroundColor: "#ffffff",
          overlayColor: "rgba(15, 23, 42, 0.72)",
          overlayClickAction: false,
          dismissKeyAction: false,
          showProgress: true,
          buttons: ["back", "close", "primary", "skip"],
        }}
        styles={{
          tooltip: {
            borderRadius: 16,
            padding: 20,
          },
          buttonPrimary: {
            borderRadius: 10,
            padding: "10px 16px",
          },
          buttonBack: {
            color: "#334155",
          },
          buttonSkip: {
            color: "#475569",
          },
        }}
        locale={{
          back: "Back",
          close: "Close",
          last: "Finish",
          next: "Next",
          open: "Open tutorial",
          skip: "Skip tutorial",
        }}
      />

      <button
        type="button"
        className="navigation-tour-restart"
        onClick={restartTour}
        aria-label="Click here for setup and instructions"
        title="Click here for setup and instructions"
      >
        <span aria-hidden="true">?</span>
        <span>Click Here for Setup &amp; Instructions</span>
      </button>
    </>
  );
}
