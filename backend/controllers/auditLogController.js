const asyncHandler = require('express-async-handler');
const { AuditLog, UserAudit } = require('../models/auditLogModel');
const { Product } = require('../models/productModel');
const { College } = require('../models/collegeModel');
const { Transaction } = require('../models/transactionModel');
const { StockEntry } = require('../models/stockEntryModel');
const { StockTransfer } = require('../models/stockTransferModel');
const { SubAdmin } = require('../models/subAdminModel');
const { getEmployeeConnection, connectEmployeeDB } = require('../config/employeeDb');

// POST /api/audit-logs
const createAuditLog = asyncHandler(async (req, res) => {
  const { productId, beforeQuantity, afterQuantity, notes, createdBy, batchId, collegeId } = req.body || {};

  if (!productId) {
    res.status(400);
    throw new Error('Product ID is required');
  }

  const parsedBefore = Number(beforeQuantity);
  const parsedAfter = Number(afterQuantity);

  if (!Number.isFinite(parsedBefore) || parsedBefore < 0) {
    res.status(400);
    throw new Error('Valid beforeQuantity is required');
  }

  if (!Number.isFinite(parsedAfter) || parsedAfter < 0) {
    res.status(400);
    throw new Error('Valid afterQuantity is required');
  }

  const product = await Product.findById(productId);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  
  // Validate College if provided
  if (collegeId) {
    const college = await College.findById(collegeId);
    if (!college) {
      res.status(404);
      throw new Error('College not found');
    }
  }

  const auditLog = await AuditLog.create({
    product: productId,
    college: collegeId || null,
    beforeQuantity: parsedBefore,
    afterQuantity: parsedAfter,
    notes: notes || '',
    createdBy: createdBy || 'System',
    batchId: batchId,
  });

  await auditLog.populate('product', 'name stock price forCourse branch');
  if (auditLog.college) {
    await auditLog.populate('college', 'name');
  }

  // Also record user activity audit
  try {
    await UserAudit.create({
      userName: createdBy || 'System',
      event: 'audit_adjustment',
      action: 'Stock Audit Submitted',
      description: `Submitted stock audit for ${product.name} (Changed: ${parsedBefore} -> ${parsedAfter})`,
      college: collegeId || null,
      collegeName: auditLog.college?.name || 'Central',
      status: 'warning',
      details: {
        product: product.name,
        beforeQuantity: parsedBefore,
        afterQuantity: parsedAfter,
        notes: notes || '',
        batchId,
      }
    });
  } catch (err) {}

  res.status(201).json(auditLog);
});

// GET /api/audit-logs?status=pending
const listAuditLogs = asyncHandler(async (req, res) => {
  const { status, collegeId } = req.query;
  const filter = {};

  if (status && status !== 'all') {
    filter.status = status;
  }
  
  if (collegeId) {
    filter.college = collegeId;
  }

  const logs = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .populate('product', 'name stock price forCourse branch isSet')
    .populate('college', 'name');

  res.json(logs);
});

// PATCH /api/audit-logs/:id/approve
const approveAuditLog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { approvedBy, notes } = req.body || {};

  const auditLog = await AuditLog.findById(id);
  if (!auditLog) {
    res.status(404);
    throw new Error('Audit log not found');
  }

  if (auditLog.status !== 'pending') {
    res.status(400);
    throw new Error('Only pending audit logs can be approved');
  }

  // Handle Stock Update
  if (auditLog.college) {
    const college = await College.findById(auditLog.college);
    if (!college) {
      res.status(404);
      throw new Error('College associated with this audit log not found');
    }

    const stockIndex = college.stock.findIndex(s => s.product.toString() === auditLog.product.toString());
    
    if (stockIndex > -1) {
      college.stock[stockIndex].quantity = auditLog.afterQuantity;
    } else {
      college.stock.push({
        product: auditLog.product,
        quantity: auditLog.afterQuantity
      });
    }
    await college.save();
  } else {
    const product = await Product.findById(auditLog.product);
    if (!product) {
      res.status(404);
      throw new Error('Linked product no longer exists');
    }
    product.stock = auditLog.afterQuantity;
    await product.save();
  }

  auditLog.status = 'approved';
  auditLog.approvedBy = approvedBy || 'System';
  auditLog.approvedAt = new Date();
  if (notes) {
    auditLog.notes = notes;
  }
  await auditLog.save();

  await auditLog.populate('product', 'name stock price forCourse branch');
  if (auditLog.college) {
    await auditLog.populate('college', 'name');
  }

  // Record approval in UserAudit
  try {
    await UserAudit.create({
      userName: approvedBy || 'System',
      event: 'audit_approval',
      action: 'Stock Audit Approved',
      description: `Approved audit adjustment for ${auditLog.product?.name || 'Product'} (New stock: ${auditLog.afterQuantity})`,
      college: auditLog.college?._id || auditLog.college || null,
      collegeName: auditLog.college?.name || 'Central',
      status: 'success',
      details: {
        product: auditLog.product?.name,
        beforeQuantity: auditLog.beforeQuantity,
        afterQuantity: auditLog.afterQuantity,
        approvedBy: approvedBy || 'System',
      }
    });
  } catch (err) {}

  res.json(auditLog);
});

// PATCH /api/audit-logs/:id/reject
const rejectAuditLog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { approvedBy, notes } = req.body || {};

  const auditLog = await AuditLog.findById(id);
  if (!auditLog) {
    res.status(404);
    throw new Error('Audit log not found');
  }

  if (auditLog.status !== 'pending') {
    res.status(400);
    throw new Error('Only pending audit logs can be rejected');
  }

  auditLog.status = 'rejected';
  auditLog.approvedBy = approvedBy || 'System';
  auditLog.approvedAt = new Date();
  if (notes) {
    auditLog.notes = `${auditLog.notes ? `${auditLog.notes}\n` : ''}Rejected: ${notes}`;
  }
  await auditLog.save();

  await auditLog.populate('product', 'name stock price forCourse branch');
  if (auditLog.college) {
    await auditLog.populate('college', 'name');
  }

  // Record rejection in UserAudit
  try {
    await UserAudit.create({
      userName: approvedBy || 'System',
      event: 'audit_approval',
      action: 'Stock Audit Rejected',
      description: `Rejected audit adjustment for ${auditLog.product?.name || 'Product'}. Notes: ${notes || 'No note'}`,
      college: auditLog.college?._id || auditLog.college || null,
      collegeName: auditLog.college?.name || 'Central',
      status: 'failed',
      details: {
        product: auditLog.product?.name,
        beforeQuantity: auditLog.beforeQuantity,
        afterQuantity: auditLog.afterQuantity,
        rejectedBy: approvedBy || 'System',
        notes: notes || '',
      }
    });
  } catch (err) {}

  res.json(auditLog);
});

// POST /api/audit-logs/user-audits - Record a generic user audit
const recordUserAudit = asyncHandler(async (req, res) => {
  const {
    userId,
    userName,
    empNo,
    userRole,
    college,
    collegeName,
    event,
    action,
    description,
    details,
    loginTime,
    status
  } = req.body;

  if (!userName || !action) {
    res.status(400);
    throw new Error('User name and action are required');
  }

  const created = await UserAudit.create({
    userId: userId || null,
    userName: String(userName).trim(),
    empNo: empNo ? String(empNo).trim() : '',
    userRole: userRole ? String(userRole).trim() : 'User',
    college: college || null,
    collegeName: collegeName ? String(collegeName).trim() : '',
    event: event || 'other',
    action: String(action).trim(),
    description: description ? String(description).trim() : '',
    details: details || {},
    loginTime: loginTime ? new Date(loginTime) : new Date(),
    ip: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
    status: status || 'success',
  });

  res.status(201).json(created);
});

// GET /api/audit-logs/user-audits - Get list of user audits (HRMS-style)
const getUserAudits = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 25), 100);
  const { search, event, startDate, endDate, userId, collegeId } = req.query;

  const filter = {};

  if (userId) {
    filter.userId = userId;
  }

  if (collegeId) {
    filter.college = collegeId;
  }

  if (event && event !== 'all') {
    filter.event = event;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  if (search && search.trim()) {
    const s = search.trim();
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [
      { userName: regex },
      { empNo: regex },
      { userRole: regex },
      { action: regex },
      { description: regex },
      { collegeName: regex },
      { event: regex },
    ];
  }

  // 1. Fetch from explicit UserAudit model
  const userAudits = await UserAudit.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  let combined = [...userAudits];

  // 2. Synthesize additional system actions if filter allows, so table is rich with transactions & movements
  const wantsAllOrDist = !event || event === 'all' || event === 'distribution';
  const wantsAllOrStock = !event || event === 'all' || event === 'stock_entry';
  const wantsAllOrTransfer = !event || event === 'all' || event === 'stock_transfer';

  const txFilter = {};
  if (startDate || endDate) {
    txFilter.transactionDate = {};
    if (startDate) txFilter.transactionDate.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      txFilter.transactionDate.$lte = end;
    }
  }

  // Pre-load SubAdmins and connect to Employee DB (HRMS) to resolve real staff names & employee IDs
  let conn = getEmployeeConnection();
  if (!conn) {
    try { conn = await connectEmployeeDB(); } catch (e) {}
  }

  let subAdmins = [];
  try {
    subAdmins = await SubAdmin.find({}).lean();
  } catch (e) {}

  const collegeStaffMap = {};
  const idStaffMap = {};

  for (const sa of subAdmins) {
    let staffName = sa.name;
    let staffEmpNo = sa.empNo || '';
    let staffRole = sa.role || 'Editor';

    if (conn) {
      try {
        const key = String(sa.empNo || sa.name || '').trim();
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const emp = await conn.collection('employees').findOne({
          $or: [
            { emp_no: key },
            { employee_name: { $regex: `^${escaped}$`, $options: 'i' } }
          ]
        }, { projection: { employee_name: 1, emp_no: 1, designation: 1 } });
        if (emp) {
          if (emp.employee_name) staffName = emp.employee_name;
          if (emp.emp_no) staffEmpNo = emp.emp_no;
          if (emp.designation && !sa.role) staffRole = emp.designation;
        }
      } catch (err) {}
    }

    const staffInfo = { staffName, staffEmpNo, staffRole };
    idStaffMap[sa._id.toString()] = staffInfo;
    if (sa.assignedCollege) {
      collegeStaffMap[sa.assignedCollege.toString()] = staffInfo;
    }
    if (sa.assignedBranch) {
      collegeStaffMap[sa.assignedBranch.toString()] = staffInfo;
    }
  }

  const defaultStaff = Object.values(idStaffMap).find(s => s.staffRole !== 'Administrator') ||
    Object.values(idStaffMap)[0] || {
      staffName: 'Staff Incharge',
      staffEmpNo: 'STAFF',
      staffRole: 'Store Incharge'
    };

  if (wantsAllOrDist) {
    try {
      const txs = await Transaction.find(txFilter)
        .populate('collegeId', 'name')
        .sort({ transactionDate: -1 })
        .limit(100)
        .lean();

      txs.forEach(tx => {
        const isEmp = tx.transactionType === 'employee';
        const targetName = isEmp ? (tx.employee?.name || 'Staff') : (tx.student?.name || 'Student');
        const targetId = isEmp ? (tx.employee?.empId || tx.employee?.empNo || '') : (tx.student?.studentId || '');
        const collegeName = tx.collegeId?.name || tx.branchId?.name || 'Campus Counter';
        const itemCount = Array.isArray(tx.items) ? tx.items.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0) : 0;
        const total = tx.totalAmount || 0;
        
        // Resolve real staff member instead of generic placeholder
        let sName = tx.createdByName || '';
        let sEmpNo = tx.createdByEmpNo || '';
        let sRole = 'Editor';

        if (!sName && tx.createdBy && idStaffMap[tx.createdBy.toString()]) {
          sName = idStaffMap[tx.createdBy.toString()].staffName;
          sEmpNo = idStaffMap[tx.createdBy.toString()].staffEmpNo;
          sRole = idStaffMap[tx.createdBy.toString()].staffRole;
        }

        if (!sName) {
          const colKey = tx.collegeId?._id?.toString() || tx.collegeId?.toString() || tx.branchId?.toString();
          if (colKey && collegeStaffMap[colKey]) {
            sName = collegeStaffMap[colKey].staffName;
            sEmpNo = collegeStaffMap[colKey].staffEmpNo;
            sRole = collegeStaffMap[colKey].staffRole;
          }
        }

        if (!sName) {
          sName = defaultStaff.staffName;
          sEmpNo = defaultStaff.staffEmpNo;
          sRole = defaultStaff.staffRole;
        }

        combined.push({
          _id: `tx_${tx._id}`,
          userName: sName,
          empNo: sEmpNo,
          userRole: sRole,
          collegeName,
          event: 'distribution',
          action: isEmp ? 'Employee Stock Distribution' : 'Student Stock Distribution',
          description: `Distributed ${itemCount} item(s) to ${targetName} (${targetId}) • ₹${total.toLocaleString('en-IN')}`,
          loginTime: tx.transactionDate || tx.createdAt,
          createdAt: tx.transactionDate || tx.createdAt,
          ip: 'Internal Counter',
          userAgent: 'Stationary Counter Portal',
          status: 'success',
          details: {
            transactionId: tx.transactionId,
            type: tx.transactionType,
            recipient: targetName,
            recipientId: targetId,
            paymentMethod: tx.paymentMethod,
            totalAmount: tx.totalAmount,
            isPaid: tx.isPaid,
            items: (tx.items || []).map(i => ({ name: i.name, quantity: i.quantity, price: i.price, total: i.total })),
          }
        });
      });
    } catch (e) {}
  }

  if (wantsAllOrStock) {
    try {
      const entries = await StockEntry.find({})
        .populate('vendor', 'name')
        .populate('college', 'name')
        .sort({ entryDate: -1 })
        .limit(50)
        .lean();

      entries.forEach(ent => {
        const entStaff = ent.receivedBy || defaultStaff.staffName || 'Store Incharge';
        const entEmpNo = defaultStaff.staffEmpNo || 'INCHARGE';
        combined.push({
          _id: `se_${ent._id}`,
          userName: entStaff,
          empNo: entEmpNo,
          userRole: 'Editor',
          collegeName: ent.college?.name || 'Central Store',
          event: 'stock_entry',
          action: 'Stock Received from Vendor',
          description: `Received goods (Invoice: ${ent.invoiceNumber || 'N/A'}) from vendor ${ent.vendor?.name || 'Vendor'} • Total: ₹${(ent.totalAmount || 0).toLocaleString('en-IN')}`,
          loginTime: ent.entryDate || ent.createdAt,
          createdAt: ent.entryDate || ent.createdAt,
          ip: 'Store Inventory Station',
          userAgent: 'Stationary Desktop',
          status: 'success',
          details: {
            invoiceNumber: ent.invoiceNumber,
            vendor: ent.vendor?.name,
            totalAmount: ent.totalAmount,
            items: ent.items,
          }
        });
      });
    } catch (e) {}
  }

  if (wantsAllOrTransfer) {
    try {
      const transfers = await StockTransfer.find({})
        .populate('fromCollege', 'name')
        .populate('toCollege', 'name')
        .sort({ transferDate: -1 })
        .limit(50)
        .lean();

      transfers.forEach(tr => {
        const trStaff = tr.initiatedBy || defaultStaff.staffName || 'Logistics Incharge';
        const trEmpNo = defaultStaff.staffEmpNo || 'LOGISTICS';
        combined.push({
          _id: `st_${tr._id}`,
          userName: trStaff,
          empNo: trEmpNo,
          userRole: 'Editor',
          collegeName: `${tr.fromCollege?.name || 'From'} → ${tr.toCollege?.name || 'To'}`,
          event: 'stock_transfer',
          action: 'Inter-College Stock Transfer',
          description: `Transferred stock from ${tr.fromCollege?.name || 'Origin'} to ${tr.toCollege?.name || 'Destination'} (Status: ${tr.status || 'completed'})`,
          loginTime: tr.transferDate || tr.createdAt,
          createdAt: tr.transferDate || tr.createdAt,
          ip: 'Campus Warehouse',
          userAgent: 'Stationary Portal',
          status: 'success',
          details: {
            fromCollege: tr.fromCollege?.name,
            toCollege: tr.toCollege?.name,
            status: tr.status,
            items: tr.items,
          }
        });
      });
    } catch (e) {}
  }

  // Filter combined if search was applied to synthesized rows too
  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    combined = combined.filter(c =>
      (c.userName && c.userName.toLowerCase().includes(s)) ||
      (c.empNo && c.empNo.toLowerCase().includes(s)) ||
      (c.action && c.action.toLowerCase().includes(s)) ||
      (c.description && c.description.toLowerCase().includes(s)) ||
      (c.collegeName && c.collegeName.toLowerCase().includes(s)) ||
      (c.event && c.event.toLowerCase().includes(s))
    );
  }

  // Sort all combined by createdAt descending
  combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const total = combined.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const skip = (page - 1) * limit;
  const paginated = combined.slice(skip, skip + limit);

  // Compute summary metrics for stats
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const eventsToday = combined.filter(c => new Date(c.createdAt || 0) >= oneDayAgo).length;
  const uniqueUsers = new Set(combined.map(c => c.userName)).size;
  const loginCount = combined.filter(c => c.event === 'login').length;
  const distributionCount = combined.filter(c => c.event === 'distribution').length;
  const stockActionCount = combined.filter(c => c.event === 'stock_entry' || c.event === 'stock_transfer').length;

  res.json({
    success: true,
    data: paginated,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
    stats: {
      totalAudits: total,
      eventsToday,
      uniqueUsers,
      loginCount,
      distributionCount,
      stockActionCount,
    }
  });
});

// GET /api/audit-logs/user-audits/stats
const getUserAuditStats = asyncHandler(async (req, res) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [totalAudits, eventsToday, uniqueUsersAgg, loginCount] = await Promise.all([
    UserAudit.countDocuments({}),
    UserAudit.countDocuments({ createdAt: { $gte: oneDayAgo } }),
    UserAudit.distinct('userName'),
    UserAudit.countDocuments({ event: 'login' }),
  ]);

  res.json({
    totalAudits,
    eventsToday,
    uniqueUsers: uniqueUsersAgg.length,
    loginCount,
  });
});

module.exports = {
  createAuditLog,
  listAuditLogs,
  approveAuditLog,
  rejectAuditLog,
  recordUserAudit,
  getUserAudits,
  getUserAuditStats,
};
