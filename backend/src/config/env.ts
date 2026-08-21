import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function requireNumber(name: string): number {
  const value = requireEnv(name);
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Environment variable ${name} must be a valid number. Received: "${value}"`
    );
  }

  return parsed;
}

// ------------------------------------------------------------
// WORKER CONCURRENCY
// ------------------------------------------------------------

const workerConcurrency = Number(
  process.env.WORKER_CONCURRENCY ?? 5
);

if (!Number.isInteger(workerConcurrency) || workerConcurrency < 1) {
  throw new Error(
    "WORKER_CONCURRENCY must be a positive integer"
  );
}

// ------------------------------------------------------------
// APPLICATION CONFIGURATION
// ------------------------------------------------------------

export const config = {
  port: requireNumber("PORT"),
  nodeEnv: requireEnv("NODE_ENV"),

  mysql: {
    host: requireEnv("MYSQL_HOST"),
    port: requireNumber("MYSQL_PORT"),
    user: requireEnv("MYSQL_USER"),
    password: requireEnv("MYSQL_PASSWORD"),
    database: requireEnv("MYSQL_DATABASE")
  },

  redis: {
    host: requireEnv("REDIS_HOST"),
    port: requireNumber("REDIS_PORT")
  },

  ethereal: {
    host: requireEnv("ETHEREAL_HOST"),
    port: requireNumber("ETHEREAL_PORT"),
    user: requireEnv("ETHEREAL_USER"),
    password: requireEnv("ETHEREAL_PASSWORD")
  },

  // Number of emails the BullMQ worker can process concurrently.
  workerConcurrency
} as const;