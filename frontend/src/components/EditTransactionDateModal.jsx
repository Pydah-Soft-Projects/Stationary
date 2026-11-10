import { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, X, ChevronLeft, ChevronRight, Loader2, AlertCircle, CheckCircle2, Ban } from 'lucide-react';
import { apiUrl } from '../utils/api';

const pad = (n) => String(n).padStart(2, '0');

export const toLocalDateInput = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const EditTransactionDateModal = ({
  isOpen,
  transaction,
  recipientName = '',
  currentUser,
  onClose,
  onDateUpdated,
}) => {
  // Base date of current transaction
  const baseTxDate = useMemo(() => {
    if (!transaction) return new Date();
    return new Date(transaction.transactionDate || transaction.createdAt || new Date());
  }, [transaction]);

  const currentTxDateStr = useMemo(() => toLocalDateInput(baseTxDate), [baseTxDate]);
  const todayStr = useMemo(() => toLocalDateInput(new Date()), []);

  // Strict constraint: date cannot be in the future of the transaction or today
  // Future dates (strictly > maxAllowedDateStr) are blocked and crossed out
  const maxAllowedDateStr = useMemo(() => {
    if (!currentTxDateStr) return todayStr;
    return currentTxDateStr < todayStr ? currentTxDateStr : todayStr;
  }, [currentTxDateStr, todayStr]);

  const [maxYear, maxMonthIndex] = useMemo(() => {
    if (!maxAllowedDateStr) return [new Date().getFullYear(), new Date().getMonth()];
    const [y, m] = maxAllowedDateStr.split('-').map(Number);
    return [y, m - 1]; // m is 1-based, monthIndex is 0-based
  }, [maxAllowedDateStr]);

  const [selectedDateStr, setSelectedDateStr] = useState('');
  const [viewYear, setViewYear] = useState(maxYear);
  const [viewMonth, setViewMonth] = useState(maxMonthIndex);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Initialize selected date when modal opens with transaction
  useEffect(() => {
    if (isOpen && transaction) {
      const initialStr = currentTxDateStr <= maxAllowedDateStr ? currentTxDateStr : maxAllowedDateStr;
      setSelectedDateStr(initialStr);
      setError('');

      const [y, m] = initialStr.split('-').map(Number);
      if (y && m) {
        setViewYear(y);
        setViewMonth(m - 1);
      } else {
        setViewYear(maxYear);
        setViewMonth(maxMonthIndex);
      }
    }
  }, [isOpen, transaction, currentTxDateStr, maxAllowedDateStr, maxYear, maxMonthIndex]);

  if (!isOpen || !transaction) return null;

  // Disallow navigating to future months beyond maxAllowedDateStr
  const canGoNextMonth = viewYear < maxYear || (viewYear === maxYear && viewMonth < maxMonthIndex);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (!canGoNextMonth) return;
    if (viewMonth === 11) {
      if (viewYear + 1 > maxYear) return;
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      if (viewYear === maxYear && viewMonth + 1 > maxMonthIndex) return;
      setViewMonth((m) => m + 1);
    }
  };

  // Quick past and present shortcuts relative to transaction date
  const handleShortcut = (daysAgo) => {
    const target = new Date(baseTxDate);
    target.setDate(target.getDate() - daysAgo);
    const dateStr = toLocalDateInput(target);
    if (dateStr > maxAllowedDateStr) return; // Strict safeguard
    setSelectedDateStr(dateStr);
    const [y, m] = dateStr.split('-').map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
    setError('');
  };

  // Calendar days calculation
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const handleSelectDay = (day) => {
    const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    // Strictly prevent selecting future days
    if (dateStr > maxAllowedDateStr) {
      setError('Future dates are not allowed. You can only select the present (same day) or past days.');
      return;
    }
    setSelectedDateStr(dateStr);
    setError('');
  };

  // Direct input change handler with strict future check
  const handleDirectInputChange = (e) => {
    const val = e.target.value;
    if (!val) {
      setSelectedDateStr('');
      return;
    }
    if (val > maxAllowedDateStr) {
      setError('Future dates are not allowed. You can only select the present (same day) or past days.');
      return;
    }
    setError('');
    setSelectedDateStr(val);
    const [y, m] = val.split('-').map(Number);
    if (y && m) {
      setViewYear(y);
      setViewMonth(m - 1);
    }
  };

  // Compute preview datetime preserving original time
  const previewDateTime = () => {
    if (!selectedDateStr) return null;
    const [y, m, d] = selectedDateStr.split('-').map(Number);
    if (!y || !m || !d) return null;

    const original = new Date(baseTxDate);
    const combined = new Date(original);
    combined.setFullYear(y, m - 1, d);

    if (combined.getTime() > Date.now()) {
      combined.setTime(Date.now());
    }
    return combined;
  };

  const preview = previewDateTime();

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!selectedDateStr) {
      setError('Please select a date.');
      return;
    }

    // Strict validation: must be <= maxAllowedDateStr
    if (selectedDateStr > maxAllowedDateStr) {
      setError('Future dates are not allowed. You can only select the present (same day) or past days.');
      return;
    }

    const [year, month, day] = selectedDateStr.split('-').map(Number);
    if (!year || !month || !day) {
      setError('Invalid date format.');
      return;
    }

    // Preserve the original transaction's exact time
    const originalDate = new Date(baseTxDate);
    const finalDate = new Date(originalDate);
    finalDate.setFullYear(year, month - 1, day);

    // Ensure final date is strictly <= Date.now()
    if (finalDate.getTime() > Date.now()) {
      finalDate.setTime(Date.now());
    }

    setSaving(true);
    setError('');

    try {
      const transactionId = transaction._id || transaction.id;
      const response = await fetch(apiUrl(`/api/transactions/${transactionId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionDate: finalDate.toISOString(),
          updatedBy: {
            _id: currentUser?._id,
            name: currentUser?.name || 'Administrator',
            empNo: currentUser?.empNo || currentUser?.employee_no || '',
            role: currentUser?.role || 'Administrator',
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to update transaction date' }));
        throw new Error(errorData.message || 'Failed to update transaction date');
      }

      const updated = await response.json();
      if (typeof onDateUpdated === 'function') {
        onDateUpdated(updated, finalDate);
      }
      onClose();
    } catch (err) {
      console.error('Failed to update transaction date:', err);
      setError(err.message || 'Failed to update transaction date. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Available past years only (up to maxYear)
  const availableYears = [];
  for (let y = maxYear; y >= Math.max(maxYear - 10, 2020); y--) {
    availableYears.push(y);
  }

  // Available months only (up to maxMonthIndex if viewing maxYear)
  const availableMonths = MONTH_NAMES.map((name, index) => ({ name, index })).filter((m) => {
    if (viewYear === maxYear) {
      return m.index <= maxMonthIndex;
    }
    if (viewYear > maxYear) {
      return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-blue-100 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <Calendar size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm">Edit Transaction Date</h3>
              <p className="text-[11px] text-blue-200">Super Admin Portal • Past Dates Only</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
          {/* Transaction Metadata Card */}
          <div className="bg-blue-50/70 rounded-xl p-3 border border-blue-100 text-xs space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Transaction ID:</span>
              <span className="font-semibold text-gray-800 font-mono text-[11px]">{transaction.transactionId}</span>
            </div>
            {recipientName && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Recipient:</span>
                <span className="font-semibold text-gray-800">{recipientName}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Current Date:</span>
              <span className="font-medium text-gray-700">
                {baseTxDate.toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Amount:</span>
              <span className="font-bold text-blue-900">₹{Number(transaction.totalAmount || 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Quick Past Date Shortcuts */}
          <div>
            <span className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Quick Past Date Shortcuts
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: 'Same Day', days: 0 },
                { label: '1 Day Earlier', days: 1 },
                { label: '3 Days Earlier', days: 3 },
                { label: '1 Week Earlier', days: 7 },
              ].map(({ label, days }) => {
                const target = new Date(baseTxDate);
                target.setDate(target.getDate() - days);
                const targetStr = toLocalDateInput(target);
                const isSelected = selectedDateStr === targetStr;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleShortcut(days)}
                    className={`py-1.5 px-1 rounded-lg text-[11px] font-medium border text-center transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm font-semibold'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendar Container */}
          <div className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm">
            {/* Month & Year Navigation */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                {/* Month Dropdown (past months only for max year) */}
                <select
                  value={viewMonth}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                  className="text-xs font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  {availableMonths.map((m) => (
                    <option key={m.index} value={m.index}>
                      {m.name}
                    </option>
                  ))}
                </select>

                {/* Year Dropdown (past years only) */}
                <select
                  value={viewYear}
                  onChange={(e) => {
                    const newY = Number(e.target.value);
                    setViewYear(newY);
                    if (newY === maxYear && viewMonth > maxMonthIndex) {
                      setViewMonth(maxMonthIndex);
                    }
                  }}
                  className="text-xs font-bold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 rounded-lg text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
                  title="Previous month"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  disabled={!canGoNextMonth}
                  className="p-1 rounded-lg text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                  title={canGoNextMonth ? 'Next month' : 'Future months are not allowed'}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Days of week header */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
              {DAY_LABELS.map((d) => (
                <span key={d} className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {d}
                </span>
              ))}
            </div>

            {/* Days Grid - Future dates show CROSS LINES and are completely disabled */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty leading cells */}
              {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                <div key={`empty-${idx}`} className="aspect-square h-8 w-8 mx-auto" />
              ))}

              {/* Days in Month */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const day = idx + 1;
                const cellDateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
                const isFuture = cellDateStr > maxAllowedDateStr;
                const isSelected = selectedDateStr === cellDateStr;
                const isTxDay = currentTxDateStr === cellDateStr;

                // Future days are crossed out with visible cross lines and non-clickable
                if (isFuture) {
                  return (
                    <div
                      key={`day-${day}`}
                      className="relative aspect-square h-8 w-8 mx-auto rounded-lg flex items-center justify-center text-xs font-semibold text-gray-300 bg-red-50/40 border border-dashed border-red-200 cursor-not-allowed select-none overflow-hidden"
                      title="Future date - not allowed"
                    >
                      {/* Struck-through day number */}
                      <span className="line-through text-gray-400 select-none opacity-60 z-0">
                        {day}
                      </span>
                      {/* Bold red cross lines (X) */}
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none z-10"
                        viewBox="0 0 32 32"
                        fill="none"
                      >
                        <line
                          x1="5"
                          y1="5"
                          x2="27"
                          y2="27"
                          stroke="#ef4444"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        />
                        <line
                          x1="27"
                          y1="5"
                          x2="5"
                          y2="27"
                          stroke="#ef4444"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  );
                }

                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    className={`relative aspect-square h-8 w-8 mx-auto rounded-lg flex items-center justify-center text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md font-bold ring-2 ring-blue-300 scale-105'
                        : isTxDay
                        ? 'bg-blue-50 text-blue-700 border-2 border-blue-500 font-bold hover:bg-blue-100'
                        : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700 border border-transparent hover:border-blue-200'
                    }`}
                    title={isTxDay ? 'Current transaction date' : `Select ${day} ${MONTH_NAMES[viewMonth]} ${viewYear}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Visual Legend */}
            <div className="flex items-center justify-around text-[10px] text-gray-500 pt-2.5 mt-2.5 border-t border-gray-100">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block shadow-xs"></span>
                <span className="font-medium">Selected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-50 border-2 border-blue-500 inline-block"></span>
                <span className="font-medium">Current Date</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="relative w-3.5 h-3.5 rounded bg-red-50 border border-red-200 flex items-center justify-center overflow-hidden">
                  <svg className="w-full h-full" viewBox="0 0 16 16" fill="none">
                    <line x1="2" y1="2" x2="14" y2="14" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                    <line x1="14" y1="2" x2="2" y2="14" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="text-red-600 font-semibold">Future Date (Crossed Out)</span>
              </div>
            </div>
          </div>

          {/* Manual Date Input with max={maxAllowedDateStr} */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700">
                Selected Date:
              </label>
              <span className="text-[11px] text-blue-700 font-semibold">
                {selectedDateStr ? new Date(selectedDateStr).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }) : 'None selected'}
              </span>
            </div>
            <input
              type="date"
              max={maxAllowedDateStr}
              value={selectedDateStr}
              onChange={handleDirectInputChange}
              disabled={saving}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-gray-100 font-medium"
              required
            />
            <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
              <Clock size={11} className="text-gray-400 shrink-0" />
              <span>Original transaction time is preserved automatically. Future dates are crossed out and disabled.</span>
            </p>
          </div>

          {/* Selected Date & Preserved Time Preview */}
          {preview && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-900">New Transaction Date Preview:</p>
                <p className="text-[11px] text-emerald-700 font-medium">
                  {preview.toLocaleString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-1.5">
              <AlertCircle size={14} className="shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-1 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSave}
              disabled={saving || !selectedDateStr || selectedDateStr > maxAllowedDateStr}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Date</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditTransactionDateModal;
