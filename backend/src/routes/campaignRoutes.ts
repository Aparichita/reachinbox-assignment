import { Router, Request, Response, NextFunction } from "express";
import {
    CreateCampaignRequest,
} from "../types/campaign";
import {
    createCampaign,
} from "../services/campaignService";

const router = Router();


// ------------------------------------------------------------
// POST /api/campaigns
// ------------------------------------------------------------

router.post(
    "/",
    async (
        req: Request<{}, {}, CreateCampaignRequest>,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const campaign = await createCampaign(req.body);

            res.status(201).json(campaign);
        } catch (error) {
            next(error);
        }
    }
);


export default router;