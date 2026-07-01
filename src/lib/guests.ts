export interface Guest {
  id: string
  host_member_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
  member_id: string | null
  notes: string | null
  created_at: string
}

export interface GuestSlot {
  savedGuestId: string // '' = none, '__new__' = add new, otherwise an existing guest id
  first_name: string
  last_name: string
  email: string
  phone: string
  date_of_birth: string
}

export const NEW_GUEST = '__new__'

export function emptyGuestSlot(): GuestSlot {
  return { savedGuestId: '', first_name: '', last_name: '', email: '', phone: '', date_of_birth: '' }
}

// Guard a guest DOB against nonsense (future dates, impossible ages). DOB
// feeds the flight manifest, so it must be a real, plausible past date.
// Returns an error message, or null when valid. Shared by every guest-
// registration surface.
export function validateDob(dob: string): string | null {
  const d = new Date(dob + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return 'Enter a valid date of birth.'
  const now = new Date()
  if (d.getTime() > now.getTime()) return 'Date of birth can’t be in the future.'
  const years = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000)
  if (years > 120) return 'Enter a valid date of birth.'
  return null
}
