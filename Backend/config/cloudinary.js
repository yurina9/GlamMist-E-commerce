import {v2 as cloudinary} from 'cloudinary';

const connectCloudinary = async ()=>{
    const requiredEnv = [
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
    ];
    const missingEnv = requiredEnv.filter((key) => !process.env[key]?.trim());

    if (missingEnv.length) {
        throw new Error(`Missing Cloudinary configuration: ${missingEnv.join(", ")}`);
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME.trim();
    const apiKey = process.env.CLOUDINARY_API_KEY.trim();
    const apiSecret = process.env.CLOUDINARY_API_SECRET.trim();

    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret
    })

}

export default connectCloudinary;