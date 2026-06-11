const { MongoClient } = require('mongodb');
const uri = "mongodb+srv://marketingmanager_db_user:Qc2tIqUwSPS5x6U5@cluster0.0svfmzb.mongodb.net/?appName=Cluster0";

async function run() {
  console.log("Connecting to Atlas...");
  const client = new MongoClient(uri, { tlsAllowInvalidCertificates: true });
  try {
    await client.connect();
    console.log("Connected successfully to Atlas!");
    const db = client.db('codetocareer');
    console.log("Database selected:", db.databaseName);
  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    await client.close();
  }
}
run();
