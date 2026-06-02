"""
ITPC Management System — Flask + SQLite Backend
================================================
Run:  python app.py
API base: http://localhost:5000/api

Schema: users, organizations, provider_companies, provider_subscriptions,
        organization_services, service_items, payments, activity_log,
        service_contract_periods
"""

from dotenv import load_dotenv
import os

load_dotenv()

from flask import Flask, request, jsonify, Response
import sqlite3
from datetime import datetime, timedelta
from database import get_db, init_db
app = Flask(__name__)

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-later")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///itpc.db")
PORT = int(os.getenv("PORT", 5000))

app.config['SECRET_KEY'] = SECRET_KEY

# Database init on import (safe when Flask is started via flask run or similar)
try:
    init_db()
except Exception as _db_init_error:
    print(f"⚠️ Database init warning: {_db_init_error}")


# ── CORS headers ─────────────────────────────────────────────────────────────
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-User-Id'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response


@app.route('/', defaults={'path': ''}, methods=['OPTIONS'])
@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    return jsonify({}), 200


# ── Helpers ───────────────────────────────────────────────────────────────────
def row_to_dict(row):
    return dict(row) if row else None


def rows_to_list(rows):
    return [dict(r) for r in rows]


# ── Auth helpers ─────────────────────────────────────────────────────────────
def get_current_user_from_headers(conn):
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return None

    try:
        user_id = int(user_id)
    except ValueError:
        return None

    return row_to_dict(conn.execute(
        "SELECT id, username, role, created_at, last_login FROM users WHERE id = ?",
        (user_id,)
    ).fetchone())


def require_admin(conn):
    current_user = get_current_user_from_headers(conn)

    if not current_user:
        return None, jsonify({'error': 'Authentication required'}), 401

    if current_user.get('role') != 'admin':
        return None, jsonify({'error': 'Admin access required'}), 403

    return current_user, None, None


def log_action(conn, user_id, action, entity_type=None, entity_id=None, details=None):
    conn.execute(
        "INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)",
        (user_id, action, entity_type, entity_id, details)
    )




def validate_official_book_fields(data, require_for_operation=False):
    official_book_date = str((data or {}).get('official_book_date') or '').strip()
    official_book_description = str((data or {}).get('official_book_description') or '').strip()

    if not require_for_operation and not official_book_date and not official_book_description:
        return None, None, None

    if not official_book_date:
        return None, None, 'official_book_date is required'

    if not parse_date(official_book_date):
        return None, None, 'official_book_date is invalid'

    if not official_book_description:
        return None, None, 'official_book_description is required'

    return format_date(parse_date(official_book_date)), official_book_description, None


def create_official_book_record(
    conn,
    operation_type,
    official_book_date,
    official_book_description,
    created_by=None,
    entity_type=None,
    entity_id=None,
    organization_id=None,
    service_id=None,
    payment_id=None,
    contract_period_id=None,
    provider_subscription_id=None,
    service_range_id=None,
    provider_price_history_id=None,
    service_range_history_id=None,
):
    cursor = conn.execute(
        """INSERT INTO official_book_records (
               operation_type, entity_type, entity_id, organization_id, service_id, payment_id,
               contract_period_id, provider_subscription_id, service_range_id,
               provider_price_history_id, service_range_history_id,
               official_book_date, official_book_description, created_by
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            operation_type, entity_type, entity_id, organization_id, service_id, payment_id,
            contract_period_id, provider_subscription_id, service_range_id,
            provider_price_history_id, service_range_history_id,
            official_book_date, official_book_description, created_by
        )
    )
    return cursor.lastrowid


def get_latest_official_book_for_payment(conn, payment_id):
    return row_to_dict(conn.execute(
        """SELECT obr.*
           FROM official_book_records obr
           WHERE obr.payment_id = ?
           ORDER BY obr.created_at DESC, obr.id DESC
           LIMIT 1""",
        (payment_id,)
    ).fetchone())

def get_latest_service_suspension(conn, service_id):
    return row_to_dict(conn.execute(
        """SELECT ss.*
           FROM service_suspensions ss
           WHERE ss.service_id = ?
           ORDER BY ss.created_at DESC, ss.id DESC
           LIMIT 1""",
        (service_id,)
    ).fetchone())


def get_pending_service_suspension(conn, service_id):
    return row_to_dict(conn.execute(
        """SELECT ss.*
           FROM service_suspensions ss
           WHERE ss.service_id = ? AND ss.status = 'scheduled'
           ORDER BY ss.effective_date ASC, ss.id ASC
           LIMIT 1""",
        (service_id,)
    ).fetchone())


def execute_service_suspension(conn, service_row, suspension_row, executed_at=None):
    if not service_row or not suspension_row:
        return None

    if executed_at is None:
        executed_at = datetime.now()
    elif isinstance(executed_at, str):
        executed_at = parse_date(executed_at) or datetime.now()

    executed_at_text = executed_at.strftime('%Y-%m-%d %H:%M:%S')
    effective_date = format_date(parse_date(suspension_row.get('effective_date')) or executed_at)
    refund_amount = max(float(suspension_row.get('refund_amount') or 0), 0)

    active_period = get_active_contract_period(conn, service_row['id'])
    dropped_due_amount = 0
    retained_total_amount = max(float(service_row.get('paid_amount') or 0) - refund_amount, 0)
    contract_period_id = None

    if active_period:
        contract_period_id = active_period['id']
        dropped_due_amount = max(float(active_period.get('due_amount') or 0), 0)
        retained_total_amount = max(float(active_period.get('paid_amount') or 0) - refund_amount, 0)
        conn.execute(
            """UPDATE service_contract_periods SET
                   total_amount = ?,
                   due_amount = 0,
                   status = 'closed',
                   closed_reason = ?,
                   closed_at = ?,
                   updated_at = datetime('now')
               WHERE id = ?""",
            (retained_total_amount, 'suspended', executed_at_text, active_period['id'])
        )

    conn.execute(
        """UPDATE organization_services SET
               is_active = 0,
               service_status = 'suspended',
               due_amount = 0,
               annual_amount = ?,
               due_date = ?,
               suspension_effective_date = ?,
               suspended_at = ?,
               scheduled_suspend_at = NULL,
               suspension_refund_amount = ?,
               suspension_dropped_amount = ?,
               suspension_note = ?,
               updated_at = datetime('now')
           WHERE id = ?""",
        (
            retained_total_amount,
            effective_date,
            effective_date,
            executed_at_text,
            refund_amount,
            dropped_due_amount,
            suspension_row.get('note'),
            service_row['id']
        )
    )

    conn.execute(
        """UPDATE service_suspensions SET
               status = 'executed',
               executed_at = ?,
               dropped_due_amount = ?,
               contract_period_id = COALESCE(contract_period_id, ?),
               updated_at = datetime('now')
           WHERE id = ?""",
        (executed_at_text, dropped_due_amount, contract_period_id, suspension_row['id'])
    )

    log_action(
        conn,
        suspension_row.get('created_by'),
        f"Suspended service {service_row['id']}",
        entity_type='service_suspension',
        entity_id=suspension_row['id'],
        details=(
            f"service_id={service_row['id']}, effective_date={effective_date}, "
            f"dropped_due_amount={dropped_due_amount}, refund_amount={refund_amount}, "
            f"contract_period_id={contract_period_id or '-'}"
        )
    )

    return row_to_dict(conn.execute(
        "SELECT * FROM organization_services WHERE id = ?",
        (service_row['id'],)
    ).fetchone())


def apply_scheduled_service_suspension_if_due(conn, service_id, reference_date=None):
    service = row_to_dict(conn.execute(
        "SELECT * FROM organization_services WHERE id = ?",
        (service_id,)
    ).fetchone())

    if not service:
        return None

    if str(service.get('service_status') or 'active') == 'suspended':
        return service

    if reference_date is None:
        ref_dt = datetime.now()
    elif isinstance(reference_date, datetime):
        ref_dt = reference_date
    else:
        ref_dt = parse_date(reference_date) or datetime.now()

    pending = get_pending_service_suspension(conn, service_id)
    if not pending:
        return service

    effective_dt = parse_date(pending.get('effective_date'))
    if not effective_dt:
        return service

    if ref_dt.date() < effective_dt.date():
        if str(service.get('service_status') or 'active') != 'scheduled_suspend':
            conn.execute(
                """UPDATE organization_services SET
                       service_status = 'scheduled_suspend',
                       scheduled_suspend_at = ?,
                       suspension_effective_date = ?,
                       suspension_refund_amount = ?,
                       suspension_note = ?,
                       updated_at = datetime('now')
                   WHERE id = ?""",
                (
                    format_date(effective_dt),
                    format_date(effective_dt),
                    max(float(pending.get('refund_amount') or 0), 0),
                    pending.get('note'),
                    service_id
                )
            )
            service = row_to_dict(conn.execute(
                "SELECT * FROM organization_services WHERE id = ?",
                (service_id,)
            ).fetchone())
        return service

    return execute_service_suspension(conn, service, pending, executed_at=ref_dt)


def normalize_device_ownership(value):
    value = (value or '').strip()
    mapping = {
        'ايجار': 'الشركة',
        'مدفوع الثمن': 'المنظمة',
        'الشركة': 'الشركة',
        'المنظمة': 'المنظمة',
        'الوزارة': 'الوزارة',
    }
    return mapping.get(value, value)


def parse_date(date_str):
    if not date_str:
        return None

    date_str = str(date_str).strip()
    formats = [
        '%Y-%m-%d',
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%dT%H:%M',
        '%Y-%m-%dT%H:%M:%S.%f',
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except Exception:
            pass

    try:
        return datetime.fromisoformat(date_str)
    except Exception:
        return None


def format_date(dt):
    if not dt:
        return None
    return dt.strftime('%Y-%m-%d')


def add_months(dt, months):
    if not dt:
        return None

    month = dt.month - 1 + months
    year = dt.year + month // 12
    month = month % 12 + 1

    month_lengths = [
        31,
        29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31
    ]
    day = min(dt.day, month_lengths[month - 1])

    return dt.replace(year=year, month=month, day=day)


def calculate_next_due_date(base_date, payment_method, payment_interval_days=None):
    dt = parse_date(base_date)
    if not dt:
        return None

    if payment_method == 'يومي':
        days = int(payment_interval_days or 1)
        if days < 1:
            days = 1
        return format_date(dt + timedelta(days=days))

    if payment_method == 'شهري':
        return format_date(add_months(dt, 1))

    if payment_method == 'كل 3 أشهر':
        return format_date(add_months(dt, 3))

    if payment_method == 'سنوي':
        return format_date(add_months(dt, 12))

    return None


def calculate_contract_period_end_date(start_date, duration_unit, duration_value):
    dt = parse_date(start_date)
    if not dt:
        dt = datetime.now()

    duration_value = int(duration_value or 1)
    duration_unit = (duration_unit or 'شهري').strip()

    if duration_value < 1:
        duration_value = 1

    if duration_unit == 'يومي':
        end_dt = dt + timedelta(days=duration_value)
    elif duration_unit == 'شهري':
        end_dt = add_months(dt, duration_value)
    elif duration_unit == 'سنوي':
        end_dt = add_months(dt, duration_value * 12)
    else:
        end_dt = add_months(dt, 1)

    return format_date(end_dt)


def calculate_contract_total(base_monthly_amount, duration_unit, duration_value):
    base = float(base_monthly_amount or 0)
    duration_value = int(duration_value or 1)

    if duration_value < 1:
        duration_value = 1

    duration_unit = (duration_unit or 'شهري').strip()

    if duration_unit == 'يومي':
        return (base / 30.0) * duration_value

    if duration_unit == 'شهري':
        return base * duration_value

    if duration_unit == 'سنوي':
        return base * 12 * duration_value

    return base


def derive_base_monthly_amount_from_total(total_amount, duration_unit, duration_value):
    total_amount = float(total_amount or 0)
    duration_value = int(duration_value or 1)

    if duration_value < 1:
        duration_value = 1

    duration_unit = (duration_unit or 'شهري').strip()

    if total_amount <= 0:
        return 0.0

    if duration_unit == 'يومي':
        return (total_amount / duration_value) * 30.0

    if duration_unit == 'شهري':
        return total_amount / duration_value

    if duration_unit == 'سنوي':
        return total_amount / (12 * duration_value)

    return total_amount


def get_service_base_monthly_from_items(conn, service_id):
    row = conn.execute(
        "SELECT COALESCE(SUM(COALESCE(quantity, 0) * COALESCE(unit_price, 0)), 0) AS total FROM service_items WHERE service_id = ?",
        (service_id,)
    ).fetchone()
    return float(row['total'] or 0)


def get_service_contract_context(conn, service_id):
    service = row_to_dict(conn.execute(
        "SELECT id, contract_duration_unit, contract_duration_value FROM organization_services WHERE id = ?",
        (service_id,)
    ).fetchone())

    if not service:
        return {'contract_duration_unit': 'شهري', 'contract_duration_value': 1}

    return {
        'contract_duration_unit': service.get('contract_duration_unit') or 'شهري',
        'contract_duration_value': int(service.get('contract_duration_value') or 1),
    }


def calculate_service_item_contract_total(quantity, unit_price, duration_unit, duration_value):
    base_monthly_total = float(quantity or 0) * float(unit_price or 0)
    return calculate_contract_total(base_monthly_total, duration_unit, duration_value)


def recalculate_service_items_contract_totals(conn, service_id):
    context = get_service_contract_context(conn, service_id)
    duration_unit = context['contract_duration_unit']
    duration_value = context['contract_duration_value']

    items = rows_to_list(conn.execute(
        "SELECT id, quantity, unit_price FROM service_items WHERE service_id = ?",
        (service_id,)
    ).fetchall())

    for item in items:
        contract_total = calculate_service_item_contract_total(
            item.get('quantity'),
            item.get('unit_price'),
            duration_unit,
            duration_value,
        )
        conn.execute(
            "UPDATE service_items SET total_price = ?, updated_at = datetime('now') WHERE id = ?",
            (contract_total, item['id'])
        )

    return len(items)


def calculate_locked_paid_and_new_due(old_base_amount, new_base_amount, duration_unit, duration_value, carried_debt, paid_amount):
    old_base_total = calculate_contract_total(old_base_amount, duration_unit, duration_value)
    new_base_total = calculate_contract_total(new_base_amount, duration_unit, duration_value)

    carried_debt = float(carried_debt or 0)
    paid_amount = float(paid_amount or 0)

    paid_toward_carried_debt = min(paid_amount, carried_debt)
    remaining_carried_debt = max(carried_debt - paid_toward_carried_debt, 0)

    paid_toward_current_period = max(paid_amount - paid_toward_carried_debt, 0)

    if old_base_total > 0:
        paid_ratio = min(max(paid_toward_current_period / old_base_total, 0), 1)
    else:
        paid_ratio = 0

    unpaid_ratio = max(1 - paid_ratio, 0)
    recalculated_unpaid_base = new_base_total * unpaid_ratio
    new_due_amount = max(remaining_carried_debt + recalculated_unpaid_base, 0)
    new_total_amount = paid_amount + new_due_amount

    return {
        'old_base_total': old_base_total,
        'new_base_total': new_base_total,
        'paid_ratio': paid_ratio,
        'unpaid_ratio': unpaid_ratio,
        'remaining_carried_debt': remaining_carried_debt,
        'new_due_amount': new_due_amount,
        'new_total_amount': new_total_amount,
    }


def recalculate_active_period_pricing(conn, service_id, new_base_amount=None, notes=None):
    renew_service_if_needed(conn, service_id)

    active_period = get_active_contract_period(conn, service_id)
    if not active_period:
        active_period = create_first_contract_period(conn, service_id)

    if not active_period:
        return None

    duration_unit = active_period.get('contract_duration_unit') or 'شهري'
    duration_value = int(active_period.get('contract_duration_value') or 1)
    old_base_amount = float(active_period.get('base_amount') or 0)
    carried_debt = float(active_period.get('carried_debt') or 0)
    paid_amount = float(active_period.get('paid_amount') or 0)

    if new_base_amount is None:
        new_base_amount = get_service_base_monthly_from_items(conn, service_id)

    new_base_amount = float(new_base_amount or 0)

    pricing = calculate_locked_paid_and_new_due(
        old_base_amount,
        new_base_amount,
        duration_unit,
        duration_value,
        carried_debt,
        paid_amount,
    )

    conn.execute(
        """UPDATE service_contract_periods SET
               base_amount = ?,
               total_amount = ?,
               due_amount = ?,
               notes = COALESCE(?, notes),
               updated_at = datetime('now')
           WHERE id = ?""",
        (
            new_base_amount,
            pricing['new_total_amount'],
            pricing['new_due_amount'],
            notes,
            active_period['id']
        )
    )

    sync_service_summary_from_period(conn, service_id)
    return get_active_contract_period(conn, service_id)


def _normalize_selected_org_ids(selected_org_ids):
    if not selected_org_ids:
        return None
    normalized = set()
    for v in selected_org_ids:
        try:
            normalized.add(int(v))
        except Exception:
            pass
    return normalized


def get_affected_organizations_for_provider_subscription(conn, subscription_row):
    company_id = subscription_row['provider_company_id']
    service_type = subscription_row['service_type']
    item_category = subscription_row['item_category']
    item_name = subscription_row['item_name']

    rows = rows_to_list(conn.execute(
        """SELECT
               o.id AS organization_id,
               o.name AS organization_name,
               os.id AS service_id,
               si.id AS item_id,
               si.quantity,
               si.unit_price,
               si.total_price
           FROM service_items si
           JOIN organization_services os ON os.id = si.service_id
           JOIN organizations o ON o.id = os.organization_id
           WHERE si.provider_company_id = ?
             AND os.service_type = ?
             AND si.item_category = ?
             AND si.item_name = ?
           ORDER BY o.name ASC""",
        (company_id, service_type, item_category, item_name)
    ).fetchall())

    grouped = {}
    for row in rows:
        oid = row['organization_id']
        grouped.setdefault(oid, {
            'organization_id': oid,
            'organization_name': row['organization_name'],
            'service_ids': set(),
            'items_count': 0,
        })
        grouped[oid]['service_ids'].add(row['service_id'])
        grouped[oid]['items_count'] += 1

    result = []
    for g in grouped.values():
        g['service_ids'] = sorted(g['service_ids'])
        g['services_count'] = len(g['service_ids'])
        result.append(g)

    result.sort(key=lambda x: x['organization_name'])
    return result


def get_affected_organizations_for_service_range(conn, service_name, range_from, range_to):
    rows = rows_to_list(conn.execute(
        """SELECT
               o.id AS organization_id,
               o.name AS organization_name,
               os.id AS service_id,
               si.id AS item_id,
               si.quantity,
               si.unit_price,
               si.total_price
           FROM service_items si
           JOIN organization_services os ON os.id = si.service_id
           JOIN organizations o ON o.id = os.organization_id
           WHERE si.item_category = 'Bundle'
             AND si.bundle_type = ?
             AND COALESCE(si.provider_company_id, 0) = 0
             AND CAST(COALESCE(si.quantity, 0) AS REAL) >= ?
             AND CAST(COALESCE(si.quantity, 0) AS REAL) <= ?
           ORDER BY o.name ASC""",
        (service_name, float(range_from), float(range_to))
    ).fetchall())

    grouped = {}
    for row in rows:
        oid = row['organization_id']
        grouped.setdefault(oid, {
            'organization_id': oid,
            'organization_name': row['organization_name'],
            'service_ids': set(),
            'items_count': 0,
        })
        grouped[oid]['service_ids'].add(row['service_id'])
        grouped[oid]['items_count'] += 1

    result = []
    for g in grouped.values():
        g['service_ids'] = sorted(g['service_ids'])
        g['services_count'] = len(g['service_ids'])
        result.append(g)

    result.sort(key=lambda x: x['organization_name'])
    return result


def reprice_contracts_for_provider_subscription(conn, subscription_before, subscription_after, selected_org_ids=None):
    old_company_id = subscription_before['provider_company_id']
    new_company_id = subscription_after['provider_company_id']

    old_service_type = subscription_before['service_type']
    old_item_category = subscription_before['item_category']
    old_item_name = subscription_before['item_name']
    new_item_name = subscription_after['item_name']
    new_price = float(subscription_after['price'] or 0)

    selected_org_ids = _normalize_selected_org_ids(selected_org_ids)

    matched_items = rows_to_list(conn.execute(
        """SELECT si.*, os.service_type, os.organization_id
           FROM service_items si
           JOIN organization_services os ON os.id = si.service_id
           WHERE si.provider_company_id = ?
             AND os.service_type = ?
             AND si.item_category = ?
             AND si.item_name = ?""",
        (old_company_id, old_service_type, old_item_category, old_item_name)
    ).fetchall())

    touched_service_ids = set()
    affected_org_ids = set()

    for item in matched_items:
        org_id = int(item.get('organization_id') or 0)
        if selected_org_ids is not None and org_id not in selected_org_ids:
            continue

        quantity = float(item.get('quantity') or 0)
        new_total_price = quantity * new_price

        conn.execute(
            """UPDATE service_items SET
                   provider_company_id = ?,
                   item_name = ?,
                   unit_price = ?,
                   total_price = ?,
                   updated_at = datetime('now')
               WHERE id = ?""",
            (new_company_id, new_item_name, new_price, new_total_price, item['id'])
        )
        touched_service_ids.add(item['service_id'])
        affected_org_ids.add(org_id)

    for service_id in touched_service_ids:
        recalculate_active_period_pricing(conn, service_id)

    return len(affected_org_ids), len(matched_items if selected_org_ids is None else [i for i in matched_items if int(i.get('organization_id') or 0) in selected_org_ids]), len(touched_service_ids)


def reprice_contracts_for_service_range(conn, service_name, range_from, range_to, new_price, selected_org_ids=None):
    selected_org_ids = _normalize_selected_org_ids(selected_org_ids)

    matched_items = rows_to_list(conn.execute(
        """SELECT si.*, os.organization_id
           FROM service_items si
           JOIN organization_services os ON os.id = si.service_id
           WHERE si.item_category = 'Bundle'
             AND si.bundle_type = ?
             AND COALESCE(si.provider_company_id, 0) = 0
             AND CAST(COALESCE(si.quantity, 0) AS REAL) >= ?
             AND CAST(COALESCE(si.quantity, 0) AS REAL) <= ?""",
        (service_name, float(range_from), float(range_to))
    ).fetchall())

    touched_service_ids = set()
    affected_org_ids = set()
    touched_items_count = 0

    for item in matched_items:
        org_id = int(item.get('organization_id') or 0)
        if selected_org_ids is not None and org_id not in selected_org_ids:
            continue

        quantity = float(item.get('quantity') or 0)
        new_total_price = quantity * float(new_price or 0)
        conn.execute(
            """UPDATE service_items SET
                   unit_price = ?,
                   total_price = ?,
                   updated_at = datetime('now')
               WHERE id = ?""",
            (float(new_price or 0), new_total_price, item['id'])
        )
        touched_service_ids.add(item['service_id'])
        affected_org_ids.add(org_id)
        touched_items_count += 1

    for service_id in touched_service_ids:
        recalculate_active_period_pricing(conn, service_id)

    return len(affected_org_ids), touched_items_count, len(touched_service_ids)


def save_provider_subscription_price_history(conn, subscription_id, old_price, new_price, changed_by=None, note=None):
    cursor = conn.execute(
        """INSERT INTO provider_subscription_price_history
           (provider_subscription_id, old_price, new_price, changed_by, note)
           VALUES (?, ?, ?, ?, ?)""",
        (subscription_id, float(old_price or 0), float(new_price or 0), changed_by, note)
    )
    return cursor.lastrowid


def save_service_range_price_history(conn, service_range_id, old_price, new_price, changed_by=None, note=None):
    cursor = conn.execute(
        """INSERT INTO service_range_price_history
           (service_range_id, old_price, new_price, changed_by, note)
           VALUES (?, ?, ?, ?, ?)""",
        (service_range_id, float(old_price or 0), float(new_price or 0), changed_by, note)
    )
    return cursor.lastrowid


def get_active_contract_period(conn, service_id):
    return row_to_dict(conn.execute(
        """SELECT *
           FROM service_contract_periods
           WHERE service_id = ? AND status = 'active'
           ORDER BY period_number DESC, id DESC
           LIMIT 1""",
        (service_id,)
    ).fetchone())


def get_latest_contract_period(conn, service_id):
    return row_to_dict(conn.execute(
        """SELECT *
           FROM service_contract_periods
           WHERE service_id = ?
           ORDER BY period_number DESC, id DESC
           LIMIT 1""",
        (service_id,)
    ).fetchone())


def sync_service_summary_from_period(conn, service_id):
    service = row_to_dict(conn.execute(
        "SELECT * FROM organization_services WHERE id = ?",
        (service_id,)
    ).fetchone())

    if not service:
        return None

    active_period = get_active_contract_period(conn, service_id)
    if not active_period:
        return service

    conn.execute(
        """UPDATE organization_services SET
               annual_amount = ?,
               paid_amount = ?,
               due_amount = ?,
               contract_created_at = ?,
               contract_duration_unit = ?,
               contract_duration_value = ?,
               due_date = ?,
               payment_method = ?,
               notes = COALESCE(notes, ?),
               updated_at = datetime('now')
           WHERE id = ?""",
        (
            float(active_period['total_amount'] or 0),
            float(active_period['paid_amount'] or 0),
            float(active_period['due_amount'] or 0),
            active_period['start_date'],
            active_period['contract_duration_unit'],
            int(active_period['contract_duration_value'] or 1),
            active_period['end_date'],
            active_period['payment_method'],
            active_period.get('notes'),
            service_id
        )
    )

    return row_to_dict(conn.execute(
        "SELECT * FROM organization_services WHERE id = ?",
        (service_id,)
    ).fetchone())


def create_first_contract_period(conn, service_id):
    service = row_to_dict(conn.execute(
        "SELECT * FROM organization_services WHERE id = ?",
        (service_id,)
    ).fetchone())

    if not service:
        return None

    existing_period = get_active_contract_period(conn, service_id)
    if existing_period:
        return existing_period

    start_date = service.get('contract_created_at') or format_date(datetime.now())
    duration_unit = service.get('contract_duration_unit') or 'شهري'
    duration_value = int(service.get('contract_duration_value') or 1)
    payment_method = service.get('payment_method') or 'شهري'

    base_from_items = get_service_base_monthly_from_items(conn, service_id)
    if base_from_items > 0:
        base_amount = base_from_items
    else:
        base_amount = derive_base_monthly_amount_from_total(
            service.get('annual_amount', 0),
            duration_unit,
            duration_value
        )

    total_amount = calculate_contract_total(base_amount, duration_unit, duration_value)
    paid_amount = float(service.get('paid_amount') or 0)
    due_amount = max(total_amount - paid_amount, 0)
    end_date = calculate_contract_period_end_date(start_date, duration_unit, duration_value)

    cursor = conn.execute(
        """INSERT INTO service_contract_periods
           (service_id, period_number, period_label, start_date, end_date,
            contract_duration_unit, contract_duration_value, payment_method,
            base_amount, carried_debt, total_amount, paid_amount, due_amount,
            status, notes, renewal_created_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, datetime('now'), datetime('now'), datetime('now'))""",
        (
            service_id,
            1,
            'الفترة 1',
            start_date,
            end_date,
            duration_unit,
            duration_value,
            payment_method,
            base_amount,
            0,
            total_amount,
            paid_amount,
            due_amount,
            service.get('notes')
        )
    )

    new_period_id = cursor.lastrowid

    conn.execute(
        """UPDATE payments
           SET contract_period_id = ?
           WHERE service_id = ? AND contract_period_id IS NULL""",
        (new_period_id, service_id)
    )

    sync_service_summary_from_period(conn, service_id)

    log_action(
        conn,
        None,
        f"Created first contract period for service {service_id}",
        entity_type='contract_period',
        entity_id=new_period_id,
        details=(
            f"service_id={service_id}, period_number=1, base_amount={base_amount}, "
            f"total_amount={total_amount}, duration_unit={duration_unit}, "
            f"duration_value={duration_value}, end_date={end_date}"
        )
    )

    return get_active_contract_period(conn, service_id)


def renew_service_if_needed(conn, service_id, reference_date=None):
    if reference_date is None:
        reference_date = datetime.now().date()
    elif isinstance(reference_date, datetime):
        reference_date = reference_date.date()
    elif isinstance(reference_date, str):
        parsed = parse_date(reference_date)
        reference_date = parsed.date() if parsed else datetime.now().date()

    service = row_to_dict(conn.execute(
        "SELECT * FROM organization_services WHERE id = ?",
        (service_id,)
    ).fetchone())

    if not service:
        return None

    service = apply_scheduled_service_suspension_if_due(conn, service_id, reference_date)
    if not service:
        return None

    if str(service.get('service_status') or 'active') == 'suspended':
        return None

    period = get_active_contract_period(conn, service_id)
    if not period:
        period = create_first_contract_period(conn, service_id)

    if not period:
        return None

    while period:
        period_end = parse_date(period.get('end_date'))
        if not period_end:
            break

        if reference_date <= period_end.date():
            break

        old_period_id = period['id']
        old_due = float(period.get('due_amount') or 0)
        old_total = float(period.get('total_amount') or 0)
        old_paid = float(period.get('paid_amount') or 0)

        conn.execute(
            """UPDATE service_contract_periods SET
                   status = 'closed',
                   closed_reason = ?,
                   closed_at = datetime('now'),
                   updated_at = datetime('now')
               WHERE id = ?""",
            ('auto_renewed', old_period_id)
        )

        log_action(
            conn,
            None,
            f"Closed contract period {old_period_id}",
            entity_type='contract_period',
            entity_id=old_period_id,
            details=(
                f"service_id={service_id}, total_amount={old_total}, "
                f"paid_amount={old_paid}, due_amount={old_due}, closed_reason=auto_renewed"
            )
        )

        new_period_number = int(period.get('period_number') or 0) + 1
        new_start_date = period.get('end_date')
        duration_unit = period.get('contract_duration_unit') or service.get('contract_duration_unit') or 'شهري'
        duration_value = int(period.get('contract_duration_value') or service.get('contract_duration_value') or 1)
        payment_method = period.get('payment_method') or service.get('payment_method') or 'شهري'

        latest_base_amount = get_service_base_monthly_from_items(conn, service_id)
        if latest_base_amount <= 0:
            latest_base_amount = float(period.get('base_amount') or 0)

        carried_debt = old_due
        new_base_total = calculate_contract_total(latest_base_amount, duration_unit, duration_value)
        new_total_amount = new_base_total + float(carried_debt)
        new_end_date = calculate_contract_period_end_date(new_start_date, duration_unit, duration_value)

        cursor = conn.execute(
            """INSERT INTO service_contract_periods
               (service_id, period_number, period_label, start_date, end_date,
                contract_duration_unit, contract_duration_value, payment_method,
                base_amount, carried_debt, total_amount, paid_amount, due_amount,
                status, previous_period_id, renewal_created_at, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, datetime('now'), ?, datetime('now'), datetime('now'))""",
            (
                service_id,
                new_period_number,
                f"الفترة {new_period_number}",
                new_start_date,
                new_end_date,
                duration_unit,
                duration_value,
                payment_method,
                latest_base_amount,
                carried_debt,
                new_total_amount,
                0,
                new_total_amount,
                old_period_id,
                service.get('notes')
            )
        )

        new_period_id = cursor.lastrowid

        log_action(
            conn,
            None,
            f"Auto renewed contract for service {service_id}",
            entity_type='contract_period',
            entity_id=new_period_id,
            details=(
                f"previous_period_id={old_period_id}, period_number={new_period_number}, "
                f"base_amount={latest_base_amount}, carried_debt={carried_debt}, "
                f"base_total={new_base_total}, total_amount={new_total_amount}, "
                f"start_date={new_start_date}, end_date={new_end_date}"
            )
        )

        period = get_active_contract_period(conn, service_id)

    sync_service_summary_from_period(conn, service_id)
    return get_active_contract_period(conn, service_id)


def get_service_contract_periods_with_payments(conn, service_id):
    periods = rows_to_list(conn.execute(
        """SELECT *
           FROM service_contract_periods
           WHERE service_id = ?
           ORDER BY period_number DESC, id DESC""",
        (service_id,)
    ).fetchall())

    for period in periods:
        period_id = period['id']
        period['payments'] = rows_to_list(conn.execute(
            """SELECT p.*, u.username AS created_by_username
               FROM payments p
               LEFT JOIN users u ON p.created_by = u.id
               WHERE p.contract_period_id = ?
               ORDER BY p.payment_date DESC, p.id DESC""",
            (period_id,)
        ).fetchall())

    return periods


# ══════════════════════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}

    username = str(data.get('username', '')).strip()
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    conn = get_db()
    user = row_to_dict(conn.execute(
        "SELECT id, username, role, created_at, last_login, password FROM users WHERE username = ? AND password = ?",
        (username, password)
    ).fetchone())

    if not user:
        conn.close()
        return jsonify({'error': 'Invalid username or password'}), 401

    conn.execute("UPDATE users SET last_login = datetime('now') WHERE id = ?", (user['id'],))
    log_action(conn, user['id'], f"User '{user['username']}' logged in")
    conn.commit()

    updated_user = row_to_dict(conn.execute(
        "SELECT id, username, role, created_at, last_login FROM users WHERE id = ?",
        (user['id'],)
    ).fetchone())

    conn.close()
    return jsonify({'message': 'Login successful', 'user': updated_user}), 200


@app.route('/api/users', methods=['GET'])
def get_users():
    conn = get_db()

    current_user, error_response, status_code = require_admin(conn)
    if error_response:
        conn.close()
        return error_response, status_code

    users = rows_to_list(conn.execute(
        "SELECT id, username, role, created_at, last_login FROM users ORDER BY id"
    ).fetchall())

    conn.close()
    return jsonify({'users': users, 'count': len(users)}), 200


@app.route('/api/users', methods=['POST'])
def create_user():
    data = request.get_json() or {}

    username = str(data.get('username', '')).strip()
    password = data.get('password')
    role = data.get('role', 'user')

    if not username or not password:
        return jsonify({'error': 'username and password are required'}), 400

    if role not in ('user', 'admin'):
        return jsonify({'error': "role must be 'user' or 'admin'"}), 400

    conn = get_db()

    current_user, error_response, status_code = require_admin(conn)
    if error_response:
        conn.close()
        return error_response, status_code

    try:
        cursor = conn.execute(
            "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
            (username, password, role)
        )
        user_id = cursor.lastrowid

        log_action(
            conn,
            current_user['id'],
            f"Created user {username}",
            entity_type='user',
            entity_id=user_id
        )

        conn.commit()

        user = row_to_dict(conn.execute(
            "SELECT id, username, role, created_at, last_login FROM users WHERE id = ?",
            (user_id,)
        ).fetchone())

        conn.close()
        return jsonify({'message': 'User created', 'user': user}), 201

    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Username already exists'}), 409


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    conn = get_db()

    current_user, error_response, status_code = require_admin(conn)
    if error_response:
        conn.close()
        return error_response, status_code

    user_to_delete = row_to_dict(conn.execute(
        "SELECT id, username, role FROM users WHERE id = ?",
        (user_id,)
    ).fetchone())

    if not user_to_delete:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    if user_to_delete['id'] == current_user['id']:
        conn.close()
        return jsonify({'error': 'You cannot delete the currently logged-in admin'}), 400

    if user_to_delete['role'] == 'admin':
        admin_count = conn.execute(
            "SELECT COUNT(*) FROM users WHERE role = 'admin'"
        ).fetchone()[0]

        if admin_count <= 1:
            conn.close()
            return jsonify({'error': 'Cannot delete the last remaining admin'}), 400

    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))

    log_action(
        conn,
        current_user['id'],
        f"Deleted user {user_to_delete['username']}",
        entity_type='user',
        entity_id=user_id
    )

    conn.commit()
    conn.close()

    return jsonify({'message': 'User deleted'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# ORGANIZATIONS
# ══════════════════════════════════════════════════════════════════════════════

VALID_ORG_STATUS = ('active', 'inactive', 'pending')


@app.route('/api/organizations', methods=['GET'])
def get_organizations():
    search = request.args.get('search', '').strip()
    status = request.args.get('status', '').strip()

    query = "SELECT * FROM organizations WHERE 1=1"
    params = []

    if search:
        query += " AND (name LIKE ? OR phone LIKE ? OR address LIKE ? OR location LIKE ?)"
        p = f'%{search}%'
        params.extend([p, p, p, p])

    if status and status in VALID_ORG_STATUS:
        query += " AND status = ?"
        params.append(status)

    query += " ORDER BY name ASC"

    conn = get_db()
    orgs = rows_to_list(conn.execute(query, params).fetchall())
    conn.close()
    return jsonify({'organizations': orgs, 'count': len(orgs)}), 200


@app.route('/api/organizations/<int:org_id>', methods=['GET'])
def get_organization(org_id):
    conn = get_db()
    org = row_to_dict(conn.execute(
        "SELECT * FROM organizations WHERE id = ?",
        (org_id,)
    ).fetchone())

    if not org:
        conn.close()
        return jsonify({'error': 'Organization not found'}), 404

    services = rows_to_list(conn.execute(
        "SELECT * FROM organization_services WHERE organization_id = ? ORDER BY id",
        (org_id,)
    ).fetchall())

    hydrated_services = []

    for svc in services:
        svc_id = svc['id']

        apply_scheduled_service_suspension_if_due(conn, svc_id)
        renew_service_if_needed(conn, svc_id)
        svc = row_to_dict(conn.execute(
            "SELECT * FROM organization_services WHERE id = ?",
            (svc_id,)
        ).fetchone())

        svc['service_items'] = rows_to_list(conn.execute(
            """SELECT si.*, pc.name AS provider_company_name
               FROM service_items si
               LEFT JOIN provider_companies pc ON si.provider_company_id = pc.id
               WHERE si.service_id = ? ORDER BY si.id""",
            (svc_id,)
        ).fetchall())

        svc['payments'] = rows_to_list(conn.execute(
            """SELECT p.*, u.username AS created_by_username,
                      obr.official_book_date, obr.official_book_description
               FROM payments p
               LEFT JOIN users u ON p.created_by = u.id
               LEFT JOIN official_book_records obr ON obr.payment_id = p.id
               WHERE p.service_id = ? ORDER BY p.payment_date DESC, p.id DESC""",
            (svc_id,)
        ).fetchall())

        svc['suspensions'] = rows_to_list(conn.execute(
            """SELECT ss.*, obr.official_book_date, obr.official_book_description
               FROM service_suspensions ss
               LEFT JOIN official_book_records obr
                 ON obr.entity_type = 'service_suspension' AND obr.entity_id = ss.id
               WHERE ss.service_id = ?
               ORDER BY ss.created_at DESC, ss.id DESC""",
            (svc_id,)
        ).fetchall())
        svc['latest_suspension'] = svc['suspensions'][0] if svc['suspensions'] else None

        periods = get_service_contract_periods_with_payments(conn, svc_id)
        svc['contract_periods'] = periods
        svc['active_contract_period'] = next((p for p in periods if p.get('status') == 'active'), None)
        svc['closed_contract_periods'] = [p for p in periods if p.get('status') != 'active']

        hydrated_services.append(svc)

    conn.commit()
    conn.close()
    org['services'] = hydrated_services
    return jsonify({'organization': org}), 200


@app.route('/api/organizations', methods=['POST'])
def create_organization():
    data = request.get_json()
    if not data or not data.get('name') or not str(data.get('name', '')).strip():
        return jsonify({'error': 'Name is required'}), 400

    status = data.get('status', 'active')
    if status not in VALID_ORG_STATUS:
        return jsonify({'error': f'status must be one of {VALID_ORG_STATUS}'}), 400

    conn = get_db()
    try:
        cursor = conn.execute(
            """INSERT INTO organizations (name, phone, address, location, status, notes)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                str(data['name']).strip(),
                data.get('phone'),
                data.get('address'),
                data.get('location'),
                status,
                data.get('notes')
            )
        )
        org_id = cursor.lastrowid
        log_action(conn, None, f"Created organization {str(data['name']).strip()}",
                   entity_type='organization', entity_id=org_id)
        conn.commit()
        org = row_to_dict(conn.execute(
            "SELECT * FROM organizations WHERE id = ?",
            (org_id,)
        ).fetchone())
        conn.close()
        return jsonify({'message': 'Organization created', 'organization': org}), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Organization name already exists'}), 409


@app.route('/api/organizations/<int:org_id>', methods=['PUT'])
def update_organization(org_id):
    data = request.get_json()
    conn = get_db()

    existing = conn.execute(
        "SELECT * FROM organizations WHERE id = ?",
        (org_id,)
    ).fetchone()

    if not existing:
        conn.close()
        return jsonify({'error': 'Organization not found'}), 404

    status = data.get('status', existing['status'])
    if status not in VALID_ORG_STATUS:
        conn.close()
        return jsonify({'error': f'status must be one of {VALID_ORG_STATUS}'}), 400

    conn.execute(
        """UPDATE organizations SET
               name=?, phone=?, address=?, location=?, status=?, notes=?,
               updated_at = datetime('now')
           WHERE id = ?""",
        (
            data.get('name', existing['name']),
            data.get('phone', existing['phone']),
            data.get('address', existing['address']),
            data.get('location', existing['location']),
            status,
            data.get('notes', existing['notes']),
            org_id
        )
    )

    log_action(conn, None, f"Updated organization {org_id}",
               entity_type='organization', entity_id=org_id)
    conn.commit()

    org = row_to_dict(conn.execute(
        "SELECT * FROM organizations WHERE id = ?",
        (org_id,)
    ).fetchone())

    conn.close()
    return jsonify({'message': 'Organization updated', 'organization': org}), 200


@app.route('/api/organizations/<int:org_id>', methods=['DELETE'])
def delete_organization(org_id):
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM organizations WHERE id = ?",
        (org_id,)
    ).fetchone()

    if not existing:
        conn.close()
        return jsonify({'error': 'Organization not found'}), 404

    conn.execute("DELETE FROM organizations WHERE id = ?", (org_id,))
    log_action(conn, None, f"Deleted organization {org_id}",
               entity_type='organization', entity_id=org_id)
    conn.commit()
    conn.close()
    return jsonify({'message': 'Organization deleted'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# PROVIDER COMPANIES
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/provider-companies', methods=['GET'])
def get_provider_companies():
    active = request.args.get('active')
    query = "SELECT * FROM provider_companies WHERE 1=1"
    params = []

    if active is not None:
        query += " AND is_active = ?"
        params.append(1 if str(active).lower() in ('1', 'true', 'yes') else 0)

    query += " ORDER BY name ASC"

    conn = get_db()
    companies = rows_to_list(conn.execute(query, params).fetchall())
    conn.close()
    return jsonify({'provider_companies': companies, 'count': len(companies)}), 200


@app.route('/api/provider-companies/<int:company_id>', methods=['GET'])
def get_provider_company(company_id):
    conn = get_db()
    company = row_to_dict(conn.execute(
        "SELECT * FROM provider_companies WHERE id = ?",
        (company_id,)
    ).fetchone())

    if not company:
        conn.close()
        return jsonify({'error': 'Provider company not found'}), 404

    company['subscriptions'] = rows_to_list(conn.execute(
        "SELECT * FROM provider_subscriptions WHERE provider_company_id = ? ORDER BY id",
        (company_id,)
    ).fetchall())

    for sub in company['subscriptions']:
        sub['price_history'] = rows_to_list(conn.execute(
            """SELECT psh.*, u.username AS changed_by_username,
                      obr.official_book_date, obr.official_book_description
               FROM provider_subscription_price_history psh
               LEFT JOIN users u ON u.id = psh.changed_by
               LEFT JOIN official_book_records obr ON obr.provider_price_history_id = psh.id
               WHERE psh.provider_subscription_id = ?
               ORDER BY psh.changed_at DESC, psh.id DESC""",
            (sub['id'],)
        ).fetchall())

    conn.close()
    return jsonify({'provider_company': company}), 200


@app.route('/api/provider-companies', methods=['POST'])
def create_provider_company():
    data = request.get_json()
    if not data or not data.get('name') or not str(data.get('name', '')).strip():
        return jsonify({'error': 'Name is required'}), 400

    conn = get_db()
    try:
        cursor = conn.execute(
            """INSERT INTO provider_companies (name, phone, address, email, is_active)
               VALUES (?, ?, ?, ?, ?)""",
            (
                str(data['name']).strip(),
                data.get('phone'),
                data.get('address'),
                data.get('email'),
                1 if data.get('is_active', True) else 0
            )
        )
        company_id = cursor.lastrowid
        log_action(conn, None, f"Created provider company {str(data['name']).strip()}",
                   entity_type='provider_company', entity_id=company_id)
        conn.commit()
        company = row_to_dict(conn.execute(
            "SELECT * FROM provider_companies WHERE id = ?",
            (company_id,)
        ).fetchone())
        conn.close()
        return jsonify({'message': 'Provider company created', 'provider_company': company}), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Provider company name already exists'}), 409


@app.route('/api/provider-companies/<int:company_id>', methods=['PUT'])
def update_provider_company(company_id):
    data = request.get_json()
    conn = get_db()

    existing = conn.execute(
        "SELECT * FROM provider_companies WHERE id = ?",
        (company_id,)
    ).fetchone()

    if not existing:
        conn.close()
        return jsonify({'error': 'Provider company not found'}), 404

    is_active = data.get('is_active')
    if is_active is not None:
        is_active = 1 if is_active else 0
    else:
        is_active = existing['is_active']

    conn.execute(
        """UPDATE provider_companies SET
               name=?, phone=?, address=?, email=?, is_active=?
           WHERE id = ?""",
        (
            data.get('name', existing['name']),
            data.get('phone', existing['phone']),
            data.get('address', existing['address']),
            data.get('email', existing['email']),
            is_active,
            company_id
        )
    )

    log_action(conn, None, f"Updated provider company {company_id}",
               entity_type='provider_company', entity_id=company_id)
    conn.commit()

    company = row_to_dict(conn.execute(
        "SELECT * FROM provider_companies WHERE id = ?",
        (company_id,)
    ).fetchone())

    conn.close()
    return jsonify({'message': 'Provider company updated', 'provider_company': company}), 200


@app.route('/api/provider-companies/<int:company_id>', methods=['DELETE'])
def delete_provider_company(company_id):
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM provider_companies WHERE id = ?",
        (company_id,)
    ).fetchone()

    if not existing:
        conn.close()
        return jsonify({'error': 'Provider company not found'}), 404

    conn.execute("DELETE FROM provider_companies WHERE id = ?", (company_id,))
    log_action(conn, None, f"Deleted provider company {company_id}",
               entity_type='provider_company', entity_id=company_id)
    conn.commit()
    conn.close()
    return jsonify({'message': 'Provider company deleted'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# PROVIDER SUBSCRIPTIONS
# ══════════════════════════════════════════════════════════════════════════════

VALID_SERVICE_TYPE = ('Wireless', 'FTTH', 'Optical', 'Other')
VALID_ITEM_CATEGORY = ('Line', 'Bundle', 'Other')


@app.route('/api/provider-companies/<int:company_id>/subscriptions', methods=['GET'])
def get_provider_subscriptions(company_id):
    conn = get_db()
    subs = rows_to_list(conn.execute(
        "SELECT * FROM provider_subscriptions WHERE provider_company_id = ? ORDER BY id",
        (company_id,)
    ).fetchall())
    conn.close()
    return jsonify({'subscriptions': subs, 'count': len(subs)}), 200


@app.route('/api/provider-companies/<int:company_id>/subscriptions', methods=['POST'])
def create_provider_subscription(company_id):
    data = request.get_json()
    if not data or not data.get('service_type') or not data.get('item_category') or not data.get('item_name'):
        return jsonify({'error': 'service_type, item_category, and item_name are required'}), 400

    if data.get('service_type') not in VALID_SERVICE_TYPE:
        return jsonify({'error': f'service_type must be one of {VALID_SERVICE_TYPE}'}), 400

    if data.get('item_category') not in VALID_ITEM_CATEGORY:
        return jsonify({'error': f'item_category must be one of {VALID_ITEM_CATEGORY}'}), 400

    conn = get_db()
    if not conn.execute("SELECT id FROM provider_companies WHERE id = ?", (company_id,)).fetchone():
        conn.close()
        return jsonify({'error': 'Provider company not found'}), 404

    try:
        cursor = conn.execute(
            """INSERT INTO provider_subscriptions
               (provider_company_id, service_type, item_category, item_name, price, unit_label)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                company_id,
                data['service_type'],
                data['item_category'],
                data['item_name'],
                float(data.get('price', 0)),
                data.get('unit_label')
            )
        )
        sub_id = cursor.lastrowid

        log_action(conn, None, f"Created subscription {data['item_name']}",
                   entity_type='provider_subscription', entity_id=sub_id,
                   details=f"company_id={company_id}, service_type={data['service_type']}, item_category={data['item_category']}")

        conn.commit()

        sub = row_to_dict(conn.execute(
            "SELECT * FROM provider_subscriptions WHERE id = ?",
            (sub_id,)
        ).fetchone())

        conn.close()
        return jsonify({'message': 'Subscription created', 'subscription': sub}), 201
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/provider-subscriptions/<int:sub_id>/impact', methods=['POST'])
def preview_provider_subscription_impact(sub_id):
    data = request.get_json() or {}
    conn = get_db()
    existing = conn.execute(
        "SELECT * FROM provider_subscriptions WHERE id = ?",
        (sub_id,)
    ).fetchone()

    if not existing:
        conn.close()
        return jsonify({'error': 'Subscription not found'}), 404

    existing = row_to_dict(existing)
    preview_row = dict(existing)
    if 'service_type' in data:
        preview_row['service_type'] = data.get('service_type', preview_row['service_type'])
    if 'item_category' in data:
        preview_row['item_category'] = data.get('item_category', preview_row['item_category'])
    if 'item_name' in data:
        preview_row['item_name'] = data.get('item_name', preview_row['item_name'])
    if 'price' in data:
        preview_row['price'] = float(data.get('price', preview_row['price']))

    affected_organizations = get_affected_organizations_for_provider_subscription(conn, existing)
    conn.close()
    return jsonify({
        'old_price': float(existing.get('price') or 0),
        'new_price': float(preview_row.get('price') or 0),
        'affected_organizations': affected_organizations,
        'affected_count': len(affected_organizations),
    }), 200


@app.route('/api/provider-subscriptions/<int:sub_id>', methods=['PUT'])
def update_provider_subscription(sub_id):
    data = request.get_json() or {}
    conn = get_db()

    current_user = get_current_user_from_headers(conn)

    existing = conn.execute(
        "SELECT * FROM provider_subscriptions WHERE id = ?",
        (sub_id,)
    ).fetchone()

    if not existing:
        conn.close()
        return jsonify({'error': 'Subscription not found'}), 404

    existing = row_to_dict(existing)

    st = data.get('service_type', existing['service_type'])
    ic = data.get('item_category', existing['item_category'])

    if st not in VALID_SERVICE_TYPE or ic not in VALID_ITEM_CATEGORY:
        conn.close()
        return jsonify({'error': 'Invalid service_type or item_category'}), 400

    new_item_name = data.get('item_name', existing['item_name'])
    old_price = float(existing.get('price') or 0)
    new_price = float(data.get('price', existing['price']))
    selected_org_ids = data.get('selected_organization_ids')

    is_price_change = old_price != new_price
    official_book_date, official_book_description, official_book_error = validate_official_book_fields(data, require_for_operation=is_price_change)
    if official_book_error:
        conn.close()
        return jsonify({'error': official_book_error}), 400

    conn.execute(
        """UPDATE provider_subscriptions SET
               service_type=?, item_category=?, item_name=?, price=?, unit_label=?
           WHERE id = ?""",
        (
            st,
            ic,
            new_item_name,
            new_price,
            data.get('unit_label', existing['unit_label']),
            sub_id
        )
    )

    updated_subscription = row_to_dict(conn.execute(
        "SELECT * FROM provider_subscriptions WHERE id = ?",
        (sub_id,)
    ).fetchone())

    affected_orgs_count, affected_items_count, affected_services_count = reprice_contracts_for_provider_subscription(
        conn,
        existing,
        updated_subscription,
        selected_org_ids=selected_org_ids
    )

    if old_price != new_price:
        price_history_id = save_provider_subscription_price_history(
            conn,
            sub_id,
            old_price,
            new_price,
            changed_by=(current_user or {}).get('id'),
            note=f"selected_organizations={selected_org_ids if selected_org_ids is not None else 'all'}"
        )
        create_official_book_record(
            conn,
            operation_type='subscription_price_change',
            entity_type='provider_subscription',
            entity_id=sub_id,
            provider_subscription_id=sub_id,
            provider_price_history_id=price_history_id,
            official_book_date=official_book_date,
            official_book_description=official_book_description,
            created_by=(current_user or {}).get('id')
        )

    log_action(conn, (current_user or {}).get('id') if current_user else None, f"Updated subscription {sub_id}",
               entity_type='provider_subscription', entity_id=sub_id,
               details=f"affected_organizations={affected_orgs_count}, affected_items={affected_items_count}, affected_services={affected_services_count}")
    conn.commit()

    sub = row_to_dict(conn.execute(
        "SELECT * FROM provider_subscriptions WHERE id = ?",
        (sub_id,)
    ).fetchone())

    price_history = rows_to_list(conn.execute(
        """SELECT psh.*, u.username AS changed_by_username
           FROM provider_subscription_price_history psh
           LEFT JOIN users u ON u.id = psh.changed_by
           WHERE psh.provider_subscription_id = ?
           ORDER BY psh.changed_at DESC, psh.id DESC""",
        (sub_id,)
    ).fetchall())

    conn.close()
    return jsonify({'message': 'Subscription updated', 'subscription': sub, 'price_history': price_history}), 200


@app.route('/api/provider-subscriptions/<int:sub_id>', methods=['DELETE'])
def delete_provider_subscription(sub_id):
    conn = get_db()
    conn.execute("DELETE FROM provider_subscriptions WHERE id = ?", (sub_id,))
    if conn.total_changes == 0:
        conn.close()
        return jsonify({'error': 'Subscription not found'}), 404

    log_action(conn, None, f"Deleted subscription {sub_id}",
               entity_type='provider_subscription', entity_id=sub_id)
    conn.commit()
    conn.close()
    return jsonify({'message': 'Subscription deleted'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# ORGANIZATION SERVICES
# ══════════════════════════════════════════════════════════════════════════════

VALID_PAYMENT_METHOD = ('يومي', 'شهري', 'كل 3 أشهر', 'سنوي')
VALID_CONTRACT_DURATION_UNIT = ('يومي', 'شهري', 'سنوي')
VALID_DEVICE_OWNERSHIP = ('الشركة', 'المنظمة', 'الوزارة')
VALID_SERVICE_STATUS = ('active', 'scheduled_suspend', 'suspended')


@app.route('/api/organizations/<int:org_id>/services', methods=['POST'])
def create_organization_service(org_id):
    data = request.get_json()

    if not data or not data.get('service_type'):
        return jsonify({'error': 'service_type is required'}), 400

    if data.get('service_type') not in VALID_SERVICE_TYPE:
        return jsonify({'error': f'service_type must be one of {VALID_SERVICE_TYPE}'}), 400

    pm = data.get('payment_method', 'شهري')
    do = normalize_device_ownership(data.get('device_ownership', 'الشركة'))
    contract_duration_unit = data.get('contract_duration_unit', 'شهري')
    contract_duration_value = int(data.get('contract_duration_value', 1) or 1)
    payment_interval_days = int(data.get('payment_interval_days', 1) or 1)

    if pm not in VALID_PAYMENT_METHOD or do not in VALID_DEVICE_OWNERSHIP:
        return jsonify({'error': 'Invalid payment_method or device_ownership'}), 400

    if contract_duration_unit not in VALID_CONTRACT_DURATION_UNIT:
        return jsonify({'error': 'Invalid contract_duration_unit'}), 400

    if contract_duration_value < 1:
        return jsonify({'error': 'contract_duration_value must be at least 1'}), 400

    if pm == 'يومي' and payment_interval_days < 1:
        return jsonify({'error': 'payment_interval_days must be at least 1'}), 400

    official_book_date, official_book_description, official_book_error = validate_official_book_fields(data, require_for_operation=True)
    if official_book_error:
        return jsonify({'error': official_book_error}), 400

    conn = get_db()
    current_user = get_current_user_from_headers(conn)

    if not conn.execute("SELECT id FROM organizations WHERE id = ?", (org_id,)).fetchone():
        conn.close()
        return jsonify({'error': 'Organization not found'}), 404

    total_amount = float(data.get('annual_amount', 0))
    contract_created_at = data.get('contract_created_at') or format_date(datetime.now())
    due_date = data.get('due_date') or calculate_next_due_date(
        contract_created_at,
        pm,
        payment_interval_days
    )

    try:
        cursor = conn.execute(
            """INSERT INTO organization_services
               (organization_id, service_type, payment_method, payment_interval_days,
                device_ownership, annual_amount, paid_amount, due_amount,
                contract_created_at, contract_duration_unit, contract_duration_value,
                due_date, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                org_id,
                data['service_type'],
                pm,
                payment_interval_days if pm == 'يومي' else 1,
                do,
                total_amount,
                0,
                total_amount,
                contract_created_at,
                contract_duration_unit,
                contract_duration_value,
                due_date,
                data.get('notes')
            )
        )

        svc_id = cursor.lastrowid

        first_period = create_first_contract_period(conn, svc_id)
        sync_service_summary_from_period(conn, svc_id)

        create_official_book_record(
            conn,
            operation_type='new_contract',
            entity_type='organization_service',
            entity_id=svc_id,
            organization_id=org_id,
            service_id=svc_id,
            contract_period_id=(first_period or {}).get('id') if first_period else None,
            official_book_date=official_book_date,
            official_book_description=official_book_description,
            created_by=(current_user or {}).get('id')
        )

        log_action(
            conn,
            (current_user or {}).get('id') if current_user else None,
            f"Created service {data['service_type']}",
            entity_type='organization_service',
            entity_id=svc_id,
            details=(
                f'organization_id={org_id}, total_amount={total_amount}, '
                f'payment_method={pm}, contract_duration_unit={contract_duration_unit}, '
                f'contract_duration_value={contract_duration_value}'
            )
        )

        conn.commit()

        svc = row_to_dict(conn.execute(
            "SELECT * FROM organization_services WHERE id = ?",
            (svc_id,)
        ).fetchone())

        conn.close()
        return jsonify({'message': 'Service created', 'service': svc}), 201

    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/organization-services/<int:svc_id>', methods=['PUT'])
def update_organization_service(svc_id):
    data = request.get_json() or {}

    conn = get_db()
    existing = conn.execute(
        "SELECT * FROM organization_services WHERE id = ?",
        (svc_id,)
    ).fetchone()

    if not existing:
        conn.close()
        return jsonify({'error': 'Service not found'}), 404

    pm = data.get('payment_method', existing['payment_method'])
    do = normalize_device_ownership(data.get('device_ownership', existing['device_ownership']))
    contract_duration_unit = data.get('contract_duration_unit', existing['contract_duration_unit'])
    contract_duration_value = int(data.get('contract_duration_value', existing['contract_duration_value']) or 1)
    payment_interval_days = int(data.get('payment_interval_days', existing['payment_interval_days']) or 1)

    if pm not in VALID_PAYMENT_METHOD or do not in VALID_DEVICE_OWNERSHIP:
        conn.close()
        return jsonify({'error': 'Invalid payment_method or device_ownership'}), 400

    if contract_duration_unit not in VALID_CONTRACT_DURATION_UNIT:
        conn.close()
        return jsonify({'error': 'Invalid contract_duration_unit'}), 400

    if contract_duration_value < 1:
        conn.close()
        return jsonify({'error': 'contract_duration_value must be at least 1'}), 400

    if pm == 'يومي' and payment_interval_days < 1:
        conn.close()
        return jsonify({'error': 'payment_interval_days must be at least 1'}), 400

    renew_service_if_needed(conn, svc_id)

    active_period = get_active_contract_period(conn, svc_id)
    if not active_period:
        active_period = create_first_contract_period(conn, svc_id)

    contract_created_at = data.get(
        'contract_created_at',
        active_period['start_date'] if active_period else existing['contract_created_at']
    )
    due_date = data.get('due_date') or calculate_next_due_date(contract_created_at, pm, payment_interval_days)

    conn.execute(
        """UPDATE organization_services SET
               service_type=?,
               payment_method=?,
               payment_interval_days=?,
               device_ownership=?,
               contract_created_at=?,
               contract_duration_unit=?,
               contract_duration_value=?,
               due_date=?,
               notes=?,
               is_active=?,
               updated_at = datetime('now')
           WHERE id = ?""",
        (
            data.get('service_type', existing['service_type']),
            pm,
            payment_interval_days if pm == 'يومي' else 1,
            do,
            contract_created_at,
            contract_duration_unit,
            contract_duration_value,
            due_date,
            data.get('notes', existing['notes']),
            1 if data.get('is_active', existing['is_active']) else 0,
            svc_id
        )
    )

    active_period = get_active_contract_period(conn, svc_id)
    if active_period:
        new_end_date = calculate_contract_period_end_date(contract_created_at, contract_duration_unit, contract_duration_value)

        conn.execute(
            """UPDATE service_contract_periods SET
                   start_date=?,
                   end_date=?,
                   contract_duration_unit=?,
                   contract_duration_value=?,
                   payment_method=?,
                   notes=?,
                   updated_at=datetime('now')
               WHERE id = ?""",
            (
                contract_created_at,
                new_end_date,
                contract_duration_unit,
                contract_duration_value,
                pm,
                data.get('notes', active_period.get('notes')),
                active_period['id']
            )
        )

        recalculate_service_items_contract_totals(conn, svc_id)

        requested_base_amount = data.get('annual_amount')
        if requested_base_amount is not None:
            recalculate_active_period_pricing(
                conn,
                svc_id,
                new_base_amount=float(requested_base_amount),
                notes=data.get('notes', active_period.get('notes'))
            )
        else:
            recalculate_active_period_pricing(
                conn,
                svc_id,
                notes=data.get('notes', active_period.get('notes'))
            )
    else:
        recalculate_service_items_contract_totals(conn, svc_id)
        recalculate_active_period_pricing(conn, svc_id)

    log_action(conn, None, f"Updated service {svc_id}",
               entity_type='organization_service', entity_id=svc_id)
    conn.commit()

    svc = row_to_dict(conn.execute(
        "SELECT * FROM organization_services WHERE id = ?",
        (svc_id,)
    ).fetchone())

    conn.close()
    return jsonify({'message': 'Service updated', 'service': svc}), 200


@app.route('/api/organization-services/<int:svc_id>/suspend', methods=['POST'])
def suspend_organization_service(svc_id):
    data = request.get_json() or {}

    official_book_date, official_book_description, official_book_error = validate_official_book_fields(data, require_for_operation=True)
    if official_book_error:
        return jsonify({'error': official_book_error}), 400

    is_immediate = bool(data.get('is_immediate', True))
    suspend_date_raw = str(data.get('suspend_date') or '').strip()
    refund_amount = float(data.get('refund_amount') or 0)
    if refund_amount < 0:
        return jsonify({'error': 'refund_amount must be zero or positive'}), 400

    note = str(data.get('note') or '').strip() or None
    created_by = data.get('created_by')

    if is_immediate:
        effective_date = format_date(datetime.now())
    else:
        if not suspend_date_raw:
            return jsonify({'error': 'suspend_date is required when is_immediate is false'}), 400
        suspend_dt = parse_date(suspend_date_raw)
        if not suspend_dt:
            return jsonify({'error': 'suspend_date is invalid'}), 400
        effective_date = format_date(suspend_dt)

    conn = get_db()
    service = row_to_dict(conn.execute(
        "SELECT * FROM organization_services WHERE id = ?",
        (svc_id,)
    ).fetchone())

    if not service:
        conn.close()
        return jsonify({'error': 'Service not found'}), 404

    service = apply_scheduled_service_suspension_if_due(conn, svc_id)
    if str((service or {}).get('service_status') or 'active') == 'suspended':
        conn.close()
        return jsonify({'error': 'Service is already suspended'}), 400

    pending = get_pending_service_suspension(conn, svc_id)
    if pending and not is_immediate:
        conn.close()
        return jsonify({'error': 'There is already a scheduled suspension for this service'}), 400

    active_period = get_active_contract_period(conn, svc_id)
    cursor = conn.execute(
        """INSERT INTO service_suspensions (
               service_id, organization_id, contract_period_id, effective_date,
               is_immediate, refund_amount, note, status, created_by, created_at, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, datetime('now'), datetime('now'))""",
        (
            svc_id,
            service.get('organization_id'),
            active_period['id'] if active_period else None,
            effective_date,
            1 if is_immediate else 0,
            refund_amount,
            note,
            created_by,
        )
    )
    suspension_id = cursor.lastrowid

    create_official_book_record(
        conn,
        operation_type='service_suspend',
        entity_type='service_suspension',
        entity_id=suspension_id,
        organization_id=service.get('organization_id'),
        service_id=svc_id,
        contract_period_id=active_period['id'] if active_period else None,
        official_book_date=official_book_date,
        official_book_description=official_book_description,
        created_by=created_by
    )

    conn.execute(
        """UPDATE organization_services SET
               service_status = ?,
               scheduled_suspend_at = ?,
               suspension_effective_date = ?,
               suspension_refund_amount = ?,
               suspension_note = ?,
               updated_at = datetime('now')
           WHERE id = ?""",
        (
            'active' if is_immediate else 'scheduled_suspend',
            None if is_immediate else effective_date,
            effective_date,
            refund_amount,
            note,
            svc_id
        )
    )

    log_action(
        conn,
        created_by,
        f"Scheduled suspension for service {svc_id}",
        entity_type='service_suspension',
        entity_id=suspension_id,
        details=(
            f"effective_date={effective_date}, is_immediate={is_immediate}, "
            f"refund_amount={refund_amount}, note={note or '-'}"
        )
    )

    if is_immediate:
        service = row_to_dict(conn.execute(
            "SELECT * FROM organization_services WHERE id = ?",
            (svc_id,)
        ).fetchone())
        suspension = row_to_dict(conn.execute(
            "SELECT * FROM service_suspensions WHERE id = ?",
            (suspension_id,)
        ).fetchone())
        updated_service = execute_service_suspension(conn, service, suspension)
    else:
        updated_service = row_to_dict(conn.execute(
            "SELECT * FROM organization_services WHERE id = ?",
            (svc_id,)
        ).fetchone())

    latest_suspension = row_to_dict(conn.execute(
        """SELECT ss.*, obr.official_book_date, obr.official_book_description
           FROM service_suspensions ss
           LEFT JOIN official_book_records obr
             ON obr.entity_type = 'service_suspension' AND obr.entity_id = ss.id
           WHERE ss.id = ?""",
        (suspension_id,)
    ).fetchone())

    conn.commit()
    conn.close()
    return jsonify({
        'message': 'Service suspension saved',
        'service': updated_service,
        'suspension': latest_suspension
    }), 201


@app.route('/api/organization-services/<int:svc_id>', methods=['DELETE'])
def delete_organization_service(svc_id):
    conn = get_db()
    conn.execute("DELETE FROM organization_services WHERE id = ?", (svc_id,))
    if conn.total_changes == 0:
        conn.close()
        return jsonify({'error': 'Service not found'}), 404

    log_action(conn, None, f"Deleted service {svc_id}",
               entity_type='organization_service', entity_id=svc_id)
    conn.commit()
    conn.close()
    return jsonify({'message': 'Service deleted'}), 200


@app.route('/api/organization-services/<int:svc_id>/periods', methods=['GET'])
def get_organization_service_periods(svc_id):
    conn = get_db()

    service = row_to_dict(conn.execute(
        "SELECT * FROM organization_services WHERE id = ?",
        (svc_id,)
    ).fetchone())

    if not service:
        conn.close()
        return jsonify({'error': 'Service not found'}), 404

    renew_service_if_needed(conn, svc_id)
    periods = get_service_contract_periods_with_payments(conn, svc_id)

    conn.commit()
    conn.close()
    return jsonify({
        'service_id': svc_id,
        'count': len(periods),
        'active_contract_period': next((p for p in periods if p.get('status') == 'active'), None),
        'periods': periods
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# SERVICE ITEMS
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/organization-services/<int:svc_id>/items', methods=['POST'])
def create_service_item(svc_id):
    data = request.get_json()
    if not data or not data.get('item_category') or not data.get('item_name'):
        return jsonify({'error': 'item_category and item_name are required'}), 400

    if data.get('item_category') not in VALID_ITEM_CATEGORY:
        return jsonify({'error': f'item_category must be one of {VALID_ITEM_CATEGORY}'}), 400

    conn = get_db()
    if not conn.execute("SELECT id FROM organization_services WHERE id = ?", (svc_id,)).fetchone():
        conn.close()
        return jsonify({'error': 'Service not found'}), 404

    qty = float(data.get('quantity', 1))
    up = float(data.get('unit_price', 0))
    service_context = get_service_contract_context(conn, svc_id)
    total = calculate_service_item_contract_total(
        qty,
        up,
        service_context['contract_duration_unit'],
        service_context['contract_duration_value']
    )

    try:
        cursor = conn.execute(
            """INSERT INTO service_items
               (service_id, item_category, provider_company_id, item_name,
                line_type, bundle_type, quantity, unit_price, total_price, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                svc_id,
                data['item_category'],
                data.get('provider_company_id') or None,
                data.get('item_name'),
                data.get('line_type'),
                data.get('bundle_type'),
                qty,
                up,
                total,
                data.get('notes')
            )
        )

        item_id = cursor.lastrowid

        recalculate_active_period_pricing(conn, svc_id)

        log_action(
            conn,
            None,
            f"Created service item {data.get('item_name')}",
            entity_type='service_item',
            entity_id=item_id,
            details=f'service_id={svc_id}, category={data["item_category"]}, quantity={qty}, unit_price={up}'
        )

        conn.commit()

        item = row_to_dict(conn.execute(
            "SELECT * FROM service_items WHERE id = ?",
            (item_id,)
        ).fetchone())

        conn.close()
        return jsonify({'message': 'Service item created', 'service_item': item}), 201
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/service-items/<int:item_id>', methods=['PUT'])
def update_service_item(item_id):
    data = request.get_json()
    conn = get_db()

    existing = conn.execute(
        "SELECT * FROM service_items WHERE id = ?",
        (item_id,)
    ).fetchone()

    if not existing:
        conn.close()
        return jsonify({'error': 'Service item not found'}), 404

    ic = data.get('item_category', existing['item_category'])
    if ic not in VALID_ITEM_CATEGORY:
        conn.close()
        return jsonify({'error': f'item_category must be one of {VALID_ITEM_CATEGORY}'}), 400

    qty = float(data.get('quantity', existing['quantity']))
    up = float(data.get('unit_price', existing['unit_price']))
    service_context = get_service_contract_context(conn, existing['service_id'])
    total = calculate_service_item_contract_total(
        qty,
        up,
        service_context['contract_duration_unit'],
        service_context['contract_duration_value']
    )

    conn.execute(
        """UPDATE service_items SET
               item_category=?, provider_company_id=?, item_name=?,
               line_type=?, bundle_type=?, quantity=?, unit_price=?, total_price=?,
               notes=?, updated_at = datetime('now')
           WHERE id = ?""",
        (
            ic,
            data.get('provider_company_id', existing['provider_company_id']) or None,
            data.get('item_name', existing['item_name']),
            data.get('line_type', existing['line_type']),
            data.get('bundle_type', existing['bundle_type']),
            qty,
            up,
            total,
            data.get('notes', existing['notes']),
            item_id
        )
    )

    svc_id = existing['service_id']
    recalculate_active_period_pricing(conn, svc_id)

    log_action(conn, None, f"Updated service item {item_id}",
               entity_type='service_item', entity_id=item_id)
    conn.commit()

    item = row_to_dict(conn.execute(
        "SELECT * FROM service_items WHERE id = ?",
        (item_id,)
    ).fetchone())

    conn.close()
    return jsonify({'message': 'Service item updated', 'service_item': item}), 200


@app.route('/api/service-items/<int:item_id>', methods=['DELETE'])
def delete_service_item(item_id):
    conn = get_db()

    existing = conn.execute(
        "SELECT * FROM service_items WHERE id = ?",
        (item_id,)
    ).fetchone()

    if not existing:
        conn.close()
        return jsonify({'error': 'Service item not found'}), 404

    svc_id = existing['service_id']

    conn.execute("DELETE FROM service_items WHERE id = ?", (item_id,))

    recalculate_active_period_pricing(conn, svc_id)

    log_action(conn, None, f"Deleted service item {item_id}",
               entity_type='service_item', entity_id=item_id)
    conn.commit()
    conn.close()
    return jsonify({'message': 'Service item deleted'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# PAYMENTS
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/organization-services/<int:service_id>/payments', methods=['POST'])
def record_payment(service_id):
    data = request.get_json()

    if not data or data.get('amount') is None:
        return jsonify({'error': 'amount is required'}), 400

    amount = float(data['amount'])
    if amount <= 0:
        return jsonify({'error': 'amount must be positive'}), 400

    payment_date = data.get('payment_date') or ''
    if not payment_date:
        return jsonify({'error': 'payment_date is required'}), 400

    official_book_date, official_book_description, official_book_error = validate_official_book_fields(data, require_for_operation=True)
    if official_book_error:
        return jsonify({'error': official_book_error}), 400

    conn = get_db()

    service = row_to_dict(conn.execute(
        "SELECT * FROM organization_services WHERE id = ?",
        (service_id,)
    ).fetchone())

    if not service:
        conn.close()
        return jsonify({'error': 'Service not found'}), 404

    service = apply_scheduled_service_suspension_if_due(conn, service_id, payment_date)
    if str((service or {}).get('service_status') or 'active') == 'suspended':
        conn.close()
        return jsonify({'error': 'This service is suspended and cannot receive payments'}), 400

    renew_service_if_needed(conn, service_id, payment_date)

    service = row_to_dict(conn.execute(
        "SELECT * FROM organization_services WHERE id = ?",
        (service_id,)
    ).fetchone())

    active_period = get_active_contract_period(conn, service_id)
    if not active_period:
        active_period = create_first_contract_period(conn, service_id)

    if not active_period:
        conn.close()
        return jsonify({'error': 'Active contract period not found'}), 500

    current_due = float(active_period['due_amount'] or 0)

    if amount > current_due:
        conn.close()
        return jsonify({'error': 'Payment amount cannot be greater than due amount'}), 400

    new_period_paid = float(active_period['paid_amount'] or 0) + amount
    new_period_due = current_due - amount
    created_by = data.get('created_by')

    current_due_date = service.get('due_date') or payment_date
    next_due_date = calculate_next_due_date(
        current_due_date,
        service.get('payment_method'),
        service.get('payment_interval_days')
    )

    cursor = conn.execute(
        """INSERT INTO payments (service_id, contract_period_id, amount, payment_date, note, created_by)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (service_id, active_period['id'], amount, payment_date, data.get('note'), created_by)
    )
    payment_id = cursor.lastrowid

    conn.execute(
        """UPDATE service_contract_periods SET
               paid_amount = ?,
               due_amount = ?,
               updated_at = datetime('now')
           WHERE id = ?""",
        (new_period_paid, new_period_due, active_period['id'])
    )

    conn.execute(
        """UPDATE organization_services SET
               last_payment_amount = ?,
               last_payment_date = ?,
               due_date = ?,
               updated_at = datetime('now')
           WHERE id = ?""",
        (amount, payment_date, next_due_date, service_id)
    )

    updated_service = sync_service_summary_from_period(conn, service_id)

    create_official_book_record(
        conn,
        operation_type='new_payment',
        entity_type='payment',
        entity_id=payment_id,
        organization_id=service.get('organization_id'),
        service_id=service_id,
        payment_id=payment_id,
        contract_period_id=active_period['id'],
        official_book_date=official_book_date,
        official_book_description=official_book_description,
        created_by=created_by
    )

    log_action(conn, created_by, f"Recorded payment for service {service_id}",
               entity_type='payment', entity_id=payment_id,
               details=(
                   f"amount={amount}, payment_date={payment_date}, next_due_date={next_due_date}, "
                   f"contract_period_id={active_period['id']}"
               ))

    conn.commit()

    active_period_after = get_active_contract_period(conn, service_id)
    conn.close()

    return jsonify({
        'message': 'Payment recorded',
        'service': updated_service,
        'active_contract_period': active_period_after,
        'payment': {
            'id': payment_id,
            'amount': amount,
            'payment_date': payment_date,
            'next_due_date': next_due_date,
            'contract_period_id': active_period['id'],
            'official_book_date': official_book_date,
            'official_book_description': official_book_description
        }
    }), 201


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    conn = get_db()

    service_ids = rows_to_list(conn.execute(
        "SELECT id FROM organization_services"
    ).fetchall())

    for svc in service_ids:
        renew_service_if_needed(conn, svc['id'])

    conn.commit()

    stats = {
        'total_organizations': conn.execute("SELECT COUNT(*) FROM organizations").fetchone()[0],
        'active_organizations': conn.execute(
            "SELECT COUNT(*) FROM organizations WHERE status = 'active'"
        ).fetchone()[0],
        'total_services': conn.execute("SELECT COUNT(*) FROM organization_services").fetchone()[0],
        'active_services': conn.execute(
            "SELECT COUNT(*) FROM organization_services WHERE is_active = 1"
        ).fetchone()[0],
        'total_provider_companies': conn.execute(
            "SELECT COUNT(*) FROM provider_companies"
        ).fetchone()[0],
        'active_provider_companies': conn.execute(
            "SELECT COUNT(*) FROM provider_companies WHERE is_active = 1"
        ).fetchone()[0],
        'total_users': conn.execute("SELECT COUNT(*) FROM users").fetchone()[0],
        'total_payments_count': conn.execute("SELECT COUNT(*) FROM payments").fetchone()[0],
        'total_paid_amount': conn.execute(
            "SELECT COALESCE(SUM(paid_amount), 0) FROM organization_services"
        ).fetchone()[0],
        'total_due_amount': conn.execute(
            "SELECT COALESCE(SUM(due_amount), 0) FROM organization_services"
        ).fetchone()[0],
        'active_periods_count': conn.execute(
            "SELECT COUNT(*) FROM service_contract_periods WHERE status = 'active'"
        ).fetchone()[0],
        'closed_periods_count': conn.execute(
            "SELECT COUNT(*) FROM service_contract_periods WHERE status != 'active'"
        ).fetchone()[0],
        'organizations_by_status': rows_to_list(conn.execute(
            "SELECT status, COUNT(*) as count FROM organizations GROUP BY status"
        ).fetchall()),
        'recent_organizations': rows_to_list(conn.execute(
            """SELECT id, name, status, created_at FROM organizations
               ORDER BY created_at DESC LIMIT 5"""
        ).fetchall()),
    }

    conn.close()
    return jsonify(stats), 200


# ══════════════════════════════════════════════════════════════════════════════
# HISTORY
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/activity', methods=['GET'])
@app.route('/api/history', methods=['GET'])
def get_activity():
    limit = min(request.args.get('limit', 50, type=int), 200)
    conn = get_db()
    logs = rows_to_list(conn.execute(
        """SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
                  u.username
           FROM activity_log a
           LEFT JOIN users u ON a.user_id = u.id
           ORDER BY a.created_at DESC
           LIMIT ?""",
        (limit,)
    ).fetchall())
    conn.close()
    return jsonify({'activity': logs, 'count': len(logs)}), 200


@app.route('/api/history/all', methods=['GET'])
def get_full_history():
    try:
        limit = request.args.get('limit', 100, type=int)

        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                al.id,
                'activity' AS kind,
                al.action,
                al.entity_type,
                al.entity_id,
                al.details,
                al.created_at,
                al.user_id,
                u.username
            FROM activity_log al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT ?
        """, (limit,))
        activity_rows = [dict(row) for row in cursor.fetchall()]

        cursor.execute("""
            SELECT
                p.id,
                'payment' AS kind,
                'Payment Recorded' AS action,
                'payment' AS entity_type,
                p.id AS entity_id,
                p.amount,
                p.payment_date,
                p.note,
                p.created_at,
                p.created_by AS user_id,
                u.username,
                s.id AS service_id,
                s.service_type,
                o.id AS organization_id,
                o.name AS organization_name,
                p.contract_period_id,
                obr.official_book_date,
                obr.official_book_description
            FROM payments p
            LEFT JOIN users u ON p.created_by = u.id
            LEFT JOIN organization_services s ON p.service_id = s.id
            LEFT JOIN organizations o ON s.organization_id = o.id
            LEFT JOIN official_book_records obr ON obr.payment_id = p.id
            ORDER BY p.created_at DESC
            LIMIT ?
        """, (limit,))
        payment_rows = [dict(row) for row in cursor.fetchall()]

        cursor.execute("""
            SELECT
                obr.id,
                'official_book' AS kind,
                obr.operation_type AS action,
                obr.entity_type,
                obr.entity_id,
                obr.operation_type,
                obr.organization_id,
                o.name AS organization_name,
                obr.service_id,
                s.service_type,
                obr.payment_id,
                obr.contract_period_id,
                obr.provider_subscription_id,
                obr.service_range_id,
                obr.official_book_date,
                obr.official_book_description,
                obr.created_at,
                obr.created_by AS user_id,
                u.username
            FROM official_book_records obr
            LEFT JOIN users u ON obr.created_by = u.id
            LEFT JOIN organizations o ON obr.organization_id = o.id
            LEFT JOIN organization_services s ON obr.service_id = s.id
            ORDER BY obr.created_at DESC
            LIMIT ?
        """, (limit,))
        official_book_rows = [dict(row) for row in cursor.fetchall()]

        cursor.execute("""
            SELECT
                ss.id,
                'service_suspension' AS kind,
                CASE
                    WHEN ss.status = 'executed' THEN 'Service Suspended'
                    ELSE 'Service Suspension Scheduled'
                END AS action,
                'service_suspension' AS entity_type,
                ss.id AS entity_id,
                ss.service_id,
                s.service_type,
                ss.organization_id,
                o.name AS organization_name,
                ss.contract_period_id,
                ss.effective_date,
                ss.is_immediate,
                ss.refund_amount,
                ss.dropped_due_amount,
                ss.note,
                ss.status,
                ss.executed_at,
                ss.created_at,
                ss.created_by AS user_id,
                u.username,
                obr.official_book_date,
                obr.official_book_description
            FROM service_suspensions ss
            LEFT JOIN organization_services s ON ss.service_id = s.id
            LEFT JOIN organizations o ON ss.organization_id = o.id
            LEFT JOIN users u ON ss.created_by = u.id
            LEFT JOIN official_book_records obr
              ON obr.entity_type = 'service_suspension' AND obr.entity_id = ss.id
            ORDER BY COALESCE(ss.executed_at, ss.created_at) DESC
            LIMIT ?
        """, (limit,))
        suspension_rows = [dict(row) for row in cursor.fetchall()]

        cursor.execute("""
            SELECT
                scp.id,
                'contract_period' AS kind,
                CASE
                    WHEN scp.status = 'active' THEN 'Active Contract Period'
                    ELSE 'Closed Contract Period'
                END AS action,
                'contract_period' AS entity_type,
                scp.id AS entity_id,
                scp.service_id,
                scp.period_number,
                scp.period_label,
                scp.start_date,
                scp.end_date,
                scp.base_amount,
                scp.carried_debt,
                scp.total_amount,
                scp.paid_amount,
                scp.due_amount,
                scp.status,
                scp.closed_reason,
                scp.previous_period_id,
                COALESCE(scp.closed_at, scp.created_at) AS created_at,
                s.service_type,
                o.id AS organization_id,
                o.name AS organization_name
            FROM service_contract_periods scp
            LEFT JOIN organization_services s ON scp.service_id = s.id
            LEFT JOIN organizations o ON s.organization_id = o.id
            ORDER BY COALESCE(scp.closed_at, scp.created_at) DESC
            LIMIT ?
        """, (limit,))
        period_rows = [dict(row) for row in cursor.fetchall()]

        merged = []

        for row in activity_rows:
            merged.append({
                "id": f"activity-{row['id']}",
                "kind": "activity",
                "action": row.get("action"),
                "entity_type": row.get("entity_type"),
                "entity_id": row.get("entity_id"),
                "details": row.get("details"),
                "created_at": row.get("created_at"),
                "user_id": row.get("user_id"),
                "username": row.get("username"),
            })

        for row in payment_rows:
            merged.append({
                "id": f"payment-{row['id']}",
                "kind": "payment",
                "action": row.get("action"),
                "entity_type": "payment",
                "entity_id": row.get("entity_id"),
                "details": f"Organization: {row.get('organization_name') or '-'}\n"
                           f"Service Type: {row.get('service_type') or '-'}\n"
                           f"Service ID: {row.get('service_id') or '-'}\n"
                           f"Contract Period ID: {row.get('contract_period_id') or '-'}\n"
                           f"Amount: {row.get('amount') or 0}\n"
                           f"Payment Date: {row.get('payment_date') or '-'}\n"
                           f"Note: {row.get('note') or '-'}",
                "created_at": row.get("created_at") or row.get("payment_date"),
                "user_id": row.get("user_id"),
                "username": row.get("username"),
                "payment_amount": row.get("amount"),
                "payment_date": row.get("payment_date"),
                "organization_id": row.get("organization_id"),
                "organization_name": row.get("organization_name"),
                "service_id": row.get("service_id"),
                "service_type": row.get("service_type"),
                "contract_period_id": row.get("contract_period_id"),
                "official_book_date": row.get("official_book_date"),
                "official_book_description": row.get("official_book_description"),
            })

        for row in official_book_rows:
            merged.append({
                "id": f"official-book-{row['id']}",
                "kind": "official_book",
                "action": row.get("action"),
                "entity_type": row.get("entity_type"),
                "entity_id": row.get("entity_id"),
                "details": f"Organization: {row.get('organization_name') or '-'}\n"
                           f"Service Type: {row.get('service_type') or '-'}\n"
                           f"Official Book Date: {row.get('official_book_date') or '-'}\n"
                           f"Description: {row.get('official_book_description') or '-'}",
                "created_at": row.get("created_at"),
                "user_id": row.get("user_id"),
                "username": row.get("username"),
                "organization_id": row.get("organization_id"),
                "organization_name": row.get("organization_name"),
                "service_id": row.get("service_id"),
                "service_type": row.get("service_type"),
                "operation_type": row.get("operation_type"),
                "official_book_date": row.get("official_book_date"),
                "official_book_description": row.get("official_book_description"),
                "payment_id": row.get("payment_id"),
                "contract_period_id": row.get("contract_period_id"),
                "provider_subscription_id": row.get("provider_subscription_id"),
                "service_range_id": row.get("service_range_id"),
            })

        for row in suspension_rows:
            merged.append({
                "id": f"service-suspension-{row['id']}",
                "kind": "service_suspension",
                "action": row.get("action"),
                "entity_type": "service_suspension",
                "entity_id": row.get("entity_id"),
                "details": f"Organization: {row.get('organization_name') or '-'}\n"
                           f"Service Type: {row.get('service_type') or '-'}\n"
                           f"Service ID: {row.get('service_id') or '-'}\n"
                           f"Effective Date: {row.get('effective_date') or '-'}\n"
                           f"Dropped Due Amount: {row.get('dropped_due_amount') or 0}\n"
                           f"Refund Amount: {row.get('refund_amount') or 0}\n"
                           f"Status: {row.get('status') or '-'}\n"
                           f"Note: {row.get('note') or '-'}",
                "created_at": row.get("executed_at") or row.get("created_at"),
                "user_id": row.get("user_id"),
                "username": row.get("username"),
                "organization_id": row.get("organization_id"),
                "organization_name": row.get("organization_name"),
                "service_id": row.get("service_id"),
                "service_type": row.get("service_type"),
                "contract_period_id": row.get("contract_period_id"),
                "effective_date": row.get("effective_date"),
                "refund_amount": row.get("refund_amount"),
                "dropped_due_amount": row.get("dropped_due_amount"),
                "suspension_status": row.get("status"),
                "official_book_date": row.get("official_book_date"),
                "official_book_description": row.get("official_book_description"),
            })

        for row in period_rows:
            merged.append({
                "id": f"period-{row['id']}",
                "kind": "contract_period",
                "action": row.get("action"),
                "entity_type": "contract_period",
                "entity_id": row.get("entity_id"),
                "details": f"Organization: {row.get('organization_name') or '-'}\n"
                           f"Service Type: {row.get('service_type') or '-'}\n"
                           f"Service ID: {row.get('service_id') or '-'}\n"
                           f"Period Number: {row.get('period_number') or '-'}\n"
                           f"Period Label: {row.get('period_label') or '-'}\n"
                           f"Start Date: {row.get('start_date') or '-'}\n"
                           f"End Date: {row.get('end_date') or '-'}\n"
                           f"Base Amount: {row.get('base_amount') or 0}\n"
                           f"Carried Debt: {row.get('carried_debt') or 0}\n"
                           f"Total Amount: {row.get('total_amount') or 0}\n"
                           f"Paid Amount: {row.get('paid_amount') or 0}\n"
                           f"Due Amount: {row.get('due_amount') or 0}\n"
                           f"Status: {row.get('status') or '-'}\n"
                           f"Closed Reason: {row.get('closed_reason') or '-'}\n"
                           f"Previous Period ID: {row.get('previous_period_id') or '-'}",
                "created_at": row.get("created_at"),
                "organization_id": row.get("organization_id"),
                "organization_name": row.get("organization_name"),
                "service_id": row.get("service_id"),
                "service_type": row.get("service_type"),
                "period_number": row.get("period_number"),
                "period_status": row.get("status"),
                "base_amount": row.get("base_amount"),
                "carried_debt": row.get("carried_debt"),
                "total_amount": row.get("total_amount"),
                "paid_amount": row.get("paid_amount"),
                "due_amount": row.get("due_amount"),
            })

        merged.sort(key=lambda x: x.get("created_at") or "", reverse=True)

        conn.close()

        return jsonify({
            "count": len(merged),
            "history": merged[:limit * 3]
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500





def _xml_escape(value):
    text = '' if value is None else str(value)
    return (text
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace("'", '&apos;'))


def _service_type_label(value):
    mapping = {
        'Wireless': 'وايرلس',
        'FTTH': 'FTTH',
        'Optical': 'Optical',
        'Other': 'أخرى',
    }
    return mapping.get(value, value or '')


def _build_detail_report_rows(conn, org_id):
    organization = row_to_dict(conn.execute(
        "SELECT id, name FROM organizations WHERE id = ?",
        (org_id,)
    ).fetchone())

    if not organization:
        return None, []

    services = rows_to_list(conn.execute(
        "SELECT * FROM organization_services WHERE organization_id = ? ORDER BY id",
        (org_id,)
    ).fetchall())

    rows = []
    sequence = 1

    for service in services:
        items = rows_to_list(conn.execute(
            """SELECT si.*, pc.name AS provider_company_name
               FROM service_items si
               LEFT JOIN provider_companies pc ON pc.id = si.provider_company_id
               WHERE si.service_id = ?
               ORDER BY si.id""",
            (service['id'],)
        ).fetchall())

        if not items:
            active_period = get_active_contract_period(conn, service['id']) or {}
            base_amount = float(active_period.get('base_amount') or service.get('annual_amount') or 0)
            rows.append({
                'sequence': sequence,
                'organization_name': organization.get('name') or '',
                'provider_name': 'بدون مزود',
                'service_type': _service_type_label(service.get('service_type')),
                'service_amount': '',
                'lines_count': '',
                'count': '',
                'monthly_amount': round(base_amount, 2),
                'notes': service.get('notes') or '',
            })
            sequence += 1
            continue

        for item in items:
            quantity = float(item.get('quantity') or 0)
            monthly_amount = round(quantity * float(item.get('unit_price') or 0), 2)
            category = item.get('item_category') or ''
            detail_parts = [
                item.get('item_name') or '',
                item.get('line_type') or '',
                item.get('bundle_type') or '',
            ]
            service_amount = ' - '.join([part for part in detail_parts if part]).strip(' -')

            if not service_amount:
                service_amount = category

            rows.append({
                'sequence': sequence,
                'organization_name': organization.get('name') or '',
                'provider_name': item.get('provider_company_name') or 'بدون مزود',
                'service_type': _service_type_label(service.get('service_type')),
                'service_amount': service_amount,
                'lines_count': int(quantity) if category == 'Line' and quantity.is_integer() else (quantity if category == 'Line' else ''),
                'count': '' if category == 'Line' else (int(quantity) if quantity.is_integer() else quantity),
                'monthly_amount': monthly_amount,
                'notes': item.get('notes') or service.get('notes') or '',
            })
            sequence += 1

    return organization, rows


def _build_excel_xml_report(title, headers, rows):
    workbook = [
        '<?xml version="1.0"?>',
        '<?mso-application progid="Excel.Sheet"?>',
        '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
        ' xmlns:o="urn:schemas-microsoft-com:office:office"',
        ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
        ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"',
        ' xmlns:html="http://www.w3.org/TR/REC-html40">',
        ' <Styles>',
        '  <Style ss:ID="Default" ss:Name="Normal">',
        '   <Alignment ss:Vertical="Center" ss:ReadingOrder="RightToLeft"/>',
        '   <Borders/>',
        '   <Font ss:FontName="Arial" ss:Size="11"/>',
        '   <Interior/>',
        '   <NumberFormat/>',
        '   <Protection/>',
        '  </Style>',
        '  <Style ss:ID="Header">',
        '   <Font ss:FontName="Arial" ss:Size="11" ss:Bold="1"/>',
        '   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:ReadingOrder="RightToLeft"/>',
        '   <Borders>',
        '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '   </Borders>',
        '   <Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/>',
        '  </Style>',
        '  <Style ss:ID="Cell">',
        '   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:ReadingOrder="RightToLeft" ss:WrapText="1"/>',
        '   <Borders>',
        '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '   </Borders>',
        '  </Style>',
        '  <Style ss:ID="MoneyCell">',
        '   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:ReadingOrder="RightToLeft"/>',
        '   <Borders>',
        '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '   </Borders>',
        '   <NumberFormat ss:Format="0.00"/>',
        '  </Style>',
        '  <Style ss:ID="Title">',
        '   <Font ss:FontName="Arial" ss:Size="14" ss:Bold="1"/>',
        '   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:ReadingOrder="RightToLeft"/>',
        '  </Style>',
        ' </Styles>',
        f' <Worksheet ss:Name="{_xml_escape(title)[:31]}">',
        '  <Table ss:ExpandedColumnCount="9" ss:DefaultRowHeight="20">',
        '   <Column ss:Width="40"/>',
        '   <Column ss:Width="150"/>',
        '   <Column ss:Width="150"/>',
        '   <Column ss:Width="110"/>',
        '   <Column ss:Width="160"/>',
        '   <Column ss:Width="80"/>',
        '   <Column ss:Width="80"/>',
        '   <Column ss:Width="130"/>',
        '   <Column ss:Width="180"/>',
        '   <Row ss:Height="26">',
        f'    <Cell ss:MergeAcross="8" ss:StyleID="Title"><Data ss:Type="String">{_xml_escape(title)}</Data></Cell>',
        '   </Row>',
        '   <Row ss:Height="24">',
    ]

    for header in headers:
        workbook.append(f'    <Cell ss:StyleID="Header"><Data ss:Type="String">{_xml_escape(header)}</Data></Cell>')
    workbook.append('   </Row>')

    for row in rows:
        workbook.append('   <Row>')
        workbook.append(f'    <Cell ss:StyleID="Cell"><Data ss:Type="Number">{row.get("sequence", 0)}</Data></Cell>')
        workbook.append(f'    <Cell ss:StyleID="Cell"><Data ss:Type="String">{_xml_escape(row.get("organization_name", ""))}</Data></Cell>')
        workbook.append(f'    <Cell ss:StyleID="Cell"><Data ss:Type="String">{_xml_escape(row.get("provider_name", ""))}</Data></Cell>')
        workbook.append(f'    <Cell ss:StyleID="Cell"><Data ss:Type="String">{_xml_escape(row.get("service_type", ""))}</Data></Cell>')
        workbook.append(f'    <Cell ss:StyleID="Cell"><Data ss:Type="String">{_xml_escape(row.get("service_amount", ""))}</Data></Cell>')
        lines_count = row.get("lines_count", '')
        if lines_count == '':
            workbook.append('    <Cell ss:StyleID="Cell"><Data ss:Type="String"></Data></Cell>')
        else:
            workbook.append(f'    <Cell ss:StyleID="Cell"><Data ss:Type="Number">{lines_count}</Data></Cell>')
        count_value = row.get("count", '')
        if count_value == '':
            workbook.append('    <Cell ss:StyleID="Cell"><Data ss:Type="String"></Data></Cell>')
        else:
            workbook.append(f'    <Cell ss:StyleID="Cell"><Data ss:Type="Number">{count_value}</Data></Cell>')
        workbook.append(f'    <Cell ss:StyleID="MoneyCell"><Data ss:Type="Number">{float(row.get("monthly_amount", 0) or 0):.2f}</Data></Cell>')
        workbook.append(f'    <Cell ss:StyleID="Cell"><Data ss:Type="String">{_xml_escape(row.get("notes", ""))}</Data></Cell>')
        workbook.append('   </Row>')

    workbook.extend([
        '  </Table>',
        '  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">',
        '   <DisplayRightToLeft/>',
        '   <FreezePanes/>',
        '   <FrozenNoSplit/>',
        '   <SplitHorizontal>2</SplitHorizontal>',
        '   <TopRowBottomPane>2</TopRowBottomPane>',
        '   <ActivePane>2</ActivePane>',
        '  </WorksheetOptions>',
        ' </Worksheet>',
        '</Workbook>',
    ])

    return '\n'.join(workbook)


# ══════════════════════════════════════════════════════════════════════════════
# STATISTICS & REPORTS
# ══════════════════════════════════════════════════════════════════════════════

def _normalize_report_date(value):
    value = (value or '').strip()
    if not value:
        return ''
    for fmt in ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(value, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).strftime('%Y-%m-%d')
    except ValueError:
        return ''


def _service_item_contract_total_expr():
    duration_value_expr = "CASE WHEN COALESCE(os.contract_duration_value, 0) > 0 THEN os.contract_duration_value ELSE 1 END"
    base_monthly_expr = "COALESCE(si.quantity, 0) * COALESCE(si.unit_price, 0)"

    return f"""
        CASE
            WHEN COALESCE(os.contract_duration_unit, 'شهري') = 'يومي' THEN
                (({base_monthly_expr}) / 30.0) * ({duration_value_expr})
            WHEN COALESCE(os.contract_duration_unit, 'شهري') = 'سنوي' THEN
                ({base_monthly_expr}) * 12.0 * ({duration_value_expr})
            ELSE
                ({base_monthly_expr}) * ({duration_value_expr})
        END
    """


def _provider_share_expr(value_field):
    item_total_expr = _service_item_contract_total_expr()
    return f"""
        CASE
            WHEN COALESCE(os.annual_amount, 0) > 0 THEN
                (({item_total_expr}) / os.annual_amount) * COALESCE({value_field}, 0)
            ELSE 0
        END
    """


@app.route('/api/statistics/general', methods=['GET'])
def get_general_statistics():
    try:
        conn = get_db()
        data = _build_general_statistics_data(conn)
        conn.close()
        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/statistics/providers', methods=['GET'])
def get_provider_statistics_list():
    try:
        conn = get_db()
        cursor = conn.cursor()
        rows = rows_to_list(cursor.execute(f"""
            SELECT
                pc.id,
                pc.name,
                pc.is_active,
                COUNT(DISTINCT os.organization_id) AS organizations_count,
                COUNT(DISTINCT os.id) AS services_count,
                COUNT(si.id) AS items_count,
                COALESCE(SUM({_service_item_contract_total_expr()}), 0) AS total_contract_value,
                COALESCE(SUM({_provider_share_expr('os.paid_amount')}), 0) AS estimated_received_amount,
                COALESCE(SUM({_provider_share_expr('os.due_amount')}), 0) AS estimated_due_amount
            FROM provider_companies pc
            LEFT JOIN service_items si ON si.provider_company_id = pc.id
            LEFT JOIN organization_services os ON os.id = si.service_id
            GROUP BY pc.id, pc.name, pc.is_active
            ORDER BY pc.name COLLATE NOCASE ASC
        """).fetchall())
        conn.close()
        return jsonify({'providers': rows, 'count': len(rows)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/statistics/providers/<int:provider_id>', methods=['GET'])
def get_provider_statistics_detail(provider_id):
    try:
        conn = get_db()
        data = _build_provider_statistics_detail_data(conn, provider_id)
        conn.close()
        if not data:
            return jsonify({'error': 'Provider company not found'}), 404
        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500





def _build_excel_xml_workbook(sheets):
    workbook = [
        '<?xml version="1.0"?>',
        '<?mso-application progid="Excel.Sheet"?>',
        '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
        ' xmlns:o="urn:schemas-microsoft-com:office:office"',
        ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
        ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"',
        ' xmlns:html="http://www.w3.org/TR/REC-html40">',
        ' <Styles>',
        '  <Style ss:ID="Default" ss:Name="Normal">',
        '   <Alignment ss:Vertical="Center" ss:ReadingOrder="RightToLeft"/>',
        '   <Borders/>',
        '   <Font ss:FontName="Arial" ss:Size="11"/>',
        '   <Interior/>',
        '   <NumberFormat/>',
        '   <Protection/>',
        '  </Style>',
        '  <Style ss:ID="Title">',
        '   <Font ss:FontName="Arial" ss:Size="12" ss:Bold="1"/>',
        '   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:ReadingOrder="RightToLeft"/>',
        '   <Borders>',
        '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '   </Borders>',
        '   <Interior ss:Color="#B8CCE4" ss:Pattern="Solid"/>',
        '  </Style>',
        '  <Style ss:ID="Header">',
        '   <Font ss:FontName="Arial" ss:Size="11" ss:Bold="1"/>',
        '   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:ReadingOrder="RightToLeft"/>',
        '   <Borders>',
        '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '   </Borders>',
        '   <Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/>',
        '  </Style>',
        '  <Style ss:ID="Cell">',
        '   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:ReadingOrder="RightToLeft" ss:WrapText="1"/>',
        '   <Borders>',
        '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '   </Borders>',
        '  </Style>',
        '  <Style ss:ID="Money">',
        '   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:ReadingOrder="RightToLeft"/>',
        '   <Borders>',
        '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>',
        '   </Borders>',
        '   <NumberFormat ss:Format="Standard"/>',
        '  </Style>',
        ' </Styles>',
    ]

    for sheet in sheets:
        title = _xml_escape(sheet.get('title') or 'تقرير')
        headers = sheet.get('headers') or []
        rows = sheet.get('rows') or []
        name = _xml_escape((sheet.get('name') or 'Sheet1')[:31])
        workbook.append(f' <Worksheet ss:Name="{name}">')
        workbook.append('  <Table ss:ExpandedColumnCount="{}" ss:ExpandedRowCount="{}" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="20">'.format(max(len(headers),1), len(rows) + (2 if headers else 1) + (1 if title else 0)))
        for _ in headers:
            workbook.append('   <Column ss:AutoFitWidth="1" ss:Width="120"/>')
        if title and headers:
            workbook.append('   <Row ss:Height="24">')
            workbook.append(f'    <Cell ss:MergeAcross="{max(len(headers)-1,0)}" ss:StyleID="Title"><Data ss:Type="String">{title}</Data></Cell>')
            workbook.append('   </Row>')
        if headers:
            workbook.append('   <Row ss:Height="22">')
            for header in headers:
                workbook.append(f'    <Cell ss:StyleID="Header"><Data ss:Type="String">{_xml_escape(header)}</Data></Cell>')
            workbook.append('   </Row>')
        for row in rows:
            workbook.append('   <Row>')
            for value in row:
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    style = 'Money' if isinstance(value, float) or value > 999 else 'Cell'
                    workbook.append(f'    <Cell ss:StyleID="{style}"><Data ss:Type="Number">{value}</Data></Cell>')
                else:
                    workbook.append(f'    <Cell ss:StyleID="Cell"><Data ss:Type="String">{_xml_escape(value)}</Data></Cell>')
            workbook.append('   </Row>')
        workbook.append('  </Table>')
        workbook.append(' </Worksheet>')

    workbook.append('</Workbook>')
    return '\n'.join(workbook)


def _excel_response_from_sheets(filename, sheets):
    response = Response(_build_excel_xml_workbook(sheets).encode('utf-8-sig'), mimetype='application/vnd.ms-excel; charset=utf-8')
    response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def _build_general_statistics_data(conn):
    cursor = conn.cursor()
    summary = {
        'total_organizations': cursor.execute("SELECT COUNT(*) FROM organizations").fetchone()[0],
        'active_organizations': cursor.execute("SELECT COUNT(*) FROM organizations WHERE status = 'active'").fetchone()[0],
        'total_provider_companies': cursor.execute("SELECT COUNT(*) FROM provider_companies").fetchone()[0],
        'active_provider_companies': cursor.execute("SELECT COUNT(*) FROM provider_companies WHERE is_active = 1").fetchone()[0],
        'total_services': cursor.execute("SELECT COUNT(*) FROM organization_services").fetchone()[0],
        'active_services': cursor.execute("SELECT COUNT(*) FROM organization_services WHERE is_active = 1").fetchone()[0],
        'total_payments_count': cursor.execute("SELECT COUNT(*) FROM payments").fetchone()[0],
        'total_paid_amount': float(cursor.execute("SELECT COALESCE(SUM(amount), 0) FROM payments").fetchone()[0] or 0),
        'total_due_amount': float(cursor.execute("SELECT COALESCE(SUM(due_amount), 0) FROM organization_services").fetchone()[0] or 0),
        'official_books_count': cursor.execute("SELECT COUNT(*) FROM official_book_records").fetchone()[0],
    }
    service_type_stats = rows_to_list(cursor.execute("""
        SELECT
            service_type,
            COUNT(*) AS services_count,
            COUNT(DISTINCT organization_id) AS organizations_count,
            COALESCE(SUM(annual_amount), 0) AS total_contract_amount,
            COALESCE(SUM(paid_amount), 0) AS total_paid_amount,
            COALESCE(SUM(due_amount), 0) AS total_due_amount
        FROM organization_services
        GROUP BY service_type
        ORDER BY total_contract_amount DESC, services_count DESC
    """).fetchall())
    provider_overview = rows_to_list(cursor.execute(f"""
        SELECT
            pc.id,
            pc.name,
            COUNT(DISTINCT os.organization_id) AS organizations_count,
            COUNT(DISTINCT os.id) AS services_count,
            COUNT(si.id) AS items_count,
            COALESCE(SUM({_service_item_contract_total_expr()}), 0) AS total_contract_value,
            COALESCE(SUM({_provider_share_expr('os.paid_amount')}), 0) AS estimated_received_amount,
            COALESCE(SUM({_provider_share_expr('os.due_amount')}), 0) AS estimated_due_amount
        FROM provider_companies pc
        LEFT JOIN service_items si ON si.provider_company_id = pc.id
        LEFT JOIN organization_services os ON os.id = si.service_id
        GROUP BY pc.id, pc.name
        ORDER BY organizations_count DESC, total_contract_value DESC, pc.name ASC
        LIMIT 10
    """).fetchall())
    monthly_payments = rows_to_list(cursor.execute("""
        SELECT
            substr(payment_date, 1, 7) AS month,
            COUNT(*) AS payments_count,
            COALESCE(SUM(amount), 0) AS total_amount
        FROM payments
        WHERE payment_date IS NOT NULL AND trim(payment_date) != ''
        GROUP BY substr(payment_date, 1, 7)
        ORDER BY month DESC
        LIMIT 12
    """).fetchall())
    monthly_payments.reverse()
    return {
        'summary': summary,
        'service_type_stats': service_type_stats,
        'provider_overview': provider_overview,
        'monthly_payments': monthly_payments,
    }


def _build_provider_statistics_detail_data(conn, provider_id, from_date=None, to_date=None):
    cursor = conn.cursor()
    provider = row_to_dict(cursor.execute("""
        SELECT id, name, phone, address, email, is_active, created_at
        FROM provider_companies
        WHERE id = ?
    """, (provider_id,)).fetchone())
    if not provider:
        return None

    summary = row_to_dict(cursor.execute(f"""
        SELECT
            COUNT(DISTINCT os.organization_id) AS organizations_count,
            COUNT(DISTINCT os.id) AS services_count,
            COUNT(si.id) AS items_count,
            COALESCE(SUM({_service_item_contract_total_expr()}), 0) AS total_contract_value,
            COALESCE(SUM({_provider_share_expr('os.paid_amount')}), 0) AS estimated_received_amount,
            COALESCE(SUM({_provider_share_expr('os.due_amount')}), 0) AS estimated_due_amount
        FROM service_items si
        LEFT JOIN organization_services os ON os.id = si.service_id
        WHERE si.provider_company_id = ?
    """, (provider_id,)).fetchone()) or {}

    organizations = rows_to_list(cursor.execute(f"""
        SELECT
            o.id AS organization_id,
            o.name AS organization_name,
            o.status AS organization_status,
            COUNT(DISTINCT os.id) AS services_count,
            COUNT(si.id) AS items_count,
            COALESCE(SUM({_service_item_contract_total_expr()}), 0) AS total_contract_value,
            COALESCE(SUM({_provider_share_expr('os.paid_amount')}), 0) AS estimated_received_amount,
            COALESCE(SUM({_provider_share_expr('os.due_amount')}), 0) AS estimated_due_amount
        FROM service_items si
        JOIN organization_services os ON os.id = si.service_id
        JOIN organizations o ON o.id = os.organization_id
        WHERE si.provider_company_id = ?
        GROUP BY o.id, o.name, o.status
        ORDER BY total_contract_value DESC, o.name ASC
    """, (provider_id,)).fetchall())

    service_types = rows_to_list(cursor.execute(f"""
        SELECT
            os.service_type,
            COUNT(DISTINCT os.id) AS services_count,
            COUNT(si.id) AS items_count,
            COALESCE(SUM({_service_item_contract_total_expr()}), 0) AS total_contract_value,
            COALESCE(SUM({_provider_share_expr('os.paid_amount')}), 0) AS estimated_received_amount,
            COALESCE(SUM({_provider_share_expr('os.due_amount')}), 0) AS estimated_due_amount
        FROM service_items si
        JOIN organization_services os ON os.id = si.service_id
        WHERE si.provider_company_id = ?
        GROUP BY os.service_type
        ORDER BY total_contract_value DESC, os.service_type ASC
    """, (provider_id,)).fetchall())

    payment_conditions = ["""
        EXISTS (
            SELECT 1 FROM service_items si
            WHERE si.service_id = os.id AND si.provider_company_id = ?
        )
    """]
    payment_params = [provider_id]
    if from_date:
        payment_conditions.append("date(p.payment_date) >= date(?)")
        payment_params.append(from_date)
    if to_date:
        payment_conditions.append("date(p.payment_date) <= date(?)")
        payment_params.append(to_date)
    payment_where = " AND ".join(condition.strip() for condition in payment_conditions)

    filtered_payments = rows_to_list(cursor.execute(f"""
        SELECT
            p.id, p.amount, p.payment_date, p.note, os.service_type,
            o.id AS organization_id, o.name AS organization_name
        FROM payments p
        JOIN organization_services os ON os.id = p.service_id
        JOIN organizations o ON o.id = os.organization_id
        WHERE {payment_where}
        ORDER BY p.payment_date DESC, p.id DESC
    """, tuple(payment_params)).fetchall())

    payments_summary = row_to_dict(cursor.execute(f"""
        SELECT
            COUNT(*) AS payments_count,
            COALESCE(SUM(p.amount), 0) AS total_amount,
            COUNT(DISTINCT o.id) AS organizations_count,
            COUNT(DISTINCT os.id) AS services_count
        FROM payments p
        JOIN organization_services os ON os.id = p.service_id
        JOIN organizations o ON o.id = os.organization_id
        WHERE {payment_where}
    """, tuple(payment_params)).fetchone()) or {}

    return {
        'provider': provider,
        'summary': summary,
        'organizations': organizations,
        'service_types': service_types,
        'recent_payments': filtered_payments[:20],
        'filtered_payments': filtered_payments,
        'payments_summary': payments_summary,
        'filters': {
            'from_date': from_date,
            'to_date': to_date,
        },
    }


def _build_payments_report_data(conn, from_date, to_date):
    cursor = conn.cursor()
    payments = rows_to_list(cursor.execute("""
        SELECT
            p.id, p.amount, p.payment_date, p.note, p.created_at, os.id AS service_id,
            os.service_type, o.id AS organization_id, o.name AS organization_name,
            COALESCE(GROUP_CONCAT(DISTINCT pc.name), 'بدون مزود') AS provider_names,
            obr.official_book_date, obr.official_book_description
        FROM payments p
        JOIN organization_services os ON os.id = p.service_id
        JOIN organizations o ON o.id = os.organization_id
        LEFT JOIN service_items si ON si.service_id = os.id
        LEFT JOIN provider_companies pc ON pc.id = si.provider_company_id
        LEFT JOIN official_book_records obr ON obr.payment_id = p.id
        WHERE date(p.payment_date) BETWEEN date(?) AND date(?)
        GROUP BY p.id
        ORDER BY date(p.payment_date) DESC, p.id DESC
    """, (from_date, to_date)).fetchall())
    summary = row_to_dict(cursor.execute("""
        SELECT COUNT(*) AS payments_count, COALESCE(SUM(amount), 0) AS total_amount
        FROM payments
        WHERE date(payment_date) BETWEEN date(?) AND date(?)
    """, (from_date, to_date)).fetchone())
    by_organization = rows_to_list(cursor.execute("""
        SELECT
            o.id AS organization_id, o.name AS organization_name,
            COUNT(p.id) AS payments_count, COALESCE(SUM(p.amount), 0) AS total_amount
        FROM payments p
        JOIN organization_services os ON os.id = p.service_id
        JOIN organizations o ON o.id = os.organization_id
        WHERE date(p.payment_date) BETWEEN date(?) AND date(?)
        GROUP BY o.id, o.name
        ORDER BY total_amount DESC, o.name ASC
    """, (from_date, to_date)).fetchall())
    return {
        'from_date': from_date, 'to_date': to_date, 'summary': summary,
        'payments': payments, 'by_organization': by_organization,
    }


def _build_official_books_report_data(conn, from_date, to_date):
    cursor = conn.cursor()
    books = rows_to_list(cursor.execute("""
        SELECT
            obr.id, obr.operation_type, obr.entity_type, obr.entity_id,
            obr.official_book_date, obr.official_book_description, obr.created_at,
            o.id AS organization_id, o.name AS organization_name,
            os.service_type, p.amount AS payment_amount
        FROM official_book_records obr
        LEFT JOIN organizations o ON o.id = obr.organization_id
        LEFT JOIN organization_services os ON os.id = obr.service_id
        LEFT JOIN payments p ON p.id = obr.payment_id
        WHERE date(obr.official_book_date) BETWEEN date(?) AND date(?)
        ORDER BY date(obr.official_book_date) DESC, obr.id DESC
    """, (from_date, to_date)).fetchall())
    summary = row_to_dict(cursor.execute("""
        SELECT COUNT(*) AS books_count
        FROM official_book_records
        WHERE date(official_book_date) BETWEEN date(?) AND date(?)
    """, (from_date, to_date)).fetchone())
    by_operation = rows_to_list(cursor.execute("""
        SELECT operation_type, COUNT(*) AS books_count
        FROM official_book_records
        WHERE date(official_book_date) BETWEEN date(?) AND date(?)
        GROUP BY operation_type
        ORDER BY books_count DESC, operation_type ASC
    """, (from_date, to_date)).fetchall())
    return {
        'from_date': from_date, 'to_date': to_date, 'summary': summary,
        'books': books, 'by_operation': by_operation,
    }


@app.route('/api/organizations/<int:org_id>/detail-report', methods=['GET'])
def export_organization_detail_report(org_id):
    try:
        conn = get_db()
        organization, rows = _build_detail_report_rows(conn, org_id)
        conn.close()

        if not organization:
            return jsonify({'error': 'Organization not found'}), 404

        headers = [
            'ت',
            'اسم الجهة',
            'اسم الشركة',
            'نوع الخدمة',
            'مقدار الخدمة',
            'عدد الخطوط',
            'العدد',
            'المبلغ الشهري للخدمة',
            'الملاحظات',
        ]
        title = f"تقرير تفاصيل الجهة - {organization.get('name') or ''}".strip()
        report_xml = _build_excel_xml_report(title, headers, rows)

        safe_name = ''.join(ch if ch.isalnum() or ch in (' ', '-', '_') else '_' for ch in (organization.get('name') or f'organization_{org_id}')).strip() or f'organization_{org_id}'
        filename = f"detail_report_{safe_name}.xls"

        response = Response(report_xml.encode('utf-8-sig'), mimetype='application/vnd.ms-excel; charset=utf-8')
        response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/reports/payments', methods=['GET'])
def get_payments_report():
    try:
        from_date = _normalize_report_date(request.args.get('from_date'))
        to_date = _normalize_report_date(request.args.get('to_date'))

        if not from_date or not to_date:
            return jsonify({'error': 'from_date and to_date are required in YYYY-MM-DD format'}), 400

        if from_date > to_date:
            return jsonify({'error': 'from_date must be earlier than or equal to to_date'}), 400

        conn = get_db()
        data = _build_payments_report_data(conn, from_date, to_date)
        conn.close()
        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/reports/official-books', methods=['GET'])
def get_official_books_report():
    try:
        from_date = _normalize_report_date(request.args.get('from_date'))
        to_date = _normalize_report_date(request.args.get('to_date'))

        if not from_date or not to_date:
            return jsonify({'error': 'from_date and to_date are required in YYYY-MM-DD format'}), 400

        if from_date > to_date:
            return jsonify({'error': 'from_date must be earlier than or equal to to_date'}), 400

        conn = get_db()
        data = _build_official_books_report_data(conn, from_date, to_date)
        conn.close()
        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/statistics/general/export', methods=['GET'])
def export_general_statistics_report():
    try:
        conn = get_db()
        data = _build_general_statistics_data(conn)
        conn.close()
        sheets = [
            {
                'name': 'الملخص العام',
                'title': 'الإحصائيات العامة - الملخص',
                'headers': ['المؤشر', 'القيمة'],
                'rows': [
                    ['إجمالي الجهات', data['summary'].get('total_organizations', 0)],
                    ['الجهات الفعالة', data['summary'].get('active_organizations', 0)],
                    ['إجمالي الجهات المزودة', data['summary'].get('total_provider_companies', 0)],
                    ['الجهات المزودة الفعالة', data['summary'].get('active_provider_companies', 0)],
                    ['إجمالي الخدمات', data['summary'].get('total_services', 0)],
                    ['الخدمات الفعالة', data['summary'].get('active_services', 0)],
                    ['عدد الدفعات', data['summary'].get('total_payments_count', 0)],
                    ['إجمالي المبالغ المستلمة', float(data['summary'].get('total_paid_amount', 0) or 0)],
                    ['إجمالي المبالغ المتبقية', float(data['summary'].get('total_due_amount', 0) or 0)],
                    ['عدد الكتب الرسمية', data['summary'].get('official_books_count', 0)],
                ],
            },
            {
                'name': 'حسب نوع الخدمة',
                'title': 'الإحصائيات العامة - حسب نوع الخدمة',
                'headers': ['نوع الخدمة', 'عدد الخدمات', 'عدد الجهات', 'القيمة التعاقدية', 'المستلم', 'المتبقي'],
                'rows': [[row.get('service_type') or '', row.get('services_count') or 0, row.get('organizations_count') or 0, float(row.get('total_contract_amount') or 0), float(row.get('total_paid_amount') or 0), float(row.get('total_due_amount') or 0)] for row in data['service_type_stats']],
            },
            {
                'name': 'أفضل المزودين',
                'title': 'الإحصائيات العامة - أفضل الجهات المزودة',
                'headers': ['الجهة المزودة', 'عدد الجهات', 'عدد الخدمات', 'عدد العناصر', 'القيمة التعاقدية', 'المستلم', 'المتبقي'],
                'rows': [[row.get('name') or '', row.get('organizations_count') or 0, row.get('services_count') or 0, row.get('items_count') or 0, float(row.get('total_contract_value') or 0), float(row.get('estimated_received_amount') or 0), float(row.get('estimated_due_amount') or 0)] for row in data['provider_overview']],
            },
            {
                'name': 'الدفعات الشهرية',
                'title': 'الإحصائيات العامة - حركة الدفعات الشهرية',
                'headers': ['الشهر', 'عدد الدفعات', 'الإجمالي'],
                'rows': [[row.get('month') or '', row.get('payments_count') or 0, float(row.get('total_amount') or 0)] for row in data['monthly_payments']],
            },
        ]
        return _excel_response_from_sheets('statistics_general_report.xls', sheets)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/statistics/providers/<int:provider_id>/export', methods=['GET'])
def export_provider_statistics_report(provider_id):
    try:
        conn = get_db()
        data = _build_provider_statistics_detail_data(conn, provider_id)
        conn.close()
        if not data:
            return jsonify({'error': 'Provider company not found'}), 404
        provider_name = data['provider'].get('name') or f'provider_{provider_id}'
        sheets = [
            {
                'name': 'ملخص المزود',
                'title': f'إحصائيات الجهة المزودة - {provider_name}',
                'headers': ['المؤشر', 'القيمة'],
                'rows': [
                    ['اسم الجهة المزودة', provider_name],
                    ['الحالة', 'فعالة' if data['provider'].get('is_active') else 'غير فعالة'],
                    ['عدد الجهات المشتركة', data['summary'].get('organizations_count', 0)],
                    ['عدد الخدمات', data['summary'].get('services_count', 0)],
                    ['عدد العناصر', data['summary'].get('items_count', 0)],
                    ['القيمة التعاقدية', float(data['summary'].get('total_contract_value', 0) or 0)],
                    ['المبلغ المستلم', float(data['summary'].get('estimated_received_amount', 0) or 0)],
                    ['المبلغ المتبقي', float(data['summary'].get('estimated_due_amount', 0) or 0)],
                    ['الهاتف', data['provider'].get('phone') or ''],
                    ['العنوان', data['provider'].get('address') or ''],
                ],
            },
            {
                'name': 'الجهات المرتبطة',
                'title': f'الجهات المرتبطة بـ {provider_name}',
                'headers': ['الجهة', 'الحالة', 'عدد الخدمات', 'عدد العناصر', 'القيمة التعاقدية', 'المستلم', 'المتبقي'],
                'rows': [[row.get('organization_name') or '', row.get('organization_status') or '', row.get('services_count') or 0, row.get('items_count') or 0, float(row.get('total_contract_value') or 0), float(row.get('estimated_received_amount') or 0), float(row.get('estimated_due_amount') or 0)] for row in data['organizations']],
            },
            {
                'name': 'حسب نوع الخدمة',
                'title': f'التوزيع حسب نوع الخدمة - {provider_name}',
                'headers': ['نوع الخدمة', 'عدد الخدمات', 'عدد العناصر', 'القيمة التعاقدية', 'المستلم', 'المتبقي'],
                'rows': [[row.get('service_type') or '', row.get('services_count') or 0, row.get('items_count') or 0, float(row.get('total_contract_value') or 0), float(row.get('estimated_received_amount') or 0), float(row.get('estimated_due_amount') or 0)] for row in data['service_types']],
            },
            {
                'name': 'آخر الدفعات',
                'title': f'آخر الدفعات - {provider_name}',
                'headers': ['التاريخ', 'الجهة', 'نوع الخدمة', 'المبلغ', 'الملاحظة'],
                'rows': [[row.get('payment_date') or '', row.get('organization_name') or '', row.get('service_type') or '', float(row.get('amount') or 0), row.get('note') or ''] for row in data['recent_payments']],
            },
        ]
        safe_name = ''.join(ch if ch.isalnum() or ch in (' ', '-', '_') else '_' for ch in provider_name).strip() or f'provider_{provider_id}'
        return _excel_response_from_sheets(f'provider_statistics_{safe_name}.xls', sheets)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/reports/payments/export', methods=['GET'])
def export_payments_report():
    try:
        from_date = _normalize_report_date(request.args.get('from_date'))
        to_date = _normalize_report_date(request.args.get('to_date'))
        if not from_date or not to_date:
            return jsonify({'error': 'from_date and to_date are required in YYYY-MM-DD format'}), 400
        if from_date > to_date:
            return jsonify({'error': 'from_date must be earlier than or equal to to_date'}), 400
        conn = get_db()
        data = _build_payments_report_data(conn, from_date, to_date)
        conn.close()
        sheets = [
            {
                'name': 'ملخص الدفعات',
                'title': f'تقرير الدفعات من {from_date} إلى {to_date}',
                'headers': ['المؤشر', 'القيمة'],
                'rows': [
                    ['من تاريخ', from_date],
                    ['إلى تاريخ', to_date],
                    ['عدد الدفعات', data['summary'].get('payments_count', 0)],
                    ['إجمالي المبالغ', float(data['summary'].get('total_amount', 0) or 0)],
                ],
            },
            {
                'name': 'كل الدفعات',
                'title': 'كل الدفعات ضمن الفترة',
                'headers': ['التاريخ', 'الجهة', 'المزود', 'الخدمة', 'المبلغ', 'الكتاب الرسمي', 'ملاحظة الدفعة'],
                'rows': [[row.get('payment_date') or '', row.get('organization_name') or '', row.get('provider_names') or '', row.get('service_type') or '', float(row.get('amount') or 0), row.get('official_book_description') or '', row.get('note') or ''] for row in data['payments']],
            },
            {
                'name': 'حسب الجهة',
                'title': 'تجميع الدفعات حسب الجهة',
                'headers': ['الجهة', 'عدد الدفعات', 'الإجمالي'],
                'rows': [[row.get('organization_name') or '', row.get('payments_count') or 0, float(row.get('total_amount') or 0)] for row in data['by_organization']],
            },
        ]
        return _excel_response_from_sheets(f'payments_report_{from_date}_to_{to_date}.xls', sheets)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/reports/official-books/export', methods=['GET'])
def export_official_books_report():
    try:
        from_date = _normalize_report_date(request.args.get('from_date'))
        to_date = _normalize_report_date(request.args.get('to_date'))
        if not from_date or not to_date:
            return jsonify({'error': 'from_date and to_date are required in YYYY-MM-DD format'}), 400
        if from_date > to_date:
            return jsonify({'error': 'from_date must be earlier than or equal to to_date'}), 400
        conn = get_db()
        data = _build_official_books_report_data(conn, from_date, to_date)
        conn.close()
        sheets = [
            {
                'name': 'ملخص الكتب',
                'title': f'تقرير الكتب الرسمية من {from_date} إلى {to_date}',
                'headers': ['المؤشر', 'القيمة'],
                'rows': [
                    ['من تاريخ', from_date],
                    ['إلى تاريخ', to_date],
                    ['عدد الكتب', data['summary'].get('books_count', 0)],
                    ['عدد أنواع العمليات', len(data['by_operation'])],
                ],
            },
            {
                'name': 'كل الكتب',
                'title': 'الكتب الرسمية ضمن الفترة',
                'headers': ['تاريخ الكتاب', 'نوع العملية', 'الجهة', 'الخدمة', 'الوصف', 'مبلغ الدفعة'],
                'rows': [[row.get('official_book_date') or '', row.get('operation_type') or '', row.get('organization_name') or '', row.get('service_type') or '', row.get('official_book_description') or '', float(row.get('payment_amount') or 0)] for row in data['books']],
            },
            {
                'name': 'حسب العملية',
                'title': 'تجميع الكتب حسب نوع العملية',
                'headers': ['نوع العملية', 'عدد الكتب'],
                'rows': [[row.get('operation_type') or '', row.get('books_count') or 0] for row in data['by_operation']],
            },
        ]
        return _excel_response_from_sheets(f'official_books_report_{from_date}_to_{to_date}.xls', sheets)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════════
# SPECIAL SERVICE RANGES
# ══════════════════════════════════════════════════════════════════════════════

@app.route('/api/service-ranges', methods=['GET'])
def get_service_ranges():
    try:
        service_name = request.args.get('service_name', '').strip()

        conn = get_db()
        cursor = conn.cursor()

        allowed_services = ['fna', 'gcc', 'انترانيت', 'دولي', 'LTE']

        if service_name:
            if service_name not in allowed_services:
                conn.close()
                return jsonify({"error": "Invalid service name"}), 400

            cursor.execute("""
                SELECT id, service_name, range_from, range_to, price, created_at
                FROM service_ranges
                WHERE service_name = ?
                ORDER BY range_from ASC, range_to ASC
            """, (service_name,))
        else:
            cursor.execute("""
                SELECT id, service_name, range_from, range_to, price, created_at
                FROM service_ranges
                ORDER BY service_name ASC, range_from ASC, range_to ASC
            """)

        rows = [dict(row) for row in cursor.fetchall()]
        for row in rows:
            row['price_history'] = rows_to_list(conn.execute(
                """SELECT srh.*, u.username AS changed_by_username,
                          obr.official_book_date, obr.official_book_description
                   FROM service_range_price_history srh
                   LEFT JOIN users u ON u.id = srh.changed_by
                   LEFT JOIN official_book_records obr ON obr.service_range_history_id = srh.id
                   WHERE srh.service_range_id = ?
                   ORDER BY srh.changed_at DESC, srh.id DESC""",
                (row['id'],)
            ).fetchall())
        conn.close()

        return jsonify({
            "count": len(rows),
            "ranges": rows
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/service-ranges', methods=['POST'])
def create_service_range():
    try:
        data = request.get_json() or {}

        service_name = str(data.get('service_name', '')).strip()
        range_from = data.get('range_from')
        range_to = data.get('range_to')
        price = data.get('price')

        allowed_services = ['fna', 'gcc', 'انترانيت', 'دولي', 'LTE']

        if service_name not in allowed_services:
            return jsonify({"error": "Invalid service name"}), 400

        if range_from is None or range_to is None or price is None:
            return jsonify({"error": "service_name, range_from, range_to, and price are required"}), 400

        range_from = int(range_from)
        range_to = int(range_to)
        price = float(price)

        if range_from > range_to:
            return jsonify({"error": "range_from must be less than or equal to range_to"}), 400

        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO service_ranges (service_name, range_from, range_to, price)
            VALUES (?, ?, ?, ?)
        """, (service_name, range_from, range_to, price))

        new_id = cursor.lastrowid

        log_action(conn, None, f"Created range {service_name}",
                   entity_type='service_range', entity_id=new_id,
                   details=f"range_from={range_from}, range_to={range_to}, price={price}")

        conn.commit()

        cursor.execute("""
            SELECT id, service_name, range_from, range_to, price, created_at
            FROM service_ranges
            WHERE id = ?
        """, (new_id,))
        row = dict(cursor.fetchone())

        conn.close()

        return jsonify({
            "message": "Range created",
            "range": row
        }), 201

    except ValueError:
        return jsonify({"error": "Invalid numeric value"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/service-ranges/<int:range_id>/impact', methods=['POST'])
def preview_service_range_impact(range_id):
    try:
        data = request.get_json() or {}
        conn = get_db()
        existing = conn.execute(
            "SELECT id, service_name, range_from, range_to, price, created_at FROM service_ranges WHERE id = ?",
            (range_id,)
        ).fetchone()

        if not existing:
            conn.close()
            return jsonify({'error': 'Range not found'}), 404

        existing = dict(existing)
        service_name = str(data.get('service_name', existing['service_name'])).strip()
        range_from = int(data.get('range_from', existing['range_from']))
        range_to = int(data.get('range_to', existing['range_to']))
        new_price = float(data.get('price', existing['price']))

        affected_organizations = get_affected_organizations_for_service_range(conn, service_name, range_from, range_to)
        conn.close()

        return jsonify({
            'old_price': float(existing.get('price') or 0),
            'new_price': new_price,
            'affected_organizations': affected_organizations,
            'affected_count': len(affected_organizations),
        }), 200
    except ValueError:
        return jsonify({'error': 'Invalid numeric value'}), 400


@app.route('/api/service-ranges/<int:range_id>', methods=['PUT'])
def update_service_range(range_id):
    try:
        data = request.get_json() or {}

        conn = get_db()
        cursor = conn.cursor()
        current_user = get_current_user_from_headers(conn)

        cursor.execute("""
            SELECT id, service_name, range_from, range_to, price, created_at
            FROM service_ranges
            WHERE id = ?
        """, (range_id,))
        existing = cursor.fetchone()

        if not existing:
            conn.close()
            return jsonify({"error": "Range not found"}), 404

        existing = dict(existing)
        service_name = str(data.get('service_name', existing['service_name'])).strip()
        range_from = int(data.get('range_from', existing['range_from']))
        range_to = int(data.get('range_to', existing['range_to']))
        old_price = float(existing.get('price') or 0)
        price = float(data.get('price', existing['price']))
        selected_org_ids = data.get('selected_organization_ids')

        is_price_change = old_price != price
        official_book_date, official_book_description, official_book_error = validate_official_book_fields(data, require_for_operation=is_price_change)
        if official_book_error:
            conn.close()
            return jsonify({'error': official_book_error}), 400

        allowed_services = ['fna', 'gcc', 'انترانيت', 'دولي', 'LTE']

        if service_name not in allowed_services:
            conn.close()
            return jsonify({"error": "Invalid service name"}), 400

        if range_from > range_to:
            conn.close()
            return jsonify({"error": "range_from must be less than or equal to range_to"}), 400

        cursor.execute("""
            UPDATE service_ranges
            SET service_name = ?, range_from = ?, range_to = ?, price = ?
            WHERE id = ?
        """, (service_name, range_from, range_to, price, range_id))

        affected_orgs_count, affected_items_count, affected_services_count = reprice_contracts_for_service_range(
            conn,
            service_name,
            range_from,
            range_to,
            price,
            selected_org_ids=selected_org_ids
        )

        if old_price != price:
            range_history_id = save_service_range_price_history(
                conn,
                range_id,
                old_price,
                price,
                changed_by=(current_user or {}).get('id'),
                note=f"selected_organizations={selected_org_ids if selected_org_ids is not None else 'all'}"
            )
            create_official_book_record(
                conn,
                operation_type='range_price_change',
                entity_type='service_range',
                entity_id=range_id,
                service_range_id=range_id,
                service_range_history_id=range_history_id,
                official_book_date=official_book_date,
                official_book_description=official_book_description,
                created_by=(current_user or {}).get('id')
            )

        log_action(conn, (current_user or {}).get('id') if current_user else None, f"Updated range {range_id}",
                   entity_type='service_range', entity_id=range_id,
                   details=(
                       f"service_name={service_name}, range_from={range_from}, range_to={range_to}, "
                       f"price={price}, affected_organizations={affected_orgs_count}, affected_items={affected_items_count}, affected_services={affected_services_count}"
                   ))

        conn.commit()

        cursor.execute("""
            SELECT id, service_name, range_from, range_to, price, created_at
            FROM service_ranges
            WHERE id = ?
        """, (range_id,))
        row = dict(cursor.fetchone())

        history = rows_to_list(conn.execute(
            """SELECT srh.*, u.username AS changed_by_username
               FROM service_range_price_history srh
               LEFT JOIN users u ON u.id = srh.changed_by
               WHERE srh.service_range_id = ?
               ORDER BY srh.changed_at DESC, srh.id DESC""",
            (range_id,)
        ).fetchall())

        conn.close()
        return jsonify({"message": "Range updated", "range": row, "price_history": history}), 200

    except ValueError:
        return jsonify({"error": "Invalid numeric value"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/service-ranges/<int:range_id>', methods=['DELETE'])
def delete_service_range(range_id):
    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM service_ranges WHERE id = ?", (range_id,))
        existing = cursor.fetchone()

        if not existing:
            conn.close()
            return jsonify({"error": "Range not found"}), 404

        cursor.execute("DELETE FROM service_ranges WHERE id = ?", (range_id,))
        log_action(conn, None, f"Deleted range {range_id}",
                   entity_type='service_range', entity_id=range_id)
        conn.commit()
        conn.close()

        return jsonify({"message": "Range deleted"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
# ERROR HANDLERS
# ══════════════════════════════════════════════════════════════════════════════

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Route not found'}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'error': 'Method not allowed'}), 405


@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    init_db()

    print("\n🚀 ITPC Management System Backend")
    print(f"   Running at: http://localhost:{PORT}")
    print(f"   API base:   http://localhost:{PORT}/api\n")

    app.run(
        debug=os.getenv("FLASK_DEBUG", "False") == "True",
        host="0.0.0.0",
        port=PORT
    )
