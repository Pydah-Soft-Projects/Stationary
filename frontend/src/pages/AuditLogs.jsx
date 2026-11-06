import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ClipboardCheck,
  ClipboardList,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  Info,
  History,
  Clock,
  Lock,
  ShieldCheck,
  Users,
  Search,
  Filter,
  Eye,
  ArrowRight,
  ArrowRightLeft,
  Package,
  User as UserIcon,
  Receipt,
  Building,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
  Key,
  AlertTriangle,
  Shield,
  Layers
} from 'lucide-react';
import { apiUrl } from '../utils/api';
import { hasViewAccess } from '../utils/permissions';

const getCurrentUserName = () => {
  try {
    const saved = localStorage.getItem('currentUser');
    if (!saved) return 'System';
    const parsed = JSON.parse(saved);
    return parsed?.name || 'System';
  } catch (error) {
    return 'System';
  }
};

const getCurrentUserInfo = () => {
  try {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    return null;
  }
};

const AuditLogs = ({ currentUser, initialTab }) => {
  const location = useLocation();
  const isUserAuditPage = location?.pathname === '/user-audits' || initialTab === 'user-audit';

  // Use currentUser prop if provided, otherwise fallback to localStorage
  const currentUserInfo = useMemo(() => {
    return currentUser || getCurrentUserInfo();
  }, [currentUser]);

  const currentUserPermissions = Array.isArray(currentUserInfo?.permissions) ? currentUserInfo.permissions : [];
  const isSuperAdmin = currentUserInfo?.role === 'Administrator';

  // Check for legacy audit-logs permission (without access level)
  const hasLegacyAuditPermission = currentUserPermissions.some(p => {
    if (typeof p !== 'string') return false;
    return p === 'audit-logs' || p.startsWith('audit-logs:');
  });

  // Use hasViewAccess to properly check permissions with access levels
  const canAccessEntry =
    isSuperAdmin ||
    hasLegacyAuditPermission ||
    hasViewAccess(currentUserPermissions, 'audit-log-entry');
  const canAccessApproval =
    isSuperAdmin ||
    hasLegacyAuditPermission ||
    hasViewAccess(currentUserPermissions, 'audit-log-approval');
  const canAccessUserAudit = isSuperAdmin || hasLegacyAuditPermission || true;

  const [activeTab, setActiveTab] = useState(() => {
    if (isUserAuditPage) return 'user-audit';
    if (canAccessEntry) return 'entry';
    if (canAccessApproval) return 'approval';
    return 'entry';
  });

  // Helper to resolve the actual staff / employee name and details for display
  const getResolvedStaff = (row) => {
    let name = row?.userName;
    let id = row?.empNo;
    let role = row?.userRole || 'Staff';

    // If placeholder name was stored in legacy or fallback, replace with logged-in user or clean label
    if (!name || name === 'Counter Operator' || name === 'STAFF') {
      name = currentUserInfo?.employeeName || currentUserInfo?.name || 'Staff Member';
    }
    if (!id || id === 'STAFF') {
      id = currentUserInfo?.empNo || currentUserInfo?.emp_no || '';
    }
    return { name, id, role };
  };

  // ==========================================
  // USER AUDIT (HRMS-STYLE) STATES
  // ==========================================
  const [userAudits, setUserAudits] = useState([]);
  const [userAuditLoading, setUserAuditLoading] = useState(false);
  const [userAuditError, setUserAuditError] = useState('');
  const [userAuditSearch, setUserAuditSearch] = useState('');
  const [userAuditEventFilter, setUserAuditEventFilter] = useState('all');
  const [userAuditStartDate, setUserAuditStartDate] = useState('');
  const [userAuditEndDate, setUserAuditEndDate] = useState('');
  const [userAuditPage, setUserAuditPage] = useState(1);
  const [userAuditLimit] = useState(20);
  const [userAuditTotal, setUserAuditTotal] = useState(0);
  const [userAuditTotalPages, setUserAuditTotalPages] = useState(1);
  const [userAuditStats, setUserAuditStats] = useState({
    totalAudits: 0,
    eventsToday: 0,
    uniqueUsers: 0,
    loginCount: 0,
    distributionCount: 0,
    stockActionCount: 0,
  });
  const [selectedUserAudit, setSelectedUserAudit] = useState(null);

  // Fetch HRMS-style User Audits
  const fetchUserAudits = useCallback(async () => {
    setUserAuditLoading(true);
    setUserAuditError('');
    try {
      const q = new URLSearchParams();
      q.append('page', String(userAuditPage));
      q.append('limit', String(userAuditLimit));
      if (userAuditSearch.trim()) q.append('search', userAuditSearch.trim());
      if (userAuditEventFilter !== 'all') q.append('event', userAuditEventFilter);
      if (userAuditStartDate) q.append('startDate', userAuditStartDate);
      if (userAuditEndDate) q.append('endDate', userAuditEndDate);

      const res = await fetch(apiUrl(`/api/audit-logs/user-audits?${q.toString()}`));
      if (!res.ok) {
        throw new Error(`Failed to load user audits (${res.status})`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setUserAudits(data.data);
        if (data.pagination) {
          setUserAuditTotal(data.pagination.total || 0);
          setUserAuditTotalPages(data.pagination.totalPages || 1);
        }
        if (data.stats) {
          setUserAuditStats(data.stats);
        }
      } else {
        setUserAudits([]);
      }
    } catch (err) {
      console.error('Error fetching user audits:', err);
      setUserAuditError(err.message || 'Error loading user activity audits');
      setUserAudits([]);
    } finally {
      setUserAuditLoading(false);
    }
  }, [userAuditPage, userAuditLimit, userAuditSearch, userAuditEventFilter, userAuditStartDate, userAuditEndDate]);

  useEffect(() => {
    if (isUserAuditPage) {
      fetchUserAudits();
    }
  }, [isUserAuditPage, fetchUserAudits]);

  // ==========================================
  // STOCK AUDIT LOG ENTRY & APPROVAL STATES
  // ==========================================
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [entryValues, setEntryValues] = useState({});
  const [beforeTouched, setBeforeTouched] = useState({});
  const [entryStatus, setEntryStatus] = useState({});
  const [isSubmittingAll, setIsSubmittingAll] = useState(false);
  const [pendingLogs, setPendingLogs] = useState([]);
  const groupLogsByBatch = (logs = []) => {
    const groups = new Map();
    logs.forEach((log) => {
      const key = log.batchId || log._id;
      if (!groups.has(key)) {
        groups.set(key, {
          batchId: key,
          status: log.status,
          createdBy: log.createdBy || 'System',
          createdAt: log.createdAt,
          approvedBy: log.approvedBy,
          approvedAt: log.approvedAt,
          items: [],
        });
      }
      const group = groups.get(key);
      group.items.push(log);
      if (log.status && group.status !== log.status) {
        group.status = log.status;
      }
      if (log.approvedBy) {
        group.approvedBy = log.approvedBy;
      }
      if (log.approvedAt) {
        group.approvedAt = log.approvedAt;
      }
    });

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  };
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const [approvingId, setApprovingId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const currentUserName = useMemo(
    () => currentUserInfo?.name || getCurrentUserName(),
    [currentUserInfo]
  );

  const userCollegeId = useMemo(() => {
    return currentUserInfo?.assignedCollege?._id || currentUserInfo?.assignedCollege || null;
  }, [currentUserInfo]);

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError('');
    try {
      const response = await fetch(apiUrl('/api/products'));
      if (!response.ok) {
        throw new Error(`Failed to load products: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching products:', error);
      setProductsError(error.message || 'Unable to load products.');
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const fetchPendingLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError('');
    try {
      const url = userCollegeId && !isSuperAdmin
        ? apiUrl(`/api/audit-logs?status=pending&collegeId=${userCollegeId}`)
        : apiUrl('/api/audit-logs?status=pending');

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load audit logs: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      setPendingLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      setLogsError(error.message || 'Unable to load pending audit logs.');
    } finally {
      setLogsLoading(false);
    }
  }, [userCollegeId, isSuperAdmin]);

  const fetchHistoryLogs = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const url = userCollegeId && !isSuperAdmin
        ? apiUrl(`/api/audit-logs?status=all&collegeId=${userCollegeId}`)
        : apiUrl('/api/audit-logs?status=all');

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load audit history: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      const nonPending = (Array.isArray(data) ? data : []).filter(
        (log) => log.status === 'approved' || log.status === 'rejected'
      );
      setHistoryLogs(nonPending);
    } catch (error) {
      console.error('Error fetching audit history:', error);
      setHistoryError(error.message || 'Unable to load audit history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [userCollegeId, isSuperAdmin]);

  useEffect(() => {
    if (!isUserAuditPage) {
      fetchProducts();
      fetchPendingLogs();
      fetchHistoryLogs();
    }
  }, [isUserAuditPage, fetchProducts, fetchPendingLogs, fetchHistoryLogs, refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    if (isUserAuditPage) {
      fetchUserAudits();
    }
  };

  const pendingGroups = useMemo(() => groupLogsByBatch(pendingLogs), [pendingLogs]);
  const historyGroups = useMemo(() => groupLogsByBatch(historyLogs), [historyLogs]);

  // Format date helper
  const formatDateTime = (ts) => {
    if (!ts) return { date: '—', time: '—' };
    try {
      const d = new Date(ts);
      return {
        date: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        full: d.toLocaleString('en-IN'),
      };
    } catch {
      return { date: String(ts), time: '', full: String(ts) };
    }
  };

  // Render Event Badge for User Audit (HRMS-style)
  const renderUserAuditEventBadge = (event) => {
    switch (event) {
      case 'login':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={13} className="text-emerald-600" />
            Login Session
          </span>
        );
      case 'distribution':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Receipt size={13} className="text-blue-600" />
            Stock Distribution
          </span>
        );
      case 'stock_entry':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            <Package size={13} className="text-teal-600" />
            Goods Received
          </span>
        );
      case 'stock_transfer':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <ArrowRightLeft size={13} className="text-purple-600" />
            Stock Transfer
          </span>
        );
      case 'user_management':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Shield size={13} className="text-amber-600" />
            User / Role Modified
          </span>
        );
      case 'audit_adjustment':
      case 'audit_approval':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <ClipboardCheck size={13} className="text-rose-600" />
            Stock Audit
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200">
            <Info size={13} className="text-slate-500" />
            {event?.replace(/_/g, ' ') || 'Activity'}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background text-text-main p-4 sm:p-6 lg:p-8">
      <div className="mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
              isUserAuditPage
                ? 'bg-gradient-to-br from-indigo-600 to-purple-700 text-white'
                : 'bg-gradient-to-br from-blue-600 to-blue-800 text-white'
            }`}>
              {isUserAuditPage ? <ShieldCheck size={28} /> : <ClipboardCheck size={28} />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  {isUserAuditPage ? 'User Activity Audits' : 'Stock Audit Logs'}
                </h1>
                {isUserAuditPage && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase tracking-wide">
                    HRMS Security
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {isUserAuditPage
                  ? 'Track user login sessions and the activities performed during each session across the system.'
                  : `Record ${userCollegeId && !isSuperAdmin ? 'College' : 'Stock'} physical inventory counts and approve adjustments.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <RefreshCcw size={16} />
              Refresh
            </button>
          </div>
        </div>

        {/* Tab Switcher - Only shown on /audit-logs for Stock Audits */}
        {!isUserAuditPage && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => canAccessEntry && setActiveTab('entry')}
                disabled={!canAccessEntry}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
                  activeTab === 'entry'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                } ${!canAccessEntry ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : ''}`}
              >
                {canAccessEntry ? <ClipboardList size={18} /> : <Lock size={18} />}
                Stock Audit Entry
              </button>
              <button
                onClick={() => canAccessApproval && setActiveTab('approval')}
                disabled={!canAccessApproval}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
                  activeTab === 'approval'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                } ${!canAccessApproval ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : ''}`}
              >
                {canAccessApproval ? <ClipboardCheck size={18} /> : <Lock size={18} />}
                Stock Audit Approval {pendingLogs.length > 0 && `(${pendingLogs.length})`}
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 1: HRMS USER AUDIT VIEW (Only on /user-audits)       */}
        {/* ======================================================== */}
        {isUserAuditPage && (
          <div className="space-y-6">
            {/* Stat Cards (HRMS LoansStatGrid style) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl p-5 border border-indigo-100 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Audits Recorded</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{userAuditStats.totalAudits || userAudits.length}</p>
                  <p className="text-xs text-indigo-600 mt-0.5 font-medium">All logged user operations</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <ShieldCheck size={24} />
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Activities Today</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{userAuditStats.eventsToday || 0}</p>
                  <p className="text-xs text-emerald-600 mt-0.5 font-medium">In the last 24 hours</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Clock size={24} />
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-purple-100 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Users / Logins</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {userAuditStats.uniqueUsers || 1} <span className="text-xs font-normal text-gray-500">({userAuditStats.loginCount || 0} logins)</span>
                  </p>
                  <p className="text-xs text-purple-600 mt-0.5 font-medium">Distinct operators logged in</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Users size={24} />
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-blue-100 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Counter Distributions</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{userAuditStats.distributionCount || 0}</p>
                  <p className="text-xs text-blue-600 mt-0.5 font-medium">Student / Staff counter sales</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Receipt size={24} />
                </div>
              </div>
            </div>

            {/* Main Content Card */}
            <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
              {/* Header Gradient */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <ShieldCheck size={20} />
                    User Activity &amp; Login Audit Trail
                  </h2>
                  <p className="text-xs text-white/90 mt-0.5">
                    Real-time log of what user performed which activity at that login time
                  </p>
                </div>
                <span className="text-xs font-semibold px-3 py-1 bg-white/20 text-white rounded-lg self-start sm:self-auto">
                  {userAuditTotal} Records
                </span>
              </div>

              {/* Filter & Search Toolbar (HRMS style) */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex flex-1 flex-wrap items-center gap-2.5">
                  <div className="relative min-w-[240px] flex-1 sm:max-w-md">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search user, modifier, employee ID, action or comments..."
                      value={userAuditSearch}
                      onChange={(e) => {
                        setUserAuditSearch(e.target.value);
                        setUserAuditPage(1);
                      }}
                      className="w-full pl-10 pr-3.5 py-2 text-xs bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                  </div>

                  <select
                    value={userAuditEventFilter}
                    onChange={(e) => {
                      setUserAuditEventFilter(e.target.value);
                      setUserAuditPage(1);
                    }}
                    className="px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  >
                    <option value="all">All Audit Events</option>
                    <option value="login">🔐 User Logins</option>
                    <option value="distribution">📦 Counter Distributions</option>
                    <option value="stock_entry">📥 Goods Received / Entries</option>
                    <option value="stock_transfer">🔁 Stock Transfers</option>
                    <option value="user_management">👤 User &amp; Role Management</option>
                    <option value="audit_adjustment">📋 Stock Audit Counts</option>
                  </select>

                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input
                      type="date"
                      value={userAuditStartDate}
                      onChange={(e) => {
                        setUserAuditStartDate(e.target.value);
                        setUserAuditPage(1);
                      }}
                      className="px-3 py-1.5 bg-white border border-gray-300 rounded-xl text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      title="From date"
                    />
                    <span>to</span>
                    <input
                      type="date"
                      value={userAuditEndDate}
                      onChange={(e) => {
                        setUserAuditEndDate(e.target.value);
                        setUserAuditPage(1);
                      }}
                      className="px-3 py-1.5 bg-white border border-gray-300 rounded-xl text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      title="To date"
                    />
                  </div>
                </div>

                {(userAuditSearch || userAuditEventFilter !== 'all' || userAuditStartDate || userAuditEndDate) && (
                  <button
                    onClick={() => {
                      setUserAuditSearch('');
                      setUserAuditEventFilter('all');
                      setUserAuditStartDate('');
                      setUserAuditEndDate('');
                      setUserAuditPage(1);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors whitespace-nowrap self-end lg:self-auto"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto">
                {userAuditLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3 text-gray-400">
                    <RefreshCcw className="animate-spin text-indigo-600" size={32} />
                    <p className="text-sm font-semibold text-gray-600">Loading user activity audits...</p>
                  </div>
                ) : userAudits.length === 0 ? (
                  <div className="p-16 text-center text-gray-500">
                    <ShieldCheck size={48} className="mx-auto text-gray-300 mb-3" />
                    <h3 className="text-lg font-bold text-gray-800">No user audit records found</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {userAuditSearch ? `No events match "${userAuditSearch}"` : 'User login sessions and performed activities will appear here.'}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-100/75 border-b border-gray-200 text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-3.5">Timestamp &amp; Login Time</th>
                        <th className="px-5 py-3.5">User / Modifier</th>
                        <th className="px-5 py-3.5">Activity Event</th>
                        <th className="px-5 py-3.5">Performed Action &amp; Details</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs text-gray-700 bg-white">
                      {userAudits.map((row) => {
                        const time = formatDateTime(row.createdAt);
                        const loginT = formatDateTime(row.loginTime);

                        return (
                          <tr key={row._id} className="hover:bg-indigo-50/40 transition-colors">
                            {/* Timestamp & Login Time */}
                            <td className="px-5 py-4 whitespace-nowrap align-top">
                              <div className="font-semibold text-gray-900">{time.date}</div>
                              <div className="text-[11px] text-gray-500">{time.time}</div>
                              {row.loginTime && (
                                <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] text-slate-700 font-mono">
                                  <Clock size={10} className="text-slate-500" />
                                  <span>Login: {loginT.time}</span>
                                </div>
                              )}
                            </td>

                            {/* User / Modifier */}
                            <td className="px-5 py-4 align-top">
                              {(() => {
                                const staff = getResolvedStaff(row);
                                return (
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shadow-sm flex-shrink-0">
                                      {(staff.name || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-bold text-gray-900 truncate">{staff.name}</div>
                                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                        {staff.id && (
                                          <span className="font-mono text-[10px] px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded">
                                            ID: {staff.id}
                                          </span>
                                        )}
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                                          staff.role === 'Administrator'
                                            ? 'bg-rose-100 text-rose-700'
                                            : 'bg-blue-100 text-blue-700'
                                        }`}>
                                          {staff.role}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Activity Event */}
                            <td className="px-5 py-4 whitespace-nowrap align-top">
                              {renderUserAuditEventBadge(row.event)}
                            </td>

                            {/* Action Description */}
                            <td className="px-5 py-4 align-top">
                              <div className="font-semibold text-gray-900">{row.action}</div>
                              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                                {row.description}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {row.collegeName && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                    <Building size={10} />
                                    {row.collegeName}
                                  </span>
                                )}
                                {row.ip && row.ip !== 'Internal Counter' && (
                                  <span className="text-[10px] font-mono text-gray-400">
                                    IP: {row.ip}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Action Button */}
                            <td className="px-5 py-4 text-right align-top whitespace-nowrap">
                              <button
                                onClick={() => setSelectedUserAudit(row)}
                                className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors inline-flex items-center gap-1.5"
                                title="View activity details"
                              >
                                <Eye size={13} />
                                <span>Details</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination Controls */}
              {userAuditTotalPages > 1 && (
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Showing page <strong>{userAuditPage}</strong> of <strong>{userAuditTotalPages}</strong> ({userAuditTotal} total events)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUserAuditPage(prev => Math.max(1, prev - 1))}
                      disabled={userAuditPage <= 1}
                      className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white flex items-center gap-1"
                    >
                      <ChevronLeft size={14} />
                      Previous
                    </button>
                    <button
                      onClick={() => setUserAuditPage(prev => Math.min(userAuditTotalPages, prev + 1))}
                      disabled={userAuditPage >= userAuditTotalPages}
                      className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white flex items-center gap-1"
                    >
                      Next
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2 & 3: STOCK AUDIT ENTRY & APPROVAL (Original Views) */}
        {/* ======================================================== */}
        {!isUserAuditPage && activeTab === 'none' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-600">
            <Lock className="mx-auto mb-3 text-gray-400" size={32} />
            <p className="text-sm font-medium">You do not have permission to access audit logs.</p>
          </div>
        )}

        {!isUserAuditPage && activeTab === 'entry' && canAccessEntry && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Audit Log Entry</h3>
            <p className="text-sm text-gray-500 mb-6">
              Review current stock counts and enter newly verified inventory values for adjustment approval.
            </p>
            {/* Products table for physical count input */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600 uppercase">
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">Course / Branch</th>
                    <th className="py-3 px-4">System Stock</th>
                    <th className="py-3 px-4">Physical Verified Count</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map((p) => {
                    const before = p.stock || 0;
                    const after = entryValues[p._id]?.after ?? '';
                    const notes = entryValues[p._id]?.notes ?? '';
                    const status = entryStatus[p._id];

                    return (
                      <tr key={p._id} className="hover:bg-gray-50">
                        <td className="py-3 px-4 font-semibold text-gray-800">{p.name}</td>
                        <td className="py-3 px-4 text-xs text-gray-500">{p.forCourse || 'General'}</td>
                        <td className="py-3 px-4 font-mono font-bold text-gray-700">{before}</td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            min="0"
                            placeholder="Counted"
                            value={after}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEntryValues(prev => ({ ...prev, [p._id]: { ...prev[p._id], after: val } }));
                            }}
                            className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            placeholder="Reason / Notes"
                            value={notes}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEntryValues(prev => ({ ...prev, [p._id]: { ...prev[p._id], notes: val } }));
                            }}
                            className="w-full max-w-xs px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={async () => {
                              if (after === '' || isNaN(Number(after))) {
                                alert('Please enter a valid count');
                                return;
                              }
                              try {
                                const res = await fetch(apiUrl('/api/audit-logs'), {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    productId: p._id,
                                    beforeQuantity: before,
                                    afterQuantity: Number(after),
                                    notes,
                                    createdBy: currentUserName,
                                    collegeId: userCollegeId
                                  })
                                });
                                if (res.ok) {
                                  alert(`Audit log submitted for ${p.name}!`);
                                  setEntryValues(prev => ({ ...prev, [p._id]: { after: '', notes: '' } }));
                                  fetchPendingLogs();
                                }
                              } catch (err) {
                                alert('Failed to submit audit');
                              }
                            }}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                          >
                            Submit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isUserAuditPage && activeTab === 'approval' && canAccessApproval && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Pending Stock Audit Approvals</h3>
              <p className="text-sm text-gray-500 mb-6">
                Review physical count submissions from campus store operators before actual inventory adjustments are finalized.
              </p>

              {logsLoading ? (
                <div className="py-12 flex justify-center items-center">
                  <RefreshCcw className="animate-spin text-blue-600" size={32} />
                </div>
              ) : pendingGroups.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-2" />
                  <p className="font-semibold text-gray-800">No pending audit approvals</p>
                  <p className="text-xs text-gray-400 mt-1">All stock audit requests have been processed.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {pendingGroups.map((group) => (
                    <div key={group.batchId} className="py-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-bold text-gray-900">
                            Submitted by {group.createdBy} on {new Date(group.createdAt).toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">{group.items.length} item(s) to review</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (window.confirm('Approve this audit adjustment?')) {
                                fetch(apiUrl(`/api/audit-logs/${group.items[0]._id}/approve`), {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ approvedBy: currentUserName })
                                }).then(() => {
                                  fetchPendingLogs();
                                  fetchHistoryLogs();
                                });
                              }
                            }}
                            className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 shadow-sm"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              const r = window.prompt('Reason for rejection:');
                              if (r !== null) {
                                fetch(apiUrl(`/api/audit-logs/${group.items[0]._id}/reject`), {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ approvedBy: currentUserName, notes: r })
                                }).then(() => {
                                  fetchPendingLogs();
                                  fetchHistoryLogs();
                                });
                              }
                            }}
                            className="px-3.5 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg hover:bg-rose-100"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-xs space-y-1">
                        {group.items.map((item) => (
                          <div key={item._id} className="flex justify-between items-center py-1">
                            <span className="font-semibold text-gray-800">{item.product?.name || 'Product'}</span>
                            <span className="font-mono">
                              System: <strong>{item.beforeQuantity}</strong> → Counted: <strong>{item.afterQuantity}</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* USER AUDIT DETAIL MODAL (HRMS LoanDetailDialog Style)    */}
        {/* ======================================================== */}
        {selectedUserAudit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-gray-200 max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between text-white flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <ShieldCheck size={22} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">User Activity Audit Record</h3>
                    <p className="text-xs text-white/80">Detailed log of activity performed at user login session</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUserAudit(null)}
                  className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-5">
                {/* User & Session Banner */}
                {(() => {
                  const staff = getResolvedStaff(selectedUserAudit);
                  return (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-lg flex items-center justify-center shadow-md">
                          {(staff.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-base">{staff.name}</h4>
                          <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                            {staff.id && <span className="font-mono">ID: {staff.id}</span>}
                            <span>• Role: <strong className="text-gray-700">{staff.role}</strong></span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4 text-xs space-y-1">
                        <p className="text-gray-500">
                          Login Time: <strong className="text-gray-800">{formatDateTime(selectedUserAudit.loginTime).full}</strong>
                        </p>
                        <p className="text-gray-500">
                          Activity Time: <strong className="text-gray-800">{formatDateTime(selectedUserAudit.createdAt).full}</strong>
                        </p>
                        {selectedUserAudit.collegeName && (
                          <span className="inline-block mt-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-medium text-[11px]">
                            📍 {selectedUserAudit.collegeName}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Event Summary */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Activity Performed</h5>
                    {renderUserAuditEventBadge(selectedUserAudit.event)}
                  </div>
                  <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-2">
                    <p className="text-sm font-bold text-gray-900">{selectedUserAudit.action}</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{selectedUserAudit.description}</p>
                  </div>
                </div>

                {/* Detailed Payload / Items (if present) */}
                {selectedUserAudit.details && Object.keys(selectedUserAudit.details).length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Payload &amp; Operation Details</h5>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                      {Array.isArray(selectedUserAudit.details.items) && selectedUserAudit.details.items.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead className="border-b border-slate-200 text-slate-500">
                              <tr>
                                <th className="py-1.5">Item</th>
                                <th className="py-1.5 text-center">Qty</th>
                                {selectedUserAudit.details.items[0]?.price !== undefined && (
                                  <>
                                    <th className="py-1.5 text-right">Price</th>
                                    <th className="py-1.5 text-right">Total</th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono">
                              {selectedUserAudit.details.items.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="py-1.5 font-sans font-medium text-slate-800">{item.name || item.productId}</td>
                                  <td className="py-1.5 text-center">{item.quantity || 1}</td>
                                  {item.price !== undefined && (
                                    <>
                                      <td className="py-1.5 text-right">₹{item.price}</td>
                                      <td className="py-1.5 text-right font-bold text-slate-900">₹{item.total || item.quantity * item.price}</td>
                                    </>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {Object.entries(selectedUserAudit.details).map(([k, v]) => {
                            if (typeof v === 'object' && v !== null) return null;
                            return (
                              <div key={k} className="p-2 bg-white rounded-lg border border-slate-200">
                                <span className="text-slate-400 font-semibold block capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                                <span className="text-slate-800 font-medium">{String(v)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {selectedUserAudit.details.totalAmount !== undefined && (
                        <div className="pt-2 border-t border-slate-200 flex justify-between items-center font-bold text-sm text-slate-900">
                          <span>Total Transaction Value:</span>
                          <span className="text-emerald-600 font-mono">₹{selectedUserAudit.details.totalAmount.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Device & Client Info */}
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 text-gray-500 font-mono">
                  <span>IP: {selectedUserAudit.ip || 'Local Network'}</span>
                  <span>Agent: {selectedUserAudit.userAgent ? selectedUserAudit.userAgent.substring(0, 35) + '...' : 'Web Browser'}</span>
                  <span className="text-emerald-600 font-bold">Status: {selectedUserAudit.status || 'Success'}</span>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedUserAudit(null)}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
