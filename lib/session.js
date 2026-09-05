// sessionStorage, not localStorage — matching V1's deliberate choice:
// closing the browser ends the session rather than persisting indefinitely.
const TOKEN_KEY = "yah_v2_token";
const USER_KEY = "yah_v2_user";

export function saveSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function hasPermission(key) {
  const user = getUser();
  return !!user?.permissions?.includes(key);
}
