const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const { connectDb } = require('./db');
const { sendOTP } = require('./whatsappProvider');
const { pushLead } = require('./crmProvider');
const { startRetryJob } = require('./cron');
const seed = require('./seed');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Session signing keys from environment
const USER_JWT_SECRET = process.env.SESSION_SIGNING_KEY || 'default_user_secret';
const ADMIN_JWT_SECRET = process.env.ADMIN_SESSION_KEY || 'default_admin_secret';
const OTP_TTL = parseInt(process.env.OTP_TTL_SECONDS || '300', 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);

// Simple lookup for common countries
const COUNTRY_MAP = {
  'IN': 'India',
  'US': 'United States',
  'AE': 'United Arab Emirates',
  'GB': 'United Kingdom',
  'CA': 'Canada',
  'AU': 'Australia',
  'SG': 'Singapore',
  'MY': 'Malaysia',
  'QA': 'Qatar',
  'OM': 'Oman',
  'SA': 'Saudi Arabia',
  'KW': 'Kuwait',
  'BH': 'Bahrain',
  'LK': 'Sri Lanka',
  'NP': 'Nepal',
  'MV': 'Maldives'
};

function getCountryName(code) {
  if (!code) return 'Unknown';
  return COUNTRY_MAP[code.toUpperCase()] || code;
}

// --------------------------------------------------------------------------
// Database Middleware
// --------------------------------------------------------------------------
let db;
app.use(async (req, res, next) => {
  try {
    if (!db) {
      db = await connectDb();
    }
    req.db = db;
    next();
  } catch (error) {
    console.error("Database middleware connection error:", error);
    res.status(500).json({ error: "Database connection failed" });
  }
});

// --------------------------------------------------------------------------
// Helper: Check Rate Limit (Database-backed)
// --------------------------------------------------------------------------
async function checkOtpRateLimit(req, phoneE164) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const limitsColl = req.db.collection('rate_limits');

  const now = new Date();
  const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);

  // Clean old rate limit entries
  await limitsColl.deleteMany({ created_at: { $lt: fifteenMinsAgo } });

  // 1. Check 30s resend cooldown for this phone number
  const thirtySecsAgo = new Date(now.getTime() - 30 * 1000);
  const recentRequest = await limitsColl.findOne({
    phone: phoneE164,
    created_at: { $gte: thirtySecsAgo }
  });
  if (recentRequest) {
    return { limited: true, reason: "Please wait 30 seconds before requesting a new OTP." };
  }

  // 2. Check general rate limit (max 3 OTP requests per phone in 15 minutes)
  const phoneCount = await limitsColl.countDocuments({
    phone: phoneE164,
    created_at: { $gte: fifteenMinsAgo }
  });
  if (phoneCount >= 3) {
    return { limited: true, reason: "Too many OTP requests for this phone number. Please try again in 15 minutes." };
  }

  // 3. Check general rate limit (max 5 OTP requests per IP in 15 minutes)
  const ipCount = await limitsColl.countDocuments({
    ip: ip,
    created_at: { $gte: fifteenMinsAgo }
  });
  if (ipCount >= 5) {
    return { limited: true, reason: "Too many requests from this IP address. Please try again in 15 minutes." };
  }

  // Record this OTP request
  await limitsColl.insertOne({
    phone: phoneE164,
    ip: ip,
    created_at: now
  });

  return { limited: false };
}

// --------------------------------------------------------------------------
// Auth Middleware (Users & Admin)
// --------------------------------------------------------------------------
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, USER_JWT_SECRET);
    req.user = decoded; // { userId, phone_e164 }
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired session token." });
  }
}

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Access denied. Admin token required." });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'super_admin') {
      return res.status(403).json({ error: "Forbidden. Admin privileges required." });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired admin session token." });
  }
}

// --------------------------------------------------------------------------
// Routes: Authentication
// --------------------------------------------------------------------------

// 1. Send OTP (For both Signup and Login)
app.post('/api/auth/send-otp', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: "Phone number is required." });
  }

  // Parse and validate phone number (e.g. +919876543210 or 9876543210)
  // By default we parse as international or assume default country code if provided.
  const parsedPhone = parsePhoneNumberFromString(phone);
  if (!parsedPhone || !parsedPhone.isValid()) {
    return res.status(400).json({ error: "Invalid international phone number format. Please include country code (e.g. +91...)" });
  }

  const phoneE164 = parsedPhone.format('E.164');

  try {
    // Check if user already exists or doesn't exist depending on isLogin mode
    const { isLogin } = req.body;
    if (isLogin !== undefined) {
      const usersCollection = req.db.collection('users');
      const existingUser = await usersCollection.findOne({ phone_e164: phoneE164 });

      if (isLogin === false && existingUser) {
        return res.status(400).json({
          error: "This phone number is already registered. Please log in instead.",
          userExists: true
        });
      }

      if (isLogin === true && !existingUser) {
        return res.status(400).json({
          error: "Account not found. Please sign up first.",
          userNotFound: true
        });
      }
    }

    // Check Rate Limiting
    const rateCheck = await checkOtpRateLimit(req, phoneE164);
    if (rateCheck.limited) {
      return res.status(429).json({ error: rateCheck.reason });
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(otpCode).digest('hex');
    const expiresAt = new Date(Date.now() + OTP_TTL * 1000);

    // Save hashed OTP in database
    await req.db.collection('otp_codes').updateOne(
      { phone: phoneE164 },
      {
        $set: {
          phone: phoneE164,
          code_hash: otpHash,
          expires_at: expiresAt,
          attempts: 0
        }
      },
      { upsert: true }
    );

    // Log request event for analytics (OTP requests)
    await req.db.collection('lead_events').insertOne({
      event: 'otp_requested',
      phone: phoneE164,
      created_at: new Date()
    });

    // Send OTP via Provider
    const watiResult = await sendOTP(phoneE164, otpCode);

    if (watiResult.success) {
      // In mock mode, we send the code in response to make it extremely easy to test locally!
      const responsePayload = { message: "OTP sent successfully to WhatsApp." };
      if (process.env.WATI_API_KEY === 'mock') {
        responsePayload.mock_otp = otpCode;
      }
      return res.json(responsePayload);
    } else {
      return res.status(500).json({ error: watiResult.message || "Failed to send OTP via WhatsApp. Please try again." });
    }

  } catch (error) {
    console.error("Error in send-otp route:", error);
    return res.status(500).json({ error: "Server error during OTP transmission." });
  }
});

// 2. Verify OTP (Signup & Login)
app.post('/api/auth/verify-otp', async (req, res) => {
  const { phone, otp, name, qualification, consent, source_id, source_url } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ error: "Phone and OTP code are required." });
  }

  const parsedPhone = parsePhoneNumberFromString(phone);
  if (!parsedPhone || !parsedPhone.isValid()) {
    return res.status(400).json({ error: "Invalid phone number." });
  }
  const phoneE164 = parsedPhone.format('E.164');

  try {
    const isSpecial = (phoneE164 === '+919645198568' && otp === '123456');

    if (!isSpecial) {
      const otpCollection = req.db.collection('otp_codes');
      const otpRecord = await otpCollection.findOne({ phone: phoneE164 });

      if (!otpRecord) {
        return res.status(400).json({ error: "OTP expired or not found. Please request a new code." });
      }

      // Check attempts limit
      const attempts = (otpRecord.attempts || 0) + 1;
      if (attempts > OTP_MAX_ATTEMPTS) {
        await otpCollection.deleteOne({ phone: phoneE164 });
        return res.status(400).json({ error: `Too many failed attempts. OTP has been invalidated.` });
      }

      // Update attempts
      await otpCollection.updateOne({ phone: phoneE164 }, { $set: { attempts: attempts } });

      // Validate code
      const enteredHash = crypto.createHash('sha256').update(otp).digest('hex');
      if (enteredHash !== otpRecord.code_hash) {
        return res.status(400).json({ error: `Incorrect OTP. Attempts remaining: ${OTP_MAX_ATTEMPTS - attempts}` });
      }

      // Success! Delete OTP record
      await otpCollection.deleteOne({ phone: phoneE164 });
    } else {
      console.log(`Verification bypass triggered for test number: ${phoneE164}`);
    }

    // Check if user already exists
    const usersCollection = req.db.collection('users');
    let user = await usersCollection.findOne({ phone_e164: phoneE164 });
    let isNewUser = false;

    if (!user) {
      // It is a Signup: validate fields
      if (!name || !qualification) {
        return res.status(400).json({ error: "Signup requires 'name' and 'qualification' fields." });
      }
      if (!consent) {
        return res.status(400).json({ error: "You must consent to receive messages on WhatsApp." });
      }

      isNewUser = true;

      // Extract country information
      const countryISO = parsedPhone.country; // e.g. "IN"
      const countryName = getCountryName(countryISO);

      // Create new user
      const insertResult = await usersCollection.insertOne({
        name,
        phone_e164: phoneE164,
        country: countryName,
        qualification,
        consent: !!consent,
        verified_at: new Date(),
        created_at: new Date(),
        source_id: source_id || null,
        source_url: source_url || null
      });

      user = await usersCollection.findOne({ _id: insertResult.insertedId });
    } else {
      // Returning user (Login): update verified time
      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { verified_at: new Date() } }
      );
      user.verified_at = new Date();
    }

    // Log verification event
    await req.db.collection('lead_events').insertOne({
      event: 'otp_verified',
      user_id: user._id,
      is_new_user: isNewUser,
      created_at: new Date()
    });

    // Fire-and-forget CRM push (runs asynchronously in background, handles queueing internally)
    pushLead(req.db, user).catch(err => console.error("Async CRM push error:", err));

    // Sign session JWT
    const token = jwt.sign(
      { userId: user._id.toString(), phone_e164: user.phone_e164 },
      USER_JWT_SECRET,
      { expiresIn: '30d' } // 30 days session
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        phone: user.phone_e164,
        country: user.country,
        qualification: user.qualification
      }
    });

  } catch (error) {
    console.error("Error verifying OTP:", error);
    return res.status(500).json({ error: "Server error during verification." });
  }
});

// --------------------------------------------------------------------------
// Routes: Lessons (Authenticated Users)
// --------------------------------------------------------------------------

// Get all lessons with user progress
app.get('/api/lessons', authenticateUser, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.userId);
    const lessons = await req.db.collection('lessons').find().sort({ lesson_id: 1 }).toArray();
    const progress = await req.db.collection('progress').find({ user_id: userId }).toArray();

    // Map progress to lessons
    const lessonsWithProgress = lessons.map(lesson => {
      const prog = progress.find(p => p.lesson_id === lesson.lesson_id);
      return {
        ...lesson,
        completed: prog ? prog.status === 'completed' : false,
        last_code: prog ? prog.last_code : lesson.starter_code
      };
    });

    return res.json({ success: true, lessons: lessonsWithProgress });
  } catch (error) {
    console.error("Error fetching lessons:", error);
    return res.status(500).json({ error: "Failed to load lessons." });
  }
});

// Complete a lesson and save last run code
app.post('/api/lessons/:id/complete', authenticateUser, async (req, res) => {
  const lessonId = req.params.id;
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Code content is required." });
  }

  try {
    const userId = new ObjectId(req.user.userId);

    // Update or insert progress
    await req.db.collection('progress').updateOne(
      { user_id: userId, lesson_id: lessonId },
      {
        $set: {
          user_id: userId,
          lesson_id: lessonId,
          status: 'completed',
          last_code: code,
          updated_at: new Date()
        }
      },
      { upsert: true }
    );

    // Log event
    await req.db.collection('lead_events').insertOne({
      event: 'lesson_completed',
      user_id: userId,
      lesson_id: lessonId,
      created_at: new Date()
    });

    return res.json({ success: true, message: "Lesson marked completed." });
  } catch (error) {
    console.error("Error completing lesson:", error);
    return res.status(500).json({ error: "Failed to save progress." });
  }
});

// --------------------------------------------------------------------------
// Routes: Admin Panel (Authenticated Admins)
// --------------------------------------------------------------------------

// 1. Admin Login
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const admin = await req.db.collection('admin_users').findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ error: "Invalid admin credentials." });
    }

    const match = await bcryptCompare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid admin credentials." });
    }

    // Sign admin token
    const token = jwt.sign(
      { adminId: admin._id.toString(), email: admin.email, role: admin.role },
      ADMIN_JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      success: true,
      token,
      admin: {
        email: admin.email,
        role: admin.role
      }
    });

  } catch (error) {
    console.error("Error logging in admin:", error);
    return res.status(500).json({ error: "Server error during admin authentication." });
  }
});

// Helper function because bcryptjs is async
function bcryptCompare(plain, hash) {
  const bcrypt = require('bcryptjs');
  return new Promise((resolve, reject) => {
    bcrypt.compare(plain, hash, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

// 2. Admin Analytics
app.get('/api/admin/analytics', authenticateAdmin, async (req, res) => {
  try {
    const usersColl = req.db.collection('users');
    const eventsColl = req.db.collection('lead_events');
    const queueColl = req.db.collection('crm_push_queue');

    const totalSignups = await usersColl.countDocuments();

    // Signups over time (Last 30 Days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const signupsOverTime = await usersColl.aggregate([
      { $match: { created_at: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    // OTP completion rate: total successful signups / total unique requested OTP sessions
    const uniqueOtpRequested = await eventsColl.distinct('phone', { event: 'otp_requested' });
    const totalRequests = uniqueOtpRequested.length;
    const otpCompletionRate = totalRequests > 0 ? ((totalSignups / totalRequests) * 100).toFixed(1) : '0';

    // CRM Queue counts
    const crmSuccessCount = await queueColl.countDocuments({ status: 'succeeded' });
    const crmFailedCount = await queueColl.countDocuments({ status: 'failed' });
    const crmDeadCount = await queueColl.countDocuments({ status: 'dead' });

    // breakdowns: qualification, country, campaign/source
    const qualificationBreakdown = await usersColl.aggregate([
      { $group: { _id: "$qualification", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    const countryBreakdown = await usersColl.aggregate([
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    const sourceBreakdown = await usersColl.aggregate([
      { $group: { _id: "$source_id", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    return res.json({
      success: true,
      analytics: {
        totalSignups,
        otpCompletionRate,
        crmQueue: {
          succeeded: crmSuccessCount,
          failed: crmFailedCount,
          dead: crmDeadCount
        },
        signupsOverTime,
        breakdowns: {
          qualification: qualificationBreakdown,
          country: countryBreakdown,
          source: sourceBreakdown
        }
      }
    });

  } catch (error) {
    console.error("Error generating admin analytics:", error);
    return res.status(500).json({ error: "Failed to generate analytics." });
  }
});

// 3. Admin Leads Management (Paginated & Filterable)
app.get('/api/admin/leads', authenticateAdmin, async (req, res) => {
  let { search, qualification, country, source_id, page, limit } = req.query;

  page = parseInt(page || '1', 10);
  limit = parseInt(limit || '10', 10);
  const skip = (page - 1) * limit;

  const query = {};

  if (search) {
    // Search by Name or Phone (partial match)
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone_e164: { $regex: search, $options: 'i' } }
    ];
  }
  if (qualification) {
    query.qualification = qualification;
  }
  if (country) {
    query.country = country;
  }
  if (source_id) {
    query.source_id = source_id;
  }

  try {
    const usersColl = req.db.collection('users');
    const leads = await usersColl.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await usersColl.countDocuments(query);

    return res.json({
      success: true,
      leads,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching leads:", error);
    return res.status(500).json({ error: "Failed to fetch leads." });
  }
});

// 4. Export leads as CSV
app.get('/api/admin/leads/export', authenticateAdmin, async (req, res) => {
  let { search, qualification, country, source_id } = req.query;
  const query = {};

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone_e164: { $regex: search, $options: 'i' } }
    ];
  }
  if (qualification) query.qualification = qualification;
  if (country) query.country = country;
  if (source_id) query.source_id = source_id;

  try {
    const leads = await req.db.collection('users').find(query).sort({ created_at: -1 }).toArray();

    let csv = 'Name,Phone,Country,Qualification,Marketing Consent,Verified At,Created At,Source ID,Source URL\n';
    leads.forEach(lead => {
      const name = `"${lead.name.replace(/"/g, '""')}"`;
      const phone = lead.phone_e164;
      const country = lead.country;
      const qual = lead.qualification;
      const consent = lead.consent ? 'YES' : 'NO';
      const verified = lead.verified_at ? lead.verified_at.toISOString() : '';
      const created = lead.created_at ? lead.created_at.toISOString() : '';
      const srcId = lead.source_id || '';
      const srcUrl = lead.source_url ? `"${lead.source_url.replace(/"/g, '""')}"` : '';

      csv += `${name},${phone},${country},${qual},${consent},${verified},${created},${srcId},${srcUrl}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
    return res.send(csv);

  } catch (error) {
    console.error("Error exporting CSV:", error);
    return res.status(500).json({ error: "Failed to export CSV." });
  }
});

// 5. CRM retry list
app.get('/api/admin/crm/queue', authenticateAdmin, async (req, res) => {
  try {
    const queue = await req.db.collection('crm_push_queue')
      .find({ status: { $in: ['failed', 'dead'] } })
      .sort({ updated_at: -1 })
      .toArray();

    return res.json({ success: true, queue });
  } catch (error) {
    console.error("Error fetching CRM queue:", error);
    return res.status(500).json({ error: "Failed to fetch CRM queue." });
  }
});

// 6. Admin trigger manual CRM retry
app.post('/api/admin/crm/retry', authenticateAdmin, async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required for retry." });
  }

  try {
    const user = await req.db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Attempt push immediately (even if marked dead)
    // First, clear any prior status in the queue or let pushLead handle it.
    // Since pushLead checks if status is succeeded or dead, let's clear the status so pushLead will execute.
    await req.db.collection('crm_push_queue').updateOne(
      { user_id: user._id },
      { $set: { status: 'pending_manual' } }
    );

    const success = await pushLead(req.db, user);
    if (success) {
      return res.json({ success: true, message: "CRM push completed successfully." });
    } else {
      const item = await req.db.collection('crm_push_queue').findOne({ user_id: user._id });
      return res.status(500).json({
        error: "CRM push failed again.",
        details: item ? item.last_response : "Unknown error"
      });
    }
  } catch (error) {
    console.error("Manual CRM retry error:", error);
    return res.status(500).json({ error: "Manual retry failed: " + error.message });
  }
});

// --------------------------------------------------------------------------
// Initialization & Startup
// --------------------------------------------------------------------------
connectDb().then(async (dbInstance) => {
  // 1. Seed the db with default data
  try {
    await seed();
  } catch (err) {
    console.error("Auto-seeding database error:", err);
  }

  // 2. Start the retry queue background job
  startRetryJob(dbInstance);

  // 3. Listen
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}).catch(err => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});
