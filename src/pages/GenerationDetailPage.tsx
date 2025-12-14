import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, History } from 'lucide-react';

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

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><span className="font-mono text-muted-foreground">Loading...</span></div>;

  return (
    <div className="min-h-screen bg-background bg-grid">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/generations')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
          <div className="flex-1" />
          <h1 className="font-mono text-lg text-primary">Generation #{generation?.generation_number}</h1>
        </div>
      </header>
      <main className="container px-4 py-6 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <Card variant="stat"><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Status</div><Badge variant={generation?.is_active ? 'glow' : 'outline'}>{generation?.is_active ? 'ACTIVE' : 'ENDED'}</Badge></CardContent></Card>
          <Card variant="stat"><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Total Trades</div><div className="font-mono text-xl">{generation?.total_trades}</div></CardContent></Card>
          <Card variant="stat"><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Total P&L</div><div className={`font-mono text-xl ${(generation?.total_pnl ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>${generation?.total_pnl.toFixed(2)}</div></CardContent></Card>
          <Card variant="stat"><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Max Drawdown</div><div className="font-mono text-xl text-destructive">{((generation?.max_drawdown ?? 0) * 100).toFixed(1)}%</div></CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle className="font-mono text-sm"><History className="h-4 w-4 inline mr-2" />Details</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-4 text-sm"><div><span className="text-muted-foreground">Start Time:</span><div className="font-mono">{generation?.start_time ? new Date(generation.start_time).toLocaleString() : '—'}</div></div><div><span className="text-muted-foreground">End Time:</span><div className="font-mono">{generation?.end_time ? new Date(generation.end_time).toLocaleString() : '—'}</div></div><div><span className="text-muted-foreground">End Reason:</span><Badge variant="outline">{generation?.termination_reason || 'N/A'}</Badge></div><div><span className="text-muted-foreground">Regime:</span><div className="font-mono">{generation?.regime_tag || 'Unknown'}</div></div></CardContent></Card>
      </main>
    </div>
  );
}
