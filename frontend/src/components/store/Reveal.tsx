'use client';

// Reveal al hacer scroll (sin librería de animaciones): envuelve una sección
// y la hace aparecer con un fade + translate cuando entra al viewport, usando
// IntersectionObserver. `delay` permite escalonar hijos en una misma fila.
// Con `prefers-reduced-motion: reduce` se muestra directamente (sin
// desplazamiento), solo respetando la preferencia del usuario.

import { ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={reduced ? undefined : { transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-all duration-700 ease-out will-change-transform',
        reduced || visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        className
      )}
    >
      {children}
    </div>
  );
}
