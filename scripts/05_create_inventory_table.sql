-- Create inventory table for stock management
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  batch_number VARCHAR(100) NOT NULL,
  quantity_in_stock INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER DEFAULT 0, -- for pending orders
  reorder_level INTEGER DEFAULT 10,
  max_stock_level INTEGER DEFAULT 1000,
  cost_price DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  manufacture_date DATE,
  expiry_date DATE NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  location VARCHAR(100), -- shelf location
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'damaged', 'recalled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique batch per medicine
  UNIQUE(medicine_id, batch_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_inventory_medicine ON inventory(medicine_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batch ON inventory(batch_number);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON inventory(expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_level ON inventory(quantity_in_stock);

-- Create view for low stock alerts
CREATE OR REPLACE VIEW low_stock_medicines AS
SELECT 
  m.name,
  m.generic_name,
  i.batch_number,
  i.quantity_in_stock,
  i.reorder_level,
  i.expiry_date,
  s.name as supplier_name
FROM inventory i
JOIN medicines m ON i.medicine_id = m.id
LEFT JOIN suppliers s ON i.supplier_id = s.id
WHERE i.quantity_in_stock <= i.reorder_level
  AND i.status = 'active'
  AND i.expiry_date > CURRENT_DATE;

-- Create view for expiring medicines (within 90 days)
CREATE OR REPLACE VIEW expiring_medicines AS
SELECT 
  m.name,
  m.generic_name,
  i.batch_number,
  i.quantity_in_stock,
  i.expiry_date,
  (i.expiry_date - CURRENT_DATE) as days_to_expiry
FROM inventory i
JOIN medicines m ON i.medicine_id = m.id
WHERE i.expiry_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '90 days')
  AND i.status = 'active'
  AND i.quantity_in_stock > 0
ORDER BY i.expiry_date ASC;
