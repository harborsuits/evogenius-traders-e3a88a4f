import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StalenessIndicatorProps {
  ageSeconds: number;
  stale: boolean;
  showAge?: boolean;
  compact?: boolean;
  className?: string;
  onRefresh?: () => void;
}

function formatAge(seconds: number): string {
  if (seconds === Infinity || isNaN(seconds)) return 'never';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function StalenessIndicator({ 
  ageSeconds, 
  stale, 
  showAge = true,
  compact = false,
  className,
  onRefresh,
}: StalenessIndicatorProps) {
  if (compact) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        {stale ? (
          <Badge variant="destructive" className="text-[8px] px-1 py-0 h-4">
            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
            STALE
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 text-success border-success/30">
            <span className="w-1 h-1 rounded-full bg-success mr-1 animate-pulse" />
            LIVE
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1.5 text-[10px]", className)}>
      {stale ? (
        <>
          <Badge variant="destructive" className="text-[8px] px-1.5 py-0 h-4">
            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
            STALE
          </Badge>
          {showAge && (
            <span className="text-destructive font-mono">
              {formatAge(ageSeconds)} ago
            </span>
          )}
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          {showAge && (
            <span className="text-muted-foreground font-mono">
              {formatAge(ageSeconds)} ago
            </span>
          )}
        </>
      )}
      {onRefresh && (
        <button 
          onClick={onRefresh}
          className="p-0.5 hover:bg-muted/50 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </button>
      )}
    </div>
  );
}

// Simple live badge for tile headers
interface LiveBadgeProps {
  stale?: boolean;
  className?: string;
}

export function LiveBadge({ stale = false, className }: LiveBadgeProps) {
  if (stale) {
    return (
      <Badge 
        variant="destructive" 
        className={cn("text-[8px] px-1 py-0 ml-auto", className)}
      >
        STALE
      </Badge>
    );
  }
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-[8px] px-1 py-0 ml-auto border-success/30 text-success",
        className
      )}
    >
      <span className="w-1 h-1 rounded-full bg-success mr-1 animate-pulse" />
      LIVE
    </Badge>
  );
}

// Tile header with staleness
interface TileHeaderProps {
  icon: React.ReactNode;
  title: string;
  ageSeconds?: number;
  stale?: boolean;
  onRefresh?: () => void;
}

export function TileHeader({ icon, title, ageSeconds, stale = false, onRefresh }: TileHeaderProps) {
  return (
    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
      {icon}
      {title}
      <div className="ml-auto flex items-center gap-1">
        {ageSeconds !== undefined && (
          <span className="text-[9px] font-mono opacity-60">
            {formatAge(ageSeconds)}
          </span>
        )}
        <LiveBadge stale={stale} />
        {onRefresh && (
          <button 
            onClick={onRefresh}
            className="p-0.5 hover:bg-muted/50 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3 hover:text-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

// Enhanced tile header with snapshot badges
interface SnapshotTileHeaderProps {
  icon: React.ReactNode;
  title: string;
  badges?: React.ReactNode;
  onRefresh?: () => void;
}

export function SnapshotTileHeader({ icon, title, badges, onRefresh }: SnapshotTileHeaderProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex items-center gap-2 font-mono text-muted-foreground uppercase tracking-wider">
        {icon}
        {title}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {badges}
        {onRefresh && (
          <button 
            onClick={onRefresh}
            className="p-0.5 hover:bg-muted/50 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3 hover:text-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}
