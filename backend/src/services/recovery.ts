import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../config/db";
import { config } from "../config/env";
import emailQueue from "../queue/emailQueue";

interface OrphanedEmail extends RowDataPacket {
    id: number;
    campaign_id: number;
    recipient_email: string;
    scheduled_at: string;
    job_enqueued: boolean;
}

interface StuckSendingEmail extends RowDataPacket {
    id: number;
}

function emailJobId(emailId: number): string {
    return `email-${emailId}`;
}

export async function recoverOrphanedJobs(): Promise<void> {
    console.log("Recovery started: checking orphaned scheduled emails");
    await emailQueue.waitUntilReady();

    const [rows] = await pool.execute<OrphanedEmail[]>(
        `
        SELECT
            id,
            campaign_id,
            recipient_email,
            scheduled_at,
            job_enqueued
        FROM emails
        WHERE status = 'scheduled'
          AND job_enqueued = TRUE
        ORDER BY scheduled_at ASC
        `
    );

    console.log(
        `Recovery found ${rows.length} candidate orphaned email(s)`
    );

    let recoveredCount = 0;

    for (const email of rows) {
        try {
            const job = await emailQueue.getJob(emailJobId(email.id));
            const jobState = job ? await job.getState() : null;

            if (
                jobState === "waiting" ||
                jobState === "delayed" ||
                jobState === "active"
            ) {
                continue;
            }

            const [updateResult] =
                await pool.execute<ResultSetHeader>(
                    `
                    UPDATE emails
                    SET
                        job_enqueued = FALSE,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                      AND status = 'scheduled'
                      AND job_enqueued = TRUE
                    `,
                    [email.id]
                );

            if (updateResult.affectedRows === 1) {
                recoveredCount++;
                console.log(
                    `Recovered orphaned emailId=${email.id}`
                );
            }
        } catch (error) {
            console.error(
                `Failed to recover orphaned emailId=${email.id}:`,
                error
            );
        }
    }

    console.log(
        `Recovery complete: recovered ${recoveredCount} orphaned email(s)`
    );
}

export async function recoverStuckSendingEmails(): Promise<void> {
    console.log("Checking for stale sending emails...");

    const [rows] = await pool.execute<StuckSendingEmail[]>(
        `
        SELECT id
        FROM emails
        WHERE status = 'sending'
          AND updated_at < DATE_SUB(
              CURRENT_TIMESTAMP,
              INTERVAL ${config.sendingTimeoutMinutes} MINUTE
          )
        ORDER BY updated_at ASC
        `
    );

    console.log(
        `Found ${rows.length} stale sending email(s)`
    );

    let recoveredCount = 0;

    for (const email of rows) {
        try {
            const [updateResult] =
                await pool.execute<ResultSetHeader>(
                    `
                    UPDATE emails
                    SET
                        status = 'scheduled',
                        job_enqueued = FALSE,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                      AND status = 'sending'
                    `,
                    [email.id]
                );

            if (updateResult.affectedRows === 1) {
                recoveredCount++;
                console.log(
                    `Recovered stale sending emailId=${email.id}`
                );
            }
        } catch (error) {
            console.error(
                `Failed to recover stale sending emailId=${email.id}:`,
                error
            );
        }
    }

    // This is a recovery policy, not exactly-once delivery. If SMTP accepts
    // an email just before a crash, provider-side idempotency is required to
    // prevent a later recovery from sending it again.
    console.log(
        `Recovered ${recoveredCount} stale sending email(s)`
    );
}