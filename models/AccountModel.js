const mongoose = require("mongoose");

// Define the Account Schema for tracking different accounts
const AccountSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  accountName: {
    type: String,
    required: true,
    trim: true
  },
  accountType: {
    type: String,
    enum: ['Savings', 'Current', 'Credit Card', 'Cash', 'Investment'],
    required: true
  },
  balance: {
    type: Number,
    default: 0,
    min: [0, "Balance cannot be negative"]
  },
  currency: {
    type: String,
    default: 'USD'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Ensure unique account names per user
AccountSchema.index({ email: 1, accountName: 1 }, { unique: true });

const AccountModel = mongoose.model("Account", AccountSchema);

module.exports = AccountModel;