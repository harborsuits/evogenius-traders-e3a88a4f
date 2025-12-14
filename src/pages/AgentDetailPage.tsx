import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Dna, Activity, TrendingUp } from 'lucide-react';

export default function AgentDetailPage() {
  const navigate = useNavigate();
  const { agentId } = useParams();
  
  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent-detail', agentId],
    queryFn: async () => {
      const { data } = await supabase.from('agents').select('*').eq('id', agentId).single();
      return data;
    },
    enabled: !!agentId,
  });
  
  const { data: performance } = useQuery({
    queryKey: ['agent-performance', agentId],
    queryFn: async () => {
      const { data } = await supabase.from('performance').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!agentId,
  });

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><span className="font-mono text-muted-foreground">Loading...</span></div>;

  return (
    <div className="min-h-screen bg-background bg-grid">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/agents')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
          <div className="flex-1" />
          <h1 className="font-mono text-lg text-primary">Agent {agentId?.slice(0, 8)}</h1>
        </div>
      </header>
      <main className="container px-4 py-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <Card variant="stat"><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Strategy</div><div className="font-mono text-lg">{agent?.strategy_template}</div></CardContent></Card>
          <Card variant="stat"><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Status</div><Badge>{agent?.status}</Badge>{agent?.is_elite && <span className="text-yellow-500 ml-2">★ Elite</span>}</CardContent></Card>
          <Card variant="stat"><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Fitness</div><div className="font-mono text-lg">{performance?.fitness_score ? `${(performance.fitness_score * 100).toFixed(1)}%` : 'N/A'}</div></CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle className="font-mono text-sm"><Dna className="h-4 w-4 inline mr-2" />Genes</CardTitle></CardHeader><CardContent><pre className="text-xs font-mono bg-muted/30 p-4 rounded overflow-auto">{JSON.stringify(agent?.genes, null, 2)}</pre></CardContent></Card>
      </main>
    </div>
  );
}
