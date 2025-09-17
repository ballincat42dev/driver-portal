import express from 'express';
import path from 'path';
import session from 'express-session';
import SQLiteStoreFactory from 'connect-sqlite3';
import multer from 'multer';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { initializeDatabase, db } from './db.js';
import expressLayouts from 'express-ejs-layouts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_me_in_production';

// Ensure uploads directories exist
import fs from 'fs';
const uploadBase = path.join(__dirname, '..', 'uploads');
const replayDir = path.join(uploadBase, 'replays');
const telemetryDir = path.join(uploadBase, 'telemetry');
for (const d of [uploadBase, replayDir, telemetryDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// View engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, '..', 'data') }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

// Auth helpers
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).send('Forbidden');
  next();
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'replay') cb(null, replayDir);
    else if (file.fieldname === 'telemetry') cb(null, telemetryDir);
    else cb(null, uploadBase);
  },
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    cb(null, safeName);
  },
});
const upload = multer({ storage });

// Routes
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.redirect('/login');
});

app.get('/register', (req, res) => {
  res.render('register', { error: null, user: null });
});

app.post('/register', async (req, res) => {
  const { name, email, password, admin_code } = req.body;
  if (!name || !email || !password) return res.render('register', { error: 'All fields are required.' });
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const role = admin_code && admin_code === (process.env.ADMIN_CODE || 'admin123') ? 'admin' : 'driver';
    await db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, passwordHash, role]);
  } catch (e) {
    return res.render('register', { error: 'Email already in use.' });
  }
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null, user: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return res.render('login', { error: 'Invalid credentials.' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.render('login', { error: 'Invalid credentials.' });
  req.session.user = { id: user.id, name: user.name, role: user.role, email: user.email };
  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/dashboard', requireAuth, async (req, res) => {
  const mySubmissions = await db.all('SELECT * FROM submissions WHERE user_id = ? ORDER BY created_at DESC', [req.session.user.id]);
  res.render('dashboard', { user: req.session.user, submissions: mySubmissions });
});

app.get('/submit', requireAuth, (req, res) => {
  res.render('submit', { user: req.session.user, error: null });
});

app.post(
  '/submit',
  requireAuth,
  upload.fields([
    { name: 'replay', maxCount: 1 },
    { name: 'telemetry', maxCount: 5 },
  ]),
  async (req, res) => {
    const { race_date, race_time, series, is_protest, protest_text } = req.body;
    if (!race_date || !race_time || !series) {
      return res.render('submit', { user: req.session.user, error: 'Please fill required fields.' });
    }
    const replayPath = req.files?.replay?.[0]?.filename || null;
    const telemetryFiles = (req.files?.telemetry || []).map(f => f.filename);
    const telemetryJson = JSON.stringify(telemetryFiles);
    await db.run(
      `INSERT INTO submissions (user_id, race_date, race_time, series, is_protest, protest_text, replay_file, telemetry_files)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.user.id,
        race_date,
        race_time,
        series,
        is_protest ? 1 : 0,
        protest_text || null,
        replayPath,
        telemetryJson,
      ]
    );
    res.redirect('/dashboard');
  }
);

app.get('/admin', requireAuth, requireAdmin, async (req, res) => {
  const submissions = await db.all(
    `SELECT s.*, u.name as user_name, u.email as user_email
     FROM submissions s JOIN users u ON s.user_id = u.id
     ORDER BY s.created_at DESC`
  );
  res.render('admin', { user: req.session.user, submissions });
});

app.get('/files/replays/:name', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(replayDir, req.params.name));
});

app.get('/files/telemetry/:name', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(telemetryDir, req.params.name));
});

// Start
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
});


