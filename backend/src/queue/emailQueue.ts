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
    await emailQueue.add(
        "send-email",
        {
            emailId,
        },
        {
            // BullMQ custom job IDs cannot be integer-only strings.
            // Using the DB email ID makes the job idempotent:
            // the same email cannot create duplicate jobs.
            jobId: `email-${emailId}`,

            // Wait this long before the job becomes ready.
            delay: delayMs,

            attempts: config.maxRetryAttempts,
            backoff: {
                type: "exponential",
                delay: config.retryBackoffMs,
            },
        }
    );
}

export default emailQueue;
