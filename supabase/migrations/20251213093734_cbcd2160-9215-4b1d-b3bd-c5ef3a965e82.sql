-- Add unique constraint on symbol for upsert to work
ALTER TABLE public.market_data ADD CONSTRAINT market_data_symbol_unique UNIQUE (symbol);