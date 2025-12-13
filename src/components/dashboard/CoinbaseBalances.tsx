import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Wallet, 
  RefreshCw,
  DollarSign,
  Bitcoin,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CoinbaseAccount {
  id: string;
  name: string;
  currency: string;
  available: number;
  hold: number;
  total: number;
  type: string;
}

export function CoinbaseBalances() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['coinbase-balances'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinbase-balances');
      if (error) throw error;
      return data as { ok: boolean; accounts?: CoinbaseAccount[]; error?: string };
    },
    staleTime: 60000, // 1 minute
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const accounts = data?.accounts || [];
  const hasError = data && !data.ok;

  const getCurrencyIcon = (currency: string) => {
    if (currency === 'USD') return <DollarSign className="h-3 w-3" />;
    if (currency === 'BTC') return <Bitcoin className="h-3 w-3" />;
    return <Wallet className="h-3 w-3" />;
  };

  const formatBalance = (value: number, currency: string) => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }
    if (value === 0) return '0';
    if (value < 0.0001) return value.toExponential(2);
    if (value < 1) return value.toFixed(6);
    return value.toFixed(4);
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Coinbase Balances
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="h-6 px-2"
          >
            <RefreshCw className={cn('h-3 w-3', (isLoading || isRefreshing) && 'animate-spin')} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="text-xs text-muted-foreground text-center py-4">
            Loading balances...
          </div>
        )}
        
        {hasError && (
          <div className="text-xs text-destructive text-center py-2">
            {data.error}
          </div>
        )}
        
        {!isLoading && !hasError && accounts.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">
            No accounts with balances found
          </div>
        )}
        
        {!isLoading && !hasError && accounts.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {accounts.map((account) => (
              <div 
                key={account.id}
                className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="text-muted-foreground">
                    {getCurrencyIcon(account.currency)}
                  </div>
                  <div>
                    <div className="text-xs font-medium">{account.currency}</div>
                    <div className="text-[10px] text-muted-foreground">{account.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono">
                    {formatBalance(account.available, account.currency)}
                  </div>
                  {account.hold > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      Hold: {formatBalance(account.hold, account.currency)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {!isLoading && !hasError && accounts.length > 0 && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Accounts shown</span>
              <Badge variant="outline" className="text-[10px]">
                {accounts.length}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
