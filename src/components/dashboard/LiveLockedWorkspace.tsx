import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Users, 
  Key, 
  Timer,
  FlaskConical,
  Loader2
} from 'lucide-react';
import { useTradeModeContext } from '@/contexts/TradeModeContext';
import { useSystemState } from '@/hooks/useEvoTraderData';
import { useArmLive, isArmedNow, getArmedSecondsRemaining } from '@/hooks/useArmLive';

interface ChecklistItem {
  label: string;
  checked: boolean;
  icon: React.ReactNode;
}

export function LiveLockedWorkspace() {
  const { setMode, isLiveArmed } = useTradeModeContext();
  const { data: systemState } = useSystemState();
  const { arm, isArming } = useArmLive();
  
  // Get armed status from system state
  const armedUntil = (systemState as any)?.live_armed_until ?? null;
  const isArmed = isArmedNow(armedUntil);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // Countdown timer effect
  useEffect(() => {
    if (!armedUntil) {
      setSecondsRemaining(0);
      return;
    }

    const updateCountdown = () => {
      setSecondsRemaining(getArmedSecondsRemaining(armedUntil));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [armedUntil]);

  // TODO: These will be real checks once implemented
  const checklist: ChecklistItem[] = [
    {
      label: 'Deployed cohort selected',
      checked: false, // Will check agents with status='DEPLOYED'
      icon: <Users className="h-4 w-4" />,
    },
    {
      label: 'Live API keys connected',
      checked: false, // Will check exchange_connections
      icon: <Key className="h-4 w-4" />,
    },
    {
      label: 'ARM enabled (60s window)',
      checked: isArmed,
      icon: <Timer className="h-4 w-4" />,
    },
  ];

  const preArmChecks = checklist.slice(0, 2).every((item) => item.checked);

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
                  LIVE MODE
                  {isArmed ? (
                    <Badge variant="destructive" className="animate-pulse">
                      ARMED — {secondsRemaining}s
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="opacity-70">
                      LOCKED
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Front lines workspace — real money execution
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className={`flex items-start gap-3 p-3 rounded-lg border ${
            isArmed 
              ? 'bg-destructive/20 border-destructive/40' 
              : 'bg-destructive/10 border-destructive/20'
          }`}>
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">
              {isArmed 
                ? `Live execution unlocked for ${secondsRemaining} seconds. Execute with caution.`
                : 'Live trading is locked until all safety checks pass and ARM is enabled.'
              }
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Deployment Checklist */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-mono">Deployment Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {checklist.map((item, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                item.checked
                  ? 'bg-primary/5 border-primary/20'
                  : 'bg-muted/30 border-border'
              }`}
            >
              <div className={item.checked ? 'text-primary' : 'text-muted-foreground'}>
                {item.icon}
              </div>
              <span className={`text-sm flex-1 ${item.checked ? 'text-foreground' : 'text-muted-foreground'}`}>
                {item.label}
              </span>
              {item.checked ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground/50" />
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
          <Button variant="outline" className="w-full justify-start" disabled>
            <Users className="h-4 w-4 mr-2" />
            View Deployed Cohort
            <Badge variant="secondary" className="ml-auto">Coming Soon</Badge>
          </Button>
          
          <Button variant="outline" className="w-full justify-start" disabled>
            <Shield className="h-4 w-4 mr-2" />
            Deploy Winners from Paper
            <Badge variant="secondary" className="ml-auto">Coming Soon</Badge>
          </Button>
          
          <Button
            variant="destructive"
            className="w-full justify-start"
            disabled={isArming || isArmed}
            onClick={() => arm()}
          >
            {isArming ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Timer className="h-4 w-4 mr-2" />
            )}
            {isArmed ? `Armed — ${secondsRemaining}s remaining` : 'ARM Live (60s)'}
            {!isArmed && !isArming && (
              <span className="ml-auto text-xs opacity-70">⚠️ Danger</span>
            )}
          </Button>
          
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

      {/* Info Panel */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground space-y-2 font-mono">
            <p>
              <strong>Live workspace</strong> shows only DEPLOYED agents (5-20 elite winners).
            </p>
            <p>
              Paper workspace is your training ground with 100 agents running the evolution loop.
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
