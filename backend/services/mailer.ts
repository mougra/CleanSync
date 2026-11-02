import nodemailer from 'nodemailer';
import { EMAIL_EN } from '../content/en/emails';
import type { ContentLocale } from './contentLocale';

/**
 * Отправка писем: одно место для транспорта, шаблона и адресов.
 *
 * Раньше всё это жило внутри `routes/auth.ts`, но писем стало больше: кроме
 * сброса пароля и подтверждения есть недельное письмо с планом. Сервис, а не
 * маршрут — потому что письмо отправляет не запрос пользователя, а планировщик.
 */

const emailFrom = process.env.EMAIL_FROM || 'no-reply@localhost';

/**
 * Адрес для ответов (`Reply-To`).
 *
 * Письма уходят от `noreply@домен`, у которого нет и не должно быть ящика: ответ
 * на такое письмо вернулся бы отправителю ошибкой. Поэтому в `Reply-To` кладём
 * живой адрес поддержки — пользователь нажимает «Ответить» и попадает к человеку,
 * а формальный отправитель остаётся `noreply@`.
 */
const emailReplyTo = process.env.EMAIL_REPLY_TO || '';

const smtpConfig = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

const createTransporter = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport(smtpConfig);
};

/**
 * Настроена ли отправка писем.
 *
 * Пока SMTP нет, подтвердить почту физически невозможно: письмо некуда отправить,
 * а ссылка подтверждения попадает только в лог сервера. Поэтому требовать
 * подтверждение в этом режиме нельзя — иначе пользователь, который зарегистрировался
 * и вошёл, не сможет сменить пароль и останется в тупике (см. change-password).
 * Как только SMTP появится в окружении, проверка включается сама, без правок кода.
 */
export const isEmailConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

/** Публичный адрес приложения для ссылок в письмах. */
export const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const appLink = (path: string) => `${appBaseUrl}${path}`;

/**
 * Общий каркас письма: заголовок, кнопка, ссылка «если кнопка не работает»,
 * подвал с языком. Одинаковый для всех писем, чтобы не рассылать три разных
 * дизайна и не забывать про подпись в одном из них.
 */
export const getEmailTemplate = (
  title: string,
  content: string,
  actionText: string,
  actionLink: string,
  lang: ContentLocale,
) => {
  const footer =
    lang === 'en'
      ? `© ${new Date().getFullYear()} TidyPlan. ${EMAIL_EN.footer}${
          emailReplyTo ? `<br>${EMAIL_EN.replyNote}` : ''
        }`
      : `© ${new Date().getFullYear()} TidyPlan. Помогаем делать мир чище.${
          emailReplyTo ? '<br>На это письмо можно ответить — оно придёт в поддержку.' : ''
        }`;
  const fallback =
    lang === 'en' ? EMAIL_EN.fallbackNote : 'Если кнопка не работает, скопируйте эту ссылку:';

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #28a745; margin: 0;">✨ TidyPlan</h1>
      </div>
      <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <h2 style="color: #333; text-align: center; margin-top: 0;">${title}</h2>
        <p style="color: #666; font-size: 16px; line-height: 1.5; text-align: center;">
          ${content}
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${actionLink}" style="background-color: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;">
            ${actionText}
          </a>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
          ${fallback}<br>
          <a href="${actionLink}" style="color: #007bff; word-break: break-all;">${actionLink}</a>
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #aaa; font-size: 12px;">
        ${footer}
      </div>
    </div>
  `;
};

export const sendEmail = async ({
  to,
  subject,
  html,
  headers,
}: {
  to: string;
  subject: string;
  html: string;
  /** Дополнительные заголовки: `List-Unsubscribe` нужен рассылке, а не письмам-действиям. */
  headers?: Record<string, string>;
}) => {
  const transporter = createTransporter();
  if (!transporter) {
    return false;
  }

  await transporter.sendMail({
    from: emailFrom,
    to,
    subject,
    html,
    // Пустая строка в replyTo ломает заголовок, поэтому передаём только когда задан.
    replyTo: emailReplyTo || undefined,
    headers,
  });

  return true;
};
