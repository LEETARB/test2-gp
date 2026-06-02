import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import SlideMenu from '../components/SlideMenu';
import PageFooter from '../components/PageFooter';
import PriceHistoryDropdown from '../components/PriceHistoryDropdown';

const API = import.meta.env.VITE_API_BASE_URL;

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
};

const getAuthHeaders = () => {
  const user = getCurrentUser();
  return {
    'Content-Type': 'application/json',
    'X-User-Id': user?.id ? String(user.id) : '',
  };
};

const OrganizationsSection = () => {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    location: '',
    address: '',
    status: 'active',
    notes: '',
  });
  const [addForm, setAddForm] = useState({
    name: '',
    phone: '',
    location: '',
    address: '',
    status: 'active',
    notes: '',
  });
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/organizations`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'فشل تحميل الجهات');

      setOrganizations(data.organizations || []);
    } catch (e) {
      setOrganizations([]);
      setError(e.message || 'خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    if (!addForm.name?.trim()) {
      setError('اسم الجهة مطلوب');
      return;
    }

    setError('');
    try {
      const res = await fetch(`${API}/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'فشل الحفظ');
        return;
      }

      setAddForm({
        name: '',
        phone: '',
        location: '',
        address: '',
        status: 'active',
        notes: '',
      });
      setShowAddForm(false);
      load();
    } catch (e) {
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
  };

  const handleSave = async () => {
    if (!editForm.name?.trim()) {
      setError('اسم الجهة مطلوب');
      return;
    }

    setError('');
    try {
      const res = await fetch(`${API}/organizations/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'فشل التحديث');
        return;
      }

      setEditingId(null);
      load();
    } catch (e) {
      setError('خطأ في الاتصال');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الجهة؟')) return;

    setError('');
    try {
      const res = await fetch(`${API}/organizations/${id}`, {
        method: 'DELETE',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'فشل الحذف');
        return;
      }

      load();
    } catch (e) {
      setError('خطأ في الاتصال');
    }
  };

  return (
    <div className="surface-card p-6 sm:p-7 page-reveal">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-900">إدارة الجهات</h2>
        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setError('');
          }}
          className="btn-primary px-4 py-2.5 text-sm"
        >
          إضافة جهة
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {showAddForm && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50/80 rounded-[22px] border border-slate-200 mb-4">
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
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="pending">pending</option>
          </select>
          <input
            placeholder="ملاحظات"
            value={addForm.notes}
            onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
            className="input-modern"
          />
          <div className="md:col-span-2">
            <button
              onClick={handleAdd}
              className="btn-primary px-4 py-2.5 text-sm"
            >
              حفظ
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 py-4">جاري التحميل...</p>
      ) : organizations.length === 0 ? (
        <p className="text-slate-500 py-4">لا توجد جهات</p>
      ) : (
        <ul className="space-y-3">
          {organizations.map((org) => (
            <li key={org.id} className="content-list-card">
              {editingId === org.id ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                    className="input-modern bg-white"
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                    <option value="pending">pending</option>
                  </select>
                  <input
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="input-modern"
                    placeholder="ملاحظات"
                  />
                  <div className="md:col-span-2 flex gap-2">
                    <button
                      onClick={handleSave}
                      className="btn-success px-4 py-2.5 text-sm"
                    >
                      حفظ التعديلات
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="btn-secondary px-4 py-2.5 text-sm"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-bold text-slate-900">{org.name}</p>
                    <p className="text-sm text-slate-500">
                      الهاتف: {org.phone || '—'} | الموقع: {org.location || '—'}
                    </p>
                    <p className="text-sm text-slate-500">
                      الحالة: {org.status || '—'} | العنوان: {org.address || '—'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(org)}
                      className="px-3 py-2 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                    >
                      تعديل
                    </button>
                    <button
                      onClick={() => handleDelete(org.id)}
                      className="px-3 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const CompaniesSection = ({ onDetails }) => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [addForm, setAddForm] = useState({
    name: '',
    phone: '',
    address: '',
    email: '',
    is_active: true,
  });
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    address: '',
    email: '',
    is_active: true,
  });
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/provider-companies`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'فشل تحميل الشركات');

      setCompanies(data.provider_companies || []);
    } catch (e) {
      setCompanies([]);
      setError(e.message || 'خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAddCompany = async () => {
    if (!addForm.name.trim()) {
      setError('اسم الشركة مطلوب');
      return;
    }

    setError('');
    try {
      const res = await fetch(`${API}/provider-companies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'فشل الحفظ');
        return;
      }

      setAddForm({
        name: '',
        phone: '',
        address: '',
        email: '',
        is_active: true,
      });
      setShowAddForm(false);
      load();
    } catch (e) {
      setError('خطأ في الاتصال');
    }
  };

  const startEdit = (company) => {
    setEditingId(company.id);
    setEditForm({
      name: company.name || '',
      phone: company.phone || '',
      address: company.address || '',
      email: company.email || '',
      is_active: Boolean(company.is_active),
    });
  };

  const handleSaveCompany = async () => {
    if (!editForm.name.trim()) {
      setError('اسم الشركة مطلوب');
      return;
    }

    setError('');
    try {
      const res = await fetch(`${API}/provider-companies/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'فشل التحديث');
        return;
      }

      setEditingId(null);
      load();
    } catch (e) {
      setError('خطأ في الاتصال');
    }
  };

  const handleDeleteCompany = async (company) => {
    if (!window.confirm(`هل أنت متأكد من حذف "${company.name}"؟ سيتم حذف كل اشتراكاتها أيضاً.`)) {
      return;
    }

    setError('');
    try {
      const res = await fetch(`${API}/provider-companies/${company.id}`, {
        method: 'DELETE',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'فشل الحذف');
        return;
      }

      load();
    } catch (e) {
      setError('خطأ في الاتصال');
    }
  };

  return (
    <div className="surface-card p-6 sm:p-7 page-reveal">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-900">شركات مقدمة الخدمة</h2>
        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setError('');
          }}
          className="btn-primary px-4 py-2.5 text-sm"
        >
          إضافة شركة
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {showAddForm && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50/80 rounded-[22px] border border-slate-200 mb-4">
          <input
            placeholder="اسم الشركة"
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
            placeholder="العنوان"
            value={addForm.address}
            onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
            className="input-modern"
          />
          <input
            placeholder="البريد الإلكتروني"
            value={addForm.email}
            onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
            className="input-modern"
          />
          <div className="md:col-span-2 flex gap-3 items-center">
            <label className="text-sm text-slate-700">الحالة</label>
            <select
              value={String(addForm.is_active)}
              onChange={(e) =>
                setAddForm({ ...addForm, is_active: e.target.value === 'true' })
              }
              className="select-modern"
            >
              <option value="true">نشطة</option>
              <option value="false">غير نشطة</option>
            </select>
            <button
              onClick={handleAddCompany}
              className="btn-primary px-4 py-2.5 text-sm"
            >
              حفظ
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 py-4">جاري التحميل...</p>
      ) : companies.length === 0 ? (
        <p className="text-slate-500 py-4">لا توجد شركات</p>
      ) : (
        <ul className="space-y-3">
          {companies.map((company) => (
            <li key={company.id} className="content-list-card">
              {editingId === company.id ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="input-modern"
                    placeholder="اسم الشركة"
                  />
                  <input
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="input-modern"
                    placeholder="الهاتف"
                  />
                  <input
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="input-modern"
                    placeholder="العنوان"
                  />
                  <input
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="input-modern"
                    placeholder="البريد"
                  />
                  <select
                    value={String(editForm.is_active)}
                    onChange={(e) =>
                      setEditForm({ ...editForm, is_active: e.target.value === 'true' })
                    }
                    className="input-modern bg-white"
                  >
                    <option value="true">نشطة</option>
                    <option value="false">غير نشطة</option>
                  </select>
                  <div className="md:col-span-2 flex gap-2">
                    <button
                      onClick={handleSaveCompany}
                      className="btn-success px-4 py-2.5 text-sm"
                    >
                      حفظ التعديلات
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="btn-secondary px-4 py-2.5 text-sm"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-bold text-slate-900">{company.name}</p>
                    <p className="text-sm text-slate-500">
                      الهاتف: {company.phone || '—'} | البريد: {company.email || '—'}
                    </p>
                    <p className="text-sm text-slate-500">
                      العنوان: {company.address || '—'} | الحالة: {company.is_active ? 'نشطة' : 'غير نشطة'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => onDetails(company)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      التفاصيل
                    </button>
                    <button
                      onClick={() => startEdit(company)}
                      className="px-4 py-2 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50"
                    >
                      تعديل
                    </button>
                    <button
                      onClick={() => handleDeleteCompany(company)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const PriceImpactModal = ({
  open,
  title,
  oldPrice,
  newPrice,
  organizations,
  selectedIds,
  officialBookDate,
  officialBookDescription,
  setOfficialBookDate,
  setOfficialBookDescription,
  onToggle,
  onClose,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="surface-card w-full max-w-2xl max-h-[85vh] overflow-hidden">
        <div className="p-5 border-b">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500 mt-1">السعر القديم: {oldPrice} | السعر الجديد: {newPrice}</p>
          <p className="text-sm text-amber-700 mt-2">اختر الجهات المتأثرة التي تريد تطبيق التعديل عليها. الافتراضي ON ويمكن إيقاف أي جهة.</p>
        </div>

        <div className="p-5 overflow-y-auto max-h-[55vh] space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">تاريخ الكتاب الرسمي</label>
              <input
                type="date"
                value={officialBookDate || ''}
                onChange={(e) => setOfficialBookDate?.(e.target.value)}
                className="w-full input-modern"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">وصف الكتاب الرسمي</label>
              <input
                type="text"
                value={officialBookDescription || ''}
                onChange={(e) => setOfficialBookDescription?.(e.target.value)}
                className="w-full input-modern"
              />
            </div>
          </div>

          {!organizations?.length ? (
            <p className="text-slate-500">لا توجد جهات متأثرة بهذا التعديل</p>
          ) : organizations.map((org) => {
            const isOn = selectedIds.includes(org.organization_id);
            return (
              <div key={org.organization_id} className="flex items-center justify-between border rounded-xl p-3">
                <div>
                  <p className="font-semibold text-slate-900">{org.organization_name}</p>
                  <p className="text-xs text-slate-500">الخدمات المتأثرة: {org.services_count} | العناصر: {org.items_count}</p>
                </div>
                <button
                  onClick={() => onToggle(org.organization_id)}
                  className={`px-4 py-2 rounded-lg text-white ${isOn ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-400 hover:bg-slate-50/800'}`}
                >
                  {isOn ? 'ON' : 'OFF'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary px-4 py-2.5 text-sm">إلغاء</button>
          <button onClick={onConfirm} className="btn-primary px-4 py-2.5 text-sm">تأكيد التعديل</button>
        </div>
      </div>
      
    </div>
  );
};

const PackagesSection = () => {
  const serviceNames = ['fna', 'gcc', 'انترانيت', 'دولي', 'LTE'];
  const [serviceRanges, setServiceRanges] = useState(() => Object.fromEntries(serviceNames.map((s) => [s, []])));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForService, setShowAddForService] = useState({});
  const [editingRangeId, setEditingRangeId] = useState(null);
  const [editingRangeForm, setEditingRangeForm] = useState({ from: '', to: '', price: '' });
  const [drafts, setDrafts] = useState(() => Object.fromEntries(serviceNames.map((s) => [s, [{ from: '', to: '', price: '' }]])));
  const [impactModal, setImpactModal] = useState({ open: false, serviceName: '', rangeId: null, oldPrice: 0, newPrice: 0, organizations: [], selectedIds: [], official_book_date: '', official_book_description: '' });

  const closeImpactModal = () => setImpactModal({ open: false, serviceName: '', rangeId: null, oldPrice: 0, newPrice: 0, organizations: [], selectedIds: [] });

  const loadRanges = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/service-ranges`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل الرينجات');

      const grouped = Object.fromEntries(serviceNames.map((s) => [s, []]));
      (data.ranges || []).forEach((row) => {
        if (grouped[row.service_name]) {
          grouped[row.service_name].push({
            id: row.id,
            from: row.range_from,
            to: row.range_to,
            price: row.price,
            price_history: row.price_history || [],
          });
        }
      });
      setServiceRanges(grouped);
    } catch (e) {
      setError(e.message || 'خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRanges(); }, []);

  const addRangeRow = (serviceName) => setDrafts((prev) => ({ ...prev, [serviceName]: [...(prev[serviceName] || []), { from: '', to: '', price: '' }] }));
  const removeRangeRow = (serviceName, index) => setDrafts((prev) => ({ ...prev, [serviceName]: (prev[serviceName] || []).filter((_, i) => i !== index) }));
  const updateRangeRow = (serviceName, index, field, value) => setDrafts((prev) => ({ ...prev, [serviceName]: (prev[serviceName] || []).map((row, i) => i === index ? { ...row, [field]: value } : row) }));

  const handleSaveRanges = async (serviceName) => {
    const rows = (drafts[serviceName] || []).filter((row) => row.from !== '' && row.to !== '' && row.price !== '' && Number(row.from) <= Number(row.to));
    if (!rows.length) {
      setError('يرجى إدخال رينج واحد صحيح على الأقل');
      return;
    }
    setError('');
    try {
      for (const row of rows) {
        const res = await fetch(`${API}/service-ranges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service_name: serviceName, range_from: Number(row.from), range_to: Number(row.to), price: Number(row.price) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل حفظ الرينج');
      }
      setDrafts((prev) => ({ ...prev, [serviceName]: [{ from: '', to: '', price: '' }] }));
      setShowAddForService((prev) => ({ ...prev, [serviceName]: false }));
      loadRanges();
    } catch (e) {
      setError(e.message || 'خطأ في الاتصال');
    }
  };

  const startEditSavedRange = (row) => {
    setEditingRangeId(row.id);
    setEditingRangeForm({ from: String(row.from ?? ''), to: String(row.to ?? ''), price: String(row.price ?? '') });
    setError('');
  };

  const cancelEditSavedRange = () => {
    setEditingRangeId(null);
    setEditingRangeForm({ from: '', to: '', price: '' });
  };

  const handleUpdateSavedRange = async (serviceName, rangeId) => {
    if (editingRangeForm.from === '' || editingRangeForm.to === '' || editingRangeForm.price === '' || Number(editingRangeForm.from) > Number(editingRangeForm.to)) {
      setError('يرجى إدخال قيم صحيحة لتعديل الرينج');
      return;
    }
    setError('');
    try {
      const res = await fetch(`${API}/service-ranges/${rangeId}/impact`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ service_name: serviceName, range_from: Number(editingRangeForm.from), range_to: Number(editingRangeForm.to), price: Number(editingRangeForm.price) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'فشل جلب الجهات المتأثرة');
      setImpactModal({
        open: true,
        serviceName,
        rangeId,
        oldPrice: data.old_price,
        newPrice: data.new_price,
        organizations: data.affected_organizations || [],
        selectedIds: (data.affected_organizations || []).map((org) => org.organization_id),
        official_book_date: new Date().toISOString().split('T')[0],
        official_book_description: '',
      });
    } catch (e) {
      setError(e.message || 'خطأ في الاتصال');
    }
  };

  const confirmUpdateSavedRange = async () => {
    if (!impactModal.official_book_date || !String(impactModal.official_book_description || '').trim()) {
      setError('يرجى إدخال تاريخ الكتاب الرسمي ووصفه');
      return;
    }
    try {
      const res = await fetch(`${API}/service-ranges/${impactModal.rangeId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          service_name: impactModal.serviceName,
          range_from: Number(editingRangeForm.from),
          range_to: Number(editingRangeForm.to),
          price: Number(editingRangeForm.price),
          selected_organization_ids: impactModal.selectedIds,
          official_book_date: impactModal.official_book_date,
          official_book_description: String(impactModal.official_book_description || '').trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'فشل تعديل الرينج');
      closeImpactModal();
      cancelEditSavedRange();
      loadRanges();
    } catch (e) {
      setError(e.message || 'خطأ في الاتصال');
    }
  };

  const handleDeleteSavedRange = async (rangeId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الرينج؟')) return;
    setError('');
    try {
      const res = await fetch(`${API}/service-ranges/${rangeId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'فشل حذف الرينج');
      loadRanges();
    } catch (e) {
      setError(e.message || 'خطأ في الاتصال');
    }
  };

  return (
    <div className="surface-card p-6 sm:p-7 page-reveal">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-900">إدارة الباقات والرينجات</h2>
        <button onClick={loadRanges} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">تحديث</button>
      </div>

      <p className="text-sm text-slate-500 mb-4">هذه section مستقلة عن شركات مقدمة الخدمة، ومخصصة فقط للخدمات: fna / gcc / انترانيت / دولي / LTE</p>
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {loading ? (
        <p className="text-slate-500 py-4">جاري التحميل...</p>
      ) : (
        <div className="space-y-5">
          {serviceNames.map((serviceName) => (
            <div key={serviceName} className="soft-panel">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{serviceName}</h3>
                  <p className="text-sm text-slate-500">عدد الرينجات: {(serviceRanges[serviceName] || []).length}</p>
                </div>
                <button onClick={() => setShowAddForService((prev) => ({ ...prev, [serviceName]: !prev[serviceName] }))} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">إضافة رينج</button>
              </div>

              {(serviceRanges[serviceName] || []).length > 0 ? (
                <div className="space-y-2 mb-4">
                  {(serviceRanges[serviceName] || []).map((row) => {
                    const isEditing = editingRangeId === row.id;
                    return (
                      <div key={row.id} className="p-3 bg-white rounded-lg border">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                          <input type="number" value={isEditing ? editingRangeForm.from : row.from} readOnly={!isEditing} onChange={(e) => setEditingRangeForm((prev) => ({ ...prev, from: e.target.value }))} className={`input-modern ${isEditing ? 'bg-white' : 'bg-slate-100'}`} placeholder="from" />
                          <input type="number" value={isEditing ? editingRangeForm.to : row.to} readOnly={!isEditing} onChange={(e) => setEditingRangeForm((prev) => ({ ...prev, to: e.target.value }))} className={`input-modern ${isEditing ? 'bg-white' : 'bg-slate-100'}`} placeholder="to" />
                          <input type="number" value={isEditing ? editingRangeForm.price : row.price} readOnly={!isEditing} onChange={(e) => setEditingRangeForm((prev) => ({ ...prev, price: e.target.value }))} className={`input-modern ${isEditing ? 'bg-white' : 'bg-slate-100'}`} placeholder="price" />
                          {isEditing ? (
                            <>
                              <button onClick={() => handleUpdateSavedRange(serviceName, row.id)} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">حفظ التعديل</button>
                              <button onClick={cancelEditSavedRange} className="px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50/80">إلغاء</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEditSavedRange(row)} className="px-3 py-2 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50">تعديل</button>
                              <button onClick={() => handleDeleteSavedRange(row.id)} className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">حذف</button>
                            </>
                          )}
                        </div>

                        {!!row.price_history?.length && (
                          <PriceHistoryDropdown
                            history={row.price_history}
                            className="mt-3 border-t pt-3"
                            itemClassName="text-xs text-slate-500 bg-slate-50/80 rounded-lg border p-2"
                            latestItemClassName="text-xs text-slate-700 bg-white rounded-lg border p-2"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500 mb-4">لا توجد رينجات لهذه الخدمة.</p>
              )}

              {showAddForService[serviceName] && (
                <div className="bg-white border-2 border-indigo-200 rounded-xl p-4">
                  <div className="space-y-3">
                    {(drafts[serviceName] || []).map((row, index) => (
                      <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                        <input type="number" value={row.from} onChange={(e) => updateRangeRow(serviceName, index, 'from', e.target.value)} placeholder="from" className="input-modern" />
                        <input type="number" value={row.to} onChange={(e) => updateRangeRow(serviceName, index, 'to', e.target.value)} placeholder="to" className="input-modern" />
                        <input type="number" value={row.price} onChange={(e) => updateRangeRow(serviceName, index, 'price', e.target.value)} placeholder="price" className="input-modern" />
                        <button onClick={() => removeRangeRow(serviceName, index)} className="px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">حذف الرينج</button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <button onClick={() => addRangeRow(serviceName)} className="btn-success px-4 py-2.5 text-sm hover:bg-green-700">إضافة رينج آخر</button>
                    <button onClick={() => handleSaveRanges(serviceName)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">حفظ</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <PriceImpactModal
        open={impactModal.open}
        title="الجهات المتأثرة بتعديل الرينج"
        oldPrice={impactModal.oldPrice}
        newPrice={impactModal.newPrice}
        organizations={impactModal.organizations}
        selectedIds={impactModal.selectedIds}
        officialBookDate={impactModal.official_book_date}
        officialBookDescription={impactModal.official_book_description}
        setOfficialBookDate={(value) => setImpactModal((prev) => ({ ...prev, official_book_date: value }))}
        setOfficialBookDescription={(value) => setImpactModal((prev) => ({ ...prev, official_book_description: value }))}
        onToggle={(orgId) => setImpactModal((prev) => ({ ...prev, selectedIds: prev.selectedIds.includes(orgId) ? prev.selectedIds.filter((id) => id !== orgId) : [...prev.selectedIds, orgId] }))}
        onClose={closeImpactModal}
        onConfirm={confirmUpdateSavedRange}
      />
    </div>
  );
};

const UsersSection = () => {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'user' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/users`, {
        headers: getAuthHeaders(),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'فشل تحميل المستخدمين');
      }

      setUsers(data.users || []);
    } catch (e) {
      setUsers([]);
      setError(e.message || 'خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createUser = async () => {
    if (!form.username.trim() || !form.password.trim()) {
      setError('اسم المستخدم وكلمة المرور مطلوبان');
      setSuccess('');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API}/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'فشل إضافة المستخدم');
      }

      setForm({ username: '', password: '', role: 'user' });
      setSuccess('تمت إضافة المستخدم بنجاح');
      load();
    } catch (e) {
      setError(e.message || 'خطأ في الاتصال');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userToDelete) => {
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${userToDelete.username}"؟`)) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API}/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'فشل حذف المستخدم');
      }

      setSuccess('تم حذف المستخدم بنجاح');
      load();
    } catch (e) {
      setError(e.message || 'خطأ في الاتصال');
    }
  };

  return (
    <div className="surface-card p-6 sm:p-7 page-reveal">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-900">إدارة المستخدمين</h2>
        <button
          onClick={load}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          تحديث
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
      {success && <p className="text-green-600 text-sm mb-3">{success}</p>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50/80 rounded-[22px] border border-slate-200 mb-4">
        <input
          placeholder="اسم المستخدم"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          className="input-modern"
        />
        <input
          type="password"
          placeholder="كلمة المرور"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="input-modern"
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          className="select-modern"
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button
          onClick={createUser}
          disabled={saving}
          className="btn-primary px-4 py-2.5 text-sm disabled:opacity-60"
        >
          {saving ? 'جاري الإضافة...' : 'إضافة'}
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500 py-4">جاري التحميل...</p>
      ) : users.length === 0 ? (
        <p className="text-slate-500 py-4">لا يوجد مستخدمون</p>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="content-list-card flex flex-col md:flex-row md:items-center md:justify-between gap-3"
            >
              <div>
                <p className="font-bold text-slate-900">{user.username}</p>
                <p className="text-sm text-slate-500">
                  الدور: {user.role || 'user'}
                </p>
                {user.last_login && (
                  <p className="text-xs text-slate-500">
                    آخر تسجيل دخول: {user.last_login}
                  </p>
                )}
              </div>

              <button
                onClick={() => handleDeleteUser(user)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 self-start md:self-auto"
              >
                حذف
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CompanyDetailsSection = ({ company, onBack }) => {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ service_type: 'Wireless', item_category: 'Line', item_name: '', price: '', unit_label: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [editingSubId, setEditingSubId] = useState(null);
  const [editingSubForm, setEditingSubForm] = useState({ item_name: '', price: '', unit_label: '', service_type: 'Wireless', item_category: 'Line' });
  const [impactModal, setImpactModal] = useState({ open: false, subId: null, oldPrice: 0, newPrice: 0, organizations: [], selectedIds: [], official_book_date: '', official_book_description: '' });

  const closeImpactModal = () => setImpactModal({ open: false, subId: null, oldPrice: 0, newPrice: 0, organizations: [], selectedIds: [] });

  const load = async () => {
    if (!company?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/provider-companies/${company.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل تفاصيل الشركة');
      setDetails(data.provider_company || data);
    } catch (e) {
      setError(e.message || 'خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [company?.id]);

  const handleAddSubscription = async () => {
    if (!form.item_name.trim() || form.price === '') {
      setError('يرجى إدخال اسم الاشتراك والسعر');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/provider-companies/${company.id}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, price: Number(form.price) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إضافة الاشتراك');
      setForm({ service_type: 'Wireless', item_category: 'Line', item_name: '', price: '', unit_label: '', notes: '' });
      load();
    } catch (e) {
      setError(e.message || 'خطأ في الاتصال');
    } finally {
      setSaving(false);
    }
  };

  const startEditSubscription = (sub) => {
    setEditingSubId(sub.id);
    setEditingSubForm({
      item_name: sub.item_name || '',
      price: String(sub.price ?? ''),
      unit_label: sub.unit_label || '',
      service_type: sub.service_type || 'Wireless',
      item_category: sub.item_category || 'Line',
    });
    setError('');
  };

  const cancelEditSubscription = () => {
    setEditingSubId(null);
    setEditingSubForm({ item_name: '', price: '', unit_label: '', service_type: 'Wireless', item_category: 'Line' });
  };

  const handleEditSubscription = async (subId) => {
    try {
      const res = await fetch(`${API}/provider-subscriptions/${subId}/impact`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...editingSubForm, price: Number(editingSubForm.price) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'فشل جلب الجهات المتأثرة');
      setImpactModal({
        open: true,
        subId,
        oldPrice: data.old_price,
        newPrice: data.new_price,
        organizations: data.affected_organizations || [],
        selectedIds: (data.affected_organizations || []).map((org) => org.organization_id),
        official_book_date: new Date().toISOString().split('T')[0],
        official_book_description: '',
      });
    } catch (e) {
      setError(e.message || 'خطأ في الاتصال');
    }
  };

  const confirmEditSubscription = async () => {
    if (!impactModal.official_book_date || !String(impactModal.official_book_description || '').trim()) {
      setError('يرجى إدخال تاريخ الكتاب الرسمي ووصفه');
      return;
    }
    try {
      const res = await fetch(`${API}/provider-subscriptions/${impactModal.subId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...editingSubForm, price: Number(editingSubForm.price), selected_organization_ids: impactModal.selectedIds, official_book_date: impactModal.official_book_date, official_book_description: String(impactModal.official_book_description || '').trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'فشل تعديل الاشتراك');
      closeImpactModal();
      cancelEditSubscription();
      load();
    } catch (e) {
      setError(e.message || 'خطأ في الاتصال');
    }
  };

  const handleDeleteSubscription = async (subId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الاشتراك؟')) return;
    setError('');
    try {
      const res = await fetch(`${API}/provider-subscriptions/${subId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'فشل حذف الاشتراك');
      load();
    } catch (e) {
      setError(e.message || 'خطأ في الاتصال');
    }
  };

  return (
    <div className="surface-card p-6 sm:p-7 page-reveal">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">تفاصيل الشركة المجهزة</h2>
          <p className="text-sm text-slate-500 mt-1">{company?.name}</p>
        </div>
        <button onClick={onBack} className="btn-secondary px-4 py-2.5 text-sm">رجوع</button>
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50/80 rounded-[22px] border border-slate-200 mb-6">
        <select value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} className="select-modern">
          <option value="Wireless">Wireless</option>
          <option value="FTTH">FTTH</option>
          <option value="Optical">Optical</option>
          <option value="Other">Other</option>
        </select>
        <select value={form.item_category} onChange={(e) => setForm({ ...form, item_category: e.target.value })} className="select-modern">
          <option value="Line">Line</option>
          <option value="Bundle">Bundle</option>
          <option value="Other">Other</option>
        </select>
        <input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} placeholder="اسم الاشتراك" className="input-modern" />
        <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="السعر" className="input-modern" />
        <input value={form.unit_label} onChange={(e) => setForm({ ...form, unit_label: e.target.value })} placeholder="وحدة القياس" className="input-modern" />
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="ملاحظات" className="input-modern" />
        <div className="md:col-span-3">
          <button onClick={handleAddSubscription} disabled={saving} className="btn-primary px-4 py-2.5 text-sm disabled:opacity-60">{saving ? 'جاري الحفظ...' : 'إضافة اشتراك'}</button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500 py-4">جاري التحميل...</p>
      ) : !details?.subscriptions || details.subscriptions.length === 0 ? (
        <p className="text-slate-500 py-4">لا توجد اشتراكات لهذه الشركة</p>
      ) : (
        <div className="space-y-3">
          {details.subscriptions.map((sub) => {
            const isEditing = editingSubId === sub.id;
            return (
              <div key={sub.id} className="content-list-card flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-start">
                  <input value={isEditing ? editingSubForm.item_name : sub.item_name} onChange={(e) => setEditingSubForm((prev) => ({ ...prev, item_name: e.target.value }))} disabled={!isEditing} className="select-modern disabled:bg-slate-100" />
                  <select value={isEditing ? editingSubForm.service_type : sub.service_type} onChange={(e) => setEditingSubForm((prev) => ({ ...prev, service_type: e.target.value }))} disabled={!isEditing} className="select-modern disabled:bg-slate-100">
                    <option value="Wireless">Wireless</option>
                    <option value="FTTH">FTTH</option>
                    <option value="Optical">Optical</option>
                    <option value="Other">Other</option>
                  </select>
                  <select value={isEditing ? editingSubForm.item_category : sub.item_category} onChange={(e) => setEditingSubForm((prev) => ({ ...prev, item_category: e.target.value }))} disabled={!isEditing} className="select-modern disabled:bg-slate-100">
                    <option value="Line">Line</option>
                    <option value="Bundle">Bundle</option>
                    <option value="Other">Other</option>
                  </select>
                  <input type="number" value={isEditing ? editingSubForm.price : sub.price} onChange={(e) => setEditingSubForm((prev) => ({ ...prev, price: e.target.value }))} disabled={!isEditing} className="select-modern disabled:bg-slate-100" />
                  <input value={isEditing ? editingSubForm.unit_label : (sub.unit_label || '')} onChange={(e) => setEditingSubForm((prev) => ({ ...prev, unit_label: e.target.value }))} disabled={!isEditing} className="select-modern disabled:bg-slate-100" />
                </div>

                {sub.notes && <p className="text-sm text-slate-500">ملاحظات: {sub.notes}</p>}

                <div className="flex flex-wrap gap-2">
                  {!isEditing ? (
                    <button onClick={() => startEditSubscription(sub)} className="px-4 py-2 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50">تعديل</button>
                  ) : (
                    <>
                      <button onClick={() => handleEditSubscription(sub.id)} className="btn-primary px-4 py-2.5 text-sm">حفظ</button>
                      <button onClick={cancelEditSubscription} className="btn-secondary px-4 py-2.5 text-sm">إلغاء</button>
                    </>
                  )}
                  <button onClick={() => handleDeleteSubscription(sub.id)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">حذف</button>
                </div>

                {!!sub.price_history?.length && (
                  <PriceHistoryDropdown
                    history={sub.price_history}
                    className="border-t pt-3"
                    itemClassName="text-xs text-slate-500 bg-white rounded-lg border p-2"
                    latestItemClassName="text-xs text-slate-700 bg-white rounded-lg border p-2"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <PriceImpactModal
        open={impactModal.open}
        title="الجهات المتأثرة بتعديل سعر الاشتراك"
        oldPrice={impactModal.oldPrice}
        newPrice={impactModal.newPrice}
        organizations={impactModal.organizations}
        selectedIds={impactModal.selectedIds}
        officialBookDate={impactModal.official_book_date}
        officialBookDescription={impactModal.official_book_description}
        setOfficialBookDate={(value) => setImpactModal((prev) => ({ ...prev, official_book_date: value }))}
        setOfficialBookDescription={(value) => setImpactModal((prev) => ({ ...prev, official_book_description: value }))}
        onToggle={(orgId) => setImpactModal((prev) => ({ ...prev, selectedIds: prev.selectedIds.includes(orgId) ? prev.selectedIds.filter((id) => id !== orgId) : [...prev.selectedIds, orgId] }))}
        onClose={closeImpactModal}
        onConfirm={confirmEditSubscription}
      />
    </div>
  );
};

const AdminPage = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('organizations');

  const currentUser = getCurrentUser();

  useEffect(() => {
    const storedUser = getCurrentUser();

    if (!storedUser) {
      navigate('/login');
      return;
    }

    if (storedUser.role !== 'admin') {
      navigate('/main');
      return;
    }
  }, [navigate]);

  const sectionButtonClass = (key) =>
    `relative z-10 px-4 py-2 rounded-xl border transition-all duration-200 ${
      activeSection === key
        ? 'bg-white text-violet-700 border-white shadow-sm'
        : 'bg-white/10 text-white border-white/20 hover:bg-white/20 hover:-translate-y-0.5'
    }`;

  return (
    <div className="app-shell" dir="rtl">
      <Navbar onMenuClick={() => setMenuOpen(true)} />

      <SlideMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={(path) => {
          setMenuOpen(false);
          navigate(path);
        }}
      />

      <div className="page-container">
        <div className="page-hero mb-6 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-20">
            <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-white/20 blur-3xl" />
            <div className="absolute bottom-0 right-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          </div>

          <div className="relative z-10 flex flex-col gap-5">
            <div className="pointer-events-none">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">لوحة تحكم الإدارة</h1>
              <p className="text-sm sm:text-base text-blue-50/90 mt-2">
                مرحباً {currentUser?.username || 'Admin'}
              </p>
            </div>

            <div className="relative z-20 flex flex-wrap gap-2 pointer-events-auto">
              <button
                type="button"
                onClick={() => setActiveSection('organizations')}
                className={sectionButtonClass('organizations')}
              >
                الجهات
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('companies')}
                className={sectionButtonClass('companies')}
              >
                الشركات
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('packages')}
                className={sectionButtonClass('packages')}
              >
                الباقات والرينجات
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('users')}
                className={sectionButtonClass('users')}
              >
                المستخدمون
              </button>
            </div>
          </div>
        </div>

        <div className="relative z-0">
          {activeSection === 'organizations' && <OrganizationsSection />}

          {activeSection === 'companies' && (
            <CompaniesSection
              onDetails={(company) => {
                navigate(`/admin/company/${company.id}`);
              }}
            />
          )}

          {activeSection === 'packages' && <PackagesSection />}

          {activeSection === 'users' && <UsersSection />}
        </div>
      </div>
      <PageFooter />
    </div>
  );
};

export default AdminPage;