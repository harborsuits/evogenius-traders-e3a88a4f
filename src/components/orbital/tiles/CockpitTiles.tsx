// Cockpit Tiles - Small instrument cards that don't need drilldown
import { TradeCycleStatus } from '@/components/dashboard/TradeCycleStatus';
import { GenerationHealth } from '@/components/dashboard/GenerationHealth';
import { PollingHealth } from '@/components/dashboard/PollingHealth';
import { ControlPanel } from '@/components/dashboard/ControlPanel';
import { NewsPanel } from '@/components/dashboard/NewsPanel';
import { useSystemState, useMarketData } from '@/hooks/useEvoTraderData';
import { usePaperAccount, usePaperPositions, usePaperRealtimeSubscriptions } from '@/hooks/usePaperTrading';
import { SystemStatus } from '@/types/evotrader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Badge } from '@/components/ui/badge';
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
  BarChart3
} from 'lucide-react';
import { useGenOrdersCount, useCohortCount } from '@/hooks/useGenOrders';

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

// Capital Overview Tile - Now shows REAL paper portfolio data
export function CapitalOverviewTile({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  const { data: account } = usePaperAccount();
  const { data: positions = [] } = usePaperPositions(account?.id);
  const { data: marketData = [] } = useMarketData();
  const { data: genOrdersCount = 0 } = useGenOrdersCount(systemState?.current_generation_id ?? null);
  const { data: cohortCount = 0 } = useCohortCount(systemState?.current_generation_id ?? null);
  
  usePaperRealtimeSubscriptions();
  
  // Calculate real portfolio values
  const cash = account?.cash ?? 0;
  const startingCash = account?.starting_cash ?? 1000;
  
  const positionValues = positions.map(pos => {
    const market = marketData.find(m => m.symbol === pos.symbol);
    return pos.qty * (market?.price ?? pos.avg_entry_price);
  });
  
  const totalPositionValue = positionValues.reduce((sum, v) => sum + v, 0);
  const totalEquity = cash + totalPositionValue;
  const totalPnl = totalEquity - startingCash;
  const pnlPct = startingCash > 0 ? (totalPnl / startingCash) * 100 : 0;
  
  const activePositions = positions.filter(p => p.qty !== 0);
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
        <FlaskConical className="h-4 w-4 text-primary" />
        Paper Portfolio
        <Badge variant="glow" className="text-[8px] px-1 py-0 ml-auto">LIVE</Badge>
      </div>
      
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
    </div>
  );
}

// News Feed Tile
export function NewsTile({ compact }: { compact?: boolean }) {
  return <NewsPanel />;
}
