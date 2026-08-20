import express from "express";
import cors from "cors";

import { config } from "./config/env";
import { testConnection } from "./config/db";
import { errorHandler } from "./middleware/errorHandler";

const app = express();


// ------------------------------------------------------------
// MIDDLEWARE
// ------------------------------------------------------------

app.use(cors());
app.use(express.json());


// ------------------------------------------------------------
// HEALTH CHECK
// ------------------------------------------------------------

app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});


// ------------------------------------------------------------
// ERROR HANDLER
// ------------------------------------------------------------

app.use(errorHandler);


// ------------------------------------------------------------
// START SERVER
// ------------------------------------------------------------

async function startServer(): Promise<void> {
    try {
        // Make sure MySQL is reachable before starting.
        await testConnection();

        app.listen(config.port, () => {
            console.log(`🚀 Server running on port ${config.port}`);
        });
    } catch (error) {
        console.error("❌ Failed to start server:", error);

        process.exit(1);
    }
}

startServer();
