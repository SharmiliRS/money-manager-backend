const mongoose = require("mongoose");

// Define the Category Schema
const CategorySchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['Income', 'Expense', 'Both'],
    required: true
  },
  division: {
    type: String,
    enum: ['Office', 'Personal', 'Both'],
    default: 'Personal'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Ensure unique category names per user
CategorySchema.index({ email: 1, name: 1, division: 1 }, { unique: true });

const CategoryModel = mongoose.model("Category", CategorySchema);

module.exports = CategoryModel;