import { verifyToken } from "../utils/jwt.js";

const adminAuth = async (req, res, next) => {
  try {
    const { token } = req.headers;

    if (!token) {
      return res.json({
        success: false,
        message: "Not Authorized  login again",
      });
    }
    const token_decode = await verifyToken(token);
    if (
      token_decode.admin !== true ||
      token_decode.email !== process.env.ADMIN_EMAIL
    ) {
      return res.json({
        success: false,
        message: "Not Authorized  login again",
      });
    }
    next();
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

export default adminAuth;
