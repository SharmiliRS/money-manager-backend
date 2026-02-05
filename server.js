require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`[${timestamp}] ${method} ${url} from ${ip}`);
  
  if (method === 'POST' || method === 'PUT') {
    console.log('📦 Request Body:', JSON.stringify(req.body, null, 2));
  }
  
  next();
});

// Middlewares
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  dbName: "money_manager_db",
})
.then(() => console.log("✅ MongoDB Connected Successfully"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));

// Import routes
const authRoutes = require("./routes/auth");
const incomeRoutes = require("./routes/income");
const expenseRoutes = require("./routes/expense");
const transactionsRoutes = require("./routes/transactions");
const dashboardRoutes = require("./routes/dashboard");

// Routes for API
app.use("/api/auth", authRoutes);
app.use("/api/income", incomeRoutes);
app.use("/api/expense", expenseRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Health check route
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
    }
  });
});

// API info route
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
    }
  });
});

// List all registered routes (for debugging)
app.get("/api/routes", (req, res) => {
  const routes = [];
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Routes registered directly on app
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      // Routes registered as router
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: middleware.regexp.toString().replace(/^\/\^|\/\$\/?/g, '') + handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  
  res.json({ routes });
});

// 404 handler for undefined routes
app.use("*", (req, res) => {
  res.status(404).json({ 
    error: "Route not found",
    path: req.originalUrl,
    availableRoutes: ["/api/auth", "/api/income", "/api/expense", "/api/transactions", "/api/dashboard"]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err);
  res.status(500).json({ 
    error: "Internal Server Error",
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Server start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 API info: http://localhost:${PORT}/`);
  console.log(`🔍 Routes: http://localhost:${PORT}/api/routes`);
});