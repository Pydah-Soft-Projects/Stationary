import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Package, Building2, FileText, Calendar, DollarSign, Save, AlertCircle, MapPin, TrendingUp, TrendingDown, ChevronDown, Search, Check } from 'lucide-react';
import { apiUrl } from '../../utils/api';
import { hasFullAccess } from '../../utils/permissions';

// Custom Dropdown Component to avoid native browser OS select popups
const CustomSelect = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  icon: Icon,
  searchPlaceholder = 'Search...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);

  const selectedOption = options.find(o => String(o.value) === String(value));

  const filteredOptions = options.filter(o =>
    (o.label || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.subtext || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`w-full pl-9 pr-9 py-2 border rounded-lg text-sm bg-white text-left flex items-center justify-between transition-colors outline-none h-[38px] ${
          isOpen
            ? 'ring-2 ring-blue-500 border-blue-500'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
        )}
        <span className={`truncate text-sm ${selectedOption && selectedOption.value !== '' ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
          {selectedOption && selectedOption.value !== '' ? selectedOption.label : placeholder}
        </span>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
          <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-500' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          {options.length > 5 && (
            <div className="p-2 border-b border-gray-100 bg-gray-50/80">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  autoFocus
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-400">
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 text-left flex items-center justify-between text-xs transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <div className="truncate pr-2">
                      <p className="truncate font-medium">{opt.label}</p>
                      {opt.subtext && (
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">{opt.subtext}</p>
                      )}
                    </div>
                    {isSelected && (
                      <Check size={14} className="text-blue-600 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AddStock = ({ products = [], setProducts, currentUser }) => {
  // Check access level
  const isSuperAdmin = currentUser?.role === 'Administrator';
  const permissions = currentUser?.permissions || [];

  // Check for legacy manage-stock permission
  const hasLegacyPermission = permissions.some(p => {
    if (typeof p !== 'string') return false;
    return p === 'manage-stock' || p.startsWith('manage-stock:');
  });

  const canEdit = isSuperAdmin || hasLegacyPermission || hasFullAccess(permissions, 'stock-add');

  // Helper: Format Date for Input
  const getTodayStr = () => new Date().toISOString().split('T')[0];

  // MAIN FORM STATE (Invoice Details)
  const [formData, setFormData] = useState({
    vendor: '',
    invoiceNumber: '',
    invoiceDate: getTodayStr(),
    remarks: '',
    targetLocation: '', // '' = Central, 'collegeId' = College
  });

  // ITEM FORM STATE (Current Item being added)
  const [itemData, setItemData] = useState({
    product: '',
    quantity: '',
    purchasePrice: '',
    gstPercent: 0,
  });

  const calcLineTotal = (quantity, purchasePrice, gstPercent = 0) => {
    const qty = Number(quantity) || 0;
    const price = Number(purchasePrice) || 0;
    const gst = Number(gstPercent) || 0;
    return qty * price * (1 + gst / 100);
  };

  // ADDED ITEMS LIST
  const [addedItems, setAddedItems] = useState([]);

  const [vendors, setVendors] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', message: '' });
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Shared input styles
  const inputCls = 'w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const selectCls = 'w-full pl-9 pr-9 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer';
  const textAreaCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y';

  useEffect(() => {
    fetchVendors();
    fetchColleges();
  }, []);

  // Set default college for SubAdmin
  useEffect(() => {
    if (!isSuperAdmin && currentUser?.assignedCollege) {
      // Handle both populated object and ID string
      const collegeId = typeof currentUser.assignedCollege === 'object'
        ? currentUser.assignedCollege._id
        : currentUser.assignedCollege;
      setFormData(prev => ({ ...prev, targetLocation: collegeId }));
    }
  }, [isSuperAdmin, currentUser]);

  // Update selected product display
  useEffect(() => {
    if (itemData.product) {
      const product = products.find(p => p._id === itemData.product);
      setSelectedProduct(product);
    } else {
      setSelectedProduct(null);
    }
  }, [itemData.product, products]);

  // Purchase & Vendor History for the selected product
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyTab, setHistoryTab] = useState('vendors'); // 'vendors' | 'recent'

  useEffect(() => {
    if (!itemData.product) {
      setPurchaseHistory([]);
      return;
    }

    const fetchProductPurchases = async () => {
      setLoadingHistory(true);
      try {
        const res = await fetch(apiUrl(`/api/stock-entries?product=${itemData.product}`));
        if (res.ok) {
          const data = await res.json();
          setPurchaseHistory(Array.isArray(data) ? data : []);
        } else {
          setPurchaseHistory([]);
        }
      } catch (err) {
        console.error('Error fetching product purchase history:', err);
        setPurchaseHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchProductPurchases();
  }, [itemData.product]);

  // Vendor comparison aggregation
  const vendorComparison = useMemo(() => {
    if (!purchaseHistory || purchaseHistory.length === 0) return [];

    const vendorMap = new Map();
    purchaseHistory.forEach(entry => {
      const vId = entry.vendor?._id ? String(entry.vendor._id) : (entry.vendor ? String(entry.vendor) : 'unknown');
      const vName = entry.vendor?.name || 'Unknown Vendor';

      if (!vendorMap.has(vId)) {
        vendorMap.set(vId, {
          vendorId: vId,
          vendorName: vName,
          latestPrice: entry.purchasePrice || 0,
          latestDate: entry.invoiceDate || entry.createdAt,
          lowestPrice: entry.purchasePrice || 0,
          highestPrice: entry.purchasePrice || 0,
          totalQuantity: 0,
          totalPurchases: 0,
        });
      }

      const vData = vendorMap.get(vId);
      vData.totalQuantity += (entry.quantity || 0);
      vData.totalPurchases += 1;
      if ((entry.purchasePrice || 0) < vData.lowestPrice) vData.lowestPrice = entry.purchasePrice || 0;
      if ((entry.purchasePrice || 0) > vData.highestPrice) vData.highestPrice = entry.purchasePrice || 0;
    });

    return Array.from(vendorMap.values()).sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));
  }, [purchaseHistory]);

  // Overall purchase metrics
  const purchaseMetrics = useMemo(() => {
    if (!purchaseHistory || purchaseHistory.length === 0) return null;

    const latest = purchaseHistory[0];
    const prices = purchaseHistory.map(e => e.purchasePrice || 0).filter(p => p > 0);
    const lowest = prices.length > 0 ? Math.min(...prices) : (latest.purchasePrice || 0);
    const highest = prices.length > 0 ? Math.max(...prices) : (latest.purchasePrice || 0);
    const avg = prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length) : (latest.purchasePrice || 0);

    const lowestEntry = purchaseHistory.find(e => (e.purchasePrice || 0) === lowest);
    const highestEntry = purchaseHistory.find(e => (e.purchasePrice || 0) === highest);

    // Difference with latest purchase
    const lastPrice = latest.purchasePrice || 0;
    const currentPrice = Number(itemData.purchasePrice) || 0;
    const diffWithLast = currentPrice > 0 ? (currentPrice - lastPrice) : null;
    const diffPercent = (diffWithLast !== null && lastPrice > 0)
      ? ((diffWithLast / lastPrice) * 100).toFixed(1)
      : null;

    return {
      latest,
      lastPrice,
      lastVendorName: latest.vendor?.name || 'Previous Vendor',
      lastDate: latest.invoiceDate || latest.createdAt,
      lowest,
      lowestVendorName: lowestEntry?.vendor?.name || 'Unknown',
      highest,
      highestVendorName: highestEntry?.vendor?.name || 'Unknown',
      avg,
      diffWithLast,
      diffPercent,
      totalEntries: purchaseHistory.length,
    };
  }, [purchaseHistory, itemData.purchasePrice]);

  const formatDisplayDate = (d) => {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return String(d);
    }
  };

  // Fetch college stock to show context
  const [collegeStockMap, setCollegeStockMap] = useState({});

  useEffect(() => {
    const targetId = formData.targetLocation;
    if (targetId) {
      (async () => {
        try {
          const res = await fetch(apiUrl(`/api/stock-transfers/colleges/${targetId}/stock`));
          if (res.ok) {
            const data = await res.json();
            const map = {};
            (data.stock || []).forEach(item => {
              const pId = typeof item.product === 'object' ? item.product._id : item.product;
              map[pId] = item.quantity;
            });
            setCollegeStockMap(map);
          }
        } catch (e) { console.error(e); }
      })();
    } else {
      setCollegeStockMap({});
    }
  }, [formData.targetLocation]);

  const getDisplayStock = (productId) => {
    const product = products.find(p => p._id === productId);
    if (!product) return 'N/A';

    if (formData.targetLocation) {
      return `College: ${collegeStockMap[product._id] || 0}`;
    }
    return `Central: ${product.stock || 0}`;
  };

  const fetchVendors = async () => {
    try {
      const res = await fetch(apiUrl('/api/vendors?active=true'));
      if (!res.ok) throw new Error('Failed to load vendors');
      const data = await res.json();
      setVendors(data);
    } catch (err) {
      console.error('Error fetching vendors:', err);
      setStatusMsg({ type: 'error', message: 'Failed to load vendors' });
    }
  };

  const fetchColleges = async () => {
    try {
      const res = await fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=true'));
      if (!res.ok) throw new Error(`Failed to load colleges (${res.status})`);
      const data = await res.json();
      setColleges(data);
    } catch (err) {
      console.error('Error fetching colleges:', err);
      setStatusMsg({ type: 'error', message: 'Failed to load colleges list' });
    }
  };

  // HANDLERS
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (e) => {
    const { name, value } = e.target;
    setItemData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddItem = () => {
    if (!itemData.product || !itemData.quantity || Number(itemData.quantity) < 1) {
      setStatusMsg({ type: 'error', message: 'Please select a product and valid quantity.' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 2000);
      return;
    }

    // Check for duplicate in list
    if (addedItems.some(item => item.product === itemData.product)) {
      setStatusMsg({ type: 'error', message: 'This product is already in the list.' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 2000);
      return;
    }

    const productObj = products.find(p => p._id === itemData.product);

    const itemQty = Number(itemData.quantity);
    const itemPrice = Number(itemData.purchasePrice) || 0;
    const itemGst = Number(itemData.gstPercent) || 0;

    const newItem = {
      ...itemData,
      productName: productObj?.name || 'Unknown',
      quantity: itemQty,
      purchasePrice: itemPrice,
      gstPercent: itemGst,
      total: calcLineTotal(itemQty, itemPrice, itemGst),
    };

    setAddedItems([...addedItems, newItem]);
    setItemData({ product: '', quantity: '', purchasePrice: '', gstPercent: 0 });
  };

  const handleRemoveItem = (index) => {
    const newItems = [...addedItems];
    newItems.splice(index, 1);
    setAddedItems(newItems);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!canEdit) {
      setStatusMsg({ type: 'error', message: 'You do not have permission to add stock entries' });
      return;
    }

    if (!isSuperAdmin) {
      const userCollegeId = currentUser.assignedCollege
        ? (typeof currentUser.assignedCollege === 'object' ? currentUser.assignedCollege._id : currentUser.assignedCollege)
        : null;

      if (String(formData.targetLocation || '') !== String(userCollegeId || '')) {
        setStatusMsg({ type: 'error', message: 'You can only add stock to your assigned college.' });
        return;
      }
    }

    if (!formData.vendor) {
      setStatusMsg({ type: 'error', message: 'Vendor is required.' });
      return;
    }

    if (addedItems.length === 0) {
      setStatusMsg({ type: 'error', message: 'Please add at least one product to the list.' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        vendor: formData.vendor,
        invoiceNumber: formData.invoiceNumber || '',
        invoiceDate: formData.invoiceDate || new Date().toISOString(),
        remarks: formData.remarks || '',
        college: formData.targetLocation || null,
        createdBy: currentUser?.name || 'System',
        items: addedItems.map(i => ({
          product: i.product,
          quantity: i.quantity,
          purchasePrice: i.purchasePrice,
          gstPercent: i.gstPercent || 0,
        }))
      };

      const res = await fetch(apiUrl('/api/stock-entries'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to add stock');
      }

      // Success
      setStatusMsg({ type: 'success', message: 'Stock added successfully!' });

      // Clear Form
      setAddedItems([]);
      setFormData(prev => ({
        ...prev,
        invoiceNumber: '',
        remarks: '',
        invoiceDate: getTodayStr(),
        // Keep vendor and location as user might perform multiple entries from same source
      }));

      // Trigger Updates
      if (formData.targetLocation) {
        // Refetch college stock logic
        const targetId = formData.targetLocation;
        fetch(apiUrl(`/api/stock-transfers/colleges/${targetId}/stock`))
          .then(r => r.json())
          .then(data => {
            const map = {};
            (data.stock || []).forEach(item => {
              const pId = typeof item.product === 'object' ? item.product._id : item.product;
              map[pId] = item.quantity;
            });
            setCollegeStockMap(map);
          });
      }

      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } catch (err) {
      console.error('Error adding stock:', err);
      setStatusMsg({ type: 'error', message: err.message || 'Failed to add stock' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-md">
            <Plus size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Add Stock</h2>
            <p className="text-gray-600 text-sm mt-1">Record new stock entries into Central or College inventory</p>
          </div>
        </div>
      </div>

      {/* Status Message */}
      {statusMsg.message && (
        <div className={`mb-6 p-4 rounded-lg text-sm font-medium ${statusMsg.type === 'success'
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            {statusMsg.message}
          </div>
        </div>
      )}

      {/* Main Grid: Left (Invoice Info) | Right (Items) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Invoice Details */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FileText size={18} className="text-blue-500" /> Invoice Details
            </h3>

            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              {/* Target Location */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">Receive At</label>
                {isSuperAdmin ? (
                  <CustomSelect
                    value={formData.targetLocation}
                    onChange={(val) => setFormData(prev => ({ ...prev, targetLocation: val }))}
                    options={[
                      { value: '', label: 'Central Warehouse (Global)' },
                      ...colleges.map(college => ({
                        value: college._id,
                        label: college.name
                      }))
                    ]}
                    placeholder="Central Warehouse (Global)"
                    searchPlaceholder="Search location..."
                    icon={MapPin}
                  />
                ) : (
                  <div className="w-full pl-3 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 flex items-center gap-2 h-[38px]">
                    <Building2 size={16} className="text-blue-500" />
                    <span className="font-medium">
                      {formData.targetLocation === ''
                        ? 'Central Warehouse (Global)'
                        : (colleges.find(c => c._id === formData.targetLocation)?.name || 'Loading College...')}
                    </span>
                  </div>
                )}
              </div>

              {/* Vendor */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">Vendor <span className="text-red-500">*</span></label>
                <CustomSelect
                  value={formData.vendor}
                  onChange={(val) => setFormData(prev => ({ ...prev, vendor: val }))}
                  options={[
                    { value: '', label: 'Select Vendor' },
                    ...vendors.map(vendor => ({
                      value: vendor._id,
                      label: vendor.name,
                      subtext: vendor.contactPerson ? `Contact: ${vendor.contactPerson}` : null
                    }))
                  ]}
                  placeholder="Select Vendor"
                  searchPlaceholder="Search vendor..."
                  icon={Building2}
                />
              </div>

              {/* Invoice Number */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">Invoice Number</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    name="invoiceNumber"
                    value={formData.invoiceNumber}
                    onChange={handleInputChange}
                    placeholder="INV-001"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Date */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="date"
                    name="invoiceDate"
                    value={formData.invoiceDate}
                    onChange={handleInputChange}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">Remarks</label>
                <textarea
                  name="remarks"
                  value={formData.remarks}
                  onChange={handleInputChange}
                  rows="3"
                  className={textAreaCls}
                  placeholder="Optional notes..."
                ></textarea>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Add Items & List */}
        <div className="lg:col-span-2 space-y-6">
          {/* Add Item Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Package size={18} className="text-blue-500" /> Add Products
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              {/* Product Select */}
              <div className="md:col-span-5">
                <div className="flex items-center justify-between mb-1.5 h-5">
                  <label className="text-sm font-medium text-gray-800">Product</label>
                  {selectedProduct && (
                    <span className="text-xs text-blue-600 font-medium">
                      Current Stock: {getDisplayStock(selectedProduct._id)}
                    </span>
                  )}
                </div>
                <CustomSelect
                  value={itemData.product}
                  onChange={(val) => setItemData(prev => ({ ...prev, product: val }))}
                  options={[
                    { value: '', label: 'Select Product' },
                    ...products.map(p => ({
                      value: p._id,
                      label: p.name,
                      subtext: `Stock: ${getDisplayStock(p._id)}`
                    }))
                  ]}
                  placeholder="Select Product"
                  searchPlaceholder="Search product..."
                  icon={Package}
                />
              </div>

              {/* Quantity */}
              <div className="md:col-span-2">
                <div className="flex items-center mb-1.5 h-5">
                  <label className="text-sm font-medium text-gray-800">Qty</label>
                </div>
                <input
                  type="number"
                  name="quantity"
                  value={itemData.quantity}
                  onChange={handleItemChange}
                  min="1"
                  className={inputCls}
                  placeholder="0"
                />
              </div>

              {/* Price (excl. GST) */}
              <div className="md:col-span-2">
                <div className="flex items-center mb-1.5 h-5">
                  <label className="text-sm font-medium text-gray-800">Unit Price</label>
                </div>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input
                    type="number"
                    name="purchasePrice"
                    value={itemData.purchasePrice}
                    onChange={handleItemChange}
                    min="0"
                    step="0.01"
                    className={`${inputCls} pl-8`}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* GST % */}
              <div className="md:col-span-2">
                <div className="flex items-center mb-1.5 h-5">
                  <label className="text-sm font-medium text-gray-800">GST %</label>
                </div>
                <input
                  type="number"
                  name="gstPercent"
                  value={itemData.gstPercent}
                  onChange={handleItemChange}
                  min="0"
                  step="0.1"
                  className={inputCls}
                  placeholder="0"
                />
              </div>

              {/* Add Button */}
              <div className="md:col-span-1">
                <div className="mb-1.5 h-5 hidden md:block"></div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full h-[38px] bg-blue-50 text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-100 flex items-center justify-center transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Purchase and Vendor Section */}
          {selectedProduct ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 text-sm">
                      Purchase & Vendor Comparison
                    </h4>
                    <p className="text-xs text-gray-500">
                      Prices across vendors for <span className="font-semibold text-gray-800">{selectedProduct.name}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {formData.vendor && (
                    <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-md font-medium">
                      Current: {vendors.find(v => String(v._id) === String(formData.vendor))?.name || 'Selected Vendor'}
                    </span>
                  )}
                  {/* View Tabs */}
                  {purchaseHistory.length > 0 && (
                    <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setHistoryTab('vendors')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${historyTab === 'vendors' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        Vendor Comparison ({vendorComparison.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryTab('recent')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${historyTab === 'recent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        Recent Purchases ({purchaseHistory.length})
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {loadingHistory ? (
                <div className="py-8 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  Loading vendor purchase records...
                </div>
              ) : purchaseHistory.length === 0 ? (
                <div className="py-6 px-4 bg-gray-50 rounded-lg text-center text-xs text-gray-500">
                  <Package size={28} className="mx-auto text-gray-300 mb-2 opacity-60" />
                  <p className="font-medium text-gray-700">No previous purchase records found for this product.</p>
                  <p className="text-gray-400 mt-0.5">This entry will be recorded as the initial purchase price.</p>
                </div>
              ) : (
                <>
                  {/* Metrics Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Last Purchase Price */}
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-[11px] text-gray-500 font-medium">Previous Purchase Price</p>
                      <p className="text-lg font-bold text-gray-900 mt-0.5">
                        ₹{Number(purchaseMetrics.lastPrice).toFixed(2)}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5" title={purchaseMetrics.lastVendorName}>
                        from <span className="font-medium text-gray-700">{purchaseMetrics.lastVendorName}</span>
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {formatDisplayDate(purchaseMetrics.lastDate)}
                      </p>
                    </div>

                    {/* Current Price Difference */}
                    <div className={`p-3 rounded-lg border transition-colors ${
                      purchaseMetrics.diffWithLast === null
                        ? 'bg-gray-50 border-gray-200'
                        : purchaseMetrics.diffWithLast > 0
                        ? 'bg-amber-50/80 border-amber-200'
                        : purchaseMetrics.diffWithLast < 0
                        ? 'bg-green-50/80 border-green-200'
                        : 'bg-blue-50/80 border-blue-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-medium text-gray-600">Difference vs Last</p>
                        {purchaseMetrics.diffWithLast !== null && (
                          purchaseMetrics.diffWithLast > 0 ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                              Higher
                            </span>
                          ) : purchaseMetrics.diffWithLast < 0 ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                              Savings
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                              Matched
                            </span>
                          )
                        )}
                      </div>
                      {purchaseMetrics.diffWithLast === null ? (
                        <div className="mt-1.5">
                          <p className="text-xs text-gray-400 italic">Enter unit price above to see difference</p>
                        </div>
                      ) : purchaseMetrics.diffWithLast > 0 ? (
                        <div>
                          <p className="text-lg font-bold text-amber-700 mt-0.5 flex items-center gap-1">
                            <TrendingUp size={16} />
                            +₹{Math.abs(purchaseMetrics.diffWithLast).toFixed(2)}
                          </p>
                          <p className="text-[11px] font-medium text-amber-700 mt-0.5">
                            +{purchaseMetrics.diffPercent}% higher than previous
                          </p>
                        </div>
                      ) : purchaseMetrics.diffWithLast < 0 ? (
                        <div>
                          <p className="text-lg font-bold text-green-700 mt-0.5 flex items-center gap-1">
                            <TrendingDown size={16} />
                            -₹{Math.abs(purchaseMetrics.diffWithLast).toFixed(2)}
                          </p>
                          <p className="text-[11px] font-medium text-green-700 mt-0.5">
                            -{Math.abs(purchaseMetrics.diffPercent)}% cheaper (Savings)
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-lg font-bold text-blue-700 mt-0.5">₹0.00</p>
                          <p className="text-[11px] font-medium text-blue-700 mt-0.5">
                            Exact same price as last purchase
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Lowest Across Vendors */}
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-[11px] text-gray-500 font-medium">Lowest Price Recorded</p>
                      <p className="text-lg font-bold text-green-700 mt-0.5">
                        ₹{Number(purchaseMetrics.lowest).toFixed(2)}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5" title={purchaseMetrics.lowestVendorName}>
                        by <span className="font-medium text-gray-700">{purchaseMetrics.lowestVendorName}</span>
                      </p>
                      {itemData.purchasePrice && Number(itemData.purchasePrice) !== purchaseMetrics.lowest ? (
                        <button
                          type="button"
                          onClick={() => setItemData(prev => ({ ...prev, purchasePrice: purchaseMetrics.lowest }))}
                          className="mt-1 text-[10px] text-blue-600 hover:text-blue-800 font-medium underline"
                        >
                          Use this price
                        </button>
                      ) : null}
                    </div>

                    {/* Highest Across Vendors */}
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-[11px] text-gray-500 font-medium">Highest Price Recorded</p>
                      <p className="text-lg font-bold text-gray-800 mt-0.5">
                        ₹{Number(purchaseMetrics.highest).toFixed(2)}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5" title={purchaseMetrics.highestVendorName}>
                        by <span className="font-medium text-gray-700">{purchaseMetrics.highestVendorName}</span>
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Avg: ₹{Number(purchaseMetrics.avg).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Tab 1: Vendor Price Comparison */}
                  {historyTab === 'vendors' && (
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                      <div className="bg-gray-50/80 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">Vendor Price Comparison</span>
                        <span className="text-[11px] text-gray-500">{vendorComparison.length} vendor(s) supplied this product</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                            <tr>
                              <th className="px-4 py-2.5">Vendor</th>
                              <th className="px-4 py-2.5 text-right">Last Price</th>
                              <th className="px-4 py-2.5 text-center">Diff with Current</th>
                              <th className="px-4 py-2.5 text-right">Total Qty</th>
                              <th className="px-4 py-2.5 text-right">Last Date</th>
                              <th className="px-4 py-2.5 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-gray-700">
                            {vendorComparison.map((v) => {
                              const isCurrentVendor = formData.vendor && String(formData.vendor) === String(v.vendorId);
                              const currentPrice = Number(itemData.purchasePrice) || 0;
                              const diff = currentPrice > 0 ? (currentPrice - v.latestPrice) : null;
                              return (
                                <tr key={v.vendorId} className={`hover:bg-blue-50/30 ${isCurrentVendor ? 'bg-orange-50/40' : ''}`}>
                                  <td className="px-4 py-2.5 font-medium">
                                    <div className="flex items-center gap-1.5">
                                      <span>{v.vendorName}</span>
                                      {isCurrentVendor && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-100 text-orange-800 font-semibold">
                                          Current Selected
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                                    ₹{Number(v.latestPrice).toFixed(2)}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    {diff === null ? (
                                      <span className="text-gray-400">—</span>
                                    ) : diff > 0 ? (
                                      <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px]">
                                        +₹{diff.toFixed(2)}
                                      </span>
                                    ) : diff < 0 ? (
                                      <span className="inline-flex items-center gap-0.5 font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded text-[11px]">
                                        -₹{Math.abs(diff).toFixed(2)}
                                      </span>
                                    ) : (
                                      <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                                        Matched
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-medium text-gray-600">
                                    {v.totalQuantity}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-gray-500">
                                    {formatDisplayDate(v.latestDate)}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setItemData(prev => ({ ...prev, purchasePrice: v.latestPrice }))}
                                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors"
                                      title="Apply this vendor's price"
                                    >
                                      Apply
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

                  {/* Tab 2: Recent Purchases */}
                  {historyTab === 'recent' && (
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                      <div className="bg-gray-50/80 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">Recent Purchase Entries</span>
                        <span className="text-[11px] text-gray-500">Showing last {purchaseHistory.length} records</span>
                      </div>
                      <div className="overflow-x-auto max-h-64">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100 sticky top-0">
                            <tr>
                              <th className="px-4 py-2.5">Date</th>
                              <th className="px-4 py-2.5">Vendor</th>
                              <th className="px-4 py-2.5">Invoice #</th>
                              <th className="px-4 py-2.5 text-right">Quantity</th>
                              <th className="px-4 py-2.5 text-right">Unit Price</th>
                              <th className="px-4 py-2.5 text-right">GST %</th>
                              <th className="px-4 py-2.5 text-right">Total Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-gray-700">
                            {purchaseHistory.slice(0, 10).map((entry) => (
                              <tr key={entry._id} className="hover:bg-gray-50/80">
                                <td className="px-4 py-2.5 text-gray-600">
                                  {formatDisplayDate(entry.invoiceDate || entry.createdAt)}
                                </td>
                                <td className="px-4 py-2.5 font-medium text-gray-900">
                                  {entry.vendor?.name || 'Unknown'}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-gray-600">
                                  {entry.invoiceNumber || '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium text-blue-600">
                                  +{entry.quantity}
                                </td>
                                <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                                  ₹{Number(entry.purchasePrice || 0).toFixed(2)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-gray-600">
                                  {Number(entry.gstPercent) > 0 ? `${entry.gstPercent}%` : '0%'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                                  ₹{Number(entry.totalCost || 0).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="bg-blue-50/50 border border-dashed border-blue-200 rounded-xl p-3.5 text-center text-xs text-blue-700 flex items-center justify-center gap-2">
              <Building2 size={16} className="text-blue-500" />
              <span>Select a product in "Add Products" above to view previous vendor prices, price difference comparison, and recent purchase history.</span>
            </div>
          )}

          {/* Items List */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-800">Items ({addedItems.length})</h3>
              <span className="text-sm font-medium text-gray-600">
                Total: ₹{addedItems.reduce((acc, curr) => acc + curr.total, 0).toLocaleString()}
              </span>
            </div>

            {addedItems.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Package size={48} className="mx-auto text-gray-300 mb-3 opacity-50" />
                <p>No items added yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500">
                      <th className="px-6 py-3 font-medium">Product</th>
                      <th className="px-6 py-3 font-medium text-right">Qty</th>
                      <th className="px-6 py-3 font-medium text-right">Price</th>
                      <th className="px-6 py-3 font-medium text-right">GST %</th>
                      <th className="px-6 py-3 font-medium text-right">Total</th>
                      <th className="px-6 py-3 font-medium text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {addedItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-900 font-medium">{item.productName}</td>
                        <td className="px-6 py-3 text-right">{item.quantity}</td>
                        <td className="px-6 py-3 text-right">₹{item.purchasePrice}</td>
                        <td className="px-6 py-3 text-right">{item.gstPercent || 0}%</td>
                        <td className="px-6 py-3 text-right">₹{item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-3 text-center">
                          <button
                            onClick={() => handleRemoveItem(idx)}
                            className="text-red-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50 transition-colors"
                          >
                            <Plus size={18} className="rotate-45" /> {/* X icon via rotation */}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Submit Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || addedItems.length === 0}
                className={`px-6 py-2.5 rounded-lg flex items-center gap-2 text-white font-medium shadow-sm transition-all
                                ${loading || addedItems.length === 0
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95'
                  }`}
              >
                <Save size={18} />
                {loading ? 'Saving...' : 'Save Stock Entry'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


export default AddStock;
