import { logger } from '@/server/utils/logger';

// Отправка писем через SMTP (те же креды, что в Mentala — Yandex SMTP).
// Конфиг берём из env (SMTP_*), которые подгружаются из .env.development.

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

function maskEmail(email: string): string {
  const [name = '', domain] = email.split('@');
  if (!domain) return '***';
  const head = name.slice(0, 2);
  return `${head}***@${domain}`;
}

export function isSmtpConfigured(): boolean {
  return readSmtpConfig() !== null;
}

// Отправка кода входа. Возвращает true при успехе. Никогда не бросает —
// чтобы сбой SMTP не ломал флоу (в dev код всё равно виден на экране).
export async function sendLoginCodeEmail(
  to: string,
  code: string
): Promise<boolean> {
  const smtp = readSmtpConfig();
  if (!smtp) {
    logger.warn('SMTP не настроен — письмо с кодом не отправлено');
    return false;
  }

  const subject = 'Код для входа — Гласно';
  const text = `Ваш код для входа в Гласно: ${code}. Действителен 10 минут.`;
  const html = `
    <div style="font-family: -apple-system, Inter, Arial, sans-serif; line-height: 1.6; color: #14142a;">
      <h2 style="margin: 0 0 12px;">Код для входа в Гласно</h2>
      <p style="margin: 0 0 16px;">Введите этот код, чтобы войти:</p>
      <div style="display: inline-block; font-size: 26px; letter-spacing: 8px; font-weight: 700; padding: 14px 18px; background: #f1f0fb; border-radius: 14px; color: #4f46e5;">
        ${code}
      </div>
      <p style="margin: 16px 0 0; color: #6b6b86;">Код действителен 10 минут. Если вы не запрашивали вход — просто проигнорируйте письмо.</p>
    </div>
  `;

  try {
    // Ленивый импорт: если пакет ещё не установлен (pnpm install), не роняем сервер.
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
      to,
      subject,
      text,
      html,
    });

    logger.info({ to: maskEmail(to) }, 'Код входа отправлен на почту');
    return true;
  } catch (err) {
    logger.error({ err, to: maskEmail(to) }, 'Не удалось отправить код входа');
    return false;
  }
}
