import { DataverseClient } from './client';
import { GUID } from './types';
/**
 * Retrieves the roles assigned to a user in Azure Active Directory (AAD).
 *
 * @param aadId - The AAD Directory Object ID of the user whose roles need to be fetched.
 * @returns  A promise that resolves to a Set of role names associated with the user.
 */
export declare function RetrieveAadUserRoles(client: DataverseClient, aadId: string): Promise<Set<string>>;
/**
 * Retrieves the total record count for a specific entity in the system.
 *
 * @param  logicalName - The logical name of the entity whose total record count is to be fetched.
 * @returns  A promise that resolves to the total record count for the specified entity.
 */
export declare function RetrieveTotalRecordCount(client: DataverseClient, logicalName: string): Promise<number>;
/**
 * Retrieves the identity information of the currently authenticated user.
 *
 * @returns A promise that resolves to an object containing the BusinessUnitId, UserId, and OrganizationId
 * of the currently authenticated user.
 */
export declare function WhoAmI(client: DataverseClient): Promise<{
    BusinessUnitId: GUID;
    UserId: GUID;
    OrganizationId: GUID;
}>;
export declare function RetrieveChoices(client: DataverseClient, name: string): Promise<{
    value: number;
    color: string;
    label: string;
    description: string;
}[]>;
export declare function mapChoices(data: any): {
    value: number;
    color: string;
    label: string;
    description: string;
}[];
