const mongoose = require('mongoose');

const trackingEventSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned'],
    required: true
  },
  location: {
    city: String,
    state: String,
    country: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  description: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const shipmentSchema = new mongoose.Schema({
  shipmentId: {
    type: String,
    required: true,
    unique: true
  },
  trackingNumber: {
    type: String,
    required: true,
    unique: true
  },
  purchaseOrder: {
    type: mongoose.Schema.ObjectId,
    ref: 'PurchaseOrder'
  },
  carrier: {
    name: {
      type: String,
      required: true
    },
    service: String,
    contactInfo: {
      phone: String,
      email: String
    }
  },
  status: {
    type: String,
    enum: ['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['standard', 'expedited', 'urgent'],
    default: 'standard'
  },
  origin: {
    name: String,
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    contact: {
      name: String,
      phone: String,
      email: String
    }
  },
  destination: {
    name: String,
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    contact: {
      name: String,
      phone: String,
      email: String
    }
  },
  items: [{
    description: String,
    quantity: Number,
    weight: Number,
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    value: Number
  }],
  weight: {
    total: Number,
    unit: {
      type: String,
      enum: ['lbs', 'kg'],
      default: 'lbs'
    }
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    unit: {
      type: String,
      enum: ['in', 'cm'],
      default: 'in'
    }
  },
  cost: {
    shipping: Number,
    insurance: Number,
    handling: Number,
    total: Number,
    currency: {
      type: String,
      default: 'USD'
    }
  },
  estimatedDeliveryDate: Date,
  actualDeliveryDate: Date,
  pickupDate: Date,
  deliveryInstructions: String,
  signatureRequired: {
    type: Boolean,
    default: false
  },
  insuranceValue: Number,
  trackingEvents: [trackingEventSchema],
  documents: [{
    type: {
      type: String,
      enum: ['bill_of_lading', 'delivery_receipt', 'customs_form', 'invoice', 'other']
    },
    filename: String,
    url: String,
    uploadedAt: Date
  }],
  notes: String,
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Generate shipment ID before saving
shipmentSchema.pre('save', function(next) {
  if (!this.shipmentId) {
    this.shipmentId = `SHP-${Date.now()}`;
  }
  next();
});

// Update status based on latest tracking event
shipmentSchema.methods.updateStatus = function() {
  if (this.trackingEvents.length > 0) {
    const latestEvent = this.trackingEvents[this.trackingEvents.length - 1];
    this.status = latestEvent.status;
  }
};

module.exports = mongoose.model('Shipment', shipmentSchema);