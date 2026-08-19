export const PRODUCTION_API_ORIGIN = "https://api.pawnloop.com";
export const STAGING_API_ORIGIN = "https://pawnshop-staging-api.onrender.com";

export function validateDeploymentTarget(environment) {
  if (environment.deployEnv === "development") return environment;

  const expectedOrigin = environment.deployEnv === "production"
    ? PRODUCTION_API_ORIGIN
    : STAGING_API_ORIGIN;

  if (environment.apiOrigin !== expectedOrigin) {
    throw new Error(`${environment.deployEnv} builds must use ${expectedOrigin} as apiOrigin.`);
  }
  if (environment.socketUrl !== expectedOrigin) {
    throw new Error(`${environment.deployEnv} builds must use ${expectedOrigin} as socketUrl.`);
  }

  return environment;
}
