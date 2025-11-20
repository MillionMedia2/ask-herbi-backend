import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import aiRoutes from "./routes/ai.routes";
import productsRoute from "./routes/productRoutes";
import classifyRoute from "./routes/classifyRoutes";
import morgan from "morgan";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: "*",
    methods: "*",
    allowedHeaders: "*",
  })
);

app.use(express.json());
app.use(morgan("dev"));

app.get("/ping", (req, res) => {
  return res.json({
    message: "pong - the server is running",
  });
});
app.use("/api", aiRoutes);
app.use("/api", productsRoute);
app.use("/api", classifyRoute);

export default app;
