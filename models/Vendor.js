const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please add a valid email']
  },
  phone: {
    type: String,
    required: true
  },
  position: {
    type: String,
    required: true
  },
  isPrimary: {
    type: Boolean,
    default: false
  }
});

const vendorSchema = new mongoose.Schema({
  vendorId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Please add vendor name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  category: {
    type: String,
    required: true,
    enum: ['materials', 'services', 'equipment', 'logistics', 'technology', 'other']
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'blacklisted', 'pending_approval'],
    default: 'pending_approval'
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  contacts: [contactSchema],
  paymentTerms: {
    type: String,
    enum: ['NET30', 'NET60', 'NET90', 'COD', 'PREPAID'],
    default: 'NET30'
  },
  certifications: [{
    name: String,
    issuer: String,
    validUntil: Date,
    documentUrl: String
  }],
  bankDetails: {
    bankName: String,
    accountNumber: String,
    routingNumber: String,
    swiftCode: String
  },
  notes: String,
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Create vendor ID before saving
vendorSchema.pre('save', function(next) {
  if (!this.vendorId) {
    this.vendorId = `VND-${Date.now()}`;
  }
  next();
});

module.exports = mongoose.model('Vendor', vendorSchema);