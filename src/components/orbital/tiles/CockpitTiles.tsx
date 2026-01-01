import React from 'react';
// Cockpit Tiles - Small instrument cards that don't need drilldown
import { TradeCycleStatus } from '@/components/dashboard/TradeCycleStatus';
import { GenerationHealth } from '@/components/dashboard/GenerationHealth';
import { PollingHealth } from '@/components/dashboard/PollingHealth';
import { ControlPanel } from '@/components/dashboard/ControlPanel';
import { NewsPanel } from '@/components/dashboard/NewsPanel';
import { RolloverChecklist } from '@/components/dashboard/RolloverChecklist';
import { GenerationComparison } from '@/components/dashboard/GenerationComparison';
import { LineageWidget } from '@/components/dashboard/LineageWidget';
import { EliteRotationCard } from '@/components/dashboard/EliteRotationCard';
import { PassingTradesFeed } from '@/components/dashboard/PassingTradesFeed';
import { useSystemState, useMarketData } from '@/hooks/useEvoTraderData';
import { usePaperAccount, usePaperPositions, usePaperRealtimeSubscriptions } from '@/hooks/usePaperTrading';
import { useDroughtState } from '@/hooks/useDroughtState';
import { useShadowTradingStats } from '@/hooks/useShadowTradingStats';
import { useCockpitLiveState } from '@/hooks/useCockpitLiveState';
import { useLiveSafety } from '@/hooks/useLiveSafety';
import { SnapshotTileHeader } from '@/components/dashboard/StalenessIndicator';
import { ModeBadge, GenerationBadge, CardHeaderBadges, PipelineBadge, RiskBadge } from '@/components/dashboard/SnapshotBadges';
import { useSystemSnapshot } from '@/contexts/SystemSnapshotContext';
import { SystemStatus } from '@/types/evotrader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Wallet, 
  DollarSign, 
  Shield, 
  Users, 
  Activity, 
  TrendingUp,
  TrendingDown,
  Gauge,
  FlaskConical,
  BarChart3,
  Layers,
  PieChart,
  Eye,
  Flame,
  Globe,
  Unlock,
  Wrench,
  AlertTriangle,
  Megaphone,
  Scale,
  Handshake,
  Skull,
  AlertCircle,
  LogOut,
  CheckCircle,
  XCircle,
  HelpCircle,
  Droplets,
  Ghost,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Zap
} from 'lucide-react';
import { useGenOrdersCount, useCohortCount } from '@/hooks/useGenOrders';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNewsFeed } from '@/hooks/useNewsFeed';
import { useMissedMoves } from '@/hooks/useMissedMoves';
import { useExitEfficiency } from '@/hooks/useExitEfficiency';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Drought Monitor Tile - Shows signal drought state and gate failures with override controls
export function DroughtMonitorTile({ compact }: { compact?: boolean }) {
  const { data: droughtState, isLoading, refetch } = useDroughtState();
  const [isUpdating, setIsUpdating] = React.useState(false);
  
  const getStatusColor = () => {
    if (!droughtState) return 'text-muted-foreground';
    if (droughtState.killed) return 'text-destructive';
    if (droughtState.blocked) return 'text-amber-500';
    if (droughtState.isActive) return 'text-primary';
    return 'text-emerald-500';
  };
  
  const getStatusLabel = () => {
    if (!droughtState) return 'LOADING';
    if (droughtState.killed) return `KILLED: ${droughtState.killReason}`;
    if (droughtState.blocked) return `BLOCKED: ${droughtState.blockReason}`;
    if (droughtState.isActive) return 'DROUGHT ACTIVE';
    return 'NORMAL';
  };
  
  const handleOverrideChange = async (newOverride: 'auto' | 'force_off' | 'force_on') => {
    setIsUpdating(true);
    try {
      // Get current config
      const { data: configData } = await supabase
        .from('system_config')
        .select('id, config')
        .limit(1)
        .single();
      
      if (configData) {
        const currentConfig = (configData.config ?? {}) as Record<string, unknown>;
        await supabase
          .from('system_config')
          .update({ 
            config: { ...currentConfig, drought_override: newOverride },
            updated_at: new Date().toISOString(),
          })
          .eq('id', configData.id);
      }
      refetch();
    } finally {
      setIsUpdating(false);
    }
  };
  
  const { refetchAll } = useSystemSnapshot();
  
  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<Droplets className="h-4 w-4 text-primary" />}
        title="Signal Drought"
        badges={<CardHeaderBadges compact showMode showGeneration />}
        onRefresh={() => { refetch(); refetchAll(); }}
      />
      
      {isLoading || !droughtState ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      ) : (
        <>
          {/* Status + Override */}
          <div className="flex items-center justify-between">
            <div className={`text-[10px] font-mono ${getStatusColor()} flex items-center gap-1`}>
              <span className={cn("w-1.5 h-1.5 rounded-full bg-current", droughtState.isActive && !droughtState.blocked && "animate-pulse")} />
              {getStatusLabel()}
            </div>
            
            {/* Override toggle */}
            <div className="flex gap-1">
              {(['auto', 'force_off', 'force_on'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => handleOverrideChange(mode)}
                  disabled={isUpdating}
                  className={cn(
                    "text-[8px] px-1.5 py-0.5 rounded font-mono transition-colors",
                    droughtState.override === mode 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {mode === 'auto' ? 'AUTO' : mode === 'force_off' ? 'OFF' : 'ON'}
                </button>
              ))}
            </div>
          </div>
          
          {/* Cooldown warning */}
          {droughtState.cooldownUntil && (
            <div className="text-[10px] text-amber-500 font-mono">
              ⏱ Cooldown until {new Date(droughtState.cooldownUntil).toLocaleTimeString()}
            </div>
          )}
          
          {/* Equity metrics grid */}
          {(droughtState.equity !== undefined || droughtState.peakEquity !== undefined) && (
            <div className="grid grid-cols-2 gap-2 bg-muted/20 rounded-lg p-2">
              <div className="space-y-0.5">
                <div className="text-[9px] text-muted-foreground uppercase">Equity</div>
                <div className="font-mono text-sm text-foreground">
                  ${droughtState.equity?.toFixed(2) ?? '—'}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[9px] text-muted-foreground uppercase">Peak</div>
                <div className="font-mono text-sm text-emerald-500">
                  ${droughtState.peakEquity?.toFixed(2) ?? '—'}
                </div>
              </div>
            </div>
          )}
          
          {/* Peak drawdown (kill metric) */}
          {droughtState.peakEquityDrawdownPct !== undefined && (
            <div className={cn(
              "text-[10px] font-mono flex items-center gap-1",
              droughtState.peakEquityDrawdownPct > 1.5 ? 'text-destructive' : 
              droughtState.peakEquityDrawdownPct > 1 ? 'text-amber-500' : 
              droughtState.peakEquityDrawdownPct > 0 ? 'text-muted-foreground' : 'text-emerald-500'
            )}>
              <span className="text-muted-foreground">Peak DD:</span>
              <span className="font-bold">{droughtState.peakEquityDrawdownPct.toFixed(2)}%</span>
              {droughtState.peakEquityDrawdownPct > 1.5 && <Skull className="h-3 w-3" />}
              {droughtState.peakEquityDrawdownPct > 1.5 && <span className="text-[9px]">KILL ZONE</span>}
            </div>
          )}
          
          {/* Start-based drawdown (reference) */}
          {droughtState.equityDrawdownPct !== undefined && (
            <div className="text-[9px] text-muted-foreground font-mono">
              Start DD: {droughtState.equityDrawdownPct.toFixed(2)}%
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="text-[10px] text-muted-foreground">6h Window</div>
              <div className="font-mono text-sm">
                <span className="text-muted-foreground">{droughtState.shortWindowHolds}</span>
                <span className="text-[10px] text-muted-foreground mx-1">holds</span>
                <span className="text-primary">{droughtState.shortWindowOrders}</span>
                <span className="text-[10px] text-muted-foreground ml-1">orders</span>
              </div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="text-[10px] text-muted-foreground">48h Window</div>
              <div className="font-mono text-sm">
                <span className="text-muted-foreground">{droughtState.longWindowHolds}</span>
                <span className="text-[10px] text-muted-foreground mx-1">holds</span>
                <span className="text-primary">{droughtState.longWindowOrders}</span>
                <span className="text-[10px] text-muted-foreground ml-1">orders</span>
              </div>
            </div>
          </div>
          
          {droughtState.nearestPass && (
            <div className="text-[10px] text-muted-foreground">
              <span className="text-amber-500">Nearest pass:</span>{' '}
              <span className="font-mono">{droughtState.nearestPass.gate}</span>
              <span className="ml-1">({droughtState.nearestPass.margin.toFixed(4)} from threshold)</span>
            </div>
          )}
          
          {Object.keys(droughtState.gateFailures).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(droughtState.gateFailures).slice(0, 3).map(([gate, stats]) => (
                <Badge key={gate} variant="secondary" className="text-[9px] px-1 py-0">
                  {gate}: {stats.count}×
                </Badge>
              ))}
            </div>
          )}
          
          {/* Adaptive Tuning Status */}
          {droughtState.adaptiveTuning && (
            <div className="mt-2 pt-2 border-t border-border/30 space-y-1">
              {/* Tuning state badge */}
              {(() => {
                const t = droughtState.adaptiveTuning;
                const cooldownMins = t.cooldownRemainingSec ? Math.ceil(t.cooldownRemainingSec / 60) : 0;
                const frozenUntil = t.frozenUntil ? new Date(t.frozenUntil) : null;
                const isFrozen = frozenUntil && frozenUntil > new Date();
                const frozenMins = isFrozen ? Math.ceil((frozenUntil.getTime() - Date.now()) / 60000) : 0;
                
                let status: 'active' | 'armed' | 'cooldown' | 'frozen' | 'off';
                let statusColor: string;
                let statusLabel: string;
                
                if (!t.enabled) {
                  status = 'off';
                  statusColor = 'text-muted-foreground';
                  statusLabel = 'OFF';
                } else if (isFrozen) {
                  status = 'frozen';
                  statusColor = 'text-destructive';
                  statusLabel = `FROZEN ${frozenMins}m`;
                } else if (cooldownMins > 0) {
                  status = 'cooldown';
                  statusColor = 'text-amber-500';
                  statusLabel = `COOLDOWN ${cooldownMins}m`;
                } else if (t.applied) {
                  status = 'active';
                  statusColor = 'text-emerald-500';
                  statusLabel = 'ACTIVE';
                } else {
                  status = 'armed';
                  statusColor = 'text-amber-500';
                  statusLabel = 'ARMED';
                }
                
                return (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Tuning:</span>
                    <div className="flex items-center gap-1">
                      {status === 'frozen' && t.frozenReason && (
                        <span className="text-[8px] text-destructive/70">{t.frozenReason}</span>
                      )}
                      <span className={cn('font-mono font-medium', statusColor)}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                );
              })()}
              
              {(() => {
                const topOffsets = Object.entries(droughtState.adaptiveTuning.offsets ?? {})
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .slice(0, 3);
                return topOffsets.length > 0 ? (
                  <div className="text-[9px] font-mono text-muted-foreground">
                    Offsets: {topOffsets.map(([k, v]) => `${k}:${(v as number).toFixed(3)}`).join(' ')}
                  </div>
                ) : (
                  <div className="text-[9px] font-mono text-muted-foreground">Offsets: —</div>
                );
              })()}
              
              {droughtState.adaptiveTuning.lastAdjustedAt && (
                <div className="text-[9px] text-muted-foreground">
                  Last: {new Date(droughtState.adaptiveTuning.lastAdjustedAt).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Elite Rotation Tile
export function EliteRotationTile({ compact }: { compact?: boolean }) {
  return <EliteRotationCard />;
}

// Trade Cycle Status Tile
export function TradeCycleTile({ compact }: { compact?: boolean }) {
  return <TradeCycleStatus />;
}

// Generation Health Tile
export function GenHealthTile({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  return <GenerationHealth generationId={systemState?.current_generation_id ?? null} />;
}

// Polling Health Tile
export function PollingHealthTile({ compact }: { compact?: boolean }) {
  return <PollingHealth />;
}

// System Control Tile
export function SystemControlTile({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  const status = (systemState?.status ?? 'stopped') as SystemStatus;
  
  return (
    <ControlPanel 
      status={status}
      generationId={systemState?.current_generation_id}
    />
  );
}

// Capital Overview Tile - Now uses unified cockpit state with staleness + Live Safety
export function CapitalOverviewTile({ compact }: { compact?: boolean }) {
  const { account, staleness, refetchAll, system } = useCockpitLiveState();
  const { data: systemState } = useSystemState();
  const { data: genOrdersCount = 0 } = useGenOrdersCount(systemState?.current_generation_id ?? null);
  const { data: cohortCount = 0 } = useCohortCount(systemState?.current_generation_id ?? null);
  const { status: liveSafety, refresh: refreshLiveSafety } = useLiveSafety();
  
  const [testingPermission, setTestingPermission] = React.useState(false);
  const [permissionResult, setPermissionResult] = React.useState<{
    success: boolean;
    can_create_orders?: boolean;
    permissions?: string[];
    error?: string;
  } | null>(null);
  const [showLiveSafety, setShowLiveSafety] = React.useState(false);
  
  // Mode detection from system state
  const tradeMode = system?.tradeMode ?? liveSafety.tradeMode;
  const isLive = tradeMode === 'live';
  const isLiveArmed = isLive && system?.liveArmedUntil && 
    new Date(system.liveArmedUntil) > new Date();
  
  // In live mode without ARM: show LOCKED state
  const isLocked = isLive && !isLiveArmed;
  
  const isLoading = !system;
  const isStale = staleness.account.stale;
  
  const cash = account?.cash ?? 0;
  const totalEquity = account?.equity ?? 0;
  const totalPnl = account?.pnl ?? 0;
  const pnlPct = account?.pnlPct ?? 0;
  const activePositions = account?.positions ?? [];
  
  // Live safety checks from hook
  const coinbaseConnected = liveSafety.coinbaseConnected;
  const canCreateOrders = liveSafety.canTrade || permissionResult?.can_create_orders === true;
  const liveCap = liveSafety.liveCap;
  const maxAllowed = liveSafety.maxAllowed;
  
  // Safety check counts
  const checks = [
    { label: 'Coinbase Connected', pass: coinbaseConnected },
    { label: 'Trade Permission', pass: canCreateOrders },
    { label: 'Live Cap Set', pass: liveCap > 0 },
    { label: 'Cash Available', pass: maxAllowed > 0 },
  ];
  const passedChecks = checks.filter(c => c.pass).length;
  
  const handleTestPermission = async () => {
    setTestingPermission(true);
    setPermissionResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('coinbase-test');
      if (error) throw error;
      setPermissionResult(data);
    } catch (err: any) {
      setPermissionResult({ success: false, error: err.message });
    } finally {
      setTestingPermission(false);
    }
  };
  
  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<FlaskConical className="h-4 w-4 text-primary" />}
        title={isLive ? "Live Capital" : "Paper Portfolio"}
        badges={
          <div className="flex items-center gap-1">
            <ModeBadge compact />
            <GenerationBadge compact />
          </div>
        }
        onRefresh={refetchAll}
      />
      
      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-muted/30 rounded" />
          <div className="h-8 bg-muted/30 rounded" />
        </div>
      ) : isLocked ? (
        // LOCKED STATE: Live mode but not armed - NEVER show paper data
        <div className="space-y-3">
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Shield className="h-8 w-8 text-amber-500 mb-2" />
            <div className="text-sm font-mono font-bold text-amber-500">LOCKED</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              ARM required to view Coinbase balances
            </div>
            <div className="text-[9px] text-muted-foreground mt-1">
              Paper data is never shown in live mode
            </div>
          </div>
          
          {/* Still show safety checks so user can ARM */}
          <div className="border-t border-border/50 pt-3">
            <button
              onClick={() => setShowLiveSafety(!showLiveSafety)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <Shield className={`h-4 w-4 ${passedChecks === checks.length ? 'text-success' : 'text-amber-500'}`} />
                <span className="text-xs font-medium">Live Safety</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  passedChecks === checks.length 
                    ? 'bg-success/20 text-success' 
                    : 'bg-amber-500/20 text-amber-500'
                }`}>
                  {passedChecks}/{checks.length} checks
                </span>
              </div>
              {showLiveSafety ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            
            {showLiveSafety && (
              <div className="mt-3 space-y-2">
                {checks.map((check, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {check.pass ? (
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span className={check.pass ? 'text-muted-foreground' : 'text-foreground'}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className={compact ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-3'}>
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Wallet className="h-3 w-3" />
                Equity
              </div>
              <div className="font-mono text-sm font-bold">
                ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                Cash
              </div>
              <div className="font-mono text-sm">
                ${cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                {totalPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                P&L
              </div>
              <div className={`font-mono text-sm font-bold ${totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                <span className="text-[10px] ml-1">({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
              </div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <BarChart3 className="h-3 w-3" />
                Positions
              </div>
              <div className="font-mono text-sm">{activePositions.length}</div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Users className="h-3 w-3" />
                Cohort
              </div>
              <div className="font-mono text-sm">{cohortCount}</div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Activity className="h-3 w-3" />
                Gen Orders
              </div>
              <div className="font-mono text-sm">{genOrdersCount}</div>
            </div>
          </div>
          
          {/* Live Safety Section */}
          <div className="border-t border-border/50 pt-3 mt-3">
            <button
              onClick={() => setShowLiveSafety(!showLiveSafety)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <Shield className={`h-4 w-4 ${passedChecks === checks.length ? 'text-success' : 'text-amber-500'}`} />
                <span className="text-xs font-medium">Live Safety</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  passedChecks === checks.length 
                    ? 'bg-success/20 text-success' 
                    : 'bg-amber-500/20 text-amber-500'
                }`}>
                  {passedChecks}/{checks.length} checks
                </span>
              </div>
              {showLiveSafety ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            
            {showLiveSafety && (
              <div className="mt-3 space-y-2">
                {checks.map((check, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {check.pass ? (
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span className={check.pass ? 'text-muted-foreground' : 'text-foreground'}>
                      {check.label}
                    </span>
                  </div>
                ))}
                
                {/* Live Cap & Max Allowed */}
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                  <div className="bg-muted/30 rounded p-2">
                    <div className="text-muted-foreground text-[10px]">Live Cap</div>
                    <div className="font-mono">${liveCap.toFixed(2)}</div>
                  </div>
                  <div className="bg-muted/30 rounded p-2">
                    <div className="text-muted-foreground text-[10px]">Max Allowed</div>
                    <div className="font-mono">${maxAllowed.toFixed(2)}</div>
                  </div>
                </div>
                
                {/* Test Permission Button */}
                <button
                  onClick={handleTestPermission}
                  disabled={testingPermission}
                  className="w-full mt-2 px-3 py-2 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {testingPermission ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-3 w-3" />
                      Test Live Permission
                    </>
                  )}
                </button>
                
                {/* Permission Result */}
                {permissionResult && (
                  <div className={`mt-2 p-2 rounded text-xs ${
                    permissionResult.can_create_orders 
                      ? 'bg-success/20 text-success' 
                      : 'bg-destructive/20 text-destructive'
                  }`}>
                    {permissionResult.can_create_orders ? (
                      <div className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        <span>Trade permission verified</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        <span>{permissionResult.error || 'Cannot create orders'}</span>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Missing permission warning */}
                {!canCreateOrders && !permissionResult && (
                  <div className="mt-2 p-2 rounded bg-amber-500/20 text-amber-500 text-xs flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span>API key may lack trade permission. Click "Test Live Permission" to verify.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// News Feed Tile
export function NewsTile({ compact }: { compact?: boolean }) {
  return <NewsPanel />;
}

// Rollover Checklist Tile
export function RolloverTile({ compact }: { compact?: boolean }) {
  return <RolloverChecklist />;
}

// Generation Comparison Tile
export function GenComparisonTile({ compact }: { compact?: boolean }) {
  return <GenerationComparison />;
}

// Lineage Widget Tile
export function LineageTile({ compact }: { compact?: boolean }) {
  return <LineageWidget />;
}

// Decision Log Tile - Now uses unified cockpit state with staleness
export function DecisionLogTile({ compact }: { compact?: boolean }) {
  const { decisions, staleness, refetchAll } = useCockpitLiveState();
  
  const isLoading = !decisions;
  const isStale = staleness.decisions.stale;
  
  const decisionStats = decisions ? {
    buy: decisions.buyCount,
    sell: decisions.sellCount,
    hold: decisions.holdCount,
    blocked: decisions.blockedCount,
    topReasons: decisions.topHoldReasons,
    total: decisions.buyCount + decisions.sellCount + decisions.holdCount + decisions.blockedCount,
  } : null;
  
  // Interpretive signals
  const getSignalQuality = () => {
    if (!decisionStats || decisionStats.total === 0) return null;
    const actionRate = ((decisionStats.buy + decisionStats.sell) / decisionStats.total) * 100;
    
    if (actionRate >= 10) return { label: 'HIGH CONVICTION', color: 'text-success', desc: 'System finding opportunities' };
    if (actionRate >= 3) return { label: 'SELECTIVE', color: 'text-primary', desc: 'Disciplined signal filtering' };
    if (actionRate >= 1) return { label: 'CAUTIOUS', color: 'text-amber-500', desc: 'Few setups passing thresholds' };
    return { label: 'SIGNAL DROUGHT', color: 'text-muted-foreground', desc: 'Market conditions not aligning' };
  };
  
  const signalQuality = getSignalQuality();
  
  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<Activity className="h-4 w-4 text-primary" />}
        title="Recent Decisions"
        badges={<CardHeaderBadges compact showMode showGeneration showPipeline />}
        onRefresh={refetchAll}
      />
      
      {isLoading || !decisionStats ? (
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-muted/30 rounded" />
          <div className="h-16 bg-muted/30 rounded" />
        </div>
      ) : (
        <>
          {/* Interpretive signal */}
          {signalQuality && (
            <div className={`text-[10px] font-mono ${signalQuality.color}`}>
              <span className="font-bold">{signalQuality.label}</span>
              <span className="text-muted-foreground ml-1">— {signalQuality.desc}</span>
            </div>
          )}
          
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-success/10 border border-success/20 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-success">{decisionStats.buy}</div>
              <div className="text-[9px] text-muted-foreground">BUY</div>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-destructive">{decisionStats.sell}</div>
              <div className="text-[9px] text-muted-foreground">SELL</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-muted-foreground">{decisionStats.hold}</div>
              <div className="text-[9px] text-muted-foreground">HOLD</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-amber-500">{decisionStats.blocked}</div>
              <div className="text-[9px] text-muted-foreground">BLOCKED</div>
            </div>
          </div>
          
          {decisionStats.topReasons.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              <span className="text-primary">Why holding:</span>{' '}
              {decisionStats.topReasons.join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Agent Inactivity Tile - Shows active vs inactive breakdown with evolutionary context
export function AgentInactivityTile({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  const { data: cohortCount = 0 } = useCohortCount(systemState?.current_generation_id ?? null);
  
  const { data: activityData, isLoading } = useQuery({
    queryKey: ['agent-activity-summary', systemState?.current_generation_id],
    queryFn: async () => {
      if (!systemState?.current_generation_id) return null;
      
      // Get unique agents who have traded this generation (excluding test_mode)
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('agent_id, tags')
        .eq('generation_id', systemState.current_generation_id)
        .eq('status', 'filled')
        .not('agent_id', 'is', null);
      
      // Filter out test_mode orders
      const learnableOrders = (orders || []).filter(o => {
        const tags = o.tags as any;
        return !tags?.test_mode;
      });
      
      const uniqueAgents = new Set(learnableOrders.map(o => o.agent_id));
      
      // Get strategy breakdown AND elite status for trading agents
      if (uniqueAgents.size > 0) {
        const { data: agents } = await supabase
          .from('agents')
          .select('id, strategy_template, is_elite')
          .in('id', Array.from(uniqueAgents));
        
        const strategyBreakdown = (agents || []).reduce((acc, a) => {
          acc[a.strategy_template] = (acc[a.strategy_template] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        const elitesTrading = (agents || []).filter(a => a.is_elite).length;
        
        return {
          activeCount: uniqueAgents.size,
          strategyBreakdown,
          elitesTrading,
        };
      }
      
      return { activeCount: 0, strategyBreakdown: {}, elitesTrading: 0 };
    },
    enabled: !!systemState?.current_generation_id,
    refetchInterval: 60000,
  });
  
  // Get total elite count
  const { data: totalElites = 0 } = useQuery({
    queryKey: ['elite-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('is_elite', true);
      return count || 0;
    },
  });
  
  const activeCount = activityData?.activeCount || 0;
  const inactiveCount = cohortCount - activeCount;
  const activePct = cohortCount > 0 ? (activeCount / cohortCount) * 100 : 0;
  const strategyBreakdown = activityData?.strategyBreakdown || {};
  const elitesTrading = activityData?.elitesTrading || 0;
  
  // Interpretive signals
  const getActivitySignal = () => {
    if (activePct >= 30) return { status: 'healthy', label: 'STRONG PARTICIPATION', color: 'text-success' };
    if (activePct >= 15) return { status: 'ok', label: 'NORMAL SPREAD', color: 'text-primary' };
    if (activePct >= 5) return { status: 'low', label: 'EARLY STAGE', color: 'text-amber-500' };
    return { status: 'cold', label: 'WAITING FOR SIGNALS', color: 'text-muted-foreground' };
  };
  
  const getEliteSignal = () => {
    if (totalElites === 0) return null;
    const elitePct = (elitesTrading / totalElites) * 100;
    if (elitePct >= 50) return { label: 'ELITES ACTIVE', color: 'text-success', icon: '✓' };
    if (elitePct > 0) return { label: `${elitesTrading}/${totalElites} ELITES`, color: 'text-amber-500', icon: '◐' };
    return { label: 'ELITES DORMANT', color: 'text-muted-foreground', icon: '○' };
  };
  
  const activitySignal = getActivitySignal();
  const eliteSignal = getEliteSignal();
  
  const { refetchAll } = useSystemSnapshot();
  
  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<Users className="h-4 w-4 text-primary" />}
        title="Agent Activity"
        badges={<CardHeaderBadges compact showMode showGeneration />}
        onRefresh={refetchAll}
      />
      
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      ) : (
        <>
          {/* Status signal */}
          <div className={`text-[10px] font-mono ${activitySignal.color} flex items-center gap-1`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            {activitySignal.label}
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-success/10 border border-success/20 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Activity className="h-3 w-3" />
                Trading
              </div>
              <div className="font-mono text-lg font-bold text-success">{activeCount}</div>
              <div className="text-[9px] text-success/70">{activePct.toFixed(0)}% of cohort</div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Gauge className="h-3 w-3" />
                Holding
              </div>
              <div className="font-mono text-lg font-bold">{inactiveCount}</div>
              <div className="text-[9px] text-muted-foreground">{(100 - activePct).toFixed(0)}% waiting</div>
            </div>
          </div>
          
          {/* Elite activation signal */}
          {eliteSignal && (
            <div className={`text-[10px] font-mono ${eliteSignal.color} flex items-center gap-1 bg-muted/20 rounded px-2 py-1`}>
              <span>{eliteSignal.icon}</span>
              {eliteSignal.label}
              <span className="text-muted-foreground ml-1">— proven agents from prior gen</span>
            </div>
          )}
          
          {Object.keys(strategyBreakdown).length > 0 && (
            <div className="text-[10px] space-y-0.5">
              <div className="text-muted-foreground mb-1">By strategy:</div>
              {Object.entries(strategyBreakdown).map(([strat, count]) => (
                <div key={strat} className="flex justify-between">
                  <span className="text-muted-foreground">{strat.replace('_', ' ')}</span>
                  <span className="font-mono">{count}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// CATALYST WATCH TILE (formerly side Intake widget)
// ============================================

function formatTimeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: false })
      .replace('about ', '')
      .replace(' minutes', 'm')
      .replace(' minute', 'm')
      .replace(' hours', 'h')
      .replace(' hour', 'h')
      .replace(' days', 'd')
      .replace(' day', 'd')
      .replace('less than a', '<1');
  } catch {
    return '';
  }
}

function detectEventType(title: string): { icon: React.ReactNode; label: string; color: string } | null {
  const lower = title.toLowerCase();
  
  if (lower.includes('unlock') || lower.includes('vesting') || lower.includes('emission')) {
    return { icon: <Unlock className="h-3 w-3" />, label: 'unlock', color: 'text-amber-400' };
  }
  if (lower.includes('upgrade') || lower.includes('mainnet') || lower.includes('fork')) {
    return { icon: <Wrench className="h-3 w-3" />, label: 'upgrade', color: 'text-blue-400' };
  }
  if (lower.includes('outage') || lower.includes('bug') || lower.includes('exploit') || lower.includes('hack')) {
    return { icon: <AlertTriangle className="h-3 w-3" />, label: 'outage', color: 'text-red-400' };
  }
  if (lower.includes('listing') || lower.includes('delist') || lower.includes('binance') || lower.includes('coinbase adds')) {
    return { icon: <Megaphone className="h-3 w-3" />, label: 'listing', color: 'text-green-400' };
  }
  if (lower.includes('sec') || lower.includes('regulation') || lower.includes('lawsuit') || lower.includes('fine') || lower.includes('investigation')) {
    return { icon: <Scale className="h-3 w-3" />, label: 'legal', color: 'text-red-400' };
  }
  if (lower.includes('whale') || lower.includes('transfer') || lower.includes('moved') || lower.includes('wallet')) {
    return { icon: <Scale className="h-3 w-3" />, label: 'whale', color: 'text-purple-400' };
  }
  if (lower.includes('governance') || lower.includes('vote') || lower.includes('proposal') || lower.includes('dao')) {
    return { icon: <Scale className="h-3 w-3" />, label: 'gov', color: 'text-cyan-400' };
  }
  if (lower.includes('partner') || lower.includes('collab') || lower.includes('integration') || lower.includes('launch')) {
    return { icon: <Handshake className="h-3 w-3" />, label: 'partner', color: 'text-emerald-400' };
  }
  
  return null;
}

export function CatalystWatchTile({ compact }: { compact?: boolean }) {
  const { data: newsData, isLoading } = useNewsFeed();
  
  const newsIntensity = newsData?.news_intensity || {};
  const botSymbols = newsData?.bot_symbols || [];
  const catalystNews = (newsData?.bot_lane || []).slice(0, 6);
  const marketNews = (newsData?.market_lane || [])
    .filter((n: any) => !catalystNews.some((c: any) => c.id === n.id))
    .slice(0, 4);
  
  const hotSymbols = Object.entries(newsIntensity)
    .filter(([_, count]) => (count as number) >= 2)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 4);
  
  const { refetchAll } = useSystemSnapshot();
  
  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<Eye className="h-4 w-4 text-primary" />}
        title="Catalyst Watch"
        badges={
          <div className="flex items-center gap-1">
            <CardHeaderBadges compact showMode={false} showGeneration={false} />
            {hotSymbols.length > 0 && (
              <div className="flex items-center gap-1">
                <Flame className="h-3 w-3 text-orange-500" />
                {hotSymbols.slice(0, 2).map(([symbol]) => (
                  <Badge 
                    key={symbol}
                    variant="outline"
                    className="text-[8px] px-1 py-0 h-4 font-mono border-orange-500/30 text-orange-400"
                  >
                    {symbol.replace('-USD', '')}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        }
        onRefresh={refetchAll}
      />
      
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading catalysts...</div>
      ) : (
        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {/* Catalyst Watch (Strict) */}
            {catalystNews.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-primary/80 uppercase tracking-wide font-medium px-1 border-b border-border/30 pb-1">
                  <Eye className="h-3 w-3" />
                  <span>Monitored Symbols</span>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 ml-auto border-primary/30">
                    {catalystNews.length}
                  </Badge>
                </div>
                {catalystNews.map((n: any) => {
                  const eventType = detectEventType(n.title);
                  const symbols = n.symbols || [];
                  const timeAgo = formatTimeAgo(n.published_at);
                  
                  return (
                    <a
                      key={n.id}
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col gap-1 p-2 rounded-md bg-primary/5 hover:bg-primary/10 transition-colors group border border-primary/10 hover:border-primary/20"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {symbols.slice(0, 2).map((s: string) => (
                          <Badge 
                            key={s} 
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4 font-mono font-semibold"
                          >
                            {s.replace('-USD', '')}
                          </Badge>
                        ))}
                        {eventType && (
                          <span className={`flex items-center gap-0.5 text-[9px] ${eventType.color}`}>
                            {eventType.icon}
                            <span>{eventType.label}</span>
                          </span>
                        )}
                        <span className="text-[9px] text-muted-foreground/60 ml-auto">{timeAgo}</span>
                      </div>
                      <p className="text-[11px] leading-snug text-foreground/80 line-clamp-2 group-hover:text-primary transition-colors">
                        {n.title}
                      </p>
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-2 px-2 bg-muted/20 rounded-md">
                <div className="text-[10px] text-muted-foreground/60">No monitored-coin catalysts detected</div>
                {botSymbols.length > 0 && (
                  <div className="text-[9px] text-muted-foreground/40 mt-0.5">
                    Watching: {botSymbols.slice(0, 5).map((s: string) => s.replace('-USD', '')).join(', ')}
                    {botSymbols.length > 5 && ` +${botSymbols.length - 5}`}
                  </div>
                )}
              </div>
            )}
            
            {/* Market Context (Fallback) */}
            {marketNews.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 uppercase tracking-wide px-1 border-b border-border/20 pb-1">
                  <Globe className="h-3 w-3" />
                  <span>Market Context</span>
                </div>
                {marketNews.map((n: any) => {
                  const timeAgo = formatTimeAgo(n.published_at);
                  return (
                    <a
                      key={n.id}
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col gap-0.5 p-1.5 rounded bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-muted-foreground/40 ml-auto">{timeAgo}</span>
                      </div>
                      <p className="text-[10px] leading-snug text-foreground/60 line-clamp-1 hover:text-foreground/80">
                        {n.title}
                      </p>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ============================================
// AUTOPSY TILE (formerly side Autopsy widget)
// ============================================

function formatDecisionReason(reason: string | null): string {
  if (!reason) return '';
  if (reason.length > 40) return reason.slice(0, 37) + '...';
  return reason;
}

export function AutopsyTile({ compact }: { compact?: boolean }) {
  const { data: missedData, isLoading: missedLoading } = useMissedMoves();
  const { data: exitData, isLoading: exitLoading } = useExitEfficiency(24);
  
  const missedMoves = missedData?.missed_moves || [];
  const pumpThreshold = missedData?.thresholds?.pump || 5;
  const dumpThreshold = missedData?.thresholds?.dump || -5;
  
  const strictMisses = missedMoves.filter((m: any) => 
    Math.abs(m.change_24h) >= Math.max(Math.abs(pumpThreshold), Math.abs(dumpThreshold))
  );
  
  const exits = exitData?.exits || [];
  const avgMissedPct = exitData?.avg_missed_profit_pct || 0;
  const exitCount = exitData?.exit_count || 0;
  
  const goodExits = exits.filter((e: any) => e.was_profitable_exit);
  const missedProfitExits = exits.filter((e: any) => !e.was_profitable_exit && e.missed_profit_pct > 1);
  
  const isLoading = missedLoading || exitLoading;
  
  // Diagnostic signal
  const getDiagnosticSignal = () => {
    const hasExitIssues = missedProfitExits.length > 2 || avgMissedPct > 3;
    const hasMissedMoves = strictMisses.length > 2;
    
    if (hasExitIssues && hasMissedMoves) {
      return { label: 'NEEDS ATTENTION', color: 'text-destructive', desc: 'Exit timing and signal gaps detected' };
    }
    if (hasExitIssues) {
      return { label: 'EXIT REVIEW', color: 'text-amber-500', desc: 'Some early exits left profit on table' };
    }
    if (hasMissedMoves) {
      return { label: 'SIGNAL GAPS', color: 'text-amber-500', desc: 'Large moves without agent participation' };
    }
    if (exitCount > 0 && goodExits.length === exitCount) {
      return { label: 'CLEAN EXECUTION', color: 'text-success', desc: 'All exits well-timed' };
    }
    return { label: 'NOMINAL', color: 'text-muted-foreground', desc: 'No major issues detected' };
  };
  
  const signal = getDiagnosticSignal();
  const { refetchAll } = useSystemSnapshot();
  
  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<Skull className="h-4 w-4 text-amber-500" />}
        title="Performance Autopsy"
        badges={
          <div className="flex items-center gap-1">
            <CardHeaderBadges compact showMode showGeneration />
            {strictMisses.length > 0 && (
              <Badge variant="destructive" className="text-[8px] px-1 py-0 font-mono">
                {strictMisses.length} miss{strictMisses.length !== 1 ? 'es' : ''}
              </Badge>
            )}
          </div>
        }
        onRefresh={refetchAll}
      />
      
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading diagnostics...</div>
      ) : (
        <>
          {/* Diagnostic signal */}
          <div className={`text-[10px] font-mono ${signal.color}`}>
            <span className="font-bold">{signal.label}</span>
            <span className="text-muted-foreground ml-1">— {signal.desc}</span>
          </div>
          
          <ScrollArea className="h-[180px]">
            <div className="space-y-3">
              {/* Exit Efficiency Summary */}
              {exitCount > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-400/80 uppercase tracking-wide font-medium px-1 border-b border-amber-500/20 pb-1">
                    <LogOut className="h-3 w-3" />
                    <span>Exit Efficiency</span>
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 ml-auto border-amber-500/30 text-amber-400">
                      {exitCount} exits
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-muted-foreground">Avg:</span>
                      <span className={cn(
                        "text-[11px] font-mono font-medium",
                        avgMissedPct > 1 ? "text-red-400" : avgMissedPct < -1 ? "text-emerald-400" : "text-muted-foreground"
                      )}>
                        {avgMissedPct >= 0 ? '+' : ''}{avgMissedPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="h-3 w-3 text-emerald-400/60" />
                      <span className="text-[10px] text-emerald-400/80">{goodExits.length} good</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <XCircle className="h-3 w-3 text-red-400/60" />
                      <span className="text-[10px] text-red-400/80">{missedProfitExits.length} early</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Missed Moves */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-red-400/80 uppercase tracking-wide font-medium px-1 border-b border-red-500/20 pb-1">
                  <AlertCircle className="h-3 w-3" />
                  <span>Missed Moves (≥{pumpThreshold}%)</span>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 ml-auto border-red-500/30 text-red-400">
                    {strictMisses.length}
                  </Badge>
                </div>
                
                {strictMisses.length > 0 ? (
                  <div className="space-y-1">
                    {strictMisses.slice(0, 4).map((m: any) => {
                      const reason = formatDecisionReason(m.last_decision_reason);
                      return (
                        <div
                          key={m.symbol}
                          className="grid grid-cols-[1fr_50px_60px] gap-2 items-center px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20"
                        >
                          <div className="flex items-center gap-1.5">
                            {m.move_type === 'pump' ? (
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                            )}
                            <span className="text-[11px] font-semibold text-foreground font-mono">
                              {m.symbol.replace('-USD', '')}
                            </span>
                          </div>
                          <span className={`text-[11px] font-mono text-right font-medium ${
                            m.move_type === 'pump' ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {m.change_24h >= 0 ? '+' : ''}{m.change_24h.toFixed(1)}%
                          </span>
                          <Badge 
                            variant={m.last_decision === 'BUY' ? 'default' : m.last_decision === 'SELL' ? 'destructive' : 'secondary'}
                            className="text-[9px] px-1.5 py-0 h-4 font-mono"
                          >
                            {m.last_decision || 'no eval'}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-2 px-2 bg-muted/20 rounded-md">
                    <div className="text-[10px] text-muted-foreground/60">None — no large moves without signal</div>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
// Symbol Coverage Tile - Shows trading concentration and strategies
export function SymbolCoverageTile({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  
  const { data: coverageData, isLoading } = useQuery({
    queryKey: ['symbol-coverage', systemState?.current_generation_id],
    queryFn: async () => {
      if (!systemState?.current_generation_id) return null;
      
      // Get filled orders for this generation (excluding test_mode)
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('symbol, agent_id, tags')
        .eq('generation_id', systemState.current_generation_id)
        .eq('status', 'filled');
      
      // Filter out test_mode orders
      const learnableOrders = (orders || []).filter(o => {
        const tags = o.tags as any;
        return !tags?.test_mode;
      });
      
      if (learnableOrders.length === 0) {
        return { uniqueSymbols: 0, topSymbols: [], concentration: { top1: 0, top3: 0, top5: 0 }, strategyBySymbol: {} };
      }
      
      // Count fills per symbol
      const symbolCounts: Record<string, number> = {};
      const symbolAgents: Record<string, Set<string>> = {};
      
      for (const o of learnableOrders) {
        symbolCounts[o.symbol] = (symbolCounts[o.symbol] || 0) + 1;
        if (!symbolAgents[o.symbol]) symbolAgents[o.symbol] = new Set();
        if (o.agent_id) symbolAgents[o.symbol].add(o.agent_id);
      }
      
      const totalFills = learnableOrders.length;
      const uniqueSymbols = Object.keys(symbolCounts).length;
      
      // Sort by count descending
      const sorted = Object.entries(symbolCounts)
        .sort((a, b) => b[1] - a[1]);
      
      const topSymbols = sorted.slice(0, 10).map(([symbol, count]) => ({
        symbol,
        count,
        pct: (count / totalFills) * 100,
      }));
      
      // Concentration metrics
      const top1Pct = sorted[0] ? (sorted[0][1] / totalFills) * 100 : 0;
      const top3Total = sorted.slice(0, 3).reduce((sum, [, c]) => sum + c, 0);
      const top3Pct = (top3Total / totalFills) * 100;
      const top5Total = sorted.slice(0, 5).reduce((sum, [, c]) => sum + c, 0);
      const top5Pct = (top5Total / totalFills) * 100;
      
      // Get strategy breakdown for top symbols
      const allAgentIds = new Set(learnableOrders.map(o => o.agent_id).filter(Boolean));
      let strategyBySymbol: Record<string, Record<string, number>> = {};
      
      if (allAgentIds.size > 0) {
        const { data: agents } = await supabase
          .from('agents')
          .select('id, strategy_template')
          .in('id', Array.from(allAgentIds));
        
        const agentStrategyMap = new Map((agents || []).map(a => [a.id, a.strategy_template]));
        
        // Build strategy counts per symbol
        for (const o of learnableOrders) {
          if (!o.agent_id) continue;
          const strategy = agentStrategyMap.get(o.agent_id);
          if (!strategy) continue;
          
          if (!strategyBySymbol[o.symbol]) strategyBySymbol[o.symbol] = {};
          strategyBySymbol[o.symbol][strategy] = (strategyBySymbol[o.symbol][strategy] || 0) + 1;
        }
      }
      
      return {
        uniqueSymbols,
        topSymbols,
        concentration: { top1: top1Pct, top3: top3Pct, top5: top5Pct },
        strategyBySymbol,
      };
    },
    enabled: !!systemState?.current_generation_id,
    refetchInterval: 60000,
  });
  
  const getDominantStrategy = (symbol: string) => {
    const strategies = coverageData?.strategyBySymbol?.[symbol];
    if (!strategies) return null;
    const sorted = Object.entries(strategies).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0]?.replace('_', ' ') || null;
  };
  
  // Interpretive signals
  const getDiversitySignal = () => {
    if (!coverageData || coverageData.uniqueSymbols === 0) return null;
    const { uniqueSymbols, concentration } = coverageData;
    
    // Fixation warning: >60% in top 1 symbol
    if (concentration.top1 > 60) {
      return { 
        status: 'warning', 
        label: 'FIXATION RISK', 
        color: 'text-amber-500',
        desc: 'Heavy concentration in one symbol — diversity penalty will apply'
      };
    }
    
    // Good spread: 5+ symbols with reasonable distribution
    if (uniqueSymbols >= 5 && concentration.top3 < 80) {
      return { 
        status: 'healthy', 
        label: 'HEALTHY SPREAD', 
        color: 'text-success',
        desc: 'Good opportunity discovery across symbols'
      };
    }
    
    // Early exploration
    if (uniqueSymbols >= 3) {
      return { 
        status: 'ok', 
        label: 'EXPLORING', 
        color: 'text-primary',
        desc: 'Building diversity — evolution will favor broader coverage'
      };
    }
    
    // Limited
    return { 
      status: 'limited', 
      label: 'NARROW FOCUS', 
      color: 'text-muted-foreground',
      desc: 'Few symbols traded — may limit evolutionary signal quality'
    };
  };
  
  const diversitySignal = getDiversitySignal();
  const { refetchAll } = useSystemSnapshot();
  
  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<PieChart className="h-4 w-4 text-primary" />}
        title="Symbol Coverage"
        badges={<CardHeaderBadges compact showMode showGeneration />}
        onRefresh={refetchAll}
      />
      
      {isLoading || !coverageData ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      ) : coverageData.uniqueSymbols === 0 ? (
        <div className="text-xs text-muted-foreground">No fills this generation — awaiting first trades</div>
      ) : (
        <>
          {/* Interpretive signal */}
          {diversitySignal && (
            <div className={`text-[10px] font-mono ${diversitySignal.color}`}>
              <span className="font-bold">{diversitySignal.label}</span>
              <span className="text-muted-foreground ml-1">— {diversitySignal.desc}</span>
            </div>
          )}
          
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{coverageData.uniqueSymbols}</div>
              <div className="text-[9px] text-muted-foreground">Symbols</div>
            </div>
            <div className={`rounded-lg p-2 text-center ${coverageData.concentration.top1 > 60 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-muted/30'}`}>
              <div className={`text-lg font-bold ${coverageData.concentration.top1 > 60 ? 'text-amber-500' : ''}`}>{coverageData.concentration.top1.toFixed(0)}%</div>
              <div className="text-[9px] text-muted-foreground">Top 1</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{coverageData.concentration.top3.toFixed(0)}%</div>
              <div className="text-[9px] text-muted-foreground">Top 3</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{coverageData.concentration.top5.toFixed(0)}%</div>
              <div className="text-[9px] text-muted-foreground">Top 5</div>
            </div>
          </div>
          
          {/* Top symbols list */}
          <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
            {coverageData.topSymbols.slice(0, 5).map(({ symbol, count, pct }) => {
              const dominantStrategy = getDominantStrategy(symbol);
              return (
                <div key={symbol} className="flex items-center gap-2 text-[10px]">
                  <span className="font-mono w-16 truncate">{symbol.replace('-USD', '')}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary/60 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono w-8 text-right text-muted-foreground">{count}</span>
                  {dominantStrategy && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-4">{dominantStrategy}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Phase 6A: Market Regime Tile - Shows current regime context from latest decisions
// ============================================================================
export function MarketRegimeTile({ compact }: { compact?: boolean }) {
  const { data: regimeData, isLoading } = useQuery({
    queryKey: ['market-regime-context'],
    queryFn: async () => {
      // Get most recent trade_decision with regime context
      const { data: events } = await supabase
        .from('control_events')
        .select('triggered_at, metadata')
        .eq('action', 'trade_decision')
        .order('triggered_at', { ascending: false })
        .limit(20);
      
      if (!events?.length) return null;
      
      // Extract regime context from candidates_context (HOLD) or regime_context (BUY/SELL)
      // Field names in metadata: regime, trend_strength, volatility_level, htf_trend_bias, htf_volatility_state
      const regimesBySymbol: Record<string, {
        regime: string;
        strength: number;
        volatility_level: string;
        htf_bias?: string;
        htf_volatility?: string;
      }> = {};
      
      for (const e of events) {
        const meta = e.metadata as Record<string, unknown>;
        const decision = (meta?.decision as string)?.toLowerCase();
        
        // For 'hold' decisions: use candidates_context array
        if (decision === 'hold') {
          const candidates = (meta?.candidates_context as Array<Record<string, unknown>>) || [];
          for (const c of candidates) {
            const symbol = c.symbol as string;
            const regimeCtx = c.regime_context as Record<string, unknown> | undefined;
            const htfCtx = c.htf_context as Record<string, unknown> | undefined;
            
            if (regimeCtx && symbol && !regimesBySymbol[symbol]) {
              regimesBySymbol[symbol] = {
                regime: (regimeCtx.regime as string) ?? 'unknown',
                strength: (regimeCtx.trend_strength as number) ?? 0,
                volatility_level: (regimeCtx.volatility_level as string) ?? 'normal',
                htf_bias: htfCtx?.trend_bias as string | undefined,
                htf_volatility: htfCtx?.volatility_state as string | undefined,
              };
            }
          }
        }
        
        // For 'buy'/'sell' decisions: use root-level regime_context
        if (decision === 'buy' || decision === 'sell') {
          const symbol = meta?.symbol as string;
          const regimeCtx = meta?.regime_context as Record<string, unknown> | undefined;
          
          if (regimeCtx && symbol && !regimesBySymbol[symbol]) {
            regimesBySymbol[symbol] = {
              regime: (regimeCtx.regime as string) ?? 'unknown',
              strength: (regimeCtx.trend_strength as number) ?? 0,
              volatility_level: (regimeCtx.volatility_level as string) ?? 'normal',
              htf_bias: regimeCtx.htf_trend_bias as string | undefined,
              htf_volatility: regimeCtx.htf_volatility_state as string | undefined,
            };
          }
          
          // Also check evaluations array for other symbols
          const evals = (meta?.evaluations as Array<Record<string, unknown>>) || [];
          for (const ev of evals) {
            const evSymbol = ev.symbol as string;
            const evRegime = ev.regime_context as Record<string, unknown> | undefined;
            
            if (evRegime && evSymbol && !regimesBySymbol[evSymbol]) {
              regimesBySymbol[evSymbol] = {
                regime: (evRegime.regime as string) ?? 'unknown',
                strength: (evRegime.trend_strength as number) ?? 0,
                volatility_level: (evRegime.volatility_level as string) ?? 'normal',
                htf_bias: evRegime.htf_trend_bias as string | undefined,
                htf_volatility: evRegime.htf_volatility_state as string | undefined,
              };
            }
          }
        }
      }
      
      // Aggregate regime distribution
      const regimeCounts: Record<string, number> = {};
      const symbols = Object.entries(regimesBySymbol);
      
      for (const [, data] of symbols) {
        regimeCounts[data.regime] = (regimeCounts[data.regime] || 0) + 1;
      }
      
      // Find dominant regime
      const dominantRegime = Object.entries(regimeCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
      
      return {
        symbols: regimesBySymbol,
        regimeCounts,
        dominantRegime,
        symbolCount: symbols.length,
      };
    },
    refetchInterval: 30000,
  });
  
  const getRegimeColor = (regime: string) => {
    switch (regime?.toLowerCase()) {
      case 'trend': return 'text-success bg-success/10 border-success/20';
      case 'chop': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'volatile': return 'text-destructive bg-destructive/10 border-destructive/20';
      case 'dead': return 'text-muted-foreground bg-muted/30 border-muted/20';
      default: return 'text-muted-foreground bg-muted/30 border-muted/20';
    }
  };
  
  const getRegimeIcon = (regime: string) => {
    switch (regime?.toLowerCase()) {
      case 'trend': return <TrendingUp className="h-4 w-4" />;
      case 'chop': return <Activity className="h-4 w-4" />;
      case 'volatile': return <Flame className="h-4 w-4" />;
      case 'dead': return <HelpCircle className="h-4 w-4" />;
      default: return <Globe className="h-4 w-4" />;
    }
  };
  
  const { refetchAll } = useSystemSnapshot();
  
  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<Globe className="h-4 w-4 text-primary" />}
        title="Market Regime"
        badges={<CardHeaderBadges compact showMode={false} showGeneration={false} showPipeline />}
        onRefresh={refetchAll}
      />
      
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      ) : !regimeData || regimeData.symbolCount === 0 ? (
        <div className="text-xs text-muted-foreground">No regime data yet — awaiting trade decisions</div>
      ) : (
        <>
          {/* Dominant regime badge */}
          <div className={cn(
            "inline-flex items-center gap-2 px-3 py-2 rounded-lg border font-mono text-sm font-bold",
            getRegimeColor(regimeData.dominantRegime)
          )}>
            {getRegimeIcon(regimeData.dominantRegime)}
            {regimeData.dominantRegime.toUpperCase()}
          </div>
          
          {/* Regime distribution */}
          <div className="grid grid-cols-4 gap-1">
            {['trend', 'chop', 'volatile', 'dead'].map(regime => {
              const count = regimeData.regimeCounts[regime] || 0;
              const pct = regimeData.symbolCount > 0 ? (count / regimeData.symbolCount) * 100 : 0;
              return (
                <div key={regime} className={cn(
                  "rounded-lg p-1.5 text-center border",
                  count > 0 ? getRegimeColor(regime) : "bg-muted/20 border-transparent"
                )}>
                  <div className="text-sm font-bold">{count}</div>
                  <div className="text-[8px] uppercase">{regime}</div>
                  {pct > 0 && <div className="text-[8px] opacity-70">{pct.toFixed(0)}%</div>}
                </div>
              );
            })}
          </div>
          
          {/* Top symbols with regime */}
          <div className="space-y-1 max-h-[100px] overflow-y-auto">
            {Object.entries(regimeData.symbols).slice(0, 5).map(([symbol, data]) => (
              <div key={symbol} className="flex items-center gap-2 text-[10px]">
                <span className="font-mono w-14 truncate">{symbol.replace('-USD', '')}</span>
                <Badge variant="outline" className={cn("text-[8px] px-1 py-0", getRegimeColor(data.regime))}>
                  {data.regime}
                </Badge>
                <span className="text-muted-foreground">
                  str:{typeof data.strength === 'number' ? (data.strength * 100).toFixed(0) : '0'}%
                </span>
                {data.htf_bias && (
                  <span className={cn(
                    "text-[8px]",
                    data.htf_bias === 'bullish' ? 'text-emerald-500' : 
                    data.htf_bias === 'bearish' ? 'text-red-500' : 'text-muted-foreground'
                  )}>
                    HTF:{data.htf_bias}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Phase 6A: Transaction Cost Tile - Shows fee/slippage estimates and net edge
// ============================================================================
export function TransactionCostTile({ compact }: { compact?: boolean }) {
  const { data: costData, isLoading } = useQuery({
    queryKey: ['transaction-cost-context'],
    queryFn: async () => {
      // Get recent BUY/SELL decisions with cost context
      const { data: events } = await supabase
        .from('control_events')
        .select('triggered_at, metadata')
        .eq('action', 'trade_decision')
        .order('triggered_at', { ascending: false })
        .limit(50);
      
      if (!events?.length) return null;
      
      const trades: Array<{
        symbol: string;
        decision: string;
        confidence: number;
        fee_pct: number;
        slippage_bps: number;
        net_edge: number;
        triggered_at: string;
      }> = [];
      
      for (const e of events) {
        const meta = e.metadata as Record<string, unknown>;
        const decision = (meta?.decision as string)?.toLowerCase();
        
        if (decision === 'buy' || decision === 'sell') {
          const costCtx = meta?.cost_context as Record<string, unknown> | undefined;
          const confidence = (meta?.confidence as number) ?? 0;
          const symbol = meta?.symbol as string;
          
          // Only process if we have a valid symbol
          if (symbol && costCtx) {
            // Support both new (estimated_fee_rate) and legacy (estimated_fee_pct) keys
            const feeFraction = (costCtx.estimated_fee_rate as number) ?? (costCtx.estimated_fee_pct as number) ?? 0.006;
            const slippageBps = (costCtx.estimated_slippage_bps as number) ?? 0;
            
            // Convert to percentages for display math:
            // fee: 0.006 * 100 = 0.6%
            // slippage: 5 bps / 100 = 0.05%
            const feeDisplayPct = feeFraction * 100;
            const slippageDisplayPct = slippageBps / 100;
            const totalCostPct = feeDisplayPct + slippageDisplayPct;
            
            // Net edge proxy = (confidence * 100) - total cost %
            // E.g., confidence=0.65 → 65% - 0.65% costs ≈ 64.35% "proxy edge"
            // Label clearly as "proxy" in UI
            const netEdge = (confidence * 100) - totalCostPct;
            
            trades.push({
              symbol,
              decision,
              confidence,
              fee_pct: feeDisplayPct,
              slippage_bps: slippageBps,
              net_edge: netEdge,
              triggered_at: e.triggered_at,
            });
          }
        }
      }
      
      // Calculate averages
      const avgFeePct = trades.length > 0 
        ? trades.reduce((sum, t) => sum + t.fee_pct, 0) / trades.length 
        : 0.6; // Default estimate
      const avgSlippageBps = trades.length > 0 
        ? trades.reduce((sum, t) => sum + t.slippage_bps, 0) / trades.length 
        : 5;
      const avgNetEdge = trades.length > 0 
        ? trades.reduce((sum, t) => sum + t.net_edge, 0) / trades.length 
        : 0;
      
      const positiveEdgeTrades = trades.filter(t => t.net_edge > 0).length;
      const edgeRatio = trades.length > 0 ? (positiveEdgeTrades / trades.length) * 100 : 0;
      
      // Count total buy/sell decisions vs those with cost_context for coverage metric
      const totalBuySell = events.filter(e => {
        const d = ((e.metadata as Record<string, unknown>)?.decision as string)?.toLowerCase();
        return d === 'buy' || d === 'sell';
      }).length;
      
      return {
        trades: trades.slice(0, 10),
        avgFeePct,
        avgSlippageBps,
        avgNetEdge,
        edgeRatio,
        totalTrades: trades.length,
        totalBuySell, // Total buy/sell decisions in window
        coveragePct: totalBuySell > 0 ? (trades.length / totalBuySell) * 100 : 0,
      };
    },
    refetchInterval: 30000,
  });
  
  const { refetchAll } = useSystemSnapshot();
  
  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<Scale className="h-4 w-4 text-primary" />}
        title="Transaction Costs"
        badges={<CardHeaderBadges compact showMode showGeneration showRisk />}
        onRefresh={refetchAll}
      />
      
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      ) : !costData || costData.totalTrades === 0 ? (
        <div className="text-xs text-muted-foreground">No cost data yet — awaiting trade decisions</div>
      ) : (
        <>
          {/* Net edge summary */}
          <div className={cn(
            "flex items-center gap-2 p-2 rounded-lg border",
            costData.avgNetEdge > 0 
              ? "bg-success/10 border-success/20 text-success" 
              : "bg-destructive/10 border-destructive/20 text-destructive"
          )}>
            {costData.avgNetEdge > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <div>
              <div className="text-sm font-bold font-mono">
                {costData.avgNetEdge >= 0 ? '+' : ''}{costData.avgNetEdge.toFixed(2)}%
              </div>
              <div className="text-[9px] opacity-70">Net Edge Proxy (conf − costs)</div>
            </div>
          </div>
          
          {/* Cost breakdown */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <div className="text-sm font-bold font-mono">{costData.avgFeePct.toFixed(2)}%</div>
              <div className="text-[9px] text-muted-foreground">Avg Fee</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <div className="text-sm font-bold font-mono">{costData.avgSlippageBps.toFixed(0)}bps</div>
              <div className="text-[9px] text-muted-foreground">Avg Slip</div>
            </div>
            <div className={cn(
              "rounded-lg p-2 text-center",
              costData.edgeRatio >= 50 ? "bg-success/10" : "bg-amber-500/10"
            )}>
              <div className={cn(
                "text-sm font-bold font-mono",
                costData.edgeRatio >= 50 ? "text-success" : "text-amber-500"
              )}>
                {costData.edgeRatio.toFixed(0)}%
              </div>
              <div className="text-[9px] text-muted-foreground">+Edge Rate</div>
            </div>
          </div>
          
          {/* Coverage indicator - shows ramp-up status */}
          {costData.coveragePct < 100 && (
            <div className="text-[9px] text-muted-foreground bg-muted/20 rounded px-2 py-1">
              Cost coverage: {costData.totalTrades}/{costData.totalBuySell} decisions ({costData.coveragePct.toFixed(0)}%)
              {costData.coveragePct < 20 && ' — awaiting more post-deploy data'}
            </div>
          )}
          
          {/* Recent trades with edge */}
          <div className="space-y-1 max-h-[80px] overflow-y-auto">
            {costData.trades.slice(0, 5).map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <Badge variant={t.decision === 'buy' ? 'default' : 'destructive'} className="text-[8px] px-1 py-0">
                  {t.decision.toUpperCase()}
                </Badge>
                <span className="font-mono w-12 truncate">{t.symbol.replace('-USD', '')}</span>
                <span className={cn(
                  "font-mono ml-auto",
                  t.net_edge > 0 ? "text-success" : "text-destructive"
                )}>
                  {t.net_edge >= 0 ? '+' : ''}{t.net_edge.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Phase 6A: Audit Tile - Quick access to tuning events for verification
// ============================================================================
export function AuditTile({ compact }: { compact?: boolean }) {
  const [activeTab, setActiveTab] = React.useState<'updates' | 'frozen' | 'retighten'>('updates');
  
  const { data: auditData, isLoading } = useQuery({
    queryKey: ['audit-events', activeTab],
    queryFn: async () => {
      const actionMap = {
        updates: 'adaptive_tuning_update',
        frozen: 'adaptive_tuning_frozen',
        retighten: 'adaptive_tuning_retighten',
      };
      
      const { data: events } = await supabase
        .from('control_events')
        .select('triggered_at, metadata')
        .eq('action', actionMap[activeTab])
        .order('triggered_at', { ascending: false })
        .limit(20);
      
      return events ?? [];
    },
    refetchInterval: 30000,
  });
  
  const formatEventSummary = (meta: any, type: string) => {
    if (type === 'updates') {
      const trigger = meta?.trigger ?? 'unknown';
      const offsetsChanged = Object.keys(meta?.offsets_new ?? {}).length;
      return `${trigger} → ${offsetsChanged} offsets`;
    }
    if (type === 'frozen') {
      return meta?.reason ?? 'frozen';
    }
    if (type === 'retighten') {
      return `retighten: ${meta?.reason ?? 'conditions improved'}`;
    }
    return 'event';
  };
  
  const { refetchAll } = useSystemSnapshot();
  
  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<Eye className="h-4 w-4 text-primary" />}
        title="Tuning Audit"
        badges={<CardHeaderBadges compact showMode showGeneration />}
        onRefresh={refetchAll}
      />
      
      {/* Tab selector */}
      <div className="flex gap-1">
        {(['updates', 'frozen', 'retighten'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "text-[9px] px-2 py-1 rounded font-mono transition-colors",
              activeTab === tab 
                ? "bg-primary text-primary-foreground" 
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
          >
            {tab === 'updates' ? 'Updates' : tab === 'frozen' ? 'Frozen' : 'Retighten'}
          </button>
        ))}
      </div>
      
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      ) : !auditData || auditData.length === 0 ? (
        <div className="text-xs text-muted-foreground">No {activeTab} events yet</div>
      ) : (
        <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
          {auditData.map((event, i) => {
            const meta = event.metadata as any;
            const triggeredAt = new Date(event.triggered_at);
            const timeAgo = formatDistanceToNow(triggeredAt, { addSuffix: true });
            
            return (
              <div key={i} className="flex items-start gap-2 text-[10px] border-b border-border/20 pb-1">
                <span className="text-muted-foreground font-mono w-20 shrink-0">{timeAgo}</span>
                <span className={cn(
                  "flex-1",
                  activeTab === 'frozen' ? 'text-destructive' :
                  activeTab === 'retighten' ? 'text-success' :
                  'text-primary'
                )}>
                  {formatEventSummary(meta, activeTab)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Passing Trades Tile - Shows recent buy/sell decisions with confidence breakdown
export function PassingTradesTile({ compact }: { compact?: boolean }) {
  return <PassingTradesFeed compact={compact} />;
}

// System Vitals Tile - Agent heartbeat, decision throughput, learning status
export { SystemVitals as SystemVitalsTile } from '@/components/dashboard/SystemVitals';

// Regime History Tile - 24h regime distribution and blocked rate
export { RegimeHistoryCard as RegimeHistoryTile } from '@/components/dashboard/RegimeHistoryCard';

// Shadow Trading Tile - Now uses unified cockpit state with staleness
export function ShadowTradingTile({ compact }: { compact?: boolean }) {
  const { shadow, staleness, refetchAll } = useCockpitLiveState();
  const { data: stats } = useShadowTradingStats(); // Keep for lastCalcRun details
  
  const isLoading = !shadow;
  const isStale = staleness.shadow.stale;
  
  const lastRunAge = stats?.lastCalcRun
    ? formatDistanceToNow(new Date(stats.lastCalcRun.timestamp), { addSuffix: true })
    : 'never';
  
  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<Ghost className="h-4 w-4 text-primary" />}
        title="Shadow Learning"
        badges={<CardHeaderBadges compact showMode showGeneration showPipeline />}
        onRefresh={refetchAll}
      />
      
      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-muted/30 rounded" />
          <div className="h-8 bg-muted/30 rounded" />
        </div>
      ) : (
        <>
          {/* Main metrics grid */}
          <div className={compact ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-3'}>
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Activity className="h-3 w-3" />
                Today
              </div>
              <div className="font-mono text-sm font-bold">{shadow.todayCount}</div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <HelpCircle className="h-3 w-3" />
                Pending
              </div>
              <div className="font-mono text-sm">
                {shadow.pendingCount}
                {shadow.oldestPendingAge !== null && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    ({shadow.oldestPendingAge}m old)
                  </span>
                )}
              </div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <CheckCircle className="h-3 w-3" />
                Calc 24h
              </div>
              <div className="font-mono text-sm">{shadow.calculatedLast24h}</div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                {(shadow.avgPnlPct ?? 0) >= 0 
                  ? <TrendingUp className="h-3 w-3" /> 
                  : <TrendingDown className="h-3 w-3" />}
                Avg PnL
              </div>
              <div className={cn(
                "font-mono text-sm font-bold",
                (shadow.avgPnlPct ?? 0) >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {shadow.avgPnlPct !== null 
                  ? `${shadow.avgPnlPct >= 0 ? '+' : ''}${shadow.avgPnlPct.toFixed(2)}%`
                  : '—'}
              </div>
            </div>
          </div>
          
          {/* Last calc run info */}
          {stats?.lastCalcRun && (
            <div className="text-[10px] font-mono text-muted-foreground space-y-1 border-t border-border/30 pt-2">
              <div className="flex justify-between">
                <span>Last calc run:</span>
                <span>{lastRunAge}</span>
              </div>
              <div className="flex justify-between">
                <span>Processed:</span>
                <span>
                  {stats.lastCalcRun.calculated} calc / {stats.lastCalcRun.skipped} skip / {stats.lastCalcRun.errors} err
                </span>
              </div>
              {Object.keys(stats.lastCalcRun.byReason).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.entries(stats.lastCalcRun.byReason).map(([reason, count]) => (
                    <Badge key={reason} variant="secondary" className="text-[8px] px-1 py-0">
                      {reason}: {count}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Live Brain Tile - Shows active brain snapshot and allows promotion
export { LiveBrainPanel as LiveBrainTile } from '@/components/dashboard/LiveBrainPanel';

// ============================================
// PIPELINE HEALTH TILE - Snapshot-native
// Shows trade-cycle, fitness, market-poll, shadow status with drill-down
// ============================================
export function PipelineHealthTile({ compact }: { compact?: boolean }) {
  const { pipeline, staleness, refetchAll } = useSystemSnapshot();
  const [selectedPipeline, setSelectedPipeline] = React.useState<string | null>(null);

  // Fetch recent events for drill-down
  const { data: pipelineEvents } = useQuery({
    queryKey: ['pipeline-events', selectedPipeline],
    queryFn: async () => {
      if (!selectedPipeline) return [];
      
      let actionFilter: string[] = [];
      if (selectedPipeline === 'trade') actionFilter = ['trade_decision', 'trade_execution'];
      else if (selectedPipeline === 'fitness') actionFilter = ['fitness_calculated'];
      else if (selectedPipeline === 'shadow') actionFilter = ['shadow_outcome_calc'];
      else if (selectedPipeline === 'market') {
        // For market, use market_poll_runs table instead
        const { data } = await supabase
          .from('market_poll_runs')
          .select('*')
          .order('ran_at', { ascending: false })
          .limit(15);
        return (data ?? []).map(r => ({
          id: r.id,
          triggered_at: r.ran_at,
          action: 'market_poll',
          metadata: { status: r.status, updated_count: r.updated_count, duration_ms: r.duration_ms, error: r.error_message }
        }));
      }
      
      const { data } = await supabase
        .from('control_events')
        .select('*')
        .in('action', actionFilter)
        .order('triggered_at', { ascending: false })
        .limit(15);
      return data ?? [];
    },
    enabled: !!selectedPipeline,
  });

  const tradeStale = pipeline?.tradeCycle.isStale ?? true;
  const fitnessStale = pipeline?.fitnessCycle.isStale ?? true;
  const marketStale = pipeline?.marketPoll.isStale ?? true;
  const pendingShadow = pipeline?.shadowOutcome.pendingCount ?? 0;

  const formatTime = (ts: string | null) => {
    if (!ts) return 'no runs yet';
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  };

  const StatusDot = ({ stale }: { stale: boolean }) => (
    <span className={cn(
      "inline-block w-1.5 h-1.5 rounded-full",
      stale ? "bg-amber-500" : "bg-emerald-500"
    )} />
  );

  const PipelineRow = ({ 
    id, stale, label, status, time, extra 
  }: { 
    id: string; stale: boolean; label: string; status: string; time: string; extra?: string 
  }) => (
    <button
      onClick={() => setSelectedPipeline(id)}
      className="w-full text-left bg-muted/30 rounded-lg p-2 space-y-1 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <StatusDot stale={stale} />
          {label}
        </div>
        <Eye className="h-3 w-3 text-muted-foreground/50" />
      </div>
      <div className={cn(
        "font-mono text-sm",
        stale ? "text-amber-500" : "text-emerald-500"
      )}>
        {status}
      </div>
      <div className="text-[9px] text-muted-foreground">
        {time}
        {extra && ` · ${extra}`}
      </div>
    </button>
  );

  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<Activity className="h-4 w-4 text-primary" />}
        title="Pipeline Health"
        badges={
          <div className="flex items-center gap-1">
            <PipelineBadge compact />
          </div>
        }
        onRefresh={refetchAll}
      />

      <div className="grid grid-cols-2 gap-2">
        <PipelineRow 
          id="trade"
          stale={tradeStale}
          label="Trade Cycle"
          status={tradeStale ? "STALE" : "OK"}
          time={formatTime(pipeline?.tradeCycle.lastRun ?? null)}
          extra={pipeline?.tradeCycle.lastDecision ?? undefined}
        />
        <PipelineRow 
          id="market"
          stale={marketStale}
          label="Market Poll"
          status={marketStale ? "STALE" : "OK"}
          time={formatTime(pipeline?.marketPoll.lastRun ?? null)}
          extra={pipeline?.marketPoll.symbolsUpdated ? `${pipeline.marketPoll.symbolsUpdated} sym` : undefined}
        />
        <PipelineRow 
          id="fitness"
          stale={fitnessStale}
          label="Fitness Calc"
          status={fitnessStale ? "STALE" : "OK"}
          time={formatTime(pipeline?.fitnessCycle.lastRun ?? null)}
        />
        <PipelineRow 
          id="shadow"
          stale={pendingShadow > 10}
          label="Shadow Outcomes"
          status={pendingShadow > 0 ? `${pendingShadow} pending` : "clear"}
          time={formatTime(pipeline?.shadowOutcome.lastRun ?? null)}
        />
      </div>

      {/* Overall staleness warning */}
      {staleness.pipeline.stale && (
        <div className="flex items-center gap-1 text-[10px] text-amber-500 bg-amber-500/10 rounded px-2 py-1">
          <AlertTriangle className="h-3 w-3" />
          Pipeline stale for {Math.floor(staleness.pipeline.ageSeconds / 60)}m
        </div>
      )}

      {/* Drill-down drawer */}
      {selectedPipeline && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setSelectedPipeline(null)}>
          <div 
            className="fixed right-0 top-0 h-full w-96 bg-card border-l border-border shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                {selectedPipeline === 'trade' ? 'Trade Cycle' : 
                 selectedPipeline === 'market' ? 'Market Poll' :
                 selectedPipeline === 'fitness' ? 'Fitness Calc' : 'Shadow Outcomes'} Logs
              </h3>
              <button 
                onClick={() => setSelectedPipeline(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <ScrollArea className="h-[calc(100%-60px)]">
              <div className="p-4 space-y-2">
                {pipelineEvents?.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No recent events found
                  </div>
                )}
                {pipelineEvents?.map((event: any) => (
                  <div key={event.id} className="bg-muted/30 rounded-lg p-3 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-[9px]">{event.action}</Badge>
                      <span className="text-[9px] text-muted-foreground">
                        {formatDistanceToNow(new Date(event.triggered_at), { addSuffix: true })}
                      </span>
                    </div>
                    {event.metadata && (
                      <pre className="text-[9px] font-mono text-muted-foreground bg-background/50 rounded p-2 overflow-x-auto max-h-32">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// RISK STATE TILE - Snapshot-native
// Shows rollback thresholds, breach status, and history
// ============================================
export function RiskStateTile({ compact }: { compact?: boolean }) {
  const { risk, refetchAll } = useSystemSnapshot();

  // Fetch recent risk alerts for history
  const { data: recentAlerts } = useQuery({
    queryKey: ['risk-alerts-history'],
    queryFn: async () => {
      const { data } = await supabase
        .from('performance_alerts')
        .select('*')
        .in('type', ['rollback_triggered', 'rollback_check', 'risk_breach', 'brain_rollback'])
        .order('created_at', { ascending: false })
        .limit(10);
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  const daily = risk?.dailyLossPct ?? 0;
  const dd = risk?.drawdownPct ?? 0;
  const streak = risk?.consecutiveLossDays ?? 0;
  const shouldRollback = risk?.shouldRollback ?? false;
  const breaches = risk?.rollbackBreaches ?? [];

  // Thresholds (should match fitness-calc)
  const THRESHOLDS = {
    dailyLoss: 0.05,
    drawdown: 0.10,
    consecutiveLossDays: 5,
  };

  const MetricBar = ({ value, threshold, label, format }: { 
    value: number; 
    threshold: number; 
    label: string;
    format: (v: number) => string;
  }) => {
    const pct = Math.min((value / threshold) * 100, 100);
    const danger = value >= threshold;
    const warning = value >= threshold * 0.7;
    
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">{label}</span>
          <span className={cn(
            "font-mono",
            danger ? "text-destructive font-bold" : 
            warning ? "text-amber-500" : "text-foreground"
          )}>
            {format(value)} / {format(threshold)}
          </span>
        </div>
        <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all",
              danger ? "bg-destructive" : 
              warning ? "bg-amber-500" : "bg-emerald-500"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  const getAlertIcon = (type: string) => {
    if (type === 'rollback_triggered' || type === 'brain_rollback') return <AlertTriangle className="h-3 w-3 text-destructive" />;
    if (type === 'risk_breach') return <AlertCircle className="h-3 w-3 text-amber-500" />;
    return <HelpCircle className="h-3 w-3 text-muted-foreground" />;
  };

  const getAlertBadgeVariant = (type: string): "destructive" | "secondary" | "outline" => {
    if (type === 'rollback_triggered' || type === 'brain_rollback') return 'destructive';
    if (type === 'risk_breach') return 'secondary';
    return 'outline';
  };

  return (
    <div className="space-y-3">
      <SnapshotTileHeader 
        icon={<Shield className="h-4 w-4 text-primary" />}
        title="Risk State"
        badges={
          <div className="flex items-center gap-1">
            <RiskBadge compact />
          </div>
        }
        onRefresh={refetchAll}
      />

      {/* Rollback alert */}
      {shouldRollback ? (
        <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg p-2 border border-destructive/30">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <div className="text-xs font-medium">ROLLBACK TRIGGERED</div>
            <div className="text-[10px] opacity-80">
              {breaches.length > 0 ? breaches.join(' · ') : 'Threshold breached'}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 rounded-lg p-2">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <div>
            <div className="text-xs font-medium">Normal</div>
            <div className="text-[10px] opacity-80">No rollback conditions detected</div>
          </div>
        </div>
      )}

      {/* Metric bars */}
      <div className="space-y-3">
        <MetricBar 
          label="Daily Loss" 
          value={daily} 
          threshold={THRESHOLDS.dailyLoss}
          format={(v) => `${(v * 100).toFixed(2)}%`}
        />
        <MetricBar 
          label="Drawdown" 
          value={dd} 
          threshold={THRESHOLDS.drawdown}
          format={(v) => `${(v * 100).toFixed(2)}%`}
        />
        <MetricBar 
          label="Loss Streak" 
          value={streak} 
          threshold={THRESHOLDS.consecutiveLossDays}
          format={(v) => `${v} days`}
        />
      </div>

      {/* Breach History */}
      {recentAlerts && recentAlerts.length > 0 && (
        <div className="border-t border-border/30 pt-2 space-y-2">
          <div className="text-[10px] text-muted-foreground font-medium">Recent Alerts</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {recentAlerts.slice(0, 5).map((alert: any) => {
              const meta = alert.metadata as Record<string, any> | null;
              const reason = meta?.breaches?.join(', ') || meta?.reason || alert.message?.slice(0, 50);
              
              return (
                <div 
                  key={alert.id} 
                  className={cn(
                    "flex items-start gap-2 text-[10px] p-1.5 rounded",
                    alert.type === 'rollback_triggered' ? "bg-destructive/10" : "bg-muted/30"
                  )}
                >
                  {getAlertIcon(alert.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <Badge variant={getAlertBadgeVariant(alert.type)} className="text-[8px] px-1 py-0">
                        {alert.type.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {reason && (
                      <div className="text-[9px] text-muted-foreground truncate mt-0.5">
                        {reason}
                      </div>
                    )}
                  </div>
                  {alert.is_ack && (
                    <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Thresholds info */}
      <div className="text-[9px] text-muted-foreground border-t border-border/30 pt-2">
        Rollback triggers: &gt;5% daily loss, &gt;10% drawdown, or &gt;5 consecutive losing days
      </div>
    </div>
  );
}

// Live Proof Tile - Shows execution state proof (Mode/Armed/Broker)
export { LiveProofTile } from '@/components/dashboard/LiveProofTile';
