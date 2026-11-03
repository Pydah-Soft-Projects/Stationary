const fs = require('fs');
let c = fs.readFileSync('frontend/src/pages/StudentDue.jsx', 'utf8');

const oldCourseOptions = `  const courseOptions = useMemo(() => {
    return courses.map(c => c.displayName || c.name).sort();
  }, [courses]);`.replace(/\n/g, '\r\n');

const newCourseOptions = `  const courseOptions = useMemo(() => {
    const counts = {};
    (courses || []).forEach(c => {
      const key = (c.name || '').trim().toLowerCase();
      if (key) {
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    return (courses || []).map(c => {
      const key = (c.name || '').trim().toLowerCase();
      const isDuplicate = (counts[key] || 0) > 1;

      if (isDuplicate) {
        const branchNames = (c.branches || [])
          .map(b => (typeof b === 'object' ? b?.name : b))
          .filter(Boolean);

        if (branchNames.length > 0) {
          return {
            ...c,
            displayLabel: \`\${c.name} (\${branchNames.join(', ')})\`,
            value: String(c.id)
          };
        }
      }

      return {
        ...c,
        displayLabel: c.displayName || c.name,
        value: String(c.id)
      };
    });
  }, [courses]);`.replace(/\n/g, '\r\n');

// Update course lookups to support courseId (string number) or course name
const oldYearLookup = `    const selectedCourse = courses.find(c => (c.displayName || c.name) === dueFilters.course);`.replace(/\n/g, '\r\n');
const newYearLookup = `    const selectedCourse = courses.find(c => String(c.id) === String(dueFilters.course) || (c.displayName || c.name) === dueFilters.course);`.replace(/\n/g, '\r\n');

const oldReportYearLookup = `    const selectedCourse = courses.find(c => (c.displayName || c.name) === reportFilters.course);`.replace(/\n/g, '\r\n');
const newReportYearLookup = `    const selectedCourse = courses.find(c => String(c.id) === String(reportFilters.course) || (c.displayName || c.name) === reportFilters.course);`.replace(/\n/g, '\r\n');

const oldDueSelectOptions = `              {courseOptions.map(course => (
                <option key={course} value={course}>{course.toUpperCase()}</option>
              ))}`.replace(/\n/g, '\r\n');

const newDueSelectOptions = `              {courseOptions.map(c => (
                <option key={c.value || c.id} value={c.value || c.id}>{(c.displayLabel || c.name || c).toUpperCase()}</option>
              ))}`.replace(/\n/g, '\r\n');

const oldReportSelectOptions = `                    {courseOptions.map(course => (
                      <option key={course} value={course}>{course.toUpperCase()}</option>
                    ))}`.replace(/\n/g, '\r\n');

const newReportSelectOptions = `                    {courseOptions.map(c => (
                      <option key={c.value || c.id} value={c.value || c.id}>{(c.displayLabel || c.name || c).toUpperCase()}</option>
                    ))}`.replace(/\n/g, '\r\n');

const oldProductCourseNorm = `    const selectedCourse = normalizeValue(dueFilters.course);`.replace(/\n/g, '\r\n');
const newProductCourseNorm = `    const selectedCourseObj = courses.find(c => String(c.id) === String(dueFilters.course) || (c.displayName || c.name) === dueFilters.course);
    const selectedCourse = normalizeValue(selectedCourseObj ? selectedCourseObj.name : dueFilters.course);`.replace(/\n/g, '\r\n');

const oldReportProductCourseNorm = `    const selectedCourse = normalizeValue(reportFilters.course);`.replace(/\n/g, '\r\n');
const newReportProductCourseNorm = `    const selectedCourseObj = courses.find(c => String(c.id) === String(reportFilters.course) || (c.displayName || c.name) === reportFilters.course);
    const selectedCourse = normalizeValue(selectedCourseObj ? selectedCourseObj.name : reportFilters.course);`.replace(/\n/g, '\r\n');

if (!c.includes(oldCourseOptions)) {
  console.error('oldCourseOptions not found');
  process.exit(1);
}
c = c.replace(oldCourseOptions, newCourseOptions);

c = c.split(oldYearLookup).join(newYearLookup);
c = c.split(oldReportYearLookup).join(newReportYearLookup);
c = c.split(oldDueSelectOptions).join(newDueSelectOptions);
c = c.split(oldReportSelectOptions).join(newReportSelectOptions);
c = c.split(oldProductCourseNorm).join(newProductCourseNorm);
c = c.split(oldReportProductCourseNorm).join(newReportProductCourseNorm);

fs.writeFileSync('frontend/src/pages/StudentDue.jsx', c, 'utf8');
console.log('Successfully updated StudentDue.jsx');

