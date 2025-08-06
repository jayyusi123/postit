const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const mongoose = require('mongoose');
require('dotenv').config();

// Import routes
const procurementRoutes = require('./routes/procurement');
const logisticsRoutes = require('./routes/logistics');
const vendorRoutes = require('./routes/vendors');
const inventoryRoutes = require('./routes/inventory');
const authRoutes = require('./routes/auth');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { logger } = require('./config/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(limiter);
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/logistics_procurement', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  logger.info('Connected to MongoDB');
})
.catch((error) => {
  logger.error('MongoDB connection error:', error);
  process.exit(1);
});

// API Routes
const apiPrefix = process.env.API_PREFIX || '/api';
const apiVersion = process.env.API_VERSION || 'v1';

// Health check
app.get(`${apiPrefix}/health`, (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: apiVersion,
    service: 'N8N Logistics & Procurement API'
  });
});

// API Routes
app.use(`${apiPrefix}/${apiVersion}/auth`, authRoutes);
app.use(`${apiPrefix}/${apiVersion}/procurement`, procurementRoutes);
app.use(`${apiPrefix}/${apiVersion}/logistics`, logisticsRoutes);
app.use(`${apiPrefix}/${apiVersion}/vendors`, vendorRoutes);
app.use(`${apiPrefix}/${apiVersion}/inventory`, inventoryRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.originalUrl} does not exist`
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`API documentation available at http://localhost:${PORT}${apiPrefix}/docs`);
});

module.exports = app;