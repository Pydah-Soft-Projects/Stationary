const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const { SubAdmin } = require('../models/subAdminModel');
const { getEmployeeConnection, connectEmployeeDB } = require('../config/employeeDb');

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
    let empNo = null;

    if (conn) {
      try {
        const trimmed = String(sa.name || '').trim();
        const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const emp = await conn.collection('employees').findOne({
          $or: [
            { emp_no: trimmed },
            { employee_name: { $regex: `^${escaped}$`, $options: 'i' } }
          ]
        }, { projection: { employee_name: 1, emp_no: 1 } });
        if (emp) {
          employeeName = emp.employee_name;
          empNo = emp.emp_no;
        }
      } catch (err) {}
    }

    return { 
      _id: sa._id, 
      name: sa.name, 
      employeeName,
      empNo,
      role: sa.role, 
      permissions: sa.permissions || [], 
      assignedCollege: college,
      assignedBranch: college // Keep for frontend compatibility
    };
  }));

  res.json(results);
});

// POST /api/subadmins
const createSubAdmin = asyncHandler(async (req, res) => {
  const { name, password, role, permissions, assignedCollege, assignedBranch } = req.body;
  
  // Accept either assignedCollege or assignedBranch (legacy)
  const targetCollege = assignedCollege || assignedBranch;

  if (!name) {
    res.status(400);
    throw new Error('Name or Employee ID is required');
  }

  let finalPassword = password;
  if (!finalPassword) {
    let conn = getEmployeeConnection();
    if (!conn) {
      try {
        conn = await connectEmployeeDB();
      } catch (e) {}
    }
    if (conn) {
      const trimmed = String(name).trim();
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const emp = await conn.collection('employees').findOne({
        $or: [
          { emp_no: trimmed },
          { email: trimmed.toLowerCase() },
          { phone_number: trimmed },
          { employee_name: { $regex: `^${escaped}$`, $options: 'i' } }
        ]
      });
      if (emp) {
        finalPassword = emp.plain_password || emp.password;
      }
    }
  }

  if (!finalPassword) {
    res.status(400);
    throw new Error('Password is required');
  }

  const exists = await SubAdmin.findOne({ name });
  if (exists) {
    res.status(400);
    throw new Error('User with this name/ID already exists');
  }
  const created = await SubAdmin.create({ 
    name, 
    password: finalPassword, 
    role: role || 'Editor', 
    permissions: permissions || [], 
    assignedCollege: targetCollege || null 
  });
  await created.populate('assignedCollege', 'name');

  let employeeName = null;
  let empNo = null;
  let empConn = getEmployeeConnection();
  if (!empConn) {
    try {
      empConn = await connectEmployeeDB();
    } catch (e) {}
  }
  if (empConn) {
    try {
      const trimmed = String(created.name || '').trim();
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const emp = await empConn.collection('employees').findOne({
        $or: [
          { emp_no: trimmed },
          { employee_name: { $regex: `^${escaped}$`, $options: 'i' } }
        ]
      }, { projection: { employee_name: 1, emp_no: 1 } });
      if (emp) {
        employeeName = emp.employee_name;
        empNo = emp.emp_no;
      }
    } catch (err) {}
  }
  
  res.status(201).json({ 
    _id: created._id, 
    name: created.name, 
    employeeName,
    empNo,
    role: created.role, 
    permissions: created.permissions, 
    assignedCollege: created.assignedCollege,
    assignedBranch: created.assignedCollege 
  });
});

// PUT /api/subadmins/:id
const updateSubAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, password, role, permissions, assignedCollege, assignedBranch } = req.body;
  const sub = await SubAdmin.findById(id).select('+password');
  if (!sub) {
    res.status(404);
    throw new Error('User not found');
  }
  if (name) sub.name = name;
  if (role) sub.role = role;
  if (password) sub.password = password; // will be hashed by pre-save
  if (permissions !== undefined) sub.permissions = permissions;
  
  // Check both new and old field names
  if (assignedCollege !== undefined) sub.assignedCollege = assignedCollege;
  else if (assignedBranch !== undefined) sub.assignedCollege = assignedBranch; // Legacy support

  const saved = await sub.save();
  await saved.populate('assignedCollege', 'name');

  let employeeName = null;
  let empNo = null;
  let empConn = getEmployeeConnection();
  if (!empConn) {
    try {
      empConn = await connectEmployeeDB();
    } catch (e) {}
  }
  if (empConn) {
    try {
      const trimmed = String(saved.name || '').trim();
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const emp = await empConn.collection('employees').findOne({
        $or: [
          { emp_no: trimmed },
          { employee_name: { $regex: `^${escaped}$`, $options: 'i' } }
        ]
      }, { projection: { employee_name: 1, emp_no: 1 } });
      if (emp) {
        employeeName = emp.employee_name;
        empNo = emp.emp_no;
      }
    } catch (err) {}
  }

  res.json({ 
    _id: saved._id, 
    name: saved.name, 
    employeeName,
    empNo,
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

  // 1. Check local SubAdmin record first
  const sub = await SubAdmin.findOne({ 
    name: { $regex: `^${escapedName}$`, $options: 'i' } 
  }).select('+password').populate('assignedCollege', 'name');

  if (sub) {
    const ok = await sub.comparePassword(password);
    if (ok) {
      let employeeName = null;
      let empNo = null;
      let conn = getEmployeeConnection();
      if (!conn) {
        try { conn = await connectEmployeeDB(); } catch (e) {}
      }
      if (conn) {
        try {
          const trimmed = String(sub.name || '').trim();
          const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const emp = await conn.collection('employees').findOne({
            $or: [
              { emp_no: trimmed },
              { employee_name: { $regex: `^${escaped}$`, $options: 'i' } }
            ]
          }, { projection: { employee_name: 1, emp_no: 1 } });
          if (emp) {
            employeeName = emp.employee_name;
            empNo = emp.emp_no;
          }
        } catch (err) {}
      }

      return res.json({ 
        _id: sub._id, 
        name: sub.name, 
        employeeName,
        employee_name: employeeName,
        empNo,
        emp_no: empNo,
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
      const emp = await conn.collection('employees').findOne({
        $or: [
          { emp_no: trimmedName },
          { email: trimmedName.toLowerCase() },
          { phone_number: trimmedName },
          { employee_name: { $regex: `^${escapedName}$`, $options: 'i' } }
        ]
      });

      if (emp) {
        let isMatch = false;
        const candidatePassword = String(password).trim();

        // Check plain_password
        if (emp.plain_password && String(emp.plain_password).trim() === candidatePassword) {
          isMatch = true;
        }

        // Check bcrypt password hash
        if (!isMatch && emp.password) {
          try {
            isMatch = await bcrypt.compare(candidatePassword, emp.password);
          } catch (err) {
            console.error('[Login] HRMS password compare error:', err.message);
          }
        }

        if (isMatch) {
          // If the employee is configured in the stationary database, load their configured role and permissions
          const searchConditions = [];
          if (emp.emp_no) searchConditions.push({ name: String(emp.emp_no).trim() });
          if (emp.employee_name) {
            searchConditions.push({ 
              name: { $regex: `^${emp.employee_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } 
            });
          }
          searchConditions.push({ name: { $regex: `^${escapedName}$`, $options: 'i' } });

          const existingSub = await SubAdmin.findOne({ $or: searchConditions })
            .select('-password')
            .populate('assignedCollege', 'name');

          // Return user profile dynamically from DB records without exposing password
          return res.json({
            _id: existingSub ? existingSub._id : emp._id,
            name: existingSub ? existingSub.name : (emp.employee_name || emp.emp_no || trimmedName),
            employeeName: emp.employee_name || null,
            employee_name: emp.employee_name || null,
            empNo: emp.emp_no || null,
            emp_no: emp.emp_no || null,
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
};
