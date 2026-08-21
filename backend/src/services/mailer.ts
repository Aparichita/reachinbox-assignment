import nodemailer from "nodemailer";
import { config } from "../config/env";

// Port 465 uses implicit TLS from the first byte; 587 negotiates via
// STARTTLS on a plaintext connection. Deriving `secure` from the port
// means switching ports in env needs no code change — useful because
// some hosts block outbound 587 as an anti-spam measure.
const transporter = nodemailer.createTransport({
    host: config.ethereal.host,
    port: config.ethereal.port,
    secure: config.ethereal.port === 465,
    auth: {
        user: config.ethereal.user,
        pass: config.ethereal.password,
    },
    // Fail fast rather than hanging for the default ~2 minutes when
    // the network path to the SMTP host is blocked.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
});

export async function verifyMailer(): Promise<void> {
    await transporter.verify();

    console.log(
        `✅ Ethereal SMTP connection successful ` +
            `(${config.ethereal.host}:${config.ethereal.port}, ` +
            `secure=${config.ethereal.port === 465})`
    );
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