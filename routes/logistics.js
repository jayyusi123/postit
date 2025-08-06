const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Shipment = require('../models/Shipment');
const { auth, authorize } = require('../middleware/auth');
const { logger } = require('../config/logger');

const router = express.Router();

/**
 * @route   GET /api/v1/logistics/shipments
 * @desc    Get all shipments with filtering and pagination
 * @access  Private
 */
router.get('/shipments', [
  auth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned']),
  query('priority').optional().isIn(['standard', 'expedited', 'urgent'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.carrier) filter['carrier.name'] = { $regex: req.query.carrier, $options: 'i' };
    if (req.query.trackingNumber) filter.trackingNumber = { $regex: req.query.trackingNumber, $options: 'i' };

    // Date range filtering
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
    }

    // Role-based filtering
    if (req.user.role === 'user') {
      filter.createdBy = req.user.id;
    }

    // Build sort object
    const sort = {};
    if (req.query.sortBy) {
      sort[req.query.sortBy] = req.query.sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.createdAt = -1; // Default sort by newest first
    }

    const shipments = await Shipment.find(filter)
      .populate('purchaseOrder', 'poNumber totalAmount')
      .populate('createdBy', 'name email department')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Shipment.countDocuments(filter);

    res.json({
      success: true,
      count: shipments.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      data: shipments
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/logistics/shipments/:id
 * @desc    Get single shipment
 * @access  Private
 */
router.get('/shipments/:id', auth, async (req, res, next) => {
  try {
    const shipment = await Shipment.findById(req.params.id)
      .populate('purchaseOrder')
      .populate('createdBy', 'name email department');

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    // Check authorization
    if (req.user.role === 'user' && shipment.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to access this shipment'
      });
    }

    res.json({
      success: true,
      data: shipment
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/logistics/shipments
 * @desc    Create new shipment
 * @access  Private (Logistics Manager, Admin)
 */
router.post('/shipments', [
  auth,
  authorize('logistics_manager', 'admin'),
  body('trackingNumber').notEmpty().withMessage('Tracking number is required'),
  body('carrier.name').notEmpty().withMessage('Carrier name is required'),
  body('origin.address.city').notEmpty().withMessage('Origin city is required'),
  body('origin.address.country').notEmpty().withMessage('Origin country is required'),
  body('destination.address.city').notEmpty().withMessage('Destination city is required'),
  body('destination.address.country').notEmpty().withMessage('Destination country is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('priority').optional().isIn(['standard', 'expedited', 'urgent']).withMessage('Invalid priority')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    // Check if tracking number already exists
    const existingShipment = await Shipment.findOne({ trackingNumber: req.body.trackingNumber });
    if (existingShipment) {
      return res.status(400).json({
        success: false,
        error: 'Tracking number already exists'
      });
    }

    const shipmentData = {
      ...req.body,
      createdBy: req.user.id
    };

    const shipment = new Shipment(shipmentData);
    await shipment.save();

    await shipment.populate([
      { path: 'purchaseOrder', select: 'poNumber totalAmount' },
      { path: 'createdBy', select: 'name email department' }
    ]);

    logger.info(`Shipment created: ${shipment.shipmentId} (${shipment.trackingNumber}) by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      data: shipment
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/v1/logistics/shipments/:id
 * @desc    Update shipment
 * @access  Private (Logistics Manager, Admin)
 */
router.put('/shipments/:id', [
  auth,
  authorize('logistics_manager', 'admin'),
  body('trackingNumber').optional().notEmpty().withMessage('Tracking number cannot be empty'),
  body('priority').optional().isIn(['standard', 'expedited', 'urgent']).withMessage('Invalid priority')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    let shipment = await Shipment.findById(req.params.id);

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    // Check if tracking number is being changed and if it already exists
    if (req.body.trackingNumber && req.body.trackingNumber !== shipment.trackingNumber) {
      const existingShipment = await Shipment.findOne({ trackingNumber: req.body.trackingNumber });
      if (existingShipment) {
        return res.status(400).json({
          success: false,
          error: 'Tracking number already exists'
        });
      }
    }

    shipment = await Shipment.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).populate([
      { path: 'purchaseOrder', select: 'poNumber totalAmount' },
      { path: 'createdBy', select: 'name email department' }
    ]);

    logger.info(`Shipment updated: ${shipment.shipmentId} (${shipment.trackingNumber}) by user ${req.user.id}`);

    res.json({
      success: true,
      data: shipment
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/logistics/shipments/:id/tracking-events
 * @desc    Add tracking event to shipment
 * @access  Private (Logistics Manager, Admin)
 */
router.post('/shipments/:id/tracking-events', [
  auth,
  authorize('logistics_manager', 'admin'),
  body('status').isIn(['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned']).withMessage('Invalid status'),
  body('description').optional().isString(),
  body('location.city').optional().isString(),
  body('location.country').optional().isString()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const shipment = await Shipment.findById(req.params.id);

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    const trackingEvent = {
      status: req.body.status,
      location: req.body.location || {},
      description: req.body.description || '',
      timestamp: new Date()
    };

    shipment.trackingEvents.push(trackingEvent);
    shipment.updateStatus(); // Update shipment status based on latest event

    // Update delivery date if delivered
    if (req.body.status === 'delivered' && !shipment.actualDeliveryDate) {
      shipment.actualDeliveryDate = new Date();
    }

    await shipment.save();

    logger.info(`Tracking event added to shipment: ${shipment.shipmentId} - Status: ${req.body.status} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Tracking event added successfully',
      data: shipment
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/logistics/shipments/:id/tracking
 * @desc    Get shipment tracking information
 * @access  Public (can be accessed with tracking number)
 */
router.get('/shipments/:id/tracking', async (req, res, next) => {
  try {
    const shipment = await Shipment.findById(req.params.id)
      .select('shipmentId trackingNumber status origin destination trackingEvents estimatedDeliveryDate actualDeliveryDate carrier priority');

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    res.json({
      success: true,
      data: shipment
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/logistics/tracking/:trackingNumber
 * @desc    Get shipment by tracking number (public endpoint)
 * @access  Public
 */
router.get('/tracking/:trackingNumber', async (req, res, next) => {
  try {
    const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber })
      .select('shipmentId trackingNumber status origin destination trackingEvents estimatedDeliveryDate actualDeliveryDate carrier priority');

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    res.json({
      success: true,
      data: shipment
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/v1/logistics/shipments/:id
 * @desc    Delete shipment
 * @access  Private (Admin only)
 */
router.delete('/shipments/:id', [
  auth,
  authorize('admin')
], async (req, res, next) => {
  try {
    const shipment = await Shipment.findById(req.params.id);

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Shipment not found'
      });
    }

    // Can only delete pending shipments
    if (shipment.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Can only delete pending shipments'
      });
    }

    await Shipment.findByIdAndDelete(req.params.id);

    logger.info(`Shipment deleted: ${shipment.shipmentId} (${shipment.trackingNumber}) by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Shipment deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/logistics/analytics/dashboard
 * @desc    Get logistics dashboard analytics
 * @access  Private (Logistics Manager, Admin)
 */
router.get('/analytics/dashboard', [
  auth,
  authorize('logistics_manager', 'admin')
], async (req, res, next) => {
  try {
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const startOfYear = new Date(currentDate.getFullYear(), 0, 1);

    // Shipments by status
    const statusCounts = await Shipment.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Monthly shipments
    const monthlyShipments = await Shipment.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          totalShipments: { $sum: 1 },
          deliveredShipments: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          }
        }
      }
    ]);

    // On-time delivery rate
    const deliveryPerformance = await Shipment.aggregate([
      {
        $match: {
          status: 'delivered',
          actualDeliveryDate: { $ne: null },
          estimatedDeliveryDate: { $ne: null },
          createdAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          totalDelivered: { $sum: 1 },
          onTimeDeliveries: {
            $sum: {
              $cond: [
                { $lte: ['$actualDeliveryDate', '$estimatedDeliveryDate'] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Top carriers by shipment count
    const topCarriers = await Shipment.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfYear }
        }
      },
      {
        $group: {
          _id: '$carrier.name',
          shipmentCount: { $sum: 1 },
          deliveredCount: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { shipmentCount: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Active shipments (in transit)
    const activeShipments = await Shipment.countDocuments({
      status: { $in: ['picked_up', 'in_transit', 'out_for_delivery'] }
    });

    // Exception count
    const exceptionsCount = await Shipment.countDocuments({
      status: 'exception',
      createdAt: { $gte: startOfMonth }
    });

    const onTimeRate = deliveryPerformance[0] 
      ? ((deliveryPerformance[0].onTimeDeliveries / deliveryPerformance[0].totalDelivered) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        statusCounts,
        monthlyShipments: monthlyShipments[0] || { totalShipments: 0, deliveredShipments: 0 },
        deliveryPerformance: {
          ...deliveryPerformance[0],
          onTimeRate: parseFloat(onTimeRate)
        },
        topCarriers,
        activeShipments,
        exceptionsCount,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/logistics/reports/delivery-performance
 * @desc    Get delivery performance report
 * @access  Private (Logistics Manager, Admin)
 */
router.get('/reports/delivery-performance', [
  auth,
  authorize('logistics_manager', 'admin'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  query('carrier').optional().isString()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

    const matchConditions = {
      status: 'delivered',
      actualDeliveryDate: { $ne: null },
      estimatedDeliveryDate: { $ne: null },
      createdAt: { $gte: startDate, $lte: endDate }
    };

    if (req.query.carrier) {
      matchConditions['carrier.name'] = { $regex: req.query.carrier, $options: 'i' };
    }

    const performanceData = await Shipment.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: '$carrier.name',
          totalDeliveries: { $sum: 1 },
          onTimeDeliveries: {
            $sum: {
              $cond: [
                { $lte: ['$actualDeliveryDate', '$estimatedDeliveryDate'] },
                1,
                0
              ]
            }
          },
          lateDeliveries: {
            $sum: {
              $cond: [
                { $gt: ['$actualDeliveryDate', '$estimatedDeliveryDate'] },
                1,
                0
              ]
            }
          },
          avgDeliveryTime: {
            $avg: {
              $divide: [
                { $subtract: ['$actualDeliveryDate', '$createdAt'] },
                1000 * 60 * 60 * 24 // Convert to days
              ]
            }
          }
        }
      },
      {
        $addFields: {
          onTimeRate: {
            $multiply: [
              { $divide: ['$onTimeDeliveries', '$totalDeliveries'] },
              100
            ]
          }
        }
      },
      { $sort: { onTimeRate: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        period: { startDate, endDate },
        carriers: performanceData,
        summary: {
          totalCarriers: performanceData.length,
          averageOnTimeRate: performanceData.length > 0 
            ? (performanceData.reduce((sum, carrier) => sum + carrier.onTimeRate, 0) / performanceData.length).toFixed(2)
            : 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;