import { DataverseClient } from "./client";
import { wrapString } from "./util";
import { GUID } from "./types";

/**
 * Retrieves the roles assigned to a user in Azure Active Directory (AAD).
 *
 * @param aadId - The AAD Directory Object ID of the user whose roles need to be fetched.
 * @returns  A promise that resolves to a Set of role names associated with the user.
 */

export async function RetrieveAadUserRoles(
    client: DataverseClient,
  aadId: string
): Promise<Set<string>> {
  return client.fetch(
    `RetrieveAadUserRoles(DirectoryObjectId=${aadId})?$select=name`
  ).then((d) => new Set<string>(d.value.map((r: any) => r.name)));
}


/**
 * Retrieves the total record count for a specific entity in the system.
 *
 * @param  logicalName - The logical name of the entity whose total record count is to be fetched.
 * @returns  A promise that resolves to the total record count for the specified entity.
 */

export async function RetrieveTotalRecordCount(
  client: DataverseClient,
  logicalName: string
): Promise<number> {
  return client.fetch(
    `RetrieveTotalRecordCount(EntityNames=['${logicalName}'])`
  ).then((d) => {
    const collection = d?.Values ?? d?.EntityNameCountCollection ?? [];
    const entry = collection[0];
    if (entry == null) return 0;
    if (typeof entry === "number") return entry;
    return Number(entry.Count ?? entry.count ?? entry.Value ?? 0);
  });
}



/**
 * Retrieves the identity information of the currently authenticated user.
 *
 * @returns A promise that resolves to an object containing the BusinessUnitId, UserId, and OrganizationId
 * of the currently authenticated user.
 */

export async function WhoAmI(client: DataverseClient): Promise<{
  BusinessUnitId: GUID;
  UserId: GUID;
  OrganizationId: GUID;
}> {
  return client.fetch(`WhoAmI()`).then((r) => ({
    BusinessUnitId: r.BusinessUnitId as GUID,
    UserId: r.UserId as GUID,
    OrganizationId: r.OrganizationId as GUID,
  }));
}


export async function RetrieveChoices(client: DataverseClient, name: string): Promise<{ value: number; color: string; label: string; description: string; }[]>{
  return client.fetch(`GlobalOptionSetDefinitions(Name=${wrapString(name)})`).then(mapChoices);
}

export function mapChoices(data: any) {
  return [...data.Options].map((option) => ({
    value: Number(option.Value),
    color: String(option.Color),
    label: String(option.Label.UserLocalizedLabel.Label),
    description: String(option.Description.UserLocalizedLabel.Label),
  }));
}