const crypto = require('crypto');
const { SubAdmin } = require('../models/subAdminModel');

const CRM_AUTH_URL = process.env.CRM_AUTH_URL || 'https://crm.pydah.edu.in';
const JWT_SECRET = process.env.JWT_SECRET || 'stationary-secret-key';

// Helper for making HTTP POST requests with 10s timeout
const makePostRequest = async (url, data, timeoutMs = 10000) => {
  if (typeof fetch === 'function') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Stationary-Backend/1.0'
        },
        body: JSON.stringify(data),
        signal: controller.signal
      });
      clearTimeout(timer);
      const json = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data: json };
    } catch (err) {
      clearTimeout(timer);
      return { 
        ok: false, 
        status: err.name === 'AbortError' ? 504 : 502, 
        error: err.name === 'AbortError' ? `Request timed out after ${timeoutMs}ms` : err.message 
      };
    }
  }

  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? require('https') : require('http');
    const payload = JSON.stringify(data);
    let resolved = false;

    const req = lib.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Stationary-Backend/1.0',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: timeoutMs
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (resolved) return;
        resolved = true;
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, data: null, error: 'Invalid JSON response from CRM' });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, status: 504, error: `CRM Gateway request timed out after ${timeoutMs}ms` });
      }
    });

    req.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, status: 502, error: err.message });
      }
    });

    req.write(payload);
    req.end();
  });
};

// Generate standard RFC 7519 HMAC-SHA256 JWT
const generateJwtToken = (payload, expiresInSeconds = 28800) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };

  const base64UrlEncode = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(fullPayload);
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

/**
 * Handle SSO Login from CRM
 * POST /api/auth/sso-login
 */
const ssoLogin = async (req, res) => {
  const reqStart = Date.now();
  console.log('----------------------------------------------------');
  console.log('[SSO Backend] 📥 New SSO Login request received at', new Date().toISOString());

  try {
    const { token } = req.body;

    if (!token) {
      console.warn('[SSO Backend] ❌ [STATIONARY BAD REQUEST] No SSO token provided in request body');
      return res.status(400).json({
        success: false,
        origin: 'STATIONARY_BAD_REQUEST',
        message: 'SSO Token is required'
      });
    }

    console.log('[SSO Backend] Token received (length:', token.length, ')');

    // 1. Verify encrypted SSO token with CRM Central Gateway
    const verifyPayload = { encryptedToken: token, token };
    let verifyUrl = `${CRM_AUTH_URL}/auth/verify-token`;
    console.log('[SSO Backend] 🌐 Calling CRM Auth Gateway at:', verifyUrl);

    let crmResponse = await makePostRequest(verifyUrl, verifyPayload);

    // Fallback if CRM auth is mounted at /api/auth/verify-token
    if (!crmResponse.ok && (crmResponse.status === 404 || crmResponse.status === 405)) {
      const altUrl = `${CRM_AUTH_URL}/api/auth/verify-token`;
      console.log(`[SSO Backend] ${verifyUrl} returned ${crmResponse.status}. Trying alternate:`, altUrl);
      const altResponse = await makePostRequest(altUrl, verifyPayload);
      if (altResponse.ok || (altResponse.status !== 404 && altResponse.status !== 405)) {
        verifyUrl = altUrl;
        crmResponse = altResponse;
      }
    }

    console.log('[SSO Backend] 📡 CRM Gateway Response:', {
      url: verifyUrl,
      status: crmResponse?.status,
      ok: crmResponse?.ok,
      error: crmResponse?.error,
      valid: crmResponse?.data?.valid,
      message: crmResponse?.data?.message,
      durationMs: Date.now() - reqStart
    });

    if (!crmResponse.ok) {
      console.error(`[SSO Backend] ❌ [CRM SIDE ISSUE] CRM Auth Gateway failed with status ${crmResponse.status}:`, crmResponse.error || crmResponse.data);
      return res.status(crmResponse.status || 502).json({
        success: false,
        origin: 'CRM_SIDE_GATEWAY_ERROR',
        message: `CRM Central Gateway failed (${crmResponse.status}): ${crmResponse.error || crmResponse.data?.message || 'Gateway unreachable'}`,
        crmStatus: crmResponse.status,
        crmResponse: crmResponse.data
      });
    }

    if (!crmResponse.data || !crmResponse.data.valid) {
      const crmMsg = crmResponse.data?.message || 'Invalid or expired SSO token';
      console.warn(`[SSO Backend] ❌ [CRM SIDE ISSUE] CRM Gateway rejected the SSO token: "${crmMsg}"`);
      return res.status(401).json({
        success: false,
        origin: 'CRM_SIDE_INVALID_TOKEN',
        message: crmMsg,
        crmStatus: crmResponse?.status,
        crmResponse: crmResponse?.data
      });
    }

    const ssoUser = crmResponse.data.data || crmResponse.data.user || crmResponse.data;
    console.log('[SSO Backend] ✅ [CRM OK] Validated CRM user:', {
      userId: ssoUser.userId || ssoUser._id,
      name: ssoUser.name || ssoUser.username,
      empNo: ssoUser.empNo,
      role: ssoUser.role,
      assignedCollege: ssoUser.assignedCollege
    });

    // 2. Resolve or synchronize SubAdmin in Stationary MongoDB
    console.log('[SSO Backend] 🔍 Synchronizing with Stationary MongoDB...');
    let subAdmin = null;

    // A. Match by SubAdmin MongoDB _id
    if (ssoUser.userId) {
      try {
        subAdmin = await SubAdmin.findById(ssoUser.userId);
        if (subAdmin) console.log('[SSO Backend] Matched SubAdmin by _id:', subAdmin._id);
      } catch (_) {}
    }

    // B. Match by empNo (Foreign key from HRMS)
    if (!subAdmin && ssoUser.empNo) {
      subAdmin = await SubAdmin.findOne({ empNo: String(ssoUser.empNo).trim() });
      if (subAdmin) console.log('[SSO Backend] Matched SubAdmin by empNo:', subAdmin.empNo);
    }

    // C. Match by name / login ID
    if (!subAdmin && (ssoUser.name || ssoUser.username)) {
      const matchName = String(ssoUser.name || ssoUser.username).trim();
      const escaped = matchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      subAdmin = await SubAdmin.findOne({ name: { $regex: `^${escaped}$`, $options: 'i' } });
      if (subAdmin) console.log('[SSO Backend] Matched SubAdmin by username/name:', subAdmin.name);
    }

    // D. Auto-provision SubAdmin if authorized from HRMS/CRM but not yet created in Stationary DB
    if (!subAdmin) {
      const assignedName = String(ssoUser.name || ssoUser.username || (ssoUser.empNo ? `emp_${ssoUser.empNo}` : 'sso_user')).trim();
      console.log('[SSO Backend] User not found in Stationary DB. Provisioning new SubAdmin record:', assignedName);
      
      subAdmin = new SubAdmin({
        name: assignedName,
        empNo: ssoUser.empNo ? String(ssoUser.empNo).trim() : null,
        password: `sso_${Date.now()}_${Math.random().toString(36).substring(7)}`, // Hashed by subAdminSchema pre-save hook
        role: 'Editor', // Use internal Stationary role (never external CRM role)
        permissions: ['dashboard:view'], // Grant basic dashboard view
        assignedCollege: ssoUser.assignedCollege || null,
        assignedBranch: ssoUser.assignedBranch || null
      });
      await subAdmin.save();
      console.log('[SSO Backend] ✅ Created new SubAdmin:', subAdmin._id, 'with role: Editor');
    } else {
      console.log('[SSO Backend] Updating existing SubAdmin:', subAdmin._id, 'current role:', subAdmin.role);
      let modified = false;
      if (!subAdmin.empNo && ssoUser.empNo) {
        subAdmin.empNo = String(ssoUser.empNo).trim();
        modified = true;
      }
      // Sanitize legacy 'faculty' or empty role to internal 'Editor'
      if (!subAdmin.role || subAdmin.role === 'faculty' || subAdmin.role.toLowerCase() === 'faculty') {
        console.log(`[SSO Backend] Normalizing role from "${subAdmin.role}" to "Editor"`);
        subAdmin.role = 'Editor';
        modified = true;
      }
      if (ssoUser.assignedCollege && !subAdmin.assignedCollege) {
        subAdmin.assignedCollege = ssoUser.assignedCollege;
        modified = true;
      }
      if (modified) {
        await subAdmin.save();
        console.log('[SSO Backend] SubAdmin record updated and saved.');
      }
    }

    await subAdmin.populate('assignedCollege', 'name');

    // 3. Generate Stationary Application JWT token
    const localToken = generateJwtToken({
      id: subAdmin._id,
      name: subAdmin.name,
      empNo: subAdmin.empNo,
      role: subAdmin.role,
      permissions: subAdmin.permissions,
      assignedCollege: subAdmin.assignedCollege
    });

    console.log('[SSO Backend] 🎉 [SUCCESS] SSO Login complete in', Date.now() - reqStart, 'ms. Returning 200 OK.');
    console.log('----------------------------------------------------');

    return res.status(200).json({
      success: true,
      message: 'SSO Login successful',
      token: localToken,
      user: {
        id: subAdmin._id,
        _id: subAdmin._id,
        name: subAdmin.name,
        empNo: subAdmin.empNo,
        role: subAdmin.role,
        permissions: subAdmin.permissions || [],
        assignedCollege: subAdmin.assignedCollege,
        assignedBranch: subAdmin.assignedCollege || subAdmin.assignedBranch
      }
    });

  } catch (error) {
    console.error('[SSO Backend] ❌ [STATIONARY SIDE ISSUE] Internal error during SSO Login:', error);
    console.log('----------------------------------------------------');
    return res.status(500).json({
      success: false,
      origin: 'STATIONARY_INTERNAL_ERROR',
      message: `Stationary Server Error: ${error.message}`
    });
  }
};

/**
 * Handle Logout notification
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

module.exports = {
  ssoLogin,
  logout
};
