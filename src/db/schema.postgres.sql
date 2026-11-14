-- SevaDesk PostgreSQL / Neon Database Schema
-- Version: 1.0.0

-- Compatibility helper: DATEDIFF function
CREATE OR REPLACE FUNCTION DATEDIFF(d1 timestamptz, d2 timestamptz) RETURNS integer AS $$
BEGIN
  RETURN (d1::date - d2::date);
END;
$$ LANGUAGE plpgsql;

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'ADMIN',
  full_name VARCHAR(150) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. Customers table
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  customer_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  mobile_normalized VARCHAR(20) NOT NULL,
  email VARCHAR(150) NULL,
  address VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_mobile_norm ON customers(mobile_normalized);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);

-- 3. Services Catalogue table
CREATE TABLE IF NOT EXISTS services (
  id BIGSERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL DEFAULT 'General',
  name VARCHAR(150) NOT NULL UNIQUE,
  default_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_pinned ON services(is_pinned);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active);

-- 4. Service Records table
CREATE TABLE IF NOT EXISTS service_records (
  id BIGSERIAL PRIMARY KEY,
  receipt_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  service_id BIGINT NULL REFERENCES services(id) ON DELETE SET NULL,
  service_name_snapshot VARCHAR(150) NOT NULL,
  total_charge DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID')),
  notes TEXT NULL,
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  service_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_sr_customer ON service_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_sr_receipt ON service_records(receipt_number);
CREATE INDEX IF NOT EXISTS idx_sr_status ON service_records(status);
CREATE INDEX IF NOT EXISTS idx_sr_service_date ON service_records(service_date);

-- 5. Payments table
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  service_record_id BIGINT NOT NULL REFERENCES service_records(id) ON DELETE RESTRICT,
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
  transaction_reference VARCHAR(100) NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'RECORDED',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pay_sr_id ON payments(service_record_id);
CREATE INDEX IF NOT EXISTS idx_pay_received_at ON payments(received_at);
CREATE INDEX IF NOT EXISTS idx_pay_status ON payments(status);

-- 6. Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  service_record_id BIGINT NOT NULL REFERENCES service_records(id) ON DELETE CASCADE,
  payment_id BIGINT NULL REFERENCES payments(id) ON DELETE SET NULL,
  recipient_mobile VARCHAR(20) NOT NULL,
  message_body TEXT NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'SMS',
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED')),
  provider_message_id VARCHAR(100) NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  last_error_code VARCHAR(100) NULL,
  last_error_message VARCHAR(255) NULL,
  last_attempt_at TIMESTAMPTZ NULL,
  sent_at TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  idempotency_key VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notif_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notif_sr ON notifications(service_record_id);

-- 7. Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  username_snapshot VARCHAR(100) NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  metadata_json JSONB NULL,
  ip_address VARCHAR(50) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);

-- 8. Settings table
CREATE TABLE IF NOT EXISTS settings (
  id BIGSERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(setting_key);
