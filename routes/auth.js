const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User");

const router = express.Router();

// Store reset codes temporarily (use DB in production)
const resetCodes = {};

// REGISTER USER
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate email format
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format!" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "User already exists!" });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    res.json({ message: "User registered successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LOGIN USER
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid email or password!" });

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid email or password!" });

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.json({ message: "Login successful!", token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// FORGOT PASSWORD - Send 6-digit Reset Code
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "No account found with this email!" });

    // Generate a 6-digit numeric reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit random number
    resetCodes[email] = { code: resetCode, expiresAt: Date.now() + 10 * 60 * 1000 }; // Store reset code with expiry (10 min)

    // Email Transporter Setup (Using Gmail)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Email Content
    const emailContent = `
      <p>You requested to reset your password.</p>
      <p>Your password reset code is: <strong>${resetCode}</strong></p>
      <p>This code is valid for 10 minutes. Do not share it with anyone.</p>
    `;

    // Send Email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Password Reset Code",
      html: emailContent,
    });

    res.json({ message: "A reset code has been sent to your email.", email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// VERIFY RESET CODE
router.post("/verify-reset-code", (req, res) => {
  try {
    const { email, resetCode } = req.body;

    // Check if code exists and is not expired
    if (!resetCodes[email] || resetCodes[email].expiresAt < Date.now()) {
      return res.status(400).json({ error: "Reset code expired. Request a new one." });
    }

    if (resetCodes[email].code !== resetCode) {
      return res.status(400).json({ error: "Invalid reset code." });
    }

    // ✅ If the reset code is correct, allow the user to reset the password
    res.json({ message: "Code verified successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Something went wrong!" });
  }
});

// RESET PASSWORD AFTER CODE VERIFICATION
router.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required!" });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found!" });

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // ✅ Remove the reset code after successful password reset
    delete resetCodes[email];

    res.json({ message: "Password reset successful!" });
  } catch (error) {
    res.status(500).json({ error: "Something went wrong!" });
  }
});

module.exports = router;
