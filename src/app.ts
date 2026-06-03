import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import aiRoutes from "./routes/ai.routes";
import productsRoute from "./routes/productRoutes";
import adminProductsRoute from "./routes/adminProductRoutes";
import adminAuthRoute from "./routes/adminAuthRoutes";
import classifyRoute from "./routes/classifyRoutes";
import messageRoute from "./routes/message.routes";
import conversationRoute from "./routes/conversation.routes";
import recommendRoute from "./routes/recommendRoutes";
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
app.use("/api", adminAuthRoute);
app.use("/api", adminProductsRoute);
app.use("/api", classifyRoute);
app.use("/api", recommendRoute);
app.use("/api", messageRoute);
app.use("/api", conversationRoute);

export default app;
