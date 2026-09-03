
---

# Machine-Chatbot (Frontend)

This directory contains the React/Vite frontend client for the AROL Industrial Platform. It handles the user interface, role-based routing, and interactions with both the Node.js backend and the AI multi-agent orchestration engine.

## ⚙️ Environment Configuration

Before running the frontend locally, you must configure the environment variables so the client knows where to send API requests.

1. Create a new file named `.env` in the root of the `machine-chatbot` folder.
2. Add the following line to the file:

```env
VITE_API_BASE_URL=http://localhost:5000/api

```

## 📂 Public Assets & Manuals

* `public/manuals/`: This directory contains all the official machine manuals (PDFs) used by the system. The application serves these files directly to the user interface, allowing technicians to open and view the documentation referenced by the AI during troubleshooting sessions.

## 🏗️ Project Structure

The source code is organized to prioritize consistency, modularity, and secure access control.

* **`src/App.jsx` (Routing & Permissions):**
This is the core entry point for application routing. It defines all system routes, maps them to their corresponding page components, and enforces Role-Based Access Control (RBAC). It dictates exactly which type of users (e.g., Technicians, Commercial users, Admins) possess the permissions required to access each specific route.
* **`src/components/ui/` (Reusable UI Elements):**
This folder contains globally shared UI components, including Modals, Filters, and Table objects. These components are designed to be reused across all pages to ensure a consistent design system and uniform data display throughout the platform.
* **`src/pages/` (Page Implementations):**
This directory contains the individual implementations for every page in the application. Each file represents a complete view (e.g., the Chat Interface, the Fleet Dashboard, or the Quotes Manager) that is imported and rendered by the router in `App.jsx`.