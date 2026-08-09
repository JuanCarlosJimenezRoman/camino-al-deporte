'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavItem({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const activo = pathname === href;

  return (
    <Link
      href={href}
      style={{
        display: 'block',
        padding: '10px 14px',
        borderRadius: 6,
        marginBottom: 4,
        fontSize: 14,
        fontWeight: activo ? 600 : 400,
        background: activo ? 'rgba(184,134,11,0.12)' : 'transparent',
        color: activo ? 'var(--color-primary-dark)' : 'var(--color-text)',
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  );
}
