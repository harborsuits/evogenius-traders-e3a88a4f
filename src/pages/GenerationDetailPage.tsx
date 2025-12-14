import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Activity, Clock, TrendingDown, TrendingUp, Layers } from 'lucide-react';

export default function GenerationDetailPage() {
  const navigate = useNavigate();
  const { genId } = useParams();
  
  const { data: generation, isLoading } = useQuery({
    queryKey: ['generation-detail', genId],
    queryFn: async () => {
      const { data } = await supabase.from('generations').select('*').eq('id', genId).single();
      return data;
    },
    enabled: !!genId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <span className="font-mono text-muted-foreground">Loading generation...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background bg-grid">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orbit
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h1 className="font-mono text-lg text-primary">
              Generation #{generation?.generation_number}
            </h1>
            {generation?.is_active && (
              <Badge variant="glow" className="ml-2">ACTIVE</Badge>
            )}
          </div>
        </div>
      </header>
      
      <main className="container px-4 py-6 space-y-6">
        {/* Key metrics - matching GEN_010 Health tile summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Clock className="h-4 w-4" />
                <span className="text-xs">Status</span>
              </div>
              <Badge variant={generation?.is_active ? 'glow' : 'outline'} className="text-sm">
                {generation?.is_active ? 'ACTIVE' : 'ENDED'}
              </Badge>
            </CardContent>
          </Card>
          
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Activity className="h-4 w-4" />
                <span className="text-xs">Total Trades</span>
              </div>
              <div className="font-mono text-2xl font-bold">{generation?.total_trades ?? 0}</div>
            </CardContent>
          </Card>
          
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                {(generation?.total_pnl ?? 0) >= 0 
                  ? <TrendingUp className="h-4 w-4 text-success" />
                  : <TrendingDown className="h-4 w-4 text-destructive" />
                }
                <span className="text-xs">Total P&L</span>
              </div>
              <div className={`font-mono text-2xl font-bold ${(generation?.total_pnl ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                ${(generation?.total_pnl ?? 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>
          
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                <span className="text-xs">Max Drawdown</span>
              </div>
              <div className="font-mono text-2xl text-destructive">
                {((generation?.max_drawdown ?? 0) * 100).toFixed(1)}%
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Details section */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Generation Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
              <div>
                <span className="text-muted-foreground block mb-1">Start Time</span>
                <div className="font-mono">
                  {generation?.start_time ? new Date(generation.start_time).toLocaleString() : '—'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">End Time</span>
                <div className="font-mono">
                  {generation?.end_time ? new Date(generation.end_time).toLocaleString() : '—'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">End Reason</span>
                <Badge variant="outline">{generation?.termination_reason || 'N/A'}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Market Regime</span>
                <div className="font-mono">{generation?.regime_tag || 'Unknown'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Links to related data */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => navigate('/agents')}>
            View Agents in this Generation
          </Button>
          <Button variant="outline" onClick={() => navigate('/trades')}>
            View Trades
          </Button>
        </div>
      </main>
    </div>
  );
}
