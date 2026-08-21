import emailWorker from "./workers/emailWorker";
import spawnerWorker from "./workers/spawnWorker";
import { ensureSpawnerRunning } from "./queue/spawnerQueue";
import {
    recoverOrphanedJobs,
    recoverStuckSendingEmails,
} from "./services/recovery";

async function startWorkers(): Promise<void> {
    try {
        await recoverOrphanedJobs();
        await recoverStuckSendingEmails();
        await ensureSpawnerRunning();

        
        void spawnerWorker.run().catch((error) => {
            console.error("❌ Spawner worker failed to start:", error);
        });

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