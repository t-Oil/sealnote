const required = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

const missing = required.filter((name) => {
  const value = process.env[name];

  return !value || value.startsWith("replace-with-");
});

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

if (process.env.NODE_ENV === "production" && !process.env.NEXTAUTH_URL?.startsWith("https://")) {
  throw new Error("NEXTAUTH_URL must use https in production.");
}
