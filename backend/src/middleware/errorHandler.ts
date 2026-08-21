import { Request, Response, NextFunction } from "express";

export function errorHandler(
    error: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    console.error(error);

    const message = error.message || "Internal server error";

    const validationErrors = [
        "user_email",
        "sender_email",
        "subject",
        "body",
        "recipients",
        "start_time",
        "delay_seconds",
        "hourly_limit",
        "Invalid recipient email",
    ];

    const isValidationError = validationErrors.some((text) =>
        message.includes(text)
    );

    res.status(isValidationError ? 400 : 500).json({
        error: message,
    });
}