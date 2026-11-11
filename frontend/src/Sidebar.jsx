import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, PlusCircle, Users, List, Settings, LogOut, ChevronLeft, ChevronRight, Menu, UserPlus, X, User, GraduationCap, Receipt, ClipboardList, ClipboardCheck, ArrowRightLeft, ShoppingCart, Briefcase, TrendingUp, ShieldCheck, ChevronDown, Package, Plus, Building2 } from 'lucide-react';
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

  // Map sidebar items with permission keys
  const allMenuItems = [
    { path: '/', label: 'Dashboard', icon: Home, exact: true, permissionKey: 'dashboard' },
    // { path: '/student-management', label: 'Manage Students', icon: Users, permissionKey: 'student-management' }, // REMOVED
    { path: '/students-dashboard', label: 'Student Dashboard', icon: GraduationCap, permissionKey: 'course-dashboard' },
    { path: '/employees-dashboard', label: 'Employee Dashboard', icon: Briefcase, permissionKey: 'employee-dashboard' },
    { path: '/sub-admin-management', label: 'User Management', icon: UserPlus, superAdminOnly: true },
    { path: '/courses', label: 'College and Courses', icon: GraduationCap, permissionKey: 'courses' },
    { path: '/manage-stock', label: 'Academic Stock', icon: List, permissionKeys: ['stock-products', 'stock-add', 'stock-entries', 'stock-vendors', 'manage-stock'] },
    { path: '/stock-transfers', label: 'Stock Transfers', icon: ArrowRightLeft, permissionKey: 'stock-transfers' },
    { path: '/general-purchase', label: 'General Stock', icon: ShoppingCart, permissionKey: 'general-purchase' },
    { path: '/transactions', label: 'Reports', icon: Receipt, permissionKeys: ['reports-daily', 'reports-monthly', 'reports-stock', 'transactions'] },
    { path: '/profit-report', label: 'Profit Report', icon: TrendingUp, permissionKey: 'profit-report' },
    { path: '/student-due', label: 'Student Due', icon: ClipboardList, permissionKeys: ['student-due', 'reports-daily', 'reports-monthly', 'reports-stock', 'transactions'] },
    { path: '/audit-logs', label: 'Audit Logs', icon: ClipboardCheck, permissionKeys: ['audit-log-entry', 'audit-log-approval', 'audit-logs'] },
    { path: '/user-audits', label: 'User Audit', icon: ShieldCheck, superAdminOnly: true },
    { path: '/settings', label: 'Settings', icon: Settings, permissionKey: 'settings' },
  ];

  // Filter menu items based on user type and permissions
  const menuItems = allMenuItems.filter(item => {
    // Super admin can see everything except sub-admin management is always visible for them
    if (isSuperAdmin) {
      return true; // Super admin sees all items
    }
    // Sub-admin: filter by permissions
    if (isSubAdmin) {
      // If item requires super admin only, hide it
      if (item.superAdminOnly) return false;
      // If item has permission key, check if sub-admin has that permission (view or full)
      if (item.permissionKeys) {
        return item.permissionKeys.some(key => hasViewAccess(subAdminPermissions, key));
      }
      if (item.permissionKey) {
        return hasViewAccess(subAdminPermissions, item.permissionKey);
      }
      // Items without permission key are not accessible to sub-admins
      return false;
    }
    // Default: show all non-super-admin-only items
    return !item.superAdminOnly;
  });

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileProp && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Sidebar Container */}
      <aside className={`
        sidebar-modern fixed left-0 top-0 h-full bg-sidebar text-sidebar-text border-r border-border flex flex-col z-50 shadow-2xl transition-all duration-300
        ${isMobileProp
          ? `w-60 ${!sidebarOpen ? '-translate-x-full' : 'translate-x-0'}`
          : `${!sidebarOpen ? 'w-20' : 'w-60'}`
        }
      `}>

        {/* Header Section */}
        <div className="px-3.5 py-3 border-b border-white/10 bg-black/15">
          <div className={`flex items-center ${!sidebarOpen && !isMobileProp ? 'flex-col gap-2' : 'justify-between'}`}>
            {sidebarOpen ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex flex-col leading-tight min-w-0">
                  <img
                    src="/campo-logos/campo_logo_transparent_hq.png"
                    alt="Campo"
                    className="h-7 w-auto object-contain object-left"
                  />
                  <span className="text-[11px] text-sidebar-muted font-medium tracking-wide mt-0.5">
                    Stationery Management
                  </span>
                </div>
              </div>
            ) : (
              !isMobileProp && (
                <img
                  src="/campo-logos/favicon.svg"
                  alt="Campo"
                  className="w-8 h-8 rounded-lg shadow-sm flex-shrink-0"
                />
              )
            )}

            {/* Toggle Button */}
            {isMobileProp ? (
              <button
                className="w-8 h-8 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center cursor-pointer text-sidebar-text transition-all duration-200 hover:bg-white/25 hover:scale-105 shadow-sm"
                onClick={handleToggleSidebar}
                title="Close menu"
              >
                <X size={20} />
              </button>
            ) : (
              <button
                className="w-7 h-7 bg-primary text-white border border-primary-hover flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-primary-hover hover:scale-105 shadow-sm rounded flex-shrink-0"
                onClick={handleToggleSidebar}
                title={!sidebarOpen ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {!sidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            )}
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 py-2.5 overflow-y-auto custom-scrollbar">
          <ul className="space-y-0.5 px-2.5">
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);

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
                          flex-1 flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative group
                          ${isParentActive
                            ? 'bg-primary text-white shadow-md'
                            : 'text-sidebar-muted hover:bg-white/10 hover:text-sidebar-text hover:translate-x-1'
                          }
                          ${!sidebarOpen ? 'justify-center px-2' : ''}
                        `}
                        title={!sidebarOpen ? item.label : ''}
                      >
                        <IconComponent size={18} className="flex-shrink-0" />
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
                              size={15}
                              className={`transition-transform duration-200 ${stockDropdownOpen ? 'rotate-180' : ''}`}
                            />
                          </span>
                        )}
                        {isParentActive && sidebarOpen && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white/70 rounded-r-full"></div>
                        )}
                      </NavLink>
                    </div>

                    {/* Submenu Dropdown under Academic Stock */}
                    {sidebarOpen && stockDropdownOpen && stockSubItems.length > 0 && (
                      <ul className="mt-0.5 ml-4 pl-2.5 border-l-2 border-white/20 space-y-0.5 py-0.5">
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
                                  flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150
                                  ${isSubActive
                                    ? 'bg-primary text-white shadow-sm font-semibold'
                                    : 'text-sidebar-muted hover:bg-white/10 hover:text-sidebar-text'
                                  }
                                `}
                              >
                                <SubIcon size={14} className={`flex-shrink-0 ${isSubActive ? 'text-white' : 'text-sidebar-muted'}`} />
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
                      flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative group
                      ${isActive
                        ? 'bg-primary text-white shadow-md'
                        : 'text-sidebar-muted hover:bg-white/10 hover:text-sidebar-text hover:translate-x-1'
                      }
                      ${!sidebarOpen ? 'justify-center px-2' : ''}
                    `}
                    title={!sidebarOpen ? item.label : ''}
                  >
                    <IconComponent size={18} className="flex-shrink-0" />
                    {sidebarOpen && <span className="truncate">{item.label}</span>}
                    {isActive && sidebarOpen && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white/70 rounded-r-full"></div>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Footer Section - User Info & Logout */}
        <div className={`border-t border-white/10 bg-black/10 ${sidebarOpen ? 'p-3' : 'p-2'}`}>
          {/* User Info */}
          {currentUser && (
            <div className={`flex items-center bg-white/10 border border-white/15 rounded-xl text-sidebar-text text-sm font-medium ${sidebarOpen ? 'gap-2.5 p-2.5' : 'justify-center p-2'
              }`}>
              {sidebarOpen && (
                <>
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white shadow-md">
                    <User size={20} />
                  </div>
                  <div className="flex items-center justify-between gap-3 flex-1 min-w-0">
                    <div className="flex flex-col leading-tight flex-1 min-w-0">
                      <span className="font-semibold text-sm truncate text-sidebar-text" title={isSuperAdmin ? 'Administrator' : (employeeName || currentUser.employeeName || currentUser.employee_name || currentUser.name)}>
                        {isSuperAdmin ? 'Administrator' : (employeeName || currentUser.employeeName || currentUser.employee_name || currentUser.name)}
                      </span>
                      <span className="text-xs text-sidebar-muted truncate">
                        {isSuperAdmin ? 'Administrator' : 'Sub-Administrator'}
                      </span>
                    </div>
                    <button
                      onClick={onLogout}
                      className="p-2 rounded-lg bg-white/15 hover:bg-danger hover:border-danger hover:text-white hover:shadow-md transition-all duration-200"
                      title="Logout"
                    >
                      <LogOut size={18} />
                    </button>
                  </div>
                </>
              )}
              {!sidebarOpen && (
                <button
                  onClick={onLogout}
                  className="p-2 rounded-lg bg-white/15 hover:bg-danger hover:border-danger hover:text-white hover:shadow-md transition-all duration-200 w-full flex items-center justify-center"
                  title="Logout"
                >
                  <LogOut size={18} />
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