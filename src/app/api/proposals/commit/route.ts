import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { safeError } from '@/lib/pii-scrub'
import { assertCanBook } from '@/lib/can-book'
import { assertTransactionsAllowed } from '@/lib/maintenance'
import type { Database } from '@/lib/supabase/types'

// Member commits a seat on a Trip Proposal.
//
// Returns a SetupIntent client_secret so the browser can collect the
// card (or reuse a saved one). On confirmPayment success, the client
// pings /api/proposals/commit/finalize to persist the commit row.
//
// We split create vs. finalize because we don't know the payment_method
// id until the SetupIntent confirms client-side. The two-step pattern
// matches the existing anchor card-on-file flow.

export const runtime = 'nodejs'

function admin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

interface Payload {
  proposalId?: string
  seats?: number
}

async function ensureCustomer(memberId: string, name: string, email: string | null): Promise<string> {
  const db = admin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: m } = await (db as any)
    .from('members').select('stripe_customer_id').eq('id', memberId).maybeSingle()
  if (m?.stripe_customer_id) return m.stripe_customer_id

  if (email) {
    try {
      const list = await stripe.customers.list({ email, limit: 100 })
      const match = list.data.find(c => !c.deleted && (c as { metadata?: { member_id?: string } }).metadata?.member_id === memberId)
      if (match) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any).from('members').update({ stripe_customer_id: match.id }).eq('id', memberId)
        return match.id
      }
    } catch (e) {
      safeError('proposals/commit: customer.list failed', e)
    }
  }

  const c = await stripe.customers.create({
    email: email ?? undefined,
    name,
    metadata: { member_id: memberId },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('members').update({ stripe_customer_id: c.id }).eq('id', memberId)
  return c.id
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: me } = await supabase
    .from('members').select('id, name').eq('user_id', user.id).maybeSingle()
  if (!me) return NextResponse.json({ error: 'Member record not found' }, { status: 403 })

  const db = admin()

  // Membership gate — past-due / cancelled members can't take new
  // billable commitments. 402 → client renders the paywall.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guard = await assertCanBook(db as any, me.id)
  if (!guard.ok) {
    return NextResponse.json(
      { error: 'Membership required', reason: guard.reason, status: guard.status },
      { status: 402 },
    )
  }

  // Maintenance kill switch — freeze new commits.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maint = await assertTransactionsAllowed(db as any)
  if (!maint.ok) return NextResponse.json({ error: maint.message }, { status: 503 })

  let body: Payload
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }) }

  const proposalId = (body.proposalId ?? '').trim()
  const seats = Math.max(1, Math.min(6, Math.round(Number(body.seats ?? 1))))
  if (!proposalId) return NextResponse.json({ error: 'proposalId required' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (db as any)
    .from('trip_proposals')
    .select('id, status, capacity_total, min_seats')
    .eq('id', proposalId).maybeSingle()
  if (!prop) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  if (prop.status !== 'open') {
    return NextResponse.json({ error: `This proposal is ${prop.status} and is no longer accepting commits.` }, { status: 400 })
  }

  // Don't oversell. Sum existing committed + captured seats.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingCommits } = await (db as any)
    .from('trip_proposal_commits')
    .select('seats, status, member_id')
    .eq('proposal_id', proposalId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myExisting = (existingCommits ?? []).find((c: any) => c.member_id === me.id && (c.status === 'committed' || c.status === 'captured'))
  if (myExisting) {
    return NextResponse.json({ error: 'You already have a commit on this proposal. Withdraw it first to change seat count.' }, { status: 400 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taken = (existingCommits ?? [])
    .filter((c: any) => c.status === 'committed' || c.status === 'captured')
    .reduce((s: number, c: any) => s + (c.seats ?? 1), 0)
  if (prop.capacity_total && taken + seats > prop.capacity_total) {
    return NextResponse.json({ error: `Only ${prop.capacity_total - taken} seat(s) left on this proposal.` }, { status: 400 })
  }

  // Stripe Customer + SetupIntent.
  const customerId = await ensureCustomer(me.id, me.name ?? 'Member', user.email ?? null)

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
    metadata: {
      member_id: me.id,
      proposal_id: proposalId,
      purpose: 'proposal_commit',
      seats: String(seats),
    },
  })

  // NB: we deliberately do NOT create the commit row here. It's created in
  // /api/proposals/commit/finalize, only after the card is actually saved —
  // so a member who clicks "Continue to card on file" and then abandons the
  // form is never left as a phantom 'committed' seat (the old behaviour
  // inserted the row at SetupIntent time and never released it on abandon).
  // `seats` rides along in the SetupIntent metadata so finalize can rebuild
  // the row.

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id,
    customerId,
  })
}
