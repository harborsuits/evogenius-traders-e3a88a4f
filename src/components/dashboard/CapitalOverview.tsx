import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  DollarSign,
  Shield,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Key,
  Timer,
  RefreshCw,
  Power,
  Loader2,
  Activity,
  AlertTriangle,
  TestTube
} from 'lucide-react';
import { useLiveSafety } from '@/hooks/useLiveSafety';
import { useArmLive } from '@/hooks/useArmLive';
import { useTradeModeContext } from '@/contexts/TradeModeContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export function CapitalOverview() {
  const { status, isLoading, refresh } = useLiveSafety();
  const { arm, disarm, isArming, isDisarming } = useArmLive();
  const { mode } = useTradeModeContext();
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Fetch last live trade attempt
  const { data: lastAttempt } = useQuery({
    queryKey: ['capital-last-attempt'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('control_events')
        .select('*')
        .in('action', ['live_trade_executed', 'live_trade_blocked', 'live_trade_error'])
        .order('triggered_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  // Countdown timer
  useEffect(() => {
    if (!status.isArmed) {
      setCountdown(0);
      return;
    }
    setCountdown(status.secondsRemaining);
    const interval = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [status.isArmed, status.secondsRemaining]);

  // Safety checks for collapsible
  const safetyChecks = [
    {
      label: 'Coinbase Connected',
      passed: status.coinbaseConnected,
      icon: Key,
      detail: status.coinbaseConnected ? 'API authenticated' : 'Not connected',
    },
    {
      label: 'Trade Permission',
      passed: status.canTrade,
      icon: Shield,
      detail: status.canTrade ? 'Can create orders' : 'Missing permission',
    },
    {
      label: 'Live Armed',
      passed: status.isArmed,
      icon: Timer,
      detail: status.isArmed ? `${countdown}s remaining` : 'Not armed',
    },
    {
      label: 'Cash Available',
      passed: status.maxAllowed > 0,
      icon: DollarSign,
      detail: `$${status.maxAllowed.toFixed(2)}`,
    },
  ];

  const passedCount = safetyChecks.filter(c => c.passed).length;
  const isPaper = mode === 'paper';

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Capital Overview
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge 
              variant={isPaper ? 'secondary' : 'destructive'}
              className="text-xs"
            >
              {isPaper ? (
                <><TestTube className="h-3 w-3 mr-1" />Paper</>
              ) : status.isArmed ? (
                <><Power className="h-3 w-3 mr-1 animate-pulse" />LIVE — {countdown}s</>
              ) : (
                'Live'
              )}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={refresh}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cash Summary */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2 rounded-lg bg-muted/30">
            <p className="text-lg font-bold text-primary">${status.usdAvailable.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Available</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30">
            <p className="text-lg font-bold text-amber-500">${status.usdHold.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">On Hold</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/30">
            <p className="text-lg font-bold text-foreground">${status.maxAllowed.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Max Allowed</p>
          </div>
        </div>

        {/* Live Cap */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Live Cap</span>
          <Badge variant="outline" className="font-mono">${status.liveCap}</Badge>
        </div>

        {/* Last Attempt */}
        {lastAttempt && (
          <div className={cn(
            'p-2 rounded-lg border text-xs',
            lastAttempt.action === 'live_trade_executed'
              ? 'bg-primary/5 border-primary/20'
              : 'bg-destructive/5 border-destructive/20'
          )}>
            <div className="flex items-center gap-2">
              <Activity className="h-3 w-3" />
              <span className="font-medium">
                {lastAttempt.action === 'live_trade_executed' ? '✓ Executed' : '✗ Blocked'}
              </span>
              <span className="text-muted-foreground ml-auto">
                {new Date(lastAttempt.triggered_at).toLocaleTimeString()}
              </span>
            </div>
            {lastAttempt.action !== 'live_trade_executed' && (
              <p className="text-muted-foreground mt-1 truncate">
                {(lastAttempt.metadata as Record<string, unknown>)?.block_reason as string || 'Unknown reason'}
              </p>
            )}
          </div>
        )}

        {/* ARM / Disarm */}
        {!isPaper && (
          <div className="flex gap-2">
            {status.isArmed ? (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => disarm()}
                disabled={isDisarming}
              >
                {isDisarming ? (
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                ) : (
                  <Power className="h-3 w-3 mr-2" />
                )}
                Disarm
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={() => arm()}
                disabled={isArming || !status.coinbaseConnected}
              >
                {isArming ? (
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                ) : (
                  <Shield className="h-3 w-3 mr-2" />
                )}
                ARM Live (60s)
              </Button>
            )}
          </div>
        )}

        {/* Collapsible Safety Checks */}
        <Collapsible open={safetyOpen} onOpenChange={setSafetyOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between px-2">
              <span className="flex items-center gap-2 text-xs">
                <Shield className="h-3 w-3" />
                Live Safety ({passedCount}/{safetyChecks.length} checks)
              </span>
              {safetyOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-2">
            {safetyChecks.map((check, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg border text-xs',
                  check.passed
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-muted/30 border-border'
                )}
              >
                <check.icon className={cn(
                  'h-3 w-3',
                  check.passed ? 'text-primary' : 'text-muted-foreground'
                )} />
                <span className={check.passed ? 'text-foreground' : 'text-muted-foreground'}>
                  {check.label}
                </span>
                <span className="text-muted-foreground ml-auto">{check.detail}</span>
                {check.passed ? (
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                ) : (
                  <XCircle className="h-3 w-3 text-muted-foreground/50" />
                )}
              </div>
            ))}

            {/* Blockers warning */}
            {status.blockers.length > 0 && (
              <div className="flex items-start gap-2 p-2 rounded-lg border border-amber-500/20 bg-amber-500/5">
                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-500">
                  {status.blockers.map((b, i) => (
                    <p key={i}>{b}</p>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
