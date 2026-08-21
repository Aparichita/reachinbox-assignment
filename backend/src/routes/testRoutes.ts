import { Router, Request, Response, NextFunction } from "express";
import { addEmailJob } from "../queue/emailQueue";

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

router.get(
    "/send/:emailId",
    queueTestEmail
);

router.post("/send/:emailId", queueTestEmail);

export default router;
