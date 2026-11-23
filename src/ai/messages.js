export function geminiFailureMessage(reason) {
  switch (reason) {
    case 'not_configured': return 'Gemini is not configured.';
    case 'invalid_model': return 'The configured Gemini model is invalid.';
    case 'timeout': return 'Gemini took too long to respond. Please try again.';
    case 'rate_limited': return 'Gemini is rate-limited right now. Wait a bit before trying again.';
    case 'invalid_response': return 'Gemini returned a response LabLink could not use. Please try again.';
    default: return 'LabLink could not get a response from Gemini. Please try again later.';
  }
}
