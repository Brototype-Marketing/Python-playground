require('dotenv').config();

const crmWebhookUrl = process.env.CRM_WEBHOOK_URL;

/**
 * Pushes user lead to the CRM webhook.
 * Does not block the user session — runs asynchronously or logs errors.
 * @param {object} db MongoDB Database instance
 * @param {object} user User object containing name, phone_e164, country, etc.
 * @returns {Promise<boolean>} returns true if successful, false if queued/failed.
 */
async function pushLead(db, user) {
  const userIdStr = user._id.toString();
  const payload = {
    name: user.name,
    phone: user.phone_e164,
    country: user.country,
    qualification: user.qualification,
    consent: user.consent,
    source_id: user.source_id || null,
    source_url: user.source_url || null,
    verified_at: user.verified_at,
    lead_source: "code_to_career_playground",
    idempotency_key: userIdStr
  };

  const queueCollection = db.collection('crm_push_queue');

  // Check if we already have a success or dead status to prevent duplicate pushes
  const existingQueue = await queueCollection.findOne({ user_id: user._id });
  if (existingQueue && (existingQueue.status === 'succeeded' || existingQueue.status === 'dead')) {
    console.log(`CRM Push: Lead for user ${userIdStr} already processed with status '${existingQueue.status}'. Skipping.`);
    return existingQueue.status === 'succeeded';
  }

  if (!crmWebhookUrl || crmWebhookUrl === 'mock') {
    console.log(`\n======================================================`);
    console.log(`[CRM MOCK WEBHOOK PUSH]`);
    console.log(`Payload:`, JSON.stringify(payload, null, 2));
    console.log(`======================================================\n`);

    await queueCollection.updateOne(
      { user_id: user._id },
      {
        $set: {
          user_id: user._id,
          payload,
          status: 'succeeded',
          attempts: 1,
          last_response: 'MOCK_SUCCESS',
          updated_at: new Date()
        }
      },
      { upsert: true }
    );
    return true;
  }

  try {
    console.log(`CRM Push: Sending lead for user ${userIdStr} to webhook...`);
    const response = await fetch(crmWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': userIdStr
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    if (response.ok) {
      console.log(`CRM Push: Webhook returned success (status ${response.status}) for user ${userIdStr}`);
      await queueCollection.updateOne(
        { user_id: user._id },
        {
          $set: {
            user_id: user._id,
            payload,
            status: 'succeeded',
            attempts: (existingQueue ? existingQueue.attempts : 0) + 1,
            last_response: responseText.slice(0, 500) || 'OK',
            updated_at: new Date()
          }
        },
        { upsert: true }
      );
      return true;
    } else {
      console.error(`CRM Push: Webhook failed (status ${response.status}) for user ${userIdStr}. Response: ${responseText}`);
      await handlePushFailure(db, user._id, payload, `HTTP_${response.status}: ${responseText}`);
      return false;
    }
  } catch (error) {
    console.error(`CRM Push: Webhook network error for user ${userIdStr}:`, error);
    await handlePushFailure(db, user._id, payload, `NETWORK_ERROR: ${error.message}`);
    return false;
  }
}

/**
 * Handles CRM push failure by updating the crm_push_queue with retry parameters.
 */
async function handlePushFailure(db, userId, payload, errorMsg) {
  const queueCollection = db.collection('crm_push_queue');
  const existing = await queueCollection.findOne({ user_id: userId });

  const attempts = existing ? existing.attempts + 1 : 1;
  const maxAttempts = 5;

  let status = 'failed';
  let nextRetryAt = null;

  if (attempts >= maxAttempts) {
    status = 'dead';
    console.log(`CRM Push: Max attempts (${maxAttempts}) reached for user ${userId.toString()}. Marking as dead.`);
  } else {
    // Exponential backoff: 30s * (2 ^ attempt) => 1 min, 2 min, 4 min, 8 min, etc.
    const backoffMs = 30000 * Math.pow(2, attempts - 1);
    nextRetryAt = new Date(Date.now() + backoffMs);
    console.log(`CRM Push: Queued retry #${attempts} for user ${userId.toString()} at ${nextRetryAt.toISOString()}`);
  }

  await queueCollection.updateOne(
    { user_id: userId },
    {
      $set: {
        user_id: userId,
        payload,
        status,
        attempts,
        next_retry_at: nextRetryAt,
        last_response: errorMsg.slice(0, 1000),
        updated_at: new Date()
      }
    },
    { upsert: true }
  );
}

module.exports = {
  pushLead
};
