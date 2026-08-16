import { createElement } from "react";

export default function EnvironmentIndicator({ environment }) {
  if (!environment.showEnvironmentIndicator) return null;

  const label = environment.deployEnv === "staging"
    ? "STAGING · STAGING DATA"
    : "PREVIEW · STAGING DATA";

  return createElement(
    "div",
    {
      className: "site-environment-indicator",
      role: "status",
      "data-deploy-environment": environment.deployEnv,
    },
    createElement("span", { "aria-hidden": "true" }, "⚠"),
    createElement("span", null, label),
  );
}
