-- Add unique constraint on provider for upsert to work
ALTER TABLE public.exchange_connections 
ADD CONSTRAINT exchange_connections_provider_key UNIQUE (provider);