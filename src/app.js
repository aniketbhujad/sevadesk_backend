import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';

import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import serviceCatalogueRoutes from './routes/serviceCatalogueRoutes.js';
import serviceRecordRoutes from './routes/serviceRecordRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';

const app = express();

// Security headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows clean API consumption / dev mode
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration (supports local, EC2, Vercel deployments, and custom domains)
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  config.frontendOrigin,
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : []),
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, mobile, server health check)
      if (!origin) return callback(null, true);

      // Check allowed origins list, or any Vercel deployment (*.vercel.app), or dev mode
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        process.env.NODE_ENV !== 'production'
      ) {
        return callback(null, true);
      }

      return callback(new Error(`CORS policy does not allow access from origin ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
  })
);

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Parse cookies
app.use(cookieParser(config.auth.cookieSecret));

// Mount API routes
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/services', serviceCatalogueRoutes);
app.use('/api/service-records', serviceRecordRoutes);
app.use('/api/service-records', paymentRoutes); // maps /api/service-records/:id/payments
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);

// 404 handler for unknown routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized error handler
app.use(errorHandler);

export default app;
