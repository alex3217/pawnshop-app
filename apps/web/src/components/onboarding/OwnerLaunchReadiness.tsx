import { Link } from "react-router-dom";

import type {
  OwnerReadinessSummary,
} from "../../services/ownerOnboardingReadiness";

type OwnerLaunchReadinessProps = {
  summary: OwnerReadinessSummary;
};

export default function OwnerLaunchReadiness({
  summary,
}: OwnerLaunchReadinessProps) {
  const status = summary.launched
    ? {
        heading: "Your shop onboarding is complete",
        label: "LAUNCHED",
        description:
          "Launch completion is saved to your shop account.",
      }
    : summary.readyToLaunch
      ? {
          heading: "Required launch steps are complete",
          label: "READY",
          description:
            "Use the completion action below to save your launch to the shop account.",
        }
      : {
          heading: "Your shop still has required setup steps",
          label: "NOT READY",
          description:
            "Complete each required item marked below before launch.",
        };

  return (
    <section
      className="owner-launch-readiness"
      aria-labelledby="owner-launch-readiness-heading"
    >
      <div className="owner-launch-readiness-header">
        <div>
          <span className="owner-launch-readiness-eyebrow">
            Production launch
          </span>
          <h2 id="owner-launch-readiness-heading">
            Shop launch readiness
          </h2>
          <p>
            Complete the remaining setup items before opening your shop to
            customers.
          </p>
        </div>

        <div
          className="owner-launch-readiness-score"
          aria-label={`${summary.percentComplete}% complete`}
        >
          <strong>{summary.percentComplete}%</strong>
          <span>
            {summary.completedCount} of {summary.totalCount} complete
          </span>
        </div>
      </div>

      <div
        className="owner-launch-readiness-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={summary.percentComplete}
      >
        <span style={{ width: `${summary.percentComplete}%` }} />
      </div>

      <div
        className={
          summary.launched || summary.readyToLaunch
            ? "owner-launch-readiness-status ready"
            : "owner-launch-readiness-status"
        }
      >
        <div className="owner-launch-readiness-item-heading">
          <strong>{status.heading}</strong>
          <span>{status.label}</span>
        </div>
        <span>{status.description}</span>
      </div>

      <ul className="owner-launch-readiness-list">
        {summary.items.map((item) => (
          <li
            key={item.id}
            className={
              item.complete
                ? "owner-launch-readiness-item complete"
                : "owner-launch-readiness-item"
            }
          >
            <span
              className="owner-launch-readiness-check"
              aria-hidden="true"
            >
              {item.complete ? "✓" : "○"}
            </span>

            <div>
              <div className="owner-launch-readiness-item-heading">
                <strong>{item.label}</strong>
                {item.required ? <span>Required</span> : <span>Optional</span>}
              </div>
              <p>{item.description}</p>
            </div>

            <Link to={item.href}>
              {item.complete ? "Review" : "Complete"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
