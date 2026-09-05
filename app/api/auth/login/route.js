import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@lib/prisma.js";
import { signToken } from "@lib/auth.js";
import { getPermissionsForRole } from "@lib/permissions.js";

export const runtime = "nodejs";

export async function POST(req) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "This account has been deactivated." }, { status: 403 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const token = signToken(user);
  const permissions = await getPermissionsForRole(user.role);

  return NextResponse.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions },
  });
}
