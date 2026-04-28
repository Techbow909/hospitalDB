const API = 'http://localhost:3000/api';

// ── NAVIGATION ────────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`page-${btn.dataset.page}`).classList.add('active');
    loadPage(btn.dataset.page);
  });
});

function loadPage(page) {
  if (page === 'dashboard')    loadDashboard();
  if (page === 'patients')     loadPatients();
  if (page === 'appointments') loadAppointments();
  if (page === 'staff')        loadStaff();
  if (page === 'rooms')        loadRooms();
  if (page === 'revenue')      loadRevenue();
}

// ── FETCH HELPERS ─────────────────────────────────────────────────────────────

async function get(url) {
  const r = await fetch(API + url);
  if (!r.ok) throw new Error((await r.json()).error || r.statusText);
  return r.json();
}

async function post(url, body) {
  const r = await fetch(API + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error((await r.json()).error || r.statusText);
  return r.json();
}

// ── TOAST ─────────────────────────────────────────────────────────────────────

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.classList.remove('show'), 3500);
}

// ── MODAL ─────────────────────────────────────────────────────────────────────

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const [patients, appts, rooms, staff] = await Promise.all([
      get('/patients'),
      get('/appointments'),
      get('/rooms'),
      get('/staff')
    ]);

    const available  = rooms.filter(r => r.Status === 'Available').length;
    const occupied   = rooms.filter(r => r.Status === 'Occupied').length;

    const stats = [
      { label: 'Total Patients',     value: patients.length },
      { label: 'Appointments',        value: appts.length },
      { label: 'Available Rooms',     value: available },
      { label: 'Occupied Rooms',      value: occupied },
      { label: 'Total Staff',         value: staff.length },
    ];

    document.getElementById('stat-grid').innerHTML = stats.map(s => `
      <div class="stat-card">
        <div class="label">${s.label}</div>
        <div class="value">${s.value}</div>
      </div>
    `).join('');

    loadOrgChart();
  } catch (e) { toast(e.message, 'error'); }
}

async function loadOrgChart() {
  try {
    const rows = await get('/staff/hierarchy');
    const html = rows.map(r => `
      <div class="org-node" style="padding-left:${r.Level * 1.5}rem">
        <span class="org-indent">${r.Level > 0 ? '└─' : ''}</span>
        <span class="org-name">${r.FirstName} ${r.LastName}</span>
        <span class="org-dept">(${r.DepartmentName})</span>
      </div>
    `).join('');
    document.getElementById('org-chart').innerHTML = html;
  } catch (e) { toast(e.message, 'error'); }
}

// ── PATIENTS ──────────────────────────────────────────────────────────────────

async function loadPatients(search = '') {
  try {
    const url = search ? `/patients?search=${encodeURIComponent(search)}` : '/patients';
    const rows = await get(url);
    const tbody = document.querySelector('#patient-table tbody');
    tbody.innerHTML = rows.map(p => `
      <tr>
        <td>${p.PatientID}</td>
        <td>${p.FirstName} ${p.LastName}</td>
        <td>${p.DOB ? p.DOB.split('T')[0] : '—'}</td>
        <td>${p.Gender || '—'}</td>
        <td>${p.PhoneNumber || '—'}</td>
        <td>
          <button class="btn-sm btn-info"    onclick="showHistory(${p.PatientID})">History</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { toast(e.message, 'error'); }
}

function searchPatients() {
  loadPatients(document.getElementById('patient-search').value.trim());
}

document.getElementById('patient-search').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchPatients();
});

async function addPatient() {
  try {
    await post('/patients', {
      FirstName:   document.getElementById('p-first').value,
      LastName:    document.getElementById('p-last').value,
      DOB:         document.getElementById('p-dob').value,
      Gender:      document.getElementById('p-gender').value,
      PhoneNumber: document.getElementById('p-phone').value,
      Address:     document.getElementById('p-address').value
    });
    closeModal('modal-add-patient');
    loadPatients();
    toast('Patient added successfully');
  } catch (e) { toast(e.message, 'error'); }
}

async function showHistory(patientID) {
  try {
    const rows = await get(`/patients/${patientID}/history`);
    const tbody = document.querySelector('#history-table tbody');
    tbody.innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${r.AppointmentID}</td>
        <td>${r.AppointmentDate ? r.AppointmentDate.replace('T', ' ').slice(0,16) : '—'}</td>
        <td>${r.DoctorName || '—'}</td>
        <td>${r.TreatmentType || '—'}</td>
        <td>${r.TreatmentNotes || '—'}</td>
        <td>${r.AmountPaid != null ? '$' + Number(r.AmountPaid).toFixed(2) : '—'}</td>
      </tr>
    `).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted)">No records found</td></tr>';
    openModal('modal-history');
  } catch (e) { toast(e.message, 'error'); }
}

// ── APPOINTMENTS ──────────────────────────────────────────────────────────────

async function loadAppointments() {
  try {
    const rows = await get('/appointments');
    const tbody = document.querySelector('#appt-table tbody');
    tbody.innerHTML = rows.map(a => `
      <tr>
        <td>${a.AppointmentID}</td>
        <td>${a.AppointmentDate ? a.AppointmentDate.replace('T', ' ').slice(0,16) : '—'}</td>
        <td>${a.PatientName}</td>
        <td>${a.DoctorName}</td>
        <td>${a.NurseName || '—'}</td>
        <td>${a.RoomNumber || '—'}</td>
        <td>${a.Notes || '—'}</td>
        <td>
          <button class="btn-sm btn-success" onclick="openComplete(${a.AppointmentID})">Complete</button>
          <button class="btn-sm btn-warning" onclick="openTransfer(${a.AppointmentID})">Transfer</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function bookAppointment() {
  try {
    await post('/appointments/book', {
      PatientID:       Number(document.getElementById('b-patient').value),
      DoctorID:        Number(document.getElementById('b-doctor').value),
      NurseID:         Number(document.getElementById('b-nurse').value) || null,
      RoomID:          Number(document.getElementById('b-room').value),
      AppointmentDate: document.getElementById('b-date').value.replace('T', ' '),
      Notes:           document.getElementById('b-notes').value
    });
    closeModal('modal-book');
    loadAppointments();
    toast('Appointment booked');
  } catch (e) { toast(e.message, 'error'); }
}

function openComplete(id) {
  document.getElementById('c-appt-id').value = id;
  openModal('modal-complete');
}

async function completeAppointment() {
  try {
    const id = document.getElementById('c-appt-id').value;
    await post(`/appointments/${id}/complete`, {
      TreatmentType:  document.getElementById('c-type').value,
      TreatmentNotes: document.getElementById('c-notes').value,
      PaymentAmount:  parseFloat(document.getElementById('c-amount').value)
    });
    closeModal('modal-complete');
    loadAppointments();
    toast('Appointment completed and payment recorded');
  } catch (e) { toast(e.message, 'error'); }
}

function openTransfer(id) {
  document.getElementById('t-appt-id').value = id;
  openModal('modal-transfer');
}

async function transferRoom() {
  try {
    const id = document.getElementById('t-appt-id').value;
    await post(`/appointments/${id}/transfer`, {
      NewRoomID: Number(document.getElementById('t-room').value)
    });
    closeModal('modal-transfer');
    loadAppointments();
    loadRooms();
    toast('Room transferred successfully');
  } catch (e) { toast(e.message, 'error'); }
}

// ── STAFF ─────────────────────────────────────────────────────────────────────

async function loadStaff() {
  try {
    const [doctors, staff] = await Promise.all([get('/doctors'), get('/staff')]);

    const dtbody = document.querySelector('#doctor-table tbody');
    dtbody.innerHTML = doctors.map(d => `
      <tr>
        <td>${d.DoctorID}</td>
        <td>${d.DoctorName}</td>
        <td>${d.DepartmentName}</td>
        <td>${d.SpecialtyName}</td>
      </tr>
    `).join('');

    const stbody = document.querySelector('#staff-table tbody');
    stbody.innerHTML = staff.map(s => `
      <tr>
        <td>${s.StaffID}</td>
        <td>${s.FirstName} ${s.LastName}</td>
        <td>${s.Gender || '—'}</td>
        <td>${s.DepartmentName}</td>
        <td>${s.SupervisorFirst ? s.SupervisorFirst + ' ' + s.SupervisorLast : '—'}</td>
        <td>${s.Email || '—'}</td>
      </tr>
    `).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function addStaff() {
  try {
    await post('/staff', {
      FirstName:    document.getElementById('s-first').value,
      LastName:     document.getElementById('s-last').value,
      Gender:       document.getElementById('s-gender').value,
      Email:        document.getElementById('s-email').value,
      DepartmentID: Number(document.getElementById('s-dept').value),
      SupervisorID: Number(document.getElementById('s-sup').value) || null,
      Role:         document.getElementById('s-role').value
    });
    closeModal('modal-add-staff');
    loadStaff();
    toast('Staff member added');
  } catch (e) { toast(e.message, 'error'); }
}

// ── ROOMS ─────────────────────────────────────────────────────────────────────

async function loadRooms() {
  try {
    const rows = await get('/rooms');
    const tbody = document.querySelector('#room-table tbody');
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.RoomID}</td>
        <td>${r.RoomNumber}</td>
        <td><span class="badge badge-${r.Status.toLowerCase()}">${r.Status}</span></td>
      </tr>
    `).join('');
  } catch (e) { toast(e.message, 'error'); }
}

// ── REVENUE ───────────────────────────────────────────────────────────────────

async function loadRevenue() {
  try {
    const rows = await get('/revenue');
    const tbody = document.querySelector('#revenue-table tbody');
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.DoctorName}</td>
        <td>${r.DepartmentName}</td>
        <td>${r.TotalAppointments}</td>
        <td>$${r.TotalRevenue != null ? Number(r.TotalRevenue).toFixed(2) : '0.00'}</td>
      </tr>
    `).join('');
  } catch (e) { toast(e.message, 'error'); }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
loadDashboard();