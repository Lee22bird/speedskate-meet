const SG_KEY = process.env.SENDGRID_API_KEY;
const SG_FROM = process.env.SENDGRID_FROM || 'noreply@speedskatemeet.com';
const SG_FROM_NAME = process.env.SENDGRID_FROM_NAME || 'SpeedSkateMeet';
const SG_READY = !!SG_KEY;

async function sendEmail(to, subject, htmlBody, textBody) {
  if (!SG_READY) {
    console.log('[Email disabled] To:', to, 'Subject:', subject);
    return;
  }

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + SG_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: SG_FROM, name: SG_FROM_NAME },
        subject,
        content: [
          { type: 'text/plain', value: textBody || subject },
          { type: 'text/html', value: htmlBody || '<p>' + subject + '</p>' },
        ],
      }),
    });

    if (res.status === 202) {
      console.log('[Email sent]', to, subject);
    } else {
      const d = await res.json();
      console.error('[Email error]', d);
    }
  } catch (err) {
    console.error('[Email exception]', err.message);
  }
}

function emailHtmlWrap(content) {
  return `
  <!DOCTYPE html>
  <html>
    <body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#0F1F3D">
      
      <div style="background:#0F1F3D;padding:20px;border-radius:12px;text-align:center;margin-bottom:24px">
        <img 
          src="https://speedskatemeet.com/public/images/branding/ssm-logo.png"
          style="height:60px;width:auto;max-width:280px;display:block;margin:0 auto"
          alt="SpeedSkateMeet"
        />
      </div>

      ${content}

      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center">
        SpeedSkateMeet.com — The Platform for Inline Speed Skating
        <br/>
        <a href="https://speedskatemeet.com" style="color:#F97316">
          speedskatemeet.com
        </a>
      </div>

    </body>
  </html>
  `;
}

module.exports = {
  sendEmail,
  emailHtmlWrap,
};