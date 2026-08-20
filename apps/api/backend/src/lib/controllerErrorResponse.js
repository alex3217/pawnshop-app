function explicitStatus(error) {
  return Number.isInteger(error?.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
    ? error.statusCode
    : null;
}

export function sendControllerError(
  res,
  error,
  {
    fallback = "Internal server error",
    statusByCode = {},
    codeByErrorCode = {},
    codeProperties = ["code"],
    extraFields = [],
  } = {},
) {
  const mappedStatus = statusByCode[error?.code];
  const statusCode = explicitStatus(error) || mappedStatus || 500;
  const isServerFailure = statusCode >= 500;
  const body = {
    success: false,
    error: isServerFailure ? fallback : error?.message || fallback,
  };

  if (!isServerFailure) {
    const publicCode = codeProperties
      .map((property) => error?.[property])
      .find(Boolean) || codeByErrorCode[error?.code];
    if (publicCode) body.code = String(publicCode);

    for (const field of extraFields) {
      if (error?.[field] !== undefined) body[field] = error[field];
    }
  }

  return res.status(statusCode).json(body);
}
