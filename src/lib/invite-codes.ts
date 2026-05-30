// Shared invite-code minting, used by both the dashboard "Code" button
// (/api/admin/invite-codes) and the "Email invite" action
// (/api/admin/email-invite). A code is a short, unguessable, single-use token
// tied to a pre-created member; redeemed at /join.

// Unambiguous alphabet — no 0/O/1/I/L so codes read cleanly aloud / retyped.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function generateCode(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`
}

// Mint a fresh code for a member, revoking their earlier unused codes so only
// one is ever live. Returns the code + the ready-to-share /join link.
export async function mintInviteCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  opts: { memberId: string; email: string; createdBy?: string | null; origin: string },
): Promise<{ code: string; joinUrl: string } | { error: string }> {
  const codes = () => admin.from('invite_codes')

  await codes()
    .update({ revoked_at: new Date().toISOString() })
    .eq('member_id', opts.memberId)
    .is('used_at', null)
    .is('revoked_at', null)

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString() // 30 days
  let code = ''
  let lastErr: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    code = generateCode()
    const { error } = await codes().insert({
      code,
      member_id: opts.memberId,
      email: opts.email,
      created_by: opts.createdBy ?? null,
      expires_at: expiresAt,
    })
    if (!error) { lastErr = null; break }
    lastErr = error.message
    if (error.code !== '23505') break // not a unique collision → real error
  }
  if (lastErr) return { error: lastErr }

  return { code, joinUrl: `${opts.origin}/join?code=${encodeURIComponent(code)}` }
}
