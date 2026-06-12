const twilio = require('twilio');
const sgMail = require('@sendgrid/mail');

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

function toE164(number) {
  const digits = String(number).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

async function sendSms(to, body) {
  if (!twilioClient || !process.env.TWILIO_FROM_NUMBER) {
    console.log(`[Alert] SMS skipped (not configured): ${body}`);
    return;
  }
  const normalized = toE164(to);
  await twilioClient.messages.create({ body, from: process.env.TWILIO_FROM_NUMBER, to: normalized });
  console.log(`[Alert] SMS sent to ${normalized}`);
}

async function sendEmail(to, subject, text) {
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    console.log(`[Alert] Email skipped (not configured): ${subject}`);
    return;
  }
  try {
    await sgMail.send({ to, from: process.env.SENDGRID_FROM_EMAIL, subject, text });
    console.log(`[Alert] Email sent to ${to}`);
  } catch (err) {
    console.error(`[Alert] Email error:`, err.message);
  }
}

module.exports = { sendSms, sendEmail };
