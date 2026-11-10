import { useEffect, useState } from 'react';
import { Save, Settings as SettingsIcon, ChevronDown, ChevronUp, Receipt, GraduationCap, Monitor } from 'lucide-react';
import { apiUrl } from '../utils/api';
import { removeStoredItem } from '../utils/storage';

// Helper to invalidate config cache so other components fetch fresh data
const invalidateConfigCache = () => {
  removeStoredItem('configCache');
  removeStoredItem('configCacheTimestamp');
};

const defaultSettings = {
  appName: 'PYDAH COLLEGE OF ENGINEERING',
  appSubheader: 'Stationery Management System',
  receiptHeader: 'PYDAH COLLEGE OF ENGINEERING',
  receiptSubheader: 'Stationery Management System',
};

const Settings = () => {
  const [config, setConfig] = useState(null);
  const [appForm, setAppForm] = useState({
    appName: defaultSettings.appName,
    appSubheader: defaultSettings.appSubheader,
  });
  const [receiptForm, setReceiptForm] = useState({
    receiptHeader: defaultSettings.receiptHeader,
    receiptSubheader: defaultSettings.receiptSubheader,
  });
  const [courseForms, setCourseForms] = useState({});
  const [expandedCourses, setExpandedCourses] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        // Fetch global settings and academic config
        const [settingsRes, configRes] = await Promise.all([
          fetch(apiUrl('/api/settings')),
          fetch(apiUrl('/api/config/academic'))
        ]);

        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (isMounted) {
            // App branding settings
            setAppForm({
              appName: settingsData.appName || settingsData.receiptHeader || defaultSettings.appName,
              appSubheader: settingsData.appSubheader || settingsData.receiptSubheader || defaultSettings.appSubheader,
            });
            // Receipt settings
            setReceiptForm({
              receiptHeader: settingsData.receiptHeader || defaultSettings.receiptHeader,
              receiptSubheader: settingsData.receiptSubheader || defaultSettings.receiptSubheader,
            });
          }
        }

        if (configRes.ok) {
          const configData = await configRes.json();
          if (isMounted) {
            setConfig(configData);
            // Initialize course forms with their receipt headers
            const forms = {};
            if (configData.courses && Array.isArray(configData.courses)) {
              configData.courses.forEach(course => {
                const courseId = course._id || course.name || String(course);
                if (courseId) {
                  forms[courseId] = {
                    receiptHeader: course.receiptHeader || '',
                    receiptSubheader: course.receiptSubheader || '',
                  };
                }
              });
            }
            setCourseForms(forms);
          }
        }
      } catch (error) {
        console.warn('Failed to load settings:', error.message || error);
        if (isMounted) {
          setFeedback({ type: 'error', message: 'Could not load current settings. Please try again later.' });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAppChange = (evt) => {
    const { name, value } = evt.target;
    setAppForm(prev => ({ ...prev, [name]: value }));
  };

  const handleReceiptChange = (evt) => {
    const { name, value } = evt.target;
    setReceiptForm(prev => ({ ...prev, [name]: value }));
  };

  const handleCourseChange = (courseId, evt) => {
    const { name, value } = evt.target;
    setCourseForms(prev => ({
      ...prev,
      [courseId]: {
        ...prev[courseId],
        [name]: value,
      },
    }));
  };

  const toggleCourseExpand = (courseId) => {
    setExpandedCourses(prev => ({
      ...prev,
      [courseId]: !prev[courseId],
    }));
  };

  const handleAppSubmit = async (evt) => {
    evt.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch(apiUrl('/api/settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName: appForm.appName,
          appSubheader: appForm.appSubheader,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update settings');
      }

      const data = await response.json();
      setAppForm({
        appName: data.appName || data.receiptHeader || defaultSettings.appName,
        appSubheader: data.appSubheader || data.receiptSubheader || defaultSettings.appSubheader,
      });
      setFeedback({ type: 'success', message: 'Application branding updated successfully.' });
    } catch (error) {
      console.error('Error updating settings:', error);
      setFeedback({ type: 'error', message: error.message || 'Failed to update settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReceiptSubmit = async (evt) => {
    evt.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch(apiUrl('/api/settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptHeader: receiptForm.receiptHeader,
          receiptSubheader: receiptForm.receiptSubheader,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update settings');
      }

      const data = await response.json();
      setReceiptForm({
        receiptHeader: data.receiptHeader || defaultSettings.receiptHeader,
        receiptSubheader: data.receiptSubheader || defaultSettings.receiptSubheader,
      });
      
      // Clear config cache so other pages fetch fresh data
      invalidateConfigCache();
      
      setFeedback({ type: 'success', message: 'Receipt settings updated successfully.' });
    } catch (error) {
      console.error('Error updating settings:', error);
      setFeedback({ type: 'error', message: error.message || 'Failed to update settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCourseSubmit = async (courseId, evt) => {
    evt.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const courseForm = courseForms[courseId];
      if (!config || !config.courses) {
        throw new Error('Course configuration not loaded');
      }

      // Update the course in the config
      const updatedCourses = config.courses.map(course => {
        const id = course._id || course.name;
        if (String(id) === String(courseId)) {
          return {
            ...course,
            receiptHeader: courseForm.receiptHeader || '',
            receiptSubheader: courseForm.receiptSubheader || '',
          };
        }
        return course;
      });

      const response = await fetch(apiUrl('/api/config/academic'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courses: updatedCourses }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update course settings');
      }

      const data = await response.json();
      setConfig(data);
      
      // Update courseForms with the saved data to reflect changes immediately
      if (data.courses && Array.isArray(data.courses)) {
        const updatedForms = {};
        data.courses.forEach(course => {
          const id = course._id || course.name || String(course);
          if (id) {
            updatedForms[id] = {
              receiptHeader: course.receiptHeader || '',
              receiptSubheader: course.receiptSubheader || '',
            };
          }
        });
        setCourseForms(updatedForms);
      }
      
      // Clear config cache so other pages fetch fresh data
      invalidateConfigCache();
      
      setFeedback({ type: 'success', message: 'Course receipt settings updated successfully.' });
    } catch (error) {
      console.error('Error updating course settings:', error);
      setFeedback({ type: 'error', message: error.message || 'Failed to update course settings.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-text-main p-6">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-main p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
            <SettingsIcon className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Application Settings</h1>
            <p className="text-gray-600 mt-1">Configure application branding and receipt headers</p>
          </div>
        </div>

        {/* Application Branding Settings */}
        <form onSubmit={handleAppSubmit} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Monitor className="text-indigo-600" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Application Branding</h2>
                <p className="text-sm text-gray-600">Used on HomePage, Login, and throughout the application</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label htmlFor="appName" className="block text-sm font-semibold text-gray-700">
                  Application Name
                </label>
                <input
                  id="appName"
                  name="appName"
                  type="text"
                  value={appForm.appName}
                  onChange={handleAppChange}
                  maxLength={120}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  placeholder="e.g., PYDAH COLLEGE OF ENGINEERING"
                  required
                />
                <p className="text-xs text-gray-500">Main title displayed on HomePage and Login</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="appSubheader" className="block text-sm font-semibold text-gray-700">
                  Application Subheader
                </label>
                <input
                  id="appSubheader"
                  name="appSubheader"
                  type="text"
                  value={appForm.appSubheader}
                  onChange={handleAppChange}
                  maxLength={160}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  placeholder="e.g., Stationery Management System"
                />
                <p className="text-xs text-gray-500">Optional subtitle below the app name</p>
              </div>
            </div>

            {feedback && feedback.message.includes('Application') && (
              <div
                className={`px-4 py-3 rounded-lg text-sm font-medium border ${
                  feedback.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {feedback.message}
              </div>
            )}

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save App Settings'}
              </button>
            </div>
          </div>
        </form>

        {/* Receipt Settings */}
        <form onSubmit={handleReceiptSubmit} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Receipt className="text-blue-600" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Global Receipt Settings</h2>
                <p className="text-sm text-gray-600">Default headers used on receipts and PDF reports</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label htmlFor="receiptHeader" className="block text-sm font-semibold text-gray-700">
                  Receipt Header
                </label>
                <input
                  id="receiptHeader"
                  name="receiptHeader"
                  type="text"
                  value={receiptForm.receiptHeader}
                  onChange={handleReceiptChange}
                  maxLength={120}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="e.g., PYDAH COLLEGE OF ENGINEERING"
                  required
                />
                <p className="text-xs text-gray-500">Main title displayed on all receipts</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="receiptSubheader" className="block text-sm font-semibold text-gray-700">
                  Receipt Subheader
                </label>
                <input
                  id="receiptSubheader"
                  name="receiptSubheader"
                  type="text"
                  value={receiptForm.receiptSubheader}
                  onChange={handleReceiptChange}
                  maxLength={160}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="e.g., Stationery Management System"
                />
                <p className="text-xs text-gray-500">Optional subtitle below the header</p>
              </div>
            </div>

            {feedback && feedback.message.includes('Receipt') && (
              <div
                className={`px-4 py-3 rounded-lg text-sm font-medium border ${
                  feedback.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {feedback.message}
              </div>
            )}

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Receipt Settings'}
              </button>
            </div>
          </div>
        </form>

        {/* Course-Specific Settings */}
        {config && config.courses && config.courses.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <GraduationCap className="text-purple-600" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Course-Specific Settings</h2>
                  <p className="text-sm text-gray-600">Override global settings for specific courses</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-3">
              {config.courses.map(course => {
                const courseId = course._id || course.name || String(course);
                const isExpanded = expandedCourses[courseId];
                const courseForm = courseForms[courseId] || { receiptHeader: '', receiptSubheader: '' };
                const hasCustomSettings = (courseForm.receiptHeader && courseForm.receiptHeader.trim()) || (courseForm.receiptSubheader && courseForm.receiptSubheader.trim());
                const courseDisplayName = course.displayName || course.name || 'Unnamed Course';

                return (
                  <div key={courseId} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50">
                    <button
                      type="button"
                      onClick={() => toggleCourseExpand(courseId)}
                      className="w-full px-4 py-3 hover:bg-gray-100 transition-colors flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${hasCustomSettings ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <div className="text-left">
                          <span className="font-semibold text-gray-900 group-hover:text-purple-600 transition-colors">
                            {courseDisplayName}
                          </span>
                          {hasCustomSettings && (
                            <span className="ml-2 text-xs text-green-600 font-medium">(Custom)</span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp size={18} className="text-gray-400 group-hover:text-purple-600 transition-colors" />
                      ) : (
                        <ChevronDown size={18} className="text-gray-400 group-hover:text-purple-600 transition-colors" />
                      )}
                    </button>

                    {isExpanded && (
                      <form onSubmit={(e) => handleCourseSubmit(courseId, e)} className="p-5 space-y-4 bg-white border-t border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-700">
                              Receipt Header
                            </label>
                            <input
                              name="receiptHeader"
                              type="text"
                              value={courseForm.receiptHeader}
                              onChange={(e) => handleCourseChange(courseId, e)}
                              maxLength={120}
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                              placeholder="Leave empty for global"
                            />
                            <p className="text-xs text-gray-500">Uses global if empty</p>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-700">
                              Receipt Subheader
                            </label>
                            <input
                              name="receiptSubheader"
                              type="text"
                              value={courseForm.receiptSubheader}
                              onChange={(e) => handleCourseChange(courseId, e)}
                              maxLength={160}
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                              placeholder="Leave empty for global"
                            />
                            <p className="text-xs text-gray-500">Uses global if empty</p>
                          </div>
                        </div>

                        {feedback && feedback.message.includes('Course') && (
                          <div
                            className={`px-4 py-3 rounded-lg text-sm font-medium border ${
                              feedback.type === 'success'
                                ? 'bg-green-50 border-green-200 text-green-700'
                                : 'bg-red-50 border-red-200 text-red-700'
                            }`}
                          >
                            {feedback.message}
                          </div>
                        )}

                        <div className="flex items-center justify-end pt-2">
                          <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                          >
                            <Save size={14} />
                            {saving ? 'Saving...' : 'Save Settings'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;

