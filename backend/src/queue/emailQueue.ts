import { Queue } from "bullmq";
import redisConnection from "../config/redis";
import { config } from "../config/env";

const emailQueue = new Queue("email-queue", {
    connection: redisConnection,
});

export async function addEmailJob(
    emailId: number,
    delayMs: number
): Promise<void> {
    const job = await emailQueue.add(
        "send-email",
        {
            // Only the ID goes into Redis. The worker re-reads the row
            // from MySQL, so it always acts on current state rather than
            // a snapshot taken when the job was created.
            emailId,
        },
        {
            // BullMQ custom job IDs cannot be integer-only strings.
            // Deriving the ID from the DB row makes the job idempotent:
            // the same email cannot create duplicate jobs.
            jobId: `email-${emailId}`,

            // Wait this long before the job becomes ready.
            delay: delayMs,

            attempts: config.maxRetryAttempts,
            backoff: {
                type: "exponential",
                delay: config.retryBackoffMs,
            },

            // Completed and failed jobs linger in Redis, and BullMQ
            // treats a lingering job as "already exists" — so re-adding
            // the same jobId is silently ignored and the job never
            // enters the queue. Expiring them keeps jobId reuse safe.
            removeOnComplete: { age: 3600 },
            removeOnFail: { age: 86400 },
        }
    );

    console.log(
        `Enqueued emailId=${emailId} jobId=${job.id} delay=${delayMs}ms`
    );
}

export default emailQueue;