import { useSystemVitals } from '@/hooks/useSystemVitals';
import { Activity, Brain, Zap, Clock, Users, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface SystemVitalsProps {
  compact?: boolean;
}

function StatusDot({ status }: { status: 'green' | 'yellow' | 'red' }) {
  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full',
        status === 'green' && 'bg-success',
        status === 'yellow' && 'bg-warning',
        status === 'red' && 'bg-destructive animate-pulse'
      )}
    />
  );
}

function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp) return 'never';
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
}

export function SystemVitals({ compact = false }: SystemVitalsProps) {
  const { data: vitals, isLoading } = useSystemVitals();
  
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  
  if (!vitals) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        Unable to load vitals
      </div>
    );
  }
  
  if (compact) {
    return (
      <div className="space-y-2">
        {/* Throughput row */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <StatusDot status={vitals.evalStatus} />
            <span className="text-muted-foreground">Decisions</span>
          </div>
          <span className="font-mono">{vitals.decisionsLastHour}/hr</span>
        </div>
        
        {/* Agents row */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <StatusDot status={vitals.heartbeatStatus} />
            <span className="text-muted-foreground">Agents</span>
          </div>
          <span className="font-mono">
            {vitals.activeAgents - vitals.staleAgents}/{vitals.activeAgents}
          </span>
        </div>
        
        {/* Learning row */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <StatusDot status={vitals.learningStatus} />
            <span className="text-muted-foreground">Fitness</span>
          </div>
          <span className="font-mono text-[10px]">
            {formatTimeAgo(vitals.lastFitnessCalc)}
          </span>
        </div>
        
        {/* Rates */}
        <div className="flex gap-2 pt-1 border-t border-border/30">
          <Badge variant="outline" className="text-[10px] px-1.5">
            Eval {vitals.evalRatePct}%
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5">
            Trade {vitals.tradeRatePct}%
          </Badge>
        </div>
      </div>
    );
  }
  
  // Full view
  return (
    <div className="space-y-6">
      {/* Section: Decision Throughput */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Zap className="h-4 w-4 text-primary" />
          Decision Throughput
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-2xl font-mono font-bold">
              {vitals.decisionsLastHour}
            </div>
            <div className="text-xs text-muted-foreground">decisions/hr</div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <StatusDot status={vitals.evalStatus} />
              <span className="text-2xl font-mono font-bold">{vitals.evalRatePct}%</span>
            </div>
            <div className="text-xs text-muted-foreground">eval rate</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-2xl font-mono font-bold">
              {vitals.tradeRatePct}%
            </div>
            <div className="text-xs text-muted-foreground">trade rate</div>
          </div>
        </div>
      </div>
      
      {/* Section: Agent Heartbeat */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="h-4 w-4 text-primary" />
          Agent Heartbeat
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-2xl font-mono font-bold text-success">
              {vitals.activeAgents - vitals.staleAgents}
            </div>
            <div className="text-xs text-muted-foreground">active</div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <StatusDot status={vitals.heartbeatStatus} />
              <span className={cn(
                'text-2xl font-mono font-bold',
                vitals.staleAgents > 0 && 'text-warning'
              )}>
                {vitals.staleAgents}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">stale</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-lg font-mono">
              {vitals.worstStaleMinutes !== null 
                ? `${vitals.worstStaleMinutes}m`
                : '—'
              }
            </div>
            <div className="text-xs text-muted-foreground">worst lag</div>
          </div>
        </div>
      </div>
      
      {/* Section: Learning Tick */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Brain className="h-4 w-4 text-primary" />
          Learning Tick
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <StatusDot status={vitals.learningStatus} />
              <span className="text-muted-foreground">Fitness calc</span>
            </div>
            <span className="font-mono text-xs">
              {formatTimeAgo(vitals.lastFitnessCalc)}
            </span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2" />
              <span className="text-muted-foreground">Adaptive tuning</span>
            </div>
            <span className="font-mono text-xs">
              {formatTimeAgo(vitals.lastAdaptiveTuning)}
            </span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2" />
              <span className="text-muted-foreground">Selection/breeding</span>
            </div>
            <span className="font-mono text-xs">
              {formatTimeAgo(vitals.lastSelectionBreeding)}
            </span>
          </div>
        </div>
      </div>
      
      {/* Overall status */}
      <div className="pt-3 border-t border-border/30">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Overall</span>
          <div className="flex gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <StatusDot status={vitals.heartbeatStatus} />
              <span>Agents</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <StatusDot status={vitals.evalStatus} />
              <span>Eval</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <StatusDot status={vitals.learningStatus} />
              <span>Learning</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
