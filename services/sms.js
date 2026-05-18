const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER;
const TWILIO_READY = !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);

async function sendSms(to, body) {
  if (!TWILIO_READY) {
    console.log('[SMS disabled] To:', to, '\n', body);
    return;
  }

  try {
    const creds = Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64');

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + creds,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }).toString(),
    });

    const data = await res.json();

    if (data.error_code) console.error('[SMS error]', data.error_code, data.message);
    else console.log('[SMS sent]', to, data.sid);
  } catch (err) {
    console.error('[SMS exception]', err.message);
  }
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return null;
}

module.exports = {
  sendSms,
  normalizePhone,
};