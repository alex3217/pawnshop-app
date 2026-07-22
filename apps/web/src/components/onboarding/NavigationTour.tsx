import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Joyride } from "react-joyride";
import type { EventData, Step } from "react-joyride";
import { useLocation } from "react-router-dom";
import type { Role } from "../../services/auth";
import NavigationAssistanceCenter from "./NavigationAssistanceCenter";
import {
  helpForPath,
  joyrideStepsForTopic,
  topicsForRole,
  type AssistanceTopic,
} from "./navigationAssistance";
import "../../styles/navigation-tour.css";

type NavigationTourProps = { role: Role | null };

type AssistancePreferences = {
  automaticPrompts: boolean;
  completedTopics: string[];
  dismissedGuidance: boolean;
  floatingButtonVisible: boolean;
};

type PendingTour = {
  topicId: string;
  title: string;
  steps: Step[];
};

const TOUR_VERSION = "v2";
const DEFAULT_PREFERENCES: AssistancePreferences = {
  automaticPrompts: true,
  completedTopics: [],
  dismissedGuidance: false,
  floatingButtonVisible: true,
};

function storageKey(role: Role | null) {
  return `pawnloop-navigation-assistance-${role || "GUEST"}-${TOUR_VERSION}`;
}

function readPreferences(role: Role | null): AssistancePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(role)) || "null") as Partial<AssistancePreferences> | null;
    return {
      automaticPrompts: parsed?.automaticPrompts ?? true,
      completedTopics: Array.isArray(parsed?.completedTopics) ? parsed.completedTopics.filter((id): id is string => typeof id === "string") : [],
      dismissedGuidance: parsed?.dismissedGuidance ?? false,
      floatingButtonVisible: parsed?.floatingButtonVisible ?? true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function fullTourSteps(role: Role | null): Step[] {
  const roleName = role?.toLowerCase().replaceAll("_", " ") ?? "guest";
  const sharedSteps: Step[] = [
    { target: '[data-tour="brand"]', title: "Full Tour: PawnLoop home", content: "Use the PawnLoop logo to return home from anywhere.", placement: "bottom" },
    { target: '[data-tour="role-badge"]', title: role ? "Full Tour: Your active workspace" : "Full Tour: Guest browsing", content: role ? `This badge shows the active ${roleName} workspace and opens its dashboard.` : "This badge confirms guest access and returns you to the public marketplace.", placement: "bottom" },
    { target: '[data-tour="primary-navigation"]', title: "Full Tour: Primary navigation", content: "Use these links for marketplace, shop, item locator, auction, and account workflows.", placement: "bottom" },
    { target: '[data-tour="theme-toggle"]', title: "Full Tour: Display theme", content: "Switch between light and dark themes for comfortable viewing.", placement: "bottom" },
  ];
  if (role) {
    sharedSteps.push(
      { target: '[data-tour="workspace-menu"]', title: "Full Tour: Workspace tools", content: "Open this menu for role-specific saved tools, management pages, and common actions.", placement: "bottom" },
      { target: '[data-tour="dashboard-button"]', title: "Full Tour: Dashboard", content: "Return to your dashboard to review activity and tasks that need attention.", placement: "bottom" },
    );
  }
  return [
    ...sharedSteps,
    { target: '[data-tour="main-content"]', title: "Full Tour: Working area", content: "The selected page appears here. Open Navigation Assistance for detailed instructions for this page.", placement: "top" },
  ];
}

export default function NavigationTour({ role }: NavigationTourProps) {
  const location = useLocation();
  const [preferences, setPreferences] = useState(() => readPreferences(role));
  const [centerOpen, setCenterOpen] = useState(false);
  const [run, setRun] = useState(() => {
    const initial = readPreferences(role);
    return initial.automaticPrompts &&
      !initial.dismissedGuidance &&
      !initial.completedTopics.includes("full-tour");
  });
  const [steps, setSteps] = useState<Step[]>(() => fullTourSteps(role));
  const [activeTopicId, setActiveTopicId] = useState("full-tour");
  const [pendingTour, setPendingTour] = useState<PendingTour | null>(null);
  const [tourSessionId, setTourSessionId] = useState(0);
  const [launchStatus, setLaunchStatus] = useState("");
  const centerOpenRef = useRef(false);
  const pendingTourRef = useRef<PendingTour | null>(null);
  const launchFrameRef = useRef<number | null>(null);
  const topics = useMemo(() => topicsForRole(role), [role]);
  const currentPageHelp = useMemo(() => helpForPath(location.pathname, role), [location.pathname, role]);

  const immediateTourSteps = useMemo(
    () =>
      steps.map((step) => ({
        ...step,
        skipBeacon: true,
      })),
    [steps],
  );

  const closeCenter = useCallback(() => {
    centerOpenRef.current = false;
    setCenterOpen(false);
  }, []);
  const openCenter = useCallback(() => {
    if (pendingTourRef.current) return;
    if (launchFrameRef.current !== null) window.cancelAnimationFrame(launchFrameRef.current);
    launchFrameRef.current = null;
    setLaunchStatus("");
    centerOpenRef.current = true;
    setRun(false);
    setCenterOpen(true);
  }, []);

  useEffect(() => {
    const next = readPreferences(role);
    setPreferences(next);
    setRun(
      !centerOpenRef.current &&
        next.automaticPrompts &&
        !next.dismissedGuidance &&
        !next.completedTopics.includes("full-tour"),
    );
    setSteps(fullTourSteps(role));
    setActiveTopicId("full-tour");
    pendingTourRef.current = null;
    setPendingTour(null);
    setLaunchStatus("");
  }, [role]);

  useEffect(() => {
    if (centerOpen || !pendingTour) return;

    launchFrameRef.current = window.requestAnimationFrame(() => {
      launchFrameRef.current = null;
      setSteps(pendingTour.steps);
      setActiveTopicId(pendingTour.topicId);
      setTourSessionId((sessionId) => sessionId + 1);
      pendingTourRef.current = null;
      setPendingTour(null);
      setRun(true);
    });

    return () => {
      if (launchFrameRef.current !== null) window.cancelAnimationFrame(launchFrameRef.current);
      launchFrameRef.current = null;
    };
  }, [centerOpen, pendingTour]);

  useEffect(() => {
    window.addEventListener("pawnloop:open-navigation-assistance", openCenter);
    return () => {
      window.removeEventListener("pawnloop:open-navigation-assistance", openCenter);
      if (launchFrameRef.current !== null) window.cancelAnimationFrame(launchFrameRef.current);
    };
  }, [openCenter]);

  function savePreferences(next: AssistancePreferences) {
    setPreferences(next);
    try {
      window.localStorage.setItem(storageKey(role), JSON.stringify(next));
    } catch {
      // Guidance remains available for this session when storage is unavailable.
    }
  }

  function queueTour(nextSteps: Step[], topicId: string, title: string) {
    if (pendingTourRef.current) return;
    const fallbackTarget = '[data-tour="main-content"]';
    const fallbackElement = document.querySelector(fallbackTarget);

    if (!fallbackElement) {
      setLaunchStatus(`Unable to start ${title} Instructions`);
      return;
    }

    const validatedSteps = nextSteps.map((step) => {
      if (typeof step.target === "string") {
        try {
          if (document.querySelector(step.target)) return step;
        } catch {
          // Invalid selectors use the guaranteed page-content fallback below.
        }
      } else if (step.target instanceof Element && document.contains(step.target)) {
        return step;
      }

      return { ...step, target: fallbackTarget };
    });

    if (
      validatedSteps.length === 0 ||
      validatedSteps.some((step) => !step.target)
    ) {
      setLaunchStatus(`Unable to start ${title} Instructions`);
      return;
    }

    setRun(false);
    const queuedTour = { topicId, title, steps: validatedSteps };
    pendingTourRef.current = queuedTour;
    setPendingTour(queuedTour);
    setLaunchStatus(`Starting ${title} Instructions`);
    centerOpenRef.current = false;
    setCenterOpen(false);
  }

  function handleEvent(data: EventData) {
    if (data.type === "tooltip") setLaunchStatus("");
    const ended = data.type === "tour:end" || data.status === "finished" || data.status === "skipped";
    if (!ended) return;

    const finished = data.status === "finished";
    const completedTopics = finished && !preferences.completedTopics.includes(activeTopicId)
      ? [...preferences.completedTopics, activeTopicId]
      : preferences.completedTopics;
    savePreferences({
      ...preferences,
      completedTopics,
      dismissedGuidance: finished ? preferences.dismissedGuidance : true,
    });
    setRun(false);
  }

  function startTopic(selected: AssistanceTopic) {
    try {
      queueTour(joyrideStepsForTopic(selected), selected.id, selected.title);
    } catch (error) {
      setLaunchStatus(error instanceof Error ? error.message : `Unable to start ${selected.title} Instructions`);
    }
  }

  return (
    <>
      {!centerOpen ? (
        <Joyride
          key={tourSessionId}
          onEvent={handleEvent}
          continuous
          run={run && !centerOpen}
          steps={immediateTourSteps}
          options={{
            zIndex: 10000,
            primaryColor: "#2563eb",
            textColor: "#172033",
            backgroundColor: "#ffffff",
            overlayColor: "rgba(15, 23, 42, 0.72)",
            overlayClickAction: false,
            dismissKeyAction: false,
            closeButtonAction: "skip",

            // Assistance must never prevent the user from operating PawnLoop.
            hideOverlay: true,
            skipScroll: true,
            disableFocusTrap: true,
            blockTargetInteraction: false,

            showProgress: true,
            buttons: ["back", "close", "primary", "skip"],
          }}
          styles={{
            tooltip: { borderRadius: 16, padding: 20 },
            buttonPrimary: { borderRadius: 10, padding: "10px 16px" },
            buttonBack: { color: "#334155" },
            buttonSkip: { color: "#475569" },
          }}
          locale={{ back: "Back", close: "Close", last: "Finish", next: "Next", open: "Open tutorial", skip: "Skip tutorial" }}
        />
      ) : null}

      <p className="navigation-assistance-live-status" aria-live="polite" aria-atomic="true">
        {launchStatus}
      </p>

      {preferences.floatingButtonVisible && !centerOpen && !pendingTour ? (
        <button
          type="button"
          className="navigation-tour-restart"
          onClick={openCenter}
          aria-label="Click Here for Setup and Instructions"
          title="Click Here for Setup and Instructions"
        >
          <span aria-hidden="true">?</span>
          <span>Click Here for Setup and Instructions</span>
        </button>
      ) : null}

      {centerOpen ? <NavigationAssistanceCenter
        completedTopics={preferences.completedTopics}
        currentPageHelp={currentPageHelp}
        floatingButtonVisible={preferences.floatingButtonVisible}
        isOpen={centerOpen}
        launchPending={pendingTour !== null}
        onClose={closeCenter}
        onResetCompleted={() => {
          savePreferences({ ...preferences, completedTopics: [] });
          setLaunchStatus("Completed instructions reset.");
        }}
        onRestoreDefaults={() => {
          savePreferences(DEFAULT_PREFERENCES);
          setLaunchStatus("All help defaults restored.");
        }}
        onSetFloatingButtonVisible={(visible) => {
          savePreferences({ ...preferences, floatingButtonVisible: visible });
          setLaunchStatus(visible ? "Floating help button restored." : "Floating help button hidden.");
        }}
        onSetTipsAutomatically={(enabled) => {
          savePreferences({
            ...preferences,
            automaticPrompts: enabled,
            dismissedGuidance: enabled ? false : true,
          });
          setLaunchStatus(enabled ? "Automatic tips enabled." : "Automatic prompts stopped.");
        }}
        onStartFullTour={() => queueTour(fullTourSteps(role), "full-tour", "Full Tour")}
        onStartTopic={startTopic}
        tipsAutomatically={preferences.automaticPrompts}
        topics={topics}
      /> : null}
    </>
  );
}
