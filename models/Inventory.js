const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['receipt', 'issue', 'transfer', 'adjustment', 'return'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  reason: String,
  reference: {
    type: String, // PO number, transfer ID, etc.
  },
  location: {
    warehouse: String,
    zone: String,
    aisle: String,
    shelf: String
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const inventorySchema = new mongoose.Schema({
  itemId: {
    type: String,
    required: true,
    unique: true
  },
  sku: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  category: {
    type: String,
    required: true,
    enum: ['raw_materials', 'finished_goods', 'work_in_progress', 'supplies', 'equipment', 'spare_parts']
  },
  subcategory: String,
  brand: String,
  model: String,
  specifications: {
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: {
        type: String,
        enum: ['in', 'cm', 'ft', 'm'],
        default: 'in'
      }
    },
    weight: {
      value: Number,
      unit: {
        type: String,
        enum: ['lbs', 'kg', 'oz', 'g'],
        default: 'lbs'
      }
    },
    color: String,
    material: String
  },
  unitOfMeasure: {
    type: String,
    required: true,
    enum: ['each', 'box', 'case', 'pallet', 'lb', 'kg', 'ft', 'm', 'gal', 'l']
  },
  currentStock: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  reservedStock: {
    type: Number,
    default: 0,
    min: 0
  },
  availableStock: {
    type: Number,
    default: 0
  },
  reorderPoint: {
    type: Number,
    required: true,
    default: 10
  },
  reorderQuantity: {
    type: Number,
    required: true,
    default: 100
  },
  maxStock: Number,
  location: {
    warehouse: {
      type: String,
      required: true
    },
    zone: String,
    aisle: String,
    shelf: String,
    bin: String
  },
  supplier: {
    type: mongoose.Schema.ObjectId,
    ref: 'Vendor'
  },
  alternativeSuppliers: [{
    vendor: {
      type: mongoose.Schema.ObjectId,
      ref: 'Vendor'
    },
    leadTime: Number,
    price: Number
  }],
  cost: {
    unit: {
      type: Number,
      required: true
    },
    average: Number,
    last: Number,
    standard: Number
  },
  price: {
    selling: Number,
    retail: Number,
    wholesale: Number
  },
  leadTime: {
    type: Number, // days
    default: 7
  },
  abc_classification: {
    type: String,
    enum: ['A', 'B', 'C'],
    default: 'C'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'discontinued', 'backordered'],
    default: 'active'
  },
  qualityGrade: {
    type: String,
    enum: ['A', 'B', 'C', 'reject']
  },
  expirationDate: Date,
  serialNumbers: [String],
  batchNumbers: [String],
  stockMovements: [stockMovementSchema],
  lastCountDate: Date,
  cycleCountFrequency: {
    type: Number, // days
    default: 90
  },
  tags: [String],
  notes: String,
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Calculate available stock before saving
inventorySchema.pre('save', function(next) {
  this.availableStock = this.currentStock - this.reservedStock;
  next();
});

// Generate item ID before saving
inventorySchema.pre('save', function(next) {
  if (!this.itemId) {
    this.itemId = `ITM-${Date.now()}`;
  }
  next();
});

// Check if item needs reordering
inventorySchema.methods.needsReorder = function() {
  return this.availableStock <= this.reorderPoint;
};

// Add stock movement
inventorySchema.methods.addStockMovement = function(movement) {
  this.stockMovements.push(movement);
  
  if (movement.type === 'receipt') {
    this.currentStock += movement.quantity;
  } else if (movement.type === 'issue') {
    this.currentStock = Math.max(0, this.currentStock - movement.quantity);
  }
  
  this.availableStock = this.currentStock - this.reservedStock;
};

module.exports = mongoose.model('Inventory', inventorySchema);