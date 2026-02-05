const express = require("express");
const router = express.Router();
const AddIncome = require("../models/Addincome");
const Account = require("../models/AccountModel"); // Make sure you have this model

// ✅ Add new income with all required fields
router.post("/add", async (req, res) => {
  try {
    const { 
      email, 
      source, 
      amount, 
      date, 
      time, 
      notes, 
      paymentMethod,
      division, // ✅ NEW: Office or Personal
      category, // ✅ NEW: Salary, Freelance, etc.
      account   // ✅ NEW: Which account received the income
    } = req.body;

    console.log("📩 Received income payload:", req.body);

    // ✅ Validation for required fields
    if (!email || !source || !amount || !date || !time || !paymentMethod) {
      return res.status(400).json({ error: "Required fields are missing!" });
    }

    // ✅ Create income with all fields
    const newIncome = new AddIncome({
      email,
      source,
      amount: parseFloat(amount),
      date: new Date(date), // Keep as Date object for better querying
      time,
      notes,
      paymentMethod,
      division: division || "Personal", // ✅ Default to Personal
      category: category || source,     // ✅ Use source as category if not provided
      account: account || "Cash"        // ✅ Default to Cash if not provided
    });

    await newIncome.save();
    console.log("✅ Income saved in DB:", newIncome);

    // ✅ Update account balance (if Account model exists)
    if (account) {
      try {
        await Account.findOneAndUpdate(
          { email: email, accountName: account },
          { $inc: { balance: parseFloat(amount) } },
          { new: true, upsert: false }
        );
        console.log(`✅ Account ${account} balance updated`);
      } catch (accountError) {
        console.log("⚠️ Could not update account balance:", accountError.message);
        // Continue even if account update fails
      }
    }

    res.status(201).json({ 
      message: "Income added successfully!", 
      income: newIncome 
    });
  } catch (err) {
    console.error("❌ Error adding income:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Get income with filters
router.get("/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { 
      startDate, 
      endDate, 
      division, 
      category, 
      account,
      period // ✅ NEW: 'monthly', 'weekly', 'yearly'
    } = req.query;

    if (!email) {
      return res.status(400).json({ error: "Email is required!" });
    }

    let query = { email };
    
    // ✅ Date range filter
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // ✅ Division filter
    if (division) {
      query.division = division;
    }

    // ✅ Category filter
    if (category) {
      query.category = category;
    }

    // ✅ Account filter
    if (account) {
      query.account = account;
    }

    // ✅ Fetch income records
    const incomeDetails = await AddIncome.find(query).sort({ date: -1, time: -1 });

    // ✅ Group by period if requested
    let responseData = incomeDetails;
    if (period) {
      responseData = groupByPeriod(incomeDetails, period);
    }

    res.status(200).json(responseData);
  } catch (err) {
    console.error("❌ Error fetching income:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Update income (only within 12 hours)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // ✅ Find the income
    const income = await AddIncome.findById(id);
    
    if (!income) {
      return res.status(404).json({ error: "Income not found!" });
    }

    // ✅ Check if can be edited (within 12 hours)
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    if (income.createdAt < twelveHoursAgo) {
      return res.status(403).json({ 
        error: "Cannot edit income after 12 hours of creation!" 
      });
    }

    // ✅ Update the income
    const updatedIncome = await AddIncome.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    console.log("✅ Income updated:", updatedIncome);
    res.status(200).json({ 
      message: "Income updated successfully!", 
      income: updatedIncome 
    });
  } catch (err) {
    console.error("❌ Error updating income:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Delete income (only within 12 hours)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Find the income
    const income = await AddIncome.findById(id);
    
    if (!income) {
      return res.status(404).json({ error: "Income not found!" });
    }

    // ✅ Check if can be deleted (within 12 hours)
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    if (income.createdAt < twelveHoursAgo) {
      return res.status(403).json({ 
        error: "Cannot delete income after 12 hours of creation!" 
      });
    }

    // ✅ Delete the income
    await AddIncome.findByIdAndDelete(id);

    // ✅ Revert account balance (if Account model exists)
    if (income.account) {
      try {
        await Account.findOneAndUpdate(
          { email: income.email, accountName: income.account },
          { $inc: { balance: -income.amount } },
          { new: true }
        );
        console.log(`✅ Account ${income.account} balance reverted`);
      } catch (accountError) {
        console.log("⚠️ Could not revert account balance:", accountError.message);
      }
    }

    console.log("✅ Income deleted:", id);
    res.status(200).json({ message: "Income deleted successfully!" });
  } catch (err) {
    console.error("❌ Error deleting income:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Get total income with filters
router.get("/total/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { 
      startDate, 
      endDate, 
      division, 
      category, 
      account 
    } = req.query;

    if (!email) {
      return res.status(400).json({ error: "Email is required!" });
    }

    let matchQuery = { email };
    
    // ✅ Apply filters
    if (startDate && endDate) {
      matchQuery.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (division) {
      matchQuery.division = division;
    }

    if (category) {
      matchQuery.category = category;
    }

    if (account) {
      matchQuery.account = account;
    }

    const totalIncome = await AddIncome.aggregate([
      { $match: matchQuery },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } }
    ]);

    res.status(200).json({ 
      totalIncome: totalIncome[0]?.totalAmount || 0 
    });
  } catch (err) {
    console.error("❌ Error fetching total income:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Get income summary by category
router.get("/summary/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { startDate, endDate, division } = req.query;

    if (!email) {
      return res.status(400).json({ error: "Email is required!" });
    }

    let matchQuery = { email };
    
    // ✅ Date range filter
    if (startDate && endDate) {
      matchQuery.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // ✅ Division filter
    if (division) {
      matchQuery.division = division;
    }

    // ✅ Aggregate to get category-wise summary
    const summary = await AddIncome.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$category",
          division: { $first: "$division" },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    res.status(200).json({ summary });
  } catch (err) {
    console.error("❌ Error fetching income summary:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Get income by period (monthly, weekly, yearly)
router.get("/period/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { period = "monthly" } = req.query; // monthly, weekly, yearly

    if (!email) {
      return res.status(400).json({ error: "Email is required!" });
    }

    // ✅ Get date range based on period
    const dateRange = getDateRange(period);
    
    const incomes = await AddIncome.find({
      email,
      date: { $gte: dateRange.start, $lte: dateRange.end }
    }).sort({ date: 1 });

    // ✅ Group by period
    const groupedData = groupByPeriod(incomes, period);

    res.status(200).json({
      period,
      dateRange,
      data: groupedData,
      total: groupedData.reduce((sum, item) => sum + item.totalAmount, 0)
    });
  } catch (err) {
    console.error("❌ Error fetching income by period:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Get income by category
router.get("/by-category/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { category } = req.query;

    if (!email) {
      return res.status(400).json({ error: "Email is required!" });
    }

    let query = { email };
    if (category) {
      query.category = category;
    }

    const incomes = await AddIncome.find(query).sort({ date: -1 });
    res.status(200).json(incomes);
  } catch (err) {
    console.error("❌ Error fetching income by category:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Helper function to group income by period
function groupByPeriod(incomes, period) {
  const grouped = {};
  
  incomes.forEach(income => {
    const date = new Date(income.date);
    let key;
    
    switch(period) {
      case 'monthly':
        key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        break;
      case 'weekly':
        const weekNumber = Math.ceil(date.getDate() / 7);
        key = `${date.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
        break;
      case 'yearly':
        key = `${date.getFullYear()}`;
        break;
      default:
        key = date.toISOString().split('T')[0];
    }
    
    if (!grouped[key]) {
      grouped[key] = {
        period: key,
        totalAmount: 0,
        count: 0,
        items: []
      };
    }
    
    grouped[key].totalAmount += income.amount;
    grouped[key].count += 1;
    grouped[key].items.push(income);
  });
  
  return Object.values(grouped);
}

// ✅ Helper function to get date range based on period
function getDateRange(period) {
  const now = new Date();
  let start, end = now;

  switch(period) {
    case 'weekly':
      start = new Date(now);
      start.setDate(now.getDate() - 7);
      break;
    case 'monthly':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'yearly':
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  return { start, end };
}

module.exports = router;