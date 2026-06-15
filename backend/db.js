const { MongoClient } = require('mongodb');
require('dotenv').config();

const url = process.env.MONGODB_URI;
if (!url) {
  console.error("CRITICAL: MONGODB_URI is not set in environment variables!");
  process.exit(1);
}

let client;
let db;

async function connectDb() {
  if (db) return db;
  try {
    console.log("Attempting connection to MongoDB URI...");
    client = new MongoClient(url);
    await client.connect();
    console.log("Connected successfully to primary MongoDB");
    db = client.db('codetocareer');
    await ensureIndexes();
    return db;
  } catch (error) {
    console.warn("Failed to connect to primary MongoDB:", error.message || error);
    console.log("Attempting fallback to local MongoDB (localhost:27017)...");
    try {
      const fallbackUrl = "mongodb://127.0.0.1:27017/codetocareer";
      client = new MongoClient(fallbackUrl);
      await client.connect();
      console.log("Connected successfully to local fallback MongoDB");
      db = client.db('codetocareer');
      await ensureIndexes();
      return db;
    } catch (fallbackError) {
      console.error("Failed to connect to local fallback MongoDB:", fallbackError.message || fallbackError);
      throw error;
    }
  }
}

async function getDb() {
  if (!db) {
    return await connectDb();
  }
  return db;
}

async function ensureIndexes() {
  if (!db) return;
  try {
    // 1. otp_codes collection
    // We want a TTL index on `expires_at`. Since it's a date object, setting expireAfterSeconds to 0 
    // will delete the document when the current time reaches expires_at.
    await db.collection('otp_codes').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    await db.collection('otp_codes').createIndex({ phone: 1 });

    // 2. users collection
    await db.collection('users').createIndex({ phone_e164: 1 }, { unique: true });

    // 3. sessions collection (for session revocation or logging if we want to store them)
    await db.collection('sessions').createIndex({ user_id: 1 });
    await db.collection('sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

    // 4. crm_push_queue collection
    await db.collection('crm_push_queue').createIndex({ user_id: 1 });
    await db.collection('crm_push_queue').createIndex({ status: 1 });

    // 5. admin_users collection
    await db.collection('admin_users').createIndex({ email: 1 }, { unique: true });

    // 6. progress collection
    await db.collection('progress').createIndex({ user_id: 1, lesson_id: 1 }, { unique: true });

    // 7. otp_requests collection
    await db.collection('otp_requests').createIndex({ phone: 1 });
    await db.collection('otp_requests').createIndex({ created_at: -1 });

    // 8. login_logs collection
    await db.collection('login_logs').createIndex({ user_id: 1 });
    await db.collection('login_logs').createIndex({ phone: 1 });
    await db.collection('login_logs').createIndex({ created_at: -1 });

    console.log("Database indexes verified and created successfully.");
  } catch (error) {
    console.error("Error creating database indexes:", error);
  }
}

module.exports = {
  connectDb,
  getDb
};
