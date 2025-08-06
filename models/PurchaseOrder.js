const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  itemId: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalPrice: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    enum: ['materials', 'services', 'equipment', 'supplies'],
    required: true
  },
  specifications: String,
  deliveryDate: Date
});

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: {
    type: String,
    required: true,
    unique: true
  },
  vendor: {
    type: mongoose.Schema.ObjectId,
    ref: 'Vendor',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'pending_approval', 'approved', 'sent', 'acknowledged', 'partially_received', 'completed', 'cancelled'],
    default: 'draft'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  requestedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  department: {
    type: String,
    required: true
  },
  project: {
    type: String
  },
  lineItems: [lineItemSchema],
  subtotal: {
    type: Number,
    required: true,
    default: 0
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  shippingCost: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  paymentTerms: {
    type: String,
    enum: ['NET30', 'NET60', 'NET90', 'COD', 'PREPAID'],
    default: 'NET30'
  },
  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  expectedDeliveryDate: Date,
  actualDeliveryDate: Date,
  notes: String,
  attachments: [{
    filename: String,
    url: String,
    uploadedAt: Date
  }],
  approvalHistory: [{
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    action: {
      type: String,
      enum: ['approved', 'rejected', 'requested_changes']
    },
    comments: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Generate PO number before saving
purchaseOrderSchema.pre('save', function(next) {
  if (!this.poNumber) {
    this.poNumber = `PO-${Date.now()}`;
  }
  
  // Calculate totals
  this.subtotal = this.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  this.totalAmount = this.subtotal + this.taxAmount + this.shippingCost - this.discountAmount;
  
  next();
});

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);