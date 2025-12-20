import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Users, TrendingUp, Coins } from 'lucide-react';

type MetricType = 'agents' | 'fills' | 'symbols';

interface DataPoint {
  hour: number;
  prev?: number;
  current?: number;
}

export function GenerationComparison() {
  const [metric, setMetric] = useState<MetricType>('agents');

  const { data, isLoading } = useQuery({
    queryKey: ['generation-comparison', metric],
    queryFn: async () => {
      // Get current generation from system state
      const { data: sysState } = await supabase
        .from('system_state')
        .select('current_generation_id')
        .single();

      if (!sysState?.current_generation_id) {
        return { points: [], prevGen: null, currentGen: null, prevHours: 0, currentHours: 0 };
      }

      // Fetch current generation details
      const { data: currentGenData } = await supabase
        .from('generations')
        .select('id, generation_number, start_time, end_time')
        .eq('id', sysState.current_generation_id)
        .single();

      if (!currentGenData) {
        return { points: [], prevGen: null, currentGen: null, prevHours: 0, currentHours: 0 };
      }

      // Fetch previous generation (generation_number - 1)
      const { data: prevGenData } = await supabase
        .from('generations')
        .select('id, generation_number, start_time, end_time')
        .eq('generation_number', currentGenData.generation_number - 1)
        .single();

      const currentGen = currentGenData;
      const prevGen = prevGenData;

      const prevHours = prevGen?.end_time 
        ? (new Date(prevGen.end_time).getTime() - new Date(prevGen.start_time).getTime()) / 3600000
        : prevGen?.start_time
        ? (Date.now() - new Date(prevGen.start_time).getTime()) / 3600000
        : 0;
      const currentHours = (Date.now() - new Date(currentGen.start_time).getTime()) / 3600000;

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
            if (!hourlyData.has(hourBucket)) hourlyData.set(hourBucket, new Set<string>());
            
            const key = metric === 'agents' ? String(order.agent_id) : String(order.symbol);
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

      const [prevCurve, currentCurve] = await Promise.all([
        prevGen ? buildCurve(prevGen.id, prevGen.start_time) : Promise.resolve([]),
        buildCurve(currentGen.id, currentGen.start_time),
      ]);

      // Merge into unified points
      const allHours = new Set<number>();
      prevCurve.forEach(p => allHours.add(p.hour));
      currentCurve.forEach(p => allHours.add(p.hour));

      const prevMap = new Map(prevCurve.map(p => [p.hour, p.value]));
      const currentMap = new Map(currentCurve.map(p => [p.hour, p.value]));

      // Fill in cumulative values
      const sortedAllHours = [...allHours].sort((a, b) => a - b);
      const points: DataPoint[] = [];
      let lastPrev = 0;
      let lastCurrent = 0;

      sortedAllHours.forEach(hour => {
        if (prevMap.has(hour)) lastPrev = prevMap.get(hour)!;
        if (currentMap.has(hour)) lastCurrent = currentMap.get(hour)!;
        points.push({
          hour,
          prev: prevGen && hour <= prevHours ? lastPrev : undefined,
          current: hour <= currentHours ? lastCurrent : undefined,
        });
      });

      return { 
        points, 
        prevGen: prevGen ? { number: prevGen.generation_number } : null,
        currentGen: { number: currentGen.generation_number },
        prevHours: Math.round(prevHours), 
        currentHours: Math.round(currentHours * 10) / 10 
      };
    },
    refetchInterval: 60000,
  });

  const metricLabel = metric === 'agents' ? 'Unique Agents' 
    : metric === 'fills' ? 'Cumulative Fills' 
    : 'Unique Symbols';

  const prevGenLabel = data?.prevGen ? `Gen ${data.prevGen.number}` : 'Previous';
  const currentGenLabel = data?.currentGen ? `Gen ${data.currentGen.number}` : 'Current';
  const titleLabel = data?.prevGen && data?.currentGen 
    ? `GEN ${data.prevGen.number} VS ${data.currentGen.number}`
    : 'GENERATION COMPARISON';

  return (
    <div className="h-full flex flex-col p-3 gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-mono">
          {data?.prevGen ? `${prevGenLabel}: ${data.prevHours || 0}h` : ''} 
          {data?.prevGen ? ' | ' : ''}
          {currentGenLabel}: {data?.currentHours || 0}h
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
              {data?.prevGen && (
                <Line 
                  type="stepAfter" 
                  dataKey="prev" 
                  name={prevGenLabel} 
                  stroke="hsl(var(--muted-foreground))" 
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              )}
              <Line 
                type="stepAfter" 
                dataKey="current" 
                name={currentGenLabel} 
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