const asyncHandler = require('express-async-handler');
const { Transaction } = require('../models/transactionModel');
const { Product } = require('../models/productModel');
const { College } = require('../models/collegeModel');
const { getMySqlPool } = require('../config/mysql');
const mongoose = require('mongoose');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
  const { collegeId, startDate, endDate } = req.query;
  const filter = {};
  
  if (collegeId) {
    filter.collegeId = new mongoose.Types.ObjectId(collegeId);
  }

  // --- Abstract Date Range ---
  let abstractStart;
  let abstractEnd;

  if (startDate) {
    abstractStart = new Date(startDate.includes('T') ? startDate : `${startDate}T00:00:00`);
    if (isNaN(abstractStart.getTime())) {
      abstractStart = new Date();
      abstractStart.setHours(0, 0, 0, 0);
    }
  } else {
    abstractStart = new Date();
    abstractStart.setHours(0, 0, 0, 0);
  }

  if (endDate) {
    abstractEnd = new Date(endDate.includes('T') ? endDate : `${endDate}T23:59:59.999`);
    if (isNaN(abstractEnd.getTime())) {
      abstractEnd = new Date(abstractStart);
      abstractEnd.setHours(23, 59, 59, 999);
    }
  } else if (startDate) {
    abstractEnd = new Date(abstractStart);
    abstractEnd.setHours(23, 59, 59, 999);
  } else {
    abstractEnd = new Date();
    abstractEnd.setHours(23, 59, 59, 999);
  }

  // --- MySQL Stats (Students) ---
  const pool = getMySqlPool();
  let totalStudents = 0;
  
  if (pool) {
    const tableName = process.env.DB_STUDENTS_TABLE || 'students';
    try {
      // For now, only total count is feasible without complex dues join here
      // We can add "paid" vs "unpaid" if we have a way to track it efficiently in SQL
      // Only count active students - passed out / course completed students are excluded
      const [rows] = await pool.query(`SELECT COUNT(id) as total FROM \`${tableName}\` WHERE student_status IN ('Regular', 'Re-Joined', 'Rejoined')`);
      totalStudents = rows[0]?.total || 0;
    } catch (err) {
      console.error('MySQL Dashboard Error:', err);
    }
  }

  // --- MongoDB Stats (Transactions & Revenue) ---
  // Revenue Aggregation
  const revenueStats = await Transaction.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: { $cond: [{ $eq: ['$isPaid', true] }, '$totalAmount', 0] } },
        pendingRevenue: { $sum: { $cond: [{ $eq: ['$isPaid', false] }, '$totalAmount', 0] } },
        totalTransactions: { $sum: 1 },
        todayRevenue: { 
          $sum: { 
            $cond: [
              { 
                $and: [
                  { $eq: ['$isPaid', true] }, 
                  { $gte: ['$transactionDate', abstractStart] },
                  { $lte: ['$transactionDate', abstractEnd] }
                ] 
              }, 
              '$totalAmount', 
              0
            ] 
          } 
        },
        todayCashRevenue: { 
          $sum: { 
            $cond: [
              { 
                $and: [
                  { $eq: ['$isPaid', true] }, 
                  { $gte: ['$transactionDate', abstractStart] },
                  { $lte: ['$transactionDate', abstractEnd] }
                ] 
              }, 
              { $ifNull: ['$cashAmount', 0] }, 
              0
            ] 
          } 
        },
        todayOnlineRevenue: { 
          $sum: { 
            $cond: [
              { 
                $and: [
                  { $eq: ['$isPaid', true] }, 
                  { $gte: ['$transactionDate', abstractStart] },
                  { $lte: ['$transactionDate', abstractEnd] }
                ] 
              }, 
              { $ifNull: ['$onlineAmount', 0] }, 
              0
            ] 
          } 
        },
        todayTransactions: {
          $sum: { 
            $cond: [
              { 
                $and: [
                  { $gte: ['$transactionDate', abstractStart] },
                  { $lte: ['$transactionDate', abstractEnd] }
                ] 
              }, 
              1, 
              0
            ] 
          }
        }
      }
    }
  ]);

  const rev = revenueStats[0] || {
    totalRevenue: 0,
    pendingRevenue: 0,
    totalTransactions: 0,
    todayRevenue: 0,
    todayCashRevenue: 0,
    todayOnlineRevenue: 0,
    todayTransactions: 0
  };

  // --- Product & Stock Stats ---
  let totalProducts = 0;
  let lowStockItems = 0;
  let totalStockValue = 0;

  if (collegeId) {
    const college = await College.findById(collegeId).populate('stock.product', 'name price lowStockThreshold');
    if (college && Array.isArray(college.stock)) {
      totalProducts = college.stock.filter(item => item?.product).length;
      college.stock.forEach(item => {
        if (!item?.product) return;
        const qty = Number(item.quantity) || 0;
        const price = Number(item.product.price) || 0;
        const threshold = typeof item.product.lowStockThreshold === 'number' ? item.product.lowStockThreshold : 10;
        totalStockValue += qty * price;
        if (qty < threshold) {
          lowStockItems++;
        }
      });
    }
  } else {
    totalProducts = await Product.countDocuments();
    lowStockItems = await Product.countDocuments({
      $expr: { $lt: ['$stock', { $ifNull: ['$lowStockThreshold', 10] }] }
    });
    const stockAgg = await Product.aggregate([
      {
        $group: {
          _id: null,
          totalStockValue: {
            $sum: {
              $multiply: [
                { $ifNull: ['$stock', 0] },
                { $ifNull: ['$price', 0] }
              ]
            }
          }
        }
      }
    ]);
    totalStockValue = stockAgg[0]?.totalStockValue || 0;
  }

  // --- Recent Transactions ---
  const recentTransactions = await Transaction.find(filter)
    .sort({ transactionDate: -1 })
    .limit(8)
    .lean();

  // --- Zero-Stock Dues List ---
  const zeroStockDuesList = await Transaction.aggregate([
    { 
      $match: { 
        ...filter, 
        isPaid: true,
        $or: [
          { 'items.status': 'partial' },
          { 'items': { $elemMatch: { isSet: true, 'setComponents.taken': false } } }
        ]
      } 
    },
    {
      $project: {
        student: 1,
        items: 1,
        transactionDate: 1
      }
    },
    { $sort: { transactionDate: -1 } }
  ]);

  // Transform zeroStockDuesList to match frontend expectation
  const zeroStockMap = new Map();
  zeroStockDuesList.forEach(txn => {
    const sId = txn.student?.sqlId || txn.student?.studentId;
    if (!sId) return;

    const partialItems = [];
    (txn.items || []).forEach(item => {
      // Include item if it's explicitly partial, OR if it's a set with missing components
      const hasMissingComponents = item.isSet && item.setComponents && item.setComponents.some(c => c.taken === false);
      
      if (item.status === 'partial' || hasMissingComponents) {
        if (item.isSet && item.setComponents && item.setComponents.length > 0) {
          const missingComps = item.setComponents.filter(c => c.taken === false).map(c => c.name);
          if (missingComps.length > 0) {
            // Even if the set status might say 'fulfilled', if we caught it via hasMissingComponents, list it.
            // If it's a legacy partial with no known missing components, just show the set name.
            partialItems.push(`${item.name} (Missing: ${missingComps.join(', ')})`);
          } else {
            partialItems.push(item.name);
          }
        } else {
          partialItems.push(item.name);
        }
      }
    });

    if (partialItems.length === 0) return;

    if (!zeroStockMap.has(sId)) {
      zeroStockMap.set(sId, {
        student: txn.student,
        studentId: sId,
        items: new Set(partialItems),
        transactionDate: txn.transactionDate
      });
    } else {
      partialItems.forEach(name => zeroStockMap.get(sId).items.add(name));
    }
  });

  const zeroStockDuesData = Array.from(zeroStockMap.values()).map(entry => ({
    ...entry,
    items: Array.from(entry.items)
  }));

  const zeroStockDuesStudents = zeroStockDuesData.length;

  // --- Abstract Timeline & Graphical Chart Data ---
  const isSingleDay = abstractStart.toDateString() === abstractEnd.toDateString();

  // If single day (default Today), chart the recent 5 days for the graphical bar graph
  let chartStart = new Date(abstractStart);
  let chartEnd = new Date(abstractEnd);

  if (isSingleDay) {
    chartStart = new Date(abstractStart);
    chartStart.setDate(chartStart.getDate() - 4);
    chartStart.setHours(0, 0, 0, 0);
  }

  const abstractTxFilter = {
    transactionDate: { $gte: chartStart, $lte: chartEnd }
  };
  if (collegeId) {
    abstractTxFilter.collegeId = new mongoose.Types.ObjectId(collegeId);
  }

  const abstractTransactions = await Transaction.find(abstractTxFilter)
    .select('totalAmount cashAmount onlineAmount isPaid paymentMethod transactionDate')
    .lean();

  const timelineMap = new Map();

  let chartCashTotal = 0;
  let chartOnlineTotal = 0;
  let chartCashCount = 0;
  let chartOnlineCount = 0;
  let chartPaidCount = 0;
  let chartUnpaidCount = 0;

  // Build daily buckets from chartStart to chartEnd
  const cur = new Date(chartStart);
  cur.setHours(0, 0, 0, 0);
  const endBoundary = new Date(chartEnd);

  while (cur <= endBoundary) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const dateKey = `${yyyy}-${mm}-${dd}`;
    const dayLabel = cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const shortLabel = `${cur.getDate()} ${cur.toLocaleDateString('en-US', { month: 'short' })}`;

    timelineMap.set(dateKey, {
      key: dateKey,
      label: dayLabel,
      shortLabel,
      revenue: 0,
      cash: 0,
      online: 0,
      transactions: 0
    });

    cur.setDate(cur.getDate() + 1);
  }

  abstractTransactions.forEach(tx => {
    const txDate = new Date(tx.transactionDate);
    const isPaid = Boolean(tx.isPaid);
    const amount = Number(tx.totalAmount) || 0;
    const cash = Number(tx.cashAmount) || 0;
    const online = Number(tx.onlineAmount) || 0;

    if (isPaid) {
      chartPaidCount++;
      chartCashTotal += cash;
      chartOnlineTotal += online;
      if (cash > 0) chartCashCount++;
      if (online > 0) chartOnlineCount++;
    } else {
      chartUnpaidCount++;
    }

    const yyyy = txDate.getFullYear();
    const mm = String(txDate.getMonth() + 1).padStart(2, '0');
    const dd = String(txDate.getDate()).padStart(2, '0');
    const dateKey = `${yyyy}-${mm}-${dd}`;

    if (timelineMap.has(dateKey)) {
      const bucket = timelineMap.get(dateKey);
      bucket.transactions++;
      if (isPaid) {
        bucket.revenue += amount;
        bucket.cash += cash;
        bucket.online += online;
      }
    }
  });

  const chartTimeline = Array.from(timelineMap.values());
  chartTimeline.sort((a, b) => String(a.key).localeCompare(String(b.key)));

  const chartTotalRevenue = chartCashTotal + chartOnlineTotal;
  const chartCashPercent = chartTotalRevenue > 0 ? Math.round((chartCashTotal / chartTotalRevenue) * 100) : 0;
  const chartOnlinePercent = chartTotalRevenue > 0 ? Math.max(0, 100 - chartCashPercent) : 0;

  const abstractChartData = {
    isSingleDay,
    isRecent5Days: isSingleDay,
    startDate: chartStart.toISOString().split('T')[0],
    endDate: chartEnd.toISOString().split('T')[0],
    timeline: chartTimeline,
    paymentBreakdown: {
      cashAmount: chartCashTotal,
      onlineAmount: chartOnlineTotal,
      totalRevenue: chartTotalRevenue,
      cashPercent: chartCashPercent,
      onlinePercent: chartOnlinePercent,
      cashCount: chartCashCount,
      onlineCount: chartOnlineCount,
      paidTransactions: chartPaidCount,
      unpaidTransactions: chartUnpaidCount,
      totalTransactions: abstractTransactions.length
    }
  };

  let latestTransactionDate = null;
  if (recentTransactions.length > 0 && recentTransactions[0].transactionDate) {
    const d = new Date(recentTransactions[0].transactionDate);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    latestTransactionDate = `${yyyy}-${mm}-${dd}`;
  }

  res.json({
    totalStudents,
    paidStudents: 0, // Placeholder till SQL logic refined
    unpaidStudents: 0, // Placeholder till SQL logic refined
    totalTransactions: rev.totalTransactions,
    totalRevenue: rev.totalRevenue,
    pendingRevenue: rev.pendingRevenue,
    totalProducts,
    totalStockValue,
    lowStockItems,
    todayTransactions: rev.todayTransactions,
    todayRevenue: rev.todayRevenue,
    todayCashRevenue: rev.todayCashRevenue || 0,
    todayOnlineRevenue: rev.todayOnlineRevenue || 0,
    zeroStockDuesStudents,
    zeroStockDuesData,
    recentTransactions,
    abstractChartData,
    latestTransactionDate
  });
});

module.exports = {
  getDashboardStats
};
