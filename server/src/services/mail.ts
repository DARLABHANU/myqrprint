import nodemailer from "nodemailer";

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export async function sendAccountEmail(to: string, subject: string, text: string): Promise<void> {
  if (!isMailConfigured()) throw new Error("SMTP_HOST and SMTP_FROM must be configured to send account emails.");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true",
    // Fail quickly when the hosting provider blocks SMTP egress. Without
    // explicit limits Nodemailer can leave account forms waiting for minutes.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}
