import app from "./app";
import dotenv from "dotenv";
import connectDB from "./config/db";
import startProductCron from "./cron/productCron";

dotenv.config();

// Connect to MongoDB
connectDB();
startProductCron();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});
