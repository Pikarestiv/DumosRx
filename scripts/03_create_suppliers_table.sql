-- Create suppliers table for inventory management
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100) DEFAULT 'Nigeria',
  tax_id VARCHAR(50),
  payment_terms INTEGER DEFAULT 30, -- days
  is_active BOOLEAN DEFAULT true,
  rating DECIMAL(2,1) DEFAULT 0.0 CHECK (rating >= 0 AND rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);

-- Insert default Nigerian suppliers
INSERT INTO suppliers (name, contact_person, email, phone, city, state) VALUES
('Emzor Pharmaceutical Industries', 'Sales Manager', 'sales@emzor.com', '+234-1-234-5678', 'Lagos', 'Lagos'),
('May & Baker Nigeria Plc', 'Business Manager', 'info@maybaker.com', '+234-1-345-6789', 'Lagos', 'Lagos'),
('GlaxoSmithKline Nigeria', 'Account Manager', 'nigeria@gsk.com', '+234-1-456-7890', 'Lagos', 'Lagos'),
('Fidson Healthcare Plc', 'Sales Rep', 'sales@fidson.com', '+234-1-567-8901', 'Lagos', 'Lagos')
ON CONFLICT DO NOTHING;
