import { GUID } from "../types";
import { tryFetch, globalConfig } from "../util";

/**
 * Retrieves the identity information of the currently authenticated user.
 *
 * @returns A promise that resolves to an object containing the BusinessUnitId, UserId, and OrganizationId
 * of the currently authenticated user.
 */

export async function WhoAmI(): Promise<{
  BusinessUnitId: GUID;
  UserId: GUID;
  OrganizationId: GUID;
}> {
  return tryFetch(`${globalConfig.url}/WhoAmI()`).then((r) => ({
    BusinessUnitId: r.BusinessUnitId as GUID,
    UserId: r.UserId as GUID,
    OrganizationId: r.OrganizationId as GUID,
  }));
}
