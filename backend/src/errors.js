export class ApiError extends Error {
  constructor(statusCode, error, message, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
    this.details = details;
  }
}

export function toErrorResponse(err) {
  if (err instanceof ApiError) {
    return {
      statusCode: err.statusCode,
      body: {
        error: err.error,
        message: err.message,
        ...(err.details ? { details: err.details } : {})
      }
    };
  }

  return {
    statusCode: 500,
    body: {
      error: "InternalServerError",
      message: "An unexpected error occurred."
    }
  };
}
