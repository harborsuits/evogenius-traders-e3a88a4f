import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Save, 
  TrendingUp, 
  Activity, 
  Percent,
  AlertTriangle,
  Loader2,
  RotateCcw,
  BarChart3,
  Clock,
  Zap,
  AlertCircle
} from 'lucide-react';
import { useSystemConfig } from '@/hooks/useSystemConfig';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

// Range Strategy Configuration Interface
export interface RangeStrategyConfig {
  enabled: boolean;
  paper_enabled: boolean;
  live_enabled: boolean;
  // RSI thresholds
  rsi_buy_threshold: number;  // Default: 35
  rsi_sell_threshold: number; // Default: 65
  // Bollinger Bands
  bb_period: number;          // Default: 20
  bb_stddev: number;          // Default: 2.0
  // Regime filter
  max_ema_slope: number;      // Default: 0.0015 (flat trend indicator)
  max_atr_ratio: number;      // Default: 1.5 (avoid volatility spikes)
  min_atr_ratio: number;      // Default: 0.5 (avoid dead markets)
  // Cooldowns
  cooldown_minutes: number;   // Default: 15 per symbol
  paper_cooldown_minutes: number; // Default: 30 per symbol for paper
  force_entry_for_test?: boolean; // Force entry on any move > 0.5% (paper only)
}

export const DEFAULT_RANGE_STRATEGY: RangeStrategyConfig = {
  enabled: true,
  paper_enabled: true,
  live_enabled: false,  // Conservative: off for live by default
  rsi_buy_threshold: 45,   // More permissive: triggers on -1.5% drop
  rsi_sell_threshold: 55,  // More permissive: triggers on +1.5% rise
  bb_period: 20,
  bb_stddev: 2.0,
  max_ema_slope: 0.005,    // More permissive: allow 0.5% slope
  max_atr_ratio: 1.8,      // More permissive
  min_atr_ratio: 0.3,      // More permissive
  cooldown_minutes: 15,
  paper_cooldown_minutes: 5,  // Faster for testing
};

// Trade Flow Watchdog Interface
export interface TradeFlowWatchdogConfig {
  enabled: boolean;
  shadow_threshold_6h: number;    // Default: 500 shadow trades in 6h
  paper_zero_window_hours: number; // Default: 24 (0 paper orders in window)
  auto_enable_drought: boolean;
  auto_enable_range_strategy: boolean;
}

export const DEFAULT_WATCHDOG: TradeFlowWatchdogConfig = {
  enabled: true,
  shadow_threshold_6h: 500,
  paper_zero_window_hours: 24,
  auto_enable_drought: true,
  auto_enable_range_strategy: true,
};

// Threshold slider component - extracted to avoid ref warning
interface ThresholdSliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  icon: React.ReactNode;
  description?: string;
}

function ThresholdSlider({ 
  label, 
  value, 
  onChange, 
  min, 
  max, 
  step, 
  unit,
  icon,
  description,
}: ThresholdSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
        <span className="text-xs font-mono font-medium">
          {value.toFixed(unit === '%' || unit === '' ? (value < 1 ? 4 : 0) : 1)}{unit}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        className="h-1.5"
      />
      {description && (
        <p className="text-[9px] text-muted-foreground/60">{description}</p>
      )}
    </div>
  );
}

// Hook to check starvation status
function useStarvationStatus() {
  return useQuery({
    queryKey: ['starvation-status'],
    queryFn: async () => {
      const now = new Date();
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      // Count shadow trades in last 6h
      const { count: shadowCount } = await supabase
        .from('shadow_trades')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sixHoursAgo.toISOString());
      
      // Count paper orders in last 24h
      const { count: paperCount } = await supabase
        .from('paper_orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', twentyFourHoursAgo.toISOString())
        .eq('status', 'filled');
      
      // Get last paper trade time
      const { data: lastPaper } = await supabase
        .from('paper_orders')
        .select('created_at')
        .eq('status', 'filled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const isStarved = (shadowCount ?? 0) > 500 && (paperCount ?? 0) === 0;
      
      return {
        shadow_trades_6h: shadowCount ?? 0,
        paper_orders_24h: paperCount ?? 0,
        last_paper_trade: lastPaper?.created_at,
        is_starved: isStarved,
      };
    },
    refetchInterval: 60000, // Every minute
  });
}

export function RangeStrategyPanel() {
  const { data: systemConfig, refetch } = useSystemConfig();
  const { data: starvation } = useStarvationStatus();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dirty, setDirty] = useState(false);
  
  // Cast to get range_strategy config
  const configAny = systemConfig as Record<string, unknown> | undefined;
  const savedConfig = (configAny?.range_strategy as RangeStrategyConfig) ?? DEFAULT_RANGE_STRATEGY;
  const savedWatchdog = (configAny?.trade_flow_watchdog as TradeFlowWatchdogConfig) ?? DEFAULT_WATCHDOG;
  
  // Local state for editing
  const [config, setConfig] = useState<RangeStrategyConfig>({ ...DEFAULT_RANGE_STRATEGY, ...savedConfig });
  const [watchdog, setWatchdog] = useState<TradeFlowWatchdogConfig>({ ...DEFAULT_WATCHDOG, ...savedWatchdog });
  
  // Sync from server when config changes
  useEffect(() => {
    const newSavedConfig = (configAny?.range_strategy as RangeStrategyConfig) ?? DEFAULT_RANGE_STRATEGY;
    const newWatchdog = (configAny?.trade_flow_watchdog as TradeFlowWatchdogConfig) ?? DEFAULT_WATCHDOG;
    setConfig({ ...DEFAULT_RANGE_STRATEGY, ...newSavedConfig });
    setWatchdog({ ...DEFAULT_WATCHDOG, ...newWatchdog });
    setDirty(false);
  }, [systemConfig]);
  
  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: currentRow, error: fetchError } = await supabase
        .from('system_config')
        .select('id, config')
        .limit(1)
        .single();
      
      if (fetchError) throw fetchError;
      
      const currentConfig = (currentRow?.config ?? {}) as Record<string, unknown>;
      const updatedConfig = {
        ...currentConfig,
        range_strategy: config,
        trade_flow_watchdog: watchdog,
      };
      
      const { error: updateError } = await supabase
        .from('system_config')
        .update({ config: updatedConfig } as Record<string, unknown>)
        .eq('id', currentRow.id);
      
      if (updateError) throw updateError;
      
      await refetch();
      setDirty(false);
      toast({ title: 'Range Strategy saved', description: 'Changes will apply on next trade cycle' });
    } catch (err) {
      console.error('Failed to save range strategy:', err);
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  
  const handleReset = () => {
    setConfig({ ...DEFAULT_RANGE_STRATEGY });
    setWatchdog({ ...DEFAULT_WATCHDOG });
    setDirty(true);
  };
  
  const handleTestCycle = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('trade-cycle');
      if (error) throw error;
      toast({ 
        title: 'Trade cycle triggered', 
        description: `Decision: ${data?.decision ?? 'unknown'}. Check logs for range strategy evaluation.` 
      });
    } catch (err) {
      console.error('Test cycle failed:', err);
      toast({ title: 'Test failed', description: String(err), variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };
  
  const updateConfig = <K extends keyof RangeStrategyConfig>(key: K, value: RangeStrategyConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };
  
  const updateWatchdog = <K extends keyof TradeFlowWatchdogConfig>(key: K, value: TradeFlowWatchdogConfig[K]) => {
    setWatchdog(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  // Note: ThresholdSlider moved outside component to fix ref warning

  return (
    <div className="space-y-4">
      {/* Starvation Warning Banner */}
      {starvation?.is_starved && (
        <div className="flex items-center gap-2 p-3 bg-destructive/20 border border-destructive/30 rounded-lg animate-pulse">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div className="flex-1">
            <div className="text-sm font-bold text-destructive">SIGNAL STARVATION</div>
            <div className="text-[10px] text-destructive/80">
              {starvation.shadow_trades_6h} shadow trades in 6h, but 0 paper orders in 24h
            </div>
          </div>
        </div>
      )}
      
      {/* Trade Flow Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/30 rounded-lg p-2 text-center">
          <div className="text-[10px] text-muted-foreground">Shadow 6h</div>
          <div className="text-lg font-mono font-bold">{starvation?.shadow_trades_6h ?? 0}</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-2 text-center">
          <div className="text-[10px] text-muted-foreground">Paper 24h</div>
          <div className={cn(
            "text-lg font-mono font-bold",
            (starvation?.paper_orders_24h ?? 0) === 0 ? "text-destructive" : "text-emerald-500"
          )}>
            {starvation?.paper_orders_24h ?? 0}
          </div>
        </div>
        <div className="bg-muted/30 rounded-lg p-2 text-center">
          <div className="text-[10px] text-muted-foreground">Last Trade</div>
          <div className="text-xs font-mono">
            {starvation?.last_paper_trade 
              ? formatDistanceToNow(new Date(starvation.last_paper_trade), { addSuffix: true })
              : 'Never'
            }
          </div>
        </div>
      </div>
      
      {/* Master Enable Toggle */}
      <div className="flex items-center justify-between p-2 bg-primary/10 rounded-lg border border-primary/20">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <div>
            <div className="text-xs font-medium">Range Strategy</div>
            <div className="text-[9px] text-muted-foreground">Bollinger Mean Reversion for flat markets</div>
          </div>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(v) => updateConfig('enabled', v)}
        />
      </div>
      
      {/* Paper/Live Toggles */}
      <div className="grid grid-cols-2 gap-2">
        <div className={cn(
          "flex items-center justify-between p-2 rounded-lg border",
          config.paper_enabled ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/20"
        )}>
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            <span className="text-[10px]">Paper Mode</span>
          </div>
          <Switch
            checked={config.paper_enabled}
            onCheckedChange={(v) => updateConfig('paper_enabled', v)}
            disabled={!config.enabled}
          />
        </div>
        <div className={cn(
          "flex items-center justify-between p-2 rounded-lg border",
          config.live_enabled ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/20"
        )}>
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3" />
            <span className="text-[10px]">Live Mode</span>
          </div>
          <Switch
            checked={config.live_enabled}
            onCheckedChange={(v) => updateConfig('live_enabled', v)}
            disabled={!config.enabled}
          />
        </div>
      </div>
      
      {/* Force Entry Toggle for Testing */}
      <div className={cn(
        "flex items-center justify-between p-2 rounded-lg border",
        config.force_entry_for_test ? "bg-amber-500/20 border-amber-500/50" : "bg-muted/20 border-muted/30"
      )}>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <div>
            <div className="text-xs font-medium">Force Test Entry</div>
            <div className="text-[9px] text-muted-foreground">Paper only: Force BUY on any 0.5%+ move (proves plumbing works)</div>
          </div>
        </div>
        <Switch
          checked={config.force_entry_for_test ?? false}
          onCheckedChange={(v) => updateConfig('force_entry_for_test', v)}
          disabled={!config.enabled || !config.paper_enabled}
        />
      </div>
      
      {/* Strategy Parameters */}
      <div className={cn(
        "space-y-3 p-3 rounded-lg border",
        config.enabled ? "bg-background" : "bg-muted/20 opacity-60"
      )}>
        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Entry Thresholds
        </div>
        
        <ThresholdSlider
          label="RSI Buy Threshold"
          value={config.rsi_buy_threshold}
          onChange={(v) => updateConfig('rsi_buy_threshold', v)}
          min={20}
          max={45}
          step={1}
          unit=""
          icon={<TrendingUp className="h-3 w-3 text-emerald-500" />}
          description="BUY when RSI < this value (oversold)"
        />
        
        <ThresholdSlider
          label="RSI Sell Threshold"
          value={config.rsi_sell_threshold}
          onChange={(v) => updateConfig('rsi_sell_threshold', v)}
          min={55}
          max={80}
          step={1}
          unit=""
          icon={<TrendingUp className="h-3 w-3 text-red-500" />}
          description="SELL when RSI > this value (overbought)"
        />
        
        <ThresholdSlider
          label="Max EMA Slope"
          value={config.max_ema_slope}
          onChange={(v) => updateConfig('max_ema_slope', v)}
          min={0.0005}
          max={0.003}
          step={0.0001}
          unit=""
          icon={<Activity className="h-3 w-3 text-blue-500" />}
          description="Only trade when EMA slope is flat (range market)"
        />
        
        <ThresholdSlider
          label="Max ATR Ratio"
          value={config.max_atr_ratio}
          onChange={(v) => updateConfig('max_atr_ratio', v)}
          min={1.0}
          max={2.0}
          step={0.1}
          unit=""
          icon={<AlertTriangle className="h-3 w-3 text-amber-500" />}
          description="Skip during volatility spikes"
        />
        
        <ThresholdSlider
          label="Paper Cooldown"
          value={config.paper_cooldown_minutes}
          onChange={(v) => updateConfig('paper_cooldown_minutes', v)}
          min={10}
          max={60}
          step={5}
          unit=" min"
          icon={<Clock className="h-3 w-3 text-muted-foreground" />}
          description="Minutes between paper trades per symbol"
        />
      </div>
      
      {/* Trade Flow Watchdog */}
      <div className="space-y-2">
        <div className="flex items-center justify-between p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <div>
              <div className="text-xs font-medium">Trade Flow Watchdog</div>
              <div className="text-[9px] text-muted-foreground">Auto-detect and fix signal starvation</div>
            </div>
          </div>
          <Switch
            checked={watchdog.enabled}
            onCheckedChange={(v) => updateWatchdog('enabled', v)}
          />
        </div>
        
        {watchdog.enabled && (
          <div className="grid grid-cols-2 gap-2 p-2 bg-muted/20 rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={watchdog.auto_enable_drought}
                onChange={(e) => updateWatchdog('auto_enable_drought', e.target.checked)}
                className="rounded border-muted-foreground/30"
              />
              <span className="text-[10px]">Auto-enable Drought</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={watchdog.auto_enable_range_strategy}
                onChange={(e) => updateWatchdog('auto_enable_range_strategy', e.target.checked)}
                className="rounded border-muted-foreground/30"
              />
              <span className="text-[10px]">Auto-enable Range</span>
            </label>
          </div>
        )}
      </div>
      
      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-[10px] h-8"
          onClick={handleReset}
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="text-[10px] h-8"
          disabled={testing}
          onClick={handleTestCycle}
        >
          {testing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
          Test Cycle
        </Button>
        <Button
          size="sm"
          className="flex-1 text-[10px] h-8"
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          {dirty ? 'Save' : 'Saved'}
        </Button>
      </div>
    </div>
  );
}
