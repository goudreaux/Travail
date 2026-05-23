import { redirect } from 'next/navigation'

// Per-trip message threads were replaced; the boarding pass is the trip detail.
export default async function TripRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/boarding-pass/${id}`)
}
