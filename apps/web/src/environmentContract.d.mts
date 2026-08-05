export type DeployEnvironment = "development" | "preview" | "staging" | "production";

export type EnvironmentContractInput = {
  deployEnv?: string;
  apiOrigin?: string;
  apiPath?: string;
  apiPathAlias?: string;
  socketUrl?: string;
  socketPath?: string;
};

export type EnvironmentContract = {
  deployEnv: DeployEnvironment;
  apiBase: string;
  apiOrigin: string;
  socketUrl: string;
  socketPath: string;
  showEnvironmentIndicator: boolean;
};

export const PRODUCTION_API_ORIGIN: "https://api.pawnloop.com";
export const STAGING_API_ORIGIN: "https://pawnshop-staging-api.onrender.com";
export function resolveEnvironmentContract(
  input: EnvironmentContractInput,
  options?: { isDev?: boolean; browserOrigin?: string },
): EnvironmentContract;
