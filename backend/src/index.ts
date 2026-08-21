import express from "express";
import cors from "cors";

import { config } from "./config/env";
import { testConnection } from "./config/db";
import { errorHandler } from "./middleware/errorHandler";
import statsRoutes from "./routes/statsRoutes";
import campaignRoutes from "./routes/campaignRoutes";
import emailRoutes from "./routes/emailRoutes";
import testRoutes from "./routes/testRoutes";
const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});


// API ROUTES
app.use("/api/campaigns", campaignRoutes);
app.use("/api/emails", emailRoutes);

app.use("/api/stats", statsRoutes);
app.use("/api/test", testRoutes);

// ERROR HANDLER MUST BE LAST
app.use(errorHandler);

async function startServer(): Promise<void> {
    try {
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
