const express = require('express');
const router = express.Router();
const {
  listSubAdmins,
  createSubAdmin,
  updateSubAdmin,
  deleteSubAdmin,
  loginSubAdmin,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
} = require('../controllers/subAdminController');

router.get('/subadmins', listSubAdmins);
router.post('/subadmins', createSubAdmin);
router.put('/subadmins/:id', updateSubAdmin);
router.delete('/subadmins/:id', deleteSubAdmin);
router.post('/subadmins/login', loginSubAdmin);

// Role management routes
router.get('/roles', listRoles);
router.post('/roles', createRole);
router.put('/roles/:roleKey', updateRole);
router.delete('/roles/:roleKey', deleteRole);

module.exports = router;
