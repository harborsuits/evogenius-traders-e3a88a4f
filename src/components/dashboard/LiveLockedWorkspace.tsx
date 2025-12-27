import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Timer,
  FlaskConical,
  Loader2,
  Zap,
  DollarSign,
  Lock,
  RefreshCw,
  OctagonX,
  TestTube2
} from 'lucide-react';
import { useTradeModeContext } from '@/contexts/TradeModeContext';
import { useLiveSafety } from '@/hooks/useLiveSafety';
import { useArmLive } from '@/hooks/useArmLive';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { LivePositionsCard } from './LivePositionsCard';

interface ChecklistItem {
  label: string;
  checked: boolean;
  detail?: string;
  icon: React.ReactNode;
}

export function LiveLockedWorkspace() {
  const { setMode } = useTradeModeContext();
  const { status: liveSafety, isLoading, refresh } = useLiveSafety();
  const { arm, disarm, isArming, isDisarming } = useArmLive();
  const { toast } = useToast();
  
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isTestingOrder, setIsTestingOrder] = useState(false);

  // Countdown timer effect
  useEffect(() => {
    if (!liveSafety.isArmed) {
      setSecondsRemaining(0);
      return;
    }

    const updateCountdown = () => {
      setSecondsRemaining(liveSafety.secondsRemaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [liveSafety.isArmed, liveSafety.secondsRemaining]);

  // Required permissions for trading
  const REQUIRED_PERMISSIONS = ['wallet:orders:create', 'wallet:accounts:read'];
  const missingPermissions = REQUIRED_PERMISSIONS.filter(p => !liveSafety.permissions.includes(p));

  // Build checklist from live safety status
  const checklist: ChecklistItem[] = [
    {
      label: 'Coinbase Connected',
      checked: liveSafety.coinbaseConnected,
      detail: liveSafety.coinbaseConnected ? 'API keys configured' : 'Connect in settings',
      icon: <Zap className="h-4 w-4" />,
    },
    {
      label: 'Trade Permission',
      checked: liveSafety.canTrade,
      detail: liveSafety.canTrade 
        ? 'All required permissions ✓' 
        : `Missing: ${missingPermissions.join(', ') || 'Unknown'}`,
      icon: <Shield className="h-4 w-4" />,
    },
    {
      label: 'Live Cap Set',
      checked: liveSafety.liveCap > 0,
      detail: `$${liveSafety.liveCap.toFixed(2)} max per trade`,
      icon: <DollarSign className="h-4 w-4" />,
    },
    {
      label: 'Cash Available',
      checked: liveSafety.maxAllowed > 0,
      detail: liveSafety.usdAvailable > 0 
        ? `$${liveSafety.usdAvailable.toFixed(2)} available` 
        : 'No USD in Coinbase',
      icon: <DollarSign className="h-4 w-4" />,
    },
    {
      label: 'ARM Enabled (60s window)',
      checked: liveSafety.isArmed,
      detail: liveSafety.isArmed ? `${secondsRemaining}s remaining` : 'Click ARM to unlock',
      icon: <Timer className="h-4 w-4" />,
    },
  ];

  const preArmReady = checklist.slice(0, 4).every((item) => item.checked);
  const passedCount = checklist.filter(c => c.checked).length;

  // Emergency kill handler
  const handleKill = () => {
    disarm();
  };

  // Test order handler - SELL 1 DOGE-USD as canary
  const handleTestOrder = async () => {
    if (!liveSafety.isArmed) {
      toast({
        title: 'Not Armed',
        description: 'ARM live mode first to execute test order.',
        variant: 'destructive',
      });
      return;
    }

    setIsTestingOrder(true);
    try {
      const { data, error } = await supabase.functions.invoke('live-execute', {
        body: {
          symbol: 'DOGE-USD',
          side: 'SELL',
          qty: 1,
          reason: 'CANARY_TEST: Manual test from Live Desk',
        },
      });

      if (error) throw error;

      toast({
        title: 'Test Order Submitted',
        description: `Order ID: ${data?.order_id || 'N/A'} — Status: ${data?.status || 'unknown'}`,
      });

      console.log('[LiveDesk] Test order result:', data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: 'Test Order Failed',
        description: message,
        variant: 'destructive',
      });
      console.error('[LiveDesk] Test order error:', err);
    } finally {
      setIsTestingOrder(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Live Mode Header */}
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-destructive" />
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  LIVE DESK
                  {liveSafety.isArmed ? (
                    <Badge variant="destructive" className="animate-pulse">
                      ARMED — {secondsRemaining}s
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-destructive/50 text-destructive">
                      <Lock className="h-3 w-3 mr-1" />
                      LOCKED
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Real money execution — Coinbase only
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={isLoading}
              className="h-8 px-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className={`flex items-start gap-3 p-3 rounded-lg border ${
            liveSafety.isArmed 
              ? 'bg-destructive/20 border-destructive/40' 
              : 'bg-destructive/10 border-destructive/20'
          }`}>
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm text-destructive">
              {liveSafety.isArmed 
                ? `Live execution unlocked for ${secondsRemaining} seconds. Execute with caution.`
                : liveSafety.blockers.length > 0
                  ? `Blocked: ${liveSafety.blockers.join(', ')}`
                  : 'Live trading is locked. Complete all checks and ARM to unlock.'
              }
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Kill Switch - Always Visible */}
      {liveSafety.isArmed && (
        <Card className="border-destructive bg-destructive/20">
          <CardContent className="pt-4">
            <Button
              variant="destructive"
              className="w-full h-14 text-lg font-bold"
              onClick={handleKill}
              disabled={isDisarming}
            >
              {isDisarming ? (
                <Loader2 className="h-6 w-6 mr-2 animate-spin" />
              ) : (
                <OctagonX className="h-6 w-6 mr-2" />
              )}
              EMERGENCY KILL — DISARM NOW
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Data Source Contract */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Data Source</span>
            {liveSafety.isArmed ? (
              <Badge variant="glow" className="text-[10px] font-mono flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" />
                COINBASE
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px] font-mono">
                <Lock className="h-2.5 w-2.5 mr-1" />
                LOCKED
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {liveSafety.isArmed 
              ? 'All portfolio data comes from Coinbase API. No paper data shown.'
              : 'No data displayed until ARM is enabled. Paper data is never shown here.'
            }
          </p>
        </CardContent>
      </Card>

      {/* Safety Checklist */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-mono">Safety Checklist</CardTitle>
            <Badge variant="outline" className="text-[10px] font-mono">
              {passedCount}/{checklist.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {checklist.map((item, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                item.checked
                  ? 'bg-primary/5 border-primary/20'
                  : 'bg-muted/30 border-border'
              }`}
            >
              <div className={item.checked ? 'text-primary' : 'text-muted-foreground'}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${item.checked ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {item.label}
                </span>
                {item.detail && (
                  <p className="text-[10px] text-muted-foreground truncate">{item.detail}</p>
                )}
              </div>
              {item.checked ? (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground/50 shrink-0" />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-mono">Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* ARM Button */}
          <Button
            variant="destructive"
            className="w-full justify-center h-12 text-base"
            disabled={isArming || liveSafety.isArmed || !preArmReady}
            onClick={() => arm()}
          >
            {isArming ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Arming...
              </>
            ) : liveSafety.isArmed ? (
              <>
                <Timer className="h-5 w-5 mr-2" />
                Armed — {secondsRemaining}s remaining
              </>
            ) : (
              <>
                <Timer className="h-5 w-5 mr-2" />
                ARM Live (60s)
                {!preArmReady && (
                  <span className="ml-2 text-xs opacity-70">Complete checks first</span>
                )}
              </>
            )}
          </Button>

          {/* Test Order Button - Only when armed */}
          {liveSafety.isArmed && (
            <Button
              variant="outline"
              className="w-full justify-center h-10 border-primary/50 text-primary hover:bg-primary/10"
              disabled={isTestingOrder}
              onClick={handleTestOrder}
            >
              {isTestingOrder ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <TestTube2 className="h-4 w-4 mr-2" />
                  Test Order: SELL 1 DOGE-USD
                </>
              )}
            </Button>
          )}
          
          <div className="pt-2 border-t border-border">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setMode('paper')}
            >
              <FlaskConical className="h-4 w-4 mr-2" />
              Back to Paper Mode
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live Positions Card - Shows LOCKED or Coinbase data */}
      <LivePositionsCard isArmed={liveSafety.isArmed} />

      {/* Info Panel */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground space-y-2 font-mono">
            <p>
              <strong className="text-destructive">Live Desk</strong> shows ONLY Coinbase-sourced data.
            </p>
            <p>
              Paper data is <strong>never</strong> displayed here — not even as a fallback.
            </p>
            <p>
              Think of it as: <span className="text-primary">Paper = training camp</span>,{' '}
              <span className="text-destructive">Live = active duty</span>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
