import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import PageFooter from '../components/PageFooter';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
const API = import.meta.env.VITE_API_BASE_URL;
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('user', JSON.stringify(data.user));

        if (data.user?.role === 'admin') {
          navigate('/admin');
        } else {
          navigate('/main');
        }
      } else {
        alert(data.error || 'Login failed');
      }
    } catch {
      alert('Cannot connect to server. Is the backend running?');
    }
  };

  return (
    <div className="app-shell min-h-screen flex flex-col justify-between px-4 sm:px-6 lg:px-8 py-10">
      <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-6 lg:gap-8 items-stretch">
        <section className="hidden lg:flex page-hero flex-col justify-between min-h-[560px]">
          <div>
            <div className="brand-chip">اتصالات الموحد</div>
            <div className="mt-6 flex items-center gap-4">
              <BrandLogo className="h-24 w-24 rounded-[28px] brand-glow" imageClassName="scale-[1.04]" />
              <div>
                <h1 className="text-3xl xl:text-4xl font-bold leading-tight">
                   اتصالات  كربلاء
                </h1>
                <p className="mt-2 text-indigo-100/95 text-base">نظام إدارة العقود والدفعات والجهات</p>
              </div>
            </div>
            <p className="mt-6 text-blue-50/95 text-base leading-8 max-w-xl">
              واجهة دخول أوضح وهوية موحدة مستندة إلى شعار المركز، مع تجربة أبسط للوصول السريع إلى الجهات، العقود، الإحصائيات، والسجل.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white/12 border border-white/15 p-4">
              <div className="text-sm text-indigo-100">الهوية</div>
              <div className="mt-2 text-2xl font-bold">موحدة</div>
            </div>
            <div className="rounded-2xl bg-white/12 border border-white/15 p-4">
              <div className="text-sm text-indigo-100">الواجهة</div>
              <div className="mt-2 text-2xl font-bold">أوضح</div>
            </div>
            <div className="rounded-2xl bg-white/12 border border-white/15 p-4">
              <div className="text-sm text-indigo-100">التنقل</div>
              <div className="mt-2 text-2xl font-bold">أسرع</div>
            </div>
          </div>
        </section>

        <section className="surface-card p-6 sm:p-8 lg:p-10 self-center">
          <div className="text-center mb-8">
            <BrandLogo className="mx-auto h-20 w-20 rounded-[24px] brand-glow mb-4" imageClassName="scale-[1.04]" />
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
              تسجيل الدخول
            </h2>
            <p className="text-slate-500 text-sm sm:text-base">
              للوصول إلى نظام اتصالات ومعلوماتية كربلاء
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="field-label">اسم المستخدم</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-modern"
                placeholder="أدخل اسم المستخدم"
              />
            </div>

            <div>
              <label className="field-label">كلمة المرور</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-modern"
                placeholder="أدخل كلمة المرور"
              />
            </div>

            <button type="submit" className="btn-primary w-full">
              دخول
            </button>
          </form>

          <div className="mt-6 rounded-2xl bg-indigo-50 border border-indigo-100 px-4 py-3 text-sm text-slate-600">
            يتم توجيه المدير إلى لوحة التحكم، والمستخدم العادي إلى الواجهة الرئيسية تلقائياً.
          </div>
        </section>
      </div>

      <PageFooter />
    </div>
  );
};

export default LoginPage;