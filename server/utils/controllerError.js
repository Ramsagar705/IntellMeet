const respondWithControllerError = (res, operation, error, fallbackMessage) => {
  const errorName = error?.name || "UnknownError";
  console.error(`${operation}: ${errorName}`);

  if (error?.code === 11000) {
    return res.status(409).json({ message: "A record with this value already exists" });
  }
  if (errorName === "ValidationError" || errorName === "CastError") {
    return res.status(400).json({ message: "Invalid request data" });
  }
  if (
    ["MongooseServerSelectionError", "MongoNetworkError", "MongoNotConnectedError", "MongoTimeoutError"].includes(errorName) ||
    /buffering timed out|server selection timed out|not connected to mongodb/i.test(error?.message || "")
  ) {
    return res.status(503).json({ message: "Database is temporarily unavailable" });
  }

  return res.status(500).json({ message: fallbackMessage });
};

module.exports = { respondWithControllerError };
