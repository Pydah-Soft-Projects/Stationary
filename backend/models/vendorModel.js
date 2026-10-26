const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a vendor name'],
      trim: true,
      unique: true,
    },
    contactPerson: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    gstNumber: {
      type: String,
      trim: true,
      default: '',
    },
    paymentTerms: {
      type: String,
      trim: true,
      default: '',
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    bankDetails: {
      accountHolderName: {
        type: String,
        trim: true,
        default: '',
      },
      bankName: {
        type: String,
        trim: true,
        default: '',
      },
      branchName: {
        type: String,
        trim: true,
        default: '',
      },
      accountNumber: {
        type: String,
        trim: true,
        default: '',
      },
      ifscCode: {
        type: String,
        trim: true,
        default: '',
      },
      upiId: {
        type: String,
        trim: true,
        default: '',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster search
// vendorSchema.index({ name: 1 }); // Removed duplicate index as name has unique: true

const Vendor = mongoose.model('Vendor', vendorSchema);

module.exports = { Vendor };

