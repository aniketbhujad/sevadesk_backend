import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db/connection.js';
import { config } from '../config/env.js';
import { logAudit } from '../services/auditService.js';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function login(req, res, next) {
  try {
    const { username, password } = loginSchema.parse(req.body);

    const [user] = await query('SELECT * FROM users WHERE username = ?', [username.trim()]);

    if (!user || !user.is_active) {
      await logAudit({
        action: 'LOGIN_FAILURE',
        entityType: 'USER',
        entityId: username,
        metadata: { reason: 'User not found or inactive' },
        ipAddress: req.ip,
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await logAudit({
        userId: user.id,
        username: user.username,
        action: 'LOGIN_FAILURE',
        entityType: 'USER',
        entityId: String(user.id),
        metadata: { reason: 'Incorrect password' },
        ipAddress: req.ip,
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
      },
      config.auth.jwtSecret,
      { expiresIn: config.auth.tokenExpiry }
    );

    // Set secure HTTP-only cookie
    res.cookie('sevadesk_token', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: config.isProduction ? 'none' : 'lax',
      maxAge: config.auth.cookieMaxAge,
    });

    await logAudit({
      userId: user.id,
      username: user.username,
      action: 'LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: String(user.id),
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    if (req.user) {
      await logAudit({
        userId: req.user.id,
        username: req.user.username,
        action: 'LOGOUT',
        entityType: 'USER',
        entityId: String(req.user.id),
        ipAddress: req.ip,
      });
    }

    res.clearCookie('sevadesk_token');
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res) {
  res.json({
    success: true,
    user: req.user,
  });
}
