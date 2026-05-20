import * as sdk from "microsoft-cognitiveservices-speech-sdk";

export function isAzureSpeechConfigured(): boolean {
  return Boolean(
    process.env.AZURE_SPEECH_KEY?.trim() &&
      process.env.AZURE_SPEECH_REGION?.trim(),
  );
}

function streamFormatForFilename(filename: string): sdk.AudioStreamFormat {
  const ext = filename.toLowerCase().split(".").pop() ?? "webm";
  switch (ext) {
    case "wav":
      return sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
    case "mp3":
      return sdk.AudioStreamFormat.getWaveFormat(
        16000,
        16,
        1,
        sdk.AudioFormatTag.MP3,
      );
    case "ogg":
      return sdk.AudioStreamFormat.getWaveFormat(
        16000,
        16,
        1,
        sdk.AudioFormatTag.OGG_OPUS,
      );
    case "webm":
    default:
      return sdk.AudioStreamFormat.getWaveFormat(
        16000,
        16,
        1,
        sdk.AudioFormatTag.WEBM_OPUS,
      );
  }
}

/** One-shot speech-to-text via Azure AI Speech (interview voice answers). */
export async function transcribeWithAzureSpeech(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const region = process.env.AZURE_SPEECH_REGION?.trim();
  if (!key || !region) {
    throw new Error(
      "Azure Speech is not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (Vercel → Settings → Environment Variables).",
    );
  }

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage =
    process.env.AZURE_SPEECH_LANGUAGE?.trim() || "en-US";

  const format = streamFormatForFilename(filename);
  const pushStream = sdk.AudioInputStream.createPushStream(format);
  const chunk = new Uint8Array(buffer);
  pushStream.write(chunk.buffer as ArrayBuffer);
  pushStream.close();

  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close();
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          const text = result.text.trim();
          if (!text) {
            reject(
              new Error(
                "Azure Speech returned empty text. Try speaking closer to the mic or re-record.",
              ),
            );
            return;
          }
          resolve(text);
          return;
        }
        if (result.reason === sdk.ResultReason.NoMatch) {
          reject(
            new Error(
              "Could not recognize speech in the recording. Try again in a quieter place.",
            ),
          );
          return;
        }
        reject(
          new Error(
            result.errorDetails ||
              `Azure Speech recognition failed (reason ${result.reason}).`,
          ),
        );
      },
      (err: string) => {
        recognizer.close();
        reject(new Error(err || "Azure Speech request failed"));
      },
    );
  });
}
