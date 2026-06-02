import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import SlideMenu from '../components/SlideMenu';
import PageFooter from '../components/PageFooter';

const API = import.meta.env.VITE_API_BASE_URL;

const KIND_OPTIONS = [
  { value: 'all', label: 'الكل' },
  { value: 'activity', label: 'الأنشطة' },
  { value: 'payment', label: 'الدفعات' },
  { value: 'official_book', label: 'الكتب الرسمية' },
  { value: 'service_suspension', label: 'إيقاف الخدمة' },
];

const QUICK_RANGE_OPTIONS = [
  { value: 'all', label: 'كل المدة' },
  { value: 'today', label: 'اليوم' },
  { value: '7days', label: '7 أيام' },
  { value: '30days', label: '30 يوم' },
  { value: '90days', label: '90 يوم' },
];

const HistoryPage = () => {
  const navigate = useNavigate();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [organizationFilter, setOrganizationFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc');
  const [limit, setLimit] = useState(100);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [onlyWithOrganization, setOnlyWithOrganization] = useState(false);
  const [quickRange, setQuickRange] = useState('all');
  const [viewMode, setViewMode] = useState('detailed');
  const [expandedIds, setExpandedIds] = useState({});

  const fetchTimeline = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`${API_BASE}/history/all?limit=${limit}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load history');
      }

      setTimeline(Array.isArray(data.history) ? data.history : []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء تحميل السجل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [limit]);

  const formatDateTime = (value) => {
    if (!value) return '-';
    try {
      const date = new Date(String(value).replace(' ', 'T'));
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ar-IQ');
    } catch {
      return value;
    }
  };

  const formatDateOnly = (value) => {
    if (!value) return '-';
    try {
      const date = new Date(String(value).replace(' ', 'T'));
      return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ar-IQ');
    } catch {
      return value;
    }
  };

  const formatMoney = (value) => {
    const num = Number(value || 0);
    return Number.isFinite(num)
      ? num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
      : '0';
  };

  const normalizeDateForCompare = (value) => {
    if (!value) return null;
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const getEntityLabel = (entityType, kind) => {
    if (kind === 'payment') return 'دفعة';
    if (kind === 'official_book') return 'كتاب رسمي';
    if (kind === 'service_suspension') return 'إيقاف خدمة';

    const map = {
      organization: 'جهة',
      organization_service: 'عقد / خدمة',
      service_item: 'تفصيل خدمة',
      provider_company: 'شركة مزودة',
      provider_subscription: 'اشتراك شركة مزودة',
      service_range: 'رينج خدمة',
      user: 'مستخدم',
    };

    return map[String(entityType || '').toLowerCase()] || entityType || 'غير محدد';
  };

  const getActionLabel = (item) => {
    if (item.kind === 'payment') return 'دفعة مالية';
    if (item.kind === 'official_book') return 'كتاب رسمي / سياسة';
    if (item.kind === 'service_suspension') return 'إيقاف خدمة';

    const action = String(item.action || '').toLowerCase();

    if (action.includes('create') || action.includes('add')) return 'إضافة';
    if (action.includes('update') || action.includes('edit')) return 'تعديل';
    if (action.includes('delete') || action.includes('remove')) return 'حذف';
    if (action.includes('login')) return 'تسجيل دخول';

    return item.action || 'نشاط';
  };

  const getBadgeClass = (item) => {
    if (item.kind === 'payment') return 'bg-purple-50 text-purple-700 border-purple-200';
    if (item.kind === 'official_book') return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    if (item.kind === 'service_suspension') return 'bg-red-50 text-red-700 border-red-200';

    const action = String(item.action || '').toLowerCase();

    if (action.includes('delete') || action.includes('remove')) return 'bg-red-50 text-red-700 border-red-200';
    if (action.includes('create') || action.includes('add')) return 'bg-green-50 text-green-700 border-green-200';
    if (action.includes('update') || action.includes('edit')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (action.includes('login')) return 'bg-blue-50 text-blue-700 border-blue-200';

    return 'bg-slate-50/80 text-slate-700 border-slate-200';
  };

  const getKindTone = (item) => {
    if (item.kind === 'payment') return 'purple';
    if (item.kind === 'official_book') return 'cyan';
    if (item.kind === 'service_suspension') return 'red';

    const action = String(item.action || '').toLowerCase();
    if (action.includes('delete') || action.includes('remove')) return 'red';
    if (action.includes('create') || action.includes('add')) return 'green';
    if (action.includes('update') || action.includes('edit')) return 'amber';
    if (action.includes('login')) return 'blue';
    return 'slate';
  };

  const entityOptions = useMemo(() => {
    const set = new Set();

    timeline.forEach((item) => {
      if (item.kind === 'payment') set.add('payment');
      else if (item.kind === 'official_book') set.add('official_book');
      else if (item.kind === 'service_suspension') set.add('service_suspension');
      else if (item.entity_type) set.add(item.entity_type);
    });

    const options = Array.from(set)
      .sort((a, b) => String(a).localeCompare(String(b), 'ar'))
      .map((value) => ({ value, label: getEntityLabel(value, value) }));

    return [{ value: 'all', label: 'كل الأنواع' }, ...options];
  }, [timeline]);

  const organizationOptions = useMemo(() => {
    const map = new Map();
    timeline.forEach((item) => {
      if (item.organization_id && item.organization_name) {
        map.set(String(item.organization_id), item.organization_name);
      }
    });

    return [
      { value: 'all', label: 'كل الجهات' },
      ...Array.from(map.entries())
        .sort((a, b) => a[1].localeCompare(b[1], 'ar'))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [timeline]);

  const serviceOptions = useMemo(() => {
    const set = new Set();
    timeline.forEach((item) => {
      if (item.service_type) set.add(item.service_type);
    });

    return [
      { value: 'all', label: 'كل الخدمات' },
      ...Array.from(set)
        .sort((a, b) => String(a).localeCompare(String(b), 'ar'))
        .map((value) => ({ value, label: value })),
    ];
  }, [timeline]);

  const userOptions = useMemo(() => {
    const set = new Set();
    timeline.forEach((item) => {
      if (item.username) set.add(item.username);
    });

    return [
      { value: 'all', label: 'كل المستخدمين' },
      ...Array.from(set)
        .sort((a, b) => String(a).localeCompare(String(b), 'ar'))
        .map((value) => ({ value, label: value })),
    ];
  }, [timeline]);

  const getQuickRangeStartDate = (range) => {
    if (range === 'all') return null;
    const now = new Date();
    const start = new Date(now);

    if (range === 'today') {
      start.setHours(0, 0, 0, 0);
      return start;
    }
    if (range === '7days') start.setDate(start.getDate() - 7);
    if (range === '30days') start.setDate(start.getDate() - 30);
    if (range === '90days') start.setDate(start.getDate() - 90);

    start.setHours(0, 0, 0, 0);
    return start;
  };

  const filteredTimeline = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const quickStart = getQuickRangeStartDate(quickRange);

    let result = timeline.filter((item) => {
      const matchesKind = kindFilter === 'all' ? true : item.kind === kindFilter;

      const itemEntityValue =
        item.kind === 'payment'
          ? 'payment'
          : item.kind === 'official_book'
            ? 'official_book'
            : item.kind === 'service_suspension'
              ? 'service_suspension'
              : item.entity_type || '';

      const matchesEntity = entityFilter === 'all' ? true : itemEntityValue === entityFilter;
      const matchesOrganization =
        organizationFilter === 'all' ? true : String(item.organization_id || '') === organizationFilter;
      const matchesService = serviceFilter === 'all' ? true : String(item.service_type || '') === serviceFilter;
      const matchesUser = userFilter === 'all' ? true : String(item.username || '') === userFilter;
      const matchesLinkedOrganization = onlyWithOrganization ? Boolean(item.organization_id) : true;

      const haystack = [
        item.kind,
        item.action,
        item.entity_type,
        item.details,
        item.username,
        item.organization_name,
        item.service_type,
        item.entity_id,
        item.service_id,
        item.payment_amount,
        item.payment_date,
        item.operation_type,
        item.official_book_date,
        item.official_book_description,
        item.suspension_date,
        item.refund_amount,
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !term || haystack.includes(term);

      const itemDate = normalizeDateForCompare(item.created_at);
      const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
      const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

      const matchesQuickRange = quickStart ? (itemDate ? itemDate >= quickStart : false) : true;
      const matchesFrom = from ? (itemDate ? itemDate >= from : false) : true;
      const matchesTo = to ? (itemDate ? itemDate <= to : false) : true;

      return (
        matchesKind &&
        matchesEntity &&
        matchesOrganization &&
        matchesService &&
        matchesUser &&
        matchesLinkedOrganization &&
        matchesSearch &&
        matchesQuickRange &&
        matchesFrom &&
        matchesTo
      );
    });

    result = [...result].sort((a, b) => {
      const dateA = normalizeDateForCompare(a.created_at)?.getTime() || 0;
      const dateB = normalizeDateForCompare(b.created_at)?.getTime() || 0;
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [
    timeline,
    searchTerm,
    kindFilter,
    entityFilter,
    organizationFilter,
    serviceFilter,
    userFilter,
    sortOrder,
    fromDate,
    toDate,
    onlyWithOrganization,
    quickRange,
  ]);

  const groupedTimeline = useMemo(() => {
    const groups = [];
    let lastKey = null;

    filteredTimeline.forEach((item) => {
      const dateKey = formatDateOnly(item.created_at);
      if (dateKey !== lastKey) {
        groups.push({ dateKey, items: [item] });
        lastKey = dateKey;
      } else {
        groups[groups.length - 1].items.push(item);
      }
    });

    return groups;
  }, [filteredTimeline]);

  const stats = useMemo(() => {
    const payments = filteredTimeline.filter((item) => item.kind === 'payment');
    const officialBooks = filteredTimeline.filter((item) => item.kind === 'official_book');
    const suspensions = filteredTimeline.filter((item) => item.kind === 'service_suspension');
    const activities = filteredTimeline.filter((item) => item.kind === 'activity');

    const paymentTotal = payments.reduce((sum, item) => sum + Number(item.payment_amount || 0), 0);
    const refundTotal = suspensions.reduce((sum, item) => sum + Number(item.refund_amount || 0), 0);

    const contractCreations = filteredTimeline.filter(
      (item) =>
        item.kind === 'activity' &&
        String(item.entity_type || '').toLowerCase() === 'organization_service' &&
        String(item.action || '').toLowerCase().includes('create')
    ).length;

    const linkedOrganizations = new Set(
      filteredTimeline.map((item) => item.organization_id).filter(Boolean)
    ).size;

    return {
      total: filteredTimeline.length,
      payments: payments.length,
      paymentTotal,
      refundTotal,
      officialBooks: officialBooks.length,
      suspensions: suspensions.length,
      activities: activities.length,
      contractCreations,
      linkedOrganizations,
    };
  }, [filteredTimeline]);

  const activeFilterCount = useMemo(() => {
    return [
      searchTerm,
      kindFilter !== 'all',
      entityFilter !== 'all',
      organizationFilter !== 'all',
      serviceFilter !== 'all',
      userFilter !== 'all',
      sortOrder !== 'desc',
      fromDate,
      toDate,
      onlyWithOrganization,
      quickRange !== 'all',
    ].filter(Boolean).length;
  }, [
    searchTerm,
    kindFilter,
    entityFilter,
    organizationFilter,
    serviceFilter,
    userFilter,
    sortOrder,
    fromDate,
    toDate,
    onlyWithOrganization,
    quickRange,
  ]);

  const clearFilters = () => {
    setSearchTerm('');
    setKindFilter('all');
    setEntityFilter('all');
    setOrganizationFilter('all');
    setServiceFilter('all');
    setUserFilter('all');
    setSortOrder('desc');
    setFromDate('');
    setToDate('');
    setOnlyWithOrganization(false);
    setQuickRange('all');
  };

  const goToOrganization = (item) => {
    if (item.organization_id) {
      navigate(`/detail/${item.organization_id}`);
    }
  };

  const toggleExpanded = (item) => {
    const key = `${item.kind}-${item.id}-${item.created_at}`;
    setExpandedIds((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isExpanded = (item) => Boolean(expandedIds[`${item.kind}-${item.id}-${item.created_at}`]);

  const getSummaryLine = (item) => {
    if (item.kind === 'payment') {
      return `تم تسجيل دفعة بمبلغ ${formatMoney(item.payment_amount)} للجهة ${item.organization_name || '-'} على خدمة ${item.service_type || '-'}`;
    }
    if (item.kind === 'official_book') {
      return item.official_book_description || `تم توثيق كتاب رسمي مرتبط بـ ${item.organization_name || 'سجل عام'}`;
    }
    if (item.kind === 'service_suspension') {
      return `تم إيقاف خدمة ${item.service_type || '-'}${item.organization_name ? ` للجهة ${item.organization_name}` : ''}`;
    }
    return item.details || `${getActionLabel(item)} على ${getEntityLabel(item.entity_type, item.kind)}`;
  };

  const renderRecordBody = (item) => {
    const commonTop = (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {item.kind !== 'activity' ? (
          <InfoBox label="الجهة" value={item.organization_name || '-'} />
        ) : (
          <InfoBox label="نوع العملية" value={getActionLabel(item)} />
        )}
        <InfoBox label="نوع السجل" value={getEntityLabel(item.entity_type, item.kind)} />
        <InfoBox label="نوع الخدمة" value={item.service_type || '-'} />
        <InfoBox label="المستخدم" value={item.username || '-'} />
        <InfoBox label="رقم السجل" value={item.entity_id ?? item.service_id ?? '-'} />
        <InfoBox label="رقم العملية" value={item.id ?? '-'} />
        <InfoBox label="وقت التسجيل" value={formatDateTime(item.created_at)} />
        {item.kind === 'payment' ? (
          <InfoBox label="المبلغ" value={formatMoney(item.payment_amount)} highlight tone="purple" />
        ) : item.kind === 'service_suspension' ? (
          <InfoBox label="المبلغ الراجع" value={formatMoney(item.refund_amount)} highlight tone="red" />
        ) : item.kind === 'official_book' ? (
          <InfoBox label="تاريخ الكتاب" value={formatDateOnly(item.official_book_date)} highlight tone="cyan" />
        ) : (
          <InfoBox label="الجهة" value={item.organization_name || '-'} />
        )}
      </div>
    );

    const detailTone = item.kind === 'payment' ? 'purple' : item.kind === 'official_book' ? 'cyan' : item.kind === 'service_suspension' ? 'red' : 'slate';
    const detailTitle = item.kind === 'payment' ? 'تفاصيل الدفعة' : item.kind === 'official_book' ? 'وصف الكتاب الرسمي' : item.kind === 'service_suspension' ? 'تفاصيل الإيقاف' : 'التفاصيل';
    const detailText = item.kind === 'official_book' ? item.official_book_description || item.details : item.details;

    return (
      <div className="space-y-4">
        {commonTop}
        <DetailPanel title={detailTitle} tone={detailTone}>
          {detailText || 'لا توجد تفاصيل إضافية'}
        </DetailPanel>

        {item.organization_id ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => goToOrganization(item)}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition"
            >
              فتح الجهة
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="app-shell">
      <Navbar onMenuClick={() => setIsMenuOpen(true)} />
      <SlideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <main className="page-container space-y-6">
        <section className="page-hero">
          <div className="relative z-10 flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5 mb-6">
            <div className="max-w-3xl">
              <div className="brand-chip mb-4">
                سجل موحد لكل العمليات
              </div>
              <h1 className="hero-title">السجل والتتبع</h1>
              <p className="hero-subtitle">
                صفحة متابعة أوضح وأسهل. تعرض الدفعات، التعديلات، الكتب الرسمية، إنشاء العقود، وعمليات إيقاف الخدمة مع فلاتر أدق وملخصات أسرع.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={fetchTimeline}
                className="btn-secondary px-5 py-3 text-sm"
              >
                تحديث البيانات
              </button>

              <button
                onClick={clearFilters}
                className="btn-secondary px-5 py-3 text-sm"
              >
                تصفير الفلاتر
              </button>
            </div>
          </div>

          <div className="relative grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8 gap-3">
            <StatCard title="إجمالي السجلات" value={stats.total} tone="blue" />
            <StatCard title="عدد الدفعات" value={stats.payments} tone="purple" />
            <StatCard title="إجمالي الدفعات" value={formatMoney(stats.paymentTotal)} tone="green" />
            <StatCard title="العقود المنشأة" value={stats.contractCreations} tone="amber" />
            <StatCard title="الكتب الرسمية" value={stats.officialBooks} tone="cyan" />
            <StatCard title="الإيقافات" value={stats.suspensions} tone="red" />
            <StatCard title="المبالغ الراجعة" value={formatMoney(stats.refundTotal)} tone="rose" />
            <StatCard title="الجهات الظاهرة" value={stats.linkedOrganizations} tone="slate" />
          </div>
        </section>

        <section className="filter-panel">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">الفلاتر والبحث</h2>
              <p className="text-sm text-slate-500 mt-1">استخدم أكثر من فلتر للوصول بسرعة إلى السجل المطلوب.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-sm font-medium">
                الفلاتر النشطة: {activeFilterCount}
              </span>

              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('detailed')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    viewMode === 'detailed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  عرض مفصل
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('compact')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    viewMode === 'compact' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  عرض مختصر
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-5">
            {KIND_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setKindFilter(option.value)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition border ${
                  kindFilter === option.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4 mb-4">
            <div className="xl:col-span-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">البحث العام</label>
              <input
                type="text"
                placeholder="ابحث عن جهة، خدمة، مستخدم، مبلغ، تفاصيل..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-modern"
              />
            </div>

            <FilterSelect
              label="نوع السجل"
              value={entityFilter}
              onChange={setEntityFilter}
              options={entityOptions}
              className="xl:col-span-2"
            />

            <FilterSelect
              label="الجهة"
              value={organizationFilter}
              onChange={setOrganizationFilter}
              options={organizationOptions}
              className="xl:col-span-2"
            />

            <FilterSelect
              label="الخدمة"
              value={serviceFilter}
              onChange={setServiceFilter}
              options={serviceOptions}
              className="xl:col-span-2"
            />

            <FilterSelect
              label="المستخدم"
              value={userFilter}
              onChange={setUserFilter}
              options={userOptions}
              className="xl:col-span-2"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
            <FilterSelect
              label="الترتيب"
              value={sortOrder}
              onChange={setSortOrder}
              options={[
                { value: 'desc', label: 'الأحدث أولاً' },
                { value: 'asc', label: 'الأقدم أولاً' },
              ]}
              className="xl:col-span-2"
            />

            <FilterSelect
              label="عدد السجلات المحمّلة"
              value={String(limit)}
              onChange={(value) => setLimit(Number(value))}
              options={[
                { value: '50', label: '50' },
                { value: '100', label: '100' },
                { value: '200', label: '200' },
                { value: '500', label: '500' },
              ]}
              className="xl:col-span-2"
            />

            <div className="xl:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-2">من تاريخ</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="input-modern"
              />
            </div>

            <div className="xl:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-2">إلى تاريخ</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="input-modern"
              />
            </div>

            <div className="xl:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">مدى سريع</label>
              <select
                value={quickRange}
                onChange={(e) => setQuickRange(e.target.value)}
                className="input-modern"
              >
                {QUICK_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyWithOrganization}
                onChange={(e) => setOnlyWithOrganization(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
              عرض السجلات المرتبطة بجهة فقط
            </label>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                النتائج الحالية: {filteredTimeline.length}
              </span>
              <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                الأيام الظاهرة: {groupedTimeline.length}
              </span>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-[28px] shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 sm:px-7 py-5 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">الخط الزمني</h2>
              <p className="text-sm text-slate-500 mt-1">السجلات مرتبة حسب اليوم لتسهيل التتبع والمراجعة.</p>
            </div>

            <div className="text-sm text-slate-500">
              عرض {filteredTimeline.length} من أصل {timeline.length}
            </div>
          </div>

          {loading ? (
            <div className="px-6 sm:px-8 py-16 text-center text-slate-500">جاري تحميل السجل...</div>
          ) : error ? (
            <div className="px-6 sm:px-8 py-16 text-center">
              <div className="inline-flex items-center justify-center px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-700">
                {error}
              </div>
            </div>
          ) : filteredTimeline.length === 0 ? (
            <div className="px-6 sm:px-8 py-16 text-center text-slate-500">لا توجد نتائج مطابقة للفلاتر الحالية.</div>
          ) : (
            <div className="p-4 sm:p-6 space-y-6">
              {groupedTimeline.map((group) => (
                <div key={group.dateKey} className="space-y-3">
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-100/90 backdrop-blur border border-slate-200">
                    <div className="text-sm sm:text-base font-bold text-slate-900">{group.dateKey}</div>
                    <div className="text-xs sm:text-sm text-slate-500">عدد السجلات: {group.items.length}</div>
                  </div>

                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const expanded = isExpanded(item);
                      const tone = getKindTone(item);
                      const summary = getSummaryLine(item);

                      return (
                        <article
                          key={`${item.kind}-${item.id}-${item.created_at}`}
                          className="rounded-3xl border border-slate-200 bg-white overflow-hidden hover:shadow-md transition"
                        >
                          <div className="p-4 sm:p-5">
                            <div className="flex flex-col gap-4">
                              <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
                                <div className="space-y-3 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getBadgeClass(item)}`}>
                                      {getActionLabel(item)}
                                    </span>

                                    <span className="px-3 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                      {getEntityLabel(item.entity_type, item.kind)}
                                    </span>

                                    {item.organization_name ? (
                                      <span className="px-3 py-1 text-xs font-medium rounded-full bg-white text-slate-700 border border-slate-200">
                                        {item.organization_name}
                                      </span>
                                    ) : null}

                                    {item.service_type ? (
                                      <span className="px-3 py-1 text-xs font-medium rounded-full bg-white text-slate-700 border border-slate-200">
                                        {item.service_type}
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="text-sm sm:text-base text-slate-800 leading-7 break-words">{summary}</div>
                                </div>

                                <div className="flex flex-col sm:flex-row xl:flex-col items-start sm:items-center xl:items-end gap-2 shrink-0">
                                  <div className="text-sm text-slate-500">{formatDateTime(item.created_at)}</div>
                                  <button
                                    type="button"
                                    onClick={() => toggleExpanded(item)}
                                    className={`px-4 py-2 text-sm font-medium rounded-xl border transition ${toneButtonClass(tone, expanded)}`}
                                  >
                                    {viewMode === 'compact' && !expanded ? 'عرض التفاصيل' : expanded ? 'إخفاء التفاصيل' : 'التفاصيل'}
                                  </button>
                                </div>
                              </div>

                              {(viewMode === 'detailed' || expanded) && renderRecordBody(item)}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <PageFooter />
    </div>
  );
};

const FilterSelect = ({ label, value, onChange, options, className = '' }) => (
  <div className={className}>
    <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input-modern"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

const InfoBox = ({ label, value, highlight = false, tone = 'green' }) => {
  const tones = {
    green: 'bg-green-50 border-green-200 text-green-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    cyan: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  };

  return (
    <div className={`rounded-2xl border p-4 ${highlight ? tones[tone] || tones.green : 'bg-white border-slate-200'}`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-sm font-semibold break-words ${highlight ? '' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
};

const DetailPanel = ({ title, tone = 'slate', children }) => {
  const tones = {
    slate: 'bg-slate-50 border-slate-200 text-slate-800',
    purple: 'bg-purple-50 border-purple-100 text-purple-800',
    cyan: 'bg-cyan-50 border-cyan-100 text-cyan-800',
    red: 'bg-red-50 border-red-100 text-red-800',
  };

  const panelClass = tones[tone] || tones.slate;

  return (
    <div className={`rounded-2xl border p-4 ${panelClass}`}>
      <div className="text-sm font-semibold mb-2">{title}</div>
      <div className="text-sm whitespace-pre-wrap break-words text-slate-700">{children}</div>
    </div>
  );
};

const StatCard = ({ title, value, tone = 'blue' }) => {
  const toneClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    cyan: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
    slate: 'bg-slate-100 border-slate-200 text-slate-700',
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone] || toneClasses.blue}`}>
      <div className="text-sm opacity-80 mb-1">{title}</div>
      <div className="text-2xl font-bold break-words">{value}</div>
    </div>
  );
};

const toneButtonClass = (tone, active) => {
  const tones = {
    blue: active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
    purple: active ? 'bg-purple-600 border-purple-600 text-white' : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
    green: active ? 'bg-green-600 border-green-600 text-white' : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100',
    amber: active ? 'bg-amber-500 border-amber-500 text-white' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
    red: active ? 'bg-red-600 border-red-600 text-white' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',
    cyan: active ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100',
    slate: active ? 'bg-slate-700 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
  };

  return tones[tone] || tones.slate;
};

export default HistoryPage;
