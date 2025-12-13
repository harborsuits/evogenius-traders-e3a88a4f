import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Clock, Activity, TrendingDown, Package, AlertTriangle } from 'lucide-react';

const PLACEHOLDER_ID = '11111111-1111-1111-1111-111111111111';

interface GenerationHealthProps {
  generationId: string | null;
}

export function GenerationHealth({ generationId }: GenerationHealthProps) {
  // Get generation details
  const { data: generation } = useQuery({
    queryKey: ['generation-health', generationId],
    queryFn: async () => {
      if (!generationId || generationId === PLACEHOLDER_ID) return null;
      
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('id', generationId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!generationId && generationId !== PLACEHOLDER_ID,
    refetchInterval: 30000,
  });

  // Get learnable trades count for this generation
  const { data: tradeStats } = useQuery({
    queryKey: ['generation-trades', generationId],
    queryFn: async () => {
      if (!generationId || generationId === PLACEHOLDER_ID) return { total: 0, learnable: 0 };
      
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('id, tags')
        .eq('generation_id', generationId)
        .eq('status', 'filled');
      
      const total = orders?.length ?? 0;
      const learnable = orders?.filter(o => {
        const tags = o.tags as { test_mode?: boolean; entry_reason?: string[] } | null;
        if (!tags) return true;
        if (tags.test_mode === true) return false;
        if (tags.entry_reason?.includes('test_mode')) return false;
        return true;
      }).length ?? 0;
      
      return { total, learnable };
    },
    enabled: !!generationId && generationId !== PLACEHOLDER_ID,
    refetchInterval: 10000,
  });

  // Get open positions count
  const { data: openPositions } = useQuery({
    queryKey: ['open-positions-count'],
    queryFn: async () => {
      const { data } = await supabase
        .from('paper_positions')
        .select('id, symbol, qty')
        .neq('qty', 0);
      
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  // Calculate time elapsed and remaining
  const startTime = generation?.start_time ? new Date(generation.start_time) : null;
  const now = new Date();
  const elapsedMs = startTime ? now.getTime() - startTime.getTime() : 0;
  const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60));
  const elapsedDays = Math.floor(elapsedHours / 24);
  const remainingHours = elapsedHours % 24;
  
  const maxDays = 7;
  const maxTrades = 100;
  const maxDrawdown = 0.15;
  
  const remainingDays = Math.max(0, maxDays - elapsedDays - 1);
  const remainingTradesNeeded = Math.max(0, maxTrades - (tradeStats?.learnable ?? 0));
  
  const isPlaceholder = !generationId || generationId === PLACEHOLDER_ID;
  const hasOpenPositions = (openPositions?.length ?? 0) > 0;

  if (isPlaceholder) {
    return (
      <Card variant="terminal" className="border-destructive/50 bg-destructive/5">
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-sm flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            NO ACTIVE GENERATION
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Click "Start New Generation" in the Control Panel to begin evolution.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="terminal" className="border-primary/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-sm text-primary">
            GEN_{String(generation?.generation_number ?? '?').padStart(3, '0')} HEALTH
          </CardTitle>
          <Badge variant="glow" className="text-xs">
            {generation?.is_active ? 'ACTIVE' : 'ENDED'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Time */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Time Elapsed</span>
          </div>
          <span className="font-mono text-foreground">
            {elapsedDays > 0 && `${elapsedDays}d `}{remainingHours}h
            <span className="text-muted-foreground ml-1">
              (~{remainingDays}d remaining)
            </span>
          </span>
        </div>

        {/* Trades */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-3 w-3" />
            <span>Learnable Trades</span>
          </div>
          <span className="font-mono text-foreground">
            {tradeStats?.learnable ?? 0} / {maxTrades}
            <span className="text-muted-foreground ml-1">
              ({remainingTradesNeeded} to end)
            </span>
          </span>
        </div>

        {/* Open Positions */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="h-3 w-3" />
            <span>Open Positions</span>
          </div>
          <span className={`font-mono ${hasOpenPositions ? 'text-yellow-500' : 'text-foreground'}`}>
            {openPositions?.length ?? 0}
            {hasOpenPositions && (
              <span className="text-yellow-500 ml-1">⚠️</span>
            )}
          </span>
        </div>

        {/* Account Drawdown */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingDown className="h-3 w-3" />
            <span>Max Drawdown Limit</span>
          </div>
          <span className="font-mono text-foreground">
            {(generation?.max_drawdown ?? 0).toFixed(1)}% / {(maxDrawdown * 100).toFixed(0)}%
          </span>
        </div>

        {/* Generation ID (truncated for debugging) */}
        <div className="pt-2 border-t border-border">
          <p className="text-[10px] font-mono text-muted-foreground/50 truncate">
            ID: {generationId?.substring(0, 8)}...
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
