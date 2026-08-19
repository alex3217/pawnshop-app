import type { EnvironmentContract } from "../src/environmentContract.mjs";

export const PRODUCTION_API_ORIGIN: "https://api.pawnloop.com";
export const STAGING_API_ORIGIN: "https://pawnshop-staging-api.onrender.com";
export function validateDeploymentTarget(environment: EnvironmentContract): EnvironmentContract;
