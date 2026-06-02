import sqlite3
import os
from datetime import datetime, date, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), 'itpc.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    return any(col["name"] == column_name for col in columns)


def _table_exists(cursor, table_name):
    cursor.execute("""
        SELECT name
        FROM sqlite_master
        WHERE type='table' AND name=?
    """, (table_name,))
    return cursor.fetchone() is not None


def _safe_parse_date(value):
    if not value:
        return None

    value = str(value).strip()
    formats = [
        "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(value).date()
    except Exception:
        return None


def _add_months(base_date, months):
    year = base_date.year + ((base_date.month - 1 + months) // 12)
    month = ((base_date.month - 1 + months) % 12) + 1

    if month == 2:
        is_leap = (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)
        last_day = 29 if is_leap else 28
    elif month in [4, 6, 9, 11]:
        last_day = 30
    else:
        last_day = 31

    day = min(base_date.day, last_day)
    return date(year, month, day)


def _calculate_period_end_date(start_date, duration_unit, duration_value):
    if not start_date:
        start_date = date.today()

    duration_value = int(duration_value or 1)
    duration_unit = (duration_unit or "شهري").strip()

    if duration_unit == "يومي":
        return start_date + timedelta(days=duration_value)
    elif duration_unit == "شهري":
        return _add_months(start_date, duration_value)
    elif duration_unit == "سنوي":
        return _add_months(start_date, duration_value * 12)

    return _add_months(start_date, 1)


def _ensure_payments_contract_period_column(cursor):
    if not _column_exists(cursor, "payments", "contract_period_id"):
        cursor.execute("""
            ALTER TABLE payments
            ADD COLUMN contract_period_id INTEGER
        """)


def _ensure_users_role_column(cursor):
    if _table_exists(cursor, "users") and not _column_exists(cursor, "users", "role"):
        cursor.execute("""
            ALTER TABLE users
            ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
        """)
        cursor.execute("""
            UPDATE users
            SET role = 'admin'
            WHERE username = 'admin1'
        """)


def _ensure_service_suspension_columns(cursor):
    if _table_exists(cursor, "organization_services") and not _column_exists(cursor, "organization_services", "service_status"):
        cursor.execute("""
            ALTER TABLE organization_services
            ADD COLUMN service_status TEXT NOT NULL DEFAULT 'active'
        """)
        cursor.execute("""
            UPDATE organization_services
            SET service_status = CASE WHEN COALESCE(is_active, 1) = 1 THEN 'active' ELSE 'suspended' END
        """)

    additional_columns = [
        ("suspension_effective_date", "TEXT"),
        ("suspended_at", "TEXT"),
        ("scheduled_suspend_at", "TEXT"),
        ("suspension_refund_amount", "REAL NOT NULL DEFAULT 0"),
        ("suspension_dropped_amount", "REAL NOT NULL DEFAULT 0"),
        ("suspension_note", "TEXT"),
    ]

    if _table_exists(cursor, "organization_services"):
        for column_name, column_type in additional_columns:
            if not _column_exists(cursor, "organization_services", column_name):
                cursor.execute(f"ALTER TABLE organization_services ADD COLUMN {column_name} {column_type}")


def _ensure_service_suspensions_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS service_suspensions (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            service_id              INTEGER NOT NULL,
            organization_id         INTEGER,
            contract_period_id      INTEGER,
            effective_date          TEXT NOT NULL,
            is_immediate            INTEGER NOT NULL DEFAULT 1,
            refund_amount           REAL NOT NULL DEFAULT 0,
            dropped_due_amount      REAL NOT NULL DEFAULT 0,
            note                    TEXT,
            status                  TEXT NOT NULL DEFAULT 'scheduled'
                                    CHECK(status IN ('scheduled', 'executed', 'cancelled')),
            executed_at             TEXT,
            created_by              INTEGER,
            created_at              TEXT DEFAULT (datetime('now')),
            updated_at              TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (service_id) REFERENCES organization_services(id) ON DELETE CASCADE,
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
            FOREIGN KEY (contract_period_id) REFERENCES service_contract_periods(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)


def _ensure_service_contract_periods_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS service_contract_periods (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            service_id              INTEGER NOT NULL,
            period_number           INTEGER NOT NULL DEFAULT 1,
            period_label            TEXT,
            start_date              TEXT NOT NULL,
            end_date                TEXT NOT NULL,
            contract_duration_unit  TEXT NOT NULL DEFAULT 'شهري'
                                    CHECK(contract_duration_unit IN ('يومي', 'شهري', 'سنوي')),
            contract_duration_value INTEGER NOT NULL DEFAULT 1,
            payment_method          TEXT NOT NULL DEFAULT 'شهري'
                                    CHECK(payment_method IN ('يومي', 'شهري', 'كل 3 أشهر', 'سنوي')),
            base_amount             REAL NOT NULL DEFAULT 0,
            carried_debt            REAL NOT NULL DEFAULT 0,
            total_amount            REAL NOT NULL DEFAULT 0,
            paid_amount             REAL NOT NULL DEFAULT 0,
            due_amount              REAL NOT NULL DEFAULT 0,
            status                  TEXT NOT NULL DEFAULT 'active'
                                    CHECK(status IN ('active', 'closed', 'archived')),
            closed_reason           TEXT,
            previous_period_id      INTEGER,
            renewal_created_at      TEXT,
            closed_at               TEXT,
            notes                   TEXT,
            created_at              TEXT DEFAULT (datetime('now')),
            updated_at              TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (service_id) REFERENCES organization_services(id) ON DELETE CASCADE,
            FOREIGN KEY (previous_period_id) REFERENCES service_contract_periods(id) ON DELETE SET NULL,
            UNIQUE(service_id, period_number)
        )
    """)


def _ensure_price_history_tables(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS provider_subscription_price_history (
            id                           INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_subscription_id     INTEGER NOT NULL,
            old_price                    REAL NOT NULL DEFAULT 0,
            new_price                    REAL NOT NULL DEFAULT 0,
            changed_by                   INTEGER,
            note                         TEXT,
            changed_at                   TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (provider_subscription_id) REFERENCES provider_subscriptions(id) ON DELETE CASCADE,
            FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS service_range_price_history (
            id                           INTEGER PRIMARY KEY AUTOINCREMENT,
            service_range_id             INTEGER NOT NULL,
            old_price                    REAL NOT NULL DEFAULT 0,
            new_price                    REAL NOT NULL DEFAULT 0,
            changed_by                   INTEGER,
            note                         TEXT,
            changed_at                   TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (service_range_id) REFERENCES service_ranges(id) ON DELETE CASCADE,
            FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)



def _ensure_official_book_records_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS official_book_records (
            id                           INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_type               TEXT NOT NULL,
            entity_type                  TEXT,
            entity_id                    INTEGER,
            organization_id              INTEGER,
            service_id                   INTEGER,
            payment_id                   INTEGER,
            contract_period_id           INTEGER,
            provider_subscription_id     INTEGER,
            service_range_id             INTEGER,
            provider_price_history_id    INTEGER,
            service_range_history_id     INTEGER,
            official_book_date           TEXT NOT NULL,
            official_book_description    TEXT NOT NULL,
            created_by                   INTEGER,
            created_at                   TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
            FOREIGN KEY (service_id) REFERENCES organization_services(id) ON DELETE SET NULL,
            FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
            FOREIGN KEY (contract_period_id) REFERENCES service_contract_periods(id) ON DELETE SET NULL,
            FOREIGN KEY (provider_subscription_id) REFERENCES provider_subscriptions(id) ON DELETE SET NULL,
            FOREIGN KEY (service_range_id) REFERENCES service_ranges(id) ON DELETE SET NULL,
            FOREIGN KEY (provider_price_history_id) REFERENCES provider_subscription_price_history(id) ON DELETE SET NULL,
            FOREIGN KEY (service_range_history_id) REFERENCES service_range_price_history(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

def _seed_initial_contract_periods_for_existing_services(cursor):
    cursor.execute("""
        SELECT
            os.id,
            os.annual_amount,
            os.paid_amount,
            os.due_amount,
            os.contract_created_at,
            os.contract_duration_unit,
            os.contract_duration_value,
            os.payment_method,
            os.notes
        FROM organization_services os
        WHERE NOT EXISTS (
            SELECT 1
            FROM service_contract_periods scp
            WHERE scp.service_id = os.id
        )
    """)
    services = cursor.fetchall()

    for service in services:
        start_date = _safe_parse_date(service["contract_created_at"]) or date.today()
        duration_unit = service["contract_duration_unit"] or "شهري"
        duration_value = int(service["contract_duration_value"] or 1)
        end_date = _calculate_period_end_date(start_date, duration_unit, duration_value)

        base_amount = float(service["annual_amount"] or 0)
        paid_amount = float(service["paid_amount"] or 0)
        due_amount = float(service["due_amount"] or max(base_amount - paid_amount, 0))

        cursor.execute("""
            INSERT INTO service_contract_periods (
                service_id,
                period_number,
                period_label,
                start_date,
                end_date,
                contract_duration_unit,
                contract_duration_value,
                payment_method,
                base_amount,
                carried_debt,
                total_amount,
                paid_amount,
                due_amount,
                status,
                notes,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        """, (
            service["id"],
            1,
            "الفترة 1",
            start_date.isoformat(),
            end_date.isoformat(),
            duration_unit,
            duration_value,
            service["payment_method"] or "شهري",
            base_amount,
            0,
            base_amount,
            paid_amount,
            due_amount,
            "active",
            service["notes"]
        ))


def _link_old_payments_to_first_period(cursor):
    cursor.execute("""
        SELECT p.id, p.service_id
        FROM payments p
        WHERE p.contract_period_id IS NULL
    """)
    payments = cursor.fetchall()

    for payment in payments:
        cursor.execute("""
            SELECT id
            FROM service_contract_periods
            WHERE service_id = ?
            ORDER BY period_number ASC, id ASC
            LIMIT 1
        """, (payment["service_id"],))
        period = cursor.fetchone()

        if period:
            cursor.execute("""
                UPDATE payments
                SET contract_period_id = ?
                WHERE id = ?
            """, (period["id"], payment["id"]))


def _sync_service_summary_from_active_periods(cursor):
    cursor.execute("""
        SELECT
            os.id AS service_id,
            scp.id AS period_id,
            scp.start_date,
            scp.end_date,
            scp.payment_method,
            scp.contract_duration_unit,
            scp.contract_duration_value,
            scp.total_amount,
            scp.paid_amount,
            scp.due_amount
        FROM organization_services os
        LEFT JOIN service_contract_periods scp
            ON scp.service_id = os.id
           AND scp.status = 'active'
    """)
    rows = cursor.fetchall()

    for row in rows:
        if row["period_id"] is None:
            continue

        cursor.execute("""
            UPDATE organization_services
            SET
                annual_amount = ?,
                paid_amount = ?,
                due_amount = ?,
                contract_created_at = ?,
                contract_duration_unit = ?,
                contract_duration_value = ?,
                due_date = ?,
                payment_method = ?,
                updated_at = datetime('now')
            WHERE id = ?
        """, (
            float(row["total_amount"] or 0),
            float(row["paid_amount"] or 0),
            float(row["due_amount"] or 0),
            row["start_date"],
            row["contract_duration_unit"] or "شهري",
            int(row["contract_duration_value"] or 1),
            row["end_date"],
            row["payment_method"] or "شهري",
            row["service_id"]
        ))


def _ensure_default_users(cursor):
    default_users = [
        ("admin1", "a123", "admin"),
        ("user1", "u123", "user"),
    ]

    for username, password, role in default_users:
        cursor.execute("""
            SELECT id
            FROM users
            WHERE username = ?
        """, (username,))
        existing = cursor.fetchone()

        if existing:
            cursor.execute("""
                UPDATE users
                SET password = ?, role = ?
                WHERE username = ?
            """, (password, role, username))
        else:
            cursor.execute("""
                INSERT INTO users (username, password, role)
                VALUES (?, ?, ?)
            """, (username, password, role))


def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # ─────────────────────────────────────────────────────────────
    # USERS
    # ─────────────────────────────────────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT UNIQUE NOT NULL,
            password        TEXT NOT NULL,
            role            TEXT NOT NULL CHECK(role IN ('admin', 'user')),
            created_at      TEXT DEFAULT (datetime('now')),
            last_login      TEXT
        )
    """)

    _ensure_users_role_column(cursor)

    # ─────────────────────────────────────────────────────────────
    # ORGANIZATIONS
    # ─────────────────────────────────────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS organizations (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL UNIQUE,
            phone           TEXT,
            address         TEXT,
            location        TEXT,
            status          TEXT DEFAULT 'active'
                            CHECK(status IN ('active', 'inactive', 'pending')),
            notes           TEXT,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        )
    """)

    # ─────────────────────────────────────────────────────────────
    # PROVIDER COMPANIES
    # ─────────────────────────────────────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS provider_companies (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL UNIQUE,
            phone           TEXT,
            address         TEXT,
            email           TEXT,
            is_active       INTEGER DEFAULT 1,
            created_at      TEXT DEFAULT (datetime('now'))
        )
    """)

    # ─────────────────────────────────────────────────────────────
    # PROVIDER SUBSCRIPTIONS
    # ─────────────────────────────────────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS provider_subscriptions (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_company_id INTEGER NOT NULL,
            service_type        TEXT NOT NULL
                                CHECK(service_type IN ('Wireless', 'FTTH', 'Optical', 'Other')),
            item_category       TEXT NOT NULL
                                CHECK(item_category IN ('Line', 'Bundle', 'Other')),
            item_name           TEXT NOT NULL,
            price               REAL NOT NULL DEFAULT 0,
            unit_label          TEXT,
            created_at          TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (provider_company_id) REFERENCES provider_companies(id) ON DELETE CASCADE
        )
    """)

    # ─────────────────────────────────────────────────────────────
    # ORGANIZATION SERVICES
    # ─────────────────────────────────────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS organization_services (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id         INTEGER NOT NULL,
            service_type            TEXT NOT NULL
                                    CHECK(service_type IN ('Wireless', 'FTTH', 'Optical', 'Other')),
            payment_method          TEXT NOT NULL DEFAULT 'شهري'
                                    CHECK(payment_method IN ('يومي', 'شهري', 'كل 3 أشهر', 'سنوي')),
            payment_interval_days   INTEGER DEFAULT 1,
            device_ownership        TEXT NOT NULL DEFAULT 'الشركة'
                                    CHECK(device_ownership IN ('الشركة', 'المنظمة', 'الوزارة')),
            annual_amount           REAL NOT NULL DEFAULT 0,
            paid_amount             REAL NOT NULL DEFAULT 0,
            due_amount              REAL NOT NULL DEFAULT 0,
            contract_created_at     TEXT,
            contract_duration_unit  TEXT NOT NULL DEFAULT 'شهري'
                                    CHECK(contract_duration_unit IN ('يومي', 'شهري', 'سنوي')),
            contract_duration_value INTEGER NOT NULL DEFAULT 1,
            due_date                TEXT,
            last_payment_amount     REAL DEFAULT 0,
            last_payment_date       TEXT,
            notes                   TEXT,
            is_active               INTEGER DEFAULT 1,
            created_at              TEXT DEFAULT (datetime('now')),
            updated_at              TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
        )
    """)

    # ─────────────────────────────────────────────────────────────
    # SERVICE ITEMS
    # ─────────────────────────────────────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS service_items (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            service_id              INTEGER NOT NULL,
            item_category           TEXT NOT NULL
                                    CHECK(item_category IN ('Line', 'Bundle', 'Other')),
            provider_company_id     INTEGER,
            item_name               TEXT,
            line_type               TEXT,
            bundle_type             TEXT,
            quantity                REAL NOT NULL DEFAULT 1,
            unit_price              REAL NOT NULL DEFAULT 0,
            total_price             REAL NOT NULL DEFAULT 0,
            notes                   TEXT,
            created_at              TEXT DEFAULT (datetime('now')),
            updated_at              TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (service_id) REFERENCES organization_services(id) ON DELETE CASCADE,
            FOREIGN KEY (provider_company_id) REFERENCES provider_companies(id) ON DELETE SET NULL
        )
    """)

    # ─────────────────────────────────────────────────────────────
    # PAYMENTS
    # ─────────────────────────────────────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS payments (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            service_id          INTEGER NOT NULL,
            amount              REAL NOT NULL,
            payment_date        TEXT NOT NULL,
            note                TEXT,
            created_by          INTEGER,
            created_at          TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (service_id) REFERENCES organization_services(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

    # ─────────────────────────────────────────────────────────────
    # ACTIVITY LOG
    # ─────────────────────────────────────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_log (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id             INTEGER,
            action              TEXT NOT NULL,
            entity_type         TEXT,
            entity_id           INTEGER,
            details             TEXT,
            created_at          TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

    # ─────────────────────────────────────────────────────────────
    # SPECIAL SERVICE RANGES
    # ─────────────────────────────────────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS service_ranges (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            service_name    TEXT NOT NULL,
            range_from      INTEGER NOT NULL,
            range_to        INTEGER NOT NULL,
            price           REAL NOT NULL DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now'))
        )
    """)

    # ─────────────────────────────────────────────────────────────
    # NEW TABLES / MIGRATIONS FOR AUTO-RENEW CONTRACT PERIODS
    # ─────────────────────────────────────────────────────────────
    _ensure_payments_contract_period_column(cursor)
    _ensure_service_contract_periods_table(cursor)
    _ensure_price_history_tables(cursor)
    _ensure_official_book_records_table(cursor)
    _ensure_service_suspension_columns(cursor)
    _ensure_service_suspensions_table(cursor)

    # ─────────────────────────────────────────────────────────────
    # INDEXES
    # ─────────────────────────────────────────────────────────────
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_org_name ON organizations(name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_provider_name ON provider_companies(name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_service_org ON organization_services(organization_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_item_service ON service_items(service_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_payment_service ON payments(service_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_payment_contract_period ON payments(contract_period_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_log(created_at DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_service_ranges_name ON service_ranges(service_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_period_service ON service_contract_periods(service_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_period_service_status ON service_contract_periods(service_id, status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_period_dates ON service_contract_periods(start_date, end_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_psh_subscription ON provider_subscription_price_history(provider_subscription_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_srh_range ON service_range_price_history(service_range_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_obr_created_at ON official_book_records(created_at DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_obr_operation_type ON official_book_records(operation_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_obr_service ON official_book_records(service_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_obr_org ON official_book_records(organization_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_service_status ON organization_services(service_status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_suspension_service ON service_suspensions(service_id, status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_suspension_effective_date ON service_suspensions(effective_date)")

    # ─────────────────────────────────────────────────────────────
    # SEED USERS
    # ─────────────────────────────────────────────────────────────
    _ensure_default_users(cursor)

    # ─────────────────────────────────────────────────────────────
    # SEED PROVIDER COMPANIES
    # ─────────────────────────────────────────────────────────────
    cursor.execute("SELECT COUNT(*) FROM provider_companies")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("""
            INSERT INTO provider_companies (name)
            VALUES (?)
        """, [
            ('Huawei',),
            ('Nokia',),
            ('ZTE',),
            ('FiberHome',)
        ])

    # ─────────────────────────────────────────────────────────────
    # SEED ORGANIZATIONS
    # ─────────────────────────────────────────────────────────────
    cursor.execute("SELECT COUNT(*) FROM organizations")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("""
            INSERT INTO organizations (name, phone, address, location, status)
            VALUES (?, ?, ?, ?, ?)
        """, [
            ('Tech Solutions Inc.', '+9647501234567', '123 Technology Street', 'Baghdad', 'active'),
            ('Global Industries Ltd.', '+9647502345678', '456 Business Avenue', 'Erbil', 'active'),
            ('Modern Business Solutions', '+9647506789012', '987 Modern Street', 'Karbala', 'pending')
        ])

    # ─────────────────────────────────────────────────────────────
    # DATA MIGRATION FOR EXISTING PROJECT DATA
    # ─────────────────────────────────────────────────────────────
    _seed_initial_contract_periods_for_existing_services(cursor)
    _link_old_payments_to_first_period(cursor)
    _sync_service_summary_from_active_periods(cursor)

    conn.commit()
    conn.close()
    print(f"✅ Database initialized at: {DB_PATH}")


if __name__ == '__main__':
    init_db()