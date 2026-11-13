import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, Package, ShoppingCart, DollarSign,
  AlertCircle, Activity, Calendar, ArrowRight,
  CreditCard, Wallet, FileText, BarChart3, X, Building2, PackageSearch, Search
} from 'lucide-react';
import { apiUrl } from '../utils/api';
import AbstractChartCard from '../components/AbstractChartCard';

const Dashboard = () => {
  // Get current user from localStorage
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  const isSuperAdmin = currentUser?.role === 'Administrator';
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStudents: 0,
    paidStudents: 0,
    unpaidStudents: 0,
    totalTransactions: 0,
    totalRevenue: 0,
    pendingRevenue: 0,
    totalProducts: 0,
    totalStockValue: 0,
    lowStockItems: 0,
    totalVendors: 0,
    todayTransactions: 0,
    todayRevenue: 0,
    todayCashRevenue: 0,
    todayOnlineRevenue: 0,
    zeroStockDuesStudents: 0,
    abstractChartData: null,
    latestTransactionDate: null,
  });
  const [zeroStockDuesData, setZeroStockDuesData] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [activeModal, setActiveModal] = useState(null); // 'products', 'stockValue', 'lowStock', 'vendors', 'zeroStock'
  const [zeroStockSearch, setZeroStockSearch] = useState('');
  const navigate = useNavigate();

  const [colleges, setColleges] = useState([]);
  const [selectedCollege, setSelectedCollege] = useState(''); // '' means Central/Global view

  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [abstractStartDate, setAbstractStartDate] = useState(getTodayString());
  const [abstractEndDate, setAbstractEndDate] = useState(getTodayString());
  const [abstractLoading, setAbstractLoading] = useState(false);
  const isFirstRender = useRef(true);

  // Load initial view preference for SubAdmins
  useEffect(() => {
    if (!isSuperAdmin && currentUser?.assignedCollege) {
      // Handle both ObjectId string or populated object
      setSelectedCollege(typeof currentUser.assignedCollege === 'object' ? currentUser.assignedCollege._id : currentUser.assignedCollege);
    }
  }, [isSuperAdmin, currentUser]);

  // Fetch Colleges
  useEffect(() => {
    const fetchColleges = async () => {
      try {
        const res = await fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=true'));
        if (!res.ok) throw new Error('Failed to load colleges');
        const data = await res.json();
        setColleges(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching colleges:', err);
      }
    };
    fetchColleges();
  }, []);

  const fetchStats = async (college = selectedCollege, start = abstractStartDate, end = abstractEndDate) => {
    try {
      const params = new URLSearchParams();
      if (college) params.append('collegeId', college);
      if (start) params.append('startDate', start);
      if (end) params.append('endDate', end);
      params.append('t', Date.now().toString());

      const res = await fetch(apiUrl(`/api/dashboard/stats?${params.toString()}`));
      if (!res.ok) throw new Error('Failed to fetch dashboard stats');

      const data = await res.json();
      setStats(data);
      if (data.zeroStockDuesData) setZeroStockDuesData(data.zeroStockDuesData);
      if (data.recentTransactions) setRecentTransactions(data.recentTransactions);
      return data;
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        await fetchStats(selectedCollege, abstractStartDate, abstractEndDate);

        // Fetch products and vendors (small lists)
        let productsData = [];
        if (selectedCollege) {
          const collegeStockRes = await fetch(apiUrl(`/api/stock-transfers/colleges/${selectedCollege}/stock?t=${Date.now()}`));
          if (collegeStockRes.ok) {
            const collegeJson = await collegeStockRes.json();
            productsData = (collegeJson.stock || [])
              .filter(item => item && item.product)
              .map(item => ({
                ...item.product,
                stock: item.quantity || 0,
              }));
          }
        } else {
          const productsRes = await fetch(apiUrl(`/api/products?t=${Date.now()}`));
          if (productsRes.ok) {
            productsData = await productsRes.json();
          }
        }
        setProducts(Array.isArray(productsData) ? productsData : []);

        const vendorsRes = await fetch(apiUrl(`/api/vendors?t=${Date.now()}`));
        if (vendorsRes.ok) setVendors(await vendorsRes.json());
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedCollege, colleges]);

  // Handle date range changes for the Daily Transaction Abstract card
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const updateAbstract = async () => {
      setAbstractLoading(true);
      await fetchStats(selectedCollege, abstractStartDate, abstractEndDate);
      setAbstractLoading(false);
    };
    updateAbstract();
  }, [abstractStartDate, abstractEndDate]);

  const formatCurrency = (amount) => {
    return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const safeProducts = Array.isArray(products) ? products : [];
  const safeColleges = Array.isArray(colleges) ? colleges : [];
  const safeZeroStockDues = Array.isArray(zeroStockDuesData) ? zeroStockDuesData : [];

  // Calculate low stock products
  const lowStockProducts = safeProducts.filter(product => {
    const threshold = typeof product?.lowStockThreshold === 'number' ? product.lowStockThreshold : 10;
    return (product?.stock || 0) < threshold;
  });

  // Calculate products with stock value
  const productsWithValue = safeProducts.map(product => ({
    ...product,
    stockValue: (product?.stock || 0) * (product?.price || 0),
  })).sort((a, b) => (b?.stockValue || 0) - (a?.stockValue || 0));

  const totalCalculatedStockValue = productsWithValue.reduce((sum, p) => sum + (p.stockValue || 0), 0);
  const displayStockValue = (typeof stats?.totalStockValue === 'number' && stats.totalStockValue > 0)
    ? stats.totalStockValue
    : totalCalculatedStockValue;

  // Filter zero stock dues
  const filteredZeroStockDues = safeZeroStockDues.filter(data => 
    data?.student?.name?.toLowerCase().includes((zeroStockSearch || '').toLowerCase()) ||
    data?.student?.studentId?.toLowerCase().includes((zeroStockSearch || '').toLowerCase()) ||
    data?.items?.some(item => typeof item === 'string' && item.toLowerCase().includes((zeroStockSearch || '').toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-background text-text-main p-4 sm:p-5">
      <div className="mx-auto">
        {/* Header */}
        <div className="mb-5 flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-main mb-1">Dashboard</h1>
            <p className="text-sm text-text-sub">Welcome to Stationery Management System</p>
          </div>

          {isSuperAdmin && (
            <div className="relative min-w-[250px]">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
              <select
                value={selectedCollege}
                onChange={(e) => setSelectedCollege(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-surface text-text-main border border-border rounded-lg shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none appearance-none cursor-pointer"
              >
                <option value="">Central Warehouse (Global)</option>
                {safeColleges.map(college => (
                  <option key={college._id} value={college._id}>
                    {college.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          )}
          {!isSuperAdmin && currentUser?.assignedCollege && (
            <div className="flex items-center gap-2 bg-primary-light border border-primary/20 rounded-lg px-4 py-2 shadow-sm">
              <Building2 className="text-primary" size={18} />
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">Campus:</span>
              <span className="text-sm font-bold text-text-main">
                {safeColleges.find(c => String(c._id) === String(typeof currentUser.assignedCollege === 'object' ? currentUser.assignedCollege?._id : currentUser.assignedCollege))?.name || 'Assigned Campus'}
              </span>
            </div>
          )}
        </div>

        {/* Secondary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
          {/* Total Products */}
          <div
            onClick={() => setActiveModal('products')}
            className="bg-surface rounded-xl p-3.5 sm:p-4 shadow-sm border border-border hover:shadow-md hover:border-primary/50 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Package size={18} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-text-main truncate">
                  {loading ? '...' : stats.totalProducts}
                </div>
                <div className="text-xs text-text-muted">Total Products</div>
              </div>
              <ArrowRight size={16} className="text-text-muted flex-shrink-0" />
            </div>
          </div>

          {/* Stock Value */}
          <div
            onClick={() => setActiveModal('stockValue')}
            className="bg-surface rounded-xl p-3.5 sm:p-4 shadow-sm border border-border hover:shadow-md hover:border-green-300 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <BarChart3 size={18} className="text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-text-main truncate">
                  {loading ? '...' : formatCurrency(displayStockValue)}
                </div>
                <div className="text-xs text-text-muted">Stock Value</div>
              </div>
              <ArrowRight size={16} className="text-text-muted flex-shrink-0" />
            </div>
          </div>

          {/* Low Stock Alert */}
          <div
            onClick={() => setActiveModal('lowStock')}
            className="bg-surface rounded-xl p-3.5 sm:p-4 shadow-sm border border-border hover:shadow-md hover:border-red-300 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertCircle size={18} className="text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-text-main truncate">
                  {loading ? '...' : stats.lowStockItems}
                </div>
                <div className="text-xs text-text-muted">Low Stock Items</div>
              </div>
              <ArrowRight size={16} className="text-text-muted flex-shrink-0" />
            </div>
          </div>

          {/* Zero-Stock Dues Card */}
          <div
            onClick={() => setActiveModal('zeroStock')}
            className="bg-surface rounded-xl p-3.5 sm:p-4 shadow-sm border border-border hover:shadow-md hover:border-orange-300 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <PackageSearch size={18} className="text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-text-main truncate">
                  {loading ? '...' : stats.zeroStockDuesStudents}
                </div>
                <div className="text-xs text-text-muted">Zero-Stock Dues</div>
              </div>
              <ArrowRight size={16} className="text-text-muted flex-shrink-0" />
            </div>
          </div>
        </div>

        {/* Daily Abstract & Recent Transactions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Daily Transaction Abstract */}
          <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl p-4 sm:p-5 shadow-md hover:shadow-lg transition-shadow">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3.5 gap-2.5">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Calendar size={16} className="text-white" />
                </div>
                <span>Daily Transaction Abstract</span>
              </h3>

              {/* Date Range Filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-black/20 px-2 py-1 rounded-lg backdrop-blur-sm border border-white/20">
                  <label className="text-[10px] text-teal-100 font-medium">From:</label>
                  <input
                    type="date"
                    value={abstractStartDate}
                    onChange={(e) => setAbstractStartDate(e.target.value)}
                    className="bg-white/95 text-gray-800 text-[11px] px-1.5 py-0.5 rounded outline-none focus:ring-2 focus:ring-teal-300 font-medium cursor-pointer shadow-sm"
                  />
                  <label className="text-[10px] text-teal-100 font-medium ml-1">To:</label>
                  <input
                    type="date"
                    value={abstractEndDate}
                    min={abstractStartDate}
                    onChange={(e) => setAbstractEndDate(e.target.value)}
                    className="bg-white/95 text-gray-800 text-[11px] px-1.5 py-0.5 rounded outline-none focus:ring-2 focus:ring-teal-300 font-medium cursor-pointer shadow-sm"
                  />
                  {(abstractStartDate !== getTodayString() || abstractEndDate !== getTodayString()) && (
                    <button
                      type="button"
                      onClick={() => {
                        setAbstractStartDate(getTodayString());
                        setAbstractEndDate(getTodayString());
                      }}
                      className="ml-1 text-[10px] bg-white/20 hover:bg-white/30 text-white px-1.5 py-0.5 rounded font-medium transition-colors"
                      title="Reset to Today"
                    >
                      Today
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-3 bg-white/20 rounded-lg backdrop-blur-sm">
                <div>
                  <p className="text-xs text-teal-100 mb-0.5">Transactions</p>
                  <p className="text-xl font-bold text-white">
                    {abstractLoading ? (
                      <span className="text-base opacity-80 animate-pulse">...</span>
                    ) : (
                      stats.todayTransactions
                    )}
                  </p>
                </div>
                <div className="w-9 h-9 bg-white/30 rounded-lg flex items-center justify-center">
                  <ShoppingCart size={18} className="text-white" />
                </div>
              </div>
              <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs text-teal-100 mb-0.5">
                      {abstractStartDate === abstractEndDate && abstractStartDate === getTodayString()
                        ? "Today's Revenue"
                        : "Revenue"}
                    </p>
                    <p className="text-xl font-bold text-white">
                      {abstractLoading ? (
                        <span className="text-base opacity-80 animate-pulse">...</span>
                      ) : (
                        formatCurrency(stats.todayRevenue)
                      )}
                    </p>
                  </div>
                  <div className="w-9 h-9 bg-white/30 rounded-lg flex items-center justify-center">
                    <DollarSign size={18} className="text-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-white/20 rounded-md">
                      <Wallet size={12} className="text-white" />
                    </div>
                    <div>
                      <p className="text-[9px] text-teal-100 uppercase font-semibold">Cash</p>
                      <p className="text-xs font-bold text-white">
                        {abstractLoading ? '...' : formatCurrency(stats.todayCashRevenue)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-white/20 rounded-md">
                      <CreditCard size={12} className="text-white" />
                    </div>
                    <div>
                      <p className="text-[9px] text-teal-100 uppercase font-semibold">Online</p>
                      <p className="text-xs font-bold text-white">
                        {abstractLoading ? '...' : formatCurrency(stats.todayOnlineRevenue)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Abstract Graphical Analytics Chart Card */}
          <AbstractChartCard
            abstractChartData={stats.abstractChartData}
            loading={abstractLoading}
            startDate={stats.abstractChartData?.startDate || abstractStartDate}
            endDate={stats.abstractChartData?.endDate || abstractEndDate}
            totalRevenue={stats.abstractChartData?.paymentBreakdown?.totalRevenue ?? stats.todayRevenue}
            cashRevenue={stats.abstractChartData?.paymentBreakdown?.cashAmount ?? stats.todayCashRevenue}
            onlineRevenue={stats.abstractChartData?.paymentBreakdown?.onlineAmount ?? stats.todayOnlineRevenue}
            transactionsCount={stats.abstractChartData?.paymentBreakdown?.totalTransactions ?? stats.todayTransactions}
            latestTransactionDate={stats.latestTransactionDate}
            onSelectDate={(newDate) => {
              setAbstractStartDate(newDate);
              setAbstractEndDate(newDate);
            }}
            formatCurrency={formatCurrency}
          />
        </div>

        {/* Recent Transactions */}
        <div className="mb-4">
          {/* Recent Transactions List */}
          <div className="bg-gradient-to-br from-[#465efb] to-[#355cf7] rounded-xl shadow-md hover:shadow-lg transition-shadow">
            <div className="p-3.5 px-4 border-b border-white/20 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  <Activity size={16} className="text-white" />
                </div>
                Recent Transactions
              </h3>
              <button
                onClick={() => navigate('/transactions')}
                className="text-xs text-white hover:text-indigo-100 font-medium flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg transition-colors"
              >
                View All
                <ArrowRight size={12} />
              </button>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="text-center py-6">
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
                </div>
              ) : recentTransactions.length > 0 ? (
                <div className="space-y-2">
                  {recentTransactions.map((transaction) => (
                    <div
                      key={transaction._id}
                      className="flex items-center justify-between p-2.5 px-3 bg-white/20 rounded-lg hover:bg-white/30 transition-colors cursor-pointer backdrop-blur-sm"
                      onClick={() => navigate('/transactions')}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="text-sm font-semibold text-white truncate">{transaction.student?.name || 'N/A'}</p>
                        <p className="text-xs text-indigo-100">
                          {transaction.student?.course?.toUpperCase()} • {formatDate(transaction.transactionDate)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-white">{formatCurrency(transaction.totalAmount)}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${transaction.isPaid
                          ? 'bg-green-400/30 text-green-100 border border-green-300/50'
                          : 'bg-red-400/30 text-red-100 border border-red-300/50'
                          }`}>
                          {transaction.isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <FileText className="w-8 h-8 text-white/50 mx-auto mb-1.5" />
                  <p className="text-xs text-indigo-100">No recent transactions</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {/* Zero-Stock Dues Modal */}
      {activeModal === 'zeroStock' && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <PackageSearch size={20} className="text-orange-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Zero-Stock Pending Dues</h2>
                  <p className="text-sm text-gray-500">{safeZeroStockDues.length} students waiting for items</p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search by student or item..."
                    value={zeroStockSearch}
                    onChange={(e) => setZeroStockSearch(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                  />
                </div>
                <button
                  onClick={() => setActiveModal(null)}
                  className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                >
                  <X size={18} className="text-gray-600" />
                </button>
              </div>
            </div>
            <div className="p-6">
              {filteredZeroStockDues.length === 0 ? (
                <div className="text-center py-12">
                  <PackageSearch className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">
                    {safeZeroStockDues.length === 0 ? "No pending dues due to zero stock!" : "No matching results found!"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredZeroStockDues.map((data, idx) => (
                    <div
                      key={idx}
                      className="p-4 border border-gray-200 rounded-lg hover:border-orange-300 transition-colors cursor-pointer"
                      onClick={() => navigate(`/student/${data.studentId}`)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-gray-900">{data.student?.name}</h3>
                          <p className="text-xs text-gray-500 uppercase tracking-wider">
                            {data.student?.studentId} • {data.student?.course} {data.student?.branch ? `(${data.student.branch})` : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Paid on {formatDate(data.transactionDate)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {data.items.map((itemName, i) => (
                          <span key={i} className="px-2 py-1 bg-orange-50 text-orange-700 text-xs font-semibold rounded border border-orange-100">
                            {itemName}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-end text-orange-600 text-xs font-bold gap-1">
                        View Details <ArrowRight size={12} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Products Modal */}
      {activeModal === 'products' && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Package size={20} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">All Products</h2>
                  <p className="text-sm text-gray-500">Total: {products.length} products</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
            <div className="p-6">
              {products.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No products found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {products.map((product) => (
                    <div key={product._id} className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">{product.name}</h3>
                        <span className={`px-2 py-1 text-xs rounded-full ${(product.stock || 0) < (product.lowStockThreshold || 10)
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                          }`}>
                          Stock: {product.stock || 0}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>Price: {formatCurrency(product.price)}</p>
                        <p>Value: {formatCurrency((product.stock || 0) * (product.price || 0))}</p>
                        {product.forCourse && <p>Course: {product.forCourse}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stock Value Modal */}
      {activeModal === 'stockValue' && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <BarChart3 size={20} className="text-green-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Stock Value Breakdown</h2>
                  <p className="text-sm text-gray-500">Total Value: {formatCurrency(displayStockValue)}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
            <div className="p-6">
              {productsWithValue.length === 0 ? (
                <div className="text-center py-12">
                  <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No products found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {productsWithValue.map((product) => (
                        <tr key={product._id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{product.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">{product.stock || 0}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(product.price || 0)}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{formatCurrency(product.stockValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">Total Stock Value:</td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{formatCurrency(displayStockValue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Low Stock Items Modal */}
      {activeModal === 'lowStock' && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertCircle size={20} className="text-red-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Low Stock Items</h2>
                  <p className="text-sm text-gray-500">{lowStockProducts.length} items need restocking</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
            <div className="p-6">
              {lowStockProducts.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">All products are well stocked!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Threshold</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {lowStockProducts.map((product) => {
                        const threshold = typeof product.lowStockThreshold === 'number' ? product.lowStockThreshold : 10;
                        const stock = product.stock || 0;
                        const isOutOfStock = stock === 0;
                        return (
                          <tr key={product._id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{product.name}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`font-semibold ${isOutOfStock ? 'text-red-600' : 'text-orange-600'}`}>
                                {stock}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 text-right">{threshold}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(product.price || 0)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isOutOfStock
                                ? 'bg-red-100 text-red-800'
                                : 'bg-orange-100 text-orange-800'
                                }`}>
                                {isOutOfStock ? 'Out of Stock' : 'Low Stock'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Vendors Modal */}
      {activeModal === 'vendors' && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <GraduationCap size={20} className="text-purple-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">All Vendors</h2>
                  <p className="text-sm text-gray-500">Total: {vendors.length} vendors</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
            <div className="p-6">
              {vendors.length === 0 ? (
                <div className="text-center py-12">
                  <GraduationCap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No vendors found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vendors.map((vendor) => (
                    <div key={vendor._id} className="p-4 border border-gray-200 rounded-lg hover:border-purple-300 transition-colors">
                      <h3 className="font-semibold text-gray-900 mb-2">{vendor.name}</h3>
                      <div className="text-sm text-gray-600 space-y-1">
                        {vendor.email && <p>Email: {vendor.email}</p>}
                        {vendor.phone && <p>Phone: {vendor.phone}</p>}
                        {vendor.address && <p>Address: {vendor.address}</p>}
                        {vendor.contactPerson && <p>Contact: {vendor.contactPerson}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
