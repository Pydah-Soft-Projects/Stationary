import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Edit,
  Trash2,
  X,
  Eye,
  Edit2,
  AlertCircle,
  Search,
  Briefcase,
  CheckCircle2,
  ShieldCheck,
  Settings,
  Lock,
  RefreshCw,
  UserPlus,
  Shield
} from 'lucide-react';
import { apiUrl } from '../utils/api';
import { parsePermission, permissionsToObject, objectToPermissions } from '../utils/permissions';

// Sidebar menu items for permissions
const SIDEBAR_ITEMS = [
  { path: '/', label: 'Dashboard', key: 'dashboard' },
  { path: '/students-dashboard', label: 'Student Dashboard', key: 'course-dashboard' },
  { path: '/employees-dashboard', label: 'Employee Dashboard', key: 'employee-dashboard' },
  {
    path: '/manage-stock',
    label: 'Manage Stock',
    key: 'manage-stock',
    children: [
      { label: 'Add Product', key: 'stock-products' },
      { label: 'Add Stock', key: 'stock-add' },
      { label: 'Stock Entries', key: 'stock-entries' },
      { label: 'Vendor Management', key: 'stock-vendors' },
    ],
  },
  { path: '/stock-transfers', label: 'Stock Transfers', key: 'stock-transfers' },
  { path: '/change-transaction-date', label: 'Change Transaction Date', key: 'change-transaction-date' },
  {
    path: '/transactions',
    label: 'Reports',
    key: 'transactions',
    children: [
      { label: 'Daily Breakdown', key: 'reports-daily' },
      { label: 'Monthly Summary', key: 'reports-monthly' },
      { label: 'Academic Stock Report', key: 'reports-stock' },
    ],
  },
  { path: '/profit-report', label: 'Profit Report', key: 'profit-report' },
  { path: '/student-due', label: 'Student Due', key: 'student-due' },
  {
    path: '/audit-logs',
    label: 'Audit Logs',
    key: 'audit-logs',
    children: [
      { label: 'Audit Log Entry', key: 'audit-log-entry' },
      { label: 'Audit Approval', key: 'audit-log-approval' },
    ],
  },
  { path: '/settings', label: 'Settings', key: 'settings' },
];

const PERMISSION_LABELS = SIDEBAR_ITEMS.reduce((acc, item) => {
  if (item.children) {
    item.children.forEach(child => {
      acc[child.key] = child.label;
    });
  } else {
    acc[item.key] = item.label;
  }
  return acc;
}, {});

const normalizePermissions = (perms = []) => {
  const list = Array.isArray(perms) ? perms.slice() : [];
  const hasLegacyAudit = list.some(p => {
    const parsed = parsePermission(p);
    return parsed.key === 'audit-logs';
  });
  const hasLegacyManageStock = list.some(p => {
    const parsed = parsePermission(p);
    return parsed.key === 'manage-stock';
  });

  // Convert to object format for easier manipulation
  const permObj = permissionsToObject(list);

  // Handle legacy audit-logs permission
  if (hasLegacyAudit && !permObj['audit-log-entry'] && !permObj['audit-log-approval']) {
    permObj['audit-log-entry'] = permObj['audit-logs'] || 'full';
    permObj['audit-log-approval'] = permObj['audit-logs'] || 'full';
  }
  delete permObj['audit-logs'];

  // Handle legacy transactions permission
  if (permObj['transactions']) {
    const transAccess = permObj['transactions'] || 'full';
    if (!permObj['reports-daily']) permObj['reports-daily'] = transAccess;
    if (!permObj['reports-monthly']) permObj['reports-monthly'] = transAccess;
    if (!permObj['reports-stock']) permObj['reports-stock'] = transAccess;
    if (!permObj['profit-report']) permObj['profit-report'] = transAccess;
    if (!permObj['student-due']) permObj['student-due'] = transAccess;
  }
  // Remove legacy parent key so hidden stale full access cannot survive edits.
  delete permObj['transactions'];

  // Handle legacy manage-stock permission
  if (hasLegacyManageStock) {
    const stockAccess = permObj['manage-stock'] || 'full';
    // Only set if individual permissions don't exist
    if (!permObj['stock-products']) permObj['stock-products'] = stockAccess;
    if (!permObj['stock-add']) permObj['stock-add'] = stockAccess;
    if (!permObj['stock-entries']) permObj['stock-entries'] = stockAccess;
    if (!permObj['stock-vendors']) permObj['stock-vendors'] = stockAccess;
  }
  delete permObj['manage-stock'];

  // Convert back to array
  return objectToPermissions(permObj);
};

// All flat permission keys helper
const getAllPermissionKeys = () => {
  const keys = [];
  SIDEBAR_ITEMS.forEach(item => {
    if (item.children) {
      item.children.forEach(c => keys.push(c.key));
    } else {
      keys.push(item.key);
    }
  });
  return keys;
};

// SubAdmin Modal component for creating/editing users
const SubAdminModal = ({ isOpen, onClose, onSave, subAdmin, availableRoles = [] }) => {
  const [name, setName] = useState(subAdmin?.name || '');
  const [empNo, setEmpNo] = useState(subAdmin?.empNo || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(subAdmin?.role || 'Editor');
  const [permissions, setPermissions] = useState({}); // Object format: { 'key': 'view' | 'full' }
  const [courses, setCourses] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [assignedCollege, setAssignedCollege] = useState(subAdmin?.assignedCollege?._id || subAdmin?.assignedCollege || subAdmin?.assignedBranch?._id || subAdmin?.assignedBranch || '');
  const [coursePermissions, setCoursePermissions] = useState({}); // Object format: { 'course-name': 'view' | 'full' }
  const [employeeInfo, setEmployeeInfo] = useState(subAdmin?.employeeDetails || null);
  const [isHrmsEmployee, setIsHrmsEmployee] = useState(!!subAdmin?.isHrmsEmployee);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalSearchResults, setModalSearchResults] = useState([]);
  const [modalSearching, setModalSearching] = useState(false);

  // Fetch courses and branches when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        // Fetch Courses
        try {
          let res = await fetch(apiUrl('/api/academic-config/courses'));
          if (res.ok) {
            const data = await res.json();
            setCourses(Array.isArray(data) ? data : []);
          } else if (res.status === 404) {
            res = await fetch(apiUrl('/api/config/academic'));
            if (res.ok) {
              const data = await res.json();
              setCourses(Array.isArray(data?.courses) ? data.courses : []);
            }
          }
        } catch (e) {
          console.error('Failed to fetch courses:', e);
        }

        // Fetch Colleges (Hardware/Inventory Locations)
        try {
          const res = await fetch(apiUrl('/api/stock-transfers/colleges'));
          if (res.ok) {
            const data = await res.json();
            setColleges(Array.isArray(data) ? data : []);
          }
        } catch (e) {
          console.error('Failed to fetch colleges:', e);
        }
      };
      fetchData();
    }
  }, [isOpen]);

  // Search HRMS employees inside modal
  useEffect(() => {
    const trimmed = modalSearchQuery.trim();
    if (trimmed.length < 2) {
      setModalSearchResults([]);
      setModalSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setModalSearching(true);
      try {
        const res = await fetch(apiUrl(`/api/employees?search=${encodeURIComponent(trimmed)}&limit=5`));
        if (res.ok) {
          const data = await res.json();
          const rows = data.rows || (Array.isArray(data) ? data : []);
          setModalSearchResults(rows);
        }
      } catch (err) {
        console.warn('Failed to search employee in modal:', err);
      } finally {
        setModalSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [modalSearchQuery]);

  useEffect(() => {
    if (isOpen) {
      setName(subAdmin?.name || '');
      setEmpNo(subAdmin?.empNo || '');
      const initialRole = subAdmin?.role || (availableRoles.find(r => r.roleKey === 'Editor')?.roleKey || availableRoles[0]?.roleKey || 'Editor');
      setRole(initialRole);
      setPassword(''); // Always clear password field when modal opens
      setEmployeeInfo(subAdmin?.employeeDetails || null);
      setIsHrmsEmployee(!!subAdmin?.isHrmsEmployee);
      setModalSearchQuery('');
      setModalSearchResults([]);

      let sourcePerms = Array.isArray(subAdmin?.permissions) ? subAdmin.permissions : [];

      // If creating a brand new user and role has preset permissions, prefill from role
      if (!subAdmin?.id && sourcePerms.length === 0) {
        const matchedRole = availableRoles.find(r => r.roleKey === initialRole || r.label === initialRole);
        if (matchedRole && Array.isArray(matchedRole.permissions) && matchedRole.permissions.length > 0) {
          sourcePerms = matchedRole.permissions;
        }
      }

      const normalized = normalizePermissions(sourcePerms);
      const permsObj = permissionsToObject(normalized);
      setPermissions(permsObj);

      // Extract course-specific permissions
      const coursePerms = {};
      Object.keys(permsObj).forEach(key => {
        if (key.startsWith('course-dashboard-')) {
          const courseName = key.replace('course-dashboard-', '');
          coursePerms[courseName] = permsObj[key];
        }
      });
      setCoursePermissions(coursePerms);

      // Set assigned branch
      setAssignedCollege(subAdmin?.assignedCollege?._id || subAdmin?.assignedCollege || subAdmin?.assignedBranch?._id || subAdmin?.assignedBranch || '');
    }
  }, [isOpen, subAdmin, availableRoles]);

  if (!isOpen) return null;

  const normalizeCourseName = (courseName) => {
    if (!courseName) return '';
    return String(courseName).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const handlePermissionAccessChange = (key, access) => {
    setPermissions(prev => {
      const newPerms = { ...prev };
      if (access === null) {
        delete newPerms[key];
        if (key === 'course-dashboard') {
          Object.keys(newPerms).forEach(permKey => {
            if (permKey.startsWith('course-dashboard-')) {
              delete newPerms[permKey];
            }
          });
          setCoursePermissions({});
        }
      } else {
        newPerms[key] = access;
      }
      return newPerms;
    });
  };

  const handleCoursePermissionChange = (courseIdentifier, access) => {
    const normalizedKey = normalizeCourseName(courseIdentifier);
    const coursePermissionKey = `course-dashboard-${normalizedKey}`;

    setCoursePermissions(prev => {
      const newCoursePerms = { ...prev };
      if (access === null) {
        delete newCoursePerms[courseIdentifier];
      } else {
        newCoursePerms[courseIdentifier] = access;
      }
      return newCoursePerms;
    });

    setPermissions(prev => {
      const newPerms = { ...prev };
      if (access === null) {
        delete newPerms[coursePermissionKey];
      } else {
        newPerms[coursePermissionKey] = access;
      }
      return newPerms;
    });
  };

  const getPermissionAccess = (key) => {
    return permissions[key] || null;
  };

  const getCoursePermissionAccess = (courseName) => {
    return coursePermissions[courseName] || null;
  };

  const handleRoleChange = (newRoleKey) => {
    setRole(newRoleKey);
    // Auto-populate permissions from selected role if creating new user or if requested
    const selectedRoleObj = availableRoles.find(r => r.roleKey === newRoleKey || r.label === newRoleKey);
    if (selectedRoleObj && Array.isArray(selectedRoleObj.permissions) && selectedRoleObj.permissions.length > 0) {
      const normalized = normalizePermissions(selectedRoleObj.permissions);
      setPermissions(permissionsToObject(normalized));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const isLinkedEmployee = !!subAdmin?.id || !!isHrmsEmployee || !!employeeInfo;
    if (!isLinkedEmployee && !password) {
      alert('Password is required for new users who are not HRMS employees.');
      return;
    }
    const submissionRole = role || subAdmin?.role || 'Editor';
    const cleanedPermissions = objectToPermissions(permissions);
    onSave({
      ...subAdmin,
      name,
      empNo: empNo ? empNo.trim() : (employeeInfo?.empNo || undefined),
      role: submissionRole,
      permissions: cleanedPermissions,
      assignedCollege: assignedCollege || null,
      assignedBranch: assignedCollege || null,
      ...(password && { password }),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 flex justify-center items-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 border border-gray-200 transform transition-all duration-300 scale-100 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {subAdmin?.id ? 'Edit User Features' : (employeeInfo ? `Configure Features: ${employeeInfo.name}` : 'Create User & Assign Features')}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors duration-200">
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {/* Employee Info Header Banner if selected */}
          {employeeInfo ? (
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-900 text-base">{employeeInfo.name}</h3>
                  <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-mono rounded">
                    ID: {employeeInfo.empNo}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {employeeInfo.department && <span>Dept: <strong className="text-gray-800">{employeeInfo.department}</strong></span>}
                  {employeeInfo.designation && <span>Desig: <strong className="text-gray-800">{employeeInfo.designation}</strong></span>}
                  {employeeInfo.division && <span>Division: <strong className="text-gray-800">{employeeInfo.division}</strong></span>}
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg whitespace-nowrap">
                HRMS Employee
              </span>
            </div>
          ) : !subAdmin?.id && (
            <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Search size={14} className="text-blue-600" />
                Search HRMS Employee to Auto-Fill
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  placeholder="Type employee name or Emp ID to search HRMS..."
                  className="w-full px-3.5 py-2 text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {modalSearching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Searching...</span>
                )}
              </div>
              {modalSearchResults.length > 0 && (
                <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {modalSearchResults.map((emp) => (
                    <div
                      key={emp.id}
                      onClick={() => {
                        setName(emp.name || emp.empNo);
                        setEmpNo(emp.empNo || '');
                        setEmployeeInfo(emp);
                        setIsHrmsEmployee(true);
                        setModalSearchResults([]);
                        setModalSearchQuery('');
                      }}
                      className="p-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-gray-900">{emp.name}</span>
                        <span className="ml-2 text-gray-500 font-mono">({emp.empNo})</span>
                        <span className="ml-2 text-gray-400">{emp.department || ''}</span>
                      </div>
                      <span className="text-blue-600 font-medium hover:underline">Select</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* User Role Selector */}
          <div className="mb-5 p-4 bg-slate-50/70 border border-slate-200 rounded-2xl">
            <label htmlFor="userRole" className="block text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2">
              <ShieldCheck size={16} className="text-indigo-600" />
              User Role <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Select the user's role. Changing role applies that role's default configured permissions below.
            </p>
            <select
              id="userRole"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm font-medium text-gray-800"
              value={role}
              onChange={(e) => handleRoleChange(e.target.value)}
            >
              {availableRoles.length > 0 ? (
                availableRoles.map(r => (
                  <option key={r.roleKey || r._id} value={r.roleKey}>
                    {r.label} {r.isSystem ? '(System Role)' : '(Custom Role)'}
                  </option>
                ))
              ) : (
                <>
                  <option value="Administrator">Administrator (System)</option>
                  <option value="Editor">Editor (System)</option>
                  <option value="Viewer">Viewer (System)</option>
                </>
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label htmlFor="empNo" className="block text-sm font-semibold text-gray-700 mb-2">
                Employee ID / Emp No {employeeInfo && <span className="text-xs font-normal text-blue-600 font-mono">({employeeInfo.empNo})</span>}
              </label>
              <input
                id="empNo"
                type="text"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                value={empNo}
                onChange={(e) => setEmpNo(e.target.value)}
                placeholder="e.g. 1042 or EMP001 (used to log in)"
              />
              <p className="text-xs text-gray-500 mt-1">Stored ID used for login authentication.</p>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">Name / Username</label>
              <input
                id="name"
                type="text"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter name or username"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Display name / portal username.</p>
            </div>
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
              Password {employeeInfo && <span className="text-xs font-normal text-gray-500">(Optional - uses HRMS credentials)</span>}
            </label>
            <input
              id="password"
              type="password"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={employeeInfo ? "Leave blank to use HRMS password" : (subAdmin?.id ? "Enter new password to change" : "Enter password")}
              required={!subAdmin?.id && !employeeInfo && !isHrmsEmployee}
            />
          </div>

          <div className="mb-6">
            <label htmlFor="assignedCollege" className="block text-sm font-semibold text-gray-700 mb-2">Assigned College (Optional)</label>
            <p className="text-xs text-gray-500 mb-2">Assigning a college links stock deductions to that specific location.</p>
            <div className="relative">
              <select
                id="assignedCollege"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 appearance-none bg-white"
                value={assignedCollege}
                onChange={(e) => setAssignedCollege(e.target.value)}
              >
                <option value="">-- No College Assigned (Global/Admin) --</option>
                {colleges.map((college) => (
                  <option key={college._id} value={college._id}>
                    {college.name} {college.location ? `(${college.location})` : ''}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
              </div>
            </div>
          </div>

          {/* Permissions Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Permissions</label>
                <p className="text-xs text-gray-500">Select access level for each feature (View = Read-only, Full = Read + Edit + Delete)</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-gray-600">View Access</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-gray-600">Full Access</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <div className="max-h-[460px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-100 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Feature</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider w-32">No Access</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider w-32">View Only</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider w-32">Full Access</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {SIDEBAR_ITEMS.map((item) => {
                      if (item.children) {
                        const anyChildSelected = item.children.some((child) => getPermissionAccess(child.key) !== null);
                        return (
                          <React.Fragment key={item.key}>
                            <tr className="bg-indigo-50/30 hover:bg-indigo-50/50">
                              <td colSpan="4" className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                                  {!anyChildSelected && (
                                    <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">No access</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {item.children.map((child) => {
                              const access = getPermissionAccess(child.key);
                              return (
                                <tr key={child.key} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-3 pl-8">
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                                      <span className="text-sm text-gray-700">{child.label}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handlePermissionAccessChange(child.key, null)}
                                      className={`w-10 h-10 rounded-full border-2 transition-all ${!access
                                        ? 'bg-gray-200 border-gray-400 shadow-inner'
                                        : 'bg-white border-gray-300 hover:border-gray-400'
                                        }`}
                                      title="No Access"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handlePermissionAccessChange(child.key, access === 'view' ? null : 'view')}
                                      className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${access === 'view'
                                        ? 'bg-blue-500 border-blue-600 shadow-md'
                                        : 'bg-white border-gray-300 hover:border-blue-200 hover:bg-blue-50'
                                        }`}
                                      title="View Access"
                                    >
                                      {access === 'view' && <Eye size={16} className="text-white" />}
                                    </button>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handlePermissionAccessChange(child.key, access === 'full' ? null : 'full')}
                                      className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${access === 'full'
                                        ? 'bg-green-500 border-green-600 shadow-md'
                                        : 'bg-white border-gray-300 hover:border-green-200 hover:bg-green-50'
                                        }`}
                                      title="Full Access"
                                    >
                                      {access === 'full' && <Edit2 size={16} className="text-white" />}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      }

                      // Regular permission item
                      const access = getPermissionAccess(item.key);
                      const isCourseDashboard = item.key === 'course-dashboard';
                      const hasCourseDashboardAccess = access === 'view' || access === 'full';

                      return (
                        <React.Fragment key={item.key}>
                          <tr className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-gray-700">{item.label}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handlePermissionAccessChange(item.key, null)}
                                className={`w-10 h-10 rounded-full border-2 transition-all ${!access
                                  ? 'bg-gray-200 border-gray-400 shadow-inner'
                                  : 'bg-white border-gray-300 hover:border-gray-400'
                                  }`}
                                title="No Access"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handlePermissionAccessChange(item.key, access === 'view' ? null : 'view')}
                                className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${access === 'view'
                                  ? 'bg-blue-500 border-blue-600 shadow-md'
                                  : 'bg-white border-gray-300 hover:border-blue-200 hover:bg-blue-50'
                                  }`}
                                title="View Access"
                              >
                                {access === 'view' && <Eye size={16} className="text-white" />}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handlePermissionAccessChange(item.key, access === 'full' ? null : 'full')}
                                className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${access === 'full'
                                  ? 'bg-green-500 border-green-600 shadow-md'
                                  : 'bg-white border-gray-300 hover:border-green-200 hover:bg-green-50'
                                  }`}
                                title="Full Access"
                              >
                                {access === 'full' && <Edit2 size={16} className="text-white" />}
                              </button>
                            </td>
                          </tr>
                          {/* Course Selection for Student Dashboard */}
                          {isCourseDashboard && hasCourseDashboardAccess && courses.length > 0 && (
                            <tr>
                              <td colSpan="4" className="px-4 py-4 bg-blue-50/30">
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-semibold text-gray-700">Select Courses:</span>
                                    <span className="text-xs text-gray-500">({Object.keys(coursePermissions).length} selected)</span>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {courses.map((course) => {
                                      const courseName = course.name || course;
                                      const courseId = course.id || course.name;
                                      const courseDisplayName = course.displayName || courseName;

                                      const accessById = getCoursePermissionAccess(course.id);
                                      const accessByName = getCoursePermissionAccess(courseName);
                                      const normName = normalizeCourseName(courseName);
                                      const normId = normalizeCourseName(course.id);

                                      const courseAccess = accessById || accessByName ||
                                        (permissions[`course-dashboard-${normId}`]) ||
                                        (permissions[`course-dashboard-${normName}`]) || null;

                                      return (
                                        <div key={courseId} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                                          <input
                                            type="checkbox"
                                            checked={courseAccess !== null}
                                            onChange={(e) => {
                                              const targetIdentifier = course.id || courseName;
                                              if (e.target.checked) {
                                                handleCoursePermissionChange(targetIdentifier, access);
                                              } else {
                                                handleCoursePermissionChange(targetIdentifier, null);
                                                if (course.id && courseName) {
                                                  handleCoursePermissionChange(courseName, null);
                                                }
                                              }
                                            }}
                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                          />
                                          <label className="text-sm text-gray-700 flex-1 cursor-pointer" onClick={() => {
                                            const targetIdentifier = course.id || courseName;
                                            if (courseAccess === null) {
                                              handleCoursePermissionChange(targetIdentifier, access);
                                            } else {
                                              handleCoursePermissionChange(targetIdentifier, null);
                                              if (course.id && courseName) {
                                                handleCoursePermissionChange(courseName, null);
                                              }
                                            }
                                          }}>
                                            {courseDisplayName}
                                          </label>
                                          {courseAccess !== null && (
                                            <div className="flex items-center gap-1">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const targetIdentifier = course.id || courseName;
                                                  handleCoursePermissionChange(targetIdentifier, courseAccess === 'view' ? 'full' : 'view');
                                                }}
                                                className={`px-2 py-1 text-xs rounded transition-colors ${courseAccess === 'view'
                                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                                                  }`}
                                                title={courseAccess === 'view' ? 'View Only - Click for Full Access' : 'Full Access - Click for View Only'}
                                              >
                                                {courseAccess === 'view' ? 'View' : 'Full'}
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {Object.keys(coursePermissions).length === 0 && (
                                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-2">
                                      <AlertCircle size={12} />
                                      No courses selected. Sub-admin will not have access to any course dashboard.
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {Object.keys(permissions).length === 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700 flex items-center gap-2">
                  <AlertCircle size={14} />
                  No permissions selected. Sub-admin will have limited access.
                </p>
              </div>
            )}

            {Object.keys(permissions).length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700">
                  <strong>{Object.keys(permissions).length}</strong> permission{Object.keys(permissions).length !== 1 ? 's' : ''} selected
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4 mt-8">
            <button type="button" onClick={onClose} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors duration-200">
              Cancel
            </button>
            <button type="submit" className="px-6 py-3 bg-blue-700 text-white rounded-xl font-medium hover:bg-blue-800 transition-all duration-200 shadow-lg">
              {subAdmin ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Add New Role Modal (Matching SDMS)
const AddRoleModal = ({ isOpen, onClose, onSave, loading }) => {
  const [label, setLabel] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!label.trim()) {
      alert('Please enter a role name');
      return;
    }
    const cleanLabel = label.trim();
    const autoSlug = cleanLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const cleanKey = roleKey.trim() || autoSlug;

    onSave({
      label: cleanLabel,
      roleKey: cleanKey,
      description: description.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <UserPlus size={20} />
            Add New Role
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Role name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => {
                const oldSlug = label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                const newSlug = e.target.value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                setLabel(e.target.value);
                if (!roleKey || roleKey === oldSlug) setRoleKey(newSlug);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 outline-none"
              placeholder="e.g. Store Incharge or Accountant"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Role key (optional)</label>
            <input
              type="text"
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 outline-none font-mono text-xs"
              placeholder="e.g. store_incharge"
            />
            <p className="text-[10px] text-slate-500 mt-1">Used internally; auto-filled from role name.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description (optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 outline-none resize-none"
              placeholder="Brief description of responsibilities and access scope"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !label.trim()}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors shadow flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={16} />}
              Create Role
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Role Permissions Configuration Modal (Edit Name & Configure Permissions)
const RoleConfigModal = ({ isOpen, onClose, roleData, onSave, saving }) => {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState({});

  useEffect(() => {
    if (isOpen && roleData) {
      setLabel(roleData.label || roleData.roleKey || '');
      setDescription(roleData.description || '');
      const sourcePerms = Array.isArray(roleData.permissions) ? roleData.permissions : [];
      setPermissions(permissionsToObject(normalizePermissions(sourcePerms)));
    }
  }, [isOpen, roleData]);

  if (!isOpen || !roleData) return null;

  const isSystemRole = roleData.isSystem || roleData.roleKey === 'Administrator';
  const isSuperAdmin = roleData.roleKey === 'Administrator';

  const handleAccessChange = (key, access) => {
    if (isSuperAdmin) return; // Super admin cannot be changed
    setPermissions(prev => {
      const next = { ...prev };
      if (!access) {
        delete next[key];
      } else {
        next[key] = access;
      }
      return next;
    });
  };

  const handleSelectAll = (level) => {
    if (isSuperAdmin) return;
    const allKeys = getAllPermissionKeys();
    const updated = {};
    if (level) {
      allKeys.forEach(k => {
        updated[k] = level;
      });
    }
    setPermissions(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const permsArray = isSuperAdmin ? ['*'] : objectToPermissions(permissions);
    onSave({
      roleKey: roleData.roleKey,
      label: label.trim() || roleData.roleKey,
      description: description.trim(),
      permissions: permsArray
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-gray-200 max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={22} className="text-white" />
            <div>
              <h2 className="text-lg font-bold text-white">
                {isSuperAdmin ? 'View Role: ' : 'Configure Role: '} {roleData.label}
              </h2>
              <p className="text-xs text-white/80 font-mono">Role Key: {roleData.roleKey}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role Name</label>
              <input
                type="text"
                disabled={isSuperAdmin}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:outline-none disabled:bg-slate-100"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <input
                type="text"
                disabled={isSuperAdmin}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:outline-none disabled:bg-slate-100"
                placeholder="Description of role permissions"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h4 className="text-sm font-bold text-slate-800">Default Permissions Matrix</h4>
                <p className="text-xs text-slate-500">Users created with this role will inherit these feature permissions by default.</p>
              </div>
              {!isSuperAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAll('full')}
                    className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                  >
                    Select All Full
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectAll('view')}
                    className="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100"
                  >
                    Select All View
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectAll(null)}
                    className="px-2.5 py-1 text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-200"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              <div className="max-h-[380px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-slate-100 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Feature</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider w-28">No Access</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider w-28">View Only</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider w-28">Full Access</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {SIDEBAR_ITEMS.map((item) => {
                      if (item.children) {
                        return (
                          <React.Fragment key={item.key}>
                            <tr className="bg-purple-50/40">
                              <td colSpan="4" className="px-4 py-2">
                                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">{item.label}</span>
                              </td>
                            </tr>
                            {item.children.map((child) => {
                              const access = isSuperAdmin ? 'full' : (permissions[child.key] || null);
                              return (
                                <tr key={child.key} className="hover:bg-slate-50">
                                  <td className="px-4 py-2 pl-8">
                                    <span className="text-xs font-medium text-slate-700">{child.label}</span>
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    <input
                                      type="radio"
                                      name={`role-perm-${child.key}`}
                                      disabled={isSuperAdmin}
                                      checked={!access}
                                      onChange={() => handleAccessChange(child.key, null)}
                                      className="w-4 h-4 text-slate-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    <input
                                      type="radio"
                                      name={`role-perm-${child.key}`}
                                      disabled={isSuperAdmin}
                                      checked={access === 'view'}
                                      onChange={() => handleAccessChange(child.key, 'view')}
                                      className="w-4 h-4 text-blue-600 cursor-pointer"
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    <input
                                      type="radio"
                                      name={`role-perm-${child.key}`}
                                      disabled={isSuperAdmin}
                                      checked={access === 'full'}
                                      onChange={() => handleAccessChange(child.key, 'full')}
                                      className="w-4 h-4 text-emerald-600 cursor-pointer"
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      }

                      const access = isSuperAdmin ? 'full' : (permissions[item.key] || null);
                      return (
                        <tr key={item.key} className="hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <span className="text-xs font-medium text-slate-800">{item.label}</span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="radio"
                              name={`role-perm-${item.key}`}
                              disabled={isSuperAdmin}
                              checked={!access}
                              onChange={() => handleAccessChange(item.key, null)}
                              className="w-4 h-4 text-slate-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="radio"
                              name={`role-perm-${item.key}`}
                              disabled={isSuperAdmin}
                              checked={access === 'view'}
                              onChange={() => handleAccessChange(item.key, 'view')}
                              className="w-4 h-4 text-blue-600 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="radio"
                              name={`role-perm-${item.key}`}
                              disabled={isSuperAdmin}
                              checked={access === 'full'}
                              onChange={() => handleAccessChange(item.key, 'full')}
                              className="w-4 h-4 text-emerald-600 cursor-pointer"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50"
            >
              {isSuperAdmin ? 'Close' : 'Cancel'}
            </button>
            {!isSuperAdmin && (
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors shadow flex items-center gap-2"
              >
                {saving ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Save Role Configuration
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

const SubAdminManagement = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'roles'
  const [subAdmins, setSubAdmins] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubAdmin, setEditingSubAdmin] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Role config modals
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [showRoleConfigModal, setShowRoleConfigModal] = useState(false);
  const [activeRoleForConfig, setActiveRoleForConfig] = useState(null);
  const [savingRoleConfig, setSavingRoleConfig] = useState(false);

  // Check if current user is super admin
  const isSuperAdmin = currentUser?.role === 'Administrator';

  // Fetch Users
  const fetchSubAdmins = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/api/subadmins'));
      if (!response.ok) {
        throw new Error(`Failed to load: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      const list = Array.isArray(data) ? data : [];
      setSubAdmins(
        list.map(sa => ({
          ...sa,
          id: sa._id,
          permissions: normalizePermissions(sa.permissions),
        }))
      );
    } catch (error) {
      console.error("Failed to fetch sub-admins:", error);
    }
  }, []);

  // Fetch Roles
  const fetchRoles = useCallback(async () => {
    setLoadingRoles(true);
    try {
      const response = await fetch(apiUrl('/api/roles'));
      if (response.ok) {
        const data = await response.json();
        setRoles(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Failed to fetch roles:", error);
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  useEffect(() => {
    fetchSubAdmins();
    fetchRoles();
  }, [fetchSubAdmins, fetchRoles]);

  const handleCreate = () => {
    setEditingSubAdmin(null);
    setIsModalOpen(true);
  };

  const handleEdit = (subAdmin) => {
    setEditingSubAdmin(subAdmin);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    fetch(apiUrl(`/api/subadmins/${id}`), { method: 'DELETE' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to delete');
        setSubAdmins(prev => prev.filter(sa => sa.id !== id));
        fetchRoles(); // Update role user counts
      })
      .catch(err => alert(`Error: ${err.message}`));
  };

  const handleSave = async (subAdminData) => {
    const isUpdating = !!subAdminData.id;
    const url = isUpdating ? apiUrl(`/api/subadmins/${subAdminData.id}`) : apiUrl('/api/subadmins');
    const method = isUpdating ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subAdminData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          message: `Request failed with status: ${response.status} ${response.statusText}`
        }));
        throw new Error(errorData.message || 'Save operation failed');
      }

      await fetchSubAdmins();
      await fetchRoles();
      setIsModalOpen(false);
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  // Create new role handler
  const handleCreateRole = async (newRoleData) => {
    setCreatingRole(true);
    try {
      const response = await fetch(apiUrl('/api/roles'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRoleData),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Failed to create role' }));
        throw new Error(err.message || 'Failed to create role');
      }

      setShowAddRoleModal(false);
      await fetchRoles();
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setCreatingRole(false);
    }
  };

  // Save role configuration handler
  const handleSaveRoleConfig = async (roleConfigData) => {
    setSavingRoleConfig(true);
    try {
      const response = await fetch(apiUrl(`/api/roles/${roleConfigData.roleKey}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roleConfigData),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Failed to update role' }));
        throw new Error(err.message || 'Failed to update role');
      }

      setShowRoleConfigModal(false);
      setActiveRoleForConfig(null);
      await fetchRoles();
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setSavingRoleConfig(false);
    }
  };

  // Delete role handler
  const handleDeleteRole = async (roleObj) => {
    if (!window.confirm(`Are you sure you want to delete role "${roleObj.label}"?`)) return;

    try {
      const response = await fetch(apiUrl(`/api/roles/${roleObj.roleKey}`), {
        method: 'DELETE',
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Failed to delete role' }));
        throw new Error(err.message || 'Failed to delete role');
      }

      await fetchRoles();
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  const filteredSubAdmins = subAdmins.filter(sa => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const nameMatch = sa.name && sa.name.toLowerCase().includes(q);
    const roleMatch = sa.role && sa.role.toLowerCase().includes(q);
    const collegeMatch = (sa.assignedCollege?.name && sa.assignedCollege.name.toLowerCase().includes(q)) ||
      (sa.assignedBranch?.name && sa.assignedBranch.name.toLowerCase().includes(q));
    const empNameMatch = sa.employeeName && sa.employeeName.toLowerCase().includes(q);
    const empNoMatch = sa.empNo && sa.empNo.toLowerCase().includes(q);
    return nameMatch || roleMatch || collegeMatch || empNameMatch || empNoMatch;
  });

  return (
    <>
      <div className="min-h-screen bg-background text-text-main py-8 px-4 sm:px-6 lg:px-8">
        <div className="w-full">
          {/* Main Top Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 rounded-xl shadow-lg">
                <Users size={32} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  User Management
                </h1>
                <p className="text-gray-600 mt-1">
                  Manage portal users, configure custom roles and set default feature access
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Tabs (Users vs Role Configuration like SDMS) */}
          <div className="flex items-center gap-2 mb-6 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm border-b-2 transition-all duration-200 ${
                activeTab === 'users'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Users size={18} />
              <span>Users ({subAdmins.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('roles')}
              className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm border-b-2 transition-all duration-200 ${
                activeTab === 'roles'
                  ? 'border-violet-600 text-violet-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Settings size={18} />
              <span>Role Configuration ({roles.length})</span>
            </button>
          </div>

          {/* TAB 1: USERS LIST */}
          {activeTab === 'users' && (
            <>
              {/* Search Bar & Action Header */}
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center mb-6">
                <div className="relative flex-1 max-w-xl">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search configured users by Name, Emp ID, Role, College..."
                    className="w-full pl-10 pr-10 py-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {isSuperAdmin && (
                  <button
                    onClick={handleCreate}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-md hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Plus size={18} />
                    Create User
                  </button>
                )}
              </div>

              {/* Configured Users Table */}
              {filteredSubAdmins.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-lg p-12 text-center border border-gray-200">
                  <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users size={36} className="text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {searchQuery ? `No users matching "${searchQuery}"` : 'No Users Yet'}
                  </h3>
                  <p className="text-sm text-gray-500 mb-6">
                    {searchQuery ? 'No configured user matches your search. Try searching by username, name, or employee ID.' : 'Click Create User to assign features.'}
                  </p>
                  {searchQuery ? (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium text-sm transition-colors"
                    >
                      Clear Search
                    </button>
                  ) : isSuperAdmin && (
                    <button onClick={handleCreate} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold shadow hover:shadow-md transition-all inline-flex items-center gap-2 text-sm">
                      <Plus size={18} />
                      Create User
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
                  <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-gray-50 to-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Configured Users ({filteredSubAdmins.length})
                    </h2>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {filteredSubAdmins.map((subAdmin, index) => (
                      <div key={subAdmin.id} className={`p-6 hover:bg-indigo-50/50 transition-colors duration-200 ${index === 0 ? 'border-t-0' : ''}`}>
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-md">
                              <span className="text-white font-bold text-lg">
                                {(subAdmin.employeeName || subAdmin.name || 'U').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-lg font-semibold text-gray-900">{subAdmin.name}</h3>
                                {subAdmin.employeeName && subAdmin.employeeName.toLowerCase() !== subAdmin.name.toLowerCase() && (
                                  <span className="text-sm font-medium text-gray-600">
                                    ({subAdmin.employeeName})
                                  </span>
                                )}
                                {subAdmin.empNo && subAdmin.empNo.toLowerCase() !== subAdmin.name.toLowerCase() && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-mono rounded">
                                    ID: {subAdmin.empNo}
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-500 flex flex-wrap items-center gap-2 mt-1">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  subAdmin.role === 'Administrator'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                    : subAdmin.role === 'Editor'
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : subAdmin.role === 'Viewer'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-purple-100 text-purple-800 border border-purple-200'
                                }`}>
                                  {subAdmin.role || 'Editor'}
                                </span>
                                {(subAdmin.assignedCollege || subAdmin.assignedBranch) && (
                                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                    📍 {(subAdmin.assignedCollege?.name || subAdmin.assignedBranch?.name || 'College Assigned')}
                                  </span>
                                )}
                              </div>
                              {Array.isArray(subAdmin.permissions) && subAdmin.permissions.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {subAdmin.permissions.slice(0, 4).map((perm) => {
                                    const parsed = parsePermission(perm);
                                    const label = PERMISSION_LABELS[parsed.key];
                                    if (!label) return null;
                                    return (
                                      <span
                                        key={perm}
                                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${parsed.access === 'full'
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-blue-100 text-blue-700'
                                          }`}
                                        title={parsed.access === 'full' ? 'Full Access' : 'View Only'}
                                      >
                                        {label} {parsed.access === 'view' && '(View)'}
                                      </span>
                                    );
                                  })}
                                  {subAdmin.permissions.length > 4 && (
                                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                                      +{subAdmin.permissions.length - 4} more features
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEdit(subAdmin)}
                              className="px-3 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-all duration-200 font-medium text-xs flex items-center gap-1.5"
                              title="Edit Features"
                            >
                              <Edit size={14} />
                              <span>Edit Features</span>
                            </button>
                            <button
                              onClick={() => handleDelete(subAdmin.id)}
                              className="p-2 bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 rounded-lg transition-all duration-200"
                              title="Delete User"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: ROLE CONFIGURATION (Like SDMS) */}
          {activeTab === 'roles' && (
            <div className="w-full bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Settings size={20} />
                    Role Configuration
                  </h2>
                  <p className="text-xs text-white/90 mt-1">
                    Set default module access per role. Create and customize roles like SDMS.
                  </p>
                </div>
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowAddRoleModal(true)}
                    className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-semibold flex items-center gap-2 flex-shrink-0 transition-colors shadow-sm"
                  >
                    <UserPlus size={16} />
                    Add new role
                  </button>
                )}
              </div>

              <div className="p-6">
                {loadingRoles ? (
                  <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
                    <RefreshCw className="animate-spin" size={32} />
                    <p className="text-sm font-medium">Loading role configurations...</p>
                  </div>
                ) : roles.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    <Shield size={40} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-base font-semibold">No roles found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {roles.map((config) => {
                      const isSuperAdminRole = config.roleKey === 'Administrator' || config.roleKey === 'super_admin';
                      const isSystemRole = config.isSystem || isSuperAdminRole;
                      const permList = Array.isArray(config.permissions) ? config.permissions : [];
                      const permCount = permList.length;

                      // Card color theme
                      const avatarGradient = isSuperAdminRole
                        ? 'from-rose-500 to-red-600'
                        : config.roleKey === 'Editor'
                        ? 'from-blue-500 to-indigo-600'
                        : config.roleKey === 'Viewer'
                        ? 'from-amber-500 to-orange-600'
                        : 'from-violet-500 to-purple-600';

                      return (
                        <div
                          key={config.roleKey || config._id}
                          className={`rounded-2xl border transition-all overflow-hidden flex flex-col justify-between p-5 ${
                            isSuperAdminRole
                              ? 'border-rose-200 bg-gradient-to-b from-rose-50/40 via-white to-white shadow-sm ring-1 ring-rose-100 hover:shadow-md'
                              : 'border-slate-200 bg-white hover:border-violet-300 hover:shadow-md'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center shadow-md flex-shrink-0`}>
                                  <ShieldCheck size={20} className="text-white" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h3 className="font-bold text-slate-900 text-base truncate">{config.label}</h3>
                                    {isSystemRole ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 tracking-wider">
                                        <Lock size={9} />
                                        SYSTEM
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                                        CUSTOM
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs font-mono text-slate-400 mt-0.5">Key: {config.roleKey}</p>
                                </div>
                              </div>
                            </div>
                            <p className="text-xs text-slate-600 mt-3 line-clamp-2 leading-relaxed">
                              {config.description || (isSuperAdminRole ? 'Full system administrative privileges.' : 'Custom configured access role.')}
                            </p>
                          </div>

                          <div className="mt-5 pt-3.5 border-t border-slate-100 flex flex-col gap-3">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              {isSuperAdminRole ? (
                                <span className="font-semibold text-emerald-600 flex items-center gap-1">
                                  <CheckCircle2 size={12} className="text-emerald-500" /> All permissions enabled
                                </span>
                              ) : (
                                <span><strong>{permCount}</strong> feature permission(s)</span>
                              )}
                              <span className="bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                                {config.userCount || 0} user(s)
                              </span>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveRoleForConfig(config);
                                  setShowRoleConfigModal(true);
                                }}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm ${
                                  isSuperAdminRole
                                    ? 'bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100'
                                    : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                {isSuperAdminRole ? <Eye size={13} /> : <Edit size={13} />}
                                {isSuperAdminRole ? 'View permissions' : 'Edit name & configure'}
                              </button>

                              {!isSystemRole && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRole(config)}
                                  className="px-2.5 py-1.5 text-xs font-semibold bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1"
                                  title="Delete custom role"
                                >
                                  <Trash2 size={13} />
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Form Modal */}
      <SubAdminModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        subAdmin={editingSubAdmin}
        availableRoles={roles}
      />

      {/* Add New Role Modal */}
      <AddRoleModal
        isOpen={showAddRoleModal}
        onClose={() => setShowAddRoleModal(false)}
        onSave={handleCreateRole}
        loading={creatingRole}
      />

      {/* Configure Role Permissions Modal */}
      <RoleConfigModal
        isOpen={showRoleConfigModal}
        onClose={() => {
          setShowRoleConfigModal(false);
          setActiveRoleForConfig(null);
        }}
        roleData={activeRoleForConfig}
        onSave={handleSaveRoleConfig}
        saving={savingRoleConfig}
      />
    </>
  );
};

export default SubAdminManagement;
