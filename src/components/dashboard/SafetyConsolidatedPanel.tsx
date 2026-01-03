import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  AlertTriangle, 
  Timer, 
  TrendingDown,
  Pause,
  StopCircle,
  RefreshCw,
  Loader2,
  Activity,
  Ban,
  CheckCircle,
  AlertCircle,
  SlidersHorizontal,
  BarChart3
} from 'lucide-react';
import { useLossReaction, LossReactionState } from '@/hooks/useLossReaction';
import { useSystemSnapshot } from '@/contexts/SystemSnapshotContext';
import { cn } from '@/lib/utils';

type TabType = 'brakes' | 'risk' | 'thresholds' | 'tuning' | 'range';

export function SafetyConsolidatedPanel({ compact }: { compact?: boolean }) {
  const [activeTab, setActiveTab] = useState<TabType>('brakes');
  const { state, resetSession, clearCooldown, isResetting, isClearing } = useLossReaction();
  const { risk, refetchAll } = useSystemSnapshot();
  
  // Live countdown for cooldown
  const [cooldownDisplay, setCooldownDisplay] = useState('');
  
  useEffect(() => {
    // Fix: compute remaining time from cooldown_until directly, not from cached state
    const cooldownUntil = state.session.cooldown_until ? new Date(state.session.cooldown_until).getTime() : 0;
    
    const updateCooldown = () => {
      const now = Date.now();
      const remaining = cooldownUntil - now;
      if (remaining <= 0) {
        setCooldownDisplay('');
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCooldownDisplay(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    
    if (!cooldownUntil || cooldownUntil <= Date.now()) {
      setCooldownDisplay('');
      return;
    }
    
    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [state.session.cooldown_until]);

  // Risk state from snapshot
  const daily = risk?.dailyLossPct ?? 0;
  const dd = risk?.drawdownPct ?? 0;
  const streak = risk?.consecutiveLossDays ?? 0;
  const shouldRollback = risk?.shouldRollback ?? false;
  const breaches = risk?.rollbackBreaches ?? [];

  // Determine overall status
  const getOverallStatus = () => {
    if (state.isDayStopped) return { label: 'DAY STOPPED', color: 'text-destructive', bg: 'bg-destructive/20' };
    if (state.isInCooldown) return { label: 'COOLDOWN', color: 'text-amber-500', bg: 'bg-amber-500/20' };
    if (shouldRollback) return { label: 'ROLLBACK', color: 'text-destructive', bg: 'bg-destructive/20' };
    if (breaches.length > 0) return { label: 'AT RISK', color: 'text-amber-500', bg: 'bg-amber-500/20' };
    if (state.session.consecutive_losses > 0) return { label: 'LOSSES', color: 'text-amber-500', bg: 'bg-amber-500/20' };
    return { label: 'CLEAR', color: 'text-emerald-500', bg: 'bg-emerald-500/20' };
  };

  const overall = getOverallStatus();

  return (
    <div className="space-y-3">
      {/* Header with overall status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold font-mono">Safety Panel</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn("text-[10px] font-mono", overall.color, overall.bg)}>
            {overall.label}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => refetchAll?.()}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 bg-muted/20 rounded-lg p-1">
        {[
          { id: 'brakes' as TabType, label: 'Brakes', icon: <StopCircle className="h-3 w-3" /> },
          { id: 'risk' as TabType, label: 'Risk', icon: <AlertTriangle className="h-3 w-3" /> },
          { id: 'thresholds' as TabType, label: 'Limits', icon: <Activity className="h-3 w-3" /> },
          { id: 'tuning' as TabType, label: 'Tuning', icon: <SlidersHorizontal className="h-3 w-3" /> },
          { id: 'range' as TabType, label: 'Range', icon: <BarChart3 className="h-3 w-3" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 rounded font-mono transition-colors",
              activeTab === tab.id 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'brakes' && (
        <BrakesTab state={state} cooldownDisplay={cooldownDisplay} onReset={resetSession} onClearCooldown={clearCooldown} isResetting={isResetting} isClearing={isClearing} />
      )}
      {activeTab === 'risk' && (
        <RiskTab daily={daily} dd={dd} streak={streak} shouldRollback={shouldRollback} breaches={breaches} />
      )}
      {activeTab === 'thresholds' && (
        <ThresholdsTab state={state} />
      )}
      {activeTab === 'tuning' && (
        <StrategyThresholdsEditor />
      )}
      {activeTab === 'range' && (
        <RangeStrategyPanel />
      )}
    </div>
  );
}

// Brakes Tab - Loss Reaction State
function BrakesTab({ 
  state, 
  cooldownDisplay, 
  onReset, 
  onClearCooldown,
  isResetting,
  isClearing,
}: { 
  state: LossReactionState; 
  cooldownDisplay: string;
  onReset: (reason?: string) => void;
  onClearCooldown: (reason?: string) => void;
  isResetting: boolean;
  isClearing: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Status cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className={cn(
          "rounded-lg p-2 space-y-1",
          state.isDayStopped ? "bg-destructive/20 border border-destructive/30" : "bg-muted/30"
        )}>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <StopCircle className="h-3 w-3" />
            Day Status
          </div>
          <div className={cn("font-mono text-sm font-bold", state.isDayStopped ? "text-destructive" : "text-emerald-500")}>
            {state.isDayStopped ? 'STOPPED' : 'ACTIVE'}
          </div>
        </div>
        
        <div className={cn(
          "rounded-lg p-2 space-y-1",
          state.isInCooldown ? "bg-amber-500/20 border border-amber-500/30" : "bg-muted/30"
        )}>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Timer className="h-3 w-3" />
            Cooldown
          </div>
          <div className={cn("font-mono text-sm font-bold", state.isInCooldown ? "text-amber-500" : "text-emerald-500")}>
            {state.isInCooldown ? cooldownDisplay : 'NONE'}
          </div>
        </div>
        
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <TrendingDown className="h-3 w-3" />
            Losses Streak
          </div>
          <div className={cn(
            "font-mono text-sm font-bold",
            state.session.consecutive_losses >= state.config.max_consecutive_losses ? 'text-destructive' :
            state.session.consecutive_losses > 0 ? 'text-amber-500' : 'text-emerald-500'
          )}>
            {state.session.consecutive_losses} / {state.config.max_consecutive_losses}
          </div>
        </div>
        
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Pause className="h-3 w-3" />
            Size Mult
          </div>
          <div className={cn(
            "font-mono text-sm font-bold",
            state.isSizeReduced ? 'text-amber-500' : 'text-foreground'
          )}>
            {(state.session.size_multiplier * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Day stopped reason */}
      {state.isDayStopped && state.session.day_stopped_reason && (
        <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
          <Ban className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-[10px] text-destructive font-mono">{state.session.day_stopped_reason}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {state.isInCooldown && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-[10px] h-8"
            disabled={isClearing}
            onClick={() => onClearCooldown('manual_override')}
          >
            {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Timer className="h-3 w-3 mr-1" />}
            Clear Cooldown
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-[10px] h-8"
          disabled={isResetting}
          onClick={() => onReset('manual_reset')}
        >
          {isResetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Reset Session
        </Button>
      </div>
    </div>
  );
}

// Risk Tab - Drawdown and rollback state
function RiskTab({ 
  daily, 
  dd, 
  streak, 
  shouldRollback,
  breaches,
}: { 
  daily: number; 
  dd: number; 
  streak: number;
  shouldRollback: boolean;
  breaches: string[];
}) {
  const THRESHOLDS = {
    dailyLoss: 0.05,
    drawdown: 0.10,
    consecutiveLossDays: 5,
  };

  const MetricBar = ({ value, threshold, label }: { value: number; threshold: number; label: string }) => {
    const pct = Math.min((Math.abs(value) / threshold) * 100, 100);
    const danger = Math.abs(value) >= threshold;
    const warning = Math.abs(value) >= threshold * 0.7;
    
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">{label}</span>
          <span className={cn(
            "font-mono",
            danger ? "text-destructive font-bold" : warning ? "text-amber-500" : "text-foreground"
          )}>
            {(value * 100).toFixed(2)}% / {(threshold * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all",
              danger ? "bg-destructive" : warning ? "bg-amber-500" : "bg-emerald-500"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Rollback warning */}
      {shouldRollback && (
        <div className="flex items-center gap-2 p-2 bg-destructive/20 border border-destructive/30 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-destructive animate-pulse" />
          <span className="text-[11px] text-destructive font-bold font-mono">ROLLBACK TRIGGERED</span>
        </div>
      )}

      {/* Risk bars */}
      <div className="space-y-3">
        <MetricBar value={daily} threshold={THRESHOLDS.dailyLoss} label="Daily Loss" />
        <MetricBar value={dd} threshold={THRESHOLDS.drawdown} label="Drawdown" />
        
        <div className="space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Loss Days Streak</span>
            <span className={cn(
              "font-mono",
              streak >= THRESHOLDS.consecutiveLossDays ? "text-destructive font-bold" : 
              streak >= 3 ? "text-amber-500" : "text-foreground"
            )}>
              {streak} / {THRESHOLDS.consecutiveLossDays}
            </span>
          </div>
          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all",
                streak >= THRESHOLDS.consecutiveLossDays ? "bg-destructive" : 
                streak >= 3 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${Math.min((streak / THRESHOLDS.consecutiveLossDays) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Breaches list */}
      {breaches.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-muted-foreground">Active Breaches:</div>
          <div className="flex flex-wrap gap-1">
            {breaches.map((breach, i) => (
              <Badge key={i} variant="destructive" className="text-[9px]">
                {breach}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Thresholds Tab - Current configured limits + Canary limits
function ThresholdsTab({ state }: { state: LossReactionState }) {
  const { data: systemConfig } = useSystemConfig();
  
  // Get canary limits from config (with safe defaults)
  const configAny = systemConfig as Record<string, unknown> | undefined;
  const canaryLimits = (configAny?.canary_limits as Record<string, unknown>) ?? {
    max_trades_per_day: 3,
    max_usd_per_trade: 5,
    auto_disarm_after_trade: true,
    max_trades_per_session: 1,
  };

  const lossLimits = [
    { label: 'Cooldown after loss', value: `${state.config.cooldown_minutes_after_loss} min`, icon: <Timer className="h-3 w-3" /> },
    { label: 'Max consecutive losses', value: state.config.max_consecutive_losses.toString(), icon: <TrendingDown className="h-3 w-3" /> },
    { label: 'Halve size at DD', value: `${state.config.halve_size_drawdown_pct}%`, icon: <Pause className="h-3 w-3" /> },
    { label: 'Day stop at DD', value: `${state.config.day_stop_pct}%`, icon: <StopCircle className="h-3 w-3" /> },
  ];

  const canaryLimitItems = [
    { label: 'Max trades/day', value: (canaryLimits.max_trades_per_day as number)?.toString() ?? '3', icon: <Activity className="h-3 w-3" /> },
    { label: 'Max $/trade', value: `$${canaryLimits.max_usd_per_trade ?? 5}`, icon: <Ban className="h-3 w-3" /> },
    { label: 'Auto-disarm', value: (canaryLimits.auto_disarm_after_trade as boolean) ? 'Yes' : 'No', icon: <Shield className="h-3 w-3" /> },
    { label: 'Trades/session', value: (canaryLimits.max_trades_per_session as number)?.toString() ?? '1', icon: <CheckCircle className="h-3 w-3" /> },
  ];

  return (
    <div className="space-y-3">
      {/* Canary Limits Section */}
      <div className="space-y-1">
        <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider flex items-center gap-1">
          <Shield className="h-3 w-3 text-amber-500" />
          Canary Limits
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {canaryLimitItems.map((limit, i) => (
            <div key={i} className="flex items-center justify-between p-1.5 bg-amber-500/10 border border-amber-500/20 rounded">
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                {limit.icon}
                {limit.label}
              </div>
              <span className="text-[10px] font-mono font-medium text-amber-500">{limit.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Loss Reaction Limits Section */}
      <div className="space-y-1">
        <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider flex items-center gap-1">
          <StopCircle className="h-3 w-3" />
          Loss Reaction
        </div>
        {lossLimits.map((limit, i) => (
          <div key={i} className="flex items-center justify-between p-1.5 bg-muted/20 rounded">
            <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
              {limit.icon}
              {limit.label}
            </div>
            <span className="text-[10px] font-mono font-medium">{limit.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Imports
import { useSystemConfig } from '@/hooks/useSystemConfig';
import { StrategyThresholdsEditor } from './StrategyThresholdsEditor';
import { RangeStrategyPanel } from './RangeStrategyPanel';
