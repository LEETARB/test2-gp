import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import SlideMenu from '../components/SlideMenu';
import PageFooter from '../components/PageFooter';
import { getUser, getAuthHeaders } from '../utils/auth';

const API = import.meta.env.VITE_API_BASE_URL;

const emptyForm = {
  name: '',
  phone: '',
  location: '',
  address: '',
  status: 'active',
  notes: '',
};

const statusMap = {
  active: { label: 'نشطة', cls: 'status-badge status-active' },
  inactive: { label: 'غير نشطة', cls: 'status-badge status-inactive' },
  pending: { label: 'معلقة', cls: 'status-badge status-pending' },
};

const UserOrganizationsPage = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [addForm, setAddForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const user = getUser();

  const loadOrganizations = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API}/organizations`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'فشل تحميل الجهات');
      }

      setOrganizations(data.organizations || []);
    } catch (err) {
      setOrganizations([]);
      setError(err.message || 'خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrganizations();
  }, []);

  const summary = useMemo(() => ({
    total: organizations.length,
    active: organizations.filter((org) => org.status === 'active').length,
    inactive: organizations.filter((org) => org.status === 'inactive').length,
    pending: organizations.filter((org) => org.status === 'pending').length,
  }), [organizations]);

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (user.role !== 'user') {
    return <Navigate to="/admin" replace />;
  }

  const handleAdd = async () => {
    if (!addForm.name.trim()) {
      setError('اسم الجهة مطلوب');
      return;
    }

    setError('');

    try {
      const res = await fetch(`${API}/organizations`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(addForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'فشل الحفظ');
        return;
      }

      setAddForm(emptyForm);
      setShowAddForm(false);
      setEditingId(null);
      await loadOrganizations();
    } catch {
      setError('خطأ في الاتصال');
    }
  };

  const startEdit = (org) => {
    setEditingId(org.id);
    setEditForm({
      name: org.name || '',
      phone: org.phone || '',
      location: org.location || '',
      address: org.address || '',
      status: org.status || 'active',
      notes: org.notes || '',
    });
    setError('');
  };

  const handleSave = async () => {
    if (!editForm.name.trim()) {
      setError('اسم الجهة مطلوب');
      return;
    }

    setError('');

    try {
      const res = await fetch(`${API}/organizations/${editingId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'فشل التحديث');
        return;
      }

      setEditingId(null);
      await loadOrganizations();
    } catch {
      setError('خطأ في الاتصال');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الجهة؟')) {
      return;
    }

    setError('');

    try {
      const res = await fetch(`${API}/organizations/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'فشل الحذف');
        return;
      }

      await loadOrganizations();
    } catch {
      setError('خطأ في الاتصال');
    }
  };

  return (
    <div className="app-shell">
      <Navbar onMenuClick={() => setIsMenuOpen(true)} />
      <SlideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <main className="page-container space-y-6">
        <section className="page-hero page-reveal">
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <div className="brand-chip border-white/20 bg-white/10 text-white">واجهة المستخدم</div>
              <h1 className="hero-title mt-4">إدارة الجهات</h1>
              <p className="hero-subtitle">إضافة الجهات وتعديلها وحذفها ضمن نفس الهوية البصرية لبقية النظام.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-full lg:min-w-[460px]">
              <div className="hero-stat-tile">
                <div className="hero-stat-label">الإجمالي</div>
                <div className="hero-stat-value">{summary.total}</div>
              </div>
              <div className="hero-stat-tile">
                <div className="hero-stat-label">نشطة</div>
                <div className="hero-stat-value">{summary.active}</div>
              </div>
              <div className="hero-stat-tile">
                <div className="hero-stat-label">غير نشطة</div>
                <div className="hero-stat-value">{summary.inactive}</div>
              </div>
              <div className="hero-stat-tile">
                <div className="hero-stat-label">معلقة</div>
                <div className="hero-stat-value">{summary.pending}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="surface-card p-6 sm:p-7 page-reveal stagger-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <h2 className="section-title text-xl">قائمة الجهات</h2>
              <p className="section-subtitle">إدارة أبسط وبطاقة موحدة لكل جهة.</p>
            </div>
            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                setError('');
              }}
              className="btn-primary px-4 py-2.5 text-sm"
            >
              {showAddForm ? 'إخفاء النموذج' : 'إضافة جهة'}
            </button>
          </div>

          {error && <div className="danger-text mb-4">{error}</div>}

          {showAddForm && (
            <div className="soft-panel mb-5 page-reveal stagger-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  placeholder="اسم الجهة"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="input-modern"
                />
                <input
                  placeholder="رقم الهاتف"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  className="input-modern"
                />
                <input
                  placeholder="الموقع"
                  value={addForm.location}
                  onChange={(e) => setAddForm({ ...addForm, location: e.target.value })}
                  className="input-modern"
                />
                <input
                  placeholder="العنوان"
                  value={addForm.address}
                  onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                  className="input-modern"
                />
                <select
                  value={addForm.status}
                  onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
                  className="select-modern"
                >
                  <option value="active">نشطة</option>
                  <option value="inactive">غير نشطة</option>
                  <option value="pending">معلقة</option>
                </select>
                <input
                  placeholder="ملاحظات"
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  className="input-modern"
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={handleAdd} className="btn-primary px-4 py-2.5 text-sm">حفظ</button>
                <button
                  onClick={() => {
                    setAddForm(emptyForm);
                    setShowAddForm(false);
                  }}
                  className="btn-secondary px-4 py-2.5 text-sm"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="empty-state">جاري التحميل...</div>
          ) : organizations.length === 0 ? (
            <div className="empty-state">لا توجد جهات حالياً.</div>
          ) : (
            <div className="grid gap-4">
              {organizations.map((org, index) => {
                const statusInfo = statusMap[org.status] || statusMap.pending;

                return (
                  <div key={org.id} className={`content-list-card page-reveal stagger-${(index % 4) + 1}`}>
                    {editingId === org.id ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="input-modern"
                          placeholder="اسم الجهة"
                        />
                        <input
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                          className="input-modern"
                          placeholder="الهاتف"
                        />
                        <input
                          value={editForm.location}
                          onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                          className="input-modern"
                          placeholder="الموقع"
                        />
                        <input
                          value={editForm.address}
                          onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                          className="input-modern"
                          placeholder="العنوان"
                        />
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          className="select-modern"
                        >
                          <option value="active">نشطة</option>
                          <option value="inactive">غير نشطة</option>
                          <option value="pending">معلقة</option>
                        </select>
                        <input
                          value={editForm.notes}
                          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                          className="input-modern"
                          placeholder="ملاحظات"
                        />
                        <div className="md:col-span-2 flex flex-wrap gap-3">
                          <button onClick={handleSave} className="btn-success px-4 py-2.5 text-sm">حفظ التعديلات</button>
                          <button onClick={() => setEditingId(null)} className="btn-secondary px-4 py-2.5 text-sm">إلغاء</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="space-y-3 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-lg font-bold text-slate-900">{org.name}</h3>
                            <span className={statusInfo.cls}>{statusInfo.label}</span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <span className="metric-pill">الهاتف: {org.phone || '—'}</span>
                            <span className="metric-pill">الموقع: {org.location || '—'}</span>
                            <span className="metric-pill">العنوان: {org.address || '—'}</span>
                          </div>

                          {org.notes ? (
                            <p className="text-sm text-slate-500">ملاحظات: {org.notes}</p>
                          ) : (
                            <p className="text-sm text-slate-400">لا توجد ملاحظات مسجلة لهذه الجهة.</p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            onClick={() => startEdit(org)}
                            className="btn-secondary px-4 py-2.5 text-sm"
                          >
                            تعديل
                          </button>
                          <button
                            onClick={() => handleDelete(org.id)}
                            className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 hover:-translate-y-0.5"
                          >
                            حذف
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <PageFooter />
    </div>
  );
};

export default UserOrganizationsPage;
