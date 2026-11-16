import { SignJWT, jwtVerify } from "jose";

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
};

export const createToken = (payload) =>
  new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).sign(getSecret());

export const verifyToken = async (token) => {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ["HS256"],
  });
  return payload;
};
