import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import SlideMenu from '../components/SlideMenu';
import PageFooter from '../components/PageFooter';

const API = import.meta.env.VITE_API_BASE_URL;

const PAYMENT_METHODS = ['يومي', 'شهري', 'كل 3 أشهر', 'سنوي'];
const CONTRACT_DURATION_UNITS = ['يومي', 'شهري', 'سنوي'];
const DEVICE_OPTIONS = ['مدفوع الثمن', 'ايجار', 'الوزارة'];

const mapBackendDeviceToUi = (value) => {
  if (value === 'الشركة') return 'ايجار';
  if (value === 'المنظمة') return 'مدفوع الثمن';
  return value || 'مدفوع الثمن';
};

const mapUiDeviceToBackend = (value) => {
  if (value === 'ايجار') return 'الشركة';
  if (value === 'مدفوع الثمن') return 'المنظمة';
  return value || 'المنظمة';
};

const formatMoney = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatDateDisplay = (value) => {
  if (!value) return '-';
  return String(value).slice(0, 10);
};

const toDateInput = (value) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

const addMonthsToDate = (dateString, monthsToAdd) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const result = new Date(date);
  result.setMonth(result.getMonth() + monthsToAdd);
  return result.toISOString().split('T')[0];
};

const addDaysToDate = (dateString, daysToAdd) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const result = new Date(date);
  result.setDate(result.getDate() + Number(daysToAdd || 0));
  return result.toISOString().split('T')[0];
};

const calculateNextDueDate = (baseDate, paymentMethod, paymentIntervalDays = 1) => {
  if (!baseDate) return '';

  if (paymentMethod === 'يومي') {
    return addDaysToDate(baseDate, paymentIntervalDays || 1);
  }

  if (paymentMethod === 'شهري') {
    return addMonthsToDate(baseDate, 1);
  }

  if (paymentMethod === 'كل 3 أشهر') {
    return addMonthsToDate(baseDate, 3);
  }

  if (paymentMethod === 'سنوي') {
    return addMonthsToDate(baseDate, 12);
  }

  return '';
};

const calculateContractTotal = (baseMonthlyPrice, durationUnit, durationValue) => {
  const base = Number(baseMonthlyPrice || 0);
  const value = Number(durationValue || 1);

  if (!value || value < 1) return base;

  if (durationUnit === 'يومي') {
    return (base / 30) * value;
  }

  if (durationUnit === 'سنوي') {
    return base * 12 * value;
  }

  return base * value;
};

const sectionTitleMap = {
  wireless: 'Wireless',
  ftth: 'FTTH',
  optical: 'Optical',
  other: 'أخرى',
};

const serviceLabelMap = {
  Wireless: 'Wireless',
  FTTH: 'FTTH',
  Optical: 'Optical',
  Other: 'أخرى',
};

const shellInput = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-600';
const shellReadOnly = 'w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700';
const shellLabel = 'mb-2 block text-xs font-semibold text-slate-500';

const Field = ({ label, children }) => (
  <div>
    <label className={shellLabel}>{label}</label>
    {children}
  </div>
);

const MetricCard = ({ label, value, tone = 'slate' }) => {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone] || tones.slate}`}>
      <div className="mb-1 text-xs font-semibold opacity-80">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
};

const Block = ({ title, subtitle, actions, children, className = '' }) => (
  <section className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
    {(title || actions) && (
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {title && <h3 className="text-lg font-bold text-slate-900">{title}</h3>}
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);


const ServiceViewTabs = ({ activeView, onChange, paymentCount, historyCount, itemCount }) => {
  const tabs = [
    { key: 'summary', label: 'ملخص' },
    { key: 'contract', label: 'العقد' },
    { key: 'items', label: `العناصر${itemCount ? ` (${itemCount})` : ''}` },
    { key: 'payments', label: `الدفعات${paymentCount ? ` (${paymentCount})` : ''}` },
    { key: 'history', label: `السجل${historyCount ? ` (${historyCount})` : ''}` },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const isActive = activeView === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-slate-900 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};



const DetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [organization, setOrganization] = useState(null);
  const [editMode, setEditMode] = useState(false);

  const [orgForm, setOrgForm] = useState({
    name: '',
    phone: '',
    address: '',
    location: '',
    status: 'active',
    notes: '',
  });

  const [serviceEdits, setServiceEdits] = useState({});
  const [itemEdits, setItemEdits] = useState({});
  const [paymentForms, setPaymentForms] = useState({});
  const [suspendForms, setSuspendForms] = useState({});
  const [openPeriodHistory, setOpenPeriodHistory] = useState({});
  const [suspendModalService, setSuspendModalService] = useState(null);
  const [suspending, setSuspending] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [activeServiceViews, setActiveServiceViews] = useState({});

  const loadDetails = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await fetch(`${API}/organizations/${id}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'فشل تحميل تفاصيل الجهة');
      }

      const org = data.organization;
      setOrganization(org);

      setOrgForm({
        name: org.name || '',
        phone: org.phone || '',
        address: org.address || '',
        location: org.location || '',
        status: org.status || 'active',
        notes: org.notes || '',
      });

      const serviceMap = {};
      const itemMap = {};
      const paymentMap = {};
      const suspendMap = {};

      (org.services || []).forEach((service) => {
        const activePeriod = service.active_contract_period || null;

        const contractCreatedAt = activePeriod?.start_date
          ? toDateInput(activePeriod.start_date)
          : service.contract_created_at
            ? toDateInput(service.contract_created_at)
            : toDateInput(service.created_at);

        const dueDate = activePeriod?.end_date
          ? toDateInput(activePeriod.end_date)
          : service.due_date
            ? toDateInput(service.due_date)
            : calculateNextDueDate(
                contractCreatedAt,
                service.payment_method || 'شهري',
                service.payment_interval_days || 1
              );

        serviceMap[service.id] = {
          service_type: service.service_type || '',
          payment_method: activePeriod?.payment_method || service.payment_method || 'شهري',
          payment_interval_days: Number(service.payment_interval_days || 1),
          device_ownership: mapBackendDeviceToUi(service.device_ownership),
          annual_amount: activePeriod?.base_amount ?? service.annual_amount ?? 0,
          contract_created_at: contractCreatedAt || '',
          contract_duration_unit: activePeriod?.contract_duration_unit || service.contract_duration_unit || 'شهري',
          contract_duration_value: Number(activePeriod?.contract_duration_value || service.contract_duration_value || 1),
          due_date: dueDate || '',
          notes: service.notes || '',
          is_active: !!service.is_active,
        };

        paymentMap[service.id] = {
          amount: '',
          payment_date: new Date().toISOString().split('T')[0],
          note: '',
          official_book_date: new Date().toISOString().split('T')[0],
          official_book_description: '',
        };

        suspendMap[service.id] = {
          official_book_date: new Date().toISOString().split('T')[0],
          official_book_description: '',
          is_immediate: true,
          suspend_date: '',
          refund_amount: Number(service.suspension_refund_amount || 0),
          note: service.suspension_note || '',
        };

        (service.service_items || []).forEach((item) => {
          itemMap[item.id] = {
            item_category: item.item_category || '',
            provider_company_id: item.provider_company_id || '',
            item_name: item.item_name || '',
            line_type: item.line_type || '',
            bundle_type: item.bundle_type || '',
            quantity: item.quantity ?? 1,
            unit_price: item.unit_price ?? 0,
            notes: item.notes || '',
          };
        });
      });

      setServiceEdits(serviceMap);
      setItemEdits(itemMap);
      setPaymentForms(paymentMap);
      setSuspendForms(suspendMap);
    } catch (err) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء تحميل التفاصيل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadDetails();
    }
  }, [id]);

  const groupedServices = useMemo(() => {
    if (!organization?.services) {
      return { wireless: [], ftth: [], optical: [], other: [] };
    }

    return {
      wireless: organization.services.filter((s) => s.service_type === 'Wireless'),
      ftth: organization.services.filter((s) => s.service_type === 'FTTH'),
      optical: organization.services.filter((s) => s.service_type === 'Optical'),
      other: organization.services.filter((s) => s.service_type === 'Other'),
    };
  }, [organization]);

  const totalContractAmount = useMemo(() => {
    if (!organization?.services) return 0;
    return organization.services.reduce(
      (sum, s) => sum + Number(s.active_contract_period?.total_amount || s.annual_amount || 0),
      0
    );
  }, [organization]);

  const totalPaidAmount = useMemo(() => {
    if (!organization?.services) return 0;
    return organization.services.reduce(
      (sum, s) => sum + Number(s.active_contract_period?.paid_amount || s.paid_amount || 0),
      0
    );
  }, [organization]);

  const totalDueAmount = useMemo(() => {
    if (!organization?.services) return 0;
    return organization.services.reduce(
      (sum, s) => sum + Number(s.active_contract_period?.due_amount || s.due_amount || 0),
      0
    );
  }, [organization]);

  const isContractFullyPaid = totalDueAmount <= 0;

  const getServiceStatusMeta = (service) => {
    const status = service?.service_status || 'active';

    if (status === 'suspended') {
      return {
        label: 'موقوفة',
        className: 'border-red-200 bg-red-50 text-red-700',
      };
    }

    if (status === 'scheduled_suspend') {
      return {
        label: `مجدولة للإيقاف ${service?.suspension_effective_date || service?.scheduled_suspend_at || ''}`.trim(),
        className: 'border-amber-200 bg-amber-50 text-amber-700',
      };
    }

    return {
      label: 'فعالة',
      className: 'border-green-200 bg-green-50 text-green-700',
    };
  };

  const handleEnableEdit = () => {
    const ok = window.confirm('هل انت متاكد من التعديل ؟');
    if (!ok) return;
    setEditMode(true);
  };

  const handlePaymentMethodChange = (serviceId, newMethod) => {
    setServiceEdits((prev) => {
      const current = prev[serviceId] || {};
      const createdAt = current.contract_created_at || '';
      const nextDueDate = calculateNextDueDate(
        createdAt,
        newMethod,
        current.payment_interval_days || 1
      );

      return {
        ...prev,
        [serviceId]: {
          ...current,
          payment_method: newMethod,
          payment_interval_days: newMethod === 'يومي' ? Number(current.payment_interval_days || 1) : 1,
          due_date: nextDueDate || current.due_date || '',
        },
      };
    });
  };

  const handlePaymentIntervalDaysChange = (serviceId, value) => {
    setServiceEdits((prev) => {
      const current = prev[serviceId] || {};
      const safeValue = Number(value || 1);
      const nextDueDate = calculateNextDueDate(
        current.contract_created_at || '',
        current.payment_method || 'شهري',
        safeValue
      );

      return {
        ...prev,
        [serviceId]: {
          ...current,
          payment_interval_days: safeValue,
          due_date: nextDueDate || current.due_date || '',
        },
      };
    });
  };

  const handleContractCreatedAtChange = (serviceId, newDate) => {
    setServiceEdits((prev) => {
      const current = prev[serviceId] || {};
      const nextDueDate = calculateNextDueDate(
        newDate,
        current.payment_method || 'شهري',
        current.payment_interval_days || 1
      );

      return {
        ...prev,
        [serviceId]: {
          ...current,
          contract_created_at: newDate,
          due_date: nextDueDate || '',
        },
      };
    });
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      setError('');

      const orgRes = await fetch(`${API}/organizations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orgForm),
      });

      const orgData = await orgRes.json();
      if (!orgRes.ok) {
        throw new Error(orgData.error || 'فشل تحديث بيانات الجهة');
      }

      for (const serviceId of Object.keys(serviceEdits)) {
        const service = serviceEdits[serviceId];

        const res = await fetch(`${API}/organization-services/${serviceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_type: service.service_type,
            payment_method: service.payment_method,
            payment_interval_days:
              service.payment_method === 'يومي'
                ? Number(service.payment_interval_days || 1)
                : 1,
            device_ownership: mapUiDeviceToBackend(service.device_ownership),
            annual_amount: Number(service.annual_amount || 0),
            contract_created_at: service.contract_created_at || null,
            contract_duration_unit: service.contract_duration_unit || 'شهري',
            contract_duration_value: Number(service.contract_duration_value || 1),
            due_date: service.due_date || null,
            notes: service.notes || '',
            is_active: !!service.is_active,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `فشل تحديث الخدمة ${serviceId}`);
        }
      }

      for (const itemId of Object.keys(itemEdits)) {
        const item = itemEdits[itemId];

        const res = await fetch(`${API}/service-items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_category: item.item_category,
            provider_company_id: item.provider_company_id || null,
            item_name: item.item_name,
            line_type: item.line_type || null,
            bundle_type: item.bundle_type || null,
            quantity: Number(item.quantity || 0),
            unit_price: Number(item.unit_price || 0),
            notes: item.notes || '',
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `فشل تحديث العنصر ${itemId}`);
        }
      }

      alert('تم حفظ التعديلات بنجاح');
      setEditMode(false);
      await loadDetails();
    } catch (err) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء الحفظ');
      alert(err.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };



  const handleExportDetailReport = async () => {
    try {
      if (!organization) {
        alert('لا توجد بيانات للتصدير');
        return;
      }

      setExportingExcel(true);

      const rows = [];
      let sequence = 1;

      (organization.services || []).forEach((service) => {
        const items = service.service_items || [];
        const activePeriod = service.active_contract_period || {};

        if (!items.length) {
          rows.push({
            sequence: sequence++,
            organization_name: organization.name || '',
            provider_name: 'بدون مزود',
            service_type: serviceLabelMap[service.service_type] || service.service_type || '',
            service_amount: '',
            lines_count: '',
            count: '',
            monthly_amount: Number(activePeriod.base_amount ?? service.annual_amount ?? 0),
            notes: service.notes || '',
          });
          return;
        }

        items.forEach((item) => {
          const quantity = Number(item.quantity || 0);
          const category = item.item_category || '';
          const detailParts = [item.item_name || '', item.line_type || '', item.bundle_type || '']
            .filter(Boolean)
            .join(' - ');

          rows.push({
            sequence: sequence++,
            organization_name: organization.name || '',
            provider_name: item.provider_company_name || 'بدون مزود',
            service_type: serviceLabelMap[service.service_type] || service.service_type || '',
            service_amount: detailParts || category,
            lines_count: category === 'Line' ? quantity : '',
            count: category === 'Line' ? '' : quantity,
            monthly_amount: quantity * Number(item.unit_price || 0),
            notes: item.notes || service.notes || '',
          });
        });
      });

      const title = `تقرير تفاصيل الجهة - ${organization.name || ''}`.trim();
      const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:x="urn:schemas-microsoft-com:office:excel"
              xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="UTF-8" />
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
            <style>
              table, th, td { border: 1px solid #000; border-collapse: collapse; }
              th, td { padding: 8px; text-align: center; white-space: nowrap; }
              table { direction: rtl; }
              .title { font-size: 18px; font-weight: bold; text-align: center; }
            </style>
          </head>
          <body>
            <table>
              <tr><th class="title" colspan="9">${escapeHtml(title)}</th></tr>
              <tr>
                <th>ت</th>
                <th>اسم الجهة</th>
                <th>اسم الشركة</th>
                <th>نوع الخدمة</th>
                <th>مقدار الخدمة</th>
                <th>عدد الخطوط</th>
                <th>العدد</th>
                <th>المبلغ الشهري للخدمة</th>
                <th>الملاحظات</th>
              </tr>
              ${rows.map((row) => `
                <tr>
                  <td>${escapeHtml(row.sequence)}</td>
                  <td>${escapeHtml(row.organization_name)}</td>
                  <td>${escapeHtml(row.provider_name)}</td>
                  <td>${escapeHtml(row.service_type)}</td>
                  <td>${escapeHtml(row.service_amount)}</td>
                  <td>${escapeHtml(row.lines_count)}</td>
                  <td>${escapeHtml(row.count)}</td>
                  <td>${escapeHtml(formatMoney(row.monthly_amount))}</td>
                  <td>${escapeHtml(row.notes)}</td>
                </tr>
              `).join('') || '<tr><td colspan="9">لا توجد بيانات</td></tr>'}
            </table>
          </body>
        </html>
      `;

      const blob = new Blob(['﻿', html], {
        type: 'application/vnd.ms-excel;charset=utf-8;',
      });

      const safeName = String(organization.name || `organization_${id}`)
        .replace(/[\/:*?"<>|]/g, '_')
        .trim();
      const filename = `detail_report_${safeName || id}.xls`;

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error(err);
      alert(err.message || 'حدث خطأ أثناء تصدير التقرير');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdfReport = () => {
    try {
      if (!organization) {
        alert('لا توجد بيانات للتصدير');
        return;
      }

      setExportingPdf(true);

      const openedAt = formatDateDisplay(new Date().toISOString());
      const serviceCards = (organization.services || []).map((service, index) => {
        const activePeriod = service.active_contract_period || {};
        const items = service.service_items || [];
        const payments = (service.payments || []).slice().sort((a, b) => {
          const aDate = String(a.payment_date || '');
          const bDate = String(b.payment_date || '');
          return bDate.localeCompare(aDate);
        });

        const statusMeta = getServiceStatusMeta(service);
        const itemsRows = items.length
          ? items.map((item, itemIndex) => `
              <tr>
                <td>${itemIndex + 1}</td>
                <td>${escapeHtml(item.provider_company_name || 'بدون مزود')}</td>
                <td>${escapeHtml(item.item_category || '-')}</td>
                <td>${escapeHtml(item.item_name || item.line_type || item.bundle_type || '-')}</td>
                <td>${escapeHtml(item.line_type || item.bundle_type || '-')}</td>
                <td>${escapeHtml(item.quantity ?? '-')}</td>
                <td>${escapeHtml(formatMoney(item.unit_price || 0))}</td>
                <td>${escapeHtml(formatMoney((Number(item.quantity || 0) * Number(item.unit_price || 0))))}</td>
              </tr>
            `).join('')
          : `
              <tr>
                <td colspan="8" class="empty">لا توجد عناصر مرتبطة بهذه الخدمة</td>
              </tr>
            `;

        const paymentsRows = payments.length
          ? payments.map((payment, paymentIndex) => `
              <tr>
                <td>${paymentIndex + 1}</td>
                <td>${escapeHtml(formatDateDisplay(payment.payment_date))}</td>
                <td>${escapeHtml(formatMoney(payment.amount || 0))}</td>
                <td>${escapeHtml(formatDateDisplay(payment.official_book_date))}</td>
                <td>${escapeHtml(payment.official_book_description || payment.note || '-')}</td>
              </tr>
            `).join('')
          : `
              <tr>
                <td colspan="5" class="empty">لا توجد دفعات مسجلة</td>
              </tr>
            `;

        return `
          <section class="service-card">
            <div class="service-head">
              <div>
                <h2>${index + 1}. ${escapeHtml(serviceLabelMap[service.service_type] || service.service_type || 'خدمة')}</h2>
                <p>الحالة: <span class="status">${escapeHtml(statusMeta.label)}</span></p>
              </div>
              <div class="service-totals">
                <div><span>إجمالي العقد</span><strong>${escapeHtml(formatMoney(activePeriod.total_amount ?? service.annual_amount ?? 0))}</strong></div>
                <div><span>المدفوع</span><strong>${escapeHtml(formatMoney(activePeriod.paid_amount ?? service.paid_amount ?? 0))}</strong></div>
                <div><span>المتبقي</span><strong>${escapeHtml(formatMoney(activePeriod.due_amount ?? service.due_amount ?? 0))}</strong></div>
              </div>
            </div>

            <div class="info-grid">
              <div class="info-box"><span>تاريخ إنشاء العقد</span><strong>${escapeHtml(formatDateDisplay(activePeriod.start_date || service.contract_created_at || service.created_at))}</strong></div>
              <div class="info-box"><span>تاريخ الاستحقاق</span><strong>${escapeHtml(formatDateDisplay(activePeriod.end_date || service.due_date))}</strong></div>
              <div class="info-box"><span>آلية الدفع</span><strong>${escapeHtml(service.payment_method || '-')}</strong></div>
              <div class="info-box"><span>ملكية الجهاز</span><strong>${escapeHtml(mapBackendDeviceToUi(service.device_ownership || '-'))}</strong></div>
            </div>

            <h3>عناصر الخدمة</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>المزود</th>
                  <th>الفئة</th>
                  <th>العنصر</th>
                  <th>التفصيل</th>
                  <th>الكمية</th>
                  <th>سعر الوحدة</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>${itemsRows}</tbody>
            </table>

            <h3>الدفعات</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>تاريخ الدفع</th>
                  <th>المبلغ</th>
                  <th>تاريخ الكتاب الرسمي</th>
                  <th>الوصف</th>
                </tr>
              </thead>
              <tbody>${paymentsRows}</tbody>
            </table>
          </section>
        `;
      }).join('');

      const html = `
        <!doctype html>
        <html lang="ar" dir="rtl">
          <head>
            <meta charset="utf-8" />
            <title>تقرير تفاصيل الجهة - ${escapeHtml(organization.name || '')}</title>
            <style>
              * { box-sizing: border-box; }
              body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #0f172a; background: #f8fafc; }
              .page { max-width: 1100px; margin: 0 auto; padding: 32px; }
              .hero { background: linear-gradient(135deg, #0f172a, #1d4ed8); color: white; border-radius: 20px; padding: 28px; margin-bottom: 24px; }
              .hero h1 { margin: 0 0 8px; font-size: 30px; }
              .hero p { margin: 4px 0; font-size: 14px; opacity: 0.92; }
              .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 20px 0 28px; }
              .metric { background: white; border: 1px solid #dbeafe; border-radius: 18px; padding: 18px; }
              .metric span { display: block; font-size: 12px; color: #475569; margin-bottom: 8px; }
              .metric strong { font-size: 24px; color: #0f172a; }
              .service-card { background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 22px; margin-bottom: 18px; page-break-inside: avoid; }
              .service-head { display: flex; justify-content: space-between; gap: 18px; align-items: start; margin-bottom: 18px; }
              .service-head h2 { margin: 0 0 6px; font-size: 22px; }
              .status { color: #047857; font-weight: 700; }
              .service-totals { display: grid; grid-template-columns: repeat(3, minmax(120px, 1fr)); gap: 10px; min-width: 360px; }
              .service-totals div, .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 12px 14px; }
              .service-totals span, .info-box span { display: block; color: #64748b; font-size: 12px; margin-bottom: 6px; }
              .service-totals strong, .info-box strong { font-size: 18px; }
              .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
              h3 { margin: 18px 0 10px; font-size: 16px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
              th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: right; font-size: 13px; vertical-align: middle; }
              th { background: #eff6ff; font-weight: 700; }
              .empty { text-align: center; color: #64748b; }
              @media print {
                body { background: white; }
                .page { max-width: none; padding: 14px; }
                .hero { break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <div class="page">
              <section class="hero">
                <h1>تقرير تفاصيل الجهة</h1>
                <p>اسم الجهة: ${escapeHtml(organization.name || '-')}</p>
                <p>الهاتف: ${escapeHtml(organization.phone || '-')} | الموقع: ${escapeHtml(organization.location || organization.address || '-')}</p>
                <p>تاريخ إنشاء التقرير: ${escapeHtml(openedAt)}</p>
              </section>

              <section class="metrics">
                <div class="metric"><span>إجمالي العقد</span><strong>${escapeHtml(formatMoney(totalContractAmount))}</strong></div>
                <div class="metric"><span>المدفوع الكلي</span><strong>${escapeHtml(formatMoney(totalPaidAmount))}</strong></div>
                <div class="metric"><span>المتبقي الكلي</span><strong>${escapeHtml(formatMoney(totalDueAmount))}</strong></div>
              </section>

              ${serviceCards || '<div class="service-card"><strong>لا توجد خدمات مرتبطة بهذه الجهة</strong></div>'}
            </div>
            <script>
              window.onload = function () {
                setTimeout(function () {
                  window.print();
                }, 250);
              };
            </script>
          </body>
        </html>
      `;

      const htmlBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const htmlUrl = window.URL.createObjectURL(htmlBlob);
      const printWindow = window.open(htmlUrl, '_blank', 'noopener,noreferrer');

      if (!printWindow) {
        window.URL.revokeObjectURL(htmlUrl);
        throw new Error('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
      }

      window.setTimeout(() => {
        window.URL.revokeObjectURL(htmlUrl);
      }, 15000);
    } catch (err) {
      console.error(err);
      alert(err.message || 'حدث خطأ أثناء تصدير PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDeleteService = async (serviceId) => {
    const ok = window.confirm('هل أنت متأكد من حذف هذه الخدمة بالكامل؟');
    if (!ok) return;

    try {
      const res = await fetch(`${API}/organization-services/${serviceId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل حذف الخدمة');
      }

      await loadDetails();
      alert('تم حذف الخدمة');
    } catch (err) {
      console.error(err);
      alert(err.message || 'حدث خطأ أثناء حذف الخدمة');
    }
  };

  const handleDeleteItem = async (itemId) => {
    const ok = window.confirm('هل أنت متأكد من حذف هذا العنصر؟');
    if (!ok) return;

    try {
      const res = await fetch(`${API}/service-items/${itemId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل حذف العنصر');
      }

      await loadDetails();
      alert('تم حذف العنصر');
    } catch (err) {
      console.error(err);
      alert(err.message || 'حدث خطأ أثناء حذف العنصر');
    }
  };

  const handleOpenSuspendModal = (service) => {
    setSuspendModalService(service);
    setSuspendForms((prev) => ({
      ...prev,
      [service.id]: prev[service.id] || {
        official_book_date: new Date().toISOString().split('T')[0],
        official_book_description: '',
        is_immediate: true,
        suspend_date: '',
        refund_amount: 0,
        note: '',
      },
    }));
  };

  const handleCloseSuspendModal = () => {
    if (suspending) return;
    setSuspendModalService(null);
  };

  const handleConfirmSuspend = async () => {
    const service = suspendModalService;
    if (!service) return;

    const form = suspendForms[service.id] || {};
    if (!form.official_book_date || !String(form.official_book_description || '').trim()) {
      alert('يرجى إدخال تاريخ الكتاب الرسمي ووصفه');
      return;
    }

    if (!form.is_immediate && !form.suspend_date) {
      alert('يرجى إدخال تاريخ الإيقاف المستقبلي');
      return;
    }

    const refundAmount = Number(form.refund_amount || 0);
    if (refundAmount < 0) {
      alert('المبلغ الراجع يجب أن يكون صفراً أو أكبر');
      return;
    }

    try {
      setSuspending(true);
      const res = await fetch(`${API}/organization-services/${service.id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          official_book_date: form.official_book_date,
          official_book_description: String(form.official_book_description || '').trim(),
          is_immediate: !!form.is_immediate,
          suspend_date: form.is_immediate ? null : form.suspend_date,
          refund_amount: refundAmount,
          note: form.note || '',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل إيقاف الخدمة');
      }

      await loadDetails();
      setSuspendModalService(null);
      alert(form.is_immediate ? 'تم إيقاف الخدمة' : 'تمت جدولة إيقاف الخدمة');
    } catch (err) {
      console.error(err);
      alert(err.message || 'حدث خطأ أثناء إيقاف الخدمة');
    } finally {
      setSuspending(false);
    }
  };

  const handleRecordPayment = async (serviceId, currentDueAmount) => {
    const form = paymentForms[serviceId];
    const amount = Number(form?.amount || 0);

    if (!amount || !form?.payment_date) {
      alert('يرجى إدخال مبلغ الدفع وتاريخ الدفع');
      return;
    }

    if (!form?.official_book_date || !String(form?.official_book_description || '').trim()) {
      alert('يرجى إدخال تاريخ الكتاب الرسمي ووصفه');
      return;
    }

    if (amount <= 0) {
      alert('مبلغ الدفع يجب أن يكون أكبر من صفر');
      return;
    }

    if (amount > Number(currentDueAmount || 0)) {
      alert('مبلغ الدفع أكبر من المبلغ المتبقي ولا يمكن قبوله');
      return;
    }

    try {
      const res = await fetch(`${API}/organization-services/${serviceId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          payment_date: form.payment_date,
          note: form.note || '',
          official_book_date: form.official_book_date,
          official_book_description: String(form.official_book_description || '').trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل تسجيل الدفعة');
      }

      setPaymentForms((prev) => ({
        ...prev,
        [serviceId]: {
          amount: '',
          payment_date: new Date().toISOString().split('T')[0],
          note: '',
          official_book_date: new Date().toISOString().split('T')[0],
          official_book_description: '',
        },
      }));

      await loadDetails();

      const remainingAfterPayment = Number(currentDueAmount || 0) - amount;
      if (remainingAfterPayment <= 0) {
        alert('تم دفع اجور العقد');
      } else {
        alert('تم تسجيل الدفعة بنجاح');
      }
    } catch (err) {
      console.error(err);
      alert(err.message || 'حدث خطأ أثناء تسجيل الدفعة');
    }
  };

  const togglePeriod = (periodId) => {
    setOpenPeriodHistory((prev) => ({
      ...prev,
      [periodId]: !prev[periodId],
    }));
  };

  const renderPeriodHistoryCard = (period, index) => {
    const isOpen = !!openPeriodHistory[period.id];
    const periodPayments = period.payments || [];
    const isClosed = period.status !== 'active';

    return (
      <div key={period.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => togglePeriod(period.id)}
          className="w-full bg-slate-50 px-4 py-4 text-right transition hover:bg-slate-100"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-base font-bold text-slate-900">
                {period.period_label || `الفترة ${index + 1}`}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                من {toDateInput(period.start_date) || '-'} إلى {toDateInput(period.end_date) || '-'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard label="إجمالي الفترة" value={formatMoney(period.total_amount)} tone="blue" />
              <MetricCard label="دين المرحلة" value={formatMoney(period.due_amount)} tone="red" />
              <MetricCard label="المرحّل" value={formatMoney(period.carried_debt)} tone="amber" />
              <MetricCard label="الحالة" value={isClosed ? 'مغلقة' : 'نشطة'} tone="slate" />
            </div>
          </div>
        </button>

        {isOpen && (
          <div className="space-y-5 border-t border-slate-200 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard label="تاريخ البداية" value={toDateInput(period.start_date) || '-'} />
              <MetricCard label="تاريخ النهاية" value={toDateInput(period.end_date) || '-'} />
              <MetricCard label="المبلغ الأساسي" value={formatMoney(period.base_amount)} tone="blue" />
              <MetricCard label="الدين المرحّل" value={formatMoney(period.carried_debt)} tone="amber" />
              <MetricCard label="المدفوع" value={formatMoney(period.paid_amount)} tone="green" />
              <MetricCard label="المتبقي" value={formatMoney(period.due_amount)} tone="red" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="آلية الدفع"><input type="text" readOnly value={period.payment_method || '-'} className={shellReadOnly} /></Field>
              <Field label="وحدة المدة"><input type="text" readOnly value={period.contract_duration_unit || '-'} className={shellReadOnly} /></Field>
              <Field label="عدد المدة"><input type="text" readOnly value={period.contract_duration_value || '-'} className={shellReadOnly} /></Field>
              <Field label="سبب الإغلاق"><input type="text" readOnly value={period.closed_reason || '-'} className={shellReadOnly} /></Field>
            </div>

            <div>
              <h5 className="mb-3 text-base font-bold text-slate-900">دفعات هذه الفترة</h5>
              {periodPayments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-slate-500">
                  لا توجد دفعات ضمن هذه الفترة
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full bg-white text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-right font-semibold">المبلغ</th>
                        <th className="px-4 py-3 text-right font-semibold">تاريخ الدفع</th>
                        <th className="px-4 py-3 text-right font-semibold">الملاحظة</th>
                        <th className="px-4 py-3 text-right font-semibold">بواسطة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodPayments.map((payment) => (
                        <tr key={payment.id} className="border-t border-slate-200">
                          <td className="px-4 py-3">{formatMoney(payment.amount)}</td>
                          <td className="px-4 py-3">{payment.payment_date || '-'}</td>
                          <td className="px-4 py-3">{payment.note || '-'}</td>
                          <td className="px-4 py-3">{payment.created_by_username || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderServiceCard = (service) => {
    const edit = serviceEdits[service.id] || {};
    const items = service.service_items || [];
    const payments = service.payments || [];
    const activePeriod = service.active_contract_period || null;
    const closedPeriods = service.closed_contract_periods || [];

    const serviceDueAmount = Number(activePeriod?.due_amount || service.due_amount || 0);
    const servicePaidAmount = Number(activePeriod?.paid_amount || service.paid_amount || 0);
    const baseAmount = Number(activePeriod?.base_amount || edit.annual_amount || 0);
    const carriedDebt = Number(activePeriod?.carried_debt || 0);
    const currentDurationUnit = edit.contract_duration_unit || activePeriod?.contract_duration_unit || service.contract_duration_unit || 'شهري';
    const currentDurationValue = Number(edit.contract_duration_value || activePeriod?.contract_duration_value || service.contract_duration_value || 1);
    const serviceIsFullyPaid = serviceDueAmount <= 0;
    const latestSuspension = service.latest_suspension || null;
    const serviceStatusMeta = getServiceStatusMeta(service);
    const isSuspended = service.service_status === 'suspended';
    const isScheduledSuspend = service.service_status === 'scheduled_suspend';
    const activeView = activeServiceViews[service.id] || 'summary';

    return (
      <div id={`service-card-${service.id}`} key={service.id} className="scroll-mt-24 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-2xl font-bold text-slate-900">
                  {serviceLabelMap[service.service_type] || service.service_type}
                </h3>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${serviceStatusMeta.className}`}>
                  {serviceStatusMeta.label}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
                  رقم الخدمة: {service.id}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
                  الفترة الحالية: {activePeriod?.period_label || `الفترة ${activePeriod?.period_number || 1}`}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
                  آلية الدفع: {edit.payment_method || '-'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {!isSuspended && (
                <button
                  type="button"
                  onClick={() => handleOpenSuspendModal(service)}
                  className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  ايقاف الخدمة
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDeleteService(service.id)}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
              >
                حذف الخدمة
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:w-[420px]">
              <MetricCard label="المدفوع" value={formatMoney(servicePaidAmount)} tone="green" />
              <MetricCard label="المتبقي" value={formatMoney(serviceDueAmount)} tone="red" />
            </div>

            <ServiceViewTabs
              activeView={activeView}
              onChange={(view) => setActiveServiceViews((prev) => ({ ...prev, [service.id]: view }))}
              paymentCount={payments.length}
              historyCount={closedPeriods.length}
              itemCount={items.length}
            />
          </div>
        </div>

        <div className="space-y-6 bg-slate-50 p-5 sm:p-6">
          {(isSuspended || isScheduledSuspend) && (
            <div className={`rounded-2xl border px-4 py-4 ${isSuspended ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="mb-3 text-base font-bold text-slate-900">
                {isSuspended ? 'بيانات إيقاف الخدمة' : 'بيانات الإيقاف المجدول'}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="تاريخ الإيقاف"><input readOnly value={service.suspension_effective_date || latestSuspension?.effective_date || '-'} className={shellReadOnly} /></Field>
                <Field label="المبلغ الراجع"><input readOnly value={formatMoney(service.suspension_refund_amount || latestSuspension?.refund_amount || 0)} className={shellReadOnly} /></Field>
                <Field label="المبلغ المسقط"><input readOnly value={formatMoney(service.suspension_dropped_amount || latestSuspension?.dropped_due_amount || 0)} className={shellReadOnly} /></Field>
                <Field label="الكتاب الرسمي"><input readOnly value={latestSuspension?.official_book_date || '-'} className={shellReadOnly} /></Field>
              </div>
              <div className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-slate-700">
                <span className="font-semibold">الوصف:</span> {latestSuspension?.official_book_description || service.suspension_note || '-'}
              </div>
            </div>
          )}

          {serviceIsFullyPaid && (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
              تم دفع أجور هذا العقد بالكامل
            </div>
          )}

          {activeView === 'summary' && (
            <>              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="المبلغ الأساسي" value={formatMoney(baseAmount)} tone="blue" />
                <MetricCard label="الدين المرحّل" value={formatMoney(carriedDebt)} tone="amber" />
                <MetricCard label="المدفوع لهذه الفترة" value={formatMoney(servicePaidAmount)} tone="green" />
                <MetricCard label="المتبقي لهذه الفترة" value={formatMoney(serviceDueAmount)} tone="red" />
              </div>
            </>
          )}

          {activeView === 'contract' && (
            <Block title="بيانات الفترة الحالية" subtitle="البيانات الأساسية للعقد الحالي لهذه الخدمة" className="border-slate-300 bg-white">            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="نوع الخدمة">
                <input type="text" value={edit.service_type || ''} disabled className={shellReadOnly} />
              </Field>

              <Field label="آلية الدفع">
                <select
                  value={edit.payment_method || 'شهري'}
                  disabled={!editMode}
                  onChange={(e) => handlePaymentMethodChange(service.id, e.target.value)}
                  className={editMode ? shellInput : shellReadOnly}
                >
                  {PAYMENT_METHODS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </Field>

              {edit.payment_method === 'يومي' && (
                <Field label="التكرار بالأيام">
                  <input
                    type="number"
                    min="1"
                    value={edit.payment_interval_days || 1}
                    disabled={!editMode}
                    onChange={(e) => handlePaymentIntervalDaysChange(service.id, e.target.value)}
                    className={editMode ? shellInput : shellReadOnly}
                  />
                </Field>
              )}

              <Field label="عائدية الأجهزة">
                <select
                  value={edit.device_ownership || 'مدفوع الثمن'}
                  disabled={!editMode}
                  onChange={(e) =>
                    setServiceEdits((prev) => ({
                      ...prev,
                      [service.id]: { ...prev[service.id], device_ownership: e.target.value },
                    }))
                  }
                  className={editMode ? shellInput : shellReadOnly}
                >
                  {DEVICE_OPTIONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </Field>

              <Field label="سعر هذه الفترة">
                <input
                  type="number"
                  value={edit.annual_amount ?? 0}
                  disabled={!editMode}
                  onChange={(e) =>
                    setServiceEdits((prev) => ({
                      ...prev,
                      [service.id]: { ...prev[service.id], annual_amount: e.target.value },
                    }))
                  }
                  className={editMode ? shellInput : shellReadOnly}
                />
              </Field>

              <Field label="تاريخ إنشاء العقد">
                <input
                  type="date"
                  value={edit.contract_created_at || ''}
                  disabled={!editMode}
                  onChange={(e) => handleContractCreatedAtChange(service.id, e.target.value)}
                  className={editMode ? shellInput : shellReadOnly}
                />
              </Field>

              <Field label="وحدة مدة العقد">
                <select
                  value={edit.contract_duration_unit || 'شهري'}
                  disabled={!editMode}
                  onChange={(e) =>
                    setServiceEdits((prev) => ({
                      ...prev,
                      [service.id]: {
                        ...prev[service.id],
                        contract_duration_unit: e.target.value,
                      },
                    }))
                  }
                  className={editMode ? shellInput : shellReadOnly}
                >
                  {CONTRACT_DURATION_UNITS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </Field>

              <Field label="عدد مدة العقد">
                <input
                  type="number"
                  min="1"
                  value={edit.contract_duration_value || 1}
                  disabled={!editMode}
                  onChange={(e) =>
                    setServiceEdits((prev) => ({
                      ...prev,
                      [service.id]: {
                        ...prev[service.id],
                        contract_duration_value: e.target.value,
                      },
                    }))
                  }
                  className={editMode ? shellInput : shellReadOnly}
                />
              </Field>

              <Field label="تاريخ نهاية الفترة">
                <input
                  type="date"
                  value={activePeriod?.end_date ? toDateInput(activePeriod.end_date) : edit.due_date || ''}
                  disabled
                  className={shellReadOnly}
                />
              </Field>

              <Field label="المبلغ المتبقي">
                <input type="text" readOnly value={formatMoney(serviceDueAmount)} className={shellReadOnly} />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="ملاحظات الخدمة">
                <textarea
                  rows="3"
                  value={edit.notes || ''}
                  disabled={!editMode}
                  onChange={(e) =>
                    setServiceEdits((prev) => ({
                      ...prev,
                      [service.id]: { ...prev[service.id], notes: e.target.value },
                    }))
                  }
                  className={editMode ? shellInput : shellReadOnly}
                />
              </Field>
            </div>
          </Block>
          )}

          {activeView === 'items' && (
          <Block title="تفاصيل الخدمة" subtitle="العناصر الداخلة ضمن هذه الخدمة" className="border-blue-200 bg-white">            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-slate-500">
                لا توجد عناصر لهذه الخدمة
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, index) => {
                  const itemEdit = itemEdits[item.id] || {};
                  const totalForItem = calculateContractTotal(
                    Number(itemEdit.quantity || 0) * Number(itemEdit.unit_price || 0),
                    currentDurationUnit,
                    currentDurationValue
                  );

                  return (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-base font-bold text-slate-900">العنصر {index + 1}</div><div className="mt-1 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">مستقل عن بقية العناصر</div>
                          <div className="text-sm text-slate-500">تفاصيل العنصر المرتبط بهذه الخدمة</div>
                        </div>
                        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">
                          إجمالي هذا العنصر: {formatMoney(totalForItem)}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <Field label="التصنيف">
                          <input type="text" value={itemEdit.item_category || ''} disabled className={shellReadOnly} />
                        </Field>

                        <Field label="اسم العنصر">
                          <input
                            type="text"
                            value={itemEdit.item_name || ''}
                            disabled={!editMode}
                            onChange={(e) =>
                              setItemEdits((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], item_name: e.target.value },
                              }))
                            }
                            className={editMode ? shellInput : shellReadOnly}
                          />
                        </Field>

                        <Field label="العدد">
                          <input
                            type="number"
                            value={itemEdit.quantity ?? 0}
                            disabled={!editMode}
                            onChange={(e) =>
                              setItemEdits((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], quantity: e.target.value },
                              }))
                            }
                            className={editMode ? shellInput : shellReadOnly}
                          />
                        </Field>

                        <Field label="سعر الوحدة">
                          <input
                            type="number"
                            value={itemEdit.unit_price ?? 0}
                            disabled={!editMode}
                            onChange={(e) =>
                              setItemEdits((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], unit_price: e.target.value },
                              }))
                            }
                            className={editMode ? shellInput : shellReadOnly}
                          />
                        </Field>

                        <Field label="نوع الخط">
                          <input
                            type="text"
                            value={itemEdit.line_type || ''}
                            disabled={!editMode}
                            onChange={(e) =>
                              setItemEdits((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], line_type: e.target.value },
                              }))
                            }
                            className={editMode ? shellInput : shellReadOnly}
                          />
                        </Field>

                        <Field label="نوع الباقة">
                          <input
                            type="text"
                            value={itemEdit.bundle_type || ''}
                            disabled={!editMode}
                            onChange={(e) =>
                              setItemEdits((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], bundle_type: e.target.value },
                              }))
                            }
                            className={editMode ? shellInput : shellReadOnly}
                          />
                        </Field>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
                        <Field label="الملاحظات">
                          <input
                            type="text"
                            value={itemEdit.notes || ''}
                            disabled={!editMode}
                            onChange={(e) =>
                              setItemEdits((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], notes: e.target.value },
                              }))
                            }
                            className={editMode ? shellInput : shellReadOnly}
                          />
                        </Field>

                        <div className="flex items-end justify-end">
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700"
                          >
                            حذف العنصر
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Block>
          )}

          {activeView === 'payments' && (
          <Block title="تسجيل دفعة للفترة الحالية" subtitle="أدخل بيانات الدفعة مع الكتاب الرسمي المرتبط بها" className="border-green-200 bg-white">            {isSuspended && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                هذه الخدمة موقوفة، لذلك لا يمكن تسجيل دفعات جديدة لها.
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Field label="المبلغ">
                <input
                  type="number"
                  value={paymentForms[service.id]?.amount || ''}
                  onChange={(e) =>
                    setPaymentForms((prev) => ({
                      ...prev,
                      [service.id]: { ...prev[service.id], amount: e.target.value },
                    }))
                  }
                  disabled={isSuspended}
                  className={shellInput}
                />
              </Field>

              <Field label="تاريخ الدفع">
                <input
                  type="date"
                  value={paymentForms[service.id]?.payment_date || ''}
                  onChange={(e) =>
                    setPaymentForms((prev) => ({
                      ...prev,
                      [service.id]: { ...prev[service.id], payment_date: e.target.value },
                    }))
                  }
                  disabled={isSuspended}
                  className={shellInput}
                />
              </Field>

              <Field label="تاريخ الكتاب الرسمي">
                <input
                  type="date"
                  value={paymentForms[service.id]?.official_book_date || ''}
                  onChange={(e) =>
                    setPaymentForms((prev) => ({
                      ...prev,
                      [service.id]: { ...prev[service.id], official_book_date: e.target.value },
                    }))
                  }
                  disabled={isSuspended}
                  className={shellInput}
                />
              </Field>

              <div className="xl:col-span-2">
                <Field label="وصف الكتاب الرسمي">
                  <input
                    type="text"
                    value={paymentForms[service.id]?.official_book_description || ''}
                    onChange={(e) =>
                      setPaymentForms((prev) => ({
                        ...prev,
                        [service.id]: { ...prev[service.id], official_book_description: e.target.value },
                      }))
                    }
                    disabled={isSuspended}
                    className={shellInput}
                  />
                </Field>
              </div>

              <div className="xl:col-span-4">
                <Field label="ملاحظة">
                  <input
                    type="text"
                    value={paymentForms[service.id]?.note || ''}
                    onChange={(e) =>
                      setPaymentForms((prev) => ({
                        ...prev,
                        [service.id]: { ...prev[service.id], note: e.target.value },
                      }))
                    }
                    disabled={isSuspended}
                    className={shellInput}
                  />
                </Field>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => handleRecordPayment(service.id, serviceDueAmount)}
                  disabled={isSuspended}
                  className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  تسجيل دفعة
                </button>
              </div>
            </div>

            <div className="mt-5">
              {payments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-slate-500">
                  لا توجد دفعات مسجلة
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full bg-white text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-4 py-3 text-right font-semibold">المبلغ</th>
                        <th className="px-4 py-3 text-right font-semibold">تاريخ الدفع</th>
                        <th className="px-4 py-3 text-right font-semibold">الملاحظة</th>
                        <th className="px-4 py-3 text-right font-semibold">بواسطة</th>
                        <th className="px-4 py-3 text-right font-semibold">رقم الفترة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id} className="border-t border-slate-200">
                          <td className="px-4 py-3">{formatMoney(payment.amount)}</td>
                          <td className="px-4 py-3">{payment.payment_date || '-'}</td>
                          <td className="px-4 py-3">{payment.note || '-'}</td>
                          <td className="px-4 py-3">{payment.created_by_username || '-'}</td>
                          <td className="px-4 py-3">{payment.contract_period_id || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Block>
          )}

          {activeView === 'history' && (
          <Block
            title="سجل الفترات السابقة"
            subtitle={`عدد الفترات السابقة: ${closedPeriods.length}`}
            className="border-amber-200 bg-white"
          >            {closedPeriods.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-slate-500">
                لا توجد فترات سابقة محفوظة لهذه الخدمة
              </div>
            ) : (
              <div className="space-y-4">
                {closedPeriods.map((period, index) => renderPeriodHistoryCard(period, index))}
              </div>
            )}
          </Block>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="app-shell min-h-screen bg-slate-50">
        <Navbar onMenuClick={() => setIsMenuOpen(true)} />
        <SlideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
        <main className="mx-auto max-w-7xl px-4 py-10">
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-600 shadow-sm">
            جاري تحميل التفاصيل...
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-slate-50">
      <Navbar onMenuClick={() => setIsMenuOpen(true)} />
      <SlideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <div className="space-y-6">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-500">صفحة التفاصيل</div>
                <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{organization?.name || 'تفاصيل الجهة'}</h1>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700">
                    عدد الخدمات: {organization?.services?.length || 0}
                  </span>
                  <span className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${isContractFullyPaid ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                    {isContractFullyPaid ? 'مكتمل الدفع' : 'يوجد مبالغ متبقية'}
                  </span>
                </div>
              </div>

              <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-500">المتبقي الكلي</div>
                <div className="mt-1 text-3xl font-bold text-slate-900">{formatMoney(totalDueAmount)}</div>
              </div>
            </div>
          </section>

          {isContractFullyPaid && (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-base font-bold text-green-700">
              تم دفع أجور العقد بالكامل
            </div>
          )}

          <Block
            title="بيانات الجهة"
            subtitle="يمكن مراجعة أو تعديل بيانات الجهة من هذا القسم"
            actions={
              <>
                {!editMode ? (
                  <button
                    type="button"
                    onClick={handleEnableEdit}
                    className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-600"
                  >
                    إمكانية التعديل
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={saving}
                    className={`rounded-xl px-5 py-3 text-sm font-semibold text-white ${saving ? 'cursor-not-allowed bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {saving ? 'جاري الحفظ...' : 'حفظ التعديل'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleExportDetailReport}
                  disabled={exportingExcel || loading || !organization}
                  className={`rounded-xl px-5 py-3 text-sm font-semibold text-white ${exportingExcel || loading || !organization ? 'cursor-not-allowed bg-emerald-300' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {exportingExcel ? 'جاري التصدير...' : 'تصدير التقرير Excel'}
                </button>

                <button
                  type="button"
                  onClick={handleExportPdfReport}
                  disabled={exportingPdf || loading || !organization}
                  className={`rounded-xl px-5 py-3 text-sm font-semibold text-white ${exportingPdf || loading || !organization ? 'cursor-not-allowed bg-rose-300' : 'bg-rose-600 hover:bg-rose-700'}`}
                >
                  {exportingPdf ? 'جاري تجهيز PDF...' : 'تصدير التقرير PDF'}
                </button>

                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  رجوع
                </button>
              </>
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="اسم الجهة">
                <input
                  type="text"
                  value={orgForm.name}
                  disabled={!editMode}
                  onChange={(e) => setOrgForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={editMode ? shellInput : shellReadOnly}
                />
              </Field>

              <Field label="رقم الهاتف">
                <input
                  type="text"
                  value={orgForm.phone}
                  disabled={!editMode}
                  onChange={(e) => setOrgForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className={editMode ? shellInput : shellReadOnly}
                />
              </Field>

              <Field label="الموقع">
                <input
                  type="text"
                  value={orgForm.location}
                  disabled={!editMode}
                  onChange={(e) => setOrgForm((prev) => ({ ...prev, location: e.target.value }))}
                  className={editMode ? shellInput : shellReadOnly}
                />
              </Field>

              <div className="md:col-span-2">
                <Field label="العنوان">
                  <input
                    type="text"
                    value={orgForm.address}
                    disabled={!editMode}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, address: e.target.value }))}
                    className={editMode ? shellInput : shellReadOnly}
                  />
                </Field>
              </div>

              <Field label="الحالة">
                <select
                  value={orgForm.status}
                  disabled={!editMode}
                  onChange={(e) => setOrgForm((prev) => ({ ...prev, status: e.target.value }))}
                  className={editMode ? shellInput : shellReadOnly}
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                  <option value="pending">pending</option>
                </select>
              </Field>

              <div className="xl:col-span-3">
                <Field label="ملاحظات">
                  <textarea
                    rows="3"
                    value={orgForm.notes}
                    disabled={!editMode}
                    onChange={(e) => setOrgForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className={editMode ? shellInput : shellReadOnly}
                  />
                </Field>
              </div>
            </div>
          </Block>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard label="إجمالي العقد الحالي" value={formatMoney(totalContractAmount)} tone="blue" />
            <MetricCard label="المدفوع الكلي" value={formatMoney(totalPaidAmount)} tone="green" />
            <MetricCard label="المبلغ المتبقي الكلي" value={formatMoney(totalDueAmount)} tone="red" />
          </div>


          {organization?.services?.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-bold text-slate-900">التنقل بين الخدمات</div>
              <div className="flex flex-wrap gap-2">
                {(organization?.services || []).map((service, index) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => document.getElementById(`service-card-${service.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {index + 1}. {serviceLabelMap[service.service_type] || service.service_type} #{service.id}
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="space-y-8">
            {Object.entries(groupedServices).map(([key, list]) => {
              if (!list.length) return null;
              return (
                <section key={key} className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-500">قسم الخدمات</div>
                      <h2 className="text-2xl font-bold text-slate-900">{sectionTitleMap[key]}</h2>
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                      {list.length} خدمة
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">كل خدمة تعرض على شكل بطاقة مستقلة مع تبويبات واضحة للوصول السريع.</div>
                  <div className="space-y-5">{list.map(renderServiceCard)}</div>
                </section>
              );
            })}

            {organization?.services?.length === 0 && (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-14 text-center text-slate-500">
                لا توجد خدمات حالياً لهذه الجهة
              </div>
            )}
          </div>
        </div>

        {suspendModalService && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">إيقاف الخدمة</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    سيتم إسقاط المبالغ غير المدفوعة المتبقية وتسجيل المبلغ الراجع إن وجد.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseSuspendModal}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  إغلاق
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="تاريخ الكتاب الرسمي">
                  <input
                    type="date"
                    value={suspendForms[suspendModalService.id]?.official_book_date || ''}
                    onChange={(e) =>
                      setSuspendForms((prev) => ({
                        ...prev,
                        [suspendModalService.id]: { ...prev[suspendModalService.id], official_book_date: e.target.value },
                      }))
                    }
                    className={shellInput}
                  />
                </Field>

                <Field label="المبلغ الراجع">
                  <input
                    type="number"
                    min="0"
                    value={suspendForms[suspendModalService.id]?.refund_amount || ''}
                    onChange={(e) =>
                      setSuspendForms((prev) => ({
                        ...prev,
                        [suspendModalService.id]: { ...prev[suspendModalService.id], refund_amount: e.target.value },
                      }))
                    }
                    className={shellInput}
                  />
                </Field>
              </div>

              <div className="mt-4">
                <Field label="وصف الكتاب الرسمي">
                  <input
                    type="text"
                    value={suspendForms[suspendModalService.id]?.official_book_description || ''}
                    onChange={(e) =>
                      setSuspendForms((prev) => ({
                        ...prev,
                        [suspendModalService.id]: { ...prev[suspendModalService.id], official_book_description: e.target.value },
                      }))
                    }
                    className={shellInput}
                  />
                </Field>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-900">إيقاف فوري</div>
                    <div className="text-sm text-slate-500">عند إطفائه يمكنك اختيار تاريخ إيقاف مستقبلي.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSuspendForms((prev) => ({
                        ...prev,
                        [suspendModalService.id]: {
                          ...prev[suspendModalService.id],
                          is_immediate: !prev[suspendModalService.id]?.is_immediate,
                        },
                      }))
                    }
                    className={`rounded-full px-4 py-2 text-sm font-bold text-white ${suspendForms[suspendModalService.id]?.is_immediate ? 'bg-green-600' : 'bg-slate-500'}`}
                  >
                    {suspendForms[suspendModalService.id]?.is_immediate ? 'ON' : 'OFF'}
                  </button>
                </div>

                {!suspendForms[suspendModalService.id]?.is_immediate && (
                  <Field label="تاريخ الإيقاف">
                    <input
                      type="date"
                      value={suspendForms[suspendModalService.id]?.suspend_date || ''}
                      onChange={(e) =>
                        setSuspendForms((prev) => ({
                          ...prev,
                          [suspendModalService.id]: { ...prev[suspendModalService.id], suspend_date: e.target.value },
                        }))
                      }
                      className={shellInput}
                    />
                  </Field>
                )}
              </div>

              <div className="mt-4">
                <Field label="ملاحظات الإيقاف">
                  <textarea
                    value={suspendForms[suspendModalService.id]?.note || ''}
                    onChange={(e) =>
                      setSuspendForms((prev) => ({
                        ...prev,
                        [suspendModalService.id]: { ...prev[suspendModalService.id], note: e.target.value },
                      }))
                    }
                    rows="3"
                    className={shellInput}
                  />
                </Field>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseSuspendModal}
                  className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSuspend}
                  disabled={suspending}
                  className="rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:bg-slate-400"
                >
                  {suspending ? 'جاري الحفظ...' : 'تأكيد الإيقاف'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <PageFooter />
    </div>
  );
};

export default DetailPage;