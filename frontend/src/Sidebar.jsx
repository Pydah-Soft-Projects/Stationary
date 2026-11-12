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
  const isItemPermitted = (item) => {
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

  // Filter sections and items based on user type and permissions; omit empty sections
  const visibleSections = sections
    .map(section => ({
      ...section,
      items: section.items.filter(isItemPermitted),
    }))
    .filter(section => section.items.length > 0);

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const displayName = isSuperAdmin
    ? 'Administrator'
    : (employeeName || currentUser?.employeeName || currentUser?.employee_name || currentUser?.name || 'User');
  const displayRole = isSuperAdmin ? 'Administrator' : (currentUser?.role || 'Sub-Administrator');
  const userInitial = String(displayName).trim().charAt(0).toUpperCase() || 'U';

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
        style={{
          backgroundColor: 'var(--sidebar, #1E3150)',
          color: 'var(--sidebar-text, #FFFFFF)',
          borderColor: 'var(--border)',
          boxShadow: '4px 0 24px -2px rgba(10, 20, 35, 0.45)',
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
        }}
        className={`
          sidebar-modern fixed left-0 top-0 h-full border-r flex flex-col z-50 transition-all duration-200
          ${isMobileProp
            ? `w-[256px] ${!sidebarOpen ? '-translate-x-full' : 'translate-x-0'}`
            : `${!sidebarOpen ? 'w-[80px]' : 'w-[256px]'}`
          }
        `}
      >
        {/* Floating Circular Collapse Control (Desktop) */}
        {!isMobileProp && (
          <button
            type="button"
            onClick={handleToggleSidebar}
            title={!sidebarOpen ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={!sidebarOpen ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              backgroundColor: 'var(--surface, #FFFFFF)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary, #1E3150)',
            }}
            className="absolute -right-[12px] top-[106px] w-[24px] h-[24px] rounded-full border shadow-md flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-105 z-50 outline-none"
          >
            {!sidebarOpen
              ? <ChevronRight size={14} strokeWidth={2.5} />
              : <ChevronLeft size={14} strokeWidth={2.5} />
            }
          </button>
        )}

        {/* Brand Header Section */}
        <div
          style={{ borderColor: 'var(--border)' }}
          className={`relative border-b pt-[24px] pb-[16px] ${sidebarOpen ? 'px-[24px]' : 'px-[8px]'}`}
        >
          {isMobileProp && sidebarOpen && (
            <button
              className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-white/25"
              onClick={handleToggleSidebar}
              title="Close menu"
              aria-label="Close menu"
            >
              <X size={18} strokeWidth={2} />
            </button>
          )}

          <div className="flex flex-col items-center justify-center text-center">
            {sidebarOpen ? (
              <>
                <img
                  src="/campo-logos/campo_logo_transparent_hq.png"
                  alt="Campo"
                  className="h-[28px] max-w-[120px] w-auto object-contain"
                />
                <span
                  style={{ color: 'var(--sidebar-muted, #AABBD4)' }}
                  className="mt-[8px] text-[12px] font-medium leading-tight"
                >
                  Stationery Management
                </span>
              </>
            ) : (
              <img
                src="/campo-logos/favicon.svg"
                alt="Campo"
                className="w-[36px] h-[36px] rounded-lg object-contain"
              />
            )}
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 px-[14px] pt-[12px] pb-[16px] overflow-y-auto overflow-x-hidden no-scrollbar">
          <div className="space-y-[24px]">
            {visibleSections.map((section) => (
              <div key={section.title} className="flex flex-col gap-[4px]">
                {sidebarOpen && (
                  <div
                    style={{ color: 'var(--sidebar-muted, #AABBD4)' }}
                    className="px-[14px] pt-[4px] pb-[8px] text-[11px] font-bold uppercase tracking-[0.06em]"
                  >
                    {section.title}
                  </div>
                )}

                <ul className="flex flex-col gap-[4px]">
                  {section.items.map((item) => {
                    const IconComponent = item.icon;
                    const isActive = item.exact
                      ? location.pathname === item.path
                      : location.pathname.startsWith(item.path);

                    if (item.path === '/manage-stock') {
                      const isParentActive = location.pathname.startsWith('/manage-stock');
                      return (
                        <li key={item.path} className="flex flex-col">
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
                            style={{ color: 'var(--sidebar-text, #FFFFFF)' }}
                            className={`
                              w-full flex items-center rounded-[12px] text-[13px] transition-all duration-200 relative group
                              ${sidebarOpen ? 'gap-[14px] px-[14px] py-[10px]' : 'justify-center px-0 py-[10px]'}
                              ${isParentActive
                                ? 'bg-primary font-semibold shadow-md'
                                : 'font-medium opacity-85 hover:opacity-100 hover:bg-white/10'
                              }
                            `}
                            title={!sidebarOpen ? item.label : ''}
                          >
                            <IconComponent
                              size={sidebarOpen ? 18 : 20}
                              strokeWidth={2}
                              className="flex-shrink-0"
                            />
                            {sidebarOpen && <span className="truncate flex-1">{item.label}</span>}
                            {sidebarOpen && stockSubItems.length > 0 && (
                              <span
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setStockDropdownOpen(prev => !prev);
                                }}
                                className="p-0.5 hover:bg-white/20 rounded transition-colors ml-1"
                                title={stockDropdownOpen ? 'Collapse menu' : 'Expand menu'}
                              >
                                <ChevronDown
                                  size={14}
                                  strokeWidth={2}
                                  className={`transition-transform duration-200 ${stockDropdownOpen ? 'rotate-180' : ''}`}
                                />
                              </span>
                            )}
                          </NavLink>

                          {/* Submenu Dropdown under Academic Stock */}
                          {sidebarOpen && stockDropdownOpen && stockSubItems.length > 0 && (
                            <ul className="mt-1 ml-4 pl-3 border-l border-white/20 flex flex-col gap-[4px] py-0.5">
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
                                      style={{ color: 'var(--sidebar-text, #FFFFFF)' }}
                                      className={`
                                        w-full flex items-center gap-[10px] px-[12px] py-[8px] text-[12px] rounded-[10px] transition-all duration-150
                                        ${isSubActive
                                          ? 'bg-primary font-semibold shadow-sm'
                                          : 'font-medium opacity-80 hover:opacity-100 hover:bg-white/10'
                                        }
                                      `}
                                    >
                                      <SubIcon size={14} strokeWidth={2} className="flex-shrink-0" />
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
                          onClick={() => {
                            if (isMobileProp) setSidebarOpen(false);
                          }}
                          style={{ color: 'var(--sidebar-text, #FFFFFF)' }}
                          className={`
                            w-full flex items-center rounded-[12px] text-[13px] transition-all duration-200 relative group
                            ${sidebarOpen ? 'gap-[14px] px-[14px] py-[10px]' : 'justify-center px-0 py-[10px]'}
                            ${isActive
                              ? 'bg-primary font-semibold shadow-md'
                              : 'font-medium opacity-85 hover:opacity-100 hover:bg-white/10'
                            }
                          `}
                          title={!sidebarOpen ? item.label : ''}
                        >
                          <IconComponent
                            size={sidebarOpen ? 18 : 20}
                            strokeWidth={2}
                            className="flex-shrink-0"
                          />
                          {sidebarOpen && <span className="truncate">{item.label}</span>}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Section - Bottom User Profile */}
        {currentUser && (
          <div className="p-[14px] border-t border-white/10">
            {sidebarOpen ? (
              <div className="h-[64px] rounded-[16px] px-[14px] flex items-center justify-between gap-[12px] bg-black/20 border border-white/10 shadow-sm">
                <div className="flex items-center gap-[12px] flex-1 min-w-0">
                  <div className="w-[40px] h-[40px] rounded-full bg-primary text-white flex items-center justify-center text-[14px] font-bold flex-shrink-0 shadow-sm">
                    {userInitial}
                  </div>
                  <div className="flex flex-col leading-tight flex-1 min-w-0">
                    <span
                      className="text-[13px] font-bold truncate"
                      style={{ color: 'var(--sidebar-text, #FFFFFF)' }}
                      title={displayName}
                    >
                      {displayName}
                    </span>
                    <span
                      className="text-[11px] font-normal truncate mt-0.5"
                      style={{ color: 'var(--sidebar-muted, #AABBD4)' }}
                      title={displayRole}
                    >
                      {displayRole}
                    </span>
                  </div>
                </div>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-danger transition-all duration-200 flex-shrink-0 cursor-pointer"
                    title="Logout"
                    aria-label="Logout"
                  >
                    <LogOut size={16} strokeWidth={2} />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <div
                  className="w-[40px] h-[40px] rounded-full bg-primary text-white flex items-center justify-center text-[14px] font-bold shadow-sm cursor-default"
                  title={`${displayName} (${displayRole})`}
                >
                  {userInitial}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
};

export default Sidebar;
