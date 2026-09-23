const fs = require('fs');
const path = require('path');

const nextDir = path.join(__dirname, '..', '.next');

if (fs.existsSync(nextDir)) {
  try {
    fs.rmSync(nextDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    console.log('Successfully cleaned .next directory');
  } catch (err) {
    console.warn('Warning: Could not remove .next directory:', err.message);
  }
} else {
  console.log('.next directory does not exist, clean skipped');
}
