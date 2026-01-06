-- Drop existing public read policies and replace with authenticated-only policies

-- AGENTS table
DROP POLICY IF EXISTS "Allow public read access on agents" ON public.agents;
CREATE POLICY "Authenticated read access on agents" ON public.agents FOR SELECT USING (auth.role() = 'authenticated');

-- GENERATIONS table
DROP POLICY IF EXISTS "Allow public read access on generations" ON public.generations;
CREATE POLICY "Authenticated read access on generations" ON public.generations FOR SELECT USING (auth.role() = 'authenticated');

-- TRADES table
DROP POLICY IF EXISTS "Allow public read access on trades" ON public.trades;
CREATE POLICY "Authenticated read access on trades" ON public.trades FOR SELECT USING (auth.role() = 'authenticated');

-- PERFORMANCE table
DROP POLICY IF EXISTS "Allow public read access on performance" ON public.performance;
CREATE POLICY "Authenticated read access on performance" ON public.performance FOR SELECT USING (auth.role() = 'authenticated');

-- PAPER_ACCOUNTS table
DROP POLICY IF EXISTS "Allow public read access on paper_accounts" ON public.paper_accounts;
CREATE POLICY "Authenticated read access on paper_accounts" ON public.paper_accounts FOR SELECT USING (auth.role() = 'authenticated');

-- PAPER_ORDERS table
DROP POLICY IF EXISTS "Allow public read access on paper_orders" ON public.paper_orders;
CREATE POLICY "Authenticated read access on paper_orders" ON public.paper_orders FOR SELECT USING (auth.role() = 'authenticated');

-- PAPER_FILLS table
DROP POLICY IF EXISTS "Allow public read access on paper_fills" ON public.paper_fills;
CREATE POLICY "Authenticated read access on paper_fills" ON public.paper_fills FOR SELECT USING (auth.role() = 'authenticated');

-- PAPER_POSITIONS table
DROP POLICY IF EXISTS "Allow public read access on paper_positions" ON public.paper_positions;
CREATE POLICY "Authenticated read access on paper_positions" ON public.paper_positions FOR SELECT USING (auth.role() = 'authenticated');

-- EXCHANGE_CONNECTIONS table
DROP POLICY IF EXISTS "Allow public read access on exchange_connections" ON public.exchange_connections;
CREATE POLICY "Authenticated read access on exchange_connections" ON public.exchange_connections FOR SELECT USING (auth.role() = 'authenticated');

-- SYSTEM_STATE table
DROP POLICY IF EXISTS "Allow public read access on system_state" ON public.system_state;
DROP POLICY IF EXISTS "Allow public update on system_state" ON public.system_state;
CREATE POLICY "Authenticated read access on system_state" ON public.system_state FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access on system_state" ON public.system_state FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- SYSTEM_CONFIG table
DROP POLICY IF EXISTS "Allow public read access on system_config" ON public.system_config;
CREATE POLICY "Authenticated read access on system_config" ON public.system_config FOR SELECT USING (auth.role() = 'authenticated');

-- CONTROL_EVENTS table
DROP POLICY IF EXISTS "Allow public read access on control_events" ON public.control_events;
CREATE POLICY "Authenticated read access on control_events" ON public.control_events FOR SELECT USING (auth.role() = 'authenticated');

-- GENERATION_AGENTS table
DROP POLICY IF EXISTS "Allow public read access on generation_agents" ON public.generation_agents;
CREATE POLICY "Authenticated read access on generation_agents" ON public.generation_agents FOR SELECT USING (auth.role() = 'authenticated');

-- ARM_SESSIONS table
DROP POLICY IF EXISTS "Allow public read access on arm_sessions" ON public.arm_sessions;
CREATE POLICY "Authenticated read access on arm_sessions" ON public.arm_sessions FOR SELECT USING (auth.role() = 'authenticated');

-- LIVE_BRAIN_SNAPSHOTS table
DROP POLICY IF EXISTS "Allow public read access on live_brain_snapshots" ON public.live_brain_snapshots;
CREATE POLICY "Authenticated read access on live_brain_snapshots" ON public.live_brain_snapshots FOR SELECT USING (auth.role() = 'authenticated');

-- SHADOW_TRADES table
DROP POLICY IF EXISTS "Allow public read access on shadow_trades" ON public.shadow_trades;
CREATE POLICY "Authenticated read access on shadow_trades" ON public.shadow_trades FOR SELECT USING (auth.role() = 'authenticated');

-- MARKET_DATA table (less sensitive, but still protect)
DROP POLICY IF EXISTS "Allow public read access on market_data" ON public.market_data;
CREATE POLICY "Authenticated read access on market_data" ON public.market_data FOR SELECT USING (auth.role() = 'authenticated');

-- MARKET_POLL_RUNS table
DROP POLICY IF EXISTS "Allow public read access on market_poll_runs" ON public.market_poll_runs;
CREATE POLICY "Authenticated read access on market_poll_runs" ON public.market_poll_runs FOR SELECT USING (auth.role() = 'authenticated');

-- NEWS_ITEMS table
DROP POLICY IF EXISTS "Allow public read access on news_items" ON public.news_items;
CREATE POLICY "Authenticated read access on news_items" ON public.news_items FOR SELECT USING (auth.role() = 'authenticated');

-- NEWS_MENTIONS table
DROP POLICY IF EXISTS "Allow public read access on news_mentions" ON public.news_mentions;
CREATE POLICY "Authenticated read access on news_mentions" ON public.news_mentions FOR SELECT USING (auth.role() = 'authenticated');

-- GATE_PROFILES table
DROP POLICY IF EXISTS "Allow public read access on gate_profiles" ON public.gate_profiles;
CREATE POLICY "Authenticated read access on gate_profiles" ON public.gate_profiles FOR SELECT USING (auth.role() = 'authenticated');

-- PERFORMANCE_ALERTS table
DROP POLICY IF EXISTS "Allow public read access on performance_alerts" ON public.performance_alerts;
DROP POLICY IF EXISTS "Allow public insert on performance_alerts" ON public.performance_alerts;
DROP POLICY IF EXISTS "Allow public update on performance_alerts" ON public.performance_alerts;
CREATE POLICY "Authenticated read access on performance_alerts" ON public.performance_alerts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated insert access on performance_alerts" ON public.performance_alerts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access on performance_alerts" ON public.performance_alerts FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');