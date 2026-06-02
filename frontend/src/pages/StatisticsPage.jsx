import React, { useEffect, useMemo, useState } from 'react';
import Navbar from '../components/Navbar';
import SlideMenu from '../components/SlideMenu';
import PageFooter from '../components/PageFooter';

const API_BASE = 'http://127.0.0.1:5000/api';

const TABS = [
  { key: 'providers', label: 'إحصائيات الجهات المزودة' },
  { key: 'general', label: 'الإحصائيات العامة' },
  { key: 'payments', label: 'تقرير الدفعات' },
  { key: 'books', label: 'تقرير الكتب الرسمية' },
];

const getToday = () => new Date().toISOString().slice(0, 10);
const getMonthStart = () => {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
};

const formatMoney = (value) => {
  const num = Number(value || 0);
  return `${num.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
};

const formatDate = (value) => {
  if (!value) return '-';
  return String(value).slice(0, 10);
};

const MetricCard = ({ title, value, subValue, tone = 'blue' }) => {
  const toneClasses = {
    blue: 'from-blue-500 to-cyan-500',
    green: 'from-emerald-500 to-green-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    indigo: 'from-indigo-500 to-violet-500',
  };

  return (
    <div className="surface-card overflow-hidden">
      <div className={`h-1.5 bg-gradient-to-r ${toneClasses[tone] || toneClasses.blue}`} />
      <div className="p-5">
        <p className="text-sm text-slate-500 mb-2">{title}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {subValue ? <p className="text-xs text-slate-500 mt-2">{subValue}</p> : null}
      </div>
    </div>
  );
};

const TableCard = ({ title, children, action }) => (
  <div className="surface-card overflow-hidden">
    <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      {action}
    </div>
    <div className="overflow-x-auto">{children}</div>
  </div>
);

const EmptyState = ({ text }) => (
  <div className="empty-state">
    {text}
  </div>
);

const StatisticsPage = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('providers');

  const [providers, setProviders] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [providerDetails, setProviderDetails] = useState(null);
  const [providerDetailsLoading, setProviderDetailsLoading] = useState(false);
  const [providerDetailsError, setProviderDetailsError] = useState('');
  const [providerFilters, setProviderFilters] = useState({ from_date: getMonthStart(), to_date: getToday() });

  const [generalStats, setGeneralStats] = useState(null);
  const [generalLoading, setGeneralLoading] = useState(true);
  const [generalError, setGeneralError] = useState('');

  const [paymentFilters, setPaymentFilters] = useState({ from_date: getMonthStart(), to_date: getToday() });
  const [paymentReport, setPaymentReport] = useState(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState('');

  const [bookFilters, setBookFilters] = useState({ from_date: getMonthStart(), to_date: getToday() });
  const [bookReport, setBookReport] = useState(null);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const fetchProviders = async () => {
    try {
      setProvidersLoading(true);
      setProvidersError('');
      const res = await fetch(`${API_BASE}/statistics/providers`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل الجهات المزودة');
      const rows = data.providers || [];
      setProviders(rows);
      setSelectedProviderId((current) => current || (rows[0]?.id ? String(rows[0].id) : ''));
    } catch (err) {
      setProvidersError(err.message || 'حدث خطأ أثناء تحميل الجهات المزودة');
    } finally {
      setProvidersLoading(false);
    }
  };

  const fetchGeneralStats = async () => {
    try {
      setGeneralLoading(true);
      setGeneralError('');
      const res = await fetch(`${API_BASE}/statistics/general`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل الإحصائيات العامة');
      setGeneralStats(data);
    } catch (err) {
      setGeneralError(err.message || 'حدث خطأ أثناء تحميل الإحصائيات العامة');
    } finally {
      setGeneralLoading(false);
    }
  };

  const fetchProviderDetails = async (providerId, filters = providerFilters) => {
    if (!providerId) {
      setProviderDetails(null);
      return;
    }

    try {
      setProviderDetailsLoading(true);
      setProviderDetailsError('');
      const params = new URLSearchParams(filters);
      const res = await fetch(`${API_BASE}/statistics/providers/${providerId}?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل تفاصيل الجهة المزودة');
      setProviderDetails(data);
    } catch (err) {
      setProviderDetailsError(err.message || 'حدث خطأ أثناء تحميل تفاصيل الجهة المزودة');
      setProviderDetails(null);
    } finally {
      setProviderDetailsLoading(false);
    }
  };

  const fetchPaymentsReport = async (filters = paymentFilters) => {
    try {
      setPaymentsLoading(true);
      setPaymentsError('');
      const params = new URLSearchParams(filters);
      const res = await fetch(`${API_BASE}/reports/payments?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل تقرير الدفعات');
      setPaymentReport(data);
    } catch (err) {
      setPaymentsError(err.message || 'حدث خطأ أثناء تحميل تقرير الدفعات');
      setPaymentReport(null);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const fetchBooksReport = async (filters = bookFilters) => {
    try {
      setBooksLoading(true);
      setBooksError('');
      const params = new URLSearchParams(filters);
      const res = await fetch(`${API_BASE}/reports/official-books?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل تقرير الكتب الرسمية');
      setBookReport(data);
    } catch (err) {
      setBooksError(err.message || 'حدث خطأ أثناء تحميل تقرير الكتب الرسمية');
      setBookReport(null);
    } finally {
      setBooksLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
    fetchGeneralStats();
    fetchPaymentsReport({ from_date: getMonthStart(), to_date: getToday() });
    fetchBooksReport({ from_date: getMonthStart(), to_date: getToday() });
  }, []);

  useEffect(() => {
    if (selectedProviderId) {
      fetchProviderDetails(selectedProviderId, providerFilters);
    }
  }, [selectedProviderId]);

  const selectedProviderSummary = providerDetails?.summary || {};
  const providerPaymentsSummary = providerDetails?.payments_summary || {};
  const summary = generalStats?.summary || {};

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const getExcelExportConfig = () => {
    if (activeTab === 'providers') {
      if (!selectedProviderId) throw new Error('اختر جهة مزودة أولاً');
      return {
        url: `${API_BASE}/statistics/providers/${selectedProviderId}/export?${new URLSearchParams(providerFilters).toString()}`,
        filename: `provider_statistics_${selectedProviderId}_${providerFilters.from_date}_${providerFilters.to_date}.xls`,
      };
    }
    if (activeTab === 'general') {
      return {
        url: `${API_BASE}/statistics/general/export`,
        filename: 'statistics_general_report.xls',
      };
    }
    if (activeTab === 'payments') {
      const params = new URLSearchParams(paymentFilters);
      return {
        url: `${API_BASE}/reports/payments/export?${params.toString()}`,
        filename: `payments_report_${paymentFilters.from_date}_${paymentFilters.to_date}.xls`,
      };
    }
    const params = new URLSearchParams(bookFilters);
    return {
      url: `${API_BASE}/reports/official-books/export?${params.toString()}`,
      filename: `official_books_report_${bookFilters.from_date}_${bookFilters.to_date}.xls`,
    };
  };

  const handleExportExcel = async () => {
    try {
      setExportingExcel(true);
      const config = getExcelExportConfig();
      const res = await fetch(config.url);
      if (!res.ok) {
        let message = 'فشل تصدير التقرير';
        try {
          const data = await res.json();
          message = data.error || message;
        } catch (_) {}
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = config.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(err.message || 'حدث خطأ أثناء تصدير Excel');
    } finally {
      setExportingExcel(false);
    }
  };

  const getPdfDocument = () => {
    if (activeTab === 'providers') {
      if (!providerDetails) throw new Error('لا توجد بيانات لطباعتها');
      return {
        title: `إحصائيات الجهة المزودة - ${providerDetails.provider?.name || ''}`,
        sections: [
          {
            title: 'الملخص',
            headers: ['المؤشر', 'القيمة'],
            rows: [
              ['اسم الجهة', providerDetails.provider?.name || '-'],
              ['الحالة', providerDetails.provider?.is_active ? 'فعالة' : 'غير فعالة'],
              ['عدد الجهات المشتركة', selectedProviderSummary.organizations_count || 0],
              ['عدد الخدمات', selectedProviderSummary.services_count || 0],
              ['المبلغ المستلم', formatMoney(selectedProviderSummary.estimated_received_amount)],
              ['المبلغ المتبقي', formatMoney(selectedProviderSummary.estimated_due_amount)],
            ],
          },
          {
            title: 'الجهات المرتبطة',
            headers: ['الجهة', 'الخدمات', 'العناصر', 'المستلم', 'المتبقي'],
            rows: (providerDetails.organizations || []).map((row) => [
              row.organization_name,
              row.services_count,
              row.items_count,
              formatMoney(row.estimated_received_amount),
              formatMoney(row.estimated_due_amount),
            ]),
          },
          {
            title: 'التوزيع حسب نوع الخدمة',
            headers: ['نوع الخدمة', 'الخدمات', 'المتبقي'],
            rows: (providerDetails.service_types || []).map((row) => [
              row.service_type,
              row.services_count,
              formatMoney(row.estimated_due_amount),
            ]),
          },
          {
            title: 'ملخص الدفعات ضمن الفترة المحددة',
            headers: ['المؤشر', 'القيمة'],
            rows: [
              ['الفترة', `${providerDetails.filters?.from_date || '-'} → ${providerDetails.filters?.to_date || '-'}`],
              ['عدد الدفعات', providerPaymentsSummary.payments_count || 0],
              ['إجمالي المبالغ المدفوعة', formatMoney(providerPaymentsSummary.total_amount)],
              ['عدد الجهات التي دفعت', providerPaymentsSummary.organizations_count || 0],
              ['عدد الخدمات التي عليها دفعات', providerPaymentsSummary.services_count || 0],
            ],
          },
          {
            title: 'الدفعات ضمن الفترة',
            headers: ['التاريخ', 'الجهة', 'نوع الخدمة', 'المبلغ', 'الملاحظة'],
            rows: (providerDetails.filtered_payments || []).map((row) => [
              formatDate(row.payment_date),
              row.organization_name,
              row.service_type,
              formatMoney(row.amount),
              row.note || '-',
            ]),
          },
        ],
      };
    }

    if (activeTab === 'general') {
      if (!generalStats) throw new Error('لا توجد بيانات لطباعتها');
      return {
        title: 'الإحصائيات العامة',
        sections: [
          {
            title: 'الملخص العام',
            headers: ['المؤشر', 'القيمة'],
            rows: [
              ['إجمالي الجهات', summary.total_organizations || 0],
              ['إجمالي الجهات المزودة', summary.total_provider_companies || 0],
              ['إجمالي الخدمات', summary.total_services || 0],
              ['إجمالي الدفعات المستلمة', formatMoney(summary.total_paid_amount)],
              ['إجمالي المبالغ المتبقية', formatMoney(summary.total_due_amount)],
              ['عدد الكتب الرسمية', summary.official_books_count || 0],
            ],
          },
          {
            title: 'إحصائيات حسب نوع الخدمة',
            headers: ['نوع الخدمة', 'عدد الخدمات', 'المستلم', 'المتبقي'],
            rows: (generalStats.service_type_stats || []).map((row) => [
              row.service_type,
              row.services_count,
              formatMoney(row.total_paid_amount),
              formatMoney(row.total_due_amount),
            ]),
          },
          {
            title: 'أفضل الجهات المزودة',
            headers: ['الجهة المزودة', 'عدد الجهات', 'المستلم', 'المتبقي'],
            rows: (generalStats.provider_overview || []).map((row) => [
              row.name,
              row.organizations_count,
              formatMoney(row.estimated_received_amount),
              formatMoney(row.estimated_due_amount),
            ]),
          },
          {
            title: 'حركة الدفعات الشهرية',
            headers: ['الشهر', 'عدد الدفعات', 'الإجمالي'],
            rows: (generalStats.monthly_payments || []).map((row) => [
              row.month,
              row.payments_count,
              formatMoney(row.total_amount),
            ]),
          },
        ],
      };
    }

    if (activeTab === 'payments') {
      if (!paymentReport) throw new Error('لا توجد بيانات لطباعتها');
      return {
        title: `تقرير الدفعات من ${paymentReport.from_date} إلى ${paymentReport.to_date}`,
        sections: [
          {
            title: 'الملخص',
            headers: ['المؤشر', 'القيمة'],
            rows: [
              ['عدد الدفعات', paymentReport.summary?.payments_count || 0],
              ['إجمالي المبالغ', formatMoney(paymentReport.summary?.total_amount)],
              ['الفترة', `${paymentReport.from_date} → ${paymentReport.to_date}`],
            ],
          },
          {
            title: 'كل الدفعات',
            headers: ['التاريخ', 'الجهة', 'المزود', 'الخدمة', 'المبلغ', 'الكتاب الرسمي'],
            rows: (paymentReport.payments || []).map((row) => [
              formatDate(row.payment_date),
              row.organization_name,
              row.provider_names,
              row.service_type,
              formatMoney(row.amount),
              row.official_book_description || '-',
            ]),
          },
          {
            title: 'تجميع حسب الجهة',
            headers: ['الجهة', 'عدد الدفعات', 'الإجمالي'],
            rows: (paymentReport.by_organization || []).map((row) => [
              row.organization_name,
              row.payments_count,
              formatMoney(row.total_amount),
            ]),
          },
        ],
      };
    }

    if (!bookReport) throw new Error('لا توجد بيانات لطباعتها');
    return {
      title: `تقرير الكتب الرسمية من ${bookReport.from_date} إلى ${bookReport.to_date}`,
      sections: [
        {
          title: 'الملخص',
          headers: ['المؤشر', 'القيمة'],
          rows: [
            ['عدد الكتب', bookReport.summary?.books_count || 0],
            ['عدد أنواع العمليات', bookReport.by_operation?.length || 0],
            ['الفترة', `${bookReport.from_date} → ${bookReport.to_date}`],
          ],
        },
        {
          title: 'كل الكتب الرسمية',
          headers: ['تاريخ الكتاب', 'نوع العملية', 'الجهة', 'الخدمة', 'الوصف'],
          rows: (bookReport.books || []).map((row) => [
            formatDate(row.official_book_date),
            row.operation_type,
            row.organization_name || '-',
            row.service_type || '-',
            row.official_book_description || '-',
          ]),
        },
        {
          title: 'تجميع حسب نوع العملية',
          headers: ['نوع العملية', 'عدد الكتب'],
          rows: (bookReport.by_operation || []).map((row) => [row.operation_type, row.books_count]),
        },
      ],
    };
  };

  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);
      const doc = getPdfDocument();
      const sectionsHtml = doc.sections.map((section) => `
        <section style="margin-bottom:24px; page-break-inside:avoid;">
          <h2 style="font-size:18px; margin:0 0 10px; color:#0f172a;">${escapeHtml(section.title)}</h2>
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr>
                ${section.headers.map((header) => `<th style="border:1px solid #cbd5e1; background:#e2e8f0; padding:8px;">${escapeHtml(header)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${(section.rows?.length ? section.rows : [['لا توجد بيانات']]).map((row) => `
                <tr>
                  ${row.map((cell) => `<td style="border:1px solid #cbd5e1; padding:8px;">${escapeHtml(cell)}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
      `).join('');

      const printWindow = window.open('', '_blank', 'width=1200,height=900');
      if (!printWindow) throw new Error('تعذر فتح نافذة الطباعة');
      printWindow.document.write(`
        <html lang="ar" dir="rtl">
          <head>
            <title>${escapeHtml(doc.title)}</title>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; direction: rtl; padding: 24px; color: #0f172a; }
              h1 { margin: 0 0 20px; font-size: 24px; }
              @media print {
                body { padding: 0; }
                section { break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <h1>${escapeHtml(doc.title)}</h1>
            ${sectionsHtml}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 300);
    } catch (err) {
      console.error(err);
      alert(err.message || 'حدث خطأ أثناء تجهيز PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const topProviderName = useMemo(() => {
    if (!generalStats?.provider_overview?.length) return 'لا يوجد';
    return generalStats.provider_overview[0]?.name || 'لا يوجد';
  }, [generalStats]);

  const renderProvidersTab = () => (
    <div className="space-y-6">
      <div className="filter-panel space-y-5">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">إحصائيات الجهات المزودة</h2>
            <p className="text-slate-500">اختر جهة مزودة، ثم حدد فترة زمنية لمعرفة الدفعات المسددة لهذه الجهة خلال المدة المطلوبة مع إمكانية طباعتها PDF.</p>
          </div>
          <div className="w-full lg:w-96">
            <label className="block text-sm font-medium text-slate-700 mb-2">الجهة المزودة</label>
            <select
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
              className="select-modern"
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">من تاريخ</label>
            <input
              type="date"
              value={providerFilters.from_date}
              onChange={(e) => setProviderFilters((prev) => ({ ...prev, from_date: e.target.value }))}
              className="input-modern"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">إلى تاريخ</label>
            <input
              type="date"
              value={providerFilters.to_date}
              onChange={(e) => setProviderFilters((prev) => ({ ...prev, to_date: e.target.value }))}
              className="input-modern"
            />
          </div>
          <div className="xl:col-span-2 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            <button
              onClick={() => fetchProviderDetails(selectedProviderId, providerFilters)}
              className="btn-primary"
            >
              عرض دفعات الفترة
            </button>
            <div className="soft-panel flex-1 text-sm text-slate-600">
              سيتم تطبيق هذه الفترة أيضاً داخل ملف الـ PDF و Excel الخاص بإحصائيات الجهة المزودة.
            </div>
          </div>
        </div>
      </div>

      {providersError ? <EmptyState text={providersError} /> : null}
      {providerDetailsError ? <EmptyState text={providerDetailsError} /> : null}

      {providersLoading || providerDetailsLoading ? (
        <EmptyState text="جاري تحميل بيانات الجهة المزودة..." />
      ) : providerDetails ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard title="عدد الجهات المشتركة" value={selectedProviderSummary.organizations_count || 0} tone="blue" />
            <MetricCard title="عدد الخدمات" value={selectedProviderSummary.services_count || 0} tone="indigo" />
            <MetricCard title="المبلغ المستلم التقديري" value={formatMoney(selectedProviderSummary.estimated_received_amount)} tone="green" />
            <MetricCard title="المبلغ المتبقي التقديري" value={formatMoney(selectedProviderSummary.estimated_due_amount)} tone="rose" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard title="عدد الدفعات ضمن الفترة" value={providerPaymentsSummary.payments_count || 0} tone="blue" />
            <MetricCard title="إجمالي المدفوع ضمن الفترة" value={formatMoney(providerPaymentsSummary.total_amount)} tone="green" />
            <MetricCard title="الجهات التي دفعت" value={providerPaymentsSummary.organizations_count || 0} tone="amber" />
            <MetricCard title="الفترة المحددة" value={`${providerDetails.filters?.from_date || '-'} → ${providerDetails.filters?.to_date || '-'}`} tone="indigo" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <TableCard title={`الجهات المرتبطة بـ ${providerDetails.provider?.name || ''}`}>
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left">الجهة</th>
                      <th className="px-4 py-3 text-left">الخدمات</th>
                      <th className="px-4 py-3 text-left">العناصر</th>
                      <th className="px-4 py-3 text-left">المستلم</th>
                      <th className="px-4 py-3 text-left">المتبقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerDetails.organizations?.length ? providerDetails.organizations.map((row) => (
                      <tr key={row.organization_id} className="border-t border-slate-100 hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-medium text-slate-800">{row.organization_name}</td>
                        <td className="px-4 py-3">{row.services_count}</td>
                        <td className="px-4 py-3">{row.items_count}</td>
                        <td className="px-4 py-3 text-emerald-700 font-semibold">{formatMoney(row.estimated_received_amount)}</td>
                        <td className="px-4 py-3 text-rose-700 font-semibold">{formatMoney(row.estimated_due_amount)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="5" className="px-4 py-8 text-center text-slate-500">لا توجد بيانات لهذه الجهة المزودة.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TableCard>
            </div>

            <div className="space-y-6">
              <TableCard title="ملخص الجهة المزودة">
                <div className="p-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-4"><span className="text-slate-500">اسم الجهة</span><span className="font-semibold text-slate-900">{providerDetails.provider?.name || '-'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-500">الحالة</span><span className="font-semibold text-slate-900">{providerDetails.provider?.is_active ? 'فعالة' : 'غير فعالة'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-500">القيمة التعاقدية</span><span className="font-semibold text-slate-900">{formatMoney(selectedProviderSummary.total_contract_value)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-500">هاتف</span><span className="font-semibold text-slate-900">{providerDetails.provider?.phone || '-'}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-500">عنوان</span><span className="font-semibold text-slate-900">{providerDetails.provider?.address || '-'}</span></div>
                </div>
              </TableCard>

              <TableCard title="التوزيع حسب نوع الخدمة">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left">نوع الخدمة</th>
                      <th className="px-4 py-3 text-left">الخدمات</th>
                      <th className="px-4 py-3 text-left">المتبقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerDetails.service_types?.length ? providerDetails.service_types.map((row) => (
                      <tr key={row.service_type} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-medium text-slate-800">{row.service_type}</td>
                        <td className="px-4 py-3">{row.services_count}</td>
                        <td className="px-4 py-3 text-rose-700 font-semibold">{formatMoney(row.estimated_due_amount)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-500">لا توجد بيانات.</td></tr>
                    )}
                  </tbody>
                </table>
              </TableCard>
            </div>
          </div>

          <TableCard title="الدفعات المرتبطة بهذه الجهة المزودة ضمن الفترة المحددة">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">التاريخ</th>
                  <th className="px-4 py-3 text-left">الجهة</th>
                  <th className="px-4 py-3 text-left">نوع الخدمة</th>
                  <th className="px-4 py-3 text-left">المبلغ</th>
                  <th className="px-4 py-3 text-left">ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {providerDetails.filtered_payments?.length ? providerDetails.filtered_payments.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-4 py-3">{formatDate(row.payment_date)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.organization_name}</td>
                    <td className="px-4 py-3">{row.service_type}</td>
                    <td className="px-4 py-3 text-emerald-700 font-semibold">{formatMoney(row.amount)}</td>
                    <td className="px-4 py-3 text-slate-500">{row.note || '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">لا توجد دفعات مسجلة لهذه الجهة المزودة ضمن الفترة المحددة.</td></tr>
                )}
              </tbody>
            </table>
          </TableCard>
        </>
      ) : (
        <EmptyState text="لا توجد جهات مزودة لعرض الإحصائيات." />
      )}
    </div>
  );

  const renderGeneralTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-2xl font-bold text-slate-900 mb-1">الإحصائيات العامة</h2>
        <p className="text-slate-500">عرض شامل لكل النظام: الجهات، الخدمات، الدفعات، والكتب الرسمية.</p>
      </div>

      {generalError ? <EmptyState text={generalError} /> : null}
      {generalLoading ? (
        <EmptyState text="جاري تحميل الإحصائيات العامة..." />
      ) : generalStats ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <MetricCard title="إجمالي الجهات" value={summary.total_organizations || 0} subValue={`الفعالة: ${summary.active_organizations || 0}`} tone="blue" />
            <MetricCard title="إجمالي الجهات المزودة" value={summary.total_provider_companies || 0} subValue={`الفعالة: ${summary.active_provider_companies || 0}`} tone="indigo" />
            <MetricCard title="إجمالي الخدمات" value={summary.total_services || 0} subValue={`الفعالة: ${summary.active_services || 0}`} tone="amber" />
            <MetricCard title="إجمالي الدفعات المستلمة" value={formatMoney(summary.total_paid_amount)} subValue={`عدد الدفعات: ${summary.total_payments_count || 0}`} tone="green" />
            <MetricCard title="إجمالي المبالغ المتبقية" value={formatMoney(summary.total_due_amount)} subValue={`الكتب الرسمية: ${summary.official_books_count || 0}`} tone="rose" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <TableCard title="إحصائيات حسب نوع الخدمة">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">نوع الخدمة</th>
                    <th className="px-4 py-3 text-left">عدد الخدمات</th>
                    <th className="px-4 py-3 text-left">المستلم</th>
                    <th className="px-4 py-3 text-left">المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {generalStats.service_type_stats?.length ? generalStats.service_type_stats.map((row) => (
                    <tr key={row.service_type} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.service_type}</td>
                      <td className="px-4 py-3">{row.services_count}</td>
                      <td className="px-4 py-3 text-emerald-700 font-semibold">{formatMoney(row.total_paid_amount)}</td>
                      <td className="px-4 py-3 text-rose-700 font-semibold">{formatMoney(row.total_due_amount)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500">لا توجد بيانات.</td></tr>
                  )}
                </tbody>
              </table>
            </TableCard>

            <TableCard title="أفضل الجهات المزودة">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">الجهة المزودة</th>
                    <th className="px-4 py-3 text-left">عدد الجهات</th>
                    <th className="px-4 py-3 text-left">المستلم</th>
                    <th className="px-4 py-3 text-left">المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {generalStats.provider_overview?.length ? generalStats.provider_overview.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                      <td className="px-4 py-3">{row.organizations_count}</td>
                      <td className="px-4 py-3 text-emerald-700 font-semibold">{formatMoney(row.estimated_received_amount)}</td>
                      <td className="px-4 py-3 text-rose-700 font-semibold">{formatMoney(row.estimated_due_amount)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500">لا توجد بيانات.</td></tr>
                  )}
                </tbody>
              </table>
            </TableCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">حركة الدفعات لآخر 12 شهر</h3>
                <span className="text-sm text-slate-500">أفضل مزود: {topProviderName}</span>
              </div>
              <div className="space-y-4">
                {generalStats.monthly_payments?.length ? generalStats.monthly_payments.map((row) => {
                  const max = Math.max(...generalStats.monthly_payments.map((item) => Number(item.total_amount || 0)), 1);
                  const width = `${Math.max(8, (Number(row.total_amount || 0) / max) * 100)}%`;
                  return (
                    <div key={row.month}>
                      <div className="flex items-center justify-between mb-1 text-sm">
                        <span className="font-medium text-slate-700">{row.month}</span>
                        <span className="text-slate-500">{formatMoney(row.total_amount)} / {row.payments_count} دفعة</span>
                      </div>
                      <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width }} />
                      </div>
                    </div>
                  );
                }) : <p className="text-slate-500">لا توجد دفعات لعرضها.</p>}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <h3 className="text-lg font-bold text-slate-900 mb-4">مؤشرات سريعة</h3>
              <div className="space-y-4 text-sm">
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
                  <p className="text-slate-500 mb-1">متوسط الدفعة الواحدة</p>
                  <p className="text-xl font-bold text-slate-900">
                    {summary.total_payments_count ? formatMoney((summary.total_paid_amount || 0) / summary.total_payments_count) : '0.00'}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
                  <p className="text-slate-500 mb-1">نسبة التحصيل الحالية</p>
                  <p className="text-xl font-bold text-slate-900">
                    {((Number(summary.total_paid_amount || 0) / Math.max(Number(summary.total_paid_amount || 0) + Number(summary.total_due_amount || 0), 1)) * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
                  <p className="text-slate-500 mb-1">عدد الكتب الرسمية</p>
                  <p className="text-xl font-bold text-slate-900">{summary.official_books_count || 0}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <EmptyState text="لا توجد بيانات عامة لعرضها." />
      )}
    </div>
  );

  const renderPaymentsTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col xl:flex-row gap-4 xl:items-end xl:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">تقرير الدفعات من تاريخ إلى تاريخ</h2>
            <p className="text-slate-500">يعرض كل الدفعات ضمن المدة التي يحددها المستخدم مع الإجمالي وتوزيع الدفعات على الجهات.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full xl:w-auto">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">من تاريخ</label>
              <input type="date" value={paymentFilters.from_date} onChange={(e) => setPaymentFilters((prev) => ({ ...prev, from_date: e.target.value }))} className="input-modern" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">إلى تاريخ</label>
              <input type="date" value={paymentFilters.to_date} onChange={(e) => setPaymentFilters((prev) => ({ ...prev, to_date: e.target.value }))} className="input-modern" />
            </div>
            <button onClick={() => fetchPaymentsReport()} className="btn-primary">عرض التقرير</button>
          </div>
        </div>
      </div>

      {paymentsError ? <EmptyState text={paymentsError} /> : null}
      {paymentsLoading ? <EmptyState text="جاري تحميل تقرير الدفعات..." /> : null}

      {paymentReport ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard title="عدد الدفعات" value={paymentReport.summary?.payments_count || 0} tone="blue" />
            <MetricCard title="إجمالي المبالغ" value={formatMoney(paymentReport.summary?.total_amount)} tone="green" />
            <MetricCard title="الفترة" value={`${paymentReport.from_date} → ${paymentReport.to_date}`} tone="indigo" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <TableCard title="كل الدفعات ضمن الفترة المحددة">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left">التاريخ</th>
                      <th className="px-4 py-3 text-left">الجهة</th>
                      <th className="px-4 py-3 text-left">المزود</th>
                      <th className="px-4 py-3 text-left">الخدمة</th>
                      <th className="px-4 py-3 text-left">المبلغ</th>
                      <th className="px-4 py-3 text-left">الكتاب الرسمي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentReport.payments?.length ? paymentReport.payments.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                        <td className="px-4 py-3">{formatDate(row.payment_date)}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{row.organization_name}</td>
                        <td className="px-4 py-3">{row.provider_names}</td>
                        <td className="px-4 py-3">{row.service_type}</td>
                        <td className="px-4 py-3 text-emerald-700 font-semibold">{formatMoney(row.amount)}</td>
                        <td className="px-4 py-3 text-slate-500">{row.official_book_description || '-'}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">لا توجد دفعات في هذه الفترة.</td></tr>
                    )}
                  </tbody>
                </table>
              </TableCard>
            </div>

            <TableCard title="تجميع حسب الجهة">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">الجهة</th>
                    <th className="px-4 py-3 text-left">عدد الدفعات</th>
                    <th className="px-4 py-3 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentReport.by_organization?.length ? paymentReport.by_organization.map((row) => (
                    <tr key={row.organization_id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.organization_name}</td>
                      <td className="px-4 py-3">{row.payments_count}</td>
                      <td className="px-4 py-3 text-emerald-700 font-semibold">{formatMoney(row.total_amount)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-500">لا توجد بيانات.</td></tr>
                  )}
                </tbody>
              </table>
            </TableCard>
          </div>
        </>
      ) : null}
    </div>
  );

  const renderBooksTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-col xl:flex-row gap-4 xl:items-end xl:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">تقرير الكتب الرسمية من تاريخ إلى تاريخ</h2>
            <p className="text-slate-500">استعراض الكتب الرسمية المخزنة في النظام مع نوع العملية والجهة المرتبطة بها.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full xl:w-auto">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">من تاريخ</label>
              <input type="date" value={bookFilters.from_date} onChange={(e) => setBookFilters((prev) => ({ ...prev, from_date: e.target.value }))} className="input-modern" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">إلى تاريخ</label>
              <input type="date" value={bookFilters.to_date} onChange={(e) => setBookFilters((prev) => ({ ...prev, to_date: e.target.value }))} className="input-modern" />
            </div>
            <button onClick={() => fetchBooksReport()} className="btn-primary">عرض التقرير</button>
          </div>
        </div>
      </div>

      {booksError ? <EmptyState text={booksError} /> : null}
      {booksLoading ? <EmptyState text="جاري تحميل تقرير الكتب الرسمية..." /> : null}

      {bookReport ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard title="عدد الكتب" value={bookReport.summary?.books_count || 0} tone="blue" />
            <MetricCard title="عدد أنواع العمليات" value={bookReport.by_operation?.length || 0} tone="amber" />
            <MetricCard title="الفترة" value={`${bookReport.from_date} → ${bookReport.to_date}`} tone="indigo" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <TableCard title="الكتب الرسمية ضمن الفترة المحددة">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left">تاريخ الكتاب</th>
                      <th className="px-4 py-3 text-left">نوع العملية</th>
                      <th className="px-4 py-3 text-left">الجهة</th>
                      <th className="px-4 py-3 text-left">الخدمة</th>
                      <th className="px-4 py-3 text-left">الوصف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookReport.books?.length ? bookReport.books.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                        <td className="px-4 py-3">{formatDate(row.official_book_date)}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{row.operation_type}</td>
                        <td className="px-4 py-3">{row.organization_name || '-'}</td>
                        <td className="px-4 py-3">{row.service_type || '-'}</td>
                        <td className="px-4 py-3 text-slate-500">{row.official_book_description || '-'}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">لا توجد كتب رسمية في هذه الفترة.</td></tr>
                    )}
                  </tbody>
                </table>
              </TableCard>
            </div>

            <TableCard title="تجميع حسب نوع العملية">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">نوع العملية</th>
                    <th className="px-4 py-3 text-left">عدد الكتب</th>
                  </tr>
                </thead>
                <tbody>
                  {bookReport.by_operation?.length ? bookReport.by_operation.map((row) => (
                    <tr key={row.operation_type} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.operation_type}</td>
                      <td className="px-4 py-3">{row.books_count}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan="2" className="px-4 py-8 text-center text-slate-500">لا توجد بيانات.</td></tr>
                  )}
                </tbody>
              </table>
            </TableCard>
          </div>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <Navbar onMenuClick={() => setIsMenuOpen(true)} />
      <SlideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl">
          <p className="text-sm text-blue-100 mb-2">Statistics Center</p>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">مركز الإحصائيات والتقارير</h1>
          <p className="text-blue-100 max-w-3xl leading-7">
            تم إعادة تنظيم صفحة الإحصائيات إلى أقسام واضحة: إحصائيات الجهات المزودة، الإحصائيات العامة، تقرير الدفعات، وتقرير الكتب الرسمية.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">تصدير الإحصائيات</h2>
              <p className="text-sm text-slate-500">يمكنك تصدير القسم الحالي كملف Excel أو فتح نسخة جاهزة للحفظ بصيغة PDF.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleExportExcel}
                disabled={exportingExcel}
                className={`rounded-xl px-5 py-3 text-sm font-semibold text-white ${exportingExcel ? 'cursor-not-allowed bg-emerald-300' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {exportingExcel ? 'جاري التصدير...' : 'تصدير Excel'}
              </button>
              <button
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className={`rounded-xl px-5 py-3 text-sm font-semibold text-white ${exportingPdf ? 'cursor-not-allowed bg-rose-300' : 'bg-rose-600 hover:bg-rose-700'}`}
              >
                {exportingPdf ? 'جاري التجهيز...' : 'تصدير PDF'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-2xl px-4 py-4 text-sm sm:text-base font-semibold transition-all border ${
                  activeTab === tab.key
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'providers' && renderProvidersTab()}
        {activeTab === 'general' && renderGeneralTab()}
        {activeTab === 'payments' && renderPaymentsTab()}
        {activeTab === 'books' && renderBooksTab()}
      </main>
      <PageFooter />
    </div>
  );
};

export default StatisticsPage;