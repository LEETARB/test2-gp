import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BrandLogo from './BrandLogo';

const SlideMenu = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('user'));
  } catch {
    user = null;
  }

  const isAdmin = user?.role === 'admin';

  const handleNavigation = (path) => {
    if (path === '/') {
      localStorage.removeItem('user');
      navigate('/');
    } else {
      navigate(path);
    }
    onClose();
  };

  const menuItems = [
    {
      label: isAdmin ? 'لوحة التحكم الإدارية' : 'إدارة الجهات',
      hint: isAdmin ? 'إدارة الجهات والشركات والخدمات' : 'إضافة وتعديل الجهات',
      path: isAdmin ? '/admin' : '/organizations-management',
      icon: '⚙️',
    },
    { label: 'إضافة عقد', hint: 'إنشاء عقد جديد', path: '/add', icon: '➕' },
    { label: 'الإحصائيات', hint: 'تقارير عامة ومزودين ودفعات', path: '/statistics', icon: '📊' },
    { label: 'السجل', hint: 'تتبع العمليات والدفعات', path: '/history', icon: '🕘' },
    { label: 'تسجيل الخروج', hint: 'إنهاء الجلسة الحالية', path: '/', icon: '↩️', danger: true },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[3px] transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 right-0 z-50 h-full w-[88vw] max-w-sm transform border-l border-slate-200/80 bg-white/96 backdrop-blur-xl shadow-[0_24px_48px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 bg-gradient-to-br from-indigo-900 via-indigo-800 to-indigo-700 p-6 text-white">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-[22px] bg-white p-1.5 shadow-lg">
                  <BrandLogo className="h-14 w-14 rounded-xl" />
                </div>
                <div>
                  <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-indigo-50">
                    تنقل سريع
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-white">القائمة الرئيسية</h2>
                  <p className="mt-1 text-sm text-indigo-100">
                    {isAdmin ? 'وضع المدير' : 'وضع المستخدم'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white hover:bg-white/25"
                aria-label="إغلاق القائمة"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {user?.username ? (
              <div className="mt-5 rounded-[22px] border border-white/15 bg-white/10 px-4 py-3">
                <div className="text-xs font-medium text-indigo-100">المستخدم الحالي</div>
                <div className="mt-1 text-2xl font-bold text-white">{user.username}</div>
              </div>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5">
            <div className="space-y-3">
              {menuItems.map((item, index) => {
                const isActive = location.pathname === item.path && item.path !== '/';
                const baseClasses = item.danger
                  ? 'border-rose-100 bg-white hover:border-rose-200 hover:bg-rose-50'
                  : isActive
                    ? 'border-indigo-200 bg-indigo-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50';

                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => handleNavigation(item.path)}
                    className={`page-reveal stagger-${Math.min(index + 1, 4)} w-full rounded-[22px] border px-4 py-4 text-right ${baseClasses}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ${
                        item.danger
                          ? 'bg-rose-50 text-rose-600'
                          : isActive
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-slate-100 text-slate-700'
                      }`}>
                        <span>{item.icon}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className={`text-lg font-bold ${item.danger ? 'text-rose-700' : 'text-slate-900'}`}>
                          {item.label}
                        </div>
                        <div className={`mt-1 text-sm ${item.danger ? 'text-rose-500' : 'text-slate-500'}`}>
                          {item.hint}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default SlideMenu;
