import { verifyToken } from "../utils/jwt.js";

const authUser = async(req,res,next)=>{
    const {token} = req.headers;

    if (!token) {
        return res.json({success:false, message:"Not Authorized login again"})
        
    }
    try {
        const token_decode = await verifyToken(token)
        req.body.userId = token_decode.id
        next()
    } catch (error) {
        console.log(error);
        res.json({success:false, message:error.message})
        
    }

}

export default authUser