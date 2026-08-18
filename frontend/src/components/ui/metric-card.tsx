'use client';

import { LucideIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { Card } from './card';

export interface MetricCardProps {
  title: string;
  value: string;
  icon?: LucideIcon;
  /** % de cambio vs. periodo anterior. Positivo = verde, negativo = rojo. */
  delta?: number;
  deltaLabel?: string;
  description?: string;
  sparkline?: number[];
  href?: string;
  className?: string;
}

export function MetricCard({ title, value, icon: Icon, delta, deltaLabel, description, sparkline, className }: MetricCardProps) {
  const esPositivo = (delta ?? 0) >= 0;
  const sparklineData = sparkline?.map((v, i) => ({ i, v }));

  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {Icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight truncate">{value}</p>
          {(delta !== undefined || description) && (
            <div className="mt-1 flex items-center gap-1.5 text-xs">
              {delta !== undefined && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 font-semibold',
                    esPositivo ? 'text-success' : 'text-destructive'
                  )}
                >
                  {esPositivo ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(delta).toFixed(1)}%
                </span>
              )}
              <span className="text-muted-foreground">{deltaLabel ?? description}</span>
            </div>
          )}
        </div>

        {sparklineData && sparklineData.length > 1 && (
          <div className="h-8 w-16 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={esPositivo ? 'rgb(var(--success))' : 'rgb(var(--destructive))'}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}
