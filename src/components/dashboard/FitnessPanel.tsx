import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Trophy, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface PerformanceRecord {
  id: string;
  agent_id: string;
  generation_id: string;
  fitness_score: number;
  net_pnl: number;  // Now stores realized_pnl
  sharpe_ratio: number;
  max_drawdown: number;
  profitable_days_ratio: number;
  total_trades: number;
  created_at: string;
}

export function FitnessPanel() {
  const [isCalculating, setIsCalculating] = useState(false);
  const queryClient = useQueryClient();

  const { data: performances, isLoading } = useQuery({
    queryKey: ['performance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance')
        .select('*')
        .order('fitness_score', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as PerformanceRecord[];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: lastCalcEvent } = useQuery({
    queryKey: ['fitness-last-calc'],
    queryFn: async () => {
      const { data } = await supabase
        .from('control_events')
        .select('triggered_at, metadata')
        .eq('action', 'fitness_calculated')
        .order('triggered_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return data;
    },
    refetchInterval: 30000,
  });

  const handleCalculate = async () => {
    setIsCalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke('fitness-calc');
      
      if (error) throw error;
      
      if (data?.ok) {
        toast.success(`Fitness calculated for ${data.agents_processed} agents`);
        queryClient.invalidateQueries({ queryKey: ['performance'] });
        queryClient.invalidateQueries({ queryKey: ['fitness-last-calc'] });
      } else if (data?.skipped) {
        toast.info(`Skipped: ${data.reason}`);
      }
    } catch (error) {
      console.error('Fitness calc error:', error);
      toast.error('Failed to calculate fitness');
    } finally {
      setIsCalculating(false);
    }
  };

  const formatScore = (score: number) => {
    const pct = (score * 100).toFixed(1);
    return `${pct}%`;
  };

  const getScoreBadgeVariant = (score: number): 'default' | 'secondary' | 'destructive' => {
    if (score > 0.3) return 'default';
    if (score > 0) return 'secondary';
    return 'destructive';
  };

  const lastCalcTime = lastCalcEvent?.triggered_at 
    ? new Date(lastCalcEvent.triggered_at).toLocaleTimeString()
    : 'Never';

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Fitness Leaderboard
          </CardTitle>
          <Button 
            size="sm" 
            variant="outline"
            onClick={handleCalculate}
            disabled={isCalculating}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isCalculating ? 'animate-spin' : ''}`} />
            Calculate
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Last calc: {lastCalcTime}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading...</div>
        ) : !performances || performances.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No fitness data yet. Run calculation after trades execute.
          </div>
        ) : (
          <div className="space-y-2">
            {performances.map((perf, index) => (
              <div 
                key={perf.id} 
                className="flex items-center justify-between p-2 rounded-md bg-muted/30 border border-border/30"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground w-4">
                    #{index + 1}
                  </span>
                  <span className="text-xs font-mono">
                    {perf.agent_id.substring(0, 8)}
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* PnL */}
                  <div className="flex items-center gap-1 text-xs">
                    {perf.net_pnl >= 0 ? (
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    )}
                    <span className={perf.net_pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                      ${perf.net_pnl.toFixed(2)}
                    </span>
                  </div>
                  
                  {/* Trades */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Activity className="h-3 w-3" />
                    {perf.total_trades}
                  </div>
                  
                  {/* Fitness Score */}
                  <Badge variant={getScoreBadgeVariant(perf.fitness_score)}>
                    {formatScore(perf.fitness_score)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Component breakdown legend */}
        <div className="pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground mb-1">Fitness Formula:</p>
          <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
            <span>• PnL (35%)</span>
            <span>• Sharpe (25%)</span>
            <span>• Profit Days (15%)</span>
            <span>• -Drawdown (15%)</span>
            <span>• -Overtrade (10%)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
