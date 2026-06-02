import React from 'react';
import { useNavigate } from 'react-router-dom';
import BrandLogo from './BrandLogo';

const Navbar = ({ onMenuClick }) => {
  const navigate = useNavigate();

  return (
    <nav className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/92 backdrop-blur-xl shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div dir="rtl" className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-5 min-h-[76px] py-3 page-reveal">
          <button
            type="button"
            onClick={onMenuClick}
            className="btn-secondary justify-self-start px-4 py-2.5 text-sm"
            aria-label="القائمة"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="hidden sm:inline">القائمة</span>
          </button>

          <button type="button" onClick={() => navigate('/main')} className="group min-w-0 w-full text-right">
            <div className="flex items-center justify-center sm:justify-start gap-3 sm:gap-4">
              <BrandLogo className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl shrink-0 transition-transform duration-300 group-hover:scale-[1.03]" imageClassName="scale-[1.03]" />
              <h1 className="min-w-0 truncate text-sm sm:text-lg lg:text-[1.4rem] font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                نظام إدارة اتصالات ومعلوماتية كربلاء
              </h1>
            </div>
          </button>

          <div className="w-10 sm:w-0" />
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
