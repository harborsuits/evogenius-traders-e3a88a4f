import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Save, 
  RefreshCw, 
  TrendingUp, 
  Activity, 
  Percent,
  AlertTriangle,
  Loader2,
  RotateCcw
} from 'lucide-react';
import { useSystemConfig } from '@/hooks/useSystemConfig';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Default thresholds matching trade-cycle constants
const DEFAULT_THRESHOLDS = {
  baseline: {
    trend_threshold: 0.005,
    pullback_pct: 5.0,
    min_confidence: 0.45,
    vol_contraction: 1.3,
  },
  drought: {
    trend_threshold: 0.002,
    pullback_pct: 8.0,
    min_confidence: 0.40,
    vol_contraction: 1.6,
  },
};

interface ThresholdConfig {
  trend_threshold: number;
  pullback_pct: number;
  min_confidence: number;
  vol_contraction: number;
}

interface StrategyThresholdsConfig {
  use_config_thresholds?: boolean;
  baseline?: Partial<ThresholdConfig>;
  drought?: Partial<ThresholdConfig>;
}

export function StrategyThresholdsEditor() {
  const { data: systemConfig, refetch } = useSystemConfig();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  
  // Cast to get strategy_thresholds
  const configAny = systemConfig as Record<string, unknown> | undefined;
  const savedConfig = (configAny?.strategy_thresholds as StrategyThresholdsConfig) ?? {};
  
  // Local state for editing
  const [useConfigThresholds, setUseConfigThresholds] = useState(savedConfig.use_config_thresholds ?? false);
  const [baseline, setBaseline] = useState<ThresholdConfig>({
    ...DEFAULT_THRESHOLDS.baseline,
    ...savedConfig.baseline,
  });
  const [drought, setDrought] = useState<ThresholdConfig>({
    ...DEFAULT_THRESHOLDS.drought,
    ...savedConfig.drought,
  });
  
  // Sync from server when config changes
  useEffect(() => {
    const newSavedConfig = (configAny?.strategy_thresholds as StrategyThresholdsConfig) ?? {};
    setUseConfigThresholds(newSavedConfig.use_config_thresholds ?? false);
    setBaseline({
      ...DEFAULT_THRESHOLDS.baseline,
      ...newSavedConfig.baseline,
    });
    setDrought({
      ...DEFAULT_THRESHOLDS.drought,
      ...newSavedConfig.drought,
    });
    setDirty(false);
  }, [systemConfig]);
  
  const handleSave = async () => {
    setSaving(true);
    try {
      // Fetch current config
      const { data: currentRow, error: fetchError } = await supabase
        .from('system_config')
        .select('id, config')
        .limit(1)
        .single();
      
      if (fetchError) throw fetchError;
      
      const currentConfig = (currentRow?.config ?? {}) as Record<string, unknown>;
      const updatedConfig = {
        ...currentConfig,
        strategy_thresholds: {
          use_config_thresholds: useConfigThresholds,
          baseline: {
            trend_threshold: baseline.trend_threshold,
            pullback_pct: baseline.pullback_pct,
            min_confidence: baseline.min_confidence,
            vol_contraction: baseline.vol_contraction,
          },
          drought: {
            trend_threshold: drought.trend_threshold,
            pullback_pct: drought.pullback_pct,
            min_confidence: drought.min_confidence,
            vol_contraction: drought.vol_contraction,
          },
        },
      };
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await supabase
        .from('system_config')
        .update({ config: updatedConfig } as any)
        .eq('id', currentRow.id);
      
      if (updateError) throw updateError;
      
      await refetch();
      setDirty(false);
      toast({ title: 'Thresholds saved', description: 'Changes will apply on next trade cycle' });
    } catch (err) {
      console.error('Failed to save thresholds:', err);
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  
  const handleReset = () => {
    setBaseline({ ...DEFAULT_THRESHOLDS.baseline });
    setDrought({ ...DEFAULT_THRESHOLDS.drought });
    setDirty(true);
  };
  
  const updateBaseline = (key: keyof ThresholdConfig, value: number) => {
    setBaseline(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };
  
  const updateDrought = (key: keyof ThresholdConfig, value: number) => {
    setDrought(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const ThresholdSlider = ({ 
    label, 
    value, 
    onChange, 
    min, 
    max, 
    step, 
    unit,
    icon,
    description,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min: number;
    max: number;
    step: number;
    unit: string;
    icon: React.ReactNode;
    description?: string;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
        <span className="text-xs font-mono font-medium">
          {value.toFixed(unit === '%' ? 1 : 4)}{unit}
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

  return (
    <div className="space-y-4">
      {/* Enable toggle */}
      <div className="flex items-center justify-between p-2 bg-muted/20 rounded-lg">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <div>
            <div className="text-xs font-medium">Use Custom Thresholds</div>
            <div className="text-[9px] text-muted-foreground">Override hardcoded values in trade-cycle</div>
          </div>
        </div>
        <Switch
          checked={useConfigThresholds}
          onCheckedChange={(v) => { setUseConfigThresholds(v); setDirty(true); }}
        />
      </div>
      
      {!useConfigThresholds && (
        <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-[10px] text-amber-500">
            Using hardcoded thresholds. Enable above to use these values.
          </span>
        </div>
      )}
      
      {/* Baseline thresholds */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px]">BASELINE</Badge>
          <span className="text-[10px] text-muted-foreground">Normal market conditions</span>
        </div>
        <div className={cn(
          "space-y-3 p-3 rounded-lg border",
          useConfigThresholds ? "bg-background" : "bg-muted/20 opacity-60"
        )}>
          <ThresholdSlider
            label="Trend Min Slope"
            value={baseline.trend_threshold}
            onChange={(v) => updateBaseline('trend_threshold', v)}
            min={0.001}
            max={0.01}
            step={0.0005}
            unit=""
            icon={<TrendingUp className="h-3 w-3 text-blue-500" />}
            description="EMA50 slope required for trend signal"
          />
          <ThresholdSlider
            label="Max Pullback"
            value={baseline.pullback_pct}
            onChange={(v) => updateBaseline('pullback_pct', v)}
            min={1}
            max={15}
            step={0.5}
            unit="%"
            icon={<Percent className="h-3 w-3 text-emerald-500" />}
            description="Max 24h change to qualify as pullback"
          />
          <ThresholdSlider
            label="Min Confidence"
            value={baseline.min_confidence}
            onChange={(v) => updateBaseline('min_confidence', v)}
            min={0.3}
            max={0.8}
            step={0.05}
            unit=""
            icon={<Activity className="h-3 w-3 text-amber-500" />}
            description="Minimum confidence score to execute"
          />
          <ThresholdSlider
            label="Max Vol (ATR)"
            value={baseline.vol_contraction}
            onChange={(v) => updateBaseline('vol_contraction', v)}
            min={1.0}
            max={2.0}
            step={0.1}
            unit=""
            icon={<AlertTriangle className="h-3 w-3 text-red-500" />}
            description="Max ATR ratio to trade (lower = calmer markets)"
          />
        </div>
      </div>
      
      {/* Drought thresholds */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[9px] bg-amber-500/20 text-amber-500">DROUGHT</Badge>
          <span className="text-[10px] text-muted-foreground">Relaxed for trade flow</span>
        </div>
        <div className={cn(
          "space-y-3 p-3 rounded-lg border",
          useConfigThresholds ? "bg-background" : "bg-muted/20 opacity-60"
        )}>
          <ThresholdSlider
            label="Trend Min Slope"
            value={drought.trend_threshold}
            onChange={(v) => updateDrought('trend_threshold', v)}
            min={0.0005}
            max={0.005}
            step={0.0005}
            unit=""
            icon={<TrendingUp className="h-3 w-3 text-blue-500" />}
          />
          <ThresholdSlider
            label="Max Pullback"
            value={drought.pullback_pct}
            onChange={(v) => updateDrought('pullback_pct', v)}
            min={3}
            max={15}
            step={0.5}
            unit="%"
            icon={<Percent className="h-3 w-3 text-emerald-500" />}
          />
          <ThresholdSlider
            label="Min Confidence"
            value={drought.min_confidence}
            onChange={(v) => updateDrought('min_confidence', v)}
            min={0.25}
            max={0.6}
            step={0.05}
            unit=""
            icon={<Activity className="h-3 w-3 text-amber-500" />}
          />
          <ThresholdSlider
            label="Max Vol (ATR)"
            value={drought.vol_contraction}
            onChange={(v) => updateDrought('vol_contraction', v)}
            min={1.2}
            max={2.5}
            step={0.1}
            unit=""
            icon={<AlertTriangle className="h-3 w-3 text-red-500" />}
          />
        </div>
      </div>
      
      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-[10px] h-8"
          onClick={handleReset}
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset Defaults
        </Button>
        <Button
          size="sm"
          className="flex-1 text-[10px] h-8"
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          {dirty ? 'Save Changes' : 'Saved'}
        </Button>
      </div>
    </div>
  );
}
