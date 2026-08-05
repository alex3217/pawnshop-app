import { createElement } from "react";

export default function EnvironmentIndicator({ environment }) {
  if (!environment.showEnvironmentIndicator) return null;

  const label = environment.deployEnv === "staging"
    ? "STAGING · STAGING DATA"
    : "PREVIEW · STAGING DATA";

  return createElement(
    "div",
    { className: "site-environment-indicator", role: "status" },
    label,
  );
}
