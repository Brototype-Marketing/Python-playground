require('dotenv').config();

const watiApiKey = process.env.WATI_API_KEY;
const watiBaseUrl = process.env.WATI_BASE_URL || 'https://api.wati.io';
const watiTemplate = process.env.WATI_OTP_TEMPLATE || 'otp_verification';

/**
 * Sends a 6-digit OTP code to a user's WhatsApp number.
 * @param {string} phoneE164 Phone number in E.164 format (e.g. +919876543210)
 * @param {string} code 6-digit OTP code
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function sendOTP(phoneE164, code) {
  // Clean phone number for WATI (some APIs expect it without the '+' prefix, but let's see)
  const cleanPhone = phoneE164.replace('+', '');

  console.log(`Clean phone: ${cleanPhone}`);

  if (!watiApiKey || watiApiKey === 'mock') {
    console.log(`\n======================================================`);
    console.log(`[WHATSAPP MOCK PROVIDER]`);
    console.log(`Sending OTP to: ${phoneE164}`);
    console.log(`6-Digit Verification Code: ${code}`);
    console.log(`======================================================\n`);
    return { success: true, message: "Mock OTP sent successfully" };
  }

  try {
    const url = `${watiBaseUrl.replace(/\/$/, '')}/api/ext/v3/messageTemplates/send`;
    const payload = {
      template_name: watiTemplate,
      broadcast_name: "otp_verification-codetocareer",
      recipients: [
        {
          phone_number: cleanPhone,
          custom_params: [
            {
              name: '1',
              value: code
            }
          ]
        }
      ]
    };

    console.log(`Attempting to send WATI OTP to ${phoneE164} using template ${watiTemplate} (API V3)...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': watiApiKey,
        'accept': 'application/json',
        'Content-Type': 'application/json-patch+json'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseError) {
      console.error(`WATI API returned non-JSON response (Status ${response.status}):`, text);
      return { success: false, message: `WATI API response error: ${text || response.statusText}` };
    }

    if (response.ok && (data.result === 'success' || data.success === true || data.valid === true)) {
      console.log(`WATI OTP sent successfully to ${phoneE164}`);
      return { success: true, message: "OTP sent via WhatsApp" };
    } else {
      console.error(`WATI API returned error (Status ${response.status}):`, data);
      return { success: false, message: data.message || "Failed to send template message via WATI" };
    }
  } catch (error) {
    console.error(`WATI API fetch error:`, error);
    return { success: false, message: error.message };
  }
}

module.exports = {
  sendOTP
};
