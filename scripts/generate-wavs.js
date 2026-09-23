const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const outDir = path.join(__dirname, '..', 'public', 'audio');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const receiverText = "I have forty-seven cartons. Carton thirty-one is crushed underneath and wet on the right side.";
const driverText = "I confirm the damaged carton, but I dispute the shortage. The seal was intact.";

const receiverPath = path.join(outDir, 'scenario-po44891-receiver.wav');
const driverPath = path.join(outDir, 'scenario-po44891-driver.wav');

if (process.platform === 'win32') {
  console.log('Synthesizing authentic spoken audio via Windows System.Speech.Synthesis...');

  const tempPsScript = path.join(os.tmpdir(), `dockwitness-gen-wav-${Date.now()}.ps1`);
  const psScriptContent = `
Add-Type -AssemblyName System.Speech
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

# Receiver Statement (Microsoft Zira Desktop - Female)
$s1 = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $s1.SelectVoice("Microsoft Zira Desktop") } catch { Write-Warning "Zira voice not available, using default" }
$s1.SetOutputToWaveFile("${receiverPath.replace(/\\/g, '\\\\')}", $format)
$s1.Speak("${receiverText.replace(/"/g, '`"')}")
$s1.Dispose()

# Driver Statement (Microsoft David Desktop - Male)
$s2 = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $s2.SelectVoice("Microsoft David Desktop") } catch { Write-Warning "David voice not available, using default" }
$s2.SetOutputToWaveFile("${driverPath.replace(/\\/g, '\\\\')}", $format)
$s2.Speak("${driverText.replace(/"/g, '`"')}")
$s2.Dispose()
`;

  try {
    fs.writeFileSync(tempPsScript, psScriptContent, 'utf8');
    execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempPsScript}"`, {
      stdio: 'inherit',
    });
  } finally {
    if (fs.existsSync(tempPsScript)) {
      try { fs.unlinkSync(tempPsScript); } catch {}
    }
  }

  const receiverStats = fs.statSync(receiverPath);
  const driverStats = fs.statSync(driverPath);

  console.log('Successfully generated spoken scenario WAV files:');
  console.log(`  Receiver: ${receiverPath} (${receiverStats.size} bytes)`);
  console.log(`  Driver:   ${driverPath} (${driverStats.size} bytes)`);
} else {
  console.log('Non-Windows platform detected. Verifying existing WAV files exist:');
  if (fs.existsSync(receiverPath) && fs.existsSync(driverPath)) {
    console.log('  Existing scenario WAV files preserved.');
  } else {
    throw new Error('Scenario WAV files missing on non-Windows platform. They must be committed to the repository.');
  }
}
