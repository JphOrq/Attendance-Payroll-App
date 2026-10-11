  'use strict';
  let state = { employees: [], rows: [] };
  let requestPending = false;
  const $ = id => document.getElementById(id);
  const money = value => '₱' + (Number(value) || 0).toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2});
  const numberFromDisplay = value => Number(String(value ?? '').replace(/,/g, '')) || 0;

  function showMessage(text, type = 'ok') {
    const el = $('message');
    el.textContent = text;
    el.className = 'message show ' + type;
    window.scrollTo({top:0, behavior:'smooth'});
    window.clearTimeout(showMessage.timer);
    showMessage.timer = window.setTimeout(() => el.classList.remove('show'), 6000);
  }
  function busy(on) {
    requestPending = on;
    document.body.classList.toggle('busy', on);
    document.querySelectorAll('button').forEach(button => button.disabled = on);
  }
  function callServer(method, args, successMessage) {
    if (requestPending) return;
    busy(true);
    google.script.run
      .withSuccessHandler(data => {
        busy(false);
        if (data && Array.isArray(data.rows)) { state = data; render(); }
        if (successMessage) showMessage(successMessage, 'ok');
      })
      .withFailureHandler(error => {
        busy(false);
        showMessage(error && error.message ? error.message : String(error), 'error');
      })[method](...args);
  }
  function localDateInputValue() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
  }
  function load() {
    $('workDate').value = localDateInputValue();
    google.script.run.withSuccessHandler(data => { state = data; render(); })
      .withFailureHandler(error => showMessage(error && error.message ? error.message : String(error), 'error'))
      .getInitialData();
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }
  function render() {
    $('employeeCount').textContent = state.employees.length;
    const complete = state.rows.filter(row => row.status === 'COMPLETE');
    $('completedCount').textContent = complete.length;
    $('payTotal').textContent = money(complete.reduce((sum, row) => sum + numberFromDisplay(row.pay), 0));

    const select = $('employeeSelect');
    const previous = select.value;
    select.innerHTML = '<option value="">Choose employee</option>' + state.employees.map(employee =>
      `<option value="${escapeHtml(employee.name)}">${escapeHtml(employee.name)}</option>`
    ).join('');
    if (state.employees.some(employee => employee.name === previous)) select.value = previous;
    syncSalary();
    renderRows();
  }
  function syncSalary() {
    const employee = state.employees.find(item => item.name === $('employeeSelect').value);
    if (employee) $('shiftSalary').value = employee.dailySalary;
    updateRatePreview();
  }
  function updateRatePreview() {
    const salary = Number($('shiftSalary').value);
    $('ratePreview').textContent = Number.isFinite(salary) && salary >= 0
      ? 'Hourly rate: ' + money(salary / 8) + ' per hour (daily salary ÷ 8)' : 'Hourly rate: —';
  }
  function renderRows() {
    const query = $('search').value.trim().toLowerCase();
    const rows = state.rows.filter(row => String(row.name).toLowerCase().includes(query));
    $('records').innerHTML = rows.length ? rows.map(row => {
      const isOpen = row.status === 'IN' && !row.timeOut;
      const hoursText = row.hours !== '' && row.hours != null ? Number(row.hours).toFixed(2) + ' h' : '—';
      const payText = row.pay !== '' && row.pay != null ? money(row.pay) : '—';
      return `<tr>
        <td>${escapeHtml(row.date || '—')}</td><td><strong>${escapeHtml(row.name)}</strong></td>
        <td>${escapeHtml(row.timeIn || '—')}</td><td>${escapeHtml(row.timeOut || '—')}</td>
        <td>${hoursText}</td><td>${payText}</td>
        <td><span class="status ${row.status === 'COMPLETE' ? 'done' : ''}">${escapeHtml(row.status || '—')}</span></td>
        <td>${isOpen ? `<button class="btn green action" data-timeout-id="${escapeHtml(row.id)}" type="button">Time Out</button>` : '—'}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="empty">No matching attendance records.</td></tr>';
  }

  $('employeeSelect').addEventListener('change', syncSalary);
  $('shiftSalary').addEventListener('input', updateRatePreview);
  $('search').addEventListener('input', renderRows);
  $('records').addEventListener('click', event => {
    const button = event.target.closest('[data-timeout-id]');
    if (button) timeOut(button.dataset.timeoutId);
  });
  $('employeeForm').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('employeeName').value.trim();
    const salary = Number($('employeeSalary').value);
    if (!name || !Number.isFinite(salary) || salary < 0) return showMessage('Enter a valid employee name and daily salary.', 'error');
    callServer('saveEmployee', [name, salary], 'Employee saved successfully.');
    $('employeeForm').reset();
  });
  $('timeForm').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('employeeSelect').value;
    const date = $('workDate').value;
    const salary = Number($('shiftSalary').value);
    if (!name) return showMessage('Please add and select an employee first.', 'error');
    if (!date) return showMessage('Choose a work date.', 'error');
    if (!Number.isFinite(salary) || salary < 0) return showMessage('Enter a valid daily salary.', 'error');
    callServer('recordTimeIn', [name, date, salary, $('notes').value.trim()], 'Time-in recorded successfully.');
  });
  function timeOut(recordId) {
    if (!confirm('Record time-out now and calculate pay using actual elapsed hours, without break deductions?')) return;
    callServer('recordTimeOut', [recordId, $('notes').value.trim()], 'Time-out recorded and earned pay calculated.');
  }
  load();