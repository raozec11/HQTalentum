import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Match any route that starts with /[companyId]/
  // We normalize companyId to lowercase so ACE === ace === Ace
  const match = pathname.match(/^\/([^\/]+)(\/.*)?$/);
  if (match) {
    const companySegment = match[1];
    const rest = match[2] || '';

    // Skip Next.js internals, API routes, static files
    if (
      companySegment.startsWith('_') ||
      companySegment === 'api' ||
      companySegment === 'favicon.ico' ||
      companySegment.includes('.')
    ) {
      return NextResponse.next();
    }

    const lowercase = companySegment.toLowerCase();
    if (companySegment !== lowercase) {
      // Redirect to the lowercase version preserving query string
      const url = request.nextUrl.clone();
      url.pathname = `/${lowercase}${rest}`;
      return NextResponse.redirect(url, 308); // 308 = Permanent Redirect
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
