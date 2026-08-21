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

function requirePositiveInteger(name: string): number {
    const value = requireNumber(name);

    if (!Number.isInteger(value) || value < 1) {
        throw new Error(
            `${name} must be a positive integer. Received: "${value}"`
        );
    }

    return value;
}

export const config = {
    port: requireNumber("PORT"),
    nodeEnv: requireEnv("NODE_ENV"),

    workerConcurrency: requirePositiveInteger(
        "WORKER_CONCURRENCY"
    ),

    maxEmailsPerHour: requirePositiveInteger(
        "MAX_EMAILS_PER_HOUR"
    ),

    minSendDelayMs: requirePositiveInteger(
        "MIN_SEND_DELAY_MS"
    ),

    maxRetryAttempts: requirePositiveInteger(
        "MAX_RETRY_ATTEMPTS"
    ),

    retryBackoffMs: requirePositiveInteger(
        "RETRY_BACKOFF_MS"
    ),

    spawner: {
        intervalSeconds: requirePositiveInteger(
            "SPAWNER_INTERVAL_SECONDS"
        ),

        lookaheadMinutes: requirePositiveInteger(
            "SPAWNER_LOOKAHEAD_MINUTES"
        ),

        batchSize: requirePositiveInteger(
            "SPAWNER_BATCH_SIZE"
        ),
    },

    mysql: {
        host: requireEnv("MYSQL_HOST"),
        port: requireNumber("MYSQL_PORT"),
        user: requireEnv("MYSQL_USER"),
        password: requireEnv("MYSQL_PASSWORD"),
        database: requireEnv("MYSQL_DATABASE"),
    },

    redis: {
        host: requireEnv("REDIS_HOST"),
        port: requireNumber("REDIS_PORT"),
    },

    ethereal: {
        host: requireEnv("ETHEREAL_HOST"),
        port: requireNumber("ETHEREAL_PORT"),
        user: requireEnv("ETHEREAL_USER"),
        password: requireEnv("ETHEREAL_PASSWORD"),
    },
} as const;