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

export default router;