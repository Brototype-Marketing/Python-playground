const bcrypt = require('bcryptjs');
const { getDb } = require('./db');
require('dotenv').config();

const lessonsData = [
  {
    lesson_id: "variables",
    title: "1. Python Variables & Print",
    concept: "Variables are used to store data in Python. You can print variables or string messages using the `print()` function. Modify the name below and run the script.",
    starter_code: `name = "Future Developer"
print("Hello, " + name + "!")
print("Welcome to Brototype's Code to Career Challenge!")
`
  },
  {
    lesson_id: "conditionals",
    title: "2. Conditionals (If/Else)",
    concept: "Use `if` and `else` statements to run code only when certain conditions are true. Note the indentation in Python (usually 4 spaces).",
    starter_code: `score = 85

if score >= 90:
    print("Grade: A - Excellent!")
elif score >= 75:
    print("Grade: B - Very Good!")
else:
    print("Grade: C - Keep practicing!")
`
  },
  {
    lesson_id: "loops",
    title: "3. Loops (For Loops)",
    concept: "Loops allow you to execute a block of code multiple times. The `range(N)` function generates numbers from 0 to N-1.",
    starter_code: `print("Starting countdown:")
for count in range(5, 0, -1):
    print(count)

print("Liftoff! Your programming career starts now.")
`
  },
  {
    lesson_id: "functions",
    title: "4. Python Functions",
    concept: "Functions are reusable blocks of code. You define them using the `def` keyword, followed by the function name and parameters.",
    starter_code: `def calculate_salary(base, bonus):
    total = base + bonus
    return total

salary = calculate_salary(50000, 7500)
print("Calculated Package: ₹" + str(salary))
`
  }
];

async function seed() {
  console.log("Seeding database...");
  const db = await getDb();

  // 1. Seed Lessons
  const lessonsColl = db.collection('lessons');
  for (const lesson of lessonsData) {
    await lessonsColl.updateOne(
      { lesson_id: lesson.lesson_id },
      { $set: lesson },
      { upsert: true }
    );
  }
  console.log("Lessons seeded successfully.");

  // 2. Seed Super Admin
  const adminColl = db.collection('admin_users');
  const existingAdmin = await adminColl.findOne({ role: 'super_admin' });
  
  if (!existingAdmin) {
    const defaultEmail = process.env.ADMIN_EMAIL;
    const defaultPassword = process.env.ADMIN_PASSWORD;
    const hash = await bcrypt.hash(defaultPassword, 10);
    
    await adminColl.insertOne({
      email: defaultEmail,
      password_hash: hash,
      role: 'super_admin',
      created_at: new Date()
    });
    console.log(`\n======================================================`);
    console.log(`[SUPER ADMIN SEEDED]`);
    console.log(`Email: ${defaultEmail}`);
    console.log(`Password: ${defaultPassword}`);
    console.log(`======================================================\n`);
  } else {
    console.log("Super admin already exists in the database.");
  }
}

if (require.main === module) {
  const { connectDb } = require('./db');
  connectDb()
    .then(seed)
    .then(() => {
      console.log("Seeding finished.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seeding failed:", err);
      process.exit(1);
    });
}

module.exports = seed;
