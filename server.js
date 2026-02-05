require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// ============================
// ✅ Middlewares
// ============================
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const ip = req.ip || req.connection.remoteAddress;

  console.log(`[${timestamp}] ${method} ${url} from ${ip}`);
  if (method === "POST" || method === "PUT") {
    console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));
  }
  next();
});

// ============================
// ✅ Import Routes
// ============================
const authRoutes = require("./routes/auth");
const incomeRoutes = require("./routes/income");
const expenseRoutes = require("./routes/expense");
const transactionsRoutes = require("./routes/transactions");
const dashboardRoutes = require("./routes/dashboard");

// ============================
// ✅ MongoDB Connection
// ============================
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set in environment variables");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI, {
    dbName: "money_manager_db", // optional if included in URI
  })
  .then(() => {
    console.log("✅ MongoDB Connected Successfully");

    // Start server ONLY after MongoDB connection
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/health`);
      console.log(`📊 API info: http://localhost:${PORT}/`);
      console.log(`🔍 Routes: http://localhost:${PORT}/api/routes`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1); // Stop server if DB fails
  });


// ============================
// ✅ API Routes
// ============================
app.use("/api/auth", authRoutes);
app.use("/api/income", incomeRoutes);
app.use("/api/expense", expenseRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ============================
// ✅ Health Check Route
// ============================
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Money Manager API is running",
    timestamp: new Date().toISOString(),
    routes: {
      auth: "/api/auth",
      income: "/api/income",
      expense: "/api/expense",
      transactions: "/api/transactions",
      dashboard: "/api/dashboard",
    },
  });
});

// ============================
// ✅ API Info Route
// ============================
app.get("/", (req, res) => {
  res.json({
    message: "💰 Money Manager API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      income: "/api/income",
      expense: "/api/expense",
      transactions: "/api/transactions",
      dashboard: "/api/dashboard",
    },
  });
});

// ============================
// ✅ List All Routes (Debugging)
// ============================
app.get("/api/routes", (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Routes registered directly on app
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods),
      });
    } else if (middleware.name === "router") {
      // Routes registered as router
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path:
              middleware.regexp
                .toString()
                .replace(/^\/\^|\/\$\/?/g, "") + handler.route.path,
            methods: Object.keys(handler.route.methods),
          });
        }
      });
    }
  });
  res.json({ routes });
});

// ============================
// ✅ 404 Handler
// ============================
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    availableRoutes: [
      "/api/auth",
      "/api/income",
      "/api/expense",
      "/api/transactions",
      "/api/dashboard",
    ],
  });
});

// ============================
// ✅ Error Handling Middleware
// ============================
app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});
