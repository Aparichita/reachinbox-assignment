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
    console.log(`BEFORE queue.add emailId=${emailId}`);

    try {
        const job = await emailQueue.add(
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

        console.log(
            `AFTER queue.add emailId=${emailId}, jobId=${job.id}`
        );

        if (!job.id) {
            throw new Error(
                `queue.add returned no job ID for emailId=${emailId}`
            );
        }

        console.log(
            "Queue counts:",
            await emailQueue.getJobCounts()
        );

        const [waiting, active, delayed] = await Promise.all([
            emailQueue.getWaiting(),
            emailQueue.getActive(),
            emailQueue.getDelayed(),
        ]);

        console.log("Queue state snapshot:", {
            waiting: waiting.map((item) => item.id),
            active: active.map((item) => item.id),
            delayed: delayed.map((item) => item.id),
        });

        const check = await emailQueue.getJob(job.id);

        console.log(
            `Redis job check: jobId=${job.id}, exists=${!!check}`
        );
    } catch (error) {
        console.error(
            `❌ queue.add failed for emailId=${emailId}:`,
            error
        );
        throw error;
    }
}

export default emailQueue;
