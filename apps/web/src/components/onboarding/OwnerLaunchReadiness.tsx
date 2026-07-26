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
          summary.readyToLaunch
            ? "owner-launch-readiness-status ready"
            : "owner-launch-readiness-status"
        }
      >
        <div className="owner-launch-readiness-item-heading">
          <strong>
            {summary.readyToLaunch
              ? "Required launch steps are complete"
              : "Your shop still has required setup steps"}
          </strong>
          <span>
            {summary.readyToLaunch ? "READY" : "NOT READY"}
          </span>
        </div>
        <span>
          {summary.readyToLaunch
            ? "Review optional setup items and then prepare your first public listings."
            : "Complete each required item marked below before launch."}
        </span>
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
