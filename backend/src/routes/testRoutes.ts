import { Router, Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { addEmailJob } from "../queue/emailQueue";
import pool from "../config/db";

const router = Router();

async function queueTestEmail(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<Response | void> {
    try {
        const emailId = Number(req.params.emailId);

        if (!Number.isInteger(emailId) || emailId < 1) {
            return res.status(400).json({
                error: "emailId must be a positive integer",
            });
        }

        // Temporary test delay: 10 seconds.
        await addEmailJob(emailId, 10_000);

        return res.status(202).json({
            message: "Email job queued",
            emailId,
            delay_seconds: 10,
        });
    } catch (error) {
        next(error);
    }
}

router.get("/send/:emailId", queueTestEmail);
router.post("/send/:emailId", queueTestEmail);

// ------------------------------------------------------------
// SCHEMA BOOTSTRAP
//
// Managed MySQL doesn't auto-run docker/mysql/init like the local
// container does, and the private hostname isn't reachable from
// outside Railway's network. This endpoint runs the schema from
// inside the deployed API, which can reach it.
//
// Safe to call repeatedly — every statement uses IF NOT EXISTS.
// ------------------------------------------------------------

async function initSchema(
    _req: Request,
    res: Response,
    next: NextFunction
): Promise<Response | void> {
    try {
        const schemaPath = path.join(
            process.cwd(),
            "docker",
            "mysql",
            "init",
            "001_schema.sql"
        );

        if (!fs.existsSync(schemaPath)) {
            return res.status(500).json({
                error: "Schema file not found",
                lookedIn: schemaPath,
                cwd: process.cwd(),
            });
        }

        const sql = fs.readFileSync(schemaPath, "utf8");

        // Strip comment lines, then split on semicolons.
        // The mysql2 driver won't run multiple statements in one call
        // unless multipleStatements is enabled, which we don't want on.
        const statements = sql
            .split("\n")
            .filter((line) => !line.trim().startsWith("--"))
            .join("\n")
            .split(";")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        const executed: string[] = [];

        for (const statement of statements) {
            await pool.query(statement);
            executed.push(statement.slice(0, 60).replace(/\s+/g, " "));
        }

        const [tables] = await pool.query("SHOW TABLES");

        return res.json({
            ok: true,
            statementsRun: executed.length,
            executed,
            tables,
        });
    } catch (error) {
        next(error);
    }
}

router.get("/init-schema", initSchema);
router.post("/init-schema", initSchema);

// ------------------------------------------------------------
// READ-ONLY EMAIL INSPECTION
//
// Runs the same query from inside the deployed API so the
// managed MySQL instance can be inspected without the mysql
// CLI or a private network route. Hardcoded SELECT, no user
// input reaches SQL.
// ------------------------------------------------------------

async function listEmails(
    _req: Request,
    res: Response,
    next: NextFunction
): Promise<Response | void> {
    try {
        const [rows] = await pool.query(
            `
            SELECT id, recipient_email, scheduled_at, status, job_enqueued,
                   attempts, error_message
            FROM emails ORDER BY id
            `
        );

        return res.json({ ok: true, emails: rows });
    } catch (error) {
        next(error);
    }
}

router.get("/db/emails", listEmails);

// ------------------------------------------------------------
// FORCE-UNSTICK OVERDUE EMAILS
//
// Resets job_enqueued back to FALSE for rows that are still
// 'scheduled', already marked job_enqueued, and past their
// scheduled_at. The spawner's next tick will re-pick them and
// enqueue a fresh BullMQ job. Scoped to overdue rows only so it
// can't touch emails legitimately queued for the future.
// ------------------------------------------------------------

async function unstickEmails(
    _req: Request,
    res: Response,
    next: NextFunction
): Promise<Response | void> {
    try {
        const [result] = await pool.execute(
            `
            UPDATE emails
            SET job_enqueued = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE status = 'scheduled'
              AND job_enqueued = TRUE
              AND scheduled_at <= UTC_TIMESTAMP()
            `
        );

        return res.json({ ok: true, result });
    } catch (error) {
        next(error);
    }
}

router.post("/db/unstick", unstickEmails);

export default router;