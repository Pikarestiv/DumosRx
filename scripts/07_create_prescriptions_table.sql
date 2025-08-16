-- Create prescriptions table
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  doctor_name VARCHAR(200) NOT NULL,
  doctor_license VARCHAR(100),
  doctor_phone VARCHAR(20),
  hospital_clinic VARCHAR(200),
  
  prescription_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'partially_filled', 'filled', 'cancelled')),
  
  -- Prescription details
  diagnosis TEXT,
  notes TEXT,
  refills_allowed INTEGER DEFAULT 0,
  refills_used INTEGER DEFAULT 0,
  
  -- Processing information
  dispensed_by UUID REFERENCES users(id),
  dispensed_at TIMESTAMP WITH TIME ZONE,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMP WITH TIME ZONE,
  
  total_amount DECIMAL(10,2) DEFAULT 0.00,
  insurance_covered DECIMAL(10,2) DEFAULT 0.00,
  patient_paid DECIMAL(10,2) DEFAULT 0.00,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create prescription items table
CREATE TABLE IF NOT EXISTS prescription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id),
  quantity_prescribed INTEGER NOT NULL,
  quantity_dispensed INTEGER DEFAULT 0,
  dosage_instructions TEXT NOT NULL,
  frequency VARCHAR(100), -- "twice daily", "as needed", etc.
  duration VARCHAR(100), -- "7 days", "2 weeks", etc.
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'dispensed', 'substituted', 'unavailable')),
  substituted_medicine_id UUID REFERENCES medicines(id),
  substitution_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_prescriptions_number ON prescriptions(prescription_number);
CREATE INDEX IF NOT EXISTS idx_prescriptions_customer ON prescriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_date ON prescriptions(prescription_date);
CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription ON prescription_items(prescription_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_medicine ON prescription_items(medicine_id);

-- Create sequence for prescription numbers
CREATE SEQUENCE IF NOT EXISTS prescription_number_seq START 1000;

-- Function to generate prescription number
CREATE OR REPLACE FUNCTION generate_prescription_number() RETURNS VARCHAR(50) AS $$
BEGIN
  RETURN 'RX' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || LPAD(nextval('prescription_number_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate prescription number
CREATE OR REPLACE FUNCTION set_prescription_number() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.prescription_number IS NULL OR NEW.prescription_number = '' THEN
    NEW.prescription_number := generate_prescription_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_prescription_number
  BEFORE INSERT ON prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_prescription_number();
