import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Users, TrendingUp, Coins } from 'lucide-react';

type MetricType = 'agents' | 'fills' | 'symbols';

interface DataPoint {
  hour: number;
  gen10?: number;
  gen11?: number;
}

export function GenerationComparison() {
  const [metric, setMetric] = useState<MetricType>('agents');

  const { data, isLoading } = useQuery({
    queryKey: ['generation-comparison', metric],
    queryFn: async () => {
      // Fetch Gen 10 and Gen 11 info
      const { data: generations } = await supabase
        .from('generations')
        .select('id, generation_number, start_time, end_time')
        .in('generation_number', [10, 11])
        .order('generation_number');

      if (!generations || generations.length < 2) return { points: [], gen10Hours: 0, gen11Hours: 0 };

      const gen10 = generations.find(g => g.generation_number === 10);
      const gen11 = generations.find(g => g.generation_number === 11);
      if (!gen10 || !gen11) return { points: [], gen10Hours: 0, gen11Hours: 0 };

      const gen10Hours = gen10.end_time 
        ? (new Date(gen10.end_time).getTime() - new Date(gen10.start_time).getTime()) / 3600000
        : 0;
      const gen11Hours = (Date.now() - new Date(gen11.start_time).getTime()) / 3600000;

      // Build participation curves based on metric
      const buildCurve = async (genId: string, startTime: string) => {
        const { data: orders } = await supabase
          .from('paper_orders')
          .select('agent_id, symbol, filled_at, created_at, tags')
          .eq('generation_id', genId)
          .eq('status', 'filled')
          .order('filled_at');

        if (!orders) return [];

        const startTs = new Date(startTime).getTime();
        
        // Filter out test_mode orders
        const learnableOrders = orders.filter(o => {
          const tags = o.tags as Record<string, unknown> | null;
          return !tags?.test_mode;
        });

        if (metric === 'fills') {
          // For fills: count raw fills per hour, then cumulative sum
          const hourlyFills = new Map<number, number>();
          
          learnableOrders.forEach(order => {
            const ts = order.filled_at ?? order.created_at;
            if (!ts) return;
            const hourBucket = Math.floor((new Date(ts).getTime() - startTs) / 3600000);
            hourlyFills.set(hourBucket, (hourlyFills.get(hourBucket) ?? 0) + 1);
          });

          const sortedHours = [...hourlyFills.keys()].sort((a, b) => a - b);
          const cumulative: { hour: number; value: number }[] = [];
          let runningTotal = 0;

          sortedHours.forEach(hour => {
            runningTotal += hourlyFills.get(hour)!;
            cumulative.push({ hour, value: runningTotal });
          });

          return cumulative;
        } else {
          // For agents/symbols: track unique values cumulatively
          const hourlyData = new Map<number, Set<string>>();

          learnableOrders.forEach(order => {
            const ts = order.filled_at ?? order.created_at;
            if (!ts) return;
            const hourBucket = Math.floor((new Date(ts).getTime() - startTs) / 3600000);
            if (!hourlyData.has(hourBucket)) hourlyData.set(hourBucket, new Set());
            
            const key = metric === 'agents' ? order.agent_id : order.symbol;
            hourlyData.get(hourBucket)!.add(key);
          });

          const sortedHours = [...hourlyData.keys()].sort((a, b) => a - b);
          const cumulative: { hour: number; value: number }[] = [];
          const seenAll = new Set<string>();

          sortedHours.forEach(hour => {
            hourlyData.get(hour)!.forEach(v => seenAll.add(v));
            cumulative.push({ hour, value: seenAll.size });
          });

          return cumulative;
        }
      };

      const [gen10Curve, gen11Curve] = await Promise.all([
        buildCurve(gen10.id, gen10.start_time),
        buildCurve(gen11.id, gen11.start_time),
      ]);

      // Merge into unified points
      const allHours = new Set<number>();
      gen10Curve.forEach(p => allHours.add(p.hour));
      gen11Curve.forEach(p => allHours.add(p.hour));

      const gen10Map = new Map(gen10Curve.map(p => [p.hour, p.value]));
      const gen11Map = new Map(gen11Curve.map(p => [p.hour, p.value]));

      // Fill in cumulative values
      const sortedAllHours = [...allHours].sort((a, b) => a - b);
      const points: DataPoint[] = [];
      let lastGen10 = 0;
      let lastGen11 = 0;

      sortedAllHours.forEach(hour => {
        if (gen10Map.has(hour)) lastGen10 = gen10Map.get(hour)!;
        if (gen11Map.has(hour)) lastGen11 = gen11Map.get(hour)!;
        points.push({
          hour,
          gen10: hour <= gen10Hours ? lastGen10 : undefined,
          gen11: hour <= gen11Hours ? lastGen11 : undefined,
        });
      });

      return { points, gen10Hours: Math.round(gen10Hours), gen11Hours: Math.round(gen11Hours * 10) / 10 };
    },
    refetchInterval: 60000,
  });

  const metricLabel = metric === 'agents' ? 'Unique Agents' 
    : metric === 'fills' ? 'Cumulative Fills' 
    : 'Unique Symbols';

  return (
    <div className="h-full flex flex-col p-3 gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-mono">
          Gen 10: {data?.gen10Hours || 0}h | Gen 11: {data?.gen11Hours || 0}h
        </div>
        <ToggleGroup type="single" value={metric} onValueChange={(v) => v && setMetric(v as MetricType)} size="sm">
          <ToggleGroupItem value="agents" className="text-xs px-2">
            <Users className="h-3 w-3 mr-1" />
            Agents
          </ToggleGroupItem>
          <ToggleGroupItem value="fills" className="text-xs px-2">
            <TrendingUp className="h-3 w-3 mr-1" />
            Fills
          </ToggleGroupItem>
          <ToggleGroupItem value="symbols" className="text-xs px-2">
            <Coins className="h-3 w-3 mr-1" />
            Symbols
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
            Loading comparison...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.points || []} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="hour" 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => `${v}h`}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '11px',
                }}
                labelFormatter={(v) => `Hour ${v}`}
              />
              <Legend 
                wrapperStyle={{ fontSize: '10px' }}
                formatter={(value) => <span className="text-xs">{value}</span>}
              />
              <Line 
                type="stepAfter" 
                dataKey="gen10" 
                name="Gen 10" 
                stroke="hsl(var(--muted-foreground))" 
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line 
                type="stepAfter" 
                dataKey="gen11" 
                name="Gen 11" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="text-[10px] text-muted-foreground text-center font-mono">
        {metricLabel} over time (hours since generation start)
      </div>
    </div>
  );
}
