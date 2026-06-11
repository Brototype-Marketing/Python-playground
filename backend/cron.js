const { pushLead } = require('./crmProvider');

let intervalId = null;

/**
 * Starts the background loop that polls and retries failed CRM pushes.
 * @param {object} db MongoDB Database instance
 */
function startRetryJob(db) {
  if (intervalId) return;

  const queueCollection = db.collection('crm_push_queue');
  const usersCollection = db.collection('users');

  console.log("CRM Retry background worker started.");

  // Check every 30 seconds
  intervalId = setInterval(async () => {
    try {
      const now = new Date();
      // Find failed push items whose next_retry_at time has passed
      const pendingRetries = await queueCollection.find({
        status: 'failed',
        next_retry_at: { $lte: now }
      }).toArray();

      if (pendingRetries.length > 0) {
        console.log(`CRM Retry Job: Found ${pendingRetries.length} pending retries to process.`);
      }

      for (const item of pendingRetries) {
        const user = await usersCollection.findOne({ _id: item.user_id });
        if (!user) {
          console.error(`CRM Retry Job: User ${item.user_id} not found in DB. Marking queue item as dead.`);
          await queueCollection.updateOne(
            { _id: item._id },
            {
              $set: {
                status: 'dead',
                last_response: 'User not found in users collection',
                updated_at: new Date()
              }
            }
          );
          continue;
        }

        console.log(`CRM Retry Job: Retrying push for user ${user._id} (${user.name})...`);
        // pushLead will internally manage updating the status to succeeded or failed with backoff
        await pushLead(db, user);
      }
    } catch (error) {
      console.error("CRM Retry Job Error:", error);
    }
  }, 30000); // 30 seconds interval
}

function stopRetryJob() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("CRM Retry background worker stopped.");
  }
}

module.exports = {
  startRetryJob,
  stopRetryJob
};
