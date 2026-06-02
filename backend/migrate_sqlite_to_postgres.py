import sqlite3
import psycopg2
from psycopg2.extras import execute_values

SQLITE_DB = "itpc.db"

PG_CONFIG = {
    "host": "localhost",
    "port": 5433,
    "dbname": "itpc_db",
    "user": "itpc_user",
    "password": "itpc_password",
}

TABLES = [
    "users",
    "organizations",
    "provider_companies",
    "provider_subscriptions",
    "organization_services",
    "service_ranges",
    "service_contract_periods",
    "service_items",
    "payments",
    "activity_log",
    "provider_subscription_price_history",
    "service_range_price_history",
    "official_book_records",
    "service_suspensions",
]


def migrate_table(sqlite_conn, pg_conn, table):
    sqlite_cursor = sqlite_conn.cursor()
    sqlite_cursor.execute(f"SELECT * FROM {table}")
    rows = sqlite_cursor.fetchall()

    if not rows:
        print(f"⚠️ {table}: no rows")
        return

    columns = [desc[0] for desc in sqlite_cursor.description]
    column_list = ", ".join(columns)

    values = [tuple(row[col] for col in columns) for row in rows]

    query = f"""
        INSERT INTO {table} ({column_list})
        VALUES %s
        ON CONFLICT DO NOTHING
    """

    with pg_conn.cursor() as pg_cursor:
        execute_values(pg_cursor, query, values)

    print(f"✅ {table}: migrated {len(rows)} rows")


def reset_sequences(pg_conn):
    with pg_conn.cursor() as cursor:
        for table in TABLES:
            cursor.execute(f"""
                SELECT setval(
                    pg_get_serial_sequence('{table}', 'id'),
                    COALESCE((SELECT MAX(id) FROM {table}), 1),
                    true
                );
            """)
    print("✅ PostgreSQL sequences reset")


def main():
    sqlite_conn = sqlite3.connect(SQLITE_DB)
    sqlite_conn.row_factory = sqlite3.Row

    pg_conn = psycopg2.connect(**PG_CONFIG)
    pg_conn.autocommit = False

    try:
        for table in TABLES:
            migrate_table(sqlite_conn, pg_conn, table)

        reset_sequences(pg_conn)

        pg_conn.commit()
        print("\n🎉 Migration completed successfully")

    except Exception as e:
        pg_conn.rollback()
        print("\n❌ Migration failed")
        print(e)

    finally:
        sqlite_conn.close()
        pg_conn.close()


if __name__ == "__main__":
    main()