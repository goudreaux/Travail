import { redirect } from 'next/navigation'

// History was merged into Bookings (Closed tab). Redirect old links.
export default function HistoryRedirect() {
  redirect('/admin/bookings')
}
