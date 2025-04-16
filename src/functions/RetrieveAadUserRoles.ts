import { tryFetch, globalConfig } from "../util";

/**
 * Retrieves the roles assigned to a user in Azure Active Directory (AAD).
 *
 * @param aadId - The AAD Directory Object ID of the user whose roles need to be fetched.
 * @returns  A promise that resolves to a Set of role names associated with the user.
 */

export async function RetrieveAadUserRoles(
  aadId: string
): Promise<Set<string>> {
  return tryFetch(
    `${globalConfig.url}/RetrieveAadUserRoles(DirectoryObjectId=${aadId})?$select=name`
  ).then((d) => new Set<string>(d.value.map((r: any) => r.name)));
}
