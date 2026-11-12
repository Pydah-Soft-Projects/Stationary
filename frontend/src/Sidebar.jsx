import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid, GraduationCap, Briefcase, Building2, Package,
  ArrowRightLeft, ShoppingCart, Receipt, TrendingUp, ClipboardList,
  UserPlus, ClipboardCheck, ShieldCheck, Settings, ChevronLeft,
  ChevronRight, ChevronDown, LogOut, X, Plus, List, CalendarClock
} from 'lucide-react';
import { hasViewAccess } from './utils/permissions';
import { apiUrl } from './utils/api';

const Sidebar = ({ onLogout, isMobile: isMobileProp, sidebarOpen, setSidebarOpen, currentUser }) => {
  const location = useLocation();
  const isSuperAdmin = currentUser?.role === 'Administrator' || currentUser?.name === 'superadmin' || currentUser?.name === 'Administrator';
  const [employeeName, setEmployeeName] = useState(
    isSuperAdmin ? 'Administrator' : (currentUser?.employeeName || currentUser?.employee_name || null)
  );

  useEffect(() => {
    if (isSuperAdmin) {
      setEmployeeName('Administrator');
      try {
        const saved = JSON.parse(localStorage.getItem('currentUser') || '{}');
        if (saved && (saved.employeeName || saved.employee_name || saved.empNo)) {
          delete saved.employeeName;
          delete saved.employee_name;
          delete saved.empNo;
          saved.name = 'Administrator';
          localStorage.setItem('currentUser', JSON.stringify(saved));
        }
      } catch (e) {}
      return;
    }

    if (currentUser?.employeeName || currentUser?.employee_name) {
      setEmployeeName(currentUser.employeeName || currentUser.employee_name);
      return;
    }

    if (currentUser?.name) {
      let isMounted = true;
      fetch(apiUrl('/api/subadmins'))
        .then(res => res.ok ? res.json() : [])
        .then(list => {
          if (!isMounted || !Array.isArray(list)) return;
          const found = list.find(u =>
            (u.name && String(u.name).toLowerCase() === String(currentUser.name).toLowerCase()) ||
            (u.empNo && String(u.empNo).toLowerCase() === String(currentUser.name).toLowerCase())
          );
          if (found && found.employeeName) {
            setEmployeeName(found.employeeName);
            try {
              const saved = JSON.parse(localStorage.getItem('currentUser') || '{}');
              localStorage.setItem('currentUser', JSON.stringify({
                ...saved,
                employeeName: found.employeeName,
                empNo: found.empNo
              }));
            } catch (e) {}
          }
        })
        .catch(() => {});

      return () => { isMounted = false; };
    }
  }, [currentUser, isSuperAdmin]);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    if (isMobileProp && sidebarOpen) {
      const handleClickOutside = (event) => {
        const sidebar = document.querySelector('.sidebar-modern');
        if (sidebar && !sidebar.contains(event.target)) {
          setSidebarOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMobileProp, sidebarOpen, setSidebarOpen]);

  // Sub admin check
  const isSubAdmin = !isSuperAdmin && currentUser?.role;
  const subAdminPermissions = currentUser?.permissions || [];

  const isStockRoute = location.pathname.startsWith('/manage-stock');
  const [stockDropdownOpen, setStockDropdownOpen] = useState(isStockRoute);

  useEffect(() => {
    if (location.pathname.startsWith('/manage-stock')) {
      setStockDropdownOpen(true);
    }
  }, [location.pathname]);

  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab') || 'products';

  const hasLegacyStockPermission = subAdminPermissions.some(p => {
    if (typeof p !== 'string') return false;
    return p === 'manage-stock' || p.startsWith('manage-stock:');
  });

  const canAccessProducts = isSuperAdmin || hasLegacyStockPermission || hasViewAccess(subAdminPermissions, 'stock-products');
  const canAccessStock = isSuperAdmin || hasLegacyStockPermission || hasViewAccess(subAdminPermissions, 'stock-add');
  const canAccessEntries = isSuperAdmin || hasLegacyStockPermission || hasViewAccess(subAdminPermissions, 'stock-entries');
  const canAccessVendors = isSuperAdmin || hasLegacyStockPermission || hasViewAccess(subAdminPermissions, 'stock-vendors');

  const stockSubItems = [
    { tabId: 'stock', label: 'Add Stock', icon: Plus, canAccess: canAccessStock },
    { tabId: 'entries', label: 'Stock Entries', icon: List, canAccess: canAccessEntries },
    { tabId: 'vendors', label: 'Vendor Management', icon: Building2, canAccess: canAccessVendors },
  ].filter(item => item.canAccess);

  // Filter permission helper
  const canAccessItem = (item) => {
    if (isSuperAdmin) return true;
    if (isSubAdmin) {
      if (item.superAdminOnly) return false;
      if (item.permissionKeys) {
        return item.permissionKeys.some(key => hasViewAccess(subAdminPermissions, key));
      }
      if (item.permissionKey) {
        return hasViewAccess(subAdminPermissions, item.permissionKey);
      }
      return false;
    }
    return !item.superAdminOnly;
  };

  // Structured Section Groups following Campo Design System
  const sections = [
    {
      title: 'MAIN',
      items: [
        { path: '/', label: 'Dashboard', icon: LayoutGrid, exact: true, permissionKey: 'dashboard' },
      ]
    },
    {
      title: 'MANAGEMENT',
      items: [
        { path: '/students-dashboard', label: 'Student Dashboard', icon: GraduationCap, permissionKey: 'course-dashboard' },
        { path: '/employees-dashboard', label: 'Employee Dashboard', icon: Briefcase, permissionKey: 'employee-dashboard' },
        { path: '/courses', label: 'College and Courses', icon: Building2, permissionKey: 'courses' },
      ]
    },
    {
      title: 'OPERATIONS',
      items: [
        { path: '/manage-stock', label: 'Academic Stock', icon: Package, permissionKeys: ['stock-products', 'stock-add', 'stock-entries', 'stock-vendors', 'manage-stock'] },
        { path: '/stock-transfers', label: 'Stock Transfers', icon: ArrowRightLeft, permissionKey: 'stock-transfers' },
        { path: '/general-purchase', label: 'General Stock', icon: ShoppingCart, permissionKey: 'general-purchase' },
        { path: '/change-transaction-date', label: 'Change Transaction Date', icon: CalendarClock, permissionKey: 'change-transaction-date' },
      ]
    },
    {
      title: 'REPORTS',
      items: [
        { path: '/transactions', label: 'Reports', icon: Receipt, permissionKeys: ['reports-daily', 'reports-monthly', 'reports-stock', 'transactions'] },
        { path: '/profit-report', label: 'Profit Report', icon: TrendingUp, permissionKey: 'profit-report' },
        { path: '/student-due', label: 'Student Due', icon: ClipboardList, permissionKeys: ['student-due', 'reports-daily', 'reports-monthly', 'reports-stock', 'transactions'] },
      ]
    },
    {
      title: 'ADMINISTRATION',
      items: [
        { path: '/sub-admin-management', label: 'User Management', icon: UserPlus, superAdminOnly: true },
        { path: '/audit-logs', label: 'Audit Logs', icon: ClipboardCheck, permissionKeys: ['audit-log-entry', 'audit-log-approval', 'audit-logs'] },
        { path: '/user-audits', label: 'User Audit', icon: ShieldCheck, superAdminOnly: true },
        { path: '/settings', label: 'Settings', icon: Settings, permissionKey: 'settings' },
      ]
    }
  ];

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const displayName = isSuperAdmin
    ? 'System Superadmin'
    : (employeeName || currentUser?.employeeName || currentUser?.employee_name || currentUser?.name || 'User');
  const userInitial = displayName.trim().charAt(0).toUpperCase() || 'S';
  const roleTitle = isSuperAdmin ? 'Superadmin' : (currentUser?.role || 'Administrator');

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileProp && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={`
          sidebar-modern fixed top-0 left-0 bottom-0 z-40 border-r flex flex-col transition-all duration-300
          ${isMobileProp
            ? `w-64 ${!sidebarOpen ? '-translate-x-full' : 'translate-x-0'}`
            : `${!sidebarOpen ? 'w-20' : 'w-64'}`
          }
        `}
        style={{
          backgroundColor: 'var(--sidebar)',
          color: 'var(--sidebar-text)',
          borderColor: 'var(--border)',
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"
        }}
      >
        {/* Floating Circular Collapse Button */}
        {!isMobileProp && (
          <button
            type="button"
            onClick={handleToggleSidebar}
            className="absolute -right-3 top-[106px] z-50 w-6 h-6 rounded-full shadow-md border flex items-center justify-center cursor-pointer transition-transform hover:scale-110 outline-none"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)'
            }}
            title={!sidebarOpen ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={!sidebarOpen ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {!sidebarOpen ? (
              <ChevronRight size={14} className="stroke-[2.5]" style={{ color: 'var(--sidebar)' }} />
            ) : (
              <ChevronLeft size={14} className="stroke-[2.5]" style={{ color: 'var(--sidebar)' }} />
            )}
          </button>
        )}

        {/* Top Header */}
        <div
          className="flex flex-col items-center justify-center text-center pt-6 pb-4 border-b relative px-3"
          style={{ borderColor: 'var(--border)' }}
        >
          {isMobileProp && sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute right-3 top-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: 'var(--sidebar-text)' }}
              title="Close menu"
            >
              <X size={18} />
            </button>
          )}

          {sidebarOpen ? (
            <div className="flex flex-col items-center justify-center text-center">
              <img
                src="/campo-logos/campo_logo_transparent_hq.png"
                alt="Campo"
                className="h-7 w-auto object-contain max-w-[120px]"
              />
              <span
                className="text-xs font-medium tracking-wide mt-1.5"
                style={{ color: 'var(--sidebar-muted)' }}
              >
                Stationery Management
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <img
                src="/campo-logos/campo_logo_transparent_hq.png"
                alt="Campo"
                className="h-6 w-auto object-contain max-w-[60px]"
              />
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 py-3 overflow-y-auto custom-scrollbar px-3 space-y-4">
          {sections.map((section, idx) => {
            const accessibleItems = section.items.filter(canAccessItem);
            if (accessibleItems.length === 0) return null;

            return (
              <div key={section.title || idx} className="space-y-1">
                {sidebarOpen ? (
                  <div
                    className="text-[11px] font-bold uppercase tracking-wider px-3 pt-2 pb-1"
                    style={{ color: 'var(--sidebar-muted)' }}
                  >
                    {section.title}
                  </div>
                ) : (
                  idx > 0 && (
                    <div
                      className="my-2 border-t mx-2"
                      style={{ borderColor: 'var(--border)' }}
                    />
                  )
                )}

                <ul className="space-y-1">
                  {accessibleItems.map((item) => {
                    const IconComponent = item.icon;
                    const isActive = item.exact
                      ? location.pathname === item.path
                      : location.pathname.startsWith(item.path);

                    if (item.path === '/manage-stock') {
                      const isParentActive = location.pathname.startsWith('/manage-stock');
                      return (
                        <li key={item.path} className="flex flex-col">
                          <div className="flex items-center relative">
                            <NavLink
                              to="/manage-stock"
                              onClick={() => {
                                if (!sidebarOpen) {
                                  setSidebarOpen(true);
                                  setStockDropdownOpen(true);
                                } else {
                                  setStockDropdownOpen(prev => (isParentActive ? !prev : true));
                                }
                              }}
                              className={`
                                flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 relative group
                                ${isParentActive ? 'font-semibold shadow-sm' : 'font-medium hover:bg-white/10'}
                                ${!sidebarOpen ? 'justify-center px-2' : ''}
                              `}
                              style={{
                                backgroundColor: isParentActive ? 'var(--primary)' : 'transparent',
                                color: 'var(--sidebar-text)'
                              }}
                              title={!sidebarOpen ? item.label : ''}
                            >
                              <IconComponent
                                size={19}
                                className="flex-shrink-0"
                                style={{ color: isParentActive ? 'var(--sidebar-text)' : 'var(--sidebar-muted)' }}
                              />
                              {sidebarOpen && <span className="truncate flex-1">{item.label}</span>}
                              {sidebarOpen && stockSubItems.length > 0 && (
                                <span
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setStockDropdownOpen(prev => !prev);
                                  }}
                                  className="p-1 hover:bg-white/20 rounded transition-colors ml-1"
                                  title={stockDropdownOpen ? 'Collapse menu' : 'Expand menu'}
                                >
                                  <ChevronDown
                                    size={15}
                                    className={`transition-transform duration-200 ${stockDropdownOpen ? 'rotate-180' : ''}`}
                                  />
                                </span>
                              )}
                            </NavLink>
                          </div>

                          {/* Submenu Dropdown under Academic Stock */}
                          {sidebarOpen && stockDropdownOpen && stockSubItems.length > 0 && (
                            <ul
                              className="mt-1 ml-5 pl-3 border-l space-y-1 py-1"
                              style={{ borderColor: 'var(--border)' }}
                            >
                              {stockSubItems.map((subItem) => {
                                const isSubActive = isParentActive && currentTab === subItem.tabId;
                                const SubIcon = subItem.icon;

                                return (
                                  <li key={subItem.tabId}>
                                    <NavLink
                                      to={`/manage-stock?tab=${subItem.tabId}`}
                                      onClick={() => {
                                        if (isMobileProp) setSidebarOpen(false);
                                      }}
                                      className={`
                                        flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-all duration-150
                                        ${isSubActive ? 'font-semibold shadow-sm' : 'font-medium hover:bg-white/10'}
                                      `}
                                      style={{
                                        backgroundColor: isSubActive ? 'var(--primary)' : 'transparent',
                                        color: 'var(--sidebar-text)'
                                      }}
                                    >
                                      <SubIcon
                                        size={14}
                                        className="flex-shrink-0"
                                        style={{ color: isSubActive ? 'var(--sidebar-text)' : 'var(--sidebar-muted)' }}
                                      />
                                      <span className="truncate">{subItem.label}</span>
                                    </NavLink>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    }

                    return (
                      <li key={item.path}>
                        <NavLink
                          to={item.path}
                          end={item.exact}
                          className={`
                            flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 relative group
                            ${isActive ? 'font-semibold shadow-sm' : 'font-medium hover:bg-white/10'}
                            ${!sidebarOpen ? 'justify-center px-2' : ''}
                          `}
                          style={{
                            backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                            color: 'var(--sidebar-text)'
                          }}
                          title={!sidebarOpen ? item.label : ''}
                        >
                          <IconComponent
                            size={19}
                            className="flex-shrink-0"
                            style={{ color: isActive ? 'var(--sidebar-text)' : 'var(--sidebar-muted)' }}
                          />
                          {sidebarOpen && <span className="truncate flex-1">{item.label}</span>}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Footer Section - User Info & Logout (Matches 2nd reference image) */}
        <div className={`mt-auto ${sidebarOpen ? 'p-3 pb-4' : 'p-2 pb-3'}`}>
          {currentUser && (
            <div
              className={`flex items-center rounded-2xl transition-all ${
                sidebarOpen ? 'px-3.5 py-3 gap-3' : 'p-2 justify-center'
              }`}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)'
              }}
            >
              {sidebarOpen ? (
                <>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0"
                    style={{
                      backgroundColor: '#EEF2F6',
                      color: 'var(--primary)'
                    }}
                  >
                    {userInitial}
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
                    <div className="flex flex-col leading-tight min-w-0 flex-1">
                      <span
                        className="font-bold text-sm truncate tracking-tight"
                        style={{ color: 'var(--sidebar-text)' }}
                        title={displayName}
                      >
                        {displayName}
                      </span>
                      <span
                        className="text-xs truncate mt-0.5 font-normal"
                        style={{ color: 'var(--sidebar-muted)' }}
                      >
                        {roleTitle}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="p-1 rounded-lg hover:bg-white/10 hover:text-red-400 transition-colors flex-shrink-0 cursor-pointer"
                      style={{ color: 'var(--sidebar-text)' }}
                      title="Logout"
                      aria-label="Logout"
                    >
                      <LogOut size={18} strokeWidth={2} />
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm hover:scale-105 transition-transform cursor-pointer"
                  style={{
                    backgroundColor: '#EEF2F6',
                    color: 'var(--primary)'
                  }}
                  title={`Logout (${displayName})`}
                  aria-label={`Logout (${displayName})`}
                >
                  {userInitial}
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
