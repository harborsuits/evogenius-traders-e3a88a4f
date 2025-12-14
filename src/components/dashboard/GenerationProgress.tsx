import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Generation } from '@/types/evotrader';
import { Clock, Activity, TrendingDown } from 'lucide-react';

interface GenerationProgressProps {
  generation: Generation;
  maxTrades: number;
  maxDays: number;
  maxDrawdown: number;
  liveOrdersCount?: number; // Live count from paper_orders
}

export function GenerationProgress({ 
  generation, 
  maxTrades,
  maxDays,
  maxDrawdown,
  liveOrdersCount
}: GenerationProgressProps) {
  const startDate = new Date(generation.start_time);
  const now = new Date();
  const daysElapsed = Math.floor((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  const hoursRemaining = Math.max(0, (maxDays * 24) - Math.floor((now.getTime() - startDate.getTime()) / (60 * 60 * 1000)));
  
  // Use live orders count if provided, otherwise fall back to generation.total_trades
  const currentTrades = liveOrdersCount ?? generation.total_trades;
  const tradesProgress = (currentTrades / maxTrades) * 100;
  const timeProgress = (daysElapsed / maxDays) * 100;
  const drawdownProgress = (generation.max_drawdown / (maxDrawdown * 100)) * 100;

  return (
    <Card variant="terminal" className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-primary text-glow">
            GEN_{String(generation.generation_number).padStart(3, '0')}
          </CardTitle>
          <Badge variant="glow">ACTIVE</Badge>
        </div>
        {generation.regime_tag && (
          <Badge variant="outline" className="w-fit mt-2">
            {generation.regime_tag}
          </Badge>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Time Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Time</span>
            </div>
            <span className="font-mono text-foreground">
              Day {daysElapsed + 1} / {maxDays}
            </span>
          </div>
          <Progress value={timeProgress} className="h-2" />
          <p className="text-xs text-muted-foreground font-mono">
            {hoursRemaining}h remaining
          </p>
        </div>

        {/* Trades Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Activity className="h-4 w-4" />
              <span>Trades</span>
              {liveOrdersCount !== undefined && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-success/80">
                  LIVE
                </Badge>
              )}
            </div>
            <span className="font-mono text-foreground">
              {currentTrades} / {maxTrades}
            </span>
          </div>
          <Progress value={tradesProgress} className="h-2" />
        </div>

        {/* Drawdown Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingDown className="h-4 w-4" />
              <span>Drawdown</span>
            </div>
            <span className={`font-mono ${generation.max_drawdown > maxDrawdown * 100 * 0.8 ? 'text-destructive' : 'text-foreground'}`}>
              {generation.max_drawdown.toFixed(1)}% / {(maxDrawdown * 100).toFixed(0)}%
            </span>
          </div>
          <Progress 
            value={drawdownProgress} 
            className="h-2"
          />
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total P&L</p>
            <p className={`font-mono text-lg font-bold ${generation.total_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
              {generation.total_pnl >= 0 ? '+' : ''}${generation.total_pnl.toFixed(2)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Started</p>
            <p className="font-mono text-sm text-foreground">
              {startDate.toLocaleDateString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
