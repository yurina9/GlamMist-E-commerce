const isProduction = process.env.NODE_ENV === "production";

export const getKhaltiConfig = () => ({
  secretKey: process.env.KHALTI_SECRET_KEY || "",
  apiBaseUrl:
    process.env.KHALTI_API_BASE_URL ||
    (isProduction
      ? "https://khalti.com/api/v2"
      : "https://dev.khalti.com/api/v2"),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
});
