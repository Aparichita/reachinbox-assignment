import "./workers/emailWorker";
import "./workers/spawnWorker";

import { ensureSpawnerRunning } from "./queue/spawnerQueue";

async function startWorkers(): Promise<void> {
    try {
        await ensureSpawnerRunning();

        console.log("👷 All workers started");
    } catch (error) {
        console.error(
            "❌ Failed to start workers:",
            error
        );

        process.exit(1);
    }
}

startWorkers();