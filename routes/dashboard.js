const express = require("express");
const router = express.Router();
const IncomeModel = require("../models/Addincome");
const ExpenseModel = require("../models/Addexpense");

// Get dashboard summary data
router.get("/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { period = "monthly" } = req.query; // monthly, weekly, yearly

    if (!email) {
      return res.status(400).json({ error: "Email is required!" });
    }

    // Get date range based on period
    const dateRange = getDateRange(period);
    
    // Get current month's data
    const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const currentMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    // Fetch data in parallel for better performance
    const [
      totalIncome,
      totalExpense,
      currentMonthIncome,
      currentMonthExpense,
      recentTransactions,
      incomeByCategory,
      expenseByCategory,
      incomeByDivision,
      expenseByDivision
    ] = await Promise.all([
      // Total income
      IncomeModel.aggregate([
        { $match: { email } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      
      // Total expense
      ExpenseModel.aggregate([
        { $match: { email } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      
      // Current month income
      IncomeModel.aggregate([
        { 
          $match: { 
            email, 
            date: { $gte: currentMonthStart, $lte: currentMonthEnd } 
          } 
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      
      // Current month expense
      ExpenseModel.aggregate([
        { 
          $match: { 
            email, 
            date: { $gte: currentMonthStart, $lte: currentMonthEnd } 
          } 
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      
      // Recent transactions (last 10)
      Promise.all([
        IncomeModel.find({ email })
          .sort({ date: -1, time: -1 })
          .limit(5)
          .lean(),
        ExpenseModel.find({ email })
          .sort({ date: -1, time: -1 })
          .limit(5)
          .lean()
      ]),
      
      // Income by category
      IncomeModel.aggregate([
        { $match: { email, date: { $gte: dateRange.start, $lte: dateRange.end } } },
        { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 }
      ]),
      
      // Expense by category
      ExpenseModel.aggregate([
        { $match: { email, date: { $gte: dateRange.start, $lte: dateRange.end } } },
        { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 }
      ]),
      
      // Income by division
      IncomeModel.aggregate([
        { $match: { email, date: { $gte: dateRange.start, $lte: dateRange.end } } },
        { $group: { _id: "$division", total: { $sum: "$amount" }, count: { $sum: 1 } } }
      ]),
      
      // Expense by division
      ExpenseModel.aggregate([
        { $match: { email, date: { $gte: dateRange.start, $lte: dateRange.end } } },
        { $group: { _id: "$division", total: { $sum: "$amount" }, count: { $sum: 1 } } }
      ])
    ]);

    // Format recent transactions
    const [recentIncomes, recentExpenses] = recentTransactions;
    const formattedRecent = [
      ...recentIncomes.map(i => ({ ...i, type: 'income' })),
      ...recentExpenses.map(e => ({ ...e, type: 'expense' }))
    ].sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`))
     .slice(0, 10);

    // Get monthly trend data
    const monthlyData = await getMonthlyTrend(email, 6); // Last 6 months

    // Prepare response
    const dashboardData = {
      period,
      dateRange,
      summary: {
        totalIncome: totalIncome[0]?.total || 0,
        totalExpense: totalExpense[0]?.total || 0,
        currentMonthIncome: currentMonthIncome[0]?.total || 0,
        currentMonthExpense: currentMonthExpense[0]?.total || 0,
        balance: (totalIncome[0]?.total || 0) - (totalExpense[0]?.total || 0),
        currentMonthBalance: (currentMonthIncome[0]?.total || 0) - (currentMonthExpense[0]?.total || 0)
      },
      categories: {
        income: incomeByCategory,
        expense: expenseByCategory
      },
      divisions: {
        income: incomeByDivision,
        expense: expenseByDivision
      },
      recentTransactions: formattedRecent,
      trends: monthlyData,
      counts: {
        totalIncome: await IncomeModel.countDocuments({ email }),
        totalExpense: await ExpenseModel.countDocuments({ email })
      }
    };

    res.status(200).json(dashboardData);
  } catch (err) {
    console.error("❌ Error fetching dashboard data:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get period-based data (monthly, weekly, yearly)
router.get("/period/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { period = "monthly", months = 12 } = req.query;

    if (!email) {
      return res.status(400).json({ error: "Email is required!" });
    }

    let periodData;
    
    switch(period) {
      case 'monthly':
        periodData = await getMonthlyTrend(email, parseInt(months));
        break;
      case 'weekly':
        periodData = await getWeeklyTrend(email, 8); // Last 8 weeks
        break;
      case 'yearly':
        periodData = await getYearlyTrend(email, 5); // Last 5 years
        break;
      default:
        periodData = await getMonthlyTrend(email, 12);
    }

    res.status(200).json({
      period,
      data: periodData
    });
  } catch (err) {
    console.error("❌ Error fetching period data:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Helper Functions

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

async function getMonthlyTrend(email, months) {
  const monthlyData = [];
  const now = new Date();
  
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    
    const monthName = monthStart.toLocaleString('default', { month: 'short' });
    const year = monthStart.getFullYear();
    const label = `${monthName} ${year}`;
    
    const [monthIncome, monthExpense] = await Promise.all([
      IncomeModel.aggregate([
        { 
          $match: { 
            email, 
            date: { $gte: monthStart, $lte: monthEnd } 
          } 
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      ExpenseModel.aggregate([
        { 
          $match: { 
            email, 
            date: { $gte: monthStart, $lte: monthEnd } 
          } 
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);
    
    monthlyData.push({
      period: label,
      month: monthStart.getMonth() + 1,
      year: year,
      income: monthIncome[0]?.total || 0,
      expense: monthExpense[0]?.total || 0,
      balance: (monthIncome[0]?.total || 0) - (monthExpense[0]?.total || 0)
    });
  }
  
  return monthlyData;
}

async function getWeeklyTrend(email, weeks) {
  const weeklyData = [];
  const now = new Date();
  
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (i * 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    const label = `Week ${Math.ceil(weekStart.getDate() / 7)}`;
    
    const [weekIncome, weekExpense] = await Promise.all([
      IncomeModel.aggregate([
        { 
          $match: { 
            email, 
            date: { $gte: weekStart, $lte: weekEnd } 
          } 
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      ExpenseModel.aggregate([
        { 
          $match: { 
            email, 
            date: { $gte: weekStart, $lte: weekEnd } 
          } 
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);
    
    weeklyData.push({
      period: label,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      income: weekIncome[0]?.total || 0,
      expense: weekExpense[0]?.total || 0,
      balance: (weekIncome[0]?.total || 0) - (weekExpense[0]?.total || 0)
    });
  }
  
  return weeklyData;
}

async function getYearlyTrend(email, years) {
  const yearlyData = [];
  const currentYear = new Date().getFullYear();
  
  for (let i = years - 1; i >= 0; i--) {
    const year = currentYear - i;
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    
    const [yearIncome, yearExpense] = await Promise.all([
      IncomeModel.aggregate([
        { 
          $match: { 
            email, 
            date: { $gte: yearStart, $lte: yearEnd } 
          } 
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      ExpenseModel.aggregate([
        { 
          $match: { 
            email, 
            date: { $gte: yearStart, $lte: yearEnd } 
          } 
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);
    
    yearlyData.push({
      period: year.toString(),
      year: year,
      income: yearIncome[0]?.total || 0,
      expense: yearExpense[0]?.total || 0,
      balance: (yearIncome[0]?.total || 0) - (yearExpense[0]?.total || 0)
    });
  }
  
  return yearlyData;
}

module.exports = router;