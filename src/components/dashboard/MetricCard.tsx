import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'glow' | 'stat';
}

export function MetricCard({ 
  label, 
  value, 
  subValue, 
  icon: Icon,
  trend,
  variant = 'default'
}: MetricCardProps) {
  return (
    <Card variant={variant} className="p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <div className="flex items-baseline gap-2">
            <span className={cn(
              'font-mono text-2xl font-bold',
              trend === 'up' && 'text-success',
              trend === 'down' && 'text-destructive',
              !trend && 'text-foreground'
            )}>
              {value}
            </span>
            {subValue && (
              <span className="text-xs text-muted-foreground font-mono">
                {subValue}
              </span>
            )}
          </div>
        </div>
        {Icon && (
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Card>
  );
}
