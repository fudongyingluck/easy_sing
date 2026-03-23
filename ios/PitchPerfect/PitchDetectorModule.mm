#import "PitchDetectorModule.h"
#import <AVFoundation/AVFoundation.h>

// ---------------------------------------------------------------------------
// Pitch detection: YIN algorithm, pure C
// Returns fundamental frequency in Hz, or 0 if not detected.
// ---------------------------------------------------------------------------
static float yin_detect(const float *buf, int N, float sampleRate, float threshold) {
  // Period search range: 80 Hz – 1100 Hz
  int minPeriod = (int)(sampleRate / 1100.0f);
  int maxPeriod = (int)(sampleRate / 80.0f);
  if (maxPeriod >= N / 2) maxPeriod = N / 2 - 1;
  if (maxPeriod <= minPeriod) return 0.0f;

  int windowLen = N - maxPeriod;   // fixed window length for all tau

  // --- Step 2: difference function d[tau], tau in [1, maxPeriod] ---
  // We must compute ALL tau from 1 for correct CMND normalization.
  float *d = (float *)malloc((maxPeriod + 1) * sizeof(float));
  if (!d) return 0.0f;
  d[0] = 0.0f;
  for (int tau = 1; tau <= maxPeriod; tau++) {
    float sum = 0.0f;
    for (int j = 0; j < windowLen; j++) {
      float diff = buf[j] - buf[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // --- Step 3: Cumulative Mean Normalized Difference (CMND) ---
  float *cmnd = (float *)malloc((maxPeriod + 1) * sizeof(float));
  if (!cmnd) { free(d); return 0.0f; }
  cmnd[0] = 1.0f;
  float runningSum = 0.0f;
  for (int tau = 1; tau <= maxPeriod; tau++) {
    runningSum += d[tau];
    cmnd[tau] = (runningSum < 1e-10f) ? 1.0f : (d[tau] * (float)tau / runningSum);
  }

  // --- Step 4: First dip below threshold ---
  int bestTau = -1;
  for (int tau = minPeriod; tau <= maxPeriod - 1; tau++) {
    if (cmnd[tau] < threshold) {
      // Find local minimum
      while (tau + 1 <= maxPeriod && cmnd[tau + 1] < cmnd[tau]) tau++;
      bestTau = tau;
      break;
    }
  }

  free(d);
  free(cmnd);

  if (bestTau < 0) return 0.0f;

  // --- Step 5: Parabolic interpolation ---
  float betterTau = (float)bestTau;
  if (bestTau > minPeriod && bestTau < maxPeriod) {
    float s0 = cmnd[bestTau - 1];
    float s1 = cmnd[bestTau];
    float s2 = cmnd[bestTau + 1];
    float denom = s0 - 2.0f * s1 + s2;
    if (fabsf(denom) > 1e-9f) {
      betterTau = bestTau + 0.5f * (s0 - s2) / denom;
    }
  }

  return sampleRate / betterTau;
}

static float rms_level(const float *buf, int N) {
  float sum = 0;
  for (int i = 0; i < N; i++) sum += buf[i] * buf[i];
  return sqrtf(sum / N);
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------
@implementation PitchDetectorModule {
  AVAudioEngine *_engine;
  BOOL _running;
  float _sampleRate;
  // Pitch stability: keep last few valid frequencies for median smoothing
  float _history[5];
  int   _historyCount;
}

RCT_EXPORT_MODULE(PitchDetectorModule)

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onPitchDetected"];
}

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

// New architecture (bridgeless): must call super so _listenerCount is incremented,
// otherwise sendEventWithName silently drops all events.
RCT_EXPORT_METHOD(addListener:(NSString *)eventName) {
  [super addListener:eventName];
}

RCT_EXPORT_METHOD(removeListeners:(double)count) {
  [super removeListeners:count];
}

RCT_EXPORT_METHOD(startDetection:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (_running) { resolve(nil); return; }

  NSError *error = nil;
  AVAudioSession *session = [AVAudioSession sharedInstance];
  [session setCategory:AVAudioSessionCategoryPlayAndRecord
           withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker |
                       AVAudioSessionCategoryOptionAllowBluetooth
                 error:&error];
  if (error) { reject(@"session_error", @"AVAudioSession category failed", error); return; }
  [session setActive:YES error:&error];
  if (error) { reject(@"session_error", @"AVAudioSession activate failed", error); return; }

  _engine = [[AVAudioEngine alloc] init];
  AVAudioInputNode *inputNode = _engine.inputNode;
  AVAudioFormat *format = [inputNode outputFormatForBus:0];
  _sampleRate = (float)format.sampleRate;
  _historyCount = 0;
  memset(_history, 0, sizeof(_history));

  // 2048 @ 48kHz ≈ 42 ms/callback ≈ 23 callbacks/sec
  AVAudioFrameCount bufferSize = 2048;

  __weak PitchDetectorModule *weakSelf = self;
  [inputNode installTapOnBus:0 bufferSize:bufferSize format:format
                       block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
    PitchDetectorModule *self = weakSelf;
    if (!self || !self->_running) return;

    float *samples = buffer.floatChannelData[0];
    int frames = (int)buffer.frameLength;
    float sr = self->_sampleRate;

    // Gate silence
    if (rms_level(samples, frames) < 0.008f) {
      self->_historyCount = 0;  // reset stability on silence
      return;
    }

    float freq = yin_detect(samples, frames, sr, 0.12f);
    if (freq < 60.0f || freq > 1400.0f) {
      self->_historyCount = 0;
      return;
    }

    // Stability filter: reject if > 1 octave jump from recent median
    if (self->_historyCount > 0) {
      // Quick median of last valid values
      float ref = self->_history[(self->_historyCount - 1) % 5];
      float ratio = freq / ref;
      if (ratio < 0.5f || ratio > 2.0f) {
        // Likely an octave error or noise – skip
        return;
      }
    }

    // Store in ring history
    self->_history[self->_historyCount % 5] = freq;
    self->_historyCount++;

    [self sendEventWithName:@"onPitchDetected" body:@{@"freq": @(freq)}];
  }];

  [_engine prepare];
  [_engine startAndReturnError:&error];
  if (error) { reject(@"engine_error", @"AVAudioEngine start failed", error); return; }

  _running = YES;
  resolve(nil);
}

RCT_EXPORT_METHOD(stopDetection:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [self _stop];
  resolve(nil);
}

- (void)_stop {
  if (!_running) return;
  _running = NO;
  [_engine.inputNode removeTapOnBus:0];
  [_engine stop];
  _engine = nil;
  [[AVAudioSession sharedInstance] setActive:NO
                                 withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                                       error:nil];
}

- (void)invalidate {
  [self _stop];
  [super invalidate];
}

@end
