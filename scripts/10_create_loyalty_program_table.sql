-- Create loyalty program configuration table
CREATE TABLE IF NOT EXISTS loyalty_program_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  points_per_naira DECIMAL(5,2) DEFAULT 1.00, -- points earned per ₦1 spent
  naira_per_point DECIMAL(5,2) DEFAULT 1.00, -- ₦ value per point when redeeming
  bronze_threshold DECIMAL(10,2) DEFAULT 0.00,
  silver_threshold DECIMAL(10,2) DEFAULT 50000.00,
  gold_threshold DECIMAL(10,2) DEFAULT 150000.00,
  platinum_threshold DECIMAL(10,2) DEFAULT 500000.00,
  points_expiry_months INTEGER DEFAULT 12,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default loyalty program configuration
INSERT INTO loyalty_program_config (points_per_naira, naira_per_point) 
VALUES (1.00, 1.00) 
ON CONFLICT DO NOTHING;

-- Create loyalty transactions table
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('earned', 'redeemed', 'expired', 'adjusted')),
  points INTEGER NOT NULL, -- positive for earned, negative for redeemed/expired
  reference_id UUID, -- sale_id or adjustment reference
  reference_type VARCHAR(50),
  description TEXT,
  expiry_date DATE, -- for earned points
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_type ON loyalty_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_expiry ON loyalty_transactions(expiry_date);

-- Function to update customer loyalty tier
CREATE OR REPLACE FUNCTION update_customer_tier() RETURNS TRIGGER AS $$
DECLARE
  config RECORD;
BEGIN
  -- Get loyalty program configuration
  SELECT * INTO config FROM loyalty_program_config WHERE is_active = true LIMIT 1;
  
  -- Update membership tier based on total spent
  IF NEW.total_spent >= config.platinum_threshold THEN
    NEW.membership_tier := 'platinum';
  ELSIF NEW.total_spent >= config.gold_threshold THEN
    NEW.membership_tier := 'gold';
  ELSIF NEW.total_spent >= config.silver_threshold THEN
    NEW.membership_tier := 'silver';
  ELSE
    NEW.membership_tier := 'bronze';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update customer tier
CREATE TRIGGER trigger_update_customer_tier
  BEFORE UPDATE OF total_spent ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_tier();
