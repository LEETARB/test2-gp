import React from 'react';

const PageFooter = () => {
  return (
    <footer className="page-container pt-0 pb-8">
      <div className="brand-footer-card page-reveal" dir="rtl">
        <div>
          <div className="text-sm font-semibold text-slate-800"> اتصالات ومعلوماتية كربلاء</div>
          <div className="mt-1 text-xs text-slate-500">نظام موحد لإدارة الجهات والعقود والخدمات والدفعات.</div>
        </div>
        <div className="text-xs text-slate-500 sm:text-sm sm:text-left">
          <span className="font-semibold text-slate-700">المبرمجان:</span>{' '}
          <span>علي علاء حميد</span>
          <span className="mx-2 text-slate-300">•</span>
          <span>كرار حيدر طالب</span>
        </div>
      </div>
    </footer>
  );
};

export default PageFooter;
