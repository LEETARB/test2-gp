import React, { useMemo, useState } from 'react';

const LIMIT_OPTIONS = [5, 10, 20, 50];

const formatHistoryLine = (entry) => {
  const parts = [
    `من ${entry.old_price} إلى ${entry.new_price}`,
    entry.changed_at,
  ];

  if (entry.changed_by_username) {
    parts.push(`بواسطة ${entry.changed_by_username}`);
  }

  if (entry.official_book_date) {
    parts.push(`كتاب رسمي: ${entry.official_book_date}`);
  }

  if (entry.official_book_description) {
    parts.push(entry.official_book_description);
  }

  return parts.filter(Boolean).join(' | ');
};

const PriceHistoryDropdown = ({
  history = [],
  title = 'سجل الأسعار',
  className = '',
  itemClassName = 'text-xs text-slate-500 bg-slate-50/80 rounded-lg border p-2',
  latestItemClassName = 'text-xs text-slate-700 bg-white rounded-lg border p-2',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);

  const latestEntry = history[0];
  const olderEntries = history.slice(1);

  const visibleOlderEntries = useMemo(() => {
    return olderEntries.slice(0, visibleCount);
  }, [olderEntries, visibleCount]);

  if (!history.length) return null;

  return (
    <div className={className}>
      <p className="text-sm font-semibold text-slate-700 mb-2">{title}</p>

      <div className={latestItemClassName}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold text-slate-900">آخر تعديل</span>
          <span className="text-[11px] text-slate-500">الأحدث</span>
        </div>
        <p className="mt-1 leading-6">{formatHistoryLine(latestEntry)}</p>
      </div>

      {!!olderEntries.length && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="w-full px-3 py-3 flex items-center justify-between text-sm font-medium text-slate-700 hover:bg-slate-100/80 rounded-xl transition"
          >
            <span>التعديلات السابقة ({olderEntries.length})</span>
            <span className={`text-base transition-transform ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
          </button>

          {isOpen && (
            <div className="px-3 pb-3 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3">
                <p className="text-xs text-slate-500">
                  المعروض الآن: {Math.min(visibleCount, olderEntries.length)} من {olderEntries.length}
                </p>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">عدد السجلات</label>
                  <select
                    value={visibleCount}
                    onChange={(e) => setVisibleCount(Number(e.target.value))}
                    className="px-2 py-1.5 text-xs border rounded-lg bg-white"
                  >
                    {LIMIT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                    {!LIMIT_OPTIONS.includes(olderEntries.length) && (
                      <option value={olderEntries.length}>{olderEntries.length}</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                {visibleOlderEntries.map((entry) => (
                  <div key={entry.id} className={itemClassName}>
                    {formatHistoryLine(entry)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PriceHistoryDropdown;
