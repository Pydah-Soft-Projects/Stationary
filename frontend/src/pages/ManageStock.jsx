import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, Plus, Building2, Archive, List, Lock, Filter } from 'lucide-react';
import AddProduct from './stock/AddProduct';
import AddStock from './stock/AddStock';
import VendorManagement from './stock/VendorManagement';
import StockEntries from './stock/StockEntries';
import { hasViewAccess } from '../utils/permissions';
import { apiUrl } from '../utils/api';

const ManageStock = ({ itemCategories, addItemCategory, setItemCategories, currentCourse, products = [], setProducts, currentUser }) => {
  // Check access level
  const isSuperAdmin = currentUser?.role === 'Administrator';
  const permissions = currentUser?.permissions || [];

  // View Context for SuperAdmin (Central vs College)
  const [viewContext, setViewContext] = useState('central'); // 'central' or collegeId
  const [colleges, setColleges] = useState([]);

  useEffect(() => {
    if (isSuperAdmin) {
      (async () => {
        try {
          const res = await fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=true'));
          if (!res.ok) throw new Error('Failed to load colleges');
          const data = await res.json();
          setColleges(Array.isArray(data) ? data : []);
        } catch (e) {
          console.error("ManageStock: Error fetching colleges", e);
        }
      })();
    }
  }, [isSuperAdmin]);

  // Check for legacy manage-stock permission (without access level)
  const hasLegacyPermission = permissions.some(p => {
    if (typeof p !== 'string') return false;
    return p === 'manage-stock' || p.startsWith('manage-stock:');
  });

  // Check permissions for each tab
  const canAccessProducts = isSuperAdmin || hasLegacyPermission || hasViewAccess(permissions, 'stock-products');
  const canAccessStock = isSuperAdmin || hasLegacyPermission || hasViewAccess(permissions, 'stock-add');
  const canAccessEntries = isSuperAdmin || hasLegacyPermission || hasViewAccess(permissions, 'stock-entries');
  const canAccessVendors = isSuperAdmin || hasLegacyPermission || hasViewAccess(permissions, 'stock-vendors');

  // Define all tabs with their permissions
  const allTabs = useMemo(() => [
    { id: 'products', label: 'Add Product', icon: Package, canAccess: canAccessProducts },
    { id: 'stock', label: 'Add Stock', icon: Plus, canAccess: canAccessStock },
    { id: 'entries', label: 'Stock Entries', icon: List, canAccess: canAccessEntries },
    { id: 'vendors', label: 'Vendor Management', icon: Building2, canAccess: canAccessVendors },
  ], [canAccessProducts, canAccessStock, canAccessEntries, canAccessVendors]);

  // Filter tabs based on permissions
  const tabs = useMemo(() => allTabs.filter(tab => tab.canAccess), [allTabs]);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');

  // Set initial active tab to URL tab if valid, or first available tab
  const [activeTab, setActiveTab] = useState(() => {
    if (urlTab && allTabs.some(tab => tab.id === urlTab && tab.canAccess)) {
      return urlTab;
    }
    const firstAvailableTab = allTabs.find(tab => tab.canAccess);
    return firstAvailableTab ? firstAvailableTab.id : null;
  });

  // Sync with URL query parameter when it changes (e.g. from sidebar navigation)
  useEffect(() => {
    if (urlTab && allTabs.some(tab => tab.id === urlTab && tab.canAccess)) {
      setActiveTab(urlTab);
    }
  }, [urlTab, allTabs]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', tabId);
      return next;
    });
  };

  const [externalAddTrigger, setExternalAddTrigger] = useState(0);

  const handleAddProductClick = () => {
    if (activeTab !== 'products') {
      handleTabChange('products');
    }
    setExternalAddTrigger(prev => prev + 1);
  };

  // Update active tab if current tab becomes unavailable
  useEffect(() => {
    const currentTab = allTabs.find(tab => tab.id === activeTab);
    if (currentTab && !currentTab.canAccess) {
      const firstAvailableTab = tabs.find(tab => tab.canAccess);
      if (firstAvailableTab) {
        setActiveTab(firstAvailableTab.id);
      } else {
        setActiveTab(null);
      }
    }
  }, [activeTab, allTabs, tabs]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto">
        {/* Header Section for Academic Stock (Products) */}
        {activeTab === 'products' ? (
          <div className="mb-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              {/* Title & Icon */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                  <Archive className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">Academic Stock</h1>
                  <p className="text-gray-600 mt-1 text-sm">Manage products, stock entries, and vendors</p>
                </div>
              </div>

              {/* Right Side Actions */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Admin Context Selector */}
                {isSuperAdmin && (
                  <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm">
                    <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5 whitespace-nowrap">
                      <Filter size={14} className="text-gray-400" />
                      <span>View Stock For:</span>
                    </span>
                    <select
                      className="text-xs font-semibold text-gray-800 bg-transparent border-0 outline-none cursor-pointer focus:ring-0 pr-2"
                      value={viewContext}
                      onChange={(e) => setViewContext(e.target.value)}
                    >
                      <option value="central">Central Warehouse</option>
                      {colleges.map(c => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Add Product Button */}
                {canAccessProducts && (
                  <button
                    onClick={handleAddProductClick}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg text-sm font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Plus size={18} />
                    <span>Add Product</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'entries' && isSuperAdmin ? (
          <div className="mb-2 flex items-center justify-end px-6">
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5 whitespace-nowrap">
                <Filter size={14} className="text-gray-400" />
                <span>View Stock For:</span>
              </span>
              <select
                className="text-xs font-semibold text-gray-800 bg-transparent border-0 outline-none cursor-pointer focus:ring-0 pr-2"
                value={viewContext}
                onChange={(e) => setViewContext(e.target.value)}
              >
                <option value="central">Central Warehouse</option>
                {colleges.map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {tabs.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                <Lock className="text-gray-400" size={32} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Access</h3>
                <p className="text-sm text-gray-600">You do not have permission to access any stock management features.</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content */}
        {tabs.length > 0 && activeTab && (
          <div className={activeTab === 'products' ? "mt-4" : ""}>
            {activeTab === 'products' && canAccessProducts && (
              <AddProduct
                itemCategories={itemCategories}
                addItemCategory={addItemCategory}
                setItemCategories={setItemCategories}
                currentCourse={currentCourse}
                products={products}
                setProducts={setProducts}
                currentUser={currentUser}
                viewContext={viewContext} // Pass the context
                externalAddTrigger={externalAddTrigger}
              />
            )}
            {activeTab === 'stock' && canAccessStock && (
              <AddStock products={products} setProducts={setProducts} currentUser={currentUser} />
            )}
            {activeTab === 'entries' && canAccessEntries && (
              <StockEntries
                currentUser={currentUser}
                viewContext={viewContext}
              />
            )}
            {activeTab === 'vendors' && canAccessVendors && <VendorManagement currentUser={currentUser} />}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageStock;
