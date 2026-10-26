const express = require('express');
const router = express.Router();
const { ssoLogin, logout } = require('../controllers/authController');

router.post('/sso-login', ssoLogin);
router.post('/logout', logout);

module.exports = router;
