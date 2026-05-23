import { redirect } from 'next/navigation'

// Anchors are handled in the Queue (pending) and Trips (published). Redirect old links.
export default function AnchorsRedirect() {
  redirect('/admin/queue')
}
