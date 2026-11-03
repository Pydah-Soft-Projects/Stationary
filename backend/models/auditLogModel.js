const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      default: null, // null means Central/Global audit
    },
    beforeQuantity: {
      type: Number,
      required: true,
      min: [0, 'Quantity cannot be negative'],
    },
    afterQuantity: {
      type: Number,
      required: true,
      min: [0, 'Quantity cannot be negative'],
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    batchId: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    createdBy: {
      type: String,
      trim: true,
      default: 'System',
    },
    approvedBy: {
      type: String,
      trim: true,
    },
    approvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

const userAuditSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubAdmin',
      default: null,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    empNo: {
      type: String,
      trim: true,
      default: '',
    },
    userRole: {
      type: String,
      default: 'User',
      trim: true,
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      default: null,
    },
    collegeName: {
      type: String,
      default: '',
      trim: true,
    },
    event: {
      type: String,
      required: true,
      default: 'other',
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    loginTime: {
      type: Date,
      default: Date.now,
    },
    ip: {
      type: String,
      default: '',
      trim: true,
    },
    userAgent: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['success', 'warning', 'failed'],
      default: 'success',
    },
  },
  {
    timestamps: true,
  }
);

userAuditSchema.index({ createdAt: -1 });
userAuditSchema.index({ userName: 1, createdAt: -1 });
userAuditSchema.index({ event: 1, createdAt: -1 });
userAuditSchema.index({ loginTime: -1 });

const UserAudit = mongoose.model('UserAudit', userAuditSchema);

module.exports = { AuditLog, UserAudit };
