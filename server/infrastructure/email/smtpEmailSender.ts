import { logger } from '@/server/utils/logger';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

const CONNECTION_TIMEOUT_MS = 15_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;
  if (!host || !user || !pass || !from) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    user,
    pass,
    from,
    fromName: process.env.SMTP_FROM_NAME || 'Гласно',
  };
}

export function isSmtpConfigured(): boolean {
  return readSmtpConfig() !== null;
}

export async function sendSmtpEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  const smtp = readSmtpConfig();
  if (!smtp) {
    logger.warn('SMTP не настроен — письмо не отправлено');
    return false;
  }

  try {
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
      tls: { servername: smtp.host },
    });
    await transporter.sendMail({
      from: `${smtp.fromName} <${smtp.from}>`,
      ...input,
    });
    logger.info({ to: maskEmail(input.to) }, 'Письмо отправлено');
    return true;
  } catch (err) {
    logger.error(
      { err, to: maskEmail(input.to) },
      'Не удалось отправить письмо'
    );
    return false;
  }
}

function maskEmail(email: string): string {
  const [name = '', domain] = email.split('@');
  if (!domain) return '***';
  return `${name.slice(0, 2)}***@${domain}`;
}
