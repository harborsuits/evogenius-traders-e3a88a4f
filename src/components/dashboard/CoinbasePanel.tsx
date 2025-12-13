import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Wallet, 
  Shield, 
  AlertCircle, 
  CheckCircle, 
  Circle,
  TestTube,
  Lock
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ExchangeConnection {
  id: string;
  provider: string;
  label: string | null;
  is_enabled: boolean;
  is_paper: boolean;
  permissions: string[];
  last_auth_check: string | null;
}

export function CoinbasePanel() {
  const [isPaper, setIsPaper] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const { toast } = useToast();

  const { data: connection } = useQuery({
    queryKey: ['exchange-connection', 'coinbase'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exchange_connections')
        .select('*')
        .eq('provider', 'coinbase')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as ExchangeConnection | null;
    },
  });

  const isConnected = connection?.is_enabled ?? false;
  const permissions = connection?.permissions ?? [];

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('coinbase-test');
      
      if (error) {
        toast({
          title: 'Connection Test Failed',
          description: error.message || 'Failed to invoke coinbase-test function',
          variant: 'destructive',
        });
        return;
      }

      if (data?.ok) {
        toast({
          title: 'Connection Successful',
          description: `Found ${data.account_count} accounts with permissions: ${data.permissions?.join(', ')}`,
        });
      } else {
        toast({
          title: 'Connection Failed',
          description: data?.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Connection Test Error',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const permissionsList = [
    { key: 'wallet:accounts:read', label: 'Read Accounts', icon: Wallet },
    { key: 'wallet:orders:read', label: 'Read Orders', icon: Shield },
    { key: 'wallet:orders:create', label: 'Create Orders', icon: Lock },
  ];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Coinbase Integration
          </div>
          <Badge 
            variant="outline" 
            className={cn(
              'text-xs',
              isConnected ? 'text-success border-success/50' : 'text-muted-foreground'
            )}
          >
            {isConnected ? 'Connected' : 'Not Connected'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode Toggles */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="paper-mode" className="text-xs text-muted-foreground flex items-center gap-2">
              <TestTube className="h-3 w-3" />
              Paper Trading Mode
            </Label>
            <Switch 
              id="paper-mode"
              checked={isPaper}
              onCheckedChange={setIsPaper}
              className="scale-75"
            />
          </div>
          
          {!isPaper && (
            <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              <span>Live trading enabled. Real funds at risk.</span>
            </div>
          )}
        </div>

        {/* Connection Status */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium">Connection Status</div>
          <div className="grid gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">API Key</span>
              <Badge variant="outline" className="text-xs">
                {isConnected ? 'Configured' : 'Not Set'}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last Auth Check</span>
              <span className="font-mono">
                {connection?.last_auth_check 
                  ? new Date(connection.last_auth_check).toLocaleTimeString()
                  : 'Never'}
              </span>
            </div>
          </div>
        </div>

        {/* Permissions Checklist */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium">Permissions</div>
          <div className="space-y-1">
            {permissionsList.map(({ key, label, icon: Icon }) => {
              const hasPermission = permissions.includes(key);
              return (
                <div 
                  key={key}
                  className="flex items-center gap-2 text-xs"
                >
                  {hasPermission ? (
                    <CheckCircle className="h-3 w-3 text-success" />
                  ) : (
                    <Circle className="h-3 w-3 text-muted-foreground" />
                  )}
                  <Icon className="h-3 w-3 text-muted-foreground" />
                  <span className={hasPermission ? 'text-foreground' : 'text-muted-foreground'}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleTestConnection}
            disabled={isTesting}
          >
            <TestTube className={cn('h-3 w-3 mr-2', isTesting && 'animate-pulse')} />
            Test Connection
          </Button>
          
          <p className="text-xs text-muted-foreground text-center">
            API keys stored securely in edge function environment.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}