import 'server-only';
import { env } from '@arena/config';
import nodemailer from 'nodemailer';

export const appUrl = () => env().AUTH_URL ?? 'http://localhost:3000';

async function send(to: string, subject: string, text: string) {
  const e = env();
  if (!e.EMAIL_SERVER) {
    if (e.NODE_ENV !== 'production') console.info(`[mail:dev] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  await nodemailer.createTransport(e.EMAIL_SERVER).sendMail({ from: e.EMAIL_FROM, to, subject, text });
}

export const sendInviteEmail = (to: string, orgName: string, inviterName: string, token: string) =>
  send(
    to,
    `You're invited to ${orgName} on Arena OS`,
    `${inviterName} invited you to join ${orgName}.\n\nAccept: ${appUrl()}/join/${token}\n\nThis link expires in 7 days. If you were not expecting this, ignore this email.`,
  );

export const sendGuardianEmail = (to: string, guardianName: string, playerName: string, token: string) =>
  send(
    to,
    `Consent needed: ${playerName} on Arena OS`,
    `Hello ${guardianName},\n\n${playerName} is under 18 and wants to use Arena OS, an esports team-management workspace. ` +
      `Certain features (wellness check-ins, public profile, voice recording) stay off until a parent or guardian consents.\n\n` +
      `Review and respond: ${appUrl()}/guardian/${token}\n\nThis link expires in 14 days.`,
  );
