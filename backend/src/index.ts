import express from "express";
import cors from "cors";

import { config } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(
    `Server running on http://localhost:${config.port} in ${config.nodeEnv} mode`
  );
});