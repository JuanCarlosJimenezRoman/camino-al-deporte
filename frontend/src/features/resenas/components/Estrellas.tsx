'use client';

import { Star } from 'lucide-react';

interface Props {
  valor: number;
}

export function Estrellas({ valor }: Props) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          fill={n <= valor ? 'var(--color-warning, #d97706)' : 'none'}
          color={n <= valor ? 'var(--color-warning, #d97706)' : 'var(--color-border)'}
        />
      ))}
    </span>
  );
}