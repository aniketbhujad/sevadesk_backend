import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server dir or root dir
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const dbUrl = process.env.DATABASE_URL || '';
const isPostgres = dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://') || process.env.DB_CLIENT === 'pg';

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '5000', 10),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',

  db: {
    url: dbUrl,
    isPostgres,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || (isPostgres ? '5432' : '3306'), 10),
    name: process.env.DB_NAME || 'neondb',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }, // Required for Neon
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'sevadesk_default_secure_jwt_secret_key_2026_xyz',
    cookieSecret: process.env.COOKIE_SECRET || 'sevadesk_cookie_secret_key_2026',
    tokenExpiry: '24h',
    cookieMaxAge: 24 * 60 * 60 * 1000, // 24 hours
  },

  centreDefaults: {
    name: process.env.CENTRE_NAME || 'SevaDesk CSC Kendra',
    code: process.env.CENTRE_CODE || 'CSC-2026-IND',
    phone: process.env.CENTRE_PHONE || '+91 9876543210',
    address: process.env.CENTRE_ADDRESS || 'Shop No. 4, Main Bazar, Opposite Post Office',
    receiptFooter: process.env.RECEIPT_FOOTER || 'Thank you for visiting SevaDesk. Retain this receipt for your reference.',
    currency: 'INR',
    timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  },

  sms: {
    // AWS is optional; defaults to false so app runs completely safe in Mock Mode
    enabled: process.env.SMS_ENABLED === 'true',
    region: process.env.AWS_REGION || 'ap-south-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || null,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || null,
    originationIdentity: process.env.SMS_ORIGINATION_IDENTITY || null,
    configurationSet: process.env.SMS_CONFIGURATION_SET || null,
    senderId: process.env.SMS_SENDER_ID || null,
    template: process.env.SMS_TEMPLATE || '{CENTRE_NAME}: Receipt {RECEIPT_NO}. Service: {SERVICE_NAME}. Total: Rs {TOTAL}. Paid: Rs {PAID_TO_DATE}. Balance: Rs {BALANCE}. Thank you.',
  },
};
