import type { EmailMessageInput } from './queue';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const PRODUCT = 'Open Team';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title: string, paragraphs: string[], action?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#555">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}${button}
<p style="margin:32px 0 0;font-size:12px;color:#777">${PRODUCT}, the open community for AI creators and developers.</p>
</body></html>`;
}

function text(paragraphs: string[], action?: { label: string; url: string }) {
  return [...paragraphs, ...(action ? [`${action.label}: ${action.url}`] : []), `${PRODUCT}`].join(
    '\n\n',
  );
}

export function renderEmail(message: EmailMessageInput): RenderedEmail {
  switch (message.template) {
    case 'verify-email': {
      const title = 'Confirm your email address';
      const paragraphs = [
        `Thanks for joining ${PRODUCT}. Confirm this email address to finish setting up your account.`,
        `This link expires in ${message.data.expiresInHours} hours and can only be used once.`,
        'If you did not create an account, you can ignore this email.',
      ];
      const action = { label: 'Confirm email address', url: message.data.verifyUrl };
      return {
        subject: `Confirm your ${PRODUCT} email`,
        html: layout(title, paragraphs, action),
        text: text(paragraphs, action),
      };
    }
    case 'password-reset': {
      const title = 'Reset your password';
      const paragraphs = [
        `Someone asked to reset the password for your ${PRODUCT} account.`,
        `This link expires in ${message.data.expiresInMinutes} minutes and can only be used once. Resetting your password signs you out everywhere.`,
        'If you did not ask for this, ignore this email. Your password stays the same.',
      ];
      const action = { label: 'Choose a new password', url: message.data.resetUrl };
      return {
        subject: `Reset your ${PRODUCT} password`,
        html: layout(title, paragraphs, action),
        text: text(paragraphs, action),
      };
    }
    case 'account-exists': {
      const title = 'You already have an account';
      const paragraphs = [
        `Someone tried to create a ${PRODUCT} account with this email address, but an account already exists.`,
        `If it was you, sign in at ${message.data.signInUrl}. If you forgot your password, reset it at ${message.data.resetUrl}.`,
        'If it was not you, no action is needed.',
      ];
      return {
        subject: `Your ${PRODUCT} account`,
        html: layout(title, paragraphs),
        text: text(paragraphs),
      };
    }
  }
}
