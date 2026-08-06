import type { EnvironmentContract } from "../environmentContract.mjs";

export default function EnvironmentIndicator(props: {
  environment: EnvironmentContract;
}): import("react").ReactElement | null;
