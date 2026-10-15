import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}
export class MemoryEmailTransport implements EmailTransport {
  readonly messages: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.messages.push(structuredClone(message));
  }
}
export function createEmailTransport(
  env: NodeJS.ProcessEnv = process.env,
): EmailTransport {
  const production = env.NODE_ENV === "production";
  const mode =
    env.EMAIL_TRANSPORT ||
    (production ? "smtp" : env.NODE_ENV === "test" ? "memory" : "file");
  if (production && mode !== "smtp")
    throw new Error("Production requires SMTP email transport.");
  if (mode === "memory" && env.NODE_ENV === "test")
    return new MemoryEmailTransport();
  if (mode === "file" && !production)
    return {
      async send(message) {
        await mkdir(".local/mail", { recursive: true, mode: 0o700 });
        await writeFile(
          `.local/mail/${randomUUID()}.json`,
          JSON.stringify(message),
          { mode: 0o600, flag: "wx" },
        );
      },
    };
  if (mode !== "smtp" || !env.SMTP_HOST || !env.EMAIL_FROM)
    throw new Error(
      "Configure SMTP_HOST and EMAIL_FROM for transactional email.",
    );
  const port = Number(env.SMTP_PORT || 587);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    /[\r\n]/.test(env.EMAIL_FROM)
  )
    throw new Error("Invalid SMTP configuration.");
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD))
    throw new Error("Configure both SMTP_USER and SMTP_PASSWORD.");
  const client = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE === "true",
    requireTLS: production,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(message) {
      try {
        await client.sendMail({ ...message, from: env.EMAIL_FROM });
      } catch {
        throw new Error(
          "Transactional email could not be delivered. Try again shortly.",
        );
      }
    },
  };
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function actionEmail(
  to: string,
  subject: string,
  description: string,
  url: string,
  origin: string,
): EmailMessage {
  const link = new URL(url);
  if (link.origin !== new URL(origin).origin)
    throw new Error("Email link must use APP_ORIGIN.");
  return {
    to,
    subject: `${subject} · Ruckus`,
    text: `${description}\n\n${link.href}\n\nIf you did not request this, you can ignore this email.`,
    html: `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;background:#f9f7ed;color:#211d29;padding:32px"><main style="max-width:560px;margin:auto"><p style="font-size:28px;font-weight:900">RUCKUS</p><h1>${escape(subject)}</h1><p>${escape(description)}</p><p><a style="color:#2548f4" href="${escape(link.href)}">${escape(subject)}</a></p><p>If you did not request this, you can ignore this email.</p></main></body></html>`,
  };
}
