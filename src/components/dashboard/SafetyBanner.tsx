import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSystemState, useMarketData } from '@/hooks/useEvoTraderData';
import { useTradeMode } from '@/hooks/usePaperTrading';
import { AlertTriangle, CheckCircle, XCircle, Clock, Square, Activity, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';

type BlockReason = 
  | 'NONE' 
  | 'BLOCKED_SYSTEM_STOPPED' 
  | 'BLOCKED_SYSTEM_PAUSED' 
  | 'BLOCKED_STALE_MARKET_DATA' 
  | 'BLOCKED_DEAD_MARKET_DATA' 
  | 'BLOCKED_LIVE_NOT_ARMED';

export function SafetyBanner() {
  const { data: systemState } = useSystemState();
  const { data: marketData = [] } = useMarketData();
  const { data: tradeMode } = useTradeMode();
  const queryClient = useQueryClient();
  const [emergencyStopping, setEmergencyStopping] = useState(false);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number | null>(null);

  const status = systemState?.status ?? 'stopped';
  const mode = tradeMode ?? 'paper';
  const isLive = mode === 'live';
  const isRunning = status === 'running';
  const isPaused = status === 'paused';

  // Calculate market data freshness
  const latestUpdate = marketData.length > 0 
    ? Math.max(...marketData.map(m => new Date(m.updated_at).getTime()))
    : null;

  useEffect(() => {
    if (!latestUpdate) {
      setSecondsSinceUpdate(null);
      return;
    }

    const updateSeconds = () => {
      const seconds = Math.floor((Date.now() - latestUpdate) / 1000);
      setSecondsSinceUpdate(seconds);
    };

    updateSeconds();
    const interval = setInterval(updateSeconds, 1000);
    return () => clearInterval(interval);
  }, [latestUpdate]);

  const isStale = secondsSinceUpdate !== null && secondsSinceUpdate > 60;
  const isDead = secondsSinceUpdate !== null && secondsSinceUpdate > 300;

  // Determine block reason - matches edge function reason enums
  const getBlockReason = (): BlockReason => {
    if (status === 'stopped') return 'BLOCKED_SYSTEM_STOPPED';
    if (status === 'paused') return 'BLOCKED_SYSTEM_PAUSED';
    if (isDead) return 'BLOCKED_DEAD_MARKET_DATA';
    if (isStale) return 'BLOCKED_STALE_MARKET_DATA';
    if (isLive) return 'BLOCKED_LIVE_NOT_ARMED';
    return 'NONE';
  };

  const blockReason = getBlockReason();
  const isTradingBlocked = blockReason !== 'NONE';

  const handleEmergencyStop = async () => {
    setEmergencyStopping(true);
    try {
      const { error } = await supabase.functions.invoke('system-control', {
        body: { action: 'stop' }
      });

      if (error) throw error;

      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'system-state' 
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'control-events' 
      });

      toast({
        title: "Emergency Stop Activated",
        description: "All trading has been halted immediately.",
        variant: "destructive",
      });
    } catch (err) {
      toast({
        title: "Stop Failed",
        description: "Could not stop the system. Try again.",
        variant: "destructive",
      });
    } finally {
      setEmergencyStopping(false);
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  const blockReasonLabels: Record<BlockReason, string> = {
    NONE: '',
    BLOCKED_SYSTEM_STOPPED: 'System is stopped',
    BLOCKED_SYSTEM_PAUSED: 'System is paused',
    BLOCKED_STALE_MARKET_DATA: 'Market data is stale (>60s)',
    BLOCKED_DEAD_MARKET_DATA: 'Market data is dead (>5min)',
    BLOCKED_LIVE_NOT_ARMED: 'Live mode requires explicit arm',
  };

  return (
    <div className={`rounded-lg border-2 p-3 mb-4 transition-all ${
      isTradingBlocked 
        ? 'border-destructive/50 bg-destructive/5' 
        : 'border-primary/30 bg-primary/5'
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Mode + Status Badges */}
        <div className="flex items-center gap-2">
          {/* Trade Mode */}
          <Badge 
            variant={isLive ? 'destructive' : 'outline'}
            className={`text-sm font-mono px-3 py-1 ${
              isLive 
                ? 'bg-destructive text-destructive-foreground animate-pulse' 
                : 'border-primary text-primary'
            }`}
          >
            {isLive ? '🔴 LIVE' : '📄 PAPER'}
          </Badge>

          {/* System Status */}
          <Badge 
            variant={isRunning ? 'default' : 'secondary'}
            className={`text-sm font-mono px-3 py-1 ${
              isRunning 
                ? 'bg-primary text-primary-foreground' 
                : isPaused 
                  ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {isRunning && <Activity className="h-3 w-3 mr-1 animate-pulse" />}
            {status.toUpperCase()}
          </Badge>
        </div>

        {/* Center: Market Data Status */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {isDead ? (
            <XCircle className="h-4 w-4 text-destructive" />
          ) : isStale ? (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          ) : secondsSinceUpdate !== null ? (
            <CheckCircle className="h-4 w-4 text-primary" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={
            isDead ? 'text-destructive' : 
            isStale ? 'text-yellow-500' : 
            'text-muted-foreground'
          }>
            Market: {
              secondsSinceUpdate !== null 
                ? (isDead ? 'DEAD' : isStale ? 'STALE' : 'OK')
                : 'N/A'
            }
            {secondsSinceUpdate !== null && (
              <span className="ml-1 opacity-75">({formatTime(secondsSinceUpdate)})</span>
            )}
          </span>
        </div>

        {/* Right: Block Reason + Kill Switch */}
        <div className="flex items-center gap-2">
          {isTradingBlocked && (
            <span className="text-xs font-mono text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {blockReasonLabels[blockReason]}
            </span>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={handleEmergencyStop}
            disabled={status === 'stopped' || emergencyStopping}
            className="font-mono text-xs"
          >
            {emergencyStopping ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Square className="h-3 w-3 mr-1" />
            )}
            KILL
          </Button>
        </div>
      </div>
    </div>
  );
}
