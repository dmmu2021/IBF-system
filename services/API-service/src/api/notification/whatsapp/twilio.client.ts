export const twilioClient = require('twilio')(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTHTOKEN,
);
export const twilio = require('twilio');
