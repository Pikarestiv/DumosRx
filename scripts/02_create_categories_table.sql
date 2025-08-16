-- Create medicine categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES categories(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for hierarchical queries
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);

-- Insert default categories
INSERT INTO categories (name, description) VALUES
('Analgesics', 'Pain relief medications'),
('Antibiotics', 'Antimicrobial medications'),
('Antihypertensives', 'Blood pressure medications'),
('Antidiabetics', 'Diabetes management medications'),
('Vitamins & Supplements', 'Nutritional supplements'),
('Respiratory', 'Respiratory system medications'),
('Gastrointestinal', 'Digestive system medications'),
('Dermatological', 'Skin care medications')
ON CONFLICT (name) DO NOTHING;
