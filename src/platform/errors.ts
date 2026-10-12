export abstract class AppError extends Error {
  abstract readonly status: number;
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

export class UnauthenticatedError extends AppError {
  readonly status = 401;
  constructor() {
    super("unauthenticated", "Sign in required");
  }
}

export class ForbiddenError extends AppError {
  readonly status = 403;
  constructor(message = "You are not allowed to do this") {
    super("forbidden", message);
  }
}

export class NotFoundError extends AppError {
  readonly status = 404;
  constructor(message = "Not found") {
    super("not_found", message);
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
  constructor(message: string) {
    super("validation_failed", message);
  }
}

export class ConflictError extends AppError {
  readonly status = 409;
  constructor(code: string, message: string) {
    super(code, message);
  }
}

export class UpstreamError extends AppError {
  readonly status = 502;
  constructor(message: string) {
    super("upstream_unavailable", message);
  }
}

export type ApprovalDenialReason = "self_approval" | "already_decided" | "not_pending";

const denialMessages: Record<ApprovalDenialReason, string> = {
  self_approval: "You can't approve an item you created",
  already_decided: "You have already decided on this item",
  not_pending: "This item is no longer pending approval",
};

/** Raised by the approvals engine. Recorded as an `approval.denied` audit row outside the rolled-back transaction. */
export class ApprovalDeniedError extends AppError {
  readonly status: number;
  readonly reason: ApprovalDenialReason;

  constructor(reason: ApprovalDenialReason) {
    super(`approval_denied:${reason}`, denialMessages[reason]);
    this.reason = reason;
    this.status = reason === "self_approval" ? 403 : 409;
  }
}
