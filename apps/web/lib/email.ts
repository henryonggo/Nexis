/**
 * Transactional email via Resend (https://resend.com).
 * If RESEND_API_KEY is not set, sending is skipped and callers fall back to
 * showing the invite link in-app — so local dev works without email configured.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function fromAddress() {
  // For Resend, "onboarding@resend.dev" works for the account owner without a
  // verified domain. Set EMAIL_FROM to your verified sender in production.
  return process.env.EMAIL_FROM ?? "Nexis <onboarding@resend.dev>";
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manajer",
  employee: "Karyawan",
};

export async function sendInviteEmail(opts: {
  to: string;
  inviteUrl: string;
  companyName: string;
  role: string;
}): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false };

  const roleLabel = ROLE_LABEL[opts.role] ?? opts.role;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0F172A;max-width:520px">
      <h2 style="color:#1F6FEB;margin:0 0 8px">Nexis</h2>
      <p>Anda diundang untuk bergabung dengan <strong>${escapeHtml(
        opts.companyName,
      )}</strong> sebagai <strong>${roleLabel}</strong>.</p>
      <p style="margin:20px 0">
        <a href="${opts.inviteUrl}" style="background:#1F6FEB;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
          Terima undangan
        </a>
      </p>
      <p style="color:#64748B;font-size:13px">Atau salin tautan ini: ${opts.inviteUrl}</p>
      <p style="color:#64748B;font-size:13px">Tautan berlaku 7 hari.</p>
    </div>`;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [opts.to],
        subject: `Undangan bergabung dengan ${opts.companyName} di Nexis`,
        html,
      }),
    });
    if (!res.ok) {
      return { sent: false, error: `Resend ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
