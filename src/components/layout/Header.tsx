import { StatusIndicator } from '@/components/dashboard/StatusIndicator';
import { TradeModeToggle } from '@/components/dashboard/TradeModeToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SystemStatus } from '@/types/evotrader';
import { Dna, ExternalLink, Square, Activity, AlertTriangle, CheckCircle, Clock, Loader2, FlaskConical } from 'lucide-react';
import { useSystemState, useMarketData } from '@/hooks/useEvoTraderData';
import { useTradeMode } from '@/hooks/usePaperTrading';
import { useStrategyTestMode } from '@/hooks/useSystemConfig';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';

interface HeaderProps {
  status: SystemStatus;
  generationNumber?: number;
}

export function Header({ status, generationNumber }: HeaderProps) {
  const { data: marketData = [] } = useMarketData();
  const { data: tradeMode } = useTradeMode();
  const isTestMode = useStrategyTestMode();
  const queryClient = useQueryClient();
  const [emergencyStopping, setEmergencyStopping] = useState(false);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number | null>(null);

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

  const handleEmergencyStop = async () => {
    setEmergencyStopping(true);
    try {
      const { error } = await supabase.functions.invoke('system-control', {
        body: { action: 'stop' }
      });
      if (error) throw error;
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'system-state' });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'control-events' });
      toast({ title: "Emergency Stop", description: "Trading halted.", variant: "destructive" });
    } catch {
      toast({ title: "Stop Failed", variant: "destructive" });
    } finally {
      setEmergencyStopping(false);
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-lg">
      <div className="flex h-12 items-center justify-between px-3 gap-2">
        {/* Logo + Gen Badge */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex items-center gap-1.5">
            <Dna className="h-5 w-5 text-primary" />
            <span className="font-mono text-sm font-bold gradient-text hidden sm:inline">
              EvoTrader
            </span>
          </div>
          {generationNumber && (
            <Badge variant="glow" className="text-[10px] px-1.5 py-0 h-5">
              G{generationNumber}
            </Badge>
          )}
        </div>

        {/* Center: Status Cluster */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {/* Trade Mode */}
          <Badge 
            variant={isLive ? 'destructive' : 'outline'}
            className={`text-[10px] font-mono px-1.5 py-0 h-5 ${
              isLive ? 'bg-destructive animate-pulse' : 'border-primary/50 text-primary'
            }`}
          >
            {isLive ? 'LIVE' : 'PAPER'}
          </Badge>

          {/* System Status */}
          <Badge 
            variant={isRunning ? 'default' : 'secondary'}
            className={`text-[10px] font-mono px-1.5 py-0 h-5 ${
              isRunning ? 'bg-primary' : isPaused ? 'bg-yellow-500/20 text-yellow-500' : 'bg-muted text-muted-foreground'
            }`}
          >
            {isRunning && <Activity className="h-2.5 w-2.5 mr-0.5 animate-pulse" />}
            {status.toUpperCase()}
          </Badge>

          {/* Test Mode */}
          {isTestMode && (
            <Badge className="text-[10px] font-mono px-1.5 py-0 h-5 bg-orange-500/20 text-orange-500 border-orange-500/50">
              <FlaskConical className="h-2.5 w-2.5 mr-0.5" />
              TEST
            </Badge>
          )}

          {/* Market Status */}
          <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            {isDead ? (
              <AlertTriangle className="h-3 w-3 text-destructive" />
            ) : isStale ? (
              <AlertTriangle className="h-3 w-3 text-yellow-500" />
            ) : secondsSinceUpdate !== null ? (
              <CheckCircle className="h-3 w-3 text-primary" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
            <span className={isDead ? 'text-destructive' : isStale ? 'text-yellow-500' : ''}>
              {secondsSinceUpdate !== null ? formatTime(secondsSinceUpdate) : '–'}
            </span>
          </div>
        </div>

        {/* Right: Toggle + Kill + Coinbase */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden md:block">
            <TradeModeToggle compact />
          </div>

          <Button
            variant="destructive"
            size="sm"
            onClick={handleEmergencyStop}
            disabled={status === 'stopped' || emergencyStopping}
            className="h-7 px-2 text-[10px] font-mono"
          >
            {emergencyStopping ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Square className="h-3 w-3" />
            )}
            <span className="ml-1 hidden sm:inline">KILL</span>
          </Button>

          <Button variant="ghost" size="sm" className="h-7 px-2 hidden lg:flex text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
            <span className="ml-1 text-[10px]">CB</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
