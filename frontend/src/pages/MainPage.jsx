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

const getStatusLabel = (status) => {
  if (status === 'active') return 'نشطة';
  if (status === 'inactive') return 'غير نشطة';
  if (status === 'pending') return 'معلقة';
  return status || 'غير معروف';
};

const MainPage = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await fetch(`${API}/organizations`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load organizations');
        }

        setOrganizations(data.organizations || []);
      } catch (err) {
        setError(err.message || 'Something went wrong');
      } finally {
        setLoading(false);
      }
    };

    fetchOrganizations();
  }, []);

  const filteredOrganizations = useMemo(() => organizations.filter((org) => {
    const matchesSearch = org.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' ? true : org.status === filter;
    return matchesSearch && matchesFilter;
  }), [organizations, searchTerm, filter]);

  const stats = useMemo(() => ({
    total: organizations.length,
    active: organizations.filter((org) => org.status === 'active').length,
    inactive: organizations.filter((org) => org.status === 'inactive').length,
    pending: organizations.filter((org) => org.status === 'pending').length,
  }), [organizations]);

  const resetFilters = () => {
    setSearchTerm('');
    setFilter('all');
  };

  return (
    <div className="app-shell">
      <Navbar onMenuClick={() => setIsMenuOpen(true)} />
      <SlideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <main className="page-container space-y-6">
        <section className="page-hero page-reveal">
          <div className="relative z-10 flex flex-col gap-6">
            <div>
              <div className="brand-chip">الواجهة الرئيسية</div>
              <h1 className="hero-title mt-4">الجهات المشتركة</h1>
              <p className="hero-subtitle">عرض العقود والخدمات والدفعات ضمن واجهة أوضح، بمحاذاة موحدة، وفلاتر أسرع.</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="hero-stat-tile"><div className="hero-stat-label">إجمالي الجهات</div><div className="hero-stat-value">{stats.total}</div></div>
              <div className="hero-stat-tile"><div className="hero-stat-label">نشطة</div><div className="hero-stat-value">{stats.active}</div></div>
              <div className="hero-stat-tile"><div className="hero-stat-label">غير نشطة</div><div className="hero-stat-value">{stats.inactive}</div></div>
              <div className="hero-stat-tile"><div className="hero-stat-label">معلقة</div><div className="hero-stat-value">{stats.pending}</div></div>
            </div>
          </div>
        </section>

        <section className="filter-panel page-reveal stagger-1">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
            <div className="flex-1">
              <label className="field-label">البحث</label>
              <input type="text" placeholder="ابحث باسم الجهة..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-modern" />
            </div>

            <div className="w-full xl:w-56">
              <label className="field-label">الحالة</label>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="select-modern">
                <option value="all">كل الجهات</option>
                <option value="active">نشطة</option>
                <option value="inactive">غير نشطة</option>
                <option value="pending">معلقة</option>
              </select>
            </div>

            <div className="w-full xl:w-40">
              <label className="field-label">عدد النتائج</label>
              <div className="input-modern flex items-center justify-between">{filteredOrganizations.length}<span className="text-xs text-slate-400">نتيجة</span></div>
            </div>

            <button type="button" onClick={resetFilters} className="btn-secondary px-4 py-3 text-sm">Reset</button>
          </div>
        </section>

        <section className="surface-card overflow-hidden page-reveal stagger-2">
          <div className="px-6 py-5 border-b border-slate-200/80 bg-slate-50/70 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="section-title text-lg sm:text-xl">قائمة الجهات</h2>
              <p className="section-subtitle">بطاقات أبسط وأوضح للوصول السريع إلى التفاصيل.</p>
            </div>
            <div className="metric-pill">محاذاة موحدة على كامل الصفحة</div>
          </div>

          <div className="p-4 sm:p-5">
            {loading ? (
              <div className="grid gap-4">
                {[1,2,3].map((item) => (
                  <div key={item} className="content-list-card">
                    <div className="space-y-3">
                      <div className="skeleton-line w-1/3" />
                      <div className="skeleton-line w-2/3" />
                      <div className="skeleton-line w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="danger-text">{error}</div>
            ) : filteredOrganizations.length > 0 ? (
              <div className="grid gap-4">
                {filteredOrganizations.map((org, index) => (
                  <div key={org.id} className={`content-list-card page-reveal stagger-${(index % 4) + 1}`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex flex-wrap items-center gap-3">
                          <h3 className="text-lg sm:text-xl font-bold text-slate-900">{org.name}</h3>
                          <span className={getStatusClasses(org.status)}>{getStatusLabel(org.status)}</span>
                        </div>

                        <div className="mb-3 flex flex-wrap gap-2">
                          <span className="metric-pill">الموقع: {org.location || 'غير محدد'}</span>
                          <span className="metric-pill">الهاتف: {org.phone || 'غير متوفر'}</span>
                        </div>

                        <p className="text-sm text-slate-500">عرض العقود والخدمات والدفعات.</p>
                      </div>

                      <div className="flex items-center gap-3 lg:self-stretch">
                        <button onClick={() => navigate(`/detail/${org.id}`)} className="btn-secondary px-4 py-2.5 text-sm whitespace-nowrap">التفاصيل</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">لا توجد جهات مطابقة للبحث الحالي.</div>
            )}
          </div>
        </section>
      </main>
      <PageFooter />
    </div>
  );
};

export default MainPage;
