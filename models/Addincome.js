const mongoose = require("mongoose");

// Define the Income Schema
const IncomeSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  source: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: [0, "Amount cannot be negative"]
  },
  paymentMethod: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true,
  },
  time: {
    type: String,
    required: true,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  // NEW FIELDS
  division: {
    type: String,
    enum: ['Office', 'Personal'],
    default: 'Personal'
  },
  category: {
    type: String,
    trim: true
  },
  account: {
    type: String,
    trim: true,
    required: true
  },
  isTransfer: {
    type: Boolean,
    default: false
  },
  transferTo: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for faster queries
IncomeSchema.index({ email: 1, date: 1 });
IncomeSchema.index({ email: 1, division: 1 });
IncomeSchema.index({ email: 1, category: 1 });

// Method to check if entry can be edited (within 12 hours)
IncomeSchema.methods.canEdit = function() {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
  return this.createdAt > twelveHoursAgo;
};

const IncomeModel = mongoose.model("Income", IncomeSchema);

module.exports = IncomeModel;