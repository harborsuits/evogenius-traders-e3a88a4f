import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Brain, CheckCircle, XCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TradeDecision {
  id: string;
  triggered_at: string;
  action: string;
  metadata: {
    symbol?: string;
    side?: string;
    qty?: number;
    decision_type?: 'trade' | 'hold' | 'blocked';
    block_reason?: string;
    executed?: boolean;
    fill_price?: number;
    agent_id?: string;
  } | null;
}

export function DecisionLog() {
  const { data: decisions = [], isLoading } = useQuery({
    queryKey: ['trade-decisions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('control_events')
        .select('*')
        .in('action', ['trade_decision', 'trade_blocked', 'trade_executed'])
        .order('triggered_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as TradeDecision[];
    },
    refetchInterval: 5000,
  });

  const getDecisionIcon = (action: string, metadata: TradeDecision['metadata']) => {
    if (action === 'trade_blocked') {
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    }
    if (action === 'trade_executed') {
      return <CheckCircle className="h-3.5 w-3.5 text-primary" />;
    }
    return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const getDecisionBadge = (action: string, metadata: TradeDecision['metadata']) => {
    if (action === 'trade_blocked') {
      return <Badge variant="destructive" className="text-[10px] px-1.5">BLOCKED</Badge>;
    }
    if (action === 'trade_executed') {
      return <Badge variant="default" className="text-[10px] px-1.5">EXECUTED</Badge>;
    }
    if (metadata?.decision_type === 'hold') {
      return <Badge variant="secondary" className="text-[10px] px-1.5">HOLD</Badge>;
    }
    return <Badge variant="outline" className="text-[10px] px-1.5">DECISION</Badge>;
  };

  return (
    <Card variant="default">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
            Trade Decisions
          </CardTitle>
          <Badge variant="outline" className="ml-auto text-xs font-mono">
            {decisions.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-xs text-muted-foreground font-mono">
            Loading decisions...
          </div>
        ) : decisions.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground font-mono">
            No trade decisions yet. Start the system to generate decisions.
          </div>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {decisions.map((decision) => (
                <div
                  key={decision.id}
                  className="flex items-center gap-2 p-2 rounded bg-muted/30 text-xs"
                >
                  {getDecisionIcon(decision.action, decision.metadata)}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {decision.metadata?.symbol && (
                        <span className="font-mono font-medium">
                          {decision.metadata.symbol}
                        </span>
                      )}
                      {decision.metadata?.side && (
                        <Badge 
                          variant={decision.metadata.side === 'buy' ? 'default' : 'destructive'}
                          className="text-[10px] px-1"
                        >
                          {decision.metadata.side.toUpperCase()}
                        </Badge>
                      )}
                      {decision.metadata?.qty && (
                        <span className="text-muted-foreground">
                          {decision.metadata.qty.toFixed(6)}
                        </span>
                      )}
                    </div>
                    
                    {decision.metadata?.block_reason && (
                      <div className="text-destructive text-[10px] mt-0.5 truncate">
                        {decision.metadata.block_reason}
                      </div>
                    )}
                    
                    {decision.metadata?.fill_price && (
                      <div className="text-muted-foreground text-[10px] mt-0.5">
                        Filled @ ${decision.metadata.fill_price.toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {getDecisionBadge(decision.action, decision.metadata)}
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(decision.triggered_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
