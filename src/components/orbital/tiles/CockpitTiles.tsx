// Cockpit Tiles - Small instrument cards that don't need drilldown
import { TradeCycleStatus } from '@/components/dashboard/TradeCycleStatus';
import { GenerationHealth } from '@/components/dashboard/GenerationHealth';
import { PollingHealth } from '@/components/dashboard/PollingHealth';
import { ControlPanel } from '@/components/dashboard/ControlPanel';
import { useSystemState } from '@/hooks/useEvoTraderData';
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
  Gauge
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

// Capital Overview Tile
export function CapitalOverviewTile({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  const { data: genOrdersCount = 0 } = useGenOrdersCount(systemState?.current_generation_id ?? null);
  const { data: cohortCount = 0 } = useCohortCount(systemState?.current_generation_id ?? null);
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
        <Gauge className="h-4 w-4 text-primary" />
        Capital Overview
      </div>
      
      <div className={compact ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-3'}>
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Wallet className="h-3 w-3" />
            Total
            <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">CONFIG</Badge>
          </div>
          <div className="font-mono text-sm font-bold">
            ${(systemState?.total_capital ?? 0).toLocaleString()}
          </div>
        </div>
        
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <DollarSign className="h-3 w-3" />
            Active
          </div>
          <div className="font-mono text-sm">
            ${(systemState?.active_pool ?? 0).toLocaleString()}
          </div>
        </div>
        
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Shield className="h-3 w-3" />
            Reserve
          </div>
          <div className="font-mono text-sm">
            ${(systemState?.reserve ?? 0).toLocaleString()}
          </div>
        </div>
        
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users className="h-3 w-3" />
            Cohort
            <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">LIVE</Badge>
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
        
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            Today P&L
          </div>
          <div className={`font-mono text-sm ${(systemState?.today_pnl ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
            {(systemState?.today_pnl ?? 0) >= 0 ? '+' : ''}${(systemState?.today_pnl ?? 0).toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
