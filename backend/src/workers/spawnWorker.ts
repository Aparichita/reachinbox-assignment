import { Worker, Job } from "bullmq";
import { RowDataPacket } from "mysql2";

import redisConnection from "../config/redis";
import pool from "../config/db";
import { config } from "../config/env";
import { addEmailJob } from "../queue/emailQueue";

interface DueEmail extends RowDataPacket {
    id: number;
    scheduled_at: string;
}

function mysqlUtcDateTime(value: string): Date {
    const normalized = value.replace(" ", "T");
    return new Date(`${normalized}Z`);
}

function utcDateTime(date: Date): string {
    return date.toISOString().slice(0, 19).replace("T", " ");
}

const spawnerWorker = new Worker(
    "spawner-queue",

    async (_job: Job) => {
        console.log("⏱️ Spawner run started");

        // ----------------------------------------------------
        // 1. CALCULATE LOOKAHEAD WINDOW
        // ----------------------------------------------------

        const now = new Date();

        const lookahead = new Date(
            now.getTime() +
                config.spawner.lookaheadMinutes * 60 * 1000
        );

        const nowUtc = utcDateTime(now);
        const lookaheadUtc = utcDateTime(lookahead);

        // ----------------------------------------------------
        // 2. FIND DUE-SOON EMAILS
        // ----------------------------------------------------

        const [rows] = await pool.execute<DueEmail[]>(
            `
            SELECT
                emails.id,
                emails.scheduled_at
            FROM emails
            INNER JOIN campaigns
                ON emails.campaign_id = campaigns.id
            WHERE emails.job_enqueued = FALSE
              AND emails.status = 'scheduled'
              AND campaigns.status = 'active'
              AND emails.scheduled_at <= ?
            ORDER BY emails.scheduled_at ASC
            LIMIT ${config.spawner.batchSize}
            `,
            [lookaheadUtc]
        );

        console.log(
            `🔎 Spawner found ${rows.length} email(s) due by ${lookaheadUtc}`
        );

        let enqueuedCount = 0;

        // ----------------------------------------------------
        // 3. ENQUEUE EACH EMAIL
        // ----------------------------------------------------

        for (const email of rows) {
            const scheduledTime = mysqlUtcDateTime(email.scheduled_at);
            const currentTimeMs = Date.now();

            // BullMQ must process past-due emails immediately.
            const delayMs = Math.max(
                0,
                scheduledTime.getTime() - currentTimeMs
            );

            console.log(
                `📨 Spawner enqueueing emailId=${email.id}, ` +
                `scheduled_at=${email.scheduled_at}, ` +
                `scheduled_iso=${scheduledTime.toISOString()}, ` +
                `current_iso=${new Date(currentTimeMs).toISOString()}, ` +
                `delay=${delayMs}ms`
            );

            // IMPORTANT:
            // Add to BullMQ FIRST.
            //
            // If we mark job_enqueued=true first and the
            // BullMQ operation fails, the email could be lost.
            //
            // If BullMQ succeeds but the process crashes
            // before we mark the DB row, the same jobId
            // prevents a duplicate BullMQ job.
            await addEmailJob(email.id, delayMs);

            await pool.execute(
                `
                UPDATE emails
                SET
                    job_enqueued = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [email.id]
            );

            enqueuedCount++;
        }

        console.log(
            `✅ Spawner run complete: enqueued ${enqueuedCount} email(s)`
        );

        // ----------------------------------------------------
        // 4. SCHEDULE NEXT SPAWNER RUN
        // ----------------------------------------------------


        console.log(
            `⏭️ Next spawner run scheduled in ` +
            `${config.spawner.intervalSeconds}s`
        );
    },

    {
        connection: redisConnection,
        autorun: false,
    }
);

spawnerWorker.on("completed", (job) => {
    console.log(
        `✅ Spawner job completed: jobId=${job.id}`
    );
});

spawnerWorker.on("failed", (job, error) => {
    console.error(
        `❌ Spawner job failed: jobId=${job?.id}`,
        error
    );

    // Important:
    // If the spawner itself fails, we don't blindly
    // schedule another job here. The worker process
    // startup/self-healing logic can restore it.
});

spawnerWorker.on("error", (error) => {
    console.error("❌ Spawner worker error:", error);
});

console.log("⏱️ Spawner worker started");

export default spawnerWorker;
