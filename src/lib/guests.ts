export interface Guest {
  id: string
  host_member_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
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
}

export const NEW_GUEST = '__new__'

export function emptyGuestSlot(): GuestSlot {
  return { savedGuestId: '', first_name: '', last_name: '', email: '', phone: '' }
}
