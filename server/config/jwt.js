const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (
    typeof secret !== "string" ||
    secret.length < 32 ||
    /replace-with|change-me|your-secret|placeholder/i.test(secret)
  ) {
    throw new Error("JWT_SECRET must be configured as a random value of at least 32 characters");
  }

  return secret;
};

module.exports = { getJwtSecret };
