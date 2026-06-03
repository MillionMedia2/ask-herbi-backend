import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin";
import { AdminAuthRequest } from "../middleware/adminAuth";

const JWT_SECRET = process.env.JWT_SECRET || "askherbi-admin-dev-secret";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sanitizeAdmin = (admin: {
  _id: unknown;
  fullName: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: String(admin._id),
  fullName: admin.fullName,
  email: admin.email,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
});

/**
 * POST /api/admin/auth/signup
 * Body: { fullName, email, password }
 *
 * Creates an admin account. Open by default so a first admin can be bootstrapped
 * via Postman; if `ADMIN_SIGNUP_KEY` is set in the env, the request must include
 * a matching `x-admin-signup-key` header.
 */
export const adminSignup = async (req: Request, res: Response) => {
  try {
    const requiredKey = process.env.ADMIN_SIGNUP_KEY;
    if (requiredKey) {
      const provided = req.headers["x-admin-signup-key"];
      if (provided !== requiredKey) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid signup key" });
      }
    }

    const { fullName, email, password } = req.body ?? {};

    if (typeof fullName !== "string" || fullName.trim().length < 2) {
      return res
        .status(400)
        .json({ success: false, message: "fullName must be at least 2 characters" });
    }
    if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      return res
        .status(400)
        .json({ success: false, message: "A valid email is required" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res
        .status(400)
        .json({ success: false, message: "password must be at least 8 characters" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await Admin.findOne({ email: normalizedEmail });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "An admin with this email already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      password: hashed,
    });

    const token = jwt.sign({ id: String(admin._id) }, JWT_SECRET);

    return res.status(201).json({
      success: true,
      data: {
        token,
        admin: sanitizeAdmin(admin),
      },
    });
  } catch (error: any) {
    console.error("adminSignup error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create admin" });
  }
};

/**
 * POST /api/admin/auth/login
 * Body: { email, password }
 *
 * Returns a JWT WITHOUT an expiry claim. The token is valid until the admin
 * is deleted in the DB (the auth middleware checks the admin still exists).
 */
export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "email and password are required" });
    }

    const admin = await Admin.findOne({ email: email.trim().toLowerCase() });
    if (!admin) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: String(admin._id) }, JWT_SECRET);

    return res.json({
      success: true,
      data: {
        token,
        admin: sanitizeAdmin(admin),
      },
    });
  } catch (error: any) {
    console.error("adminLogin error:", error.message);
    return res.status(500).json({ success: false, message: "Login failed" });
  }
};

/**
 * GET /api/admin/auth/me
 * Authenticated. Returns the current admin profile.
 */
export const adminMe = async (req: AdminAuthRequest, res: Response) => {
  try {
    if (!req.adminId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const admin = await Admin.findById(req.adminId);
    if (!admin) {
      return res
        .status(401)
        .json({ success: false, message: "Admin not found" });
    }

    return res.json({ success: true, data: sanitizeAdmin(admin) });
  } catch (error: any) {
    console.error("adminMe error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load admin" });
  }
};

/**
 * PATCH /api/admin/auth/me
 * Authenticated. Updates the current admin's `fullName` and/or `password`.
 *
 * Body (all optional, but at least one updatable field is required):
 *   - fullName:        new display name (>= 2 chars after trim)
 *   - currentPassword: required when changing password
 *   - newPassword:     new password (>= 8 chars). Must be different from current.
 *
 * Email is intentionally not editable here — that needs a separate verification flow.
 */
export const updateAdminProfile = async (
  req: AdminAuthRequest,
  res: Response
) => {
  try {
    if (!req.adminId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const admin = await Admin.findById(req.adminId);
    if (!admin) {
      return res
        .status(401)
        .json({ success: false, message: "Admin not found" });
    }

    const { fullName, currentPassword, newPassword } = req.body ?? {};

    const updates: { fullName?: string; password?: string } = {};

    if (typeof fullName === "string") {
      const trimmed = fullName.trim();
      if (trimmed.length < 2) {
        return res.status(400).json({
          success: false,
          message: "fullName must be at least 2 characters",
        });
      }
      if (trimmed !== admin.fullName) {
        updates.fullName = trimmed;
      }
    }

    const wantsPasswordChange =
      typeof newPassword === "string" && newPassword.length > 0;

    if (wantsPasswordChange) {
      if (typeof currentPassword !== "string" || currentPassword.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Current password is required to change password",
        });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 8 characters",
        });
      }

      const ok = await bcrypt.compare(currentPassword, admin.password);
      if (!ok) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      const sameAsOld = await bcrypt.compare(newPassword, admin.password);
      if (sameAsOld) {
        return res.status(400).json({
          success: false,
          message: "New password must be different from current password",
        });
      }

      updates.password = await bcrypt.hash(newPassword, 10);
    }

    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No changes to apply" });
    }

    Object.assign(admin, updates);
    await admin.save();

    return res.json({ success: true, data: sanitizeAdmin(admin) });
  } catch (error: any) {
    console.error("updateAdminProfile error:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update profile" });
  }
};
