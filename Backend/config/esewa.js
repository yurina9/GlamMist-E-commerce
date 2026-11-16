const isProduction = process.env.NODE_ENV === "production";

export const getEsewaConfig = () => ({
  productCode:
    process.env.ESEWA_PRODUCT_CODE || (isProduction ? "" : "EPAYTEST"),
  secretKey:
    process.env.ESEWA_SECRET_KEY ||
    (isProduction ? "" : "8gBm/:&EnhH.1/q("),
  formUrl:
    process.env.ESEWA_FORM_URL ||
    (isProduction
      ? "https://epay.esewa.com.np/api/epay/main/v2/form"
      : "https://rc-epay.esewa.com.np/api/epay/main/v2/form"),
  statusUrl:
    process.env.ESEWA_STATUS_URL ||
    (isProduction
      ? "https://esewa.com.np/api/epay/transaction/status/"
      : "https://rc.esewa.com.np/api/epay/transaction/status/"),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
});
