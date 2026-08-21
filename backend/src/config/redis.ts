import IORedis from "ioredis";
import { config } from "./env";

const redisConnection = new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
});
redisConnection.on("connect", () => {
    console.log("✅ Redis connected");
});

redisConnection.on("error", (error) => {
    console.error("❌ Redis error:", error);
});

export default redisConnection;