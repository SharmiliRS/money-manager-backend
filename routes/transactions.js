const express = require("express");
const router = express.Router();
const IncomeModel = require("../models/Addincome");
const ExpenseModel = require("../models/Addexpense");

// ✅ Route to fetch ALL transactions (income & expense) for a specific user with filters
router.get("/:email", async (req, res) => {
    try {
        const { email } = req.params;
        const { 
            startDate, 
            endDate, 
            division, 
            category, 
            account,
            type, // 'income', 'expense', or 'both'
            period, // 'monthly', 'weekly', 'yearly' for grouped data
            limit, // For pagination
            sortBy = 'date_desc' // date_asc, date_desc, amount_asc, amount_desc
        } = req.query;

        if (!email) {
            return res.status(400).json({ error: "Email is required!" });
        }

        // ✅ Build base queries
        let incomeQuery = { email };
        let expenseQuery = { email };

        // ✅ Date range filter
        if (startDate && endDate) {
            const dateFilter = {
                date: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
            incomeQuery = { ...incomeQuery, ...dateFilter };
            expenseQuery = { ...expenseQuery, ...dateFilter };
        }

        // ✅ Division filter
        if (division) {
            incomeQuery.division = division;
            expenseQuery.division = division;
        }

        // ✅ Category filter
        if (category) {
            incomeQuery.category = category;
            expenseQuery.category = category;
        }

        // ✅ Account filter
        if (account) {
            incomeQuery.account = account;
            expenseQuery.account = account;
        }

        // ✅ Fetch transactions based on type filter
        let incomeTransactions = [];
        let expenseTransactions = [];

        if (!type || type === 'both' || type === 'income') {
            incomeTransactions = await IncomeModel.find(incomeQuery).lean();
        }
        
        if (!type || type === 'both' || type === 'expense') {
            expenseTransactions = await ExpenseModel.find(expenseQuery).lean();
        }

        // ✅ Add 'type' field and format transactions
        const formattedIncome = incomeTransactions.map(income => ({
            ...income,
            type: 'income',
            displayAmount: `+₹${income.amount}`,
            colorClass: 'text-green-600',
            icon: '💰',
            canEdit: canEditTransaction(income.createdAt)
        }));

        const formattedExpense = expenseTransactions.map(expense => ({
            ...expense,
            type: 'expense',
            displayAmount: `-₹${expense.amount}`,
            colorClass: 'text-red-600',
            icon: '💸',
            canEdit: canEditTransaction(expense.createdAt)
        }));

        // ✅ Merge both incomes and expenses
        let allTransactions = [...formattedIncome, ...formattedExpense];

        // ✅ Sort transactions
        allTransactions = sortTransactions(allTransactions, sortBy);

        // ✅ Limit results if specified
        if (limit) {
            allTransactions = allTransactions.slice(0, parseInt(limit));
        }

        // ✅ Calculate totals
        const totalIncome = formattedIncome.reduce((sum, item) => sum + item.amount, 0);
        const totalExpense = formattedExpense.reduce((sum, item) => sum + item.amount, 0);
        const balance = totalIncome - totalExpense;

        // ✅ Group by period if requested
        let groupedData = null;
        if (period) {
            groupedData = groupTransactionsByPeriod(allTransactions, period);
        }

        // ✅ Get category summary
        const categorySummary = getCategorySummary(formattedIncome, formattedExpense);

        // ✅ Get division summary
        const divisionSummary = getDivisionSummary(formattedIncome, formattedExpense);

        res.status(200).json({
            transactions: allTransactions,
            totals: {
                income: totalIncome,
                expense: totalExpense,
                balance: balance
            },
            counts: {
                income: formattedIncome.length,
                expense: formattedExpense.length,
                total: allTransactions.length
            },
            periodData: groupedData,
            summaries: {
                byCategory: categorySummary,
                byDivision: divisionSummary
            },
            filtersApplied: {
                startDate,
                endDate,
                division,
                category,
                account,
                type,
                period
            }
        });
    } catch (err) {
        console.error("❌ Error fetching transactions:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Get transactions summary by period (for dashboard)
router.get("/summary/:email", async (req, res) => {
    try {
        const { email } = req.params;
        const { period = 'monthly' } = req.query; // monthly, weekly, yearly

        if (!email) {
            return res.status(400).json({ error: "Email is required!" });
        }

        // ✅ Get date range for the period
        const dateRange = getDateRangeForPeriod(period);
        
        // ✅ Fetch transactions within date range
        const [incomes, expenses] = await Promise.all([
            IncomeModel.find({ 
                email, 
                date: { $gte: dateRange.start, $lte: dateRange.end } 
            }).lean(),
            ExpenseModel.find({ 
                email, 
                date: { $gte: dateRange.start, $lte: dateRange.end } 
            }).lean()
        ]);

        // ✅ Group by period
        const incomeByPeriod = groupTransactionsByPeriod(
            incomes.map(i => ({ ...i, type: 'income' })), 
            period
        );
        const expenseByPeriod = groupTransactionsByPeriod(
            expenses.map(e => ({ ...e, type: 'expense' })), 
            period
        );

        // ✅ Calculate period totals
        const periodTotals = calculatePeriodTotals(incomeByPeriod, expenseByPeriod);

        res.status(200).json({
            period,
            dateRange,
            incomeByPeriod,
            expenseByPeriod,
            periodTotals,
            summary: {
                totalIncome: incomes.reduce((sum, i) => sum + i.amount, 0),
                totalExpense: expenses.reduce((sum, e) => sum + e.amount, 0),
                balance: incomes.reduce((sum, i) => sum + i.amount, 0) - 
                        expenses.reduce((sum, e) => sum + e.amount, 0)
            }
        });
    } catch (err) {
        console.error("❌ Error fetching transactions summary:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Get recent transactions (for dashboard/home page)
router.get("/recent/:email", async (req, res) => {
    try {
        const { email } = req.params;
        const { limit = 10 } = req.query;

        if (!email) {
            return res.status(400).json({ error: "Email is required!" });
        }

        // ✅ Fetch recent transactions
        const [recentIncomes, recentExpenses] = await Promise.all([
            IncomeModel.find({ email })
                .sort({ date: -1, time: -1 })
                .limit(parseInt(limit))
                .lean(),
            ExpenseModel.find({ email })
                .sort({ date: -1, time: -1 })
                .limit(parseInt(limit))
                .lean()
        ]);

        // ✅ Format and merge
        const formattedIncomes = recentIncomes.map(inc => ({
            ...inc,
            type: 'income',
            displayAmount: `+₹${inc.amount}`,
            colorClass: 'text-green-600'
        }));

        const formattedExpenses = recentExpenses.map(exp => ({
            ...exp,
            type: 'expense',
            displayAmount: `-₹${exp.amount}`,
            colorClass: 'text-red-600'
        }));

        // ✅ Merge and sort
        let recentTransactions = [...formattedIncomes, ...formattedExpenses];
        recentTransactions.sort((a, b) => {
            const dateTimeA = new Date(`${a.date}T${a.time}`);
            const dateTimeB = new Date(`${b.date}T${b.time}`);
            return dateTimeB - dateTimeA;
        });

        // ✅ Limit to requested number
        recentTransactions = recentTransactions.slice(0, parseInt(limit));

        res.status(200).json({
            recentTransactions,
            count: recentTransactions.length
        });
    } catch (err) {
        console.error("❌ Error fetching recent transactions:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Get transactions between two dates
router.get("/range/:email", async (req, res) => {
    try {
        const { email } = req.params;
        const { startDate, endDate } = req.query;

        if (!email || !startDate || !endDate) {
            return res.status(400).json({ 
                error: "Email, startDate, and endDate are required!" 
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        // ✅ Fetch transactions within date range
        const [incomes, expenses] = await Promise.all([
            IncomeModel.find({ 
                email, 
                date: { $gte: start, $lte: end } 
            }).lean(),
            ExpenseModel.find({ 
                email, 
                date: { $gte: start, $lte: end } 
            }).lean()
        ]);

        // ✅ Format and calculate totals
        const formattedIncomes = incomes.map(inc => ({
            ...inc,
            type: 'income',
            displayAmount: `+₹${inc.amount}`
        }));

        const formattedExpenses = expenses.map(exp => ({
            ...exp,
            type: 'expense',
            displayAmount: `-₹${exp.amount}`
        }));

        const allTransactions = [...formattedIncomes, ...formattedExpenses]
            .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

        const totalIncome = formattedIncomes.reduce((sum, i) => sum + i.amount, 0);
        const totalExpense = formattedExpenses.reduce((sum, e) => sum + e.amount, 0);

        res.status(200).json({
            dateRange: { startDate: start, endDate: end },
            transactions: allTransactions,
            totals: {
                income: totalIncome,
                expense: totalExpense,
                balance: totalIncome - totalExpense
            },
            counts: {
                income: formattedIncomes.length,
                expense: formattedExpenses.length,
                total: allTransactions.length
            }
        });
    } catch (err) {
        console.error("❌ Error fetching transactions by range:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Helper Functions

// Check if transaction can be edited (within 12 hours)
function canEditTransaction(createdAt) {
    if (!createdAt) return false;
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    return new Date(createdAt) > twelveHoursAgo;
}

// Sort transactions
function sortTransactions(transactions, sortBy) {
    return transactions.sort((a, b) => {
        const dateTimeA = new Date(`${a.date}T${a.time}`);
        const dateTimeB = new Date(`${b.date}T${b.time}`);
        
        switch(sortBy) {
            case 'date_asc':
                return dateTimeA - dateTimeB;
            case 'date_desc':
                return dateTimeB - dateTimeA;
            case 'amount_asc':
                return a.amount - b.amount;
            case 'amount_desc':
                return b.amount - a.amount;
            default:
                return dateTimeB - dateTimeA;
        }
    });
}

// Group transactions by period
function groupTransactionsByPeriod(transactions, period) {
    const grouped = {};
    
    transactions.forEach(transaction => {
        const date = new Date(transaction.date);
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
                income: 0,
                expense: 0,
                balance: 0,
                transactions: []
            };
        }
        
        if (transaction.type === 'income') {
            grouped[key].income += transaction.amount;
        } else {
            grouped[key].expense += transaction.amount;
        }
        
        grouped[key].balance = grouped[key].income - grouped[key].expense;
        grouped[key].transactions.push(transaction);
    });
    
    return Object.values(grouped).sort((a, b) => a.period.localeCompare(b.period));
}

// Get date range for period
function getDateRangeForPeriod(period) {
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

// Calculate period totals
function calculatePeriodTotals(incomeByPeriod, expenseByPeriod) {
    const periodMap = {};
    
    // Process income periods
    incomeByPeriod.forEach(item => {
        if (!periodMap[item.period]) {
            periodMap[item.period] = { income: 0, expense: 0, balance: 0 };
        }
        periodMap[item.period].income = item.income;
        periodMap[item.period].balance += item.income;
    });
    
    // Process expense periods
    expenseByPeriod.forEach(item => {
        if (!periodMap[item.period]) {
            periodMap[item.period] = { income: 0, expense: 0, balance: 0 };
        }
        periodMap[item.period].expense = item.expense;
        periodMap[item.period].balance -= item.expense;
    });
    
    return Object.entries(periodMap).map(([period, data]) => ({
        period,
        ...data
    }));
}

// Get category summary
function getCategorySummary(incomes, expenses) {
    const categoryMap = {};
    
    // Process income categories
    incomes.forEach(item => {
        const category = item.category || 'Uncategorized';
        if (!categoryMap[category]) {
            categoryMap[category] = { income: 0, expense: 0, total: 0 };
        }
        categoryMap[category].income += item.amount;
        categoryMap[category].total += item.amount;
    });
    
    // Process expense categories
    expenses.forEach(item => {
        const category = item.category || 'Uncategorized';
        if (!categoryMap[category]) {
            categoryMap[category] = { income: 0, expense: 0, total: 0 };
        }
        categoryMap[category].expense += item.amount;
        categoryMap[category].total -= item.amount;
    });
    
    return Object.entries(categoryMap).map(([category, data]) => ({
        category,
        ...data
    })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

// Get division summary
function getDivisionSummary(incomes, expenses) {
    const divisionMap = {};
    
    // Process income divisions
    incomes.forEach(item => {
        const division = item.division || 'Personal';
        if (!divisionMap[division]) {
            divisionMap[division] = { income: 0, expense: 0, balance: 0 };
        }
        divisionMap[division].income += item.amount;
        divisionMap[division].balance += item.amount;
    });
    
    // Process expense divisions
    expenses.forEach(item => {
        const division = item.division || 'Personal';
        if (!divisionMap[division]) {
            divisionMap[division] = { income: 0, expense: 0, balance: 0 };
        }
        divisionMap[division].expense += item.amount;
        divisionMap[division].balance -= item.amount;
    });
    
    return Object.entries(divisionMap).map(([division, data]) => ({
        division,
        ...data
    }));
}

module.exports = router;