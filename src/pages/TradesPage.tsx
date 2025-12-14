import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePaperAccount } from '@/hooks/usePaperTrading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, 
  Activity, 
  Filter, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Clock,
  X,
  BarChart3,
  Download
} from 'lucide-react';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

type DateRangePreset = '24h' | '7d' | '30d' | 'ytd' | 'all';
type ChartMetric = 'count' | 'volume';

function getPresetDates(preset: DateRangePreset): { start: Date | null; end: Date | null } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  
  switch (preset) {
    case '24h':
      return { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: endOfToday };
    case '7d':
      return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: endOfToday };
    case '30d':
      return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: endOfToday };
    case 'ytd':
      return { start: new Date(now.getFullYear(), 0, 1), end: endOfToday };
    case 'all':
    default:
      return { start: null, end: null };
  }
}

function formatDateForInput(date: Date | null): string {
  if (!date) return '';
  return date.toISOString().split('T')[0];
}

function parseDateInput(value: string, isEndDate: boolean = false): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  if (isEndDate) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

// Determine bucket granularity based on date range
function getBucketGranularity(startDate: Date | null, endDate: Date | null): 'hourly' | 'daily' | 'weekly' {
  if (!startDate || !endDate) return 'daily'; // Default for "all time"
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  
  if (diffDays <= 1) return 'hourly';
  if (diffDays <= 7) return 'daily';
  return 'weekly';
}

// Get bucket key for a timestamp
function getBucketKey(timestamp: Date, granularity: 'hourly' | 'daily' | 'weekly'): string {
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, '0');
  const day = String(timestamp.getDate()).padStart(2, '0');
  const hour = String(timestamp.getHours()).padStart(2, '0');
  
  switch (granularity) {
    case 'hourly':
      return `${year}-${month}-${day} ${hour}:00`;
    case 'daily':
      return `${year}-${month}-${day}`;
    case 'weekly':
      // Get week start (Sunday)
      const weekStart = new Date(timestamp);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

// Format bucket label for display
function formatBucketLabel(key: string, granularity: 'hourly' | 'daily' | 'weekly'): string {
  if (granularity === 'hourly') {
    // "2024-01-15 14:00" -> "14:00"
    return key.split(' ')[1] || key;
  }
  if (granularity === 'weekly') {
    // Show as "Jan 15"
    const date = new Date(key);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  // Daily: "2024-01-15" -> "Jan 15"
  const date = new Date(key);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TradesPage() {
  const navigate = useNavigate();
  const { data: account, isLoading } = usePaperAccount();
  const [symbolFilter, setSymbolFilter] = useState<string>('');
  const [sideFilter, setSideFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [activePreset, setActivePreset] = useState<DateRangePreset>('all');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('count');
  
  // Fetch fills with order info
  const { data: fills = [] } = useQuery({
    queryKey: ['all-fills', account?.id],
    queryFn: async () => {
      if (!account?.id) return [];
      
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('id, agent_id, generation_id, side, symbol, status, created_at')
        .eq('account_id', account.id);
      
      if (!orders?.length) return [];
      
      const orderMap = new Map(orders.map(o => [o.id, o]));
      
      const { data } = await supabase
        .from('paper_fills')
        .select('*')
        .in('order_id', orders.map(o => o.id))
        .order('timestamp', { ascending: false })
        .limit(500);
      
      return (data ?? []).map(fill => ({
        ...fill,
        order: orderMap.get(fill.order_id),
      }));
    },
    enabled: !!account?.id,
  });

  const handlePreset = (preset: DateRangePreset) => {
    setActivePreset(preset);
    const { start, end } = getPresetDates(preset);
    setStartDate(start);
    setEndDate(end);
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(parseDateInput(value, false));
    setActivePreset('all');
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(parseDateInput(value, true));
    setActivePreset('all');
  };

  const clearDateFilter = () => {
    setStartDate(null);
    setEndDate(null);
    setActivePreset('all');
  };
  
  // Filter fills with date range
  const filteredFills = useMemo(() => {
    return fills.filter((fill: any) => {
      if (symbolFilter && !fill.symbol.toLowerCase().includes(symbolFilter.toLowerCase())) return false;
      if (sideFilter !== 'all' && fill.side !== sideFilter) return false;
      const fillDate = new Date(fill.timestamp);
      if (startDate && fillDate < startDate) return false;
      if (endDate && fillDate > endDate) return false;
      return true;
    });
  }, [fills, symbolFilter, sideFilter, startDate, endDate]);

  // Build chart data from filtered fills
  const chartData = useMemo(() => {
    if (filteredFills.length === 0) return [];
    
    const granularity = getBucketGranularity(startDate, endDate);
    const buckets = new Map<string, { count: number; volume: number }>();
    
    // Aggregate fills into buckets
    filteredFills.forEach((fill: any) => {
      const timestamp = new Date(fill.timestamp);
      const key = getBucketKey(timestamp, granularity);
      
      if (!buckets.has(key)) {
        buckets.set(key, { count: 0, volume: 0 });
      }
      
      const bucket = buckets.get(key)!;
      bucket.count += 1;
      bucket.volume += fill.qty * fill.price;
    });
    
    // Sort by key (date string) and format for chart
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => ({
        label: formatBucketLabel(key, granularity),
        count: data.count,
        volume: Math.round(data.volume),
      }));
  }, [filteredFills, startDate, endDate]);

  // Compute summary stats from filtered data
  const totalFills = filteredFills.length;
  const buyFills = filteredFills.filter((f: any) => f.side === 'buy');
  const sellFills = filteredFills.filter((f: any) => f.side === 'sell');
  const totalVolume = filteredFills.reduce((sum: number, f: any) => sum + (f.qty * f.price), 0);
  const totalFees = filteredFills.reduce((sum: number, f: any) => sum + f.fee, 0);

  // CSV Export function
  const exportToCSV = () => {
    if (filteredFills.length === 0) return;

    // CSV header
    const headers = ['timestamp', 'side', 'symbol', 'qty', 'price', 'value', 'fee', 'order_id', 'agent_id', 'generation_id'];
    
    // Escape CSV values
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build rows
    const rows = filteredFills.map((fill: any) => [
      new Date(fill.timestamp).toISOString(),
      fill.side,
      fill.symbol,
      fill.qty,
      fill.price,
      (fill.qty * fill.price).toFixed(2),
      fill.fee,
      fill.order_id || '',
      fill.order?.agent_id || '',
      fill.order?.generation_id || '',
    ].map(escapeCSV).join(','));

    // Combine header and rows
    const csvContent = [headers.join(','), ...rows].join('\n');
    
    // Generate filename with date info
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const rangeLabel = activePreset !== 'all' ? `_${activePreset}` : '';
    const filename = `trades_fills${rangeLabel}_${timestamp}.csv`;

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <div className="text-muted-foreground font-mono">Loading trades...</div>
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
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="font-mono text-lg text-primary">Trades & Fills</h1>
          </div>
        </div>
      </header>
      
      <main className="container px-4 py-6 space-y-6">
        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Activity className="h-4 w-4" />
                <span className="text-xs">Total Fills</span>
              </div>
              <div className="font-mono text-2xl font-bold">{totalFills}</div>
            </CardContent>
          </Card>
          
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-xs">Buys</span>
              </div>
              <div className="font-mono text-2xl text-success">{buyFills.length}</div>
            </CardContent>
          </Card>
          
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingDown className="h-4 w-4 text-destructive" />
                <span className="text-xs">Sells</span>
              </div>
              <div className="font-mono text-2xl text-destructive">{sellFills.length}</div>
            </CardContent>
          </Card>
          
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs">Volume</span>
              </div>
              <div className="font-mono text-2xl">${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </CardContent>
          </Card>
        </div>
        
        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 flex-wrap items-center">
              <Input 
                placeholder="Search symbol..."
                value={symbolFilter}
                onChange={e => setSymbolFilter(e.target.value)}
                className="w-48"
              />
              <Select value={sideFilter} onValueChange={setSideFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Side" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sides</SelectItem>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-4 flex-wrap items-center">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Start</span>
                <Input
                  type="date"
                  value={formatDateForInput(startDate)}
                  onChange={e => handleStartDateChange(e.target.value)}
                  className="w-36"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">End</span>
                <Input
                  type="date"
                  value={formatDateForInput(endDate)}
                  onChange={e => handleEndDateChange(e.target.value)}
                  className="w-36"
                />
              </div>
              
              <div className="flex gap-1">
                {(['24h', '7d', '30d', 'ytd', 'all'] as DateRangePreset[]).map(preset => (
                  <Button
                    key={preset}
                    variant={activePreset === preset ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePreset(preset)}
                    className="text-xs px-2 h-8"
                  >
                    {preset.toUpperCase()}
                  </Button>
                ))}
              </div>
              
              {(startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDateFilter}
                  className="text-xs h-8"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
              
              <div className="flex-1" />
              <span className="text-sm text-muted-foreground">
                {filteredFills.length} fills • ${totalFees.toFixed(2)} fees
              </span>
            </div>
          </CardContent>
        </Card>
        
        {/* Fills Table with Chart */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Execution History
            </CardTitle>
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportToCSV}
                    disabled={filteredFills.length === 0}
                    className="text-xs h-8"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Export CSV
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {filteredFills.length === 0 
                    ? 'No data to export' 
                    : `Export ${filteredFills.length} fills to CSV`}
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Timeline Chart */}
            <div className="border border-border rounded-lg p-4 bg-muted/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BarChart3 className="h-4 w-4" />
                  <span>Activity Timeline</span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant={chartMetric === 'count' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChartMetric('count')}
                    className="text-xs px-2 h-6"
                  >
                    Fills
                  </Button>
                  <Button
                    variant={chartMetric === 'volume' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChartMetric('volume')}
                    className="text-xs px-2 h-6"
                  >
                    Volume
                  </Button>
                </div>
              </div>
              
              {chartData.length > 0 ? (
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis 
                        dataKey="label" 
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={val => chartMetric === 'volume' ? `$${val}` : val}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number) => [
                          chartMetric === 'volume' ? `$${value.toLocaleString()}` : value,
                          chartMetric === 'volume' ? 'Volume' : 'Fills'
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey={chartMetric}
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
                        activeDot={{ r: 5, fill: 'hsl(var(--primary))' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
                  No data in range
                </div>
              )}
            </div>

            {/* Table */}
            <ScrollArea className="h-[400px]">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border sticky top-0 bg-card">
                  <tr>
                    <th className="text-left py-3 px-2">Timestamp</th>
                    <th className="text-left py-3 px-2">Side</th>
                    <th className="text-left py-3 px-2">Symbol</th>
                    <th className="text-right py-3 px-2">Qty</th>
                    <th className="text-right py-3 px-2">Price</th>
                    <th className="text-right py-3 px-2">Value</th>
                    <th className="text-right py-3 px-2">Fee</th>
                    <th className="text-left py-3 px-2">Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFills.map((fill: any) => (
                    <tr key={fill.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {new Date(fill.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant={fill.side === 'buy' ? 'success' : 'danger'}>
                          {fill.side.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 font-mono">{fill.symbol}</td>
                      <td className="py-2 px-2 text-right font-mono">{fill.qty.toFixed(6)}</td>
                      <td className="py-2 px-2 text-right font-mono">${fill.price.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono">
                        ${(fill.qty * fill.price).toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-muted-foreground">
                        ${fill.fee.toFixed(4)}
                      </td>
                      <td className="py-2 px-2 font-mono text-xs">
                        {fill.order?.agent_id ? (
                          <Link 
                            to={`/agents/${fill.order.agent_id}`}
                            className="text-primary hover:underline"
                          >
                            {fill.order.agent_id.slice(0, 8)}
                          </Link>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                  {filteredFills.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-muted-foreground">
                        No fills recorded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
