## Driver Portal

A minimal app for race car drivers to register/login and submit:

**GitHub Repository:** https://github.com/ballincat42dev/driver-portal
- races ran (date, time, series)
- replays and protest details (optional)
- telemetry files

Admin users can view and download submissions for review.

### Run with Docker

Prerequisites: Docker Desktop

```bash
docker compose up --build
```

Visit http://localhost:3000

Environment variables (docker-compose.yml):
- `SESSION_SECRET`: strong random string
- `ADMIN_CODE`: code that grants admin role during registration

### Local development (optional)

If you have Node.js:
```bash
cd server
npm install
npm run dev
```

### Default data locations
- `server/data` (SQLite DB and sessions)
- `server/uploads/replays`
- `server/uploads/telemetry`

These are persisted via Docker volumes.


