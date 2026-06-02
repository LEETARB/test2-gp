import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import SlideMenu from '../components/SlideMenu';
import PageFooter from '../components/PageFooter';

const API = import.meta.env.VITE_API_BASE_URL;

const getStatusClasses = (status) => {
  if (status === 'active') return 'status-badge status-active';
  if (status === 'inactive') return 'status-badge status-inactive';
  return 'status-badge status-pending';
};

const AddPage = () => {
  const navigate = useNavigate();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await fetch(`${API}/organizations`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'فشل تحميل الجهات');
      }

      setOrganizations(data.organizations || []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء تحميل الجهات');
    } finally {
      setLoading(false);
    }
  };

  const filteredOrganizations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return organizations;

    return organizations.filter((org) => {
      const name = String(org.name || '').toLowerCase();
      const phone = String(org.phone || '').toLowerCase();
      const address = String(org.address || '').toLowerCase();
      const location = String(org.location || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || address.includes(q) || location.includes(q);
    });
  }, [organizations, search]);

  const handleSelectOrganization = (org) => {
    navigate('/new-contract', {
      state: {
        organizationId: org.id,
        organizationName: org.name,
        organization: org,
      },
    });
  };

  return (
    <div className="app-shell">
      <Navbar onMenuClick={() => setIsMenuOpen(true)} />
      <SlideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <main className="page-container space-y-6">
        <section className="page-hero">
          <div className="relative z-10 flex flex-col gap-6">
            <div>
              <div className="brand-chip">العقود</div>
              <h1 className="hero-title mt-4">إضافة عقد جديد</h1>
              <p className="hero-subtitle">اختر الجهة أولاً، ثم انتقل إلى إنشاء العقد ضمن نفس القالب البصري لبقية الصفحات.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="hero-stat-tile">
                <div className="hero-stat-label">الجهات المتاحة</div>
                <div className="hero-stat-value">{filteredOrganizations.length}</div>
              </div>
              <div className="hero-stat-tile">
                <div className="hero-stat-label">إجراءات سريعة</div>
                <div className="mt-2 text-base sm:text-lg font-semibold text-white">اختيار الجهة ثم إنشاء العقد</div>
              </div>
            </div>
          </div>
        </section>

        <section className="filter-panel">
          <div className="grid lg:grid-cols-[1fr_auto] gap-4 items-end">
            <div>
              <label className="field-label">البحث عن جهة</label>
              <input
                type="text"
                placeholder="ابحث بالاسم أو الهاتف أو الموقع..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-modern"
              />
            </div>

            <div className="flex gap-3 flex-wrap">
              <button type="button" onClick={loadOrganizations} className="btn-primary">
                تحديث
              </button>
              <button type="button" onClick={() => navigate('/main')} className="btn-secondary">
                رجوع
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">{error}</div>
          )}
        </section>

        {loading ? (
          <section className="surface-card p-12 text-center text-slate-500 text-lg">جاري تحميل الجهات...</section>
        ) : filteredOrganizations.length === 0 ? (
          <section className="surface-card p-12 text-center">
            <div className="text-slate-500 text-lg mb-3">لا توجد جهات مطابقة</div>
            {organizations.length === 0 && (
              <div className="text-sm text-slate-400">تأكد أولاً من وجود بيانات في جدول organizations</div>
            )}
          </section>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredOrganizations.map((org) => (
              <article key={org.id} className="content-list-card">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{org.name || 'بدون اسم'}</h2>
                    <div className="mt-2 flex flex-wrap gap-2"><span className="metric-pill">الموقع: {org.location || 'غير محدد'}</span><span className="metric-pill">الهاتف: {org.phone || 'غير متوفر'}</span></div>
                  </div>
                  <span className={getStatusClasses(org.status)}>{org.status || 'unknown'}</span>
                </div>

                <p className="mb-5 text-sm text-slate-500">اختيار الجهة للانتقال المباشر إلى إنشاء العقد أو مراجعة تفاصيلها.</p>

                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => handleSelectOrganization(org)} className="btn-success px-4 py-2.5 text-sm">
                    اختيار
                  </button>
                  <button type="button" onClick={() => navigate(`/detail/${org.id}`)} className="btn-secondary px-4 py-2.5 text-sm">
                    التفاصيل
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
      <PageFooter />
    </div>
  );
};

export default AddPage;