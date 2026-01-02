import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ShieldAlert, 
  Clock, 
  TrendingDown, 
  XCircle, 
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Pause,
} from 'lucide-react';
import { useLossReaction } from '@/hooks/useLossReaction';

export function LossReactionPanel() {
  const { 
    state, 
    resetSession, 
    clearCooldown, 
    isResetting, 
    isClearing 
  } = useLossReaction();
  
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Update cooldown countdown
  useEffect(() => {
    if (!state.isInCooldown) {
      setCooldownRemaining(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, state.cooldownRemainingMs - (Date.now() - performance.now()));
      setCooldownRemaining(state.cooldownRemainingMs);
    };

    updateCountdown();
    const interval = setInterval(() => {
      const cooldownEnd = state.session.cooldown_until ? new Date(state.session.cooldown_until) : null;
      const remaining = cooldownEnd ? Math.max(0, cooldownEnd.getTime() - Date.now()) : 0;
      setCooldownRemaining(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isInCooldown, state.cooldownRemainingMs, state.session.cooldown_until]);

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Determine overall status
  const getStatus = () => {
    if (state.isDayStopped) return { 
      label: 'DAY STOPPED', 
      variant: 'destructive' as const, 
      icon: XCircle 
    };
    if (state.session.consecutive_losses >= state.config.max_consecutive_losses) return { 
      label: 'LOSS LIMIT', 
      variant: 'destructive' as const, 
      icon: ShieldAlert 
    };
    if (state.isInCooldown) return { 
      label: 'COOLDOWN', 
      variant: 'secondary' as const, 
      icon: Pause 
    };
    if (state.isSizeReduced) return { 
      label: 'REDUCED SIZE', 
      variant: 'secondary' as const, 
      icon: TrendingDown 
    };
    return { 
      label: 'ACTIVE', 
      variant: 'outline' as const, 
      icon: CheckCircle 
    };
  };

  const status = getStatus();
  const StatusIcon = status.icon;

  const isBlocked = state.isDayStopped || 
    state.session.consecutive_losses >= state.config.max_consecutive_losses || 
    state.isInCooldown;

  return (
    <Card className={`border ${isBlocked ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Loss Reaction
          </CardTitle>
          <Badge variant={status.variant} className="gap-1">
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Consecutive Losses */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Consecutive Losses</span>
          <div className="flex items-center gap-2">
            <span className={`text-lg font-mono ${
              state.session.consecutive_losses >= state.config.max_consecutive_losses 
                ? 'text-destructive' 
                : state.session.consecutive_losses > 0 
                  ? 'text-yellow-500' 
                  : 'text-foreground'
            }`}>
              {state.session.consecutive_losses}
            </span>
            <span className="text-xs text-muted-foreground">
              / {state.config.max_consecutive_losses} max
            </span>
          </div>
        </div>

        {/* Cooldown Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Cooldown</span>
          {state.isInCooldown ? (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />
              <span className="font-mono text-yellow-500">
                {formatTime(cooldownRemaining)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">None</span>
          )}
        </div>

        {/* Size Multiplier */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Position Size</span>
          <span className={`font-mono ${state.isSizeReduced ? 'text-yellow-500' : 'text-foreground'}`}>
            {state.session.size_multiplier ?? 1}x
          </span>
        </div>

        {/* Day Stop Reason */}
        {state.isDayStopped && state.session.day_stopped_reason && (
          <div className="bg-destructive/10 rounded-md p-3 border border-destructive/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Trading Halted</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {state.session.day_stopped_reason}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Config Info */}
        <div className="text-xs text-muted-foreground border-t pt-3 mt-3 space-y-1">
          <div className="flex justify-between">
            <span>Cooldown after loss:</span>
            <span>{state.config.cooldown_minutes_after_loss}m</span>
          </div>
          <div className="flex justify-between">
            <span>Halve size at:</span>
            <span>-{state.config.halve_size_drawdown_pct}% day</span>
          </div>
          <div className="flex justify-between">
            <span>Day stop at:</span>
            <span>-{state.config.day_stop_pct}% day</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {state.isInCooldown && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => clearCooldown('manual')}
              disabled={isClearing}
            >
              {isClearing ? (
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Clock className="h-3 w-3 mr-1" />
              )}
              Clear Cooldown
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => resetSession('manual')}
            disabled={isResetting}
          >
            {isResetting ? (
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Reset Session
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
