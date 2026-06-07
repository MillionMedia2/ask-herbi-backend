import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin";

const JWT_SECRET = process.env.JWT_SECRET || "askherbi-admin-dev-secret";

export interface AdminAuthRequest extends Request {
  adminId?: string;
}

/**
 * Verifies the `Authorization: Bearer <token>` header.
 * The token has no expiry by design: tokens stay valid until they are deleted server-side.
 */
export const requireAdminAuth = async (
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res
        .status(401)
        .json({ success: false, message: "Missing admin token" });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id?: string };
    if (!decoded?.id) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid admin token" });
    }

    const admin = await Admin.findById(decoded.id).select("_id");
    if (!admin) {
      return res
        .status(401)
        .json({ success: false, message: "Admin no longer exists" });
    }

    req.adminId = String(admin._id);
    return next();
  } catch (error: any) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid admin token" });
  }
};
