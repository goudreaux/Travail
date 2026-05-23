import { redirect } from 'next/navigation'

// Member messaging moved off-platform (text / call / email). Redirect old links.
export default function InboxRedirect() {
  redirect('/admin/queue')
}
