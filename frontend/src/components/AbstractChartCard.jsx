import { useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import {
  BarChart3,
  Calendar,
  Maximize2,
  X,
  Printer,
  Sparkles,
  ArrowRight,
  Wallet,
  CreditCard,
  Activity
} from 'lucide-react';

const AbstractChartCard = ({
  abstractChartData,
  loading,
  startDate,
  endDate,
  totalRevenue = 0,
  cashRevenue = 0,
  onlineRevenue = 0,
  transactionsCount = 0,
  latestTransactionDate = null,
  onSelectDate = null,
  formatCurrency = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [showFullSheetModal, setShowFullSheetModal] = useState(false);
  const printSheetRef = useRef(null);

  const handlePrint = useReactToPrint({
    contentRef: printSheetRef,
    documentTitle: `Daily_Transaction_Abstract_Sheet_${startDate || 'Report'}${endDate && endDate !== startDate ? `_to_${endDate}` : ''}`,
    pageStyle: `
      @page {
        size: A4 portrait;
        margin: 12mm 10mm;
      }
      @media print {
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          box-sizing: border-box !important;
        }
        html, body {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #0f172a !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        }
        .no-print {
          display: none !important;
        }
        table {
          width: 100% !important;
          border-collapse: collapse !important;
          page-break-inside: auto;
        }
        tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        thead {
          display: table-header-group;
        }
        tfoot {
          display: table-footer-group;
        }
      }
    `
  });

  const handlePrintClick = () => {
    try {
      if (typeof handlePrint === 'function') {
        handlePrint();
        return;
      }
    } catch (err) {
      console.error('react-to-print error, falling back to window.print', err);
    }
    window.print();
  };

  const isSingleDay = startDate === endDate;
  const timeline = abstractChartData?.timeline || [];
  const breakdown = abstractChartData?.paymentBreakdown || {
    cashAmount: cashRevenue,
    onlineAmount: onlineRevenue,
    totalRevenue: totalRevenue,
    cashPercent: totalRevenue > 0 ? Math.round((cashRevenue / totalRevenue) * 100) : 0,
    onlinePercent: totalRevenue > 0 ? Math.max(0, 100 - Math.round((cashRevenue / totalRevenue) * 100)) : 0,
    cashCount: 0,
    onlineCount: 0,
    paidTransactions: transactionsCount,
    totalTransactions: transactionsCount
  };

  const total = Number(totalRevenue) || 0;
  const cash = Number(cashRevenue) || 0;
  const online = Number(onlineRevenue) || 0;
  const cashPct = total > 0 ? Math.round((cash / total) * 100) : 0;
  const onlinePct = total > 0 ? Math.max(0, 100 - cashPct) : 0;
  const avgTxn = transactionsCount > 0 ? Math.round(total / transactionsCount) : 0;

  const formatDateLabel = (dStr) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return dStr;
  };

  // Dimensions for Chart SVG
  const svgWidth = 480;
  const svgHeight = 155;
  const padding = { top: 18, right: 14, bottom: 26, left: 42 };
  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;
  const baselineY = padding.top + plotHeight;

  const maxRevenue = Math.max(...timeline.map((item) => Number(item.revenue) || 0), 0);
  const yMax = maxRevenue > 0 ? Math.ceil(maxRevenue * 1.18) : 1000;

  const formatCompact = (num) => {
    if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
    if (num >= 1000) return `₹${Math.round(num / 1000)}k`;
    return `₹${Math.round(num)}`;
  };

  // Calculate whether an item label should be shown to prevent collision
  const shouldShowLabel = (index, totalCount) => {
    if (totalCount <= 8) return true; // 5 days: show all!
    if (index === 0) return true;
    if (index === totalCount - 1) return true;

    const step = Math.ceil(totalCount / 6);
    if (index % step === 0) {
      // Don't render if it's too close to the final label
      if (totalCount - 1 - index < Math.floor(step * 0.75)) {
        return false;
      }
      return true;
    }
    return false;
  };

  return (
    <>
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between">
        {/* Top Header */}
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
                <BarChart3 size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">Graphical Abstract Sheet</h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {isSingleDay ? 'Daily' : timeline.length === 5 ? 'Recent 5 Days' : 'Date Range'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  {isSingleDay ? formatDateLabel(startDate) : `${formatDateLabel(startDate)} — ${formatDateLabel(endDate)}`}
                </p>
              </div>
            </div>

            {/* Top Right: Full Sheet Action */}
            <button
              type="button"
              onClick={() => setShowFullSheetModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all hover:border-slate-300 shadow-2xs"
              title="Expand Full Graphical Abstract Sheet"
            >
              <Maximize2 size={13} className="text-indigo-600" />
              <span>Sheet</span>
            </button>
          </div>

          {/* Micro-Stats Cards (High-Contrast & Vibrant) */}
          <div className="grid grid-cols-3 gap-2.5 my-3">
            {/* Cash */}
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200/80 rounded-xl p-2.5 transition-all hover:border-emerald-300">
              <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-800 mb-0.5">
                <span className="flex items-center gap-1">
                  <Wallet size={12} className="text-emerald-600" />
                  <span>Cash</span>
                </span>
                <span className="bg-emerald-200/70 text-emerald-900 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {cashPct}%
                </span>
              </div>
              <div className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                {loading ? '...' : formatCurrency(cash)}
              </div>
            </div>

            {/* Online */}
            <div className="bg-gradient-to-br from-sky-50 to-sky-100/50 border border-sky-200/80 rounded-xl p-2.5 transition-all hover:border-sky-300">
              <div className="flex items-center justify-between text-[11px] font-semibold text-sky-800 mb-0.5">
                <span className="flex items-center gap-1">
                  <CreditCard size={12} className="text-sky-600" />
                  <span>Online</span>
                </span>
                <span className="bg-sky-200/70 text-sky-900 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {onlinePct}%
                </span>
              </div>
              <div className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                {loading ? '...' : formatCurrency(online)}
              </div>
            </div>

            {/* Volume */}
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200/80 rounded-xl p-2.5 transition-all hover:border-indigo-300">
              <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-800 mb-0.5">
                <span className="flex items-center gap-1">
                  <Activity size={12} className="text-indigo-600" />
                  <span>Volume</span>
                </span>
                <span className="text-[10px] font-medium text-slate-500">
                  Avg {formatCompact(avgTxn)}
                </span>
              </div>
              <div className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                {loading ? '...' : `${transactionsCount} Txns`}
              </div>
            </div>
          </div>
        </div>

        {/* Graphical Bar Chart Body */}
        <div className="relative min-h-[160px] flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-slate-400 mt-2">Loading graphical dataset...</p>
            </div>
          ) : total === 0 ? (
            /* Zero State with Prompt */
            <div className="w-full text-center py-4 px-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Sparkles className="w-7 h-7 text-indigo-400 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-slate-800">No transactions recorded for {formatDateLabel(startDate)}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Transactions are recorded on past dates.</p>
              {latestTransactionDate && latestTransactionDate !== startDate && onSelectDate && (
                <button
                  type="button"
                  onClick={() => onSelectDate(latestTransactionDate)}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition-all"
                >
                  <span>Load Latest Activity ({formatDateLabel(latestTransactionDate)})</span>
                  <ArrowRight size={13} />
                </button>
              )}
            </div>
          ) : (
            /* Stacked Cash & Online Bar Chart */
            <div className="w-full relative">
              {/* Floating Tooltip */}
              {hoveredIndex !== null && timeline[hoveredIndex] && (
                <div
                  className="absolute z-20 bg-slate-900/90 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-xl pointer-events-none backdrop-blur-sm border border-slate-700/80 flex items-center gap-2"
                  style={{
                    top: 0,
                    right: 8
                  }}
                >
                  <span className="font-bold text-indigo-300">{timeline[hoveredIndex].label}:</span>
                  <span>Total {formatCurrency(timeline[hoveredIndex].revenue)}</span>
                  <span className="text-emerald-300">Cash {formatCurrency(timeline[hoveredIndex].cash)}</span>
                  <span className="text-sky-300">Online {formatCurrency(timeline[hoveredIndex].online)}</span>
                  <span className="text-slate-300">({timeline[hoveredIndex].transactions} txns)</span>
                </div>
              )}

              <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible select-none">
                <defs>
                  <linearGradient id="absBarCashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="absBarOnlineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0284c7" />
                    <stop offset="100%" stopColor="#0369a1" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Horizontal Guide Lines */}
                {[0, 0.5, 1].map((pct, i) => {
                  const y = padding.top + plotHeight * (1 - pct);
                  const val = Math.round(yMax * pct);
                  return (
                    <g key={i}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={svgWidth - padding.right}
                        y2={y}
                        stroke="#cbd5e1"
                        strokeDasharray={pct === 0 ? '' : '3 3'}
                        strokeOpacity={pct === 0 ? '0.7' : '0.4'}
                      />
                      <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8" className="font-medium">
                        {formatCompact(val)}
                      </text>
                    </g>
                  );
                })}

                {/* Bars */}
                {timeline.map((item, index) => {
                  const count = timeline.length;
                  const slotWidth = plotWidth / count;
                  const barWidth = Math.max(Math.min(slotWidth * 0.58, count <= 6 ? 38 : 22), 6);
                  const x = padding.left + index * slotWidth + (slotWidth - barWidth) / 2;

                  const rev = Number(item.revenue) || 0;
                  const cAmount = Number(item.cash) || 0;
                  const oAmount = Number(item.online) || 0;

                  const totalH = (rev / yMax) * plotHeight;
                  const cashH = rev > 0 ? (cAmount / rev) * totalH : 0;
                  const onlineH = rev > 0 ? (oAmount / rev) * totalH : 0;

                  const isHovered = hoveredIndex === index;
                  const showLabel = shouldShowLabel(index, count);

                  return (
                    <g
                      key={index}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      {/* Hover background bar */}
                      <rect
                        x={padding.left + index * slotWidth}
                        y={padding.top}
                        width={slotWidth}
                        height={plotHeight}
                        fill={isHovered ? '#6366f1' : 'transparent'}
                        fillOpacity="0.08"
                      />

                      {/* Cash segment (Bottom) */}
                      {cashH > 0 && (
                        <rect
                          x={x}
                          y={baselineY - cashH}
                          width={barWidth}
                          height={cashH}
                          fill="url(#absBarCashGrad)"
                          rx={onlineH === 0 ? 3 : 0}
                          className="transition-all"
                        />
                      )}

                      {/* Online segment (Top) */}
                      {onlineH > 0 && (
                        <rect
                          x={x}
                          y={baselineY - totalH}
                          width={barWidth}
                          height={onlineH}
                          fill="url(#absBarOnlineGrad)"
                          rx={3}
                          className="transition-all"
                        />
                      )}

                      {/* Value label above bar if tall enough */}
                      {totalH > 22 && (
                        <text
                          x={x + barWidth / 2}
                          y={baselineY - totalH - 4}
                          textAnchor="middle"
                          fontSize="8"
                          fill="#64748b"
                          className="font-bold"
                        >
                          {formatCompact(rev)}
                        </text>
                      )}

                      {/* X-axis label */}
                      {showLabel && (
                        <text
                          x={x + barWidth / 2}
                          y={svgHeight - 6}
                          textAnchor="middle"
                          fontSize="9"
                          fill={isHovered ? '#4f46e5' : '#64748b'}
                          className={`font-medium ${isHovered ? 'font-bold' : ''}`}
                        >
                          {item.shortLabel || item.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Bar Legend */}
              <div className="flex items-center justify-center gap-4 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block"></span>
                  <span>Cash Portion</span>
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2.5 h-2.5 rounded-xs bg-sky-600 inline-block"></span>
                  <span>Online Portion</span>
                </span>
                <span className="text-slate-400 hidden sm:inline">• Hover bar for exact figures</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5 font-medium">
            <Calendar size={12} className="text-indigo-600" />
            <span>Synced with Daily Abstract date pickers</span>
          </div>
          <button
            type="button"
            onClick={() => setShowFullSheetModal(true)}
            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
          >
            <span>Open Graphical Sheet</span>
            <ArrowRight size={11} />
          </button>
        </div>
      </div>

      {/* FULL GRAPHICAL ABSTRACT SHEET MODAL */}
      {showFullSheetModal && (
        <div
          className="fixed inset-0 backdrop-blur-sm bg-slate-900/40 z-50 flex items-center justify-center p-3 sm:p-5 print:static print:p-0 print:bg-white print:overflow-visible print:z-auto"
          onClick={() => setShowFullSheetModal(false)}
        >
          <div
            ref={printSheetRef}
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 print:max-h-none print:overflow-visible print:shadow-none print:border-none print:w-full print:max-w-none print:p-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10 print:static print:bg-white print:p-4 print:border-b-2 print:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 print:hidden">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <div className="hidden print:block text-[11px] font-bold text-slate-700 tracking-wider uppercase mb-1">
                    Pydah Group of Institutions • Stationery Management System
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 print:text-2xl print:font-extrabold">
                    Daily Transaction Abstract Sheet
                  </h2>
                  <p className="text-xs text-slate-500 print:text-xs print:text-slate-600 print:mt-1">
                    Comprehensive financial & volume breakdown for {isSingleDay ? formatDateLabel(startDate) : `${formatDateLabel(startDate)} to ${formatDateLabel(endDate)}`}
                  </p>
                  <div className="hidden print:block text-[10px] text-slate-500 mt-1">
                    Generated on: {new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} • Scope: Combined Cash & Online
                  </div>
                </div>
              </div>

              {/* Header Actions (Hidden in Print) */}
              <div className="flex items-center gap-2 no-print print:hidden">
                <button
                  type="button"
                  onClick={handlePrintClick}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs hover:shadow-sm transition-all cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullSheetModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-5 sm:p-6 space-y-5 print:p-4 print:space-y-4">
              {/* Executive Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4 print:gap-3">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 print:bg-slate-50 print:border-slate-300 print:p-3 print:rounded-lg">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase print:text-slate-700 print:text-[10px]">Gross Revenue</span>
                  <div className="text-xl font-extrabold text-slate-900 mt-1 print:text-lg">{formatCurrency(total)}</div>
                  <span className="text-[10px] text-slate-500 font-medium print:text-slate-600">100% of collection</span>
                </div>
                <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200/80 print:bg-emerald-50 print:border-emerald-300 print:p-3 print:rounded-lg">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase print:text-emerald-800 print:text-[10px]">Cash Collection</span>
                  <div className="text-xl font-extrabold text-emerald-950 mt-1 print:text-lg print:text-emerald-900">{formatCurrency(cash)}</div>
                  <span className="text-[10px] text-emerald-700 font-medium print:text-emerald-800">{cashPct}% share • {breakdown.cashCount || 0} txns</span>
                </div>
                <div className="bg-sky-50/70 p-3.5 rounded-xl border border-sky-200/80 print:bg-sky-50 print:border-sky-300 print:p-3 print:rounded-lg">
                  <span className="text-[11px] font-semibold text-sky-700 uppercase print:text-sky-800 print:text-[10px]">Online Collection</span>
                  <div className="text-xl font-extrabold text-sky-950 mt-1 print:text-lg print:text-sky-900">{formatCurrency(online)}</div>
                  <span className="text-[10px] text-sky-700 font-medium print:text-sky-800">{onlinePct}% share • {breakdown.onlineCount || 0} txns</span>
                </div>
                <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200/80 print:bg-indigo-50 print:border-indigo-300 print:p-3 print:rounded-lg">
                  <span className="text-[11px] font-semibold text-indigo-700 uppercase print:text-indigo-800 print:text-[10px]">Total Transactions</span>
                  <div className="text-xl font-extrabold text-indigo-950 mt-1 print:text-lg print:text-indigo-900">{transactionsCount}</div>
                  <span className="text-[10px] text-indigo-700 font-medium print:text-indigo-800">Avg ticket: {formatCurrency(avgTxn)}</span>
                </div>
              </div>

              {/* Hourly / Interval Breakdown Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden print:border-slate-300 print:rounded-lg">
                <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between print:bg-slate-100 print:border-slate-300">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Interval Performance Matrix</h4>
                  <span className="text-[11px] text-slate-500 print:text-slate-700 print:font-semibold">{timeline.length} Intervals</span>
                </div>
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full text-left text-xs print:text-[11px]">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 print:bg-slate-200 print:text-slate-900 print:border-b-2 print:border-slate-400">
                      <tr>
                        <th className="p-2.5 px-3 print:py-1.5 print:px-2.5">Interval / Date</th>
                        <th className="p-2.5 px-3 text-right print:py-1.5 print:px-2.5">Transactions</th>
                        <th className="p-2.5 px-3 text-right print:py-1.5 print:px-2.5">Cash Amount</th>
                        <th className="p-2.5 px-3 text-right print:py-1.5 print:px-2.5">Online Amount</th>
                        <th className="p-2.5 px-3 text-right print:py-1.5 print:px-2.5">Total Revenue</th>
                        <th className="p-2.5 px-3 text-right print:py-1.5 print:px-2.5">Share (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 print:divide-slate-300">
                      {timeline.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="text-center py-6 text-slate-400">
                            No transactions recorded for this period
                          </td>
                        </tr>
                      ) : (
                        timeline.map((row, i) => {
                          const rowRev = Number(row.revenue) || 0;
                          const rowShare = total > 0 ? ((rowRev / total) * 100).toFixed(1) : '0.0';
                          return (
                            <tr key={i} className="hover:bg-slate-50 transition-colors print:hover:bg-transparent">
                              <td className="p-2.5 px-3 font-semibold text-slate-900 print:py-1.5 print:px-2.5">{row.label}</td>
                              <td className="p-2.5 px-3 text-right font-medium print:py-1.5 print:px-2.5">{row.transactions}</td>
                              <td className="p-2.5 px-3 text-right text-emerald-700 font-semibold print:py-1.5 print:px-2.5 print:text-emerald-900">{formatCurrency(row.cash)}</td>
                              <td className="p-2.5 px-3 text-right text-sky-700 font-semibold print:py-1.5 print:px-2.5 print:text-sky-900">{formatCurrency(row.online)}</td>
                              <td className="p-2.5 px-3 text-right font-bold text-slate-900 print:py-1.5 print:px-2.5">{formatCurrency(rowRev)}</td>
                              <td className="p-2.5 px-3 text-right print:py-1.5 print:px-2.5">
                                <span className="inline-block bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full text-[10px] print:bg-transparent print:p-0 print:text-[11px]">
                                  {rowShare}%
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200 print:bg-slate-100 print:border-t-2 print:border-slate-500">
                      <tr>
                        <td className="p-2.5 px-3 print:py-2 print:px-2.5">Grand Total</td>
                        <td className="p-2.5 px-3 text-right print:py-2 print:px-2.5">{transactionsCount}</td>
                        <td className="p-2.5 px-3 text-right text-emerald-700 print:text-emerald-900 print:py-2 print:px-2.5">{formatCurrency(cash)}</td>
                        <td className="p-2.5 px-3 text-right text-sky-700 print:text-sky-900 print:py-2 print:px-2.5">{formatCurrency(online)}</td>
                        <td className="p-2.5 px-3 text-right text-indigo-700 print:text-indigo-900 print:py-2 print:px-2.5">{formatCurrency(total)}</td>
                        <td className="p-2.5 px-3 text-right print:py-2 print:px-2.5">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Print-only Document Footer */}
              <div className="hidden print:flex items-center justify-between pt-3 mt-4 border-t border-slate-300 text-[10px] text-slate-500">
                <span>Pydah Stationery Management System • Confidential Daily Financial Abstract</span>
                <span>Generated: {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AbstractChartCard;
