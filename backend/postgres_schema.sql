DROP TABLE IF EXISTS service_suspensions CASCADE;
DROP TABLE IF EXISTS official_book_records CASCADE;
DROP TABLE IF EXISTS service_range_price_history CASCADE;
DROP TABLE IF EXISTS provider_subscription_price_history CASCADE;
DROP TABLE IF EXISTS service_contract_periods CASCADE;
DROP TABLE IF EXISTS service_ranges CASCADE;
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS service_items CASCADE;
DROP TABLE IF EXISTS organization_services CASCADE;
DROP TABLE IF EXISTS provider_subscriptions CASCADE;
DROP TABLE IF EXISTS provider_companies CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

CREATE TABLE organizations (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    phone TEXT,
    address TEXT,
    location TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE provider_companies (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    phone TEXT,
    address TEXT,
    email TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE provider_subscriptions (
    id SERIAL PRIMARY KEY,
    provider_company_id INTEGER NOT NULL REFERENCES provider_companies(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL CHECK (service_type IN ('Wireless', 'FTTH', 'Optical', 'Other')),
    item_category TEXT NOT NULL CHECK (item_category IN ('Line', 'Bundle', 'Other')),
    item_name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    unit_label TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organization_services (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL CHECK (service_type IN ('Wireless', 'FTTH', 'Optical', 'Other')),
    payment_method TEXT NOT NULL DEFAULT 'شهري' CHECK (payment_method IN ('يومي', 'شهري', 'كل 3 أشهر', 'سنوي')),
    payment_interval_days INTEGER DEFAULT 1,
    device_ownership TEXT NOT NULL DEFAULT 'الشركة' CHECK (device_ownership IN ('الشركة', 'المنظمة', 'الوزارة')),
    annual_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    due_amount REAL NOT NULL DEFAULT 0,
    contract_created_at TEXT,
    contract_duration_unit TEXT NOT NULL DEFAULT 'شهري' CHECK (contract_duration_unit IN ('يومي', 'شهري', 'سنوي')),
    contract_duration_value INTEGER NOT NULL DEFAULT 1,
    due_date TEXT,
    last_payment_amount REAL DEFAULT 0,
    last_payment_date TEXT,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    service_status TEXT NOT NULL DEFAULT 'active',
    suspension_effective_date TEXT,
    suspended_at TEXT,
    scheduled_suspend_at TEXT,
    suspension_refund_amount REAL NOT NULL DEFAULT 0,
    suspension_dropped_amount REAL NOT NULL DEFAULT 0,
    suspension_note TEXT
);

CREATE TABLE service_items (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES organization_services(id) ON DELETE CASCADE,
    item_category TEXT NOT NULL CHECK (item_category IN ('Line', 'Bundle', 'Other')),
    provider_company_id INTEGER REFERENCES provider_companies(id) ON DELETE SET NULL,
    item_name TEXT,
    line_type TEXT,
    bundle_type TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    total_price REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES organization_services(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    note TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    contract_period_id INTEGER
);

CREATE TABLE activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE service_ranges (
    id SERIAL PRIMARY KEY,
    service_name TEXT NOT NULL,
    range_from INTEGER NOT NULL,
    range_to INTEGER NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE service_contract_periods (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES organization_services(id) ON DELETE CASCADE,
    period_number INTEGER NOT NULL DEFAULT 1,
    period_label TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    contract_duration_unit TEXT NOT NULL DEFAULT 'شهري' CHECK (contract_duration_unit IN ('يومي', 'شهري', 'سنوي')),
    contract_duration_value INTEGER NOT NULL DEFAULT 1,
    payment_method TEXT NOT NULL DEFAULT 'شهري' CHECK (payment_method IN ('يومي', 'شهري', 'كل 3 أشهر', 'سنوي')),
    base_amount REAL NOT NULL DEFAULT 0,
    carried_debt REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    due_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
    closed_reason TEXT,
    previous_period_id INTEGER REFERENCES service_contract_periods(id) ON DELETE SET NULL,
    renewal_created_at TEXT,
    closed_at TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(service_id, period_number)
);

ALTER TABLE payments
ADD CONSTRAINT fk_payments_contract_period
FOREIGN KEY (contract_period_id) REFERENCES service_contract_periods(id) ON DELETE SET NULL;

CREATE TABLE provider_subscription_price_history (
    id SERIAL PRIMARY KEY,
    provider_subscription_id INTEGER NOT NULL REFERENCES provider_subscriptions(id) ON DELETE CASCADE,
    old_price REAL NOT NULL DEFAULT 0,
    new_price REAL NOT NULL DEFAULT 0,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    note TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE service_range_price_history (
    id SERIAL PRIMARY KEY,
    service_range_id INTEGER NOT NULL REFERENCES service_ranges(id) ON DELETE CASCADE,
    old_price REAL NOT NULL DEFAULT 0,
    new_price REAL NOT NULL DEFAULT 0,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    note TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE official_book_records (
    id SERIAL PRIMARY KEY,
    operation_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    service_id INTEGER REFERENCES organization_services(id) ON DELETE SET NULL,
    payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
    contract_period_id INTEGER REFERENCES service_contract_periods(id) ON DELETE SET NULL,
    provider_subscription_id INTEGER REFERENCES provider_subscriptions(id) ON DELETE SET NULL,
    service_range_id INTEGER REFERENCES service_ranges(id) ON DELETE SET NULL,
    provider_price_history_id INTEGER REFERENCES provider_subscription_price_history(id) ON DELETE SET NULL,
    service_range_history_id INTEGER REFERENCES service_range_price_history(id) ON DELETE SET NULL,
    official_book_date TEXT NOT NULL,
    official_book_description TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE service_suspensions (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL REFERENCES organization_services(id) ON DELETE CASCADE,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
    contract_period_id INTEGER REFERENCES service_contract_periods(id) ON DELETE SET NULL,
    effective_date TEXT NOT NULL,
    is_immediate INTEGER NOT NULL DEFAULT 1,
    refund_amount REAL NOT NULL DEFAULT 0,
    dropped_due_amount REAL NOT NULL DEFAULT 0,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'executed', 'cancelled')),
    executed_at TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_org_name ON organizations(name);
CREATE INDEX idx_provider_name ON provider_companies(name);
CREATE INDEX idx_service_org ON organization_services(organization_id);
CREATE INDEX idx_item_service ON service_items(service_id);
CREATE INDEX idx_payment_service ON payments(service_id);
CREATE INDEX idx_payment_contract_period ON payments(contract_period_id);
CREATE INDEX idx_activity_created_at ON activity_log(created_at DESC);
CREATE INDEX idx_service_ranges_name ON service_ranges(service_name);
CREATE INDEX idx_period_service ON service_contract_periods(service_id);
CREATE INDEX idx_period_service_status ON service_contract_periods(service_id, status);
CREATE INDEX idx_period_dates ON service_contract_periods(start_date, end_date);
CREATE INDEX idx_psh_subscription ON provider_subscription_price_history(provider_subscription_id);
CREATE INDEX idx_srh_range ON service_range_price_history(service_range_id);
CREATE INDEX idx_obr_created_at ON official_book_records(created_at DESC);
CREATE INDEX idx_obr_operation_type ON official_book_records(operation_type);
CREATE INDEX idx_obr_service ON official_book_records(service_id);
CREATE INDEX idx_obr_org ON official_book_records(organization_id);
CREATE INDEX idx_service_status ON organization_services(service_status);
CREATE INDEX idx_suspension_service ON service_suspensions(service_id, status);
CREATE INDEX idx_suspension_effective_date ON service_suspensions(effective_date);

INSERT INTO users (username, password, role)
VALUES
('admin1', 'a123', 'admin'),
('user1', 'u123', 'user');