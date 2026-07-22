import { useEffect, useRef } from "react";
import type { AssistanceTopic } from "./navigationAssistance";

type NavigationAssistanceCenterProps = {
  completedTopics: string[];
  currentPageHelp: AssistanceTopic;
  floatingButtonVisible: boolean;
  isOpen: boolean;
  launchPending: boolean;
  onClose: () => void;
  onResetCompleted: () => void;
  onRestoreDefaults: () => void;
  onSetFloatingButtonVisible: (visible: boolean) => void;
  onSetTipsAutomatically: (enabled: boolean) => void;
  onStartFullTour: () => void;
  onStartTopic: (topic: AssistanceTopic) => void;
  tipsAutomatically: boolean;
  topics: AssistanceTopic[];
};

export default function NavigationAssistanceCenter({
  completedTopics,
  currentPageHelp,
  floatingButtonVisible,
  isOpen,
  launchPending,
  onClose,
  onResetCompleted,
  onRestoreDefaults,
  onSetFloatingButtonVisible,
  onSetTipsAutomatically,
  onStartFullTour,
  onStartTopic,
  tipsAutomatically,
  topics,
}: NavigationAssistanceCenterProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("navigation-assistance-open");

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("navigation-assistance-open");
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="navigation-assistance-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={dialogRef}
        className="navigation-assistance-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="navigation-assistance-title"
        aria-describedby="navigation-assistance-description"
      >
        <header className="navigation-assistance-header">
          <div>
            <span className="navigation-assistance-eyebrow">Setup and instructions</span>
            <h2 id="navigation-assistance-title">Navigation Assistance</h2>
            <p id="navigation-assistance-description">
              Choose a topic for step-by-step guidance. Completed topics remain available to replay.
            </p>
          </div>
          <button ref={closeButtonRef} type="button" className="navigation-assistance-close" onClick={onClose} aria-label="Close Navigation Assistance">
            Close
          </button>
        </header>

        <div className="navigation-assistance-quick-actions" aria-label="Tour actions">
          <button disabled={launchPending} type="button" className="navigation-assistance-primary" onClick={onStartFullTour}>Start Full Tour</button>
          <button disabled={launchPending} type="button" onClick={() => onStartTopic(currentPageHelp)}>Help With This Page</button>
        </div>

        <section aria-labelledby="assistance-topics-heading">
          <h3 id="assistance-topics-heading">Assistance topics</h3>
          <div className="navigation-assistance-topics">
            <article className="navigation-assistance-topic">
              <div className="navigation-assistance-topic-heading">
                <h4>Current Page Help</h4>
                {completedTopics.includes(currentPageHelp.id) ? <span aria-label="Completed">Completed</span> : null}
              </div>
              <p className="navigation-assistance-current-title">{currentPageHelp.title}</p>
              <p>{currentPageHelp.summary}</p>
              <ol>{currentPageHelp.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>
              <button disabled={launchPending} type="button" onClick={() => onStartTopic(currentPageHelp)}>
                Start Current Page Help Instructions
              </button>
            </article>
            {topics.map((item) => {
              const completed = completedTopics.includes(item.id);
              return (
                <article key={item.id} className="navigation-assistance-topic">
                  <div className="navigation-assistance-topic-heading">
                    <h4>{item.title}</h4>
                    {completed ? <span aria-label="Completed">Completed</span> : null}
                  </div>
                  <p>{item.summary}</p>
                  <ol>{item.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>
                  <button disabled={launchPending} type="button" onClick={() => onStartTopic(item)}>
                    Start {item.title} Instructions
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="navigation-assistance-settings" aria-labelledby="assistance-settings-heading">
          <h3 id="assistance-settings-heading">Help preferences</h3>
          <label>
            <input type="checkbox" checked={tipsAutomatically} onChange={(event) => onSetTipsAutomatically(event.target.checked)} />
            Show Tips Automatically
          </label>
          <div className="navigation-assistance-setting-actions">
            <button type="button" onClick={() => onSetTipsAutomatically(false)}>Stop Automatic Prompts</button>
            {floatingButtonVisible ? (
              <button type="button" onClick={() => onSetFloatingButtonVisible(false)}>Hide Floating Help Button</button>
            ) : (
              <button type="button" onClick={() => onSetFloatingButtonVisible(true)}>Restore Floating Help Button</button>
            )}
            <button type="button" onClick={onResetCompleted}>Reset Completed Instructions</button>
            <button type="button" onClick={onRestoreDefaults}>Restore All Help Defaults</button>
          </div>
        </section>

        <footer className="navigation-assistance-footer">
          <button type="button" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}
