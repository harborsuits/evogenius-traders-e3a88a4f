-- Add peak equity tracking columns to paper_accounts (Pass 3B)
ALTER TABLE public.paper_accounts 
ADD COLUMN peak_equity numeric NOT NULL DEFAULT 1000,
ADD COLUMN peak_equity_updated_at timestamp with time zone NOT NULL DEFAULT now();

-- Add comment for documentation
COMMENT ON COLUMN public.paper_accounts.peak_equity IS 'Highest equity reached - used for true max drawdown calculation';
COMMENT ON COLUMN public.paper_accounts.peak_equity_updated_at IS 'When peak_equity was last updated';