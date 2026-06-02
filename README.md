# ITPC Management System

ITPC Management System is a full-stack web application for managing organizations, contracts, services, subscriptions, payments, history, and statistics.

The project uses:
- **Frontend:** React + Vite + Tailwind CSS + React Router + Chart.js
- **Backend:** Flask + SQLite
- **Database:** SQLite local file (`src/itpc.db`)

---

## Current Project Structure

```text
itpc-management-system/
├─ dist/                     # production frontend build
├─ node_modules/             # installed frontend packages
├─ src/
│  ├─ components/            # shared UI components
│  ├─ pages/                 # app pages
│  ├─ app.py                 # Flask backend
│  ├─ database.py            # SQLite schema + seed data
│  ├─ itpc.db                # SQLite database file
│  ├─ App.jsx                # React routes
│  ├─ main.jsx               # React entry point
│  └─ index.css              # styles
├─ package.json              # frontend dependencies
├─ package-lock.json         # exact frontend versions
├─ postcss.config.js
├─ tailwind.config.js
├─ vite.config.js
├─ requirements.txt          # backend dependencies
├─ setup_and_run.bat         # Windows setup + run script
└─ README_FULL.md
```

---

## Main Features

- User login
- Organizations management
- Admin dashboard
- Provider companies management
- Company details page
- New contract page
- Detail page for each organization
- Payment tracking
- History page
- Statistics page with charts
- SQLite database with seed data

---

## Technologies Used

### Frontend
- React 18
- Vite 5
- React Router DOM 6
- Tailwind CSS 3
- Chart.js 4
- react-chartjs-2 5
- PostCSS
- Autoprefixer

### Backend
- Python 3.10 or newer
- Flask 3
- SQLite3 (built into Python, no separate install needed)

---

## Exact Frontend Dependencies

These dependencies are already defined in `package.json`:

```json
"dependencies": {
  "chart.js": "^4.5.1",
  "react": "^18.2.0",
  "react-chartjs-2": "^5.3.1",
  "react-dom": "^18.2.0",
  "react-router-dom": "^6.30.1"
},
"devDependencies": {
  "@types/react": "^18.2.43",
  "@types/react-dom": "^18.2.17",
  "@vitejs/plugin-react": "^4.2.1",
  "autoprefixer": "^10.4.16",
  "postcss": "^8.4.32",
  "tailwindcss": "^3.3.6",
  "vite": "^5.0.8"
}
```

---

## Backend Dependencies

Create `requirements.txt` with this content:

```txt
Flask>=3.0,<4.0
```

Notes:
- `sqlite3` is built into Python.
- `os` is built into Python.
- No extra database driver is required.

---

## How to Run the Project on Another PC

### Requirements
Install these first:
- **Python 3.10+**
- **Node.js 18+**
- **npm** (comes with Node.js)

---

## Quick Start for Windows

1. Copy the project folder to the other PC.
2. Make sure these files exist in the root folder:
   - `package.json`
   - `requirements.txt`
   - `setup_and_run.bat`
3. Double-click `setup_and_run.bat`

This script will:
- install frontend packages
- install backend packages
- initialize the SQLite database
- start the Flask backend
- start the React frontend

---

## Manual Run Steps

### 1) Install frontend packages

```bash
npm install
```

### 2) Install backend packages

```bash
py -m pip install -r requirements.txt
```

If `py` does not work, use:

```bash
python -m pip install -r requirements.txt
```

### 3) Initialize the database

```bash
py src\database.py
```

or:

```bash
python src\database.py
```

### 4) Start backend server

```bash
py src\app.py
```

or:

```bash
python src\app.py
```

Backend URL:

```text
http://127.0.0.1:5000
```

API base URL:

```text
http://127.0.0.1:5000/api
```

### 5) Start frontend server

```bash
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

---

## Default Seed Users

The database initializer creates default users:

```text
Admin:
username: admin1
password: a123

User:
username: user1
password: u123
```

---

## Database Overview

The backend creates these tables:
- `users`
- `organizations`
- `provider_companies`
- `provider_subscriptions`
- `organization_services`
- `service_items`
- `payments`
- `activity_log`
- `service_ranges`

---

## Important Notes

### 1) Backend files are inside `src`
The Flask backend files are currently stored inside the `src` folder:
- `src/app.py`
- `src/database.py`
- `src/itpc.db`

This works, but later it may be cleaner to move the backend into a separate folder like `backend/`.

### 2) Database file is local
The SQLite database is a local file:

```text
src/itpc.db
```

If you want a fresh database, delete that file and run:

```bash
py src\database.py
```

### 3) API URL in frontend
The frontend is calling the backend using:

```js
const API_BASE = 'http://127.0.0.1:5000/api';
```

So the backend must be running on port `5000`.

### 4) CORS is already handled in Flask
Your backend already adds CORS headers manually, so frontend and backend can run on different ports during development.

---

## Suggested .gitignore

You can use this `.gitignore`:

```gitignore
node_modules/
dist/
__pycache__/
*.pyc
src/itpc.db
.env
.vscode/
```

---

## Recommended GitHub Upload

For GitHub, upload these important files and folders:
- `src/`
- `package.json`
- `package-lock.json`
- `tailwind.config.js`
- `postcss.config.js`
- `vite.config.js`
- `requirements.txt`
- `setup_and_run.bat`
- `README_FULL.md`

Avoid uploading:
- `node_modules/`
- `dist/`
- `__pycache__/`
- local database files unless you want to share sample data

---

## Future Improvements

- Move backend files into a dedicated `backend/` folder
- Add environment variables for API URL and secret key
- Use hashed passwords instead of plain text passwords
- Add Flask blueprints to split routes
- Add proper production deployment setup
- Add role-based protection for admin routes
- Add export/import for database backups

---

## License

This project is for educational and internal management use.
