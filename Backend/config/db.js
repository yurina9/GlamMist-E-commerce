import mongoose from "mongoose";

const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI?.trim();
    if (!mongoUri) {
        throw new Error("MONGO_URI is missing from Backend/.env");
    }

    const connectionUrl = new URL(mongoUri);
    if (!connectionUrl.pathname || connectionUrl.pathname === "/") {
        connectionUrl.pathname = "/4thproject";
    }

    await mongoose.connect(connectionUrl.toString());
    console.log("Db connected");
};

export default connectDB;