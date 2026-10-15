/** Whether the signed-in account may be deleted; false for a protected demo account. */
export interface AccountDeletionEligibility {
    allowed: boolean;
}

/** Ids asked about in one POST /users/deleted; wely-users takes at most 100. */
export interface DeletedUsersRequest {
    userIds: string[];
}

/** The asked ids that are deleted accounts. */
export interface DeletedUsersResponse {
    deletedIds: string[];
}

/** Deleting the account needs a sign-in younger than five minutes. */
export const REAUTHENTICATION_REQUIRED_CODE = 'USR-BUS-010';
/** A demo account cannot be deleted. */
export const ACCOUNT_PROTECTED_CODE = 'USR-BUS-011';
/** The account was deleted. */
export const USER_DELETED_CODE = 'USR-BUS-012';
/** Account deletion is switched off on this deployment. */
export const ACCOUNT_DELETION_DISABLED_CODE = 'USR-BUS-014';

/** The query parameter that carries the account flow across the Keycloak round trip. */
export const ACCOUNT_QUERY_PARAM = 'account';
/** Back on /preferences after re-authenticating to delete the account. */
export const ACCOUNT_DELETE_INTENT = 'delete';
/** On the landing page once the account is deleted. */
export const ACCOUNT_DELETED = 'deleted';
/** Where the app goes once the account is deleted. */
export const ACCOUNT_DELETED_LANDING = `/?${ACCOUNT_QUERY_PARAM}=${ACCOUNT_DELETED}`;
