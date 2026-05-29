import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Public routes that must work without (or before) a session:
//  - /login: the sign-in page
//  - /join: invite-code signup — creates the account server-side, no session yet
//  - /onboarding: the invite link lands here and exchanges its token CLIENT-side,
//    so there is no session yet — never redirect it away.
//  - /reset-password: the recovery link lands here before a full session exists.
const PUBLIC_PREFIXES = ['/login', '/join', '/onboarding', '/reset-password']

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request)
  const { pathname } = request.nextUrl

  if (isPublic(pathname)) return supabaseResponse

  // Everything else requires a signed-in member.
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Admin area additionally requires an admin member (defense-in-depth on top of RLS).
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const { data: me } = await supabase
      .from('members')
      .select('is_admin')
      .eq('user_id', user.id)
      .single()
    if (!me?.is_admin) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  // Run on all routes except API (which do their own auth) and static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)'],
}
