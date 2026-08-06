import type { Context } from "hono";
import { ZodError } from "zod";
import type { ApiErrorBody, ErrorCode } from "../../shared/api";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RELOCATION_REQUIRED: 409,
  SETUP_ALREADY_COMPLETE: 409,
  SETUP_REQUIRED: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/** A domain/API error that maps to a stable status + error code. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;

  constructor(code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.fields = fields;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }

  static notFound(resource = "Resource"): ApiError {
    return new ApiError("NOT_FOUND", `${resource} not found`);
  }

  static conflict(message = "The resource was modified by another request"): ApiError {
    return new ApiError("CONFLICT", message);
  }
}

export function errorEnvelope(error: ApiError): ApiErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
    },
  };
}

/** Convert a Zod validation failure into a fields map keyed by dotted path. */
export function zodToApiError(error: ZodError): ApiError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return new ApiError("VALIDATION_ERROR", "Invalid request", fields);
}

/** Central Hono error handler: normalises everything to the error envelope. */
export function handleError(err: unknown, c: Context): Response {
  if (err instanceof ApiError) {
    return c.json(errorEnvelope(err), err.status as never);
  }
  if (err instanceof ZodError) {
    const apiError = zodToApiError(err);
    return c.json(errorEnvelope(apiError), apiError.status as never);
  }
  console.error("Unhandled error:", err);
  const internal = new ApiError("INTERNAL_ERROR", "Internal server error");
  return c.json(errorEnvelope(internal), internal.status as never);
}
