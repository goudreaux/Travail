import { redirect } from 'next/navigation'

// The boarding pass is the member's trip detail. Redirect old links here.
export default async function TripRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/boarding-pass/${id}`)
}
