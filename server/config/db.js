const mongoose = require("mongoose");

const dbState = {
  connected: false,
  fallbackMode: true,
};

const resolveMongoUri = () => {
  if (process.env.MONGO_URI?.trim()) return process.env.MONGO_URI.trim();
  if (process.env.MONGODB_URI?.trim()) return process.env.MONGODB_URI.trim();
  return "mongodb://127.0.0.1:27017/intellmeet";
};

const isLocalMongoUri = (mongoUri) => {
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(mongoUri).hostname);
  } catch {
    return false;
  }
};

const isFallbackAllowed = () => {
  if (process.env.NODE_ENV === "production") return false;
  const setting = process.env.ALLOW_LOCAL_FALLBACK;
  if (setting !== undefined) return setting.toLowerCase() === "true";
  return isLocalMongoUri(resolveMongoUri());
};

const connectDB = async () => {
  const mongoUri = resolveMongoUri();

  try {
    await mongoose.connect(mongoUri, {
      dbName: process.env.MONGO_DB_NAME || "intellmeet",
      serverSelectionTimeoutMS: 5000,
    });

    dbState.connected = true;
    dbState.fallbackMode = false;
    console.log("✅ MongoDB connected successfully");
    return true;
  } catch (error) {
    dbState.connected = false;
    dbState.fallbackMode = isFallbackAllowed();
    if (!dbState.fallbackMode) {
      console.error(`MongoDB connection failed: ${error.name || "UnknownError"}`);
      throw new Error("MongoDB connection failed and local fallback is disabled. Verify database availability and configuration.");
    }
    console.warn(`⚠️ MongoDB unavailable; using local fallback mode: ${error.name || "UnknownError"}`);
    return false;
  }
};

module.exports = {
  connectDB,
  dbState,
  resolveMongoUri,
  isFallbackAllowed,
  isLocalMongoUri,
};