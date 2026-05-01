import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: "../.env", override: false });

function intEnv(name, fallback, { min = 0 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

export const config = {
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379/0",
  queueName: "event-pipeline",
  backendInternalUrl: process.env.BACKEND_INTERNAL_URL || "http://backend:8000/api/v1/internal",
  workerInternalToken: process.env.WORKER_INTERNAL_TOKEN || "local-worker-token",
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  geminiMaxRetries: intEnv("GEMINI_MAX_RETRIES", 4, { min: 0 }),
  geminiInitialBackoffMs: intEnv("GEMINI_INITIAL_BACKOFF_MS", 1000, { min: 100 }),
  geminiMaxBackoffMs: intEnv("GEMINI_MAX_BACKOFF_MS", 12000, { min: 500 }),
  geminiMinIntervalMs: intEnv("GEMINI_MIN_INTERVAL_MS", 700, { min: 0 }),
  geminiRequestTimeoutMs: intEnv("GEMINI_REQUEST_TIMEOUT_MS", 12000, { min: 500 }),
};
