const ATTENDANCE_SHEET = 'Attendance';
const EMPLOYEE_SHEET = 'Employees';
const STANDARD_WORK_HOURS = 8;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Time-In / Time-Out Payroll')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Create the required tabs and apply useful column formats. */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let attendance = ss.getSheetByName(ATTENDANCE_SHEET);
  if (!attendance) attendance = ss.insertSheet(ATTENDANCE_SHEET);
  const attendanceHeaders = [
    'Record ID', 'Work Date', 'Employee Name', 'Daily Salary', 'Time In', 'Time Out',
    'Hours Worked', 'Hourly Rate', 'Earned Pay', 'Status', 'Notes', 'Created At'
  ];
  if (attendance.getLastRow() === 0) attendance.appendRow(attendanceHeaders);
  let employees = ss.getSheetByName(EMPLOYEE_SHEET);
  if (!employees) employees = ss.insertSheet(EMPLOYEE_SHEET);
  if (employees.getLastRow() === 0) employees.appendRow(['Employee Name', 'Daily Salary', 'Active']);

  attendance.setFrozenRows(1);
  employees.setFrozenRows(1);
  attendance.getRange('D:D').setNumberFormat('₱#,##0.00');
  attendance.getRange('E:F').setNumberFormat('hh:mm:ss AM/PM');
  attendance.getRange('G:G').setNumberFormat('0.00');
  attendance.getRange('H:I').setNumberFormat('₱#,##0.00');
  attendance.getRange('L:L').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  employees.getRange('B:B').setNumberFormat('₱#,##0.00');
  return 'Sheets are ready.';
}

function getInitialData() {
  setupSheets();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const employeeSheet = ss.getSheetByName(EMPLOYEE_SHEET);
  const employeeValues = employeeSheet.getLastRow() > 1
    ? employeeSheet.getRange(2, 1, employeeSheet.getLastRow() - 1, 3).getValues() : [];
  const employees = employeeValues
    .filter(r => r[0] && r[2] !== false && String(r[2]).toLowerCase() !== 'inactive')
    .map(r => ({ name: String(r[0]), dailySalary: Number(r[1]) || 0 }));

  const sheet = ss.getSheetByName(ATTENDANCE_SHEET);
  const lastRow = sheet.getLastRow();
  const values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 12).getValues() : [];
  const tz = Session.getScriptTimeZone();
  const rows = values.map(r => ({
    id: String(r[0] || ''),
    date: normalizeWorkDate_(r[1], tz),
    name: String(r[2] || ''),
    salary: Number(r[3]) || 0,
    timeIn: formatTime_(r[4], tz),
    timeOut: formatTime_(r[5], tz),
    hours: r[6] === '' || r[6] == null ? '' : Number(r[6]),
    hourlyRate: r[7] === '' || r[7] == null ? '' : Number(r[7]),
    pay: r[8] === '' || r[8] == null ? '' : Number(r[8]),
    status: String(r[9] || (r[4] ? 'IN' : '')),
    notes: String(r[10] || '')
  })).reverse().slice(0, 100);
  return { employees, rows, standardWorkHours: STANDARD_WORK_HOURS };
}

function saveEmployee(name, dailySalary) {
  name = String(name || '').trim();
  dailySalary = Number(dailySalary);
  if (!name || name.length > 120 || !Number.isFinite(dailySalary) || dailySalary < 0) {
    throw new Error('Enter an employee name (up to 120 characters) and a non-negative daily salary.');
  }
  setupSheets();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EMPLOYEE_SHEET);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues() : [];
    const index = data.findIndex(r => String(r[0]).trim().toLowerCase() === name.toLowerCase());
    if (index >= 0) sheet.getRange(index + 2, 1, 1, 3).setValues([[name, dailySalary, true]]);
    else sheet.appendRow([name, dailySalary, true]);
  } finally {
    lock.releaseLock();
  }
  return getInitialData();
}

function recordTimeIn(name, workDate, dailySalary, notes) {
  name = String(name || '').trim();
  workDate = String(workDate || '').trim();
  dailySalary = Number(dailySalary);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !Number.isFinite(dailySalary) || dailySalary < 0) {
    throw new Error('Choose an employee and enter a valid work date and non-negative daily salary.');
  }
  if (String(notes || '').length > 500) throw new Error('Notes must be 500 characters or fewer.');
  setupSheets();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ATTENDANCE_SHEET);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues() : [];
    const hasOpenShift = rows.some(r =>
      normalizeWorkDate_(r[1], Session.getScriptTimeZone()) === workDate &&
      String(r[2]).trim().toLowerCase() === name.toLowerCase() &&
      r[4] && !r[5]
    );
    if (hasOpenShift) throw new Error('This employee already has an open time-in for that work date. Record time-out first.');

    const now = new Date();
    const hourlyRate = roundMoney_(dailySalary / STANDARD_WORK_HOURS);
    sheet.appendRow([
      Utilities.getUuid(), workDate, name, dailySalary, now, '', '', hourlyRate, '', 'IN', String(notes || '').trim(), now
    ]);
  } finally {
    lock.releaseLock();
  }
  return getInitialData();
}

function recordTimeOut(recordId, notes) {
  recordId = String(recordId || '').trim();
  if (!recordId) throw new Error('Missing attendance record.');
  if (String(notes || '').length > 500) throw new Error('Notes must be 500 characters or fewer.');
  setupSheets();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ATTENDANCE_SHEET);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const lastRow = sheet.getLastRow();
    const values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 12).getValues() : [];
    const index = values.findIndex(r => String(r[0]) === recordId);
    if (index < 0) throw new Error('Attendance record not found. Refresh the page and try again.');
    const row = values[index];
    if (row[5]) throw new Error('This attendance record already has a time-out.');
    if (!(row[4] instanceof Date) || isNaN(row[4].getTime())) throw new Error('The time-in timestamp is invalid.');

    const end = new Date();
    const elapsedMs = end.getTime() - row[4].getTime();
    if (elapsedMs <= 0) throw new Error('Time-out must be later than time-in.');
    const hours = elapsedMs / 3600000;
    const dailySalary = Number(row[3]) || 0;
    const hourlyRate = dailySalary / STANDARD_WORK_HOURS;
    const earnedPay = roundMoney_(hours * hourlyRate);
    const rowNumber = index + 2;
    sheet.getRange(rowNumber, 6, 1, 6).setValues([[
      end, hours, hourlyRate, earnedPay, 'COMPLETE', String(notes || row[10] || '').trim()
    ]]);
  } finally {
    lock.releaseLock();
  }
  return getInitialData();
}

function formatTime_(value, timezone) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, timezone, 'hh:mm:ss a');
  return String(value);
}

function normalizeWorkDate_(value, timezone) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? text : Utilities.formatDate(parsed, timezone, 'yyyy-MM-dd');
}

function roundMoney_(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
