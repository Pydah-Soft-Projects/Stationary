const express = require('express');
const {
  createAuditLog,
  listAuditLogs,
  approveAuditLog,
  rejectAuditLog,
  getUserAudits,
  getUserAuditStats,
  recordUserAudit,
} = require('../controllers/auditLogController');

const router = express.Router();

// User Audit routes (HRMS-style login & performed activities audit)
router.get('/user-audits', getUserAudits);
router.get('/user-audits/stats', getUserAuditStats);
router.post('/user-audits', recordUserAudit);

router.route('/')
  .post(createAuditLog)
  .get(listAuditLogs);

router.patch('/:id/approve', approveAuditLog);
router.patch('/:id/reject', rejectAuditLog);

module.exports = router;
