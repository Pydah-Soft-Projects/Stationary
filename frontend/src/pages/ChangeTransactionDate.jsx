import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  CalendarClock,
  Search,
  Users,
  Filter,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  ArrowRight,
  Clock,
  GraduationCap,
  Check,
} from 'lucide-react';
import { apiUrl } from '../utils/api';
import { hasFullAccess } from '../utils/permissions';

const pad = (n) => String(n).padStart(2, '0');

const toLocalDateStr = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const combineDatePreservingTime = (origDateVal, targetDateStr) => {
  if (!origDateVal || !targetDateStr) return null;
  const [y, m, d] = targetDateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const orig = new Date(origDateVal);
  if (Number.isNaN(orig.getTime())) return null;
  const combined = new Date(orig);
  combined.setFullYear(y, m - 1, d);
  if (combined.getTime() > Date.now()) {
    combined.setTime(Date.now());
  }
  return combined;
};

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (dateVal) => {
  if (!dateVal) return 'N/A';
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ChangeTransactionDate = ({ currentUser }) => {
  const isSuperAdmin =
    currentUser?.role === 'Administrator' ||
    currentUser?.name === 'superadmin' ||
    currentUser?.name === 'Administrator';
  const canEdit =
    isSuperAdmin || hasFullAccess(currentUser?.permissions || [], 'change-transaction-date');

  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);

  // Date filter state (no auto-load on mount or date change; user clicks Fetch)
  const [currentDate, setCurrentDate] = useState('');
  const [appliedDate, setAppliedDate] = useState('');
  const [hasFetched, setHasFetched] = useState(false);

  // Student & academic filters
  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [collegeFilter, setCollegeFilter] = useState('');
  const [selectedStudents, setSelectedStudents] = useState([]); // Array of { key, name, matchIds, ... }

  // Student multi-select dropdown state
  const [studentDropdownOpen, setStudentDropdownOpen] = useState(false);
  const [studentDropdownSearch, setStudentDropdownSearch] = useState('');
  const studentDropdownRef = useRef(null);

  // Target date picker state (explicit user choice; future dates disabled)
  const [targetDate, setTargetDate] = useState('');

  // Data state
  const [transactions, setTransactions] = useState([]);
  const [totalAvailableCount, setTotalAvailableCount] = useState(null);
  const [hasMoreFromServer, setHasMoreFromServer] = useState(false);
  const [fetchLimit, setFetchLimit] = useState(1000);
  const [colleges, setColleges] = useState([]);
  const [academicCourses, setAcademicCourses] = useState([]);
  const [sqlStudents, setSqlStudents] = useState([]);
  const [loadingSqlStudents, setLoadingSqlStudents] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Selection & pagination state
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Confirmation & update state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [statusBanner, setStatusBanner] = useState(null);

  const activeFetchIdRef = useRef(0);

  // Lock college filter for sub-admins assigned to a specific college
  const assignedCollegeId = useMemo(() => {
    if (isSuperAdmin) return '';
    const assigned = currentUser?.assignedCollege || currentUser?.assignedBranch;
    if (!assigned) return '';
    return typeof assigned === 'object' ? assigned._id : assigned;
  }, [isSuperAdmin, currentUser]);

  useEffect(() => {
    if (assignedCollegeId) {
      setCollegeFilter(assignedCollegeId);
    }
  }, [assignedCollegeId]);

  // Close popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (studentDropdownRef.current && !studentDropdownRef.current.contains(e.target)) {
        setStudentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load reference data: colleges, courses/branches, and SQL students list
  useEffect(() => {
    let isMounted = true;

    const loadReferenceData = async () => {
      try {
        const [collegesRes, coursesRes] = await Promise.all([
          fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=true')),
          fetch(apiUrl('/api/sql/academic/courses')),
        ]);

        if (isMounted && collegesRes.ok) {
          const data = await collegesRes.json();
          setColleges(Array.isArray(data) ? data : []);
        }
        if (isMounted && coursesRes.ok) {
          const data = await coursesRes.json();
          setAcademicCourses(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.warn('Could not load reference metadata:', err);
      }
    };

    const loadSqlStudents = async () => {
      try {
        setLoadingSqlStudents(true);
        const res = await fetch(apiUrl('/api/sql/students?all=true'));
        if (isMounted && res.ok) {
          const data = await res.json();
          setSqlStudents(Array.isArray(data.rows) ? data.rows : []);
        }
      } catch (err) {
        console.warn('Could not load SQL students list:', err);
      } finally {
        if (isMounted) setLoadingSqlStudents(false);
      }
    };

    loadReferenceData();
    loadSqlStudents();

    return () => {
      isMounted = false;
    };
  }, []);

  // Build stable identifier set for server-side student filtering
  const selectedStudentServerIds = useMemo(() => {
    const ids = new Set();
    selectedStudents.forEach((st) => {
      (st.matchIds || []).forEach((id) => {
        if (id) ids.add(String(id).trim());
      });
    });
    return Array.from(ids);
  }, [selectedStudents]);

  const selectedStudentIdsKey = selectedStudentServerIds.join(',');

  const hasAnyFetchCriteria = useMemo(() => {
    const effectiveCollege = assignedCollegeId || collegeFilter;
    return Boolean(
      currentDate ||
        searchTerm.trim() ||
        selectedStudentIdsKey ||
        courseFilter ||
        branchFilter ||
        yearFilter ||
        effectiveCollege
    );
  }, [
    currentDate,
    searchTerm,
    selectedStudentIdsKey,
    courseFilter,
    branchFilter,
    yearFilter,
    assignedCollegeId,
    collegeFilter,
  ]);

  const fetchTransactions = useCallback(
    async ({ dateOverride, limitOverride, clearPreviousBanner = false } = {}) => {
      const targetFetchDate = dateOverride !== undefined ? dateOverride : currentDate;
      const targetLimit = limitOverride !== undefined ? limitOverride : fetchLimit;
      const effectiveCollege = assignedCollegeId || collegeFilter;
      const trimmedSearch = searchTerm.trim();

      const hasCriteria = Boolean(
        targetFetchDate ||
          trimmedSearch ||
          selectedStudentIdsKey ||
          courseFilter ||
          branchFilter ||
          yearFilter ||
          effectiveCollege
      );

      if (!hasCriteria) {
        setStatusBanner({
          type: 'error',
          message: 'Please select a Current Transaction Date (or a Student / Class filter) and click Fetch.',
        });
        return;
      }

      if (clearPreviousBanner) {
        setStatusBanner(null);
      }

      const fetchId = ++activeFetchIdRef.current;
      setLoading(true);
      setFetchError('');

      try {
        const params = new URLSearchParams();
        params.append('transactionType', 'student');
        params.append('format', 'chunked');
        params.append('limit', String(Math.max(targetLimit, 2000)));
        params.append('skip', '0');

        if (effectiveCollege) params.append('collegeId', effectiveCollege);
        if (courseFilter) params.append('course', courseFilter);
        if (branchFilter) params.append('branch', branchFilter);
        if (yearFilter) params.append('year', yearFilter);
        if (selectedStudentIdsKey) params.append('studentIds', selectedStudentIdsKey);

        if (targetFetchDate) {
          const [y, m, d] = targetFetchDate.split('-').map(Number);
          const startLocal = new Date(y, m - 1, d, 0, 0, 0, 0);
          const endLocal = new Date(y, m - 1, d, 23, 59, 59, 999);
          params.append('startDate', startLocal.toISOString());
          params.append('endDate', endLocal.toISOString());
        }

        if (trimmedSearch) {
          params.append('search', trimmedSearch);
        }

        const res = await fetch(apiUrl(`/api/transactions?${params.toString()}`));
        if (!res.ok) {
          throw new Error(`Failed to fetch transactions (${res.status})`);
        }

        if (activeFetchIdRef.current !== fetchId) return;

        const data = await res.json();
        const rawList = Array.isArray(data) ? data : data.transactions || [];
        const studentOnly = rawList.filter(
          (tx) => !tx.transactionType || tx.transactionType === 'student'
        );

        setTransactions(studentOnly);
        setTotalAvailableCount(typeof data.total === 'number' ? data.total : studentOnly.length);
        setHasMoreFromServer(Boolean(data.hasMore));
        setAppliedDate(targetFetchDate || '');
        setHasFetched(true);
        setSelectedIds(new Set());
        setCurrentPage(1);
      } catch (err) {
        if (activeFetchIdRef.current !== fetchId) return;
        console.error('Error fetching student transactions:', err);
        setFetchError(err.message || 'Unable to load student transactions.');
        setTransactions([]);
        setHasFetched(true);
      } finally {
        if (activeFetchIdRef.current === fetchId) {
          setLoading(false);
        }
      }
    },
    [
      assignedCollegeId,
      collegeFilter,
      courseFilter,
      branchFilter,
      yearFilter,
      currentDate,
      selectedStudentIdsKey,
      searchTerm,
      fetchLimit,
    ]
  );

  // Persistent Course / Branch / Year options (from academic master + loaded transactions, never empty!)
  const { courseOptions, branchOptions, yearOptions } = useMemo(() => {
    const courseMap = new Map(); // lower -> label
    const branchMap = new Map();
    const yearSet = new Set([1, 2, 3, 4]);

    academicCourses.forEach((c) => {
      if (c.name) {
        const key = c.name.trim().toLowerCase();
        if (!courseMap.has(key)) courseMap.set(key, c.name.trim());
      }
      if (!courseFilter || (c.name && c.name.trim().toLowerCase() === courseFilter.trim().toLowerCase())) {
        (c.branches || []).forEach((b) => {
          const bName = typeof b === 'object' ? b?.name : b;
          if (bName) {
            const bKey = String(bName).trim().toLowerCase();
            if (!branchMap.has(bKey)) branchMap.set(bKey, String(bName).trim());
          }
        });
        (c.years || []).forEach((y) => yearSet.add(Number(y)));
      }
    });

    transactions.forEach((tx) => {
      const s = tx.student || {};
      if (s.course) {
        const key = s.course.trim().toLowerCase();
        if (!courseMap.has(key)) courseMap.set(key, s.course.trim());
      }
      if (
        s.branch &&
        (!courseFilter || (s.course && s.course.trim().toLowerCase() === courseFilter.trim().toLowerCase()))
      ) {
        const bKey = s.branch.trim().toLowerCase();
        if (!branchMap.has(bKey)) branchMap.set(bKey, s.branch.trim());
      }
      if (s.year) yearSet.add(Number(s.year));
    });

    return {
      courseOptions: Array.from(courseMap.values()).sort((a, b) => a.localeCompare(b)),
      branchOptions: Array.from(branchMap.values()).sort((a, b) => a.localeCompare(b)),
      yearOptions: Array.from(yearSet).filter((y) => !Number.isNaN(y) && y > 0).sort((a, b) => a - b),
    };
  }, [academicCourses, transactions, courseFilter]);

  const getStudentKey = useCallback((tx) => {
    const s = tx.student || {};
    if (s.sqlId) return `sql:${String(s.sqlId).trim()}`;
    if (s.studentId) return `sid:${String(s.studentId).trim()}`;
    if (s.pin) return `pin:${String(s.pin).trim()}`;
    if (s.userId) return `uid:${String(s.userId).trim()}`;
    return `name:${String(s.name || 'unknown').trim().toLowerCase()}`;
  }, []);

  // Combined student directory for the Students dropdown:
  // Prioritizes students present in loaded transactions (with txCount), then appends SQL directory students
  const studentDirectory = useMemo(() => {
    const map = new Map();
    const idToPrimaryKey = new Map();

    // 1. Add students observed in loaded transactions
    transactions.forEach((tx) => {
      const s = tx.student || {};
      const key = getStudentKey(tx);
      const matchIds = [s.sqlId, s.studentId, s.pin, s.userId]
        .filter(Boolean)
        .map((v) => String(v).trim());

      if (!map.has(key)) {
        map.set(key, {
          key,
          name: s.name || 'Unknown Student',
          studentId: s.studentId || s.sqlId || '',
          pin: s.pin || '',
          course: s.course || '',
          branch: s.branch || '',
          year: s.year || '',
          matchIds: Array.from(new Set(matchIds)),
          txCount: 1,
        });
        matchIds.forEach((id) => idToPrimaryKey.set(id, key));
      } else {
        const entry = map.get(key);
        entry.txCount += 1;
        matchIds.forEach((id) => {
          if (!entry.matchIds.includes(id)) entry.matchIds.push(id);
          idToPrimaryKey.set(id, key);
        });
      }
    });

    // 2. Merge SQL students directory so students from any past date are always searchable & selectable
    sqlStudents.forEach((row) => {
      const matchIds = [row.id, row.studentId, row.alternateId, row.pin]
        .filter(Boolean)
        .map((v) => String(v).trim());

      const existingKey =
        (row.id && idToPrimaryKey.get(String(row.id).trim())) ||
        (row.alternateId && idToPrimaryKey.get(String(row.alternateId).trim())) ||
        (row.studentId && idToPrimaryKey.get(String(row.studentId).trim())) ||
        (row.pin && idToPrimaryKey.get(String(row.pin).trim()));

      if (existingKey && map.has(existingKey)) {
        const entry = map.get(existingKey);
        matchIds.forEach((id) => {
          if (!entry.matchIds.includes(id)) entry.matchIds.push(id);
        });
        if (!entry.pin && row.pin) entry.pin = row.pin;
        return;
      }

      const key = row.id ? `sql:${String(row.id).trim()}` : `sid:${String(row.studentId || row.alternateId || row.name)}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: row.name || 'Unknown Student',
          studentId: row.alternateId || row.studentId || String(row.id || ''),
          pin: row.pin || '',
          course: row.course || '',
          branch: row.branch || '',
          year: row.year || '',
          matchIds: Array.from(new Set(matchIds)),
          txCount: 0,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if ((a.txCount > 0) !== (b.txCount > 0)) return a.txCount > 0 ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [transactions, sqlStudents, getStudentKey]);

  const dropdownFilteredStudents = useMemo(() => {
    const q = studentDropdownSearch.trim().toLowerCase();
    const courseLower = courseFilter.trim().toLowerCase();
    const branchLower = branchFilter.trim().toLowerCase();

    return studentDirectory.filter((s) => {
      if (courseLower && s.course && s.course.trim().toLowerCase() !== courseLower) return false;
      if (branchLower && s.branch && s.branch.trim().toLowerCase() !== branchLower) return false;
      if (yearFilter && s.year && String(s.year) !== String(yearFilter)) return false;

      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        s.pin.toLowerCase().includes(q) ||
        s.course.toLowerCase().includes(q) ||
        s.matchIds.some((id) => id.toLowerCase().includes(q))
      );
    });
  }, [studentDirectory, studentDropdownSearch, courseFilter, branchFilter, yearFilter]);

  const visibleDropdownStudents = useMemo(
    () => dropdownFilteredStudents.slice(0, 100),
    [dropdownFilteredStudents]
  );

  // Client-side filtering (instant feedback on fetched results using appliedDate)
  const filteredTransactions = useMemo(() => {
    const allowedIdSet = new Set(selectedStudentServerIds.map((id) => id.toLowerCase()));
    const selectedKeySet = new Set(selectedStudents.map((s) => s.key));
    const q = searchTerm.trim().toLowerCase();
    const courseLower = courseFilter.trim().toLowerCase();
    const branchLower = branchFilter.trim().toLowerCase();

    return transactions.filter((tx) => {
      const s = tx.student || {};

      if (appliedDate) {
        const txLocalDate = toLocalDateStr(tx.transactionDate || tx.createdAt);
        if (txLocalDate !== appliedDate) return false;
      }

      if (courseLower && String(s.course || '').trim().toLowerCase() !== courseLower) return false;
      if (branchLower && String(s.branch || '').trim().toLowerCase() !== branchLower) return false;
      if (yearFilter && String(s.year || '') !== String(yearFilter)) return false;

      if (selectedKeySet.size > 0) {
        const txKey = getStudentKey(tx);
        const txIds = [s.sqlId, s.studentId, s.pin, s.userId]
          .filter(Boolean)
          .map((v) => String(v).trim().toLowerCase());
        const matchesStudent =
          selectedKeySet.has(txKey) || txIds.some((id) => allowedIdSet.has(id));
        if (!matchesStudent) return false;
      }

      if (q) {
        const matches =
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.studentId && String(s.studentId).toLowerCase().includes(q)) ||
          (s.pin && String(s.pin).toLowerCase().includes(q)) ||
          (s.sqlId && String(s.sqlId).toLowerCase().includes(q)) ||
          (tx.transactionId && tx.transactionId.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [
    transactions,
    appliedDate,
    courseFilter,
    branchFilter,
    yearFilter,
    selectedStudents,
    selectedStudentServerIds,
    searchTerm,
    getStudentKey,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredTransactions.length]);

  const effectivePageSize =
    itemsPerPage === 'all' ? Math.max(filteredTransactions.length, 1) : itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / effectivePageSize));
  const paginatedTransactions = useMemo(() => {
    if (itemsPerPage === 'all') return filteredTransactions;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage, itemsPerPage]);

  // Only count selections present in current filtered view
  const selectedTransactions = useMemo(
    () => filteredTransactions.filter((tx) => selectedIds.has(tx._id)),
    [filteredTransactions, selectedIds]
  );

  const selectedTotalAmount = useMemo(
    () => selectedTransactions.reduce((sum, tx) => sum + (Number(tx.totalAmount) || 0), 0),
    [selectedTransactions]
  );

  const selectedUniqueStudentsCount = useMemo(() => {
    const keys = new Set(selectedTransactions.map(getStudentKey));
    return keys.size;
  }, [selectedTransactions, getStudentKey]);

  const allFilteredSelected =
    filteredTransactions.length > 0 &&
    filteredTransactions.every((tx) => selectedIds.has(tx._id));

  const handleToggleAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTransactions.map((tx) => tx._id)));
    }
  };

  const handleToggleRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleStudentOption = (studentObj) => {
    setSelectedStudents((prev) => {
      const exists = prev.some((item) => item.key === studentObj.key);
      if (exists) {
        return prev.filter((item) => item.key !== studentObj.key);
      }
      return [...prev, studentObj];
    });
  };

  const handleTargetDateChange = (val) => {
    if (!val) {
      setTargetDate('');
      return;
    }
    if (val > todayStr) {
      setStatusBanner({
        type: 'error',
        message: 'Future target dates are not allowed. Please select today or a past date.',
      });
      return;
    }
    setStatusBanner((prev) => (prev?.type === 'error' ? null : prev));
    setTargetDate(val);
  };

  const handleResetFilters = () => {
    setCurrentDate('');
    setAppliedDate('');
    setHasFetched(false);
    setTransactions([]);
    setTotalAvailableCount(null);
    setHasMoreFromServer(false);
    setFetchError('');
    setSearchTerm('');
    setCourseFilter('');
    setBranchFilter('');
    setYearFilter('');
    if (!assignedCollegeId) setCollegeFilter('');
    setSelectedStudents([]);
    setSelectedIds(new Set());
    setFetchLimit(1000);
  };

  const handleConfirmBulkUpdate = async () => {
    if (!canEdit || selectedTransactions.length === 0 || !targetDate || targetDate > todayStr) {
      return;
    }

    setUpdating(true);
    setStatusBanner(null);

    try {
      const response = await fetch(apiUrl('/api/transactions/bulk-update-date'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionIds: selectedTransactions.map((tx) => tx._id),
          targetDate,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          updatedBy: {
            _id: currentUser?._id,
            name: currentUser?.name || currentUser?.employeeName || 'Administrator',
            empNo: currentUser?.empNo || currentUser?.employee_no || '',
            role: currentUser?.role || 'Administrator',
          },
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Bulk date update failed.');
      }

      const updatedTargetDate = targetDate;
      setShowConfirmModal(false);
      setSelectedIds(new Set());
      setStatusBanner({
        type: 'success',
        message:
          data.message ||
          `Updated ${selectedTransactions.length} student transaction date(s) to ${formatDisplayDate(updatedTargetDate)}.`,
        targetDate: updatedTargetDate,
      });

      await fetchTransactions({ dateOverride: appliedDate });
    } catch (err) {
      console.error('Bulk update transaction date failed:', err);
      setStatusBanner({
        type: 'error',
        message: err.message || 'Failed to bulk update transaction dates.',
      });
      setShowConfirmModal(false);
    } finally {
      setUpdating(false);
    }
  };

  const collegeMap = useMemo(() => {
    const map = new Map();
    colleges.forEach((c) => map.set(String(c._id), c.name));
    return map;
  }, [colleges]);

  // Check if any selected transaction is currently on an earlier date than targetDate
  const forwardShiftCount = useMemo(() => {
    if (!targetDate) return 0;
    return selectedTransactions.filter((tx) => {
      const curStr = toLocalDateStr(tx.transactionDate || tx.createdAt);
      return curStr && curStr < targetDate;
    }).length;
  }, [selectedTransactions, targetDate]);

  return (
    <div className="min-h-screen bg-background text-text-main p-6">
      <div className="mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <CalendarClock className="text-white" size={26} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Change Transaction Date
              </h1>
              <p className="text-gray-600 mt-0.5 text-sm">
                Bulk-update transaction dates for student transactions while preserving transaction times
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fetchTransactions({ dateOverride: appliedDate })}
              disabled={loading || !hasFetched}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium shadow-xs disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Status / Feedback Banner */}
        {statusBanner && (
          <div
            className={`px-4 py-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              statusBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2.5 text-sm font-medium">
              {statusBanner.type === 'success' ? (
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle size={18} className="text-rose-600 shrink-0" />
              )}
              <span>{statusBanner.message}</span>
            </div>
            <div className="flex items-center gap-2">
              {statusBanner.type === 'success' && statusBanner.targetDate && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentDate(statusBanner.targetDate);
                    fetchTransactions({ dateOverride: statusBanner.targetDate });
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  View Updated Date ({formatDisplayDate(statusBanner.targetDate)})
                </button>
              )}
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="p-1 rounded-lg hover:bg-black/5 transition-colors"
                aria-label="Dismiss message"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Section 1: Side-by-Side Current Transaction Date & Update Date + Bulk Action */}
        <div className="bg-gradient-to-r from-blue-50/70 via-white to-indigo-50/70 rounded-2xl shadow-sm border border-blue-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-blue-100">
            <div className="flex items-center gap-2">
              <CalendarClock size={17} className="text-blue-600" />
              <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                Transaction Date &amp; Bulk Update
              </h2>
            </div>
          </div>

          {/* Side-by-Side Date Fields */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            {/* Left: Current Transaction Date (date to find / change from) + Fetch Button */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-gray-200 p-4">
              <label className="block text-xs font-bold text-gray-800 mb-0.5">
                Current Transaction Date
              </label>
              <p className="text-[11px] text-gray-500 mb-2">
                Select a date and click Fetch to load transactions
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <input
                  type="date"
                  max={todayStr}
                  value={currentDate}
                  onChange={(e) => setCurrentDate(e.target.value)}
                  className="flex-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  title="Pick a specific current date, then click Fetch"
                />

                <button
                  type="button"
                  onClick={() => fetchTransactions({ clearPreviousBanner: true })}
                  disabled={loading || !hasAnyFetchCriteria}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                  title={
                    hasAnyFetchCriteria
                      ? 'Fetch student transactions for the selected date and filters'
                      : 'Select a Current Transaction Date or student/class filter first'
                  }
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Fetching...</span>
                    </>
                  ) : (
                    <>
                      <Search size={16} />
                      <span>Fetch</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Visual Arrow Connector */}
            <div className="hidden lg:flex lg:col-span-1 items-center justify-center">
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center border border-blue-200 shadow-xs">
                <ArrowRight size={18} />
              </div>
            </div>

            {/* Right: Update Date (new date) + Confirm Update Date Action */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-blue-200 p-4">
              <label className="block text-xs font-bold text-gray-800 mb-0.5">
                Update Date
              </label>
              <p className="text-[11px] text-gray-500 mb-2">
                New date for selected transactions (Present or Past)
              </p>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <input
                  type="date"
                  max={todayStr}
                  value={targetDate}
                  onChange={(e) => handleTargetDateChange(e.target.value)}
                  disabled={!canEdit || updating}
                  className="flex-1 w-full px-3 py-2 text-sm font-medium bg-white border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                />

                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={
                    !canEdit ||
                    selectedTransactions.length === 0 ||
                    !targetDate ||
                    targetDate > todayStr ||
                    updating
                  }
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                >
                  {updating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <CalendarClock size={17} />
                      <span>
                        Confirm Update Date{selectedTransactions.length > 0 ? ` (${selectedTransactions.length})` : ''}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Selection Status & Time Preservation Strip */}
          <div className="pt-3 border-t border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-600 text-white shadow-xs">
                {selectedTransactions.length} Selected
              </span>
              <span className="text-sm font-semibold text-gray-800">
                {selectedTransactions.length === 0
                  ? 'Select student transactions below to bulk-update their date'
                  : `${selectedTransactions.length} transaction${selectedTransactions.length > 1 ? 's' : ''} (${selectedUniqueStudentsCount} student${selectedUniqueStudentsCount > 1 ? 's' : ''}) • ₹${selectedTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs flex-wrap">
              {filteredTransactions.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleAllFiltered}
                  className="text-blue-700 hover:text-blue-900 font-semibold underline"
                >
                  {allFilteredSelected
                    ? `Deselect All (${filteredTransactions.length})`
                    : `Select All Filtered (${filteredTransactions.length})`}
                </button>
              )}
              {selectedTransactions.length > 0 && !allFilteredSelected && (
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-gray-600 hover:text-gray-900 font-medium underline"
                >
                  Clear Selection
                </button>
              )}
              <span className="text-gray-500 flex items-center gap-1">
                <Clock size={12} />
                Original transaction times are preserved automatically
              </span>
            </div>
          </div>

          {!canEdit && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
              <AlertCircle size={14} className="shrink-0" />
              <span>You have view-only access to this page. Full access is required to perform bulk date updates.</span>
            </div>
          )}
        </div>

        {/* Section 2: Separated Student & Class/Batch Selection Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-blue-600" />
              <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                Student &amp; Class / Batch Filters
              </h2>
            </div>

            {(searchTerm ||
              selectedStudents.length > 0 ||
              courseFilter ||
              branchFilter ||
              yearFilter ||
              (!assignedCollegeId && collegeFilter)) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedStudents([]);
                  setCourseFilter('');
                  setBranchFilter('');
                  setYearFilter('');
                  if (!assignedCollegeId) setCollegeFilter('');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
              >
                <X size={13} />
                Clear Student &amp; Batch Filters
              </button>
            )}
          </div>

          {/* Student Search & Specific Students Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-7">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Search Student / Admission No / PIN / TXN
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Name, admission no, PIN, or TXN ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="md:col-span-5 relative" ref={studentDropdownRef}>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Select Students ({studentDirectory.length.toLocaleString()})
              </label>
              <button
                type="button"
                onClick={() => setStudentDropdownOpen((prev) => !prev)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white hover:bg-gray-50 flex items-center justify-between gap-2 text-left transition-colors"
              >
                <span className="flex items-center gap-2 truncate">
                  <Users size={15} className="text-blue-600 shrink-0" />
                  <span className="truncate font-medium text-gray-700">
                    {selectedStudents.length === 0
                      ? 'All Students'
                      : `${selectedStudents.length} Student${selectedStudents.length > 1 ? 's' : ''} Selected`}
                  </span>
                </span>
                <ChevronDown
                  size={15}
                  className={`text-gray-400 transition-transform shrink-0 ${
                    studentDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {studentDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden min-w-[280px]">
                  <div className="p-2 border-b border-gray-100 bg-gray-50 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                      <input
                        type="text"
                        placeholder="Search by student name, ID, PIN..."
                        value={studentDropdownSearch}
                        onChange={(e) => setStudentDropdownSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500">
                        {loadingSqlStudents
                          ? 'Loading full directory...'
                          : `${dropdownFilteredStudents.length.toLocaleString()} student(s)`}
                      </span>
                      {selectedStudents.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedStudents([])}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Clear Selected ({selectedStudents.length})
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                    {visibleDropdownStudents.length === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-500">
                        {loadingSqlStudents ? 'Loading students...' : 'No matching students'}
                      </div>
                    ) : (
                      <>
                        {visibleDropdownStudents.map((s) => {
                          const checked = selectedStudents.some((item) => item.key === s.key);
                          return (
                            <button
                              key={s.key}
                              type="button"
                              onClick={() => handleToggleStudentOption(s)}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-xs hover:bg-blue-50/70 transition-colors ${
                                checked ? 'bg-blue-50/60' : ''
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                    checked
                                      ? 'bg-blue-600 border-blue-600 text-white'
                                      : 'border-gray-300 bg-white'
                                  }`}
                                >
                                  {checked && <Check size={11} strokeWidth={3} />}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-semibold text-gray-800 truncate">{s.name}</p>
                                  <p className="text-[11px] text-gray-500 truncate">
                                    {s.studentId || s.pin}
                                    {s.course ? ` • ${s.course}` : ''}
                                  </p>
                                </div>
                              </div>
                              {s.txCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold shrink-0">
                                  {s.txCount} txn
                                </span>
                              )}
                            </button>
                          );
                        })}
                        {dropdownFilteredStudents.length > visibleDropdownStudents.length && (
                          <div className="px-3 py-2 text-center text-[11px] text-gray-500 bg-gray-50">
                            Showing top {visibleDropdownStudents.length} of{' '}
                            {dropdownFilteredStudents.length.toLocaleString()} students — type to narrow
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Class / Batch & Academic Filters Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Course</label>
              <select
                value={courseFilter}
                onChange={(e) => {
                  setCourseFilter(e.target.value);
                  setBranchFilter('');
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Courses</option>
                {courseOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Branch</label>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Branches</option>
                {branchOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Year / Batch</label>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Years</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">College</label>
              <select
                value={assignedCollegeId || collegeFilter}
                onChange={(e) => setCollegeFilter(e.target.value)}
                disabled={Boolean(assignedCollegeId)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">All Colleges</option>
                {colleges.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedStudents.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-100">
              <span className="text-[11px] font-semibold text-gray-500 mr-1">
                Filtered Students:
              </span>
              {selectedStudents.map((st) => {
                const label = `${st.name}${st.studentId ? ` (${st.studentId})` : ''}`;
                return (
                  <span
                    key={st.key}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
                  >
                    <span>{label}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleStudentOption(st)}
                      className="hover:text-blue-900 rounded-full p-0.5"
                      aria-label={`Remove ${label}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedStudents([])}
                className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 underline ml-1"
              >
                Clear All
              </button>
            </div>
          )}
        </div>

        {/* Transactions Table Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/70">
            <div className="text-sm font-semibold text-gray-800 flex flex-wrap items-center gap-2">
              <span>
                Student Transactions{' '}
                {hasFetched && (
                  <span className="text-gray-500 font-normal">
                    ({filteredTransactions.length.toLocaleString()} shown
                    {hasMoreFromServer && totalAvailableCount !== null
                      ? ` of ${totalAvailableCount.toLocaleString()} total`
                      : ''})
                  </span>
                )}
              </span>
              {hasFetched && hasMoreFromServer && !loading && (
                <button
                  type="button"
                  onClick={() => {
                    const nextLimit = fetchLimit + 2000;
                    setFetchLimit(nextLimit);
                    fetchTransactions({ dateOverride: appliedDate, limitOverride: nextLimit });
                  }}
                  className="px-2.5 py-0.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                >
                  Load More Older Records
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span>Show:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  const v = e.target.value;
                  setItemsPerPage(v === 'all' ? 'all' : Number(v));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 border border-gray-200 rounded-lg bg-white font-medium"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-gray-500 gap-3">
              <Loader2 size={28} className="animate-spin text-blue-600" />
              <p className="text-sm font-medium">Fetching student transactions...</p>
            </div>
          ) : !hasFetched ? (
            <div className="p-12 text-center space-y-2.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Search size={22} />
              </div>
              <h3 className="text-base font-semibold text-gray-800">
                Select a Date &amp; Click Fetch
              </h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Choose a <strong>Current Transaction Date</strong> above (or apply student/class filters below) and click <strong>Fetch</strong> to load transactions.
              </p>
            </div>
          ) : fetchError ? (
            <div className="p-10 text-center space-y-3">
              <AlertCircle size={32} className="mx-auto text-rose-500" />
              <p className="text-sm font-medium text-rose-700">{fetchError}</p>
              <button
                type="button"
                onClick={() => fetchTransactions({ dateOverride: appliedDate })}
                className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                <GraduationCap size={24} />
              </div>
              <h3 className="text-base font-semibold text-gray-800">No Student Transactions Found</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                {appliedDate
                  ? `No student transactions matched on ${formatDisplayDate(appliedDate)} with the active filters.`
                  : 'Try adjusting your current date or student filters.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {appliedDate && searchTerm.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentDate('');
                      fetchTransactions({ dateOverride: '' });
                    }}
                    className="px-3.5 py-2 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-100"
                  >
                    Search &quot;{searchTerm.trim()}&quot; Across All Dates
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-3.5 py-2 text-xs font-semibold bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                      <th className="px-4 py-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={handleToggleAllFiltered}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          title={allFilteredSelected ? 'Deselect all filtered' : 'Select all filtered'}
                        />
                      </th>
                      <th className="px-4 py-3">Transaction ID</th>
                      <th className="px-4 py-3">Student Details</th>
                      <th className="px-4 py-3">Academic Info</th>
                      <th className="px-4 py-3">Items & Amount</th>
                      <th className="px-4 py-3">Current Date & Time</th>
                      <th className="px-4 py-3">Target Date Preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {paginatedTransactions.map((tx) => {
                      const isChecked = selectedIds.has(tx._id);
                      const s = tx.student || {};
                      const origDate = tx.transactionDate || tx.createdAt;
                      const previewDate =
                        isChecked && targetDate
                          ? combineDatePreservingTime(origDate, targetDate)
                          : null;
                      const colName =
                        collegeMap.get(String(tx.collegeId || tx.branchId || '')) || '';

                      return (
                        <tr
                          key={tx._id}
                          onClick={() => handleToggleRow(tx._id)}
                          className={`transition-colors cursor-pointer ${
                            isChecked ? 'bg-blue-50/70 hover:bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td
                            className="px-4 py-3 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleRow(tx._id)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>

                          <td className="px-4 py-3 align-top">
                            <div className="font-mono text-xs font-bold text-gray-800">
                              {tx.transactionId}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  tx.isPaid
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {tx.isPaid ? 'Paid' : 'Unpaid'}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700 capitalize">
                                {tx.paymentMethod || 'cash'}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3 align-top">
                            <div className="font-semibold text-gray-900">
                              {s.name || 'Unknown Student'}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5 space-x-2">
                              {s.studentId && <span>ID: {s.studentId}</span>}
                              {s.pin && <span>• PIN: {s.pin}</span>}
                            </div>
                          </td>

                          <td className="px-4 py-3 align-top">
                            <div className="text-xs font-semibold text-gray-800">
                              {s.course || '—'}
                              {s.branch ? ` • ${s.branch}` : ''}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              {s.year ? `Year ${s.year}` : ''}
                              {s.semester ? ` • Sem ${s.semester}` : ''}
                              {colName ? ` • ${colName}` : ''}
                            </div>
                          </td>

                          <td className="px-4 py-3 align-top">
                            <div className="font-bold text-gray-900">
                              ₹{Number(tx.totalAmount || 0).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[200px]">
                              {(tx.items || [])
                                .map((it) => `${it.name} (×${it.quantity})`)
                                .join(', ') || 'No items'}
                            </div>
                          </td>

                          <td className="px-4 py-3 align-top whitespace-nowrap">
                            <div className="text-xs font-semibold text-gray-800">
                              {formatDateTime(origDate)}
                            </div>
                          </td>

                          <td className="px-4 py-3 align-top whitespace-nowrap">
                            {previewDate ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
                                <ArrowRight size={12} className="text-emerald-600 shrink-0" />
                                {formatDateTime(previewDate)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">
                                {isChecked ? 'Pick target date above' : 'Select row to preview'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              {itemsPerPage !== 'all' && totalPages > 1 && (
                <div className="px-5 py-3.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50 text-xs text-gray-600">
                  <div>
                    Showing{' '}
                    <strong>
                      {(currentPage - 1) * itemsPerPage + 1}–
                      {Math.min(currentPage * itemsPerPage, filteredTransactions.length)}
                    </strong>{' '}
                    of <strong>{filteredTransactions.length}</strong> transactions
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1 font-medium"
                    >
                      <ChevronLeft size={14} />
                      Prev
                    </button>
                    <span className="px-3 font-semibold text-gray-800">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1 font-medium"
                    >
                      Next
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirmation Popup Window */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => !updating && setShowConfirmModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-blue-100 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
                  <CalendarClock size={19} />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base">
                    Confirm Selected Transactions ({selectedTransactions.length})
                  </h3>
                  <p className="text-[11px] text-blue-200">
                    Review the selected student transactions below before updating their date
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !updating && setShowConfirmModal(false)}
                disabled={updating}
                className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10"
                aria-label="Close confirmation popup"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3">
                  <span className="block text-[11px] text-gray-500 font-medium">
                    Transactions
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {selectedTransactions.length} selected
                  </span>
                </div>
                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3">
                  <span className="block text-[11px] text-gray-500 font-medium">
                    Students Affected
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {selectedUniqueStudentsCount}
                  </span>
                </div>
                <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3">
                  <span className="block text-[11px] text-emerald-700 font-medium">
                    Update Date
                  </span>
                  <span className="text-sm font-bold text-emerald-800">
                    {formatDisplayDate(targetDate)}
                  </span>
                </div>
                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3">
                  <span className="block text-[11px] text-gray-500 font-medium">
                    Total Amount
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    ₹
                    {selectedTotalAmount.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {forwardShiftCount > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0 text-amber-600" />
                  <span>
                    Note: {forwardShiftCount} selected transaction(s) will move to a later date ({formatDisplayDate(targetDate)}) than their current date.
                  </span>
                </div>
              )}

              {/* Full Table of Selected Transactions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">
                    Selected Transactions to Update ({selectedTransactions.length}):
                  </p>
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <Clock size={11} />
                    Original time preserved for each transaction
                  </span>
                </div>
                <div className="max-h-72 overflow-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-500 font-bold sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 w-8 text-center">#</th>
                        <th className="px-3 py-2">Transaction ID</th>
                        <th className="px-3 py-2">Student</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Current Date &amp; Time</th>
                        <th className="px-3 py-2">Update Date &amp; Time</th>
                        <th className="px-2 py-2 w-8 text-center">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedTransactions.map((tx, idx) => {
                        const orig = tx.transactionDate || tx.createdAt;
                        const updatedPreview = combineDatePreservingTime(orig, targetDate);
                        const s = tx.student || {};
                        return (
                          <tr key={tx._id} className="hover:bg-gray-50/80">
                            <td className="px-3 py-2 text-center text-gray-400 font-medium">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] font-semibold text-gray-800 whitespace-nowrap">
                              {tx.transactionId}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-semibold text-gray-900">
                                {s.name || 'Student'}
                              </div>
                              <div className="text-[11px] text-gray-500">
                                {s.studentId || s.pin || '—'}
                                {s.course ? ` • ${s.course}` : ''}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">
                              ₹{Number(tx.totalAmount || 0).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-3 py-2 text-gray-500 line-through whitespace-nowrap">
                              {formatDateTime(orig)}
                            </td>
                            <td className="px-3 py-2 font-semibold text-emerald-700 whitespace-nowrap">
                              {formatDateTime(updatedPreview)}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                disabled={updating}
                                onClick={() => {
                                  handleToggleRow(tx._id);
                                  if (selectedTransactions.length <= 1) {
                                    setShowConfirmModal(false);
                                  }
                                }}
                                className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors disabled:opacity-40"
                                title="Remove this transaction from update"
                              >
                                <X size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={updating}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkUpdate}
                disabled={updating || selectedTransactions.length === 0}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {updating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Confirm Update Date ({selectedTransactions.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChangeTransactionDate;
