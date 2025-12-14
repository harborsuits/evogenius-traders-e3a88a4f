import { Link, useNavigate } from 'react-router-dom';
import { useGenerationHistory } from '@/hooks/useEvoTraderData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, History, TrendingUp, TrendingDown } from 'lucide-react';

export default function GenerationsPage() {
  const navigate = useNavigate();
  const { data: generations = [], isLoading } = useGenerationHistory(100);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><span className="font-mono text-muted-foreground">Loading...</span></div>;

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
            <History className="h-5 w-5 text-primary" />
            <h1 className="font-mono text-lg text-primary">Generations History</h1>
          </div>
        </div>
      </header>
      <main className="container px-4 py-6">
        <Card>
          <CardHeader><CardTitle className="font-mono text-sm"><History className="h-4 w-4 inline mr-2" />All Generations ({generations.length})</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-card">
                  <tr><th className="text-left py-3 px-2">Gen #</th><th className="text-left py-3 px-2">Status</th><th className="text-left py-3 px-2">Started</th><th className="text-left py-3 px-2">Ended</th><th className="text-right py-3 px-2">Trades</th><th className="text-right py-3 px-2">P&L</th><th className="text-right py-3 px-2">Drawdown</th><th className="text-left py-3 px-2">End Reason</th><th className="py-3 px-2"></th></tr>
                </thead>
                <tbody>
                  {generations.map((gen: any) => (
                    <tr key={gen.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-2 font-mono font-bold">#{gen.generation_number}</td>
                      <td className="py-2 px-2"><Badge variant={gen.is_active ? 'glow' : 'outline'}>{gen.is_active ? 'ACTIVE' : 'ENDED'}</Badge></td>
                      <td className="py-2 px-2 text-xs">{new Date(gen.start_time).toLocaleString()}</td>
                      <td className="py-2 px-2 text-xs">{gen.end_time ? new Date(gen.end_time).toLocaleString() : '—'}</td>
                      <td className="py-2 px-2 text-right font-mono">{gen.total_trades}</td>
                      <td className={`py-2 px-2 text-right font-mono ${gen.total_pnl >= 0 ? 'text-success' : 'text-destructive'}`}>${gen.total_pnl.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono text-destructive">{(gen.max_drawdown * 100).toFixed(1)}%</td>
                      <td className="py-2 px-2"><Badge variant="outline">{gen.termination_reason || '—'}</Badge></td>
                      <td className="py-2 px-2"><Button variant="ghost" size="sm" asChild><Link to={`/generations/${gen.id}`}>View</Link></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
