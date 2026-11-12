const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const { SubAdmin, Role } = require('../models/subAdminModel');
const { UserAudit } = require('../models/auditLogModel');
const { getEmployeeConnection, connectEmployeeDB } = require('../config/employeeDb');

// System default roles
const DEFAULT_SYSTEM_ROLES = [
  {
    roleKey: 'Administrator',
    label: 'Administrator',
    description: 'Full system access with complete administrative privileges across all modules, settings, and branches',
    isSystem: true,
    permissions: [
      'dashboard:full',
      'course-dashboard:full',
      'employee-dashboard:full',
      'stock-products:full',
      'stock-add:full',
      'stock-entries:full',
      'stock-vendors:full',
      'stock-transfers:full',
      'change-transaction-date:full',
      'reports-daily:full',
      'reports-monthly:full',
      'reports-stock:full',
      'profit-report:full',
      'student-due:full',
      'audit-log-entry:full',
      'audit-log-approval:full',
      'settings:full'
    ]
  },
  {
    roleKey: 'Editor',
    label: 'Editor',
    description: 'Standard editor role with permissions for managing academic stock, transfers, and viewing reports.',
    isSystem: true,
    permissions: [
      'dashboard:view',
      'course-dashboard:view',
      'employee-dashboard:view',
      'stock-products:full',
      'stock-add:full',
      'stock-entries:full',
      'stock-vendors:full',
      'stock-transfers:full',
      'reports-daily:view',
      'reports-monthly:view',
      'reports-stock:view',
      'student-due:view'
    ]
  },
  {
    roleKey: 'Viewer',
    label: 'Viewer',
    description: 'Read-only access across allowed dashboards, stock records, and transaction reports.',
    isSystem: true,
    permissions: [
      'dashboard:view',
      'course-dashboard:view',
      'employee-dashboard:view',
      'stock-entries:view',
      'stock-transfers:view',
      'reports-daily:view',
      'reports-monthly:view',
      'reports-stock:view'
    ]
  }
];

// Helper to seed/ensure default system roles exist in DB
const ensureSystemRoles = async () => {
  try {
    for (const def of DEFAULT_SYSTEM_ROLES) {
      const existing = await Role.findOne({ 
        $or: [
          { roleKey: def.roleKey },
          { roleKey: def.roleKey.toLowerCase() },
          { label: { $regex: `^${def.label}$`, $options: 'i' } }
        ]
      });
      if (!existing) {
        await Role.create(def);
      }
    }
  } catch (err) {
    console.error('Error ensuring system roles:', err.message);
  }
};

// GET /api/roles
const listRoles = asyncHandler(async (req, res) => {
  await ensureSystemRoles();
  const roles = await Role.find({}).sort({ isSystem: -1, createdAt: 1 });
  
  // Also count how many users currently have each role
  const subadmins = await SubAdmin.find({}).select('role');
  const roleCounts = {};
  subadmins.forEach(sa => {
    if (sa.role) {
      const rKey = sa.role.trim();
      roleCounts[rKey] = (roleCounts[rKey] || 0) + 1;
      const rLower = rKey.toLowerCase();
      if (rLower !== rKey) {
        roleCounts[rLower] = (roleCounts[rLower] || 0) + 1;
      }
    }
  });

  const formatted = roles.map(r => ({
    _id: r._id,
    roleKey: r.roleKey,
    label: r.label,
    description: r.description || '',
    permissions: r.permissions || [],
    isSystem: !!r.isSystem,
    userCount: roleCounts[r.roleKey] || roleCounts[r.label] || 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }));

  res.json(formatted);
});

// POST /api/roles
const createRole = asyncHandler(async (req, res) => {
  const { roleKey, label, description, permissions } = req.body;
  if (!label || !String(label).trim()) {
    res.status(400);
    throw new Error('Role name is required');
  }

  const cleanLabel = String(label).trim();
  const slug = cleanLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const cleanKey = (roleKey && String(roleKey).trim()) ? String(roleKey).trim() : slug;

  if (!cleanKey || cleanKey.length < 2) {
    res.status(400);
    throw new Error('Valid role key or name is required (minimum 2 characters)');
  }

  // Check if role key or label already exists
  const existing = await Role.findOne({
    $or: [
      { roleKey: cleanKey },
      { roleKey: { $regex: `^${cleanKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      { label: { $regex: `^${cleanLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }
    ]
  });

  if (existing) {
    res.status(400);
    throw new Error('A role with this name or key already exists');
  }

  const created = await Role.create({
    roleKey: cleanKey,
    label: cleanLabel,
    description: description ? String(description).trim() : '',
    permissions: Array.isArray(permissions) ? permissions : [],
    isSystem: false
  });

  try {
    await UserAudit.create({
      userName: 'Administrator',
      event: 'user_management',
      action: 'Role Created',
      description: `Created new custom role: ${cleanLabel} (${cleanKey})`,
      status: 'success',
      details: { roleKey: cleanKey, label: cleanLabel, description }
    });
  } catch (err) {}

  res.status(201).json({
    _id: created._id,
    roleKey: created.roleKey,
    label: created.label,
    description: created.description,
    permissions: created.permissions,
    isSystem: false,
    userCount: 0
  });
});

// PUT /api/roles/:roleKey
const updateRole = asyncHandler(async (req, res) => {
  const { roleKey } = req.params;
  const { label, description, permissions } = req.body;

  const role = await Role.findOne({
    $or: [
      { roleKey },
      { _id: roleKey.match(/^[0-9a-fA-F]{24}$/) ? roleKey : null }
    ]
  });

  if (!role) {
    res.status(404);
    throw new Error('Role not found');
  }

  if (label && String(label).trim()) {
    role.label = String(label).trim();
  }

  if (description !== undefined) {
    role.description = String(description).trim();
  }

  // If role is Administrator, permissions cannot be restricted
  if (role.roleKey === 'Administrator' || role.roleKey === 'super_admin') {
    // Administrator retains full access
  } else if (permissions !== undefined) {
    role.permissions = Array.isArray(permissions) ? permissions : [];
  }

  const saved = await role.save();

  try {
    await UserAudit.create({
      userName: 'Administrator',
      event: 'user_management',
      action: 'Role Configured',
      description: `Updated role configuration for ${saved.label} (${saved.roleKey})`,
      status: 'success',
      details: { roleKey: saved.roleKey, label: saved.label, permissionsCount: saved.permissions?.length }
    });
  } catch (err) {}

  res.json({
    _id: saved._id,
    roleKey: saved.roleKey,
    label: saved.label,
    description: saved.description,
    permissions: saved.permissions,
    isSystem: saved.isSystem
  });
});

// DELETE /api/roles/:roleKey
const deleteRole = asyncHandler(async (req, res) => {
  const { roleKey } = req.params;

  const role = await Role.findOne({
    $or: [
      { roleKey },
      { _id: roleKey.match(/^[0-9a-fA-F]{24}$/) ? roleKey : null }
    ]
  });

  if (!role) {
    res.status(404);
    throw new Error('Role not found');
  }

  if (role.isSystem || ['Administrator', 'Editor', 'Viewer'].includes(role.roleKey)) {
    res.status(400);
    throw new Error('System roles cannot be deleted');
  }

  // Check if any subAdmin is currently using this role
  const assignedUsersCount = await SubAdmin.countDocuments({
    $or: [
      { role: role.roleKey },
      { role: role.label }
    ]
  });

  if (assignedUsersCount > 0) {
    res.status(400);
    throw new Error(`Cannot delete role "${role.label}" because ${assignedUsersCount} user(s) are currently assigned to it. Please reassign those users first.`);
  }

  await Role.findByIdAndDelete(role._id);

  try {
    await UserAudit.create({
      userName: 'Administrator',
      event: 'user_management',
      action: 'Role Deleted',
      description: `Deleted custom role: ${role.label} (${role.roleKey})`,
      status: 'warning',
      details: { roleKey: role.roleKey, label: role.label }
    });
  } catch (err) {}

  res.json({ message: `Role "${role.label}" deleted successfully` });
});

// GET /api/subadmins
const listSubAdmins = asyncHandler(async (req, res) => {
  const subadmins = await SubAdmin.find({})
    .populate('assignedCollege', 'name')
    .populate('assignedBranch', 'name')
    .select('-password');
    
  let conn = getEmployeeConnection();
  if (!conn) {
    try {
      conn = await connectEmployeeDB();
    } catch (e) {}
  }

  const results = await Promise.all(subadmins.map(async (sa) => {
    const college = sa.assignedCollege || sa.assignedBranch;
    let employeeName = null;
    let empNo = sa.empNo || null;

    if (sa.role === 'Administrator' || sa.name === 'superadmin') {
      return { 
        _id: sa._id, 
        name: 'Administrator', 
        empNo: null,
        employeeName: 'Administrator',
        role: 'Administrator', 
        permissions: sa.permissions || [], 
        assignedCollege: college,
        assignedBranch: college
      };
    }

    if (conn) {
      try {
        const searchKey = String(sa.empNo || sa.name || '').trim();
        const escaped = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const emp = await conn.collection('employees').findOne({
          $or: [
            { emp_no: searchKey },
            { employee_name: { $regex: `^${escaped}$`, $options: 'i' } }
          ]
        }, { projection: { employee_name: 1, emp_no: 1 } });
        if (emp) {
          employeeName = emp.employee_name;
          if (!empNo) empNo = emp.emp_no;
        }
      } catch (err) {}
    }

    return { 
      _id: sa._id, 
      name: sa.name, 
      empNo: empNo || sa.empNo || null,
      employeeName,
      role: sa.role, 
      permissions: sa.permissions || [], 
      assignedCollege: college,
      assignedBranch: college
    };
  }));

  res.json(results);
});

// POST /api/subadmins
const createSubAdmin = asyncHandler(async (req, res) => {
  const { name, empNo, password, role, permissions, assignedCollege, assignedBranch } = req.body;
  
  const targetCollege = assignedCollege || assignedBranch;

  if (!name && !empNo) {
    res.status(400);
    throw new Error('Name or Employee ID is required');
  }

  const effectiveName = (name || empNo).trim();
  let effectiveEmpNo = empNo ? String(empNo).trim() : null;

  let conn = getEmployeeConnection();
  if (!conn) {
    try {
      conn = await connectEmployeeDB();
    } catch (e) {}
  }

  let finalPassword = password;
  if (conn) {
    try {
      const searchKey = effectiveEmpNo || effectiveName;
      const escaped = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const emp = await conn.collection('employees').findOne({
        $or: [
          { emp_no: searchKey },
          { email: searchKey.toLowerCase() },
          { phone_number: searchKey },
          { employee_name: { $regex: `^${escaped}$`, $options: 'i' } }
        ]
      });
      if (emp) {
        if (!effectiveEmpNo && emp.emp_no) {
          effectiveEmpNo = String(emp.emp_no).trim();
        }
        if (!finalPassword) {
          finalPassword = emp.plain_password || emp.password;
        }
      }
    } catch (err) {}
  }

  if (!finalPassword) {
    res.status(400);
    throw new Error('Password is required');
  }

  const queryOr = [{ name: effectiveName }];
  if (effectiveEmpNo) {
    queryOr.push({ empNo: effectiveEmpNo });
    queryOr.push({ name: effectiveEmpNo });
  }
  const exists = await SubAdmin.findOne({ $or: queryOr });
  if (exists) {
    res.status(400);
    throw new Error('User with this name/ID or Employee Number already exists');
  }

  const created = await SubAdmin.create({ 
    name: effectiveName, 
    empNo: effectiveEmpNo || null,
    password: finalPassword, 
    role: role || 'Editor', 
    permissions: permissions || [], 
    assignedCollege: targetCollege || null 
  });
  await created.populate('assignedCollege', 'name');

  let employeeName = null;
  let resolvedEmpNo = created.empNo || null;
  let empConn = getEmployeeConnection();
  if (!empConn) {
    try {
      empConn = await connectEmployeeDB();
    } catch (e) {}
  }
  if (empConn) {
    try {
      const searchKey = String(created.empNo || created.name || '').trim();
      const escaped = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const emp = await empConn.collection('employees').findOne({
        $or: [
          { emp_no: searchKey },
          { employee_name: { $regex: `^${escaped}$`, $options: 'i' } }
        ]
      }, { projection: { employee_name: 1, emp_no: 1 } });
      if (emp) {
        employeeName = emp.employee_name;
        if (!resolvedEmpNo) resolvedEmpNo = emp.emp_no;
      }
    } catch (err) {}
  }

  try {
    await UserAudit.create({
      userId: created._id,
      userName: created.name,
      empNo: resolvedEmpNo || '',
      userRole: created.role || 'Editor',
      college: created.assignedCollege?._id || created.assignedCollege || null,
      collegeName: created.assignedCollege?.name || '',
      event: 'user_management',
      action: 'User Account Created',
      description: `Created user ${created.name} (${created.role || 'Editor'}) with college ${created.assignedCollege?.name || 'Global'}`,
      status: 'success',
      details: { name: created.name, role: created.role, empNo: resolvedEmpNo }
    });
  } catch (err) {}
  
  res.status(201).json({ 
    _id: created._id, 
    name: created.name, 
    empNo: resolvedEmpNo,
    employeeName,
    role: created.role, 
    permissions: created.permissions, 
    assignedCollege: created.assignedCollege,
    assignedBranch: created.assignedCollege 
  });
});

// PUT /api/subadmins/:id
const updateSubAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, empNo, password, role, permissions, assignedCollege, assignedBranch } = req.body;
  const sub = await SubAdmin.findById(id).select('+password');
  if (!sub) {
    res.status(404);
    throw new Error('User not found');
  }
  if (name) sub.name = name;
  if (empNo !== undefined) sub.empNo = empNo ? String(empNo).trim() : null;
  if (role) sub.role = role;
  if (password) sub.password = password;
  if (permissions !== undefined) sub.permissions = permissions;
  
  if (assignedCollege !== undefined) sub.assignedCollege = assignedCollege;
  else if (assignedBranch !== undefined) sub.assignedCollege = assignedBranch;

  const saved = await sub.save();
  await saved.populate('assignedCollege', 'name');

  let employeeName = null;
  let resolvedEmpNo = saved.empNo || null;
  let empConn = getEmployeeConnection();
  if (!empConn) {
    try {
      empConn = await connectEmployeeDB();
    } catch (e) {}
  }
  if (empConn) {
    try {
      const searchKey = String(saved.empNo || saved.name || '').trim();
      const escaped = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const emp = await empConn.collection('employees').findOne({
        $or: [
          { emp_no: searchKey },
          { employee_name: { $regex: `^${escaped}$`, $options: 'i' } }
        ]
      }, { projection: { employee_name: 1, emp_no: 1 } });
      if (emp) {
        employeeName = emp.employee_name;
        if (!resolvedEmpNo) resolvedEmpNo = emp.emp_no;
      }
    } catch (err) {}
  }

  try {
    await UserAudit.create({
      userId: saved._id,
      userName: saved.name,
      empNo: resolvedEmpNo || '',
      userRole: saved.role || 'Editor',
      college: saved.assignedCollege?._id || saved.assignedCollege || null,
      collegeName: saved.assignedCollege?.name || '',
      event: 'user_management',
      action: 'User Access / Role Updated',
      description: `Updated access features for user ${saved.name} (Role: ${saved.role})`,
      status: 'success',
      details: { name: saved.name, role: saved.role, empNo: resolvedEmpNo }
    });
  } catch (err) {}

  res.json({ 
    _id: saved._id, 
    name: saved.name, 
    empNo: resolvedEmpNo,
    employeeName,
    role: saved.role, 
    permissions: saved.permissions, 
    assignedCollege: saved.assignedCollege,
    assignedBranch: saved.assignedCollege
  });
});

// DELETE /api/subadmins/:id
const deleteSubAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const sub = await SubAdmin.findById(id);
  if (!sub) {
    res.status(404);
    throw new Error('User not found');
  }
  await SubAdmin.findByIdAndDelete(id);

  try {
    await UserAudit.create({
      userName: sub.name,
      empNo: sub.empNo || '',
      userRole: sub.role || 'Editor',
      event: 'user_management',
      action: 'User Deleted',
      description: `Deleted portal user ${sub.name} (${sub.role})`,
      status: 'warning',
      details: { name: sub.name, role: sub.role }
    });
  } catch (err) {}

  res.json({ message: 'Deleted' });
});

// POST /api/subadmins/login
const loginSubAdmin = asyncHandler(async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    res.status(400);
    throw new Error('User ID and password are required');
  }

  const trimmedName = String(name).trim();
  const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 1. Check local SubAdmin record first (by empNo OR username/name)
  const sub = await SubAdmin.findOne({ 
    $or: [
      { empNo: trimmedName },
      { empNo: { $regex: `^${escapedName}$`, $options: 'i' } },
      { name: { $regex: `^${escapedName}$`, $options: 'i' } }
    ]
  }).select('+password').populate('assignedCollege', 'name');

  if (sub) {
    const ok = await sub.comparePassword(password);
    if (ok) {
      let employeeName = null;
      let empNo = sub.empNo || null;
      let conn = getEmployeeConnection();
      if (!conn) {
        try { conn = await connectEmployeeDB(); } catch (e) {}
      }

      if (sub.role === 'Administrator' || sub.name === 'superadmin') {
        employeeName = 'Administrator';
        empNo = null;
      } else if (conn) {
        try {
          const searchKey = String(sub.empNo || sub.name || '').trim();
          const escaped = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const emp = await conn.collection('employees').findOne({
            $or: [
              { emp_no: searchKey },
              { employee_name: { $regex: `^${escaped}$`, $options: 'i' } }
            ]
          }, { projection: { employee_name: 1, emp_no: 1 } });
          if (emp) {
            employeeName = emp.employee_name;
            if (!empNo) empNo = emp.emp_no;
          }
        } catch (err) {}
      }

      // Record successful login audit in UserAudit
      try {
        await UserAudit.create({
          userId: sub._id,
          userName: employeeName || sub.name,
          empNo: empNo || sub.empNo || '',
          userRole: sub.role || 'Editor',
          college: sub.assignedCollege?._id || sub.assignedCollege || null,
          collegeName: sub.assignedCollege?.name || '',
          event: 'login',
          action: 'User Logged In',
          description: `${employeeName || sub.name} (${sub.role || 'Editor'}) logged in to Stationary Management`,
          loginTime: new Date(),
          ip: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
          userAgent: req.headers['user-agent'] || '',
          status: 'success',
          details: {
            method: 'Local Credentials',
            empNo: empNo || sub.empNo,
          }
        });
      } catch (auditErr) {}

      return res.json({ 
        _id: sub._id, 
        name: sub.name, 
        empNo: empNo || sub.empNo || null,
        emp_no: empNo || sub.empNo || null,
        employeeName,
        employee_name: employeeName,
        role: sub.role, 
        permissions: sub.permissions || [], 
        assignedCollege: sub.assignedCollege,
        assignedBranch: sub.assignedCollege
      });
    }
  }

  // 2. Check HRMS database dynamically
  let conn = getEmployeeConnection();
  if (!conn) {
    try {
      conn = await connectEmployeeDB();
    } catch (e) {
      console.error('[Login] Connecting to HRMS failed:', e.message);
    }
  }

  if (conn) {
    try {
      const hrmsConditions = [
        { emp_no: trimmedName },
        { email: trimmedName.toLowerCase() },
        { phone_number: trimmedName },
        { employee_name: { $regex: `^${escapedName}$`, $options: 'i' } }
      ];
      if (sub && sub.empNo) {
        hrmsConditions.push({ emp_no: sub.empNo });
      }

      const emp = await conn.collection('employees').findOne({
        $or: hrmsConditions
      });

      if (emp) {
        let isMatch = false;
        const candidatePassword = String(password).trim();

        if (emp.plain_password && String(emp.plain_password).trim() === candidatePassword) {
          isMatch = true;
        }

        if (!isMatch && emp.password) {
          try {
            isMatch = await bcrypt.compare(candidatePassword, emp.password);
          } catch (err) {
            console.error('[Login] HRMS password compare error:', err.message);
          }
        }

        if (isMatch) {
          const searchConditions = [];
          if (emp.emp_no) {
            searchConditions.push({ empNo: String(emp.emp_no).trim() });
            searchConditions.push({ name: String(emp.emp_no).trim() });
          }
          if (emp.employee_name) {
            searchConditions.push({ 
              name: { $regex: `^${emp.employee_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } 
            });
          }
          searchConditions.push({ empNo: trimmedName });
          searchConditions.push({ name: { $regex: `^${escapedName}$`, $options: 'i' } });

          const existingSub = await SubAdmin.findOne({ $or: searchConditions })
            .select('+password')
            .populate('assignedCollege', 'name');

          if (existingSub) {
            try {
              let shouldSave = false;
              if (!existingSub.empNo && emp.emp_no) {
                existingSub.empNo = String(emp.emp_no).trim();
                shouldSave = true;
              }
              const isLocalMatch = await existingSub.comparePassword(candidatePassword).catch(() => false);
              if (!isLocalMatch) {
                existingSub.password = candidatePassword;
                shouldSave = true;
              }
              if (!existingSub.role || existingSub.role === 'faculty' || existingSub.role.toLowerCase() === 'faculty') {
                existingSub.role = 'Editor';
                shouldSave = true;
              }
              if (shouldSave) {
                await existingSub.save();
              }
            } catch (syncErr) {}
          }

          // Record HRMS successful login audit
          try {
            await UserAudit.create({
              userId: existingSub ? existingSub._id : null,
              userName: emp.employee_name || emp.emp_no || trimmedName,
              empNo: emp.emp_no || trimmedName,
              userRole: existingSub ? existingSub.role : 'Editor',
              college: existingSub?.assignedCollege?._id || existingSub?.assignedCollege || null,
              collegeName: existingSub?.assignedCollege?.name || '',
              event: 'login',
              action: 'User Logged In',
              description: `${emp.employee_name || emp.emp_no} logged in via HRMS credentials`,
              loginTime: new Date(),
              ip: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
              userAgent: req.headers['user-agent'] || '',
              status: 'success',
              details: {
                method: 'HRMS Authentication',
                department: emp.department || '',
              }
            });
          } catch (auditErr) {}

          return res.json({
            _id: existingSub ? existingSub._id : emp._id,
            name: existingSub ? existingSub.name : (emp.employee_name || emp.emp_no || trimmedName),
            empNo: (existingSub && existingSub.empNo) || emp.emp_no || null,
            emp_no: (existingSub && existingSub.empNo) || emp.emp_no || null,
            employeeName: emp.employee_name || null,
            employee_name: emp.employee_name || null,
            role: existingSub ? existingSub.role : 'Editor',
            permissions: existingSub ? (existingSub.permissions || []) : [],
            assignedCollege: existingSub ? existingSub.assignedCollege : null,
            assignedBranch: existingSub ? existingSub.assignedCollege : null,
            email: emp.email
          });
        }
      }
    } catch (hrmsError) {
      console.error('[Login] Error during HRMS verification:', hrmsError);
    }
  }

  res.status(401);
  throw new Error('Invalid credentials');
});

module.exports = {
  listSubAdmins,
  createSubAdmin,
  updateSubAdmin,
  deleteSubAdmin,
  loginSubAdmin,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
};
