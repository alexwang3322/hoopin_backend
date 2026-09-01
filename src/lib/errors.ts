import type { Context } from "hono";

/** Matches API_CONTRACT.md §4's ApiError shape exactly. */
export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409,
    public code: string,
    message: string,
    public field?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }

  toResponse(c: Context) {
    return c.json(
      {
        error: {
          code: this.code,
          message: this.message,
          ...(this.field ? { field: this.field } : {}),
          ...(this.details ? { details: this.details } : {}),
        },
      },
      this.status,
    );
  }
}

// One helper per §4 row — keeps route code reading like the contract's own table.
export const Errors = {
  validation: (message: string, field?: string) => new ApiError(400, "VALIDATION_ERROR", message, field),
  unauthenticated: () => new ApiError(401, "UNAUTHENTICATED", "Missing or invalid bearer token."),
  cannotRequestOwnRun: () => new ApiError(403, "CANNOT_REQUEST_OWN_RUN", "You can't request to join your own run."),
  notHost: () => new ApiError(403, "NOT_HOST", "Only the host can do this."),
  notRequester: () => new ApiError(403, "NOT_REQUESTER", "You don't own this request."),
  privateRun: () => new ApiError(403, "PRIVATE_RUN", "This run is private."),
  runNotFound: () => new ApiError(404, "RUN_NOT_FOUND", "Run not found."),
  requestNotFound: () => new ApiError(404, "REQUEST_NOT_FOUND", "Request not found."),
  // Not enumerated in API_CONTRACT.md §4 (its list isn't exhaustive of every
  // possible 404), but follows the same SCREAMING_SNAKE_CASE convention.
  userNotFound: () => new ApiError(404, "USER_NOT_FOUND", "User not found."),
  alreadyRequested: () => new ApiError(409, "ALREADY_REQUESTED", "You already have an active request on this run."),
  runFull: () => new ApiError(409, "RUN_FULL", "This run is at capacity."),
  requestNotPending: () => new ApiError(409, "REQUEST_NOT_PENDING", "This request has already been decided."),
  requestAlreadyResolved: () =>
    new ApiError(409, "REQUEST_ALREADY_RESOLVED", "This request has already been withdrawn or declined."),
};
