const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Vendor = require('../models/Vendor');
const { auth, authorize } = require('../middleware/auth');
const { logger } = require('../config/logger');

const router = express.Router();

/**
 * @route   GET /api/v1/vendors
 * @desc    Get all vendors with filtering and pagination
 * @access  Private
 */
router.get('/', [
  auth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['active', 'inactive', 'blacklisted', 'pending_approval']),
  query('category').optional().isIn(['materials', 'services', 'equipment', 'logistics', 'technology', 'other'])
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
    if (req.query.category) filter.category = req.query.category;
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { vendorId: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    if (req.query.sortBy) {
      sort[req.query.sortBy] = req.query.sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.name = 1; // Default sort by name
    }

    const vendors = await Vendor.find(filter)
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select('-bankDetails'); // Exclude sensitive bank details

    const total = await Vendor.countDocuments(filter);

    res.json({
      success: true,
      count: vendors.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      data: vendors
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/vendors/:id
 * @desc    Get single vendor
 * @access  Private
 */
router.get('/:id', auth, async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    // Hide bank details for non-authorized users
    let vendorData = vendor.toObject();
    if (req.user.role !== 'procurement_manager' && req.user.role !== 'admin') {
      delete vendorData.bankDetails;
    }

    res.json({
      success: true,
      data: vendorData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/vendors
 * @desc    Create new vendor
 * @access  Private (Procurement Manager, Admin)
 */
router.post('/', [
  auth,
  authorize('procurement_manager', 'admin'),
  body('name').notEmpty().withMessage('Vendor name is required'),
  body('category').isIn(['materials', 'services', 'equipment', 'logistics', 'technology', 'other']).withMessage('Invalid category'),
  body('contacts').isArray({ min: 1 }).withMessage('At least one contact is required'),
  body('contacts.*.name').notEmpty().withMessage('Contact name is required'),
  body('contacts.*.email').isEmail().withMessage('Valid contact email is required'),
  body('contacts.*.phone').notEmpty().withMessage('Contact phone is required'),
  body('contacts.*.position').notEmpty().withMessage('Contact position is required'),
  body('paymentTerms').optional().isIn(['NET30', 'NET60', 'NET90', 'COD', 'PREPAID']).withMessage('Invalid payment terms')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    // Ensure only one primary contact
    const primaryContacts = req.body.contacts.filter(contact => contact.isPrimary);
    if (primaryContacts.length > 1) {
      return res.status(400).json({
        success: false,
        error: 'Only one primary contact is allowed'
      });
    }

    const vendorData = {
      ...req.body,
      createdBy: req.user.id
    };

    const vendor = new Vendor(vendorData);
    await vendor.save();

    await vendor.populate('createdBy', 'name email');

    logger.info(`Vendor created: ${vendor.name} (${vendor.vendorId}) by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/v1/vendors/:id
 * @desc    Update vendor
 * @access  Private (Procurement Manager, Admin)
 */
router.put('/:id', [
  auth,
  authorize('procurement_manager', 'admin'),
  body('name').optional().notEmpty().withMessage('Vendor name cannot be empty'),
  body('category').optional().isIn(['materials', 'services', 'equipment', 'logistics', 'technology', 'other']).withMessage('Invalid category'),
  body('contacts').optional().isArray({ min: 1 }).withMessage('At least one contact is required'),
  body('paymentTerms').optional().isIn(['NET30', 'NET60', 'NET90', 'COD', 'PREPAID']).withMessage('Invalid payment terms'),
  body('status').optional().isIn(['active', 'inactive', 'blacklisted', 'pending_approval']).withMessage('Invalid status')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    let vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    // Validate contacts if being updated
    if (req.body.contacts) {
      const primaryContacts = req.body.contacts.filter(contact => contact.isPrimary);
      if (primaryContacts.length > 1) {
        return res.status(400).json({
          success: false,
          error: 'Only one primary contact is allowed'
        });
      }
    }

    vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).populate('createdBy', 'name email');

    logger.info(`Vendor updated: ${vendor.name} (${vendor.vendorId}) by user ${req.user.id}`);

    res.json({
      success: true,
      data: vendor
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/v1/vendors/:id
 * @desc    Delete vendor
 * @access  Private (Admin only)
 */
router.delete('/:id', [
  auth,
  authorize('admin')
], async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    // Check if vendor has active purchase orders
    const PurchaseOrder = require('../models/PurchaseOrder');
    const activePOs = await PurchaseOrder.countDocuments({
      vendor: req.params.id,
      status: { $in: ['approved', 'sent', 'acknowledged', 'partially_received'] }
    });

    if (activePOs > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete vendor with active purchase orders'
      });
    }

    await Vendor.findByIdAndDelete(req.params.id);

    logger.info(`Vendor deleted: ${vendor.name} (${vendor.vendorId}) by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Vendor deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/vendors/:id/approve
 * @desc    Approve vendor
 * @access  Private (Procurement Manager, Admin)
 */
router.post('/:id/approve', [
  auth,
  authorize('procurement_manager', 'admin')
], async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    if (vendor.status !== 'pending_approval') {
      return res.status(400).json({
        success: false,
        error: 'Vendor is not pending approval'
      });
    }

    vendor.status = 'active';
    await vendor.save();

    logger.info(`Vendor approved: ${vendor.name} (${vendor.vendorId}) by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Vendor approved successfully',
      data: vendor
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/vendors/:id/blacklist
 * @desc    Blacklist vendor
 * @access  Private (Procurement Manager, Admin)
 */
router.post('/:id/blacklist', [
  auth,
  authorize('procurement_manager', 'admin'),
  body('reason').notEmpty().withMessage('Reason for blacklisting is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    vendor.status = 'blacklisted';
    vendor.notes = `${vendor.notes || ''}\n[BLACKLISTED] ${new Date().toISOString()}: ${req.body.reason}`;
    await vendor.save();

    logger.warn(`Vendor blacklisted: ${vendor.name} (${vendor.vendorId}) by user ${req.user.id}. Reason: ${req.body.reason}`);

    res.json({
      success: true,
      message: 'Vendor blacklisted successfully',
      data: vendor
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/vendors/:id/performance
 * @desc    Get vendor performance metrics
 * @access  Private (Procurement Manager, Admin)
 */
router.get('/:id/performance', [
  auth,
  authorize('procurement_manager', 'admin')
], async (req, res, next) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    const PurchaseOrder = require('../models/PurchaseOrder');
    
    // Get performance metrics for the last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const performanceData = await PurchaseOrder.aggregate([
      {
        $match: {
          vendor: vendor._id,
          createdAt: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalValue: { $sum: '$totalAmount' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          onTimeDeliveries: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$actualDeliveryDate', null] },
                    { $lte: ['$actualDeliveryDate', '$expectedDeliveryDate'] }
                  ]
                },
                1,
                0
              ]
            }
          },
          avgOrderValue: { $avg: '$totalAmount' }
        }
      }
    ]);

    const performance = performanceData[0] || {
      totalOrders: 0,
      totalValue: 0,
      completedOrders: 0,
      onTimeDeliveries: 0,
      avgOrderValue: 0
    };

    // Calculate performance percentages
    const completionRate = performance.totalOrders > 0 
      ? ((performance.completedOrders / performance.totalOrders) * 100).toFixed(2)
      : 0;

    const onTimeDeliveryRate = performance.completedOrders > 0
      ? ((performance.onTimeDeliveries / performance.completedOrders) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        vendor: {
          id: vendor._id,
          name: vendor.name,
          vendorId: vendor.vendorId,
          rating: vendor.rating
        },
        performance: {
          ...performance,
          completionRate: parseFloat(completionRate),
          onTimeDeliveryRate: parseFloat(onTimeDeliveryRate)
        },
        period: {
          from: twelveMonthsAgo,
          to: new Date()
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;