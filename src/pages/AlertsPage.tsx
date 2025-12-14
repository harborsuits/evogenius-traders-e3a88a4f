import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Bell, AlertTriangle, AlertCircle, Info, Check } from 'lucide-react';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SeverityFilter = 'all' | 'crit' | 'warn' | 'info';

export default function AlertsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [hideAcknowledged, setHideAcknowledged] = useState(false);

  // Fetch alerts
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['performance-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_alerts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Acknowledge mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from('performance_alerts')
        .update({ is_ack: true, acked_at: new Date().toISOString() })
        .eq('id', alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-alerts'] });
    },
  });

  // Filter alerts
  const filteredAlerts = alerts.filter((alert: any) => {
    if (hideAcknowledged && alert.is_ack) return false;
    if (severityFilter !== 'all' && alert.severity !== severityFilter) return false;
    return true;
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'crit': return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'warn': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Info className="h-4 w-4 text-blue-400" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, 'destructive' | 'warning' | 'secondary'> = {
      crit: 'destructive',
      warn: 'warning',
      info: 'secondary',
    };
    return (
      <Badge variant={variants[severity] || 'secondary'} className="text-[10px]">
        {severity.toUpperCase()}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background bg-grid flex items-center justify-center">
        <div className="text-muted-foreground font-mono">Loading alerts...</div>
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
            <Bell className="h-5 w-5 text-yellow-500" />
            <h1 className="font-mono text-lg text-primary">Performance Alerts</h1>
          </div>
        </div>
      </header>

      <main className="container px-4 py-6 space-y-6">
        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-4">
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">Total Alerts</div>
              <div className="font-mono text-2xl font-bold">{alerts.length}</div>
            </CardContent>
          </Card>
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">Critical</div>
              <div className="font-mono text-2xl text-destructive">
                {alerts.filter((a: any) => a.severity === 'crit' && !a.is_ack).length}
              </div>
            </CardContent>
          </Card>
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">Warnings</div>
              <div className="font-mono text-2xl text-yellow-500">
                {alerts.filter((a: any) => a.severity === 'warn' && !a.is_ack).length}
              </div>
            </CardContent>
          </Card>
          <Card variant="stat">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">Acknowledged</div>
              <div className="font-mono text-2xl text-success">
                {alerts.filter((a: any) => a.is_ack).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex gap-4 items-center flex-wrap">
              <Select value={severityFilter} onValueChange={(v: SeverityFilter) => setSeverityFilter(v)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="crit">Critical</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch
                  checked={hideAcknowledged}
                  onCheckedChange={setHideAcknowledged}
                />
                <span className="text-sm text-muted-foreground">Hide acknowledged</span>
              </div>
              <div className="flex-1" />
              <span className="text-sm text-muted-foreground">
                {filteredAlerts.length} / {alerts.length} alerts
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Alerts List */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm flex items-center gap-2">
              <Bell className="h-4 w-4 text-yellow-500" />
              Alert History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredAlerts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No alerts to display</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {filteredAlerts.map((alert: any) => (
                    <div
                      key={alert.id}
                      className={`border rounded-lg p-4 ${
                        alert.is_ack 
                          ? 'border-border/50 bg-muted/20 opacity-60' 
                          : alert.severity === 'crit'
                            ? 'border-destructive/50 bg-destructive/5'
                            : alert.severity === 'warn'
                              ? 'border-yellow-500/50 bg-yellow-500/5'
                              : 'border-border bg-card'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {getSeverityIcon(alert.severity)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {getSeverityBadge(alert.severity)}
                            <span className="font-mono text-sm font-semibold">{alert.title}</span>
                            {alert.is_ack && (
                              <Badge variant="outline" className="text-[10px] text-success border-success/50">
                                <Check className="h-3 w-3 mr-1" />
                                ACK
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{alert.message}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Scope: {alert.scope}</span>
                            <span className="font-mono">{alert.scope_id?.slice(0, 8) || '—'}</span>
                            <span>{format(new Date(alert.created_at), 'MMM d, HH:mm')}</span>
                          </div>
                        </div>
                        {!alert.is_ack && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => acknowledgeMutation.mutate(alert.id)}
                            disabled={acknowledgeMutation.isPending}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Ack
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
