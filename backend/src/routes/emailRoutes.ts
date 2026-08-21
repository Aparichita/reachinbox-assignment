import { Router, Request, Response, NextFunction } from "express";
import {
    getScheduledEmails,
    getSentEmails,
} from "../services/emailService";

const router = Router();


// ------------------------------------------------------------
// GET /api/emails/scheduled
// ------------------------------------------------------------

router.get(
    "/scheduled",
    async (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const page = Math.max(
                Number(req.query.page) || 1,
                1
            );

            const limit = Math.min(
                Math.max(Number(req.query.limit) || 50, 1),
                100
            );

            const result = await getScheduledEmails(page, limit);

            res.json(result);

        } catch (error) {
            next(error);
        }
    }
);


// ------------------------------------------------------------
// GET /api/emails/sent
// ------------------------------------------------------------

router.get(
    "/sent",
    async (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const page = Math.max(
                Number(req.query.page) || 1,
                1
            );

            const limit = Math.min(
                Math.max(Number(req.query.limit) || 50, 1),
                100
            );

            const result = await getSentEmails(page, limit);

            res.json(result);

        } catch (error) {
            next(error);
        }
    }
);


export default router;