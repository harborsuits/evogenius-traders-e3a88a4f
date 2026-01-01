export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          capital_allocation: number
          created_at: string
          generation_id: string
          genes: Json
          id: string
          is_elite: boolean
          preferred_regime: string | null
          role: Database["public"]["Enums"]["agent_role"]
          status: Database["public"]["Enums"]["agent_status"]
          strategy_template: Database["public"]["Enums"]["strategy_template"]
        }
        Insert: {
          capital_allocation?: number
          created_at?: string
          generation_id: string
          genes: Json
          id?: string
          is_elite?: boolean
          preferred_regime?: string | null
          role?: Database["public"]["Enums"]["agent_role"]
          status?: Database["public"]["Enums"]["agent_status"]
          strategy_template: Database["public"]["Enums"]["strategy_template"]
        }
        Update: {
          capital_allocation?: number
          created_at?: string
          generation_id?: string
          genes?: Json
          id?: string
          is_elite?: boolean
          preferred_regime?: string | null
          role?: Database["public"]["Enums"]["agent_role"]
          status?: Database["public"]["Enums"]["agent_status"]
          strategy_template?: Database["public"]["Enums"]["strategy_template"]
        }
        Relationships: [
          {
            foreignKeyName: "agents_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      arm_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          max_live_orders: number
          metadata: Json | null
          mode: string
          orders_executed: number
          spent_at: string | null
          spent_by_request_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          max_live_orders?: number
          metadata?: Json | null
          mode?: string
          orders_executed?: number
          spent_at?: string | null
          spent_by_request_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          max_live_orders?: number
          metadata?: Json | null
          mode?: string
          orders_executed?: number
          spent_at?: string | null
          spent_by_request_id?: string | null
        }
        Relationships: []
      }
      control_events: {
        Row: {
          action: string
          id: string
          metadata: Json | null
          new_status: string | null
          previous_status: string | null
          triggered_at: string
        }
        Insert: {
          action: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          previous_status?: string | null
          triggered_at?: string
        }
        Update: {
          action?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          previous_status?: string | null
          triggered_at?: string
        }
        Relationships: []
      }
      exchange_connections: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          is_paper: boolean
          label: string | null
          last_auth_check: string | null
          permissions: Json | null
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          is_paper?: boolean
          label?: string | null
          last_auth_check?: string | null
          permissions?: Json | null
          provider?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          is_paper?: boolean
          label?: string | null
          last_auth_check?: string | null
          permissions?: Json | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      gate_profiles: {
        Row: {
          config: Json
          created_at: string
          name: string
        }
        Insert: {
          config: Json
          created_at?: string
          name: string
        }
        Update: {
          config?: Json
          created_at?: string
          name?: string
        }
        Relationships: []
      }
      generation_agents: {
        Row: {
          agent_id: string
          created_at: string
          generation_id: string
          id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          generation_id: string
          id?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          generation_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_agents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_agents_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          avg_fitness: number | null
          created_at: string
          end_time: string | null
          generation_number: number
          id: string
          is_active: boolean
          max_drawdown: number
          regime_tag: string | null
          start_time: string
          termination_reason:
            | Database["public"]["Enums"]["generation_termination_reason"]
            | null
          total_pnl: number
          total_trades: number
        }
        Insert: {
          avg_fitness?: number | null
          created_at?: string
          end_time?: string | null
          generation_number: number
          id?: string
          is_active?: boolean
          max_drawdown?: number
          regime_tag?: string | null
          start_time?: string
          termination_reason?:
            | Database["public"]["Enums"]["generation_termination_reason"]
            | null
          total_pnl?: number
          total_trades?: number
        }
        Update: {
          avg_fitness?: number | null
          created_at?: string
          end_time?: string | null
          generation_number?: number
          id?: string
          is_active?: boolean
          max_drawdown?: number
          regime_tag?: string | null
          start_time?: string
          termination_reason?:
            | Database["public"]["Enums"]["generation_termination_reason"]
            | null
          total_pnl?: number
          total_trades?: number
        }
        Relationships: []
      }
      live_brain_snapshots: {
        Row: {
          agent_snapshots: Json
          created_at: string
          gates_passed: Json | null
          gates_validated_at: string | null
          id: string
          is_active: boolean
          notes: string | null
          performance_summary: Json
          promoted_at: string
          promoted_by: string | null
          source_generation_id: string | null
          status: string
          version_number: number
        }
        Insert: {
          agent_snapshots?: Json
          created_at?: string
          gates_passed?: Json | null
          gates_validated_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          performance_summary?: Json
          promoted_at?: string
          promoted_by?: string | null
          source_generation_id?: string | null
          status?: string
          version_number: number
        }
        Update: {
          agent_snapshots?: Json
          created_at?: string
          gates_passed?: Json | null
          gates_validated_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          performance_summary?: Json
          promoted_at?: string
          promoted_by?: string | null
          source_generation_id?: string | null
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_brain_snapshots_source_generation_id_fkey"
            columns: ["source_generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      market_data: {
        Row: {
          atr_ratio: number
          change_24h: number
          ema_50_slope: number
          id: string
          price: number
          regime: string
          symbol: string
          updated_at: string
          volume_24h: number
        }
        Insert: {
          atr_ratio?: number
          change_24h?: number
          ema_50_slope?: number
          id?: string
          price: number
          regime?: string
          symbol: string
          updated_at?: string
          volume_24h?: number
        }
        Update: {
          atr_ratio?: number
          change_24h?: number
          ema_50_slope?: number
          id?: string
          price?: number
          regime?: string
          symbol?: string
          updated_at?: string
          volume_24h?: number
        }
        Relationships: []
      }
      market_poll_runs: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          id: string
          ran_at: string
          status: string
          updated_count: number | null
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          ran_at?: string
          status: string
          updated_count?: number | null
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          ran_at?: string
          status?: string
          updated_count?: number | null
        }
        Relationships: []
      }
      news_items: {
        Row: {
          created_at: string
          id: string
          importance: number | null
          outlet: string | null
          published_at: string
          raw: Json | null
          source: string
          symbols: string[] | null
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          id: string
          importance?: number | null
          outlet?: string | null
          published_at: string
          raw?: Json | null
          source: string
          symbols?: string[] | null
          title: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          importance?: number | null
          outlet?: string | null
          published_at?: string
          raw?: Json | null
          source?: string
          symbols?: string[] | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      news_mentions: {
        Row: {
          bucket_start: string
          created_at: string
          id: string
          news_id: string
          symbol: string
        }
        Insert: {
          bucket_start: string
          created_at?: string
          id?: string
          news_id: string
          symbol: string
        }
        Update: {
          bucket_start?: string
          created_at?: string
          id?: string
          news_id?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_mentions_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_accounts: {
        Row: {
          base_currency: string
          cash: number
          created_at: string
          id: string
          name: string
          peak_equity: number
          peak_equity_updated_at: string
          starting_cash: number
          updated_at: string
        }
        Insert: {
          base_currency?: string
          cash?: number
          created_at?: string
          id?: string
          name?: string
          peak_equity?: number
          peak_equity_updated_at?: string
          starting_cash?: number
          updated_at?: string
        }
        Update: {
          base_currency?: string
          cash?: number
          created_at?: string
          id?: string
          name?: string
          peak_equity?: number
          peak_equity_updated_at?: string
          starting_cash?: number
          updated_at?: string
        }
        Relationships: []
      }
      paper_fills: {
        Row: {
          fee: number
          id: string
          order_id: string
          price: number
          qty: number
          side: Database["public"]["Enums"]["paper_order_side"]
          symbol: string
          timestamp: string
        }
        Insert: {
          fee?: number
          id?: string
          order_id: string
          price: number
          qty: number
          side: Database["public"]["Enums"]["paper_order_side"]
          symbol: string
          timestamp?: string
        }
        Update: {
          fee?: number
          id?: string
          order_id?: string
          price?: number
          qty?: number
          side?: Database["public"]["Enums"]["paper_order_side"]
          symbol?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_fills_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "paper_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_orders: {
        Row: {
          account_id: string
          agent_id: string | null
          created_at: string
          filled_at: string | null
          filled_price: number | null
          filled_qty: number | null
          generation_id: string | null
          id: string
          limit_price: number | null
          order_type: Database["public"]["Enums"]["paper_order_type"]
          qty: number
          reason: string | null
          side: Database["public"]["Enums"]["paper_order_side"]
          slippage_pct: number | null
          status: Database["public"]["Enums"]["paper_order_status"]
          symbol: string
          tags: Json
        }
        Insert: {
          account_id: string
          agent_id?: string | null
          created_at?: string
          filled_at?: string | null
          filled_price?: number | null
          filled_qty?: number | null
          generation_id?: string | null
          id?: string
          limit_price?: number | null
          order_type?: Database["public"]["Enums"]["paper_order_type"]
          qty: number
          reason?: string | null
          side: Database["public"]["Enums"]["paper_order_side"]
          slippage_pct?: number | null
          status?: Database["public"]["Enums"]["paper_order_status"]
          symbol: string
          tags?: Json
        }
        Update: {
          account_id?: string
          agent_id?: string | null
          created_at?: string
          filled_at?: string | null
          filled_price?: number | null
          filled_qty?: number | null
          generation_id?: string | null
          id?: string
          limit_price?: number | null
          order_type?: Database["public"]["Enums"]["paper_order_type"]
          qty?: number
          reason?: string | null
          side?: Database["public"]["Enums"]["paper_order_side"]
          slippage_pct?: number | null
          status?: Database["public"]["Enums"]["paper_order_status"]
          symbol?: string
          tags?: Json
        }
        Relationships: [
          {
            foreignKeyName: "paper_orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "paper_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_orders_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_orders_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_positions: {
        Row: {
          account_id: string
          avg_entry_price: number
          id: string
          qty: number
          realized_pnl: number
          symbol: string
          updated_at: string
        }
        Insert: {
          account_id: string
          avg_entry_price?: number
          id?: string
          qty?: number
          realized_pnl?: number
          symbol: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          avg_entry_price?: number
          id?: string
          qty?: number
          realized_pnl?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_positions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "paper_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      performance: {
        Row: {
          agent_id: string
          created_at: string
          fitness_score: number
          generation_id: string
          id: string
          max_drawdown: number
          net_pnl: number
          profitable_days_ratio: number
          sharpe_ratio: number
          total_trades: number
        }
        Insert: {
          agent_id: string
          created_at?: string
          fitness_score: number
          generation_id: string
          id?: string
          max_drawdown?: number
          net_pnl?: number
          profitable_days_ratio?: number
          sharpe_ratio?: number
          total_trades?: number
        }
        Update: {
          agent_id?: string
          created_at?: string
          fitness_score?: number
          generation_id?: string
          id?: string
          max_drawdown?: number
          net_pnl?: number
          profitable_days_ratio?: number
          sharpe_ratio?: number
          total_trades?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_alerts: {
        Row: {
          acked_at: string | null
          created_at: string
          id: string
          is_ack: boolean
          message: string
          metadata: Json | null
          scope: string
          scope_id: string
          severity: string
          title: string
          type: string
        }
        Insert: {
          acked_at?: string | null
          created_at?: string
          id?: string
          is_ack?: boolean
          message: string
          metadata?: Json | null
          scope: string
          scope_id: string
          severity: string
          title: string
          type: string
        }
        Update: {
          acked_at?: string | null
          created_at?: string
          id?: string
          is_ack?: boolean
          message?: string
          metadata?: Json | null
          scope?: string
          scope_id?: string
          severity?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      shadow_trades: {
        Row: {
          agent_id: string
          confidence: number
          created_at: string
          decision_reason: string | null
          entry_price: number
          entry_time: string
          exit_price: number | null
          exit_time: string | null
          generation_id: string
          hit_stop: boolean | null
          hit_target: boolean | null
          id: string
          intended_qty: number
          market_data: Json | null
          outcome_calculated_at: string | null
          outcome_status: string | null
          regime: string | null
          regime_match: boolean | null
          side: string
          simulated_pnl: number | null
          simulated_pnl_pct: number | null
          stop_price: number | null
          symbol: string
          target_price: number | null
          trailing_stop_pct: number | null
        }
        Insert: {
          agent_id: string
          confidence: number
          created_at?: string
          decision_reason?: string | null
          entry_price: number
          entry_time?: string
          exit_price?: number | null
          exit_time?: string | null
          generation_id: string
          hit_stop?: boolean | null
          hit_target?: boolean | null
          id?: string
          intended_qty: number
          market_data?: Json | null
          outcome_calculated_at?: string | null
          outcome_status?: string | null
          regime?: string | null
          regime_match?: boolean | null
          side: string
          simulated_pnl?: number | null
          simulated_pnl_pct?: number | null
          stop_price?: number | null
          symbol: string
          target_price?: number | null
          trailing_stop_pct?: number | null
        }
        Update: {
          agent_id?: string
          confidence?: number
          created_at?: string
          decision_reason?: string | null
          entry_price?: number
          entry_time?: string
          exit_price?: number | null
          exit_time?: string | null
          generation_id?: string
          hit_stop?: boolean | null
          hit_target?: boolean | null
          id?: string
          intended_qty?: number
          market_data?: Json | null
          outcome_calculated_at?: string | null
          outcome_status?: string | null
          regime?: string | null
          regime_match?: boolean | null
          side?: string
          simulated_pnl?: number | null
          simulated_pnl_pct?: number | null
          stop_price?: number | null
          symbol?: string
          target_price?: number | null
          trailing_stop_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shadow_trades_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shadow_trades_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          config: Json
          id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_state: {
        Row: {
          active_brain_version_id: string | null
          active_pool: number
          current_generation_id: string | null
          gate_profile: string
          id: string
          live_armed_until: string | null
          reserve: number
          status: Database["public"]["Enums"]["system_status"]
          today_pnl: number
          today_trades: number
          total_capital: number
          trade_mode: string
          updated_at: string
        }
        Insert: {
          active_brain_version_id?: string | null
          active_pool?: number
          current_generation_id?: string | null
          gate_profile?: string
          id?: string
          live_armed_until?: string | null
          reserve?: number
          status?: Database["public"]["Enums"]["system_status"]
          today_pnl?: number
          today_trades?: number
          total_capital?: number
          trade_mode?: string
          updated_at?: string
        }
        Update: {
          active_brain_version_id?: string | null
          active_pool?: number
          current_generation_id?: string | null
          gate_profile?: string
          id?: string
          live_armed_until?: string | null
          reserve?: number
          status?: Database["public"]["Enums"]["system_status"]
          today_pnl?: number
          today_trades?: number
          total_capital?: number
          trade_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_state_active_brain_version_id_fkey"
            columns: ["active_brain_version_id"]
            isOneToOne: false
            referencedRelation: "live_brain_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_state_current_generation_id_fkey"
            columns: ["current_generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          agent_id: string
          fees: number
          fill_price: number
          fill_size: number
          generation_id: string
          id: string
          intent_size: number
          outcome: Database["public"]["Enums"]["trade_outcome"]
          pnl: number
          side: Database["public"]["Enums"]["trade_side"]
          symbol: string
          timestamp: string
        }
        Insert: {
          agent_id: string
          fees?: number
          fill_price: number
          fill_size: number
          generation_id: string
          id?: string
          intent_size: number
          outcome: Database["public"]["Enums"]["trade_outcome"]
          pnl?: number
          side: Database["public"]["Enums"]["trade_side"]
          symbol: string
          timestamp?: string
        }
        Update: {
          agent_id?: string
          fees?: number
          fill_price?: number
          fill_size?: number
          generation_id?: string
          id?: string
          intent_size?: number
          outcome?: Database["public"]["Enums"]["trade_outcome"]
          pnl?: number
          side?: Database["public"]["Enums"]["trade_side"]
          symbol?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      end_generation: {
        Args: { gen_id: string; reason: string }
        Returns: undefined
      }
      spend_arm_session: {
        Args: { request_id: string; session_id: string }
        Returns: {
          orders_remaining: number
          reason: string
          session_mode: string
          success: boolean
        }[]
      }
      start_new_generation: { Args: never; Returns: string }
    }
    Enums: {
      agent_role: "core" | "explorer"
      agent_status: "elite" | "active" | "probation" | "removed"
      generation_termination_reason: "time" | "trades" | "drawdown" | "drought"
      paper_order_side: "buy" | "sell"
      paper_order_status: "pending" | "filled" | "rejected" | "cancelled"
      paper_order_type: "market" | "limit"
      strategy_template: "trend_pullback" | "mean_reversion" | "breakout"
      system_status: "running" | "paused" | "stopped" | "error"
      trade_outcome: "success" | "failed" | "denied"
      trade_side: "BUY" | "SELL"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agent_role: ["core", "explorer"],
      agent_status: ["elite", "active", "probation", "removed"],
      generation_termination_reason: ["time", "trades", "drawdown", "drought"],
      paper_order_side: ["buy", "sell"],
      paper_order_status: ["pending", "filled", "rejected", "cancelled"],
      paper_order_type: ["market", "limit"],
      strategy_template: ["trend_pullback", "mean_reversion", "breakout"],
      system_status: ["running", "paused", "stopped", "error"],
      trade_outcome: ["success", "failed", "denied"],
      trade_side: ["BUY", "SELL"],
    },
  },
} as const
