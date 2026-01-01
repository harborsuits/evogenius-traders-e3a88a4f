import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  useTradeModeBadge, 
  useGenerationBadge, 
  useBrainBadge,
  usePipelineHealth,
  useRiskState,
} from '@/contexts/SystemSnapshotContext';
import { 
  Lock, 
  Zap, 
  FlaskConical, 
  AlertTriangle,
  CheckCircle,
  Brain,
  Users,
  Activity,
} from 'lucide-react';

// ============================================
// STANDARDIZED SNAPSHOT BADGES
// Consistent display of system state across all cards
// ============================================

// Mode Badge: PAPER / LIVE / LIVE-ARMED / LOCKED
export function ModeBadge({ compact = false }: { compact?: boolean }) {
  const { mode, isLive, isLiveArmed, isLocked, armedSecondsRemaining } = useTradeModeBadge();

  if (isLocked) {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "bg-amber-500/10 text-amber-500 border-amber-500/30",
          compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
        )}
      >
        <Lock className={cn("mr-1", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
        LOCKED
      </Badge>
    );
  }

  if (isLiveArmed) {
    const mins = Math.floor(armedSecondsRemaining / 60);
    const secs = armedSecondsRemaining % 60;
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "bg-destructive/10 text-destructive border-destructive/30 animate-pulse",
          compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
        )}
      >
        <Zap className={cn("mr-1", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
        ARMED {mins}:{secs.toString().padStart(2, '0')}
      </Badge>
    );
  }

  if (isLive) {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "bg-destructive/10 text-destructive border-destructive/30",
          compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
        )}
      >
        <Zap className={cn("mr-1", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
        LIVE
      </Badge>
    );
  }

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "bg-primary/10 text-primary border-primary/30",
        compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
      )}
    >
      <FlaskConical className={cn("mr-1", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
      PAPER
    </Badge>
  );
}

// Generation Badge: Gen 14 (100)
export function GenerationBadge({ compact = false }: { compact?: boolean }) {
  const { number, cohortCount, isActive, isStale } = useGenerationBadge();

  if (number === null) {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "bg-muted/30 text-muted-foreground",
          compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
        )}
      >
        <Users className={cn("mr-1", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
        No Gen
      </Badge>
    );
  }

  const isCohortDrift = cohortCount !== 100 && cohortCount !== 0;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        isActive 
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" 
          : "bg-muted/30 text-muted-foreground",
        isCohortDrift && "bg-amber-500/10 text-amber-500 border-amber-500/30",
        isStale && "opacity-60",
        compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
      )}
    >
      <Users className={cn("mr-1", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
      Gen {number}
      {cohortCount > 0 && (
        <span className="ml-1 opacity-70">({cohortCount})</span>
      )}
      {isCohortDrift && <AlertTriangle className="ml-1 h-2 w-2" />}
    </Badge>
  );
}

// Brain Badge: Brain v3 (warmup)
export function BrainBadge({ compact = false }: { compact?: boolean }) {
  const { version, isActive, gateProfile, qualifiedCount } = useBrainBadge();

  if (!version) {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "bg-muted/30 text-muted-foreground",
          compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
        )}
      >
        <Brain className={cn("mr-1", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
        No Brain
      </Badge>
    );
  }

  return (
    <Badge 
      variant="outline" 
      className={cn(
        isActive 
          ? "bg-purple-500/10 text-purple-400 border-purple-500/30" 
          : "bg-muted/30 text-muted-foreground",
        compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
      )}
    >
      <Brain className={cn("mr-1", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
      v{version}
      {gateProfile && (
        <span className="ml-1 opacity-70">({gateProfile})</span>
      )}
    </Badge>
  );
}

// Staleness Badge: LIVE / STALE
export function StalenessBadge({ 
  stale, 
  ageSeconds,
  compact = false,
}: { 
  stale: boolean; 
  ageSeconds: number;
  compact?: boolean;
}) {
  if (!stale) {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
          compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
        )}
      >
        <CheckCircle className={cn("mr-1", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
        LIVE
      </Badge>
    );
  }

  const formatAge = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "bg-amber-500/10 text-amber-500 border-amber-500/30",
        compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
      )}
    >
      <AlertTriangle className={cn("mr-1", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
      STALE {formatAge(ageSeconds)}
    </Badge>
  );
}

// Pipeline Health Badge
export function PipelineBadge({ compact = false }: { compact?: boolean }) {
  const { tradeCycleStale, marketPollStale, overallStale, pendingShadow } = usePipelineHealth();

  const hasIssue = tradeCycleStale || marketPollStale;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        hasIssue 
          ? "bg-amber-500/10 text-amber-500 border-amber-500/30" 
          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
        compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
      )}
    >
      <Activity className={cn("mr-1", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
      {hasIssue ? 'PIPE ⚠' : 'PIPE OK'}
      {pendingShadow > 0 && (
        <span className="ml-1 opacity-70">({pendingShadow})</span>
      )}
    </Badge>
  );
}

// Risk Badge
export function RiskBadge({ compact = false }: { compact?: boolean }) {
  const { shouldRollback, drawdownPct, dailyLossPct, breaches } = useRiskState();

  if (shouldRollback) {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "bg-destructive/20 text-destructive border-destructive/50 animate-pulse",
          compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
        )}
      >
        <AlertTriangle className={cn("mr-1", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
        ROLLBACK
      </Badge>
    );
  }

  const isWarning = drawdownPct > 0.05 || dailyLossPct > 0.02;

  if (isWarning) {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "bg-amber-500/10 text-amber-500 border-amber-500/30",
          compact ? "text-[8px] px-1 py-0" : "text-[10px] px-1.5 py-0"
        )}
      >
        DD {(drawdownPct * 100).toFixed(1)}%
      </Badge>
    );
  }

  return null; // No badge when risk is normal
}

// Combined Header Badges - Standard header for all cards
export function CardHeaderBadges({ 
  compact = false,
  showMode = true,
  showGeneration = true,
  showBrain = false,
  showPipeline = false,
  showRisk = false,
}: { 
  compact?: boolean;
  showMode?: boolean;
  showGeneration?: boolean;
  showBrain?: boolean;
  showPipeline?: boolean;
  showRisk?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {showMode && <ModeBadge compact={compact} />}
      {showGeneration && <GenerationBadge compact={compact} />}
      {showBrain && <BrainBadge compact={compact} />}
      {showPipeline && <PipelineBadge compact={compact} />}
      {showRisk && <RiskBadge compact={compact} />}
    </div>
  );
}

// Data Source Footer - Shows where data comes from
export function DataSourceFooter({ 
  source,
  genId,
}: { 
  source: string;
  genId?: string | null;
}) {
  return (
    <div className="text-[9px] text-muted-foreground/60 font-mono mt-2 pt-2 border-t border-border/20">
      source: {source}
      {genId && <span className="ml-1">(gen {genId.slice(0, 8)})</span>}
    </div>
  );
}
