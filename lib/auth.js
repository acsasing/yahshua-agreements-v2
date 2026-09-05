import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;

// Same shape as V1's token: {id, email, name, role} only — never job-
// function flags (isCsmoApprover etc.) or permissions, which must always
// be re-checked fresh from the DB at the moment of a sensitive action
// (see lib/permissions.js). A 7-day token that carried "you can approve
// discounts" as a claim would still say so a week after that flag was
// revoked; re-fetching avoids that entirely.
export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    SECRET,
    { expiresIn: "7d" }
  );
}

export function getUserFromRequest(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}
