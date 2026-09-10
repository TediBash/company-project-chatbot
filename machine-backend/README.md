
---

# Machine-Backend (Node.js REST API)

This directory contains the backend REST API for the AROL Industrial Platform. It handles multi-tenant data isolation, role-based access control, authentication, and database connectivity.

## ⚙️ Environment Configuration

Before running the backend locally, you must configure the environment variables to connect to the PostgreSQL database and secure the JWT authentication.

1. Create a new file named `.env` in the root of the `machine-backend` folder.
2. Add the following content to the file:

```env
# arol-backend/.env
PORT=5000

# PostgreSQL Database Configuration
DB_USER=postgres
DB_PASSWORD=password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=MachineChatbot

# Pool Configuration
DB_MAX_CONNECTIONS=20
DB_IDLE_TIMEOUT_MS=30000

JWT_SECRET=your_super_secret_jwt_key_here_arol_q2

```

*(Note: Ensure the `DB_PASSWORD` matches the postgres superuser password you set during your PostgreSQL database installation).*

## 🏗️ Project Structure and Architecture

The backend is organized using a highly modular pattern to support scalability and strict multi-tenant data isolation.

* **`server.js`:**
The main entry point of the backend application. It initializes the server and contains the definitions and bindings for all the API routes across the platform.
* **`src/config/db.js`:**
Manages the database connection pool. It contains the core functions required to connect to the PostgreSQL database and safely execute queries.
* **`src/middleware/`:**
Contains the security and authorization interceptors. This includes middleware functions to validate JWT authentication tokens and enforce Role-Based Access Control (RBAC) by requiring specific roles before an API endpoint can be executed.
* **`src/modules/auth/auth.controller.js`:**
Handles user authentication. This file contains the login functions and logic where the JWT token fields and payloads are generated and assigned to the user upon a successful login.

### 🏢 Multi-Tenant Data Isolation & Theming

This backend is strictly designed to be **multi-tenant**.

* **Row-Level Security (RLS) via Tokens:** When a user logs in, their specific `companyId` is embedded directly inside their JWT token. The backend uses this field to automatically filter all database queries, ensuring users can only ever access data belonging to their specific tenant.
* **Dynamic Branding:** Alongside the `companyId`, the token payload also securely stores the `primary_color` and `secondary_color` assigned to that tenant. This allows the frontend to instantly apply personalized, company-specific color theming to the user interface upon login.

### 📦 Modular Entity Pattern

Inside the **`src/modules/`** directory, the application is divided into sub-folders for each distinct Entity (e.g., users, machines, quotes, tickets). Every entity folder follows a strict structural pattern:

* **`controller.js`:** Contains all the implemented business logic and functional operations for that specific entity.
* **`routes.js`:** Defines the specific API endpoints for the entity, binds the required role-based permissions to each route, and maps the route to its corresponding controller function.

## Copyright and License

Copyright (c) 2026 Tedi Bashuri. All rights reserved.

This project is strictly for viewing purposes. It may not be copied, modified, or distributed without express written permission. See the [LICENSE](LICENSE) file for more details.