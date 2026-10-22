import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Menu, LogOut, ExternalLink, X, AlertCircle } from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-white rounded-2xl border border-gray-200 shadow-sm m-4">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-4">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Unable to load page content</h2>
          <p className="text-gray-600 max-w-md mb-4 text-sm">
            An unexpected error occurred while loading this view. You can reload or return to the main dashboard.
          </p>
          <pre className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs font-mono max-w-lg overflow-x-auto mb-6 text-left">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm shadow-md hover:bg-blue-700 transition"
            >
              Reload Page
            </button>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition"
            >
              Go to Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
const Sidebar = lazy(() => import('./Sidebar'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const StudentDetail = lazy(() => import('./pages/StudentDetail'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
// const AddStudent = lazy(() => import('./pages/AddStudent')); // REMOVED
// const StudentManagement = lazy(() => import('./pages/StudentManagement')); // REMOVED
const Login = lazy(() => import('./pages/Login'));
const SubAdminManagement = lazy(() => import('./pages/SubAdminManagement'));
const ManageStock = lazy(() => import('./pages/ManageStock'));
const HomePage = lazy(() => import('./pages/HomePage'));
const CourseManagement = lazy(() => import('./pages/CourseManagement'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const StudentDue = lazy(() => import('./pages/StudentDue.jsx'));
const AuditLogs = lazy(() => import('./pages/AuditLogs.jsx'));
const StockTransfers = lazy(() => import('./pages/StockTransfers.jsx'));
const GeneralStock = lazy(() => import('./pages/GeneralStock.jsx'));
const EmployeeDashboard = lazy(() => import('./pages/EmployeeDashboard.jsx'));
const EmployeeDetail = lazy(() => import('./pages/EmployeeDetail.jsx'));
const ProfitReport = lazy(() => import('./pages/ProfitReport.jsx'));
import ProtectedRoute from './components/ProtectedRoute';
import { apiUrl } from './utils/api';
import useOnlineStatus from './hooks/useOnlineStatus';
import { loadJSON, saveJSON } from './utils/storage';

import { hasViewAccess } from './utils/permissions';

const resolveDefaultPath = (user) => {
  if (!user) return '/login';
  if (user.role === 'Administrator') return '/';

  const permissions = user.permissions || [];
  const priorityPaths = [
    { key: 'dashboard', path: '/' },
    // { key: 'add-student', path: '/add-student' }, // REMOVED
    // { key: 'student-management', path: '/student-management' }, // REMOVED
    { key: 'course-dashboard', path: '/students-dashboard' },
    { key: 'employee-dashboard', path: '/employees-dashboard' },
    { key: 'courses', path: '/courses' },
    { key: 'manage-stock', path: '/manage-stock' },
    { key: 'reports-daily', path: '/transactions' },
    { key: 'reports-monthly', path: '/transactions' },
    { key: 'reports-stock', path: '/transactions' },
    { key: 'transactions', path: '/transactions' },
    { key: 'profit-report', path: '/profit-report' },
    { key: 'settings', path: '/settings' },
  ];

  for (const item of priorityPaths) {
    if (hasViewAccess(permissions, item.key)) {
      return item.path;
    }
  }

  return '/';
};

const DefaultRoute = ({ currentUser }) => {
  const targetPath = resolveDefaultPath(currentUser);

  if (targetPath !== '/') {
    return <Navigate to={targetPath} replace />;
  }

  return <Dashboard />;
};

function App() {
  // const [students, setStudents] = useState(() => loadJSON('studentsCache', [])); // REMOVED legacy cache
  const [itemCategories, setItemCategories] = useState(() => loadJSON('itemCategoriesCache', []));
  const [products, setProducts] = useState(() => loadJSON('productsCache', []));
  const [currentCourse, setCurrentCourse] = useState('');
  // Initialize isAuthenticated from localStorage
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) return true;
    return !!localStorage.getItem('isAuthenticated');
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState(() => loadJSON('pendingTransactions', []));
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const processingQueueRef = useRef(false);

  // Check for mobile view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
      setSidebarOpen(window.innerWidth > 768); // Open on desktop, closed on mobile
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // REMOVED legacy fetchStudentsData
  /*
  const fetchStudentsData = useCallback(async () => {
    if (!isAuthenticated) return;
    // Persist authentication state locally for reloads
    localStorage.setItem('isAuthenticated', 'true');

    try {
      const studentsRes = await fetch(apiUrl('/api/users'));
      if (studentsRes.ok) {
        const studentsData = await studentsRes.json();
        const formattedStudents = studentsData.map(s => ({ ...s, id: s._id }));
        setStudents(formattedStudents);
        saveJSON('studentsCache', formattedStudents);
      }
    } catch (error) {
      console.warn('Could not fetch students yet:', error);
    }
  }, [isAuthenticated]);
  */

  const fetchProductsData = useCallback(async () => {
    try {
      // Determine college ID based on current user
      let collegeId = null;
      if (currentUser?.assignedCollege) {
        collegeId = typeof currentUser.assignedCollege === 'object'
          ? currentUser.assignedCollege._id
          : currentUser.assignedCollege;
      } else if (currentUser?.assignedBranch) {
        collegeId = typeof currentUser.assignedBranch === 'object'
          ? currentUser.assignedBranch._id
          : currentUser.assignedBranch;
      }

      const productsRes = await fetch(apiUrl('/api/products'));
      if (!productsRes.ok) throw new Error(`Server responded with ${productsRes.status}`);
      const globalProducts = await productsRes.json();

      if (collegeId) {
        // Fetch college-specific stock
        const stockRes = await fetch(apiUrl(`/api/stock-transfers/colleges/${collegeId}/stock`));
        if (stockRes.ok) {
          const stockData = await stockRes.json();
          const collegeStockMap = {};
          (stockData.stock || []).forEach(item => {
            if (item.product) {
              const pId = typeof item.product === 'object' ? item.product._id : item.product;
              collegeStockMap[pId] = item.quantity;
            }
          });

          const productsWithCollegeStock = (globalProducts || []).map(product => ({
            ...product,
            stock: collegeStockMap[product._id] !== undefined ? collegeStockMap[product._id] : 0
          }));
          setProducts(productsWithCollegeStock);
          saveJSON('productsCache', productsWithCollegeStock);
        } else {
          setProducts(globalProducts || []);
          saveJSON('productsCache', globalProducts || []);
        }
      } else {
        setProducts(globalProducts || []);
        saveJSON('productsCache', globalProducts || []);
      }
    } catch (err) {
      console.warn('Could not fetch products on app load:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    if (isAuthenticated && isOnline) {
      // fetchStudentsData(); // REMOVED
      localStorage.setItem('isAuthenticated', 'true'); // Keep auth persistence
    } else if (!isAuthenticated) {
      // Clear authentication state
      localStorage.removeItem('isAuthenticated');
      setCurrentUser(null);
    }
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (isOnline) {
      fetchProductsData();
    }
  }, [isOnline, fetchProductsData]);

  useEffect(() => {
    if (!Array.isArray(products)) return;
    const cats = Array.from(new Set((products || []).map(p => p.name?.toLowerCase().replace(/\s+/g, '_')).filter(Boolean)));
    setItemCategories(cats);
    saveJSON('itemCategoriesCache', cats);
  }, [products]);

  /*
  useEffect(() => {
    if (Array.isArray(students)) {
      saveJSON('studentsCache', students);
    }
  }, [students]);
  */

  useEffect(() => {
    saveJSON('productsCache', products);
  }, [products]);

  useEffect(() => {
    saveJSON('pendingTransactions', pendingTransactions);
  }, [pendingTransactions]);

  useEffect(() => {
    if (!isAuthenticated) {
      const token = localStorage.getItem('authToken');
      const savedUser = localStorage.getItem('currentUser');
      if (token && savedUser) {
        setCurrentUser(JSON.parse(savedUser));
        setIsAuthenticated(true);
      }
    } else {
      localStorage.setItem('isAuthenticated', 'true');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isOnline || pendingTransactions.length === 0 || processingQueueRef.current) {
      return;
    }

    let isCancelled = false;
    const processQueue = async () => {
      processingQueueRef.current = true;
      const remaining = [];
      let processedAny = false;

      for (const item of pendingTransactions) {
        if (isCancelled) break;
        try {
          const response = await fetch(apiUrl('/api/transactions'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
          });

          if (!response.ok) {
            throw new Error(`Failed to sync queued transaction (${response.status})`);
          }

          processedAny = true;
        } catch (error) {
          console.warn('Failed to process queued transaction:', error);
          remaining.push(item);
        }
      }

      if (!isCancelled) {
        setPendingTransactions(remaining);
        if (processedAny) {
          // await fetchStudentsData(); // REMOVED
          await fetchProductsData();
        }
      }
      processingQueueRef.current = false;
    };

    processQueue();

    return () => {
      isCancelled = true;
    };
  }, [isOnline, pendingTransactions, fetchProductsData]);

  const queueOfflineTransaction = useCallback((queuedTransaction, optimisticStudent) => {
    setPendingTransactions(prev => [...prev, queuedTransaction]);
    /*
    if (optimisticStudent) {
      setStudents(prev => {
        const exists = prev.some(s => String(s.id) === String(optimisticStudent.id));
        const updated = exists
          ? prev.map(s => (String(s.id) === String(optimisticStudent.id) ? optimisticStudent : s))
          : [...prev, optimisticStudent];
        saveJSON('studentsCache', updated);
        return updated;
      });
    }
    */
  }, []);

  // Listen to item category edit/delete events dispatched from ProductList
  useEffect(() => {
    const onRemove = (e) => {
      const name = e.detail;
      setItemCategories((prev) => prev.filter((i) => i !== name));
      // Removed local student item cleanup - handled by backend/dynamic calculation now
    };

    const onEdit = (e) => {
      const { oldVal, newVal } = e.detail;
      const normalizedNew = newVal.toLowerCase().replace(/\s+/g, '_');
      setItemCategories((prev) => prev.map(i => i === oldVal ? normalizedNew : i));
      // Removed local student item cleanup - handled by backend/dynamic calculation now
    };

    window.addEventListener('removeItemCategory', onRemove);
    window.addEventListener('editItemCategory', onEdit);
    return () => {
      window.removeEventListener('removeItemCategory', onRemove);
      window.removeEventListener('editItemCategory', onEdit);
    };
  }, []);

  // REMOVED addStudent function

  const addItemCategory = (newItem) => {
    // This method now only updates client-side categories; server Products are source of truth
    if (itemCategories.includes(newItem) || newItem.trim() === '') return;
    const newItemCategory = newItem.toLowerCase().replace(/\s+/g, '_');
    setItemCategories((prev) => [...prev, newItemCategory]);
  };

  const handleLogin = async (id, password) => {
    try {
      const res = await fetch(apiUrl('/api/subadmins/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: id, password }),
      });

      if (!res.ok) {
        return false;
      }

      const data = await res.json();
      const token = data.token || `local-${data._id}`;
      const userData = {
        name: data.name,
        employeeName: data.employeeName || data.employee_name || null,
        employee_name: data.employee_name || data.employeeName || null,
        empNo: data.empNo || data.emp_no || null,
        emp_no: data.emp_no || data.empNo || null,
        role: data.role || 'Editor',
        id: data._id,
        permissions: data.permissions || [],
        assignedCollege: data.assignedCollege || data.assignedBranch || null,
        assignedBranch: data.assignedCollege || data.assignedBranch || null, // Keep for backward compatibility
      };

      setCurrentUser(userData);
      localStorage.setItem('isSSO', 'false');
      localStorage.setItem('currentUser', JSON.stringify(userData));
      localStorage.setItem('authToken', token);
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      setIsAuthenticated(true);
      navigate('/');
      return true;
    } catch (err) {
      console.error('Login failed:', err);
      return false;
    }
  };

  const handleSSOLogin = (token, user) => {
    const userData = {
      name: user.name || user.username,
      employeeName: user.employeeName || user.name || null,
      employee_name: user.employee_name || user.name || null,
      empNo: user.empNo || user.employeeId || null,
      emp_no: user.empNo || user.employeeId || null,
      role: user.role || 'Editor',
      id: user.id || user._id,
      permissions: user.permissions || [],
      assignedCollege: user.assignedCollege || user.assignedBranch || null,
      assignedBranch: user.assignedCollege || user.assignedBranch || null,
    };

    setCurrentUser(userData);
    localStorage.setItem('isSSO', 'true');
    localStorage.setItem('currentUser', JSON.stringify(userData));
    localStorage.setItem('authToken', token);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setIsAuthenticated(true);
    navigate('/', { replace: true });
  };

  const CRM_PORTAL_URL = 'https://crm.pydah.edu.in';
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
  };

  const executeLogout = async () => {
    setIsLoggingOut(true);
    const isSSO = localStorage.getItem('isSSO') === 'true';

    // 1. Notify backend
    try {
      await fetch(apiUrl('/api/auth/logout'), { method: 'POST' });
    } catch (err) {
      console.warn("Logout notification failed", err);
    }

    // 2. Remove switcher
    const script = document.getElementById('pydah-portal-switcher-script');
    if (script) script.remove();
    if (window.PydahSwitcher?.destroy) {
      try { window.PydahSwitcher.destroy(); } catch (_) {}
    }
    document.querySelectorAll('#pydah-portal-switcher, .pydah-portal-switcher, [id*="pydah-switcher"], [class*="pydah-switcher"]').forEach(el => el.remove());

    // 3. Clear local session data
    localStorage.removeItem('isSSO');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('authToken');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.clear();

    setIsAuthenticated(false);
    setCurrentUser(null);
    setShowLogoutModal(false);
    setIsLoggingOut(false);

    // 4. Redirect accordingly
    if (isSSO) {
      window.location.href = CRM_PORTAL_URL;
    } else {
      navigate('/login', { replace: true });
    }
  };

  // Close logout modal on ESC
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showLogoutModal && !isLoggingOut) {
        setShowLogoutModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLogoutModal, isLoggingOut]);

  // Conditionally load and display Pydah Universal Portal Switcher ONLY for SSO users
  useEffect(() => {
    const isSSO = localStorage.getItem('isSSO') === 'true';
    const activeToken = localStorage.getItem('authToken') || localStorage.getItem('token');

    if (isAuthenticated && isSSO && currentUser && activeToken) {
      let script = document.getElementById('pydah-portal-switcher-script');
      if (!script) {
        script = document.createElement('script');
        script.id = 'pydah-portal-switcher-script';
        script.src = 'https://crm.pydah.edu.in/portal-switcher.js';
        script.async = true;
        script.setAttribute('data-current-portal', 'stationary-management');
        script.onload = () => {
          if (window.PydahSwitcher) {
            window.PydahSwitcher.init({
              currentPortal: 'stationary-management',
              token: activeToken,
              user: {
                id: currentUser.id || currentUser._id,
                username: currentUser.name || currentUser.username,
                employeeId: currentUser.empNo || currentUser.emp_no,
                role: currentUser.role
              },
              position: 'bottom-right'
            });
          }
        };
        document.body.appendChild(script);
      } else if (window.PydahSwitcher) {
        window.PydahSwitcher.init({
          currentPortal: 'stationary-management',
          token: activeToken,
          user: {
            id: currentUser.id || currentUser._id,
            username: currentUser.name || currentUser.username,
            employeeId: currentUser.empNo || currentUser.emp_no,
            role: currentUser.role
          },
          position: 'bottom-right'
        });
      }
    } else {
      // Clean up switcher script and any switcher elements when not an SSO session
      const script = document.getElementById('pydah-portal-switcher-script');
      if (script) {
        script.remove();
      }
      if (window.PydahSwitcher?.destroy) {
        try { window.PydahSwitcher.destroy(); } catch (_) {}
      }
      // Remove any DOM elements inserted by the portal switcher
      document.querySelectorAll('#pydah-portal-switcher, .pydah-portal-switcher, [id*="pydah-switcher"], [class*="pydah-switcher"]').forEach(el => el.remove());
    }
  }, [currentUser, isAuthenticated]);

  // If user arrives with ?token= or ?ssoToken= on any route, forward to /login to process SSO
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('token') || searchParams.get('ssoToken');
    if (token && window.location.pathname !== '/login') {
      navigate(`/login${window.location.search}`, { replace: true });
    }
  }, [navigate]);

  // Loading animation component
  const LoadingScreen = () => (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="text-center">
        {/* Animated Logo/Icon */}
        <div className="relative mb-8">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30 animate-pulse">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          {/* Rotating ring */}
          <div className="absolute inset-0 w-20 h-20 mx-auto border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>

        {/* Loading text with animation */}
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-gray-800 animate-pulse">Loading Application</h3>
          <div className="flex items-center justify-center gap-1">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Suspense fallback={<LoadingScreen />}>
      <div className={`min-h-screen bg-gray-50 ${!isOnline ? 'pt-16' : ''}`}>
        {!isOnline && (
          <div className="fixed top-2 left-0 right-0 z-[60] flex justify-center px-4 pointer-events-none">
            <div className="bg-red-500 text-white  text-sm font-medium py-2.5 px-4 rounded-full shadow-lg pointer-events-auto flex items-center gap-2 max-w-4xl w-full justify-center">
              <span className="text-base leading-none">📡</span>
              <span className="text-center">
                You’re offline. Showing cached data edits will sync as soon as you reconnect.
              </span>
            </div>
          </div>
        )}
        {isAuthenticated ? (
          <>
            <Sidebar
              onLogout={handleLogoutClick}
              isMobile={isMobile}
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              currentUser={currentUser}
            />
            <main className={`
            flex-1 min-h-screen bg-gray-50 flex justify-center items-start transition-all duration-300
            ${isMobile ? 'ml-0' : (sidebarOpen ? 'ml-52' : 'ml-20')}
            ${isMobile ? 'pt-20 px-4' : 'px-8'}
          `}>
              {isMobile && (
                <button
                  className="fixed top-4 left-4 z-50 w-12 h-12 rounded-xl bg-primary-500 border-none text-white flex items-center justify-center cursor-pointer shadow-strong transition-all duration-200 hover:bg-primary-600 hover:scale-105"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                  <Menu size={24} />
                </button>
              )}
              <div className="w-full  mx-auto">
                <ErrorBoundary>
                <Routes>
                  {/* Dashboard is the default route for authenticated users */}
                  <Route
                    path="/"
                    element={<DefaultRoute currentUser={currentUser} />}
                  />
                  <Route
                    path="/students-dashboard"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={["student-dashboard", "course-dashboard"]}>
                        <StudentDashboard
                          // initialStudents={students} // REMOVED
                          isOnline={isOnline}
                          currentUser={currentUser}
                        />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/student/:id"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={["student-management", "student-dashboard", "course-dashboard"]}>
                        <StudentDetail
                          // students={students} // REMOVED
                          // setStudents={setStudents} // REMOVED
                          products={products}
                          setProducts={setProducts}
                          onQueueTransaction={queueOfflineTransaction}
                          isOnline={isOnline}
                          pendingTransactions={pendingTransactions}
                          currentUser={currentUser}
                        />
                      </ProtectedRoute>
                    }
                  />
                  {/* REMOVED AddStudent Route */}
                  {/*
                  <Route
                    path="/add-student"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="add-student">
                        <AddStudent addStudent={addStudent} currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  */}
                  {/* REMOVED StudentManagement Route */}
                  {/*
                  <Route
                    path="/student-management"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="student-management">
                        <StudentManagement
                          // students={students} // REMOVED
                          // setStudents={setStudents} // REMOVED
                          // addStudent={addStudent} // REMOVED
                          // refreshStudents={fetchStudentsData} // REMOVED
                          currentUser={currentUser}
                        />
                      </ProtectedRoute>
                    }
                  />
                  */}
                  <Route
                    path="/sub-admin-management"
                    element={
                      <ProtectedRoute currentUser={currentUser} superAdminOnly={true}>
                        <SubAdminManagement currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manage-stock"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={['stock-products', 'stock-add', 'stock-entries', 'stock-vendors', 'manage-stock']}>
                        <ManageStock itemCategories={itemCategories} addItemCategory={addItemCategory} setItemCategories={setItemCategories} currentCourse={currentCourse} products={products} setProducts={setProducts} currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/courses"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="courses">
                        <CourseManagement currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/transactions"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={['reports-daily', 'reports-monthly', 'reports-stock', 'transactions']}>
                        <Reports currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/student-due"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={['student-due', 'reports-daily', 'reports-monthly', 'reports-stock', 'transactions']}>
                        <StudentDue currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/audit-logs"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={['audit-log-entry', 'audit-log-approval', 'audit-logs']}>
                        <AuditLogs currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="settings">
                        <Settings currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/stock-transfers"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="stock-transfers">
                        <StockTransfers currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/general-purchase"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="general-purchase">
                        <GeneralStock currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profit-report"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={['profit-report', 'transactions']}>
                        <ProfitReport currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/employees-dashboard"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={["employee-dashboard"]}>
                        <EmployeeDashboard currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/employees/:id"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={["employee-dashboard"]}>
                        <EmployeeDetail products={products} setProducts={setProducts} currentUser={currentUser} isOnline={isOnline} />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
                </ErrorBoundary>
              </div>
            </main>
          </>
        ) : (
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<Login onLogin={handleLogin} onSSOLogin={handleSSOLogin} />} />
            {/* Unauthenticated users attempting to access any other path are redirected to HomePage ('/') */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        )}

        {/* Logout Confirmation Modal */}
        {showLogoutModal && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => !isLoggingOut && setShowLogoutModal(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100 transform transition-all animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${
                      localStorage.getItem('isSSO') === 'true'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {localStorage.getItem('isSSO') === 'true' ? (
                      <ExternalLink size={24} />
                    ) : (
                      <LogOut size={24} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Confirm Logout
                    </h3>
                    <p className="text-xs text-gray-500 font-medium">
                      {localStorage.getItem('isSSO') === 'true'
                        ? 'Single Sign-On Session'
                        : 'Stationary Session'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isLoggingOut && setShowLogoutModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  disabled={isLoggingOut}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-6 space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  {localStorage.getItem('isSSO') === 'true' ? (
                    <>
                      Are you sure you want to log out? Since you logged in via <strong>Single Sign-On (SSO)</strong>, logging out will end your session and redirect you back to the CRM Central Portal.
                    </>
                  ) : (
                    'Are you sure you want to log out of Stationary Management?'
                  )}
                </p>

                {localStorage.getItem('isSSO') === 'true' && (
                  <div className="flex items-center gap-2.5 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs font-medium text-blue-800">
                    <ExternalLink size={15} className="shrink-0 text-blue-600" />
                    <span>Destination: <strong>https://crm.pydah.edu.in</strong></span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutModal(false)}
                  disabled={isLoggingOut}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeLogout}
                  disabled={isLoggingOut}
                  className={`px-5 py-2.5 rounded-xl text-white font-medium text-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer ${
                    localStorage.getItem('isSSO') === 'true'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/25'
                      : 'bg-red-600 hover:bg-red-700 shadow-red-500/25'
                  }`}
                >
                  {isLoggingOut ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Logging out...</span>
                    </>
                  ) : (
                    <>
                      <LogOut size={16} />
                      <span>
                        {localStorage.getItem('isSSO') === 'true'
                          ? 'Logout & Return to CRM'
                          : 'Logout'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Suspense>
  );
}

export default App;
