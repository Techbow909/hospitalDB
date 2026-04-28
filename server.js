const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
  host:               'localhost',
  user:               'root',
  password:           'admin',
  database:           'hospital',
  waitForConnections: true,
  connectionLimit:    10
});

async function q(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function call(proc, params = []) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(`CALL ${proc}(${params.map(() => '?').join(',')})`, params);
    return rows[0];
  } finally {
    conn.release();
  }
}

app.get('/api/patients', async (req, res) => {
  try {
    const { search } = req.query;
    let sql = `SELECT PatientID, FirstName, LastName, DOB, Gender, PhoneNumber, Address FROM Patient`;
    let params = [];
    if (search) {
      sql += ` WHERE FirstName LIKE ? OR LastName LIKE ?`;
      params = [`%${search}%`, `%${search}%`];
    }
    res.json(await q(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/patients/:id', async (req, res) => {
  try {
    const rows = await q(`SELECT * FROM vw_PatientInsuranceDetails WHERE PatientID = ?`, [req.params.id]);
    res.json(rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/patients', async (req, res) => {
  try {
    const { FirstName, LastName, DOB, Gender, PhoneNumber, Address } = req.body;
    await q(
      `INSERT INTO Patient (FirstName, LastName, DOB, Gender, PhoneNumber, Address) VALUES (?,?,?,?,?,?)`,
      [FirstName, LastName, DOB, Gender, PhoneNumber, Address]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/patients/:id/history', async (req, res) => {
  try {
    res.json(await call('sp_GetPatientHistory', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/appointments', async (req, res) => {
  try {
    res.json(await q(`SELECT * FROM vw_AppointmentDetails ORDER BY AppointmentDate DESC`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/appointments/book', async (req, res) => {
  try {
    const { PatientID, DoctorID, NurseID, RoomID, AppointmentDate, Notes } = req.body;
    await call('sp_BookAppointment', [PatientID, DoctorID, NurseID || null, RoomID, AppointmentDate, Notes || '']);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/appointments/:id/complete', async (req, res) => {
  try {
    const { TreatmentType, TreatmentNotes, PaymentAmount } = req.body;
    await call('sp_CompleteAppointment', [req.params.id, TreatmentType, TreatmentNotes || '', PaymentAmount]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/appointments/:id/transfer', async (req, res) => {
  try {
    await call('sp_TransferRoom', [req.params.id, req.body.NewRoomID]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/doctors/:id/schedule', async (req, res) => {
  try {
    res.json(await call('sp_GetDoctorSchedule', [req.params.id, req.query.date]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/doctors', async (req, res) => {
  try {
    res.json(await q(`SELECT * FROM vw_DoctorSpecialties`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/staff', async (req, res) => {
  try {
    res.json(await q(`
      SELECT s.StaffID, s.FirstName, s.LastName, s.Gender, s.Email,
             d.DepartmentName,
             sup.FirstName AS SupervisorFirst,
             sup.LastName  AS SupervisorLast
      FROM Staff s
      INNER JOIN Department d   ON s.DepartmentID = d.DepartmentID
      LEFT  JOIN Staff      sup ON s.SupervisorID  = sup.StaffID
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/staff', async (req, res) => {
  try {
    const { DepartmentID, SupervisorID, FirstName, LastName, Gender, Email, Role } = req.body;
    await call('sp_AddStaff', [DepartmentID, SupervisorID || null, FirstName, LastName, Gender, Email, Role]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/staff/hierarchy', async (req, res) => {
  try {
    res.json(await q(`
      WITH RECURSIVE StaffHierarchy AS (
        SELECT StaffID, FirstName, LastName, DepartmentID, SupervisorID, 0 AS Level,
               CONCAT(FirstName, ' ', LastName) AS HierarchyPath
        FROM Staff WHERE SupervisorID IS NULL
        UNION ALL
        SELECT s.StaffID, s.FirstName, s.LastName, s.DepartmentID, s.SupervisorID,
               h.Level + 1,
               CONCAT(h.HierarchyPath, ' > ', s.FirstName, ' ', s.LastName)
        FROM Staff s
        INNER JOIN StaffHierarchy h ON s.SupervisorID = h.StaffID
      )
      SELECT h.StaffID, h.FirstName, h.LastName, h.SupervisorID,
             h.Level, h.HierarchyPath, d.DepartmentName
      FROM StaffHierarchy h
      INNER JOIN Department d ON h.DepartmentID = d.DepartmentID
      ORDER BY h.Level, h.LastName
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/rooms', async (req, res) => {
  try {
    res.json(await q(`SELECT * FROM Room ORDER BY RoomNumber`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/rooms/available', async (req, res) => {
  try {
    res.json(await q(`SELECT * FROM vw_AvailableRooms`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/revenue', async (req, res) => {
  try {
    res.json(await q(`SELECT * FROM vw_RevenueSummary ORDER BY TotalRevenue DESC`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/departments', async (req, res) => {
  try {
    res.json(await q(`SELECT * FROM Department`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/specialties', async (req, res) => {
  try {
    res.json(await q(`SELECT * FROM Specialty`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hospital server running on http://localhost:${PORT}`));