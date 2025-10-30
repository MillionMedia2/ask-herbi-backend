import express from "express";
import dotenv from "dotenv";
import aiRoutes from "./routes/ai.routes";

dotenv.config();

const app = express();

app.use(express.json());
app.get('/ping', (req, res) => {
  return res.json({
    message: "pong - the server is running",
  });
});
app.use("/api", aiRoutes);

export default app;
