import { cn } from '@/lib/utils';
import { SystemStatus } from '@/types/evotrader';

interface StatusIndicatorProps {
  status: SystemStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const statusConfig = {
  running: {
    label: 'RUNNING',
    colorClass: 'bg-success',
    pulseClass: 'animate-pulse',
  },
  paused: {
    label: 'PAUSED',
    colorClass: 'bg-accent',
    pulseClass: '',
  },
  stopped: {
    label: 'STOPPED',
    colorClass: 'bg-muted-foreground',
    pulseClass: '',
  },
  error: {
    label: 'ERROR',
    colorClass: 'bg-destructive',
    pulseClass: 'animate-pulse',
  },
};

const sizeConfig = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
};

export function StatusIndicator({ status, size = 'md', showLabel = true }: StatusIndicatorProps) {
  const config = statusConfig[status];
  
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div 
          className={cn(
            'rounded-full',
            sizeConfig[size],
            config.colorClass,
            config.pulseClass
          )}
        />
        {status === 'running' && (
          <div 
            className={cn(
              'absolute inset-0 rounded-full opacity-40',
              config.colorClass,
              'animate-ping'
            )}
          />
        )}
      </div>
      {showLabel && (
        <span className="font-mono text-xs tracking-wider text-muted-foreground">
          {config.label}
        </span>
      )}
    </div>
  );
}
