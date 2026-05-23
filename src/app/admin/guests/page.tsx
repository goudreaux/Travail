import { redirect } from 'next/navigation'

// Guests were merged into the People page (Guests tab). Redirect old links.
export default function GuestsRedirect() {
  redirect('/admin/members')
}
