# AROL Platform (Multi-Tenant Portal)

A premium, multi-tenant web application designed for machinery management, telemetry monitoring, and commercial operations. 

This platform features dynamic "Home Realm Discovery" (UI branding adapts to the tenant), Row-Level Security (RLS) data isolation, and Role-Based Access Control (RBAC).

## 🏗 Tech Stack
* **Frontend:** React, Vite, Tailwind CSS, Axios, React Router
* **Backend:** Node.js, Express, JWT, Bcrypt, Morgan
* **Database:** PostgreSQL

## 📂 Repository Structure
* `/arol-frontend` - The React UI client.
* `/arol-backend` - The Node.js REST API server.

---

## 🚀 Local Setup Instructions

### 1. Database Setup
1. Ensure PostgreSQL is installed and running.
2. Create a database named `arol_q2` (or your preferred name).
3. Execute the SQL scripts located in the backend folder to build the schemas (`app_tenant`, `app_operational`, etc.).
4. Run the seed scripts to populate the `companies`, `users`, and `machines` tables.
5. In the backend, run `node seed-passwords.js` to hash the seeded passwords securely.

### 2. Backend Setup
Navigate to the backend directory:
```bash
cd arol-backend
npm install
```

### 3. Ai-Engine Start
```bash
cd machine-ai-engine
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```