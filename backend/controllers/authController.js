const crypto = require('crypto');
const { SubAdmin } = require('../models/subAdminModel');

const CRM_AUTH_URL = process.env.CRM_AUTH_URL || 'https://crm.pydah.edu.in';
const JWT_SECRET = process.env.JWT_SECRET || 'stationary-secret-key';

// Helper for making HTTP POST requests with native fetch or https fallback
const makePostRequest = async (url, data) => {
  if (typeof fetch === 'function') {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Stationary-Backend/1.0'
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data: json };
  }

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? require('https') : require('http');
    const payload = JSON.stringify(data);
    const req = lib.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Stationary-Backend/1.0',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, data: null });
        }
      });
    });
    req.on('error', reject);
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
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'SSO Token is required'
      });
    }

    // 1. Verify encrypted SSO token with CRM Central Gateway
    const verifyPayload = { encryptedToken: token, token };
    // In CRM, auth routes are mounted under /auth/ (e.g., /auth/verify-token, /auth/switch-portal)
    let verifyUrl = `${CRM_AUTH_URL}/auth/verify-token`;
    let crmResponse;
    try {
      crmResponse = await makePostRequest(verifyUrl, verifyPayload);
      // If /auth/verify-token returned 404 or 405, fallback to /api/auth/verify-token
      if (!crmResponse.ok && (crmResponse.status === 404 || crmResponse.status === 405)) {
        const altUrl = `${CRM_AUTH_URL}/api/auth/verify-token`;
        const altResponse = await makePostRequest(altUrl, verifyPayload);
        if (altResponse.ok || (altResponse.status !== 404 && altResponse.status !== 405)) {
          verifyUrl = altUrl;
          crmResponse = altResponse;
        }
      }
    } catch (netErr) {
      console.error('[SSO Network Error]:', netErr.message);
      return res.status(502).json({
        success: false,
        message: `Failed to connect to CRM Auth Gateway at ${CRM_AUTH_URL}: ${netErr.message}`
      });
    }

    console.log('[SSO Verify Result]:', {
      verifyUrl,
      status: crmResponse?.status,
      ok: crmResponse?.ok,
      data: crmResponse?.data
    });

    if (!crmResponse.ok || !crmResponse.data || !crmResponse.data.valid) {
      const msg = crmResponse.data?.message || 'Invalid or expired SSO token';
      return res.status(401).json({
        success: false,
        message: msg,
        crmStatus: crmResponse?.status,
        crmResponse: crmResponse?.data
      });
    }

    const ssoUser = crmResponse.data.data;

    // 2. Resolve or synchronize SubAdmin in Stationary MongoDB
    let subAdmin = null;

    // A. Match by SubAdmin MongoDB _id
    if (ssoUser.userId) {
      try {
        subAdmin = await SubAdmin.findById(ssoUser.userId);
      } catch (_) {}
    }

    // B. Match by empNo (Foreign key from HRMS)
    if (!subAdmin && ssoUser.empNo) {
      subAdmin = await SubAdmin.findOne({ empNo: String(ssoUser.empNo).trim() });
    }

    // C. Match by name / login ID
    if (!subAdmin && (ssoUser.name || ssoUser.username)) {
      const matchName = String(ssoUser.name || ssoUser.username).trim();
      const escaped = matchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      subAdmin = await SubAdmin.findOne({ name: { $regex: `^${escaped}$`, $options: 'i' } });
    }

    // D. Auto-provision SubAdmin if authorized from HRMS/CRM but not yet created in Stationary DB
    if (!subAdmin) {
      const assignedName = ssoUser.name || ssoUser.username || (ssoUser.empNo ? `emp_${ssoUser.empNo}` : 'sso_user');
      subAdmin = new SubAdmin({
        name: assignedName,
        empNo: ssoUser.empNo ? String(ssoUser.empNo).trim() : null,
        password: `sso_${Date.now()}_${Math.random().toString(36).substring(7)}`, // Hashed by subAdminSchema pre-save hook
        role: 'Editor', // Use Stationary's role; do NOT use CRM's external role (e.g. faculty/student)
        permissions: [], // Managed within Stationary SubAdmin Management
        assignedCollege: ssoUser.assignedCollege || null,
        assignedBranch: ssoUser.assignedBranch || null
      });
      await subAdmin.save();
    } else {
      // Preserve existing Stationary role & permissions. Do NOT overwrite with CRM role or permissions.
      let modified = false;
      if (!subAdmin.empNo && ssoUser.empNo) {
        subAdmin.empNo = String(ssoUser.empNo).trim();
        modified = true;
      }
      if (!subAdmin.role) {
        subAdmin.role = 'Editor';
        modified = true;
      }
      if (ssoUser.assignedCollege && !subAdmin.assignedCollege) {
        subAdmin.assignedCollege = ssoUser.assignedCollege;
        modified = true;
      }
      if (modified) {
        await subAdmin.save();
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
    console.error('[SSO Error]:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'SSO authentication failed'
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
