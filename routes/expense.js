const express = require("express");
const router = express.Router();
const AddExpense = require("../models/Addexpense");
const Account = require("../models/AccountModel"); // You'll need to create this

// ✅ Add expense with all required fields
router.post("/minus", async (req, res) => {
    try {
        console.log("📩 Received payload in backend:", req.body);

        const { 
            email, 
            source, 
            amount, 
            date, 
            time, 
            notes, 
            paymentMethod,
            division, // ✅ NEW: Office or Personal
            category, // ✅ NEW: Fuel, Food, Medical, etc.
            account   // ✅ NEW: Which account is used
        } = req.body;

        // ✅ Validation for required fields
        if (!email || !source || !amount || !date || !time || !paymentMethod) {
            return res.status(400).json({ error: "Required fields are missing!" });
        }

        // ✅ Create expense with all fields
        const newExpense = new AddExpense({
            email,
            source,
            amount: parseFloat(amount),
            date: new Date(date),
            time,
            notes,
            paymentMethod,
            division: division || "Personal", // ✅ Default to Personal
            category: category || source,    // ✅ Use source as category if not provided
            account: account || "Cash"       // ✅ Default to Cash if not provided
        });

        // ✅ Save to database
        await newExpense.save();
        console.log("✅ Expense saved in DB:", newExpense);

        // ✅ Update account balance (if Account model exists)
        if (account) {
            try {
                await Account.findOneAndUpdate(
                    { email: email, accountName: account },
                    { $inc: { balance: -parseFloat(amount) } },
                    { new: true, upsert: false }
                );
                console.log(`✅ Account ${account} balance updated`);
            } catch (accountError) {
                console.log("⚠️ Could not update account balance:", accountError.message);
                // Continue even if account update fails
            }
        }

        res.status(201).json({ 
            message: "Expense added successfully!", 
            expense: newExpense 
        });
    } catch (err) {
        console.error("❌ Error adding Expense:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Get expenses with filters
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

        // ✅ Fetch expenses
        const expenses = await AddExpense.find(query).sort({ date: -1, time: -1 });

        // ✅ Group by period if requested
        let responseData = expenses;
        if (period) {
            responseData = groupByPeriod(expenses, period);
        }

        res.status(200).json(responseData);
    } catch (err) {
        console.error("❌ Error fetching expenses:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Update expense (only within 12 hours)
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // ✅ Find the expense
        const expense = await AddExpense.findById(id);
        
        if (!expense) {
            return res.status(404).json({ error: "Expense not found!" });
        }

        // ✅ Check if can be edited (within 12 hours)
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        if (expense.createdAt < twelveHoursAgo) {
            return res.status(403).json({ 
                error: "Cannot edit expense after 12 hours of creation!" 
            });
        }

        // ✅ Update the expense
        const updatedExpense = await AddExpense.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        console.log("✅ Expense updated:", updatedExpense);
        res.status(200).json({ 
            message: "Expense updated successfully!", 
            expense: updatedExpense 
        });
    } catch (err) {
        console.error("❌ Error updating expense:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Delete expense (only within 12 hours)
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // ✅ Find the expense
        const expense = await AddExpense.findById(id);
        
        if (!expense) {
            return res.status(404).json({ error: "Expense not found!" });
        }

        // ✅ Check if can be deleted (within 12 hours)
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        if (expense.createdAt < twelveHoursAgo) {
            return res.status(403).json({ 
                error: "Cannot delete expense after 12 hours of creation!" 
            });
        }

        // ✅ Delete the expense
        await AddExpense.findByIdAndDelete(id);

        // ✅ Revert account balance (if Account model exists)
        if (expense.account) {
            try {
                await Account.findOneAndUpdate(
                    { email: expense.email, accountName: expense.account },
                    { $inc: { balance: expense.amount } },
                    { new: true }
                );
                console.log(`✅ Account ${expense.account} balance reverted`);
            } catch (accountError) {
                console.log("⚠️ Could not revert account balance:", accountError.message);
            }
        }

        console.log("✅ Expense deleted:", id);
        res.status(200).json({ message: "Expense deleted successfully!" });
    } catch (err) {
        console.error("❌ Error deleting expense:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Get expense summary by category
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
        const summary = await AddExpense.aggregate([
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
        console.error("❌ Error fetching expense summary:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Helper function to group expenses by period
function groupByPeriod(expenses, period) {
    const grouped = {};
    
    expenses.forEach(expense => {
        const date = new Date(expense.date);
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
        
        grouped[key].totalAmount += expense.amount;
        grouped[key].count += 1;
        grouped[key].items.push(expense);
    });
    
    return Object.values(grouped);
}

// ✅ Transfer between accounts (special type of expense)
router.post("/transfer", async (req, res) => {
    try {
        console.log("📩 Received transfer request:", req.body);

        const { 
            email, 
            fromAccount, 
            toAccount, 
            amount, 
            date, 
            time, 
            notes 
        } = req.body;

        if (!email || !fromAccount || !toAccount || !amount || !date) {
            return res.status(400).json({ error: "Required fields are missing!" });
        }

        // ✅ Create transfer expense (money leaving fromAccount)
        const transferExpense = new AddExpense({
            email,
            source: `Transfer to ${toAccount}`,
            amount: parseFloat(amount),
            date: new Date(date),
            time: time || new Date().toLocaleTimeString(),
            notes: notes || `Transfer to ${toAccount}`,
            paymentMethod: "Transfer",
            division: "Personal",
            category: "Transfer",
            account: fromAccount,
            isTransfer: true
        });

        await transferExpense.save();
        
        // ✅ Update account balances
        if (fromAccount && toAccount) {
            try {
                // Deduct from source account
                await Account.findOneAndUpdate(
                    { email: email, accountName: fromAccount },
                    { $inc: { balance: -parseFloat(amount) } },
                    { new: true }
                );
                
                // Add to destination account
                await Account.findOneAndUpdate(
                    { email: email, accountName: toAccount },
                    { $inc: { balance: parseFloat(amount) } },
                    { new: true }
                );
                
                console.log(`✅ Transfer completed: ${amount} from ${fromAccount} to ${toAccount}`);
            } catch (accountError) {
                console.log("⚠️ Could not update account balances:", accountError.message);
            }
        }

        res.status(201).json({ 
            message: "Transfer completed successfully!", 
            transfer: transferExpense 
        });
    } catch (err) {
        console.error("❌ Error processing transfer:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Get expenses by category
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

        const expenses = await AddExpense.find(query).sort({ date: -1 });
        res.status(200).json(expenses);
    } catch (err) {
        console.error("❌ Error fetching expenses by category:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;