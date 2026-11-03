const express = require('express');
const { getCourses, getBranches, getAcademicBatches, getStudentStatuses } = require('../controllers/sqlAcademicController');

const router = express.Router();

router.get('/courses', getCourses);
router.get('/branches', getBranches);
router.get('/batches', getAcademicBatches);
router.get('/statuses', getStudentStatuses);

module.exports = router;

