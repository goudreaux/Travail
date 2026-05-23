import { redirect } from 'next/navigation'

// In-app messaging was replaced by the Contact page (text / call / email ops).
export default function InboxRedirect() {
  redirect('/contact')
}
