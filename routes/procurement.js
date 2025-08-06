const express = require('express');
const { body, validationResult, query } = require('express-validator');
const PurchaseOrder = require('../models/PurchaseOrder');
const { auth, authorize } = require('../middleware/auth');
const { logger } = require('../config/logger');

const router = express.Router();

/**
 * @route   GET /api/v1/procurement/purchase-orders
 * @desc    Get all purchase orders with filtering, pagination, and sorting
 * @access  Private
 */
router.get('/purchase-orders', [
  auth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['draft', 'pending_approval', 'approved', 'sent', 'acknowledged', 'partially_received', 'completed', 'cancelled']),
  query('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
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
    if (req.query.department) filter.department = req.query.department;
    if (req.query.vendor) filter.vendor = req.query.vendor;

    // Date range filtering
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
    }

    // Role-based filtering
    if (req.user.role === 'user') {
      filter.requestedBy = req.user.id;
    }

    // Build sort object
    const sort = {};
    if (req.query.sortBy) {
      sort[req.query.sortBy] = req.query.sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.createdAt = -1; // Default sort by newest first
    }

    const purchaseOrders = await PurchaseOrder.find(filter)
      .populate('vendor', 'name vendorId category')
      .populate('requestedBy', 'name email department')
      .populate('approvedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await PurchaseOrder.countDocuments(filter);

    res.json({
      success: true,
      count: purchaseOrders.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      data: purchaseOrders
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/procurement/purchase-orders/:id
 * @desc    Get single purchase order
 * @access  Private
 */
router.get('/purchase-orders/:id', auth, async (req, res, next) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id)
      .populate('vendor')
      .populate('requestedBy', 'name email department')
      .populate('approvedBy', 'name email')
      .populate('approvalHistory.user', 'name email');

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      });
    }

    // Check authorization
    if (req.user.role === 'user' && purchaseOrder.requestedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to access this purchase order'
      });
    }

    res.json({
      success: true,
      data: purchaseOrder
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/procurement/purchase-orders
 * @desc    Create new purchase order
 * @access  Private
 */
router.post('/purchase-orders', [
  auth,
  body('vendor').isMongoId().withMessage('Valid vendor ID is required'),
  body('department').notEmpty().withMessage('Department is required'),
  body('lineItems').isArray({ min: 1 }).withMessage('At least one line item is required'),
  body('lineItems.*.itemId').notEmpty().withMessage('Item ID is required for each line item'),
  body('lineItems.*.description').notEmpty().withMessage('Description is required for each line item'),
  body('lineItems.*.quantity').isFloat({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('lineItems.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be non-negative'),
  body('lineItems.*.category').isIn(['materials', 'services', 'equipment', 'supplies']).withMessage('Invalid category')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    // Calculate line item totals
    const lineItems = req.body.lineItems.map(item => ({
      ...item,
      totalPrice: item.quantity * item.unitPrice
    }));

    const purchaseOrderData = {
      ...req.body,
      lineItems,
      requestedBy: req.user.id
    };

    const purchaseOrder = new PurchaseOrder(purchaseOrderData);
    await purchaseOrder.save();

    await purchaseOrder.populate([
      { path: 'vendor', select: 'name vendorId category' },
      { path: 'requestedBy', select: 'name email department' }
    ]);

    logger.info(`Purchase order created: ${purchaseOrder.poNumber} by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      data: purchaseOrder
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/v1/procurement/purchase-orders/:id
 * @desc    Update purchase order
 * @access  Private
 */
router.put('/purchase-orders/:id', [
  auth,
  body('vendor').optional().isMongoId().withMessage('Valid vendor ID is required'),
  body('lineItems').optional().isArray({ min: 1 }).withMessage('At least one line item is required'),
  body('lineItems.*.quantity').optional().isFloat({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('lineItems.*.unitPrice').optional().isFloat({ min: 0 }).withMessage('Unit price must be non-negative')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    let purchaseOrder = await PurchaseOrder.findById(req.params.id);

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      });
    }

    // Check authorization
    if (req.user.role === 'user' && purchaseOrder.requestedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this purchase order'
      });
    }

    // Can only update draft purchase orders
    if (purchaseOrder.status !== 'draft' && req.user.role !== 'procurement_manager' && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        error: 'Can only update draft purchase orders'
      });
    }

    // Calculate line item totals if lineItems are being updated
    if (req.body.lineItems) {
      req.body.lineItems = req.body.lineItems.map(item => ({
        ...item,
        totalPrice: item.quantity * item.unitPrice
      }));
    }

    purchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).populate([
      { path: 'vendor', select: 'name vendorId category' },
      { path: 'requestedBy', select: 'name email department' },
      { path: 'approvedBy', select: 'name email' }
    ]);

    logger.info(`Purchase order updated: ${purchaseOrder.poNumber} by user ${req.user.id}`);

    res.json({
      success: true,
      data: purchaseOrder
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/procurement/purchase-orders/:id/approve
 * @desc    Approve purchase order
 * @access  Private (Procurement Manager, Admin)
 */
router.post('/purchase-orders/:id/approve', [
  auth,
  authorize('procurement_manager', 'admin'),
  body('comments').optional().isString()
], async (req, res, next) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      });
    }

    if (purchaseOrder.status !== 'pending_approval' && purchaseOrder.status !== 'draft') {
      return res.status(400).json({
        success: false,
        error: 'Purchase order cannot be approved in current status'
      });
    }

    purchaseOrder.status = 'approved';
    purchaseOrder.approvedBy = req.user.id;
    purchaseOrder.approvalHistory.push({
      user: req.user.id,
      action: 'approved',
      comments: req.body.comments || '',
      timestamp: new Date()
    });

    await purchaseOrder.save();

    logger.info(`Purchase order approved: ${purchaseOrder.poNumber} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Purchase order approved successfully',
      data: purchaseOrder
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/procurement/purchase-orders/:id/reject
 * @desc    Reject purchase order
 * @access  Private (Procurement Manager, Admin)
 */
router.post('/purchase-orders/:id/reject', [
  auth,
  authorize('procurement_manager', 'admin'),
  body('comments').notEmpty().withMessage('Comments are required for rejection')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const purchaseOrder = await PurchaseOrder.findById(req.params.id);

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      });
    }

    purchaseOrder.status = 'draft'; // Return to draft for revision
    purchaseOrder.approvalHistory.push({
      user: req.user.id,
      action: 'rejected',
      comments: req.body.comments,
      timestamp: new Date()
    });

    await purchaseOrder.save();

    logger.info(`Purchase order rejected: ${purchaseOrder.poNumber} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Purchase order rejected successfully',
      data: purchaseOrder
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/procurement/purchase-orders/:id/submit
 * @desc    Submit purchase order for approval
 * @access  Private
 */
router.post('/purchase-orders/:id/submit', auth, async (req, res, next) => {
  try {
    let purchaseOrder = await PurchaseOrder.findById(req.params.id);

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      });
    }

    // Check authorization
    if (req.user.role === 'user' && purchaseOrder.requestedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to submit this purchase order'
      });
    }

    if (purchaseOrder.status !== 'draft') {
      return res.status(400).json({
        success: false,
        error: 'Only draft purchase orders can be submitted'
      });
    }

    purchaseOrder.status = 'pending_approval';
    await purchaseOrder.save();

    logger.info(`Purchase order submitted for approval: ${purchaseOrder.poNumber} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Purchase order submitted for approval',
      data: purchaseOrder
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/v1/procurement/purchase-orders/:id
 * @desc    Delete purchase order
 * @access  Private
 */
router.delete('/purchase-orders/:id', auth, async (req, res, next) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id);

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      });
    }

    // Check authorization
    if (req.user.role === 'user' && purchaseOrder.requestedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this purchase order'
      });
    }

    // Can only delete draft purchase orders
    if (purchaseOrder.status !== 'draft') {
      return res.status(400).json({
        success: false,
        error: 'Can only delete draft purchase orders'
      });
    }

    await PurchaseOrder.findByIdAndDelete(req.params.id);

    logger.info(`Purchase order deleted: ${purchaseOrder.poNumber} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Purchase order deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/procurement/analytics/dashboard
 * @desc    Get procurement dashboard analytics
 * @access  Private (Procurement Manager, Admin)
 */
router.get('/analytics/dashboard', [
  auth,
  authorize('procurement_manager', 'admin')
], async (req, res, next) => {
  try {
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const startOfYear = new Date(currentDate.getFullYear(), 0, 1);

    // Total purchase orders by status
    const statusCounts = await PurchaseOrder.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Monthly spending
    const monthlySpending = await PurchaseOrder.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth },
          status: { $in: ['approved', 'sent', 'acknowledged', 'partially_received', 'completed'] }
        }
      },
      {
        $group: {
          _id: null,
          totalSpending: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Top vendors by spending
    const topVendors = await PurchaseOrder.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfYear },
          status: { $in: ['approved', 'sent', 'acknowledged', 'partially_received', 'completed'] }
        }
      },
      {
        $group: {
          _id: '$vendor',
          totalSpending: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'vendors',
          localField: '_id',
          foreignField: '_id',
          as: 'vendorInfo'
        }
      },
      {
        $unwind: '$vendorInfo'
      },
      {
        $project: {
          vendorName: '$vendorInfo.name',
          vendorId: '$vendorInfo.vendorId',
          totalSpending: 1,
          orderCount: 1
        }
      },
      {
        $sort: { totalSpending: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Pending approvals
    const pendingApprovals = await PurchaseOrder.countDocuments({
      status: 'pending_approval'
    });

    res.json({
      success: true,
      data: {
        statusCounts,
        monthlySpending: monthlySpending[0] || { totalSpending: 0, count: 0 },
        topVendors,
        pendingApprovals,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;