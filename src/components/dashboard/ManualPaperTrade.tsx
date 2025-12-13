import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useMarketData } from '@/hooks/useEvoTraderData';
import { toast } from '@/hooks/use-toast';
import { Zap, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface TradeResult {
  ok: boolean;
  mode?: string;
  order?: {
    id: string;
    symbol: string;
    side: string;
    qty: number;
    fillPrice: number;
    fee: number;
    slippagePct: number;
  };
  error?: string;
}

export function ManualPaperTrade() {
  const { data: marketData = [] } = useMarketData();
  const [symbol, setSymbol] = useState('BTC-USD');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState('0.001');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<TradeResult | null>(null);

  const currentPrice = marketData.find(m => m.symbol === symbol)?.price ?? 0;
  const notional = parseFloat(qty || '0') * currentPrice;

  const handleTrade = async () => {
    setLoading(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('trade-execute', {
        body: {
          symbol,
          side,
          qty: parseFloat(qty),
          orderType: 'market',
        },
      });

      if (error) {
        console.error('[ManualPaperTrade] Invoke error:', error);
        setLastResult({ ok: false, error: error.message });
        toast({
          title: 'Trade Failed',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      setLastResult(data as TradeResult);

      if (data.ok) {
        toast({
          title: 'Trade Executed',
          description: `${side.toUpperCase()} ${qty} ${symbol} @ $${data.order.fillPrice.toFixed(2)}`,
        });
      } else {
        toast({
          title: 'Trade Rejected',
          description: data.error,
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('[ManualPaperTrade] Error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setLastResult({ ok: false, error: errorMsg });
      toast({
        title: 'Trade Error',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card variant="terminal" className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
            Manual Paper Trade
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Symbol Selection */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Symbol</Label>
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BTC-USD">BTC-USD</SelectItem>
              <SelectItem value="ETH-USD">ETH-USD</SelectItem>
            </SelectContent>
          </Select>
          {currentPrice > 0 && (
            <div className="text-xs text-muted-foreground">
              Current: <span className="font-mono text-foreground">${currentPrice.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Side Selection */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Side</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={side === 'buy' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSide('buy')}
              className={side === 'buy' ? 'bg-success hover:bg-success/90' : ''}
            >
              <TrendingUp className="h-3.5 w-3.5 mr-1" />
              Buy
            </Button>
            <Button
              variant={side === 'sell' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSide('sell')}
              className={side === 'sell' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              <TrendingDown className="h-3.5 w-3.5 mr-1" />
              Sell
            </Button>
          </div>
        </div>

        {/* Quantity Input */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Quantity</Label>
          <Input
            type="number"
            step="0.0001"
            min="0.0001"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="font-mono"
          />
          {notional > 0 && (
            <div className="text-xs text-muted-foreground">
              Notional: <span className="font-mono text-foreground">${notional.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Execute Button */}
        <Button
          onClick={handleTrade}
          disabled={loading || !qty || parseFloat(qty) <= 0}
          className="w-full"
        >
          {loading ? 'Executing...' : `Execute ${side.toUpperCase()} Order`}
        </Button>

        {/* Last Result */}
        {lastResult && (
          <div className={`rounded-lg p-3 text-sm ${lastResult.ok ? 'bg-success/10 border border-success/20' : 'bg-destructive/10 border border-destructive/20'}`}>
            {lastResult.ok && lastResult.order ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="text-xs">FILLED</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{lastResult.mode}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono mt-2">
                  <div className="text-muted-foreground">Fill Price:</div>
                  <div>${lastResult.order.fillPrice.toFixed(2)}</div>
                  <div className="text-muted-foreground">Slippage:</div>
                  <div>{(lastResult.order.slippagePct * 100).toFixed(3)}%</div>
                  <div className="text-muted-foreground">Fee:</div>
                  <div>${lastResult.order.fee.toFixed(4)}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <span className="text-destructive">{lastResult.error}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
