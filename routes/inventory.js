const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Inventory = require('../models/Inventory');
const { auth, authorize } = require('../middleware/auth');
const { logger } = require('../config/logger');

const router = express.Router();

/**
 * @route   GET /api/v1/inventory
 * @desc    Get all inventory items with filtering and pagination
 * @access  Private
 */
router.get('/', [
  auth,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('category').optional().isIn(['raw_materials', 'finished_goods', 'work_in_progress', 'supplies', 'equipment', 'spare_parts']),
  query('status').optional().isIn(['active', 'inactive', 'discontinued', 'backordered'])
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
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.warehouse) filter['location.warehouse'] = req.query.warehouse;
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { sku: { $regex: req.query.search, $options: 'i' } },
        { itemId: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Low stock filter
    if (req.query.lowStock === 'true') {
      filter.$expr = { $lte: ['$availableStock', '$reorderPoint'] };
    }

    // Build sort object
    const sort = {};
    if (req.query.sortBy) {
      sort[req.query.sortBy] = req.query.sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.name = 1; // Default sort by name
    }

    const inventory = await Inventory.find(filter)
      .populate('supplier', 'name vendorId')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Inventory.countDocuments(filter);

    res.json({
      success: true,
      count: inventory.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      data: inventory
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/inventory/:id
 * @desc    Get single inventory item
 * @access  Private
 */
router.get('/:id', auth, async (req, res, next) => {
  try {
    const item = await Inventory.findById(req.params.id)
      .populate('supplier')
      .populate('alternativeSuppliers.vendor', 'name vendorId')
      .populate('createdBy', 'name email')
      .populate('stockMovements.user', 'name email');

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found'
      });
    }

    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/inventory
 * @desc    Create new inventory item
 * @access  Private (Logistics Manager, Admin)
 */
router.post('/', [
  auth,
  authorize('logistics_manager', 'admin'),
  body('sku').notEmpty().withMessage('SKU is required'),
  body('name').notEmpty().withMessage('Item name is required'),
  body('category').isIn(['raw_materials', 'finished_goods', 'work_in_progress', 'supplies', 'equipment', 'spare_parts']).withMessage('Invalid category'),
  body('unitOfMeasure').isIn(['each', 'box', 'case', 'pallet', 'lb', 'kg', 'ft', 'm', 'gal', 'l']).withMessage('Invalid unit of measure'),
  body('location.warehouse').notEmpty().withMessage('Warehouse location is required'),
  body('cost.unit').isFloat({ min: 0 }).withMessage('Unit cost must be non-negative'),
  body('reorderPoint').isInt({ min: 0 }).withMessage('Reorder point must be non-negative'),
  body('reorderQuantity').isInt({ min: 1 }).withMessage('Reorder quantity must be at least 1')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    // Check if SKU already exists
    const existingItem = await Inventory.findOne({ sku: req.body.sku });
    if (existingItem) {
      return res.status(400).json({
        success: false,
        error: 'SKU already exists'
      });
    }

    const itemData = {
      ...req.body,
      createdBy: req.user.id
    };

    const item = new Inventory(itemData);
    await item.save();

    await item.populate([
      { path: 'supplier', select: 'name vendorId' },
      { path: 'createdBy', select: 'name email' }
    ]);

    logger.info(`Inventory item created: ${item.name} (${item.sku}) by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      data: item
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/v1/inventory/:id
 * @desc    Update inventory item
 * @access  Private (Logistics Manager, Admin)
 */
router.put('/:id', [
  auth,
  authorize('logistics_manager', 'admin'),
  body('sku').optional().notEmpty().withMessage('SKU cannot be empty'),
  body('name').optional().notEmpty().withMessage('Item name cannot be empty'),
  body('category').optional().isIn(['raw_materials', 'finished_goods', 'work_in_progress', 'supplies', 'equipment', 'spare_parts']).withMessage('Invalid category'),
  body('unitOfMeasure').optional().isIn(['each', 'box', 'case', 'pallet', 'lb', 'kg', 'ft', 'm', 'gal', 'l']).withMessage('Invalid unit of measure'),
  body('cost.unit').optional().isFloat({ min: 0 }).withMessage('Unit cost must be non-negative'),
  body('reorderPoint').optional().isInt({ min: 0 }).withMessage('Reorder point must be non-negative'),
  body('reorderQuantity').optional().isInt({ min: 1 }).withMessage('Reorder quantity must be at least 1')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    let item = await Inventory.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found'
      });
    }

    // Check if SKU is being changed and if it already exists
    if (req.body.sku && req.body.sku !== item.sku) {
      const existingItem = await Inventory.findOne({ sku: req.body.sku });
      if (existingItem) {
        return res.status(400).json({
          success: false,
          error: 'SKU already exists'
        });
      }
    }

    item = await Inventory.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).populate([
      { path: 'supplier', select: 'name vendorId' },
      { path: 'createdBy', select: 'name email' }
    ]);

    logger.info(`Inventory item updated: ${item.name} (${item.sku}) by user ${req.user.id}`);

    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/inventory/:id/stock-movement
 * @desc    Add stock movement (receipt, issue, adjustment, etc.)
 * @access  Private (Logistics Manager, Admin)
 */
router.post('/:id/stock-movement', [
  auth,
  authorize('logistics_manager', 'admin'),
  body('type').isIn(['receipt', 'issue', 'transfer', 'adjustment', 'return']).withMessage('Invalid movement type'),
  body('quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be positive'),
  body('reason').optional().isString(),
  body('reference').optional().isString()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const item = await Inventory.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found'
      });
    }

    const movement = {
      type: req.body.type,
      quantity: req.body.quantity,
      reason: req.body.reason || '',
      reference: req.body.reference || '',
      user: req.user.id,
      timestamp: new Date()
    };

    // Validate stock levels for issue/transfer operations
    if ((req.body.type === 'issue' || req.body.type === 'transfer') && 
        item.availableStock < req.body.quantity) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient stock available'
      });
    }

    item.addStockMovement(movement);
    await item.save();

    await item.populate('stockMovements.user', 'name email');

    logger.info(`Stock movement added to ${item.name} (${item.sku}): ${req.body.type} ${req.body.quantity} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Stock movement added successfully',
      data: item
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/inventory/low-stock
 * @desc    Get items that need reordering
 * @access  Private
 */
router.get('/low-stock', auth, async (req, res, next) => {
  try {
    const lowStockItems = await Inventory.find({
      $expr: { $lte: ['$availableStock', '$reorderPoint'] },
      status: 'active'
    })
    .populate('supplier', 'name vendorId')
    .sort({ availableStock: 1 });

    res.json({
      success: true,
      count: lowStockItems.length,
      data: lowStockItems
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/inventory/:id/cycle-count
 * @desc    Perform cycle count on inventory item
 * @access  Private (Logistics Manager, Admin)
 */
router.post('/:id/cycle-count', [
  auth,
  authorize('logistics_manager', 'admin'),
  body('countedQuantity').isFloat({ min: 0 }).withMessage('Counted quantity must be non-negative'),
  body('notes').optional().isString()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const item = await Inventory.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found'
      });
    }

    const countDifference = req.body.countedQuantity - item.currentStock;

    // Add adjustment if there's a difference
    if (countDifference !== 0) {
      const movement = {
        type: 'adjustment',
        quantity: Math.abs(countDifference),
        reason: `Cycle count adjustment: ${countDifference > 0 ? 'surplus' : 'shortage'} of ${Math.abs(countDifference)}`,
        reference: `CC-${Date.now()}`,
        user: req.user.id,
        timestamp: new Date()
      };

      // For adjustments, we need to handle the stock change differently
      if (countDifference > 0) {
        // Surplus - add to stock
        item.currentStock = req.body.countedQuantity;
        item.stockMovements.push(movement);
      } else {
        // Shortage - reduce stock
        item.currentStock = req.body.countedQuantity;
        item.stockMovements.push(movement);
      }

      item.availableStock = item.currentStock - item.reservedStock;
    }

    item.lastCountDate = new Date();
    item.notes = req.body.notes ? `${item.notes || ''}\n[CYCLE COUNT] ${new Date().toISOString()}: ${req.body.notes}` : item.notes;

    await item.save();

    logger.info(`Cycle count performed on ${item.name} (${item.sku}): ${item.currentStock} -> ${req.body.countedQuantity} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Cycle count completed successfully',
      data: {
        item,
        countDifference,
        adjustmentMade: countDifference !== 0
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/v1/inventory/:id
 * @desc    Delete inventory item
 * @access  Private (Admin only)
 */
router.delete('/:id', [
  auth,
  authorize('admin')
], async (req, res, next) => {
  try {
    const item = await Inventory.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found'
      });
    }

    // Can only delete items with zero stock
    if (item.currentStock > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete item with current stock. Adjust stock to zero first.'
      });
    }

    await Inventory.findByIdAndDelete(req.params.id);

    logger.info(`Inventory item deleted: ${item.name} (${item.sku}) by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Inventory item deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/inventory/analytics/dashboard
 * @desc    Get inventory dashboard analytics
 * @access  Private (Logistics Manager, Admin)
 */
router.get('/analytics/dashboard', [
  auth,
  authorize('logistics_manager', 'admin')
], async (req, res, next) => {
  try {
    // Total inventory value
    const inventoryValue = await Inventory.aggregate([
      {
        $match: { status: 'active' }
      },
      {
        $group: {
          _id: null,
          totalValue: {
            $sum: { $multiply: ['$currentStock', '$cost.unit'] }
          },
          totalItems: { $sum: 1 },
          totalStock: { $sum: '$currentStock' }
        }
      }
    ]);

    // Low stock items count
    const lowStockCount = await Inventory.countDocuments({
      $expr: { $lte: ['$availableStock', '$reorderPoint'] },
      status: 'active'
    });

    // Inventory by category
    const categoryBreakdown = await Inventory.aggregate([
      {
        $match: { status: 'active' }
      },
      {
        $group: {
          _id: '$category',
          itemCount: { $sum: 1 },
          totalValue: {
            $sum: { $multiply: ['$currentStock', '$cost.unit'] }
          },
          totalStock: { $sum: '$currentStock' }
        }
      },
      {
        $sort: { totalValue: -1 }
      }
    ]);

    // Top items by value
    const topItemsByValue = await Inventory.aggregate([
      {
        $match: { status: 'active' }
      },
      {
        $addFields: {
          totalValue: { $multiply: ['$currentStock', '$cost.unit'] }
        }
      },
      {
        $sort: { totalValue: -1 }
      },
      {
        $limit: 10
      },
      {
        $project: {
          name: 1,
          sku: 1,
          currentStock: 1,
          'cost.unit': 1,
          totalValue: 1,
          category: 1
        }
      }
    ]);

    // Stock movements in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentMovements = await Inventory.aggregate([
      {
        $unwind: '$stockMovements'
      },
      {
        $match: {
          'stockMovements.timestamp': { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: '$stockMovements.type',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$stockMovements.quantity' }
        }
      }
    ]);

    // Warehouse distribution
    const warehouseBreakdown = await Inventory.aggregate([
      {
        $match: { status: 'active' }
      },
      {
        $group: {
          _id: '$location.warehouse',
          itemCount: { $sum: 1 },
          totalStock: { $sum: '$currentStock' },
          totalValue: {
            $sum: { $multiply: ['$currentStock', '$cost.unit'] }
          }
        }
      },
      {
        $sort: { totalValue: -1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        overview: inventoryValue[0] || { totalValue: 0, totalItems: 0, totalStock: 0 },
        lowStockCount,
        categoryBreakdown,
        topItemsByValue,
        recentMovements,
        warehouseBreakdown,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;