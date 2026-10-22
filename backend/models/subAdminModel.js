const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const subAdminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true, // used as login ID / username
      trim: true,
    },
    empNo: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      default: 'Editor',
      enum: ['Administrator', 'Editor', 'Viewer', 'Accountant'],
    },
    permissions: {
      type: [String],
      default: [],
      // Permissions will be based on sidebar menu items with access levels
      // Format: 'permission-key:access-level' where access-level is 'view' or 'full'
      // e.g., ['dashboard:full', 'student-management:view', 'manage-stock:full', 'transactions:view']
      // Legacy format (without access level) is treated as 'full' for backward compatibility
    },
    // Assigned College (New)
    assignedCollege: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      default: null,
    },
    // Legacy support for assignedBranch (Old)
    assignedBranch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College', // Referencing College as TransferBranch is deprecated
      default: null,
    },
  },
  { timestamps: true }
);

subAdminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  if (this.password && (this.password.startsWith('$2a$') || this.password.startsWith('$2b$'))) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

subAdminSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

const SubAdmin = mongoose.model('SubAdmin', subAdminSchema);

module.exports = { SubAdmin };


