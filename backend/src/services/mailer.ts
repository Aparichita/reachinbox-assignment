import nodemailer from "nodemailer";
import { config } from "../config/env";

const transporter = nodemailer.createTransport({
    host: config.ethereal.host,
    port: config.ethereal.port,
    secure: false,
    auth: {
        user: config.ethereal.user,
        pass: config.ethereal.password,
    },
});

export async function verifyMailer(): Promise<void> {
    await transporter.verify();

    console.log("✅ Ethereal SMTP connection successful");
}

export async function sendEmail(
    to: string,
    subject: string,
    body: string
): Promise<string | null> {
    const info = await transporter.sendMail({
        from: config.ethereal.user,
        to,
        subject,
        text: body,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    return typeof previewUrl === "string" ? previewUrl : null;
}
