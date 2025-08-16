-- Create medicines table with Nigerian-specific fields
CREATE TABLE IF NOT EXISTS medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  generic_name VARCHAR(200),
  brand_name VARCHAR(200),
  category_id UUID REFERENCES categories(id),
  manufacturer VARCHAR(200),
  supplier_id UUID REFERENCES suppliers(id),
  nafdac_number VARCHAR(50), -- Nigerian drug registration number
  dosage_form VARCHAR(50), -- tablet, capsule, syrup, injection, etc.
  strength VARCHAR(100), -- 500mg, 250mg/5ml, etc.
  pack_size INTEGER DEFAULT 1,
  unit_of_measure VARCHAR(20) DEFAULT 'piece',
  description TEXT,
  indications TEXT,
  contraindications TEXT,
  side_effects TEXT,
  storage_conditions TEXT,
  requires_prescription BOOLEAN DEFAULT false,
  is_controlled BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  cost_price DECIMAL(10,2) DEFAULT 0.00,
  selling_price DECIMAL(10,2) DEFAULT 0.00,
  markup_percentage DECIMAL(5,2) DEFAULT 0.00,
  barcode VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster searches
CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name);
CREATE INDEX IF NOT EXISTS idx_medicines_generic ON medicines(generic_name);
CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category_id);
CREATE INDEX IF NOT EXISTS idx_medicines_nafdac ON medicines(nafdac_number);
CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines(barcode);
CREATE INDEX IF NOT EXISTS idx_medicines_active ON medicines(is_active);

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_medicines_search ON medicines USING gin(to_tsvector('english', name || ' ' || COALESCE(generic_name, '') || ' ' || COALESCE(brand_name, '')));
