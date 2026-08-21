import { Router, Request, Response, NextFunction } from "express";
import { config } from "../config/env";
import { getCurrentUsage } from "../services/rateLimiter";

const router = Router();

router.get(
    "/rate-limit",
    async (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const senderEmail = String(
                req.query.sender ?? ""
            ).trim();

            if (!senderEmail) {
                return res.status(400).json({
                    error: "sender query parameter is required",
                });
            }

            const usage = await getCurrentUsage(
                senderEmail,
                config.maxEmailsPerHour
            );

            return res.json({
                sender: senderEmail,
                ...usage,
            });
        } catch (error) {
            next(error);
        }
    }
);

export default router;