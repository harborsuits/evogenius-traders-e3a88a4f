import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Shield,
  Lock,
  Radio,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  RotateCcw,
  Zap,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface LiveRiskGuardrailsTileProps {
  isArmed: boolean;
}

interface RiskState {
  dayPnlPct: number;
  drawdownPct: number;
  consecutiveLossDays: number;
  maxDayLossPct: number;
  maxDrawdownPct: number;
  maxConsecutiveLossDays: number;
  rollbackArmed: boolean;
  lastRollbackEvent: string | null;
  killSwitchActive: boolean;
}

export function LiveRiskGuardrailsTile({ isArmed }: LiveRiskGuardrailsTileProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch system config for risk limits
  const { data: configData } = useQuery({
    queryKey: ['live-risk-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('config')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.config as Record<string, unknown> | null;
    },
  });

  // Fetch system state
  const { data: systemState, refetch: refetchState } = useQuery({
    queryKey: ['live-risk-system-state'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_state')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: isArmed ? 5000 : 30000,
  });

  // Fetch recent control events for rollback/kill
  const { data: recentEvents, refetch: refetchEvents } = useQuery({
    queryKey: ['live-risk-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('control_events')
        .select('*')
        .in('action', ['brain_rollback', 'kill_switch', 'risk_breach'])
        .order('triggered_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    refetchInterval: isArmed ? 10000 : 60000,
  });

  // Fetch performance alerts for risk breaches
  const { data: riskAlerts } = useQuery({
    queryKey: ['live-risk-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_alerts')
        .select('*')
        .in('type', ['drawdown_breach', 'daily_loss_breach', 'streak_breach'])
        .eq('is_ack', false)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    refetchInterval: isArmed ? 10000 : 60000,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchState(), refetchEvents()]);
    setIsRefreshing(false);
  };

  // Calculate risk state
  const riskLimits = {
    maxDayLossPct: (configData?.max_daily_loss_pct as number) ?? 5,
    maxDrawdownPct: (configData?.max_drawdown_pct as number) ?? 10,
    maxConsecutiveLossDays: (configData?.max_consecutive_loss_days as number) ?? 3,
  };

  // Get today's PnL from system_state
  const todayPnl = systemState?.today_pnl ?? 0;
  const totalCapital = systemState?.total_capital ?? 10000;
  const dayPnlPct = totalCapital > 0 ? (todayPnl / totalCapital) * 100 : 0;

  // Check for kill switch
  const killEvent = recentEvents?.find(e => e.action === 'kill_switch');
  const killSwitchActive = systemState?.status === 'stopped' || !!killEvent;

  // Check for rollback events
  const lastRollback = recentEvents?.find(e => e.action === 'brain_rollback');
  const rollbackArmed = (configData?.auto_rollback_enabled as boolean) ?? true;

  // Calculate headroom
  const dayLossHeadroom = riskLimits.maxDayLossPct + dayPnlPct; // How much more we can lose
  const isNearDayLimit = dayLossHeadroom < 2;
  const isDayLimitBreached = dayPnlPct <= -riskLimits.maxDayLossPct;

  const activeRiskBreaches = riskAlerts?.length ?? 0;

  // LOCKED state
  if (!isArmed) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Live Risk Guardrails
            </div>
            <Badge variant="outline" className="text-[10px] border-muted-foreground/50">
              LOCKED
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Shield className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">
              ARM Live to view risk guardrails
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasBreaches = isDayLimitBreached || killSwitchActive || activeRiskBreaches > 0;

  return (
    <Card className={cn("bg-card", hasBreaches ? "border-destructive/50" : "border-chart-1/50")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className={cn("h-4 w-4", hasBreaches ? "text-destructive" : "text-chart-1")} />
            Live Risk Guardrails
          </div>
          <div className="flex items-center gap-2">
            {activeRiskBreaches > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {activeRiskBreaches} BREACH{activeRiskBreaches > 1 ? 'ES' : ''}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-6 px-2"
            >
              <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Risk Metrics */}
        <div className="grid grid-cols-2 gap-2">
          {/* Day PnL */}
          <div className={cn(
            "p-2 rounded border",
            isDayLimitBreached 
              ? "bg-destructive/10 border-destructive/30" 
              : isNearDayLimit 
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-chart-1/5 border-chart-1/10"
          )}>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              Day PnL
            </div>
            <div className={cn(
              "text-sm font-mono font-semibold",
              dayPnlPct >= 0 ? "text-chart-1" : "text-destructive"
            )}>
              {dayPnlPct >= 0 ? '+' : ''}{dayPnlPct.toFixed(2)}%
            </div>
            <div className="text-[9px] text-muted-foreground">
              Limit: -{riskLimits.maxDayLossPct}%
            </div>
          </div>

          {/* Drawdown */}
          <div className="p-2 rounded bg-muted/30 border border-border">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              Max Drawdown
            </div>
            <div className="text-sm font-mono font-semibold text-foreground">
              {riskLimits.maxDrawdownPct.toFixed(1)}%
            </div>
            <div className="text-[9px] text-muted-foreground">
              (cap configured)
            </div>
          </div>
        </div>

        {/* Safety Status */}
        <div className="space-y-1.5">
          {/* Kill Switch */}
          <div className={cn(
            "flex items-center justify-between py-1.5 px-2 rounded border",
            killSwitchActive 
              ? "bg-destructive/10 border-destructive/30" 
              : "bg-chart-1/5 border-chart-1/10"
          )}>
            <div className="flex items-center gap-2">
              <Zap className={cn("h-3 w-3", killSwitchActive ? "text-destructive" : "text-chart-1")} />
              <span className="text-xs">Kill Switch</span>
            </div>
            <Badge className={cn(
              "text-[9px]",
              killSwitchActive 
                ? "bg-destructive/20 text-destructive border-destructive/30"
                : "bg-chart-1/20 text-chart-1 border-chart-1/30"
            )}>
              {killSwitchActive ? 'ACTIVE' : 'READY'}
            </Badge>
          </div>

          {/* Rollback */}
          <div className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs">Auto-Rollback</span>
            </div>
            <Badge className={cn(
              "text-[9px]",
              rollbackArmed 
                ? "bg-chart-1/20 text-chart-1 border-chart-1/30"
                : "bg-muted text-muted-foreground border-border"
            )}>
              {rollbackArmed ? 'ARMED' : 'DISABLED'}
            </Badge>
          </div>
        </div>

        {/* Last Rollback Event */}
        {lastRollback && (
          <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-2 text-amber-500">
              <RotateCcw className="h-3 w-3" />
              <span className="text-[10px] font-medium">Last Rollback</span>
            </div>
            <div className="text-[9px] text-muted-foreground mt-1">
              {formatDistanceToNow(new Date(lastRollback.triggered_at), { addSuffix: true })}
            </div>
          </div>
        )}

        {/* Active Breaches */}
        {riskAlerts && riskAlerts.length > 0 && (
          <div className="p-2 rounded bg-destructive/10 border border-destructive/30 space-y-1">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-3 w-3" />
              <span className="text-[10px] font-medium">Active Risk Breaches</span>
            </div>
            {riskAlerts.slice(0, 2).map(alert => (
              <div key={alert.id} className="text-[9px] text-muted-foreground">
                • {alert.title}
              </div>
            ))}
          </div>
        )}

        {/* All Clear */}
        {!hasBreaches && (
          <div className="p-2 rounded bg-chart-1/10 border border-chart-1/30 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-chart-1" />
            <span className="text-xs text-chart-1">All guardrails OK</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}