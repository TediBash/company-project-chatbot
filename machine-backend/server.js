import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';

import { testConnection } from './src/config/db.js';

import tenantRoutes from './src/modules/tenant/tenant.routes.js';
import authRoutes from './src/modules/auth/auth.routes.js';
import usersRoutes from './src/modules/users/users.routes.js';
import machinesRoutes from './src/modules/machines/machines.routes.js';
import companiesRoutes from './src/modules/companies/companies.routes.js';
import modelsRoutes from './src/modules/models/models.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json());

app.use(morgan('dev'));

// 2. Add a simple Logger Middleware so you can see requests in the CMD
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

// API Routes
app.use('/api/public/tenant', tenantRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/machines', machinesRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/models', modelsRoutes);

app.listen(PORT, async () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  await testConnection();
});