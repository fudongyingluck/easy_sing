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
  // Pitch stability
  float _history[5];
  int   _historyCount;
  // Recording
  AVAudioFile *_recordingFile;
  BOOL         _isRecordingAudio;
  NSString    *_recordingPath;
  NSLock      *_recordingLock;
}

RCT_EXPORT_MODULE(PitchDetectorModule)

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onPitchDetected"];
}

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

RCT_EXPORT_METHOD(addListener:(NSString *)eventName) {
  [super addListener:eventName];
}

RCT_EXPORT_METHOD(removeListeners:(double)count) {
  [super removeListeners:count];
}

// ---------------------------------------------------------------------------
// startDetection
// ---------------------------------------------------------------------------
RCT_EXPORT_METHOD(startDetection:(double)detectionRate
                  resolver:(RCTPromiseResolveBlock)resolve
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
  _recordingLock = [[NSLock alloc] init];
  AVAudioInputNode *inputNode = _engine.inputNode;

  // 访问 mainMixerNode 会自动建立 mixer→outputNode 连接，使 VPIO 的输出侧有效，
  // 从而避免 render err: -1。设置音量为 0 保持静音。
  _engine.mainMixerNode.outputVolume = 0.0f;

  // 启用系统内置语音处理（回声消除 + 降噪），iOS 13+
  // 需要 mixer→output 连接存在，否则 AUVoiceIO 输出侧报 render err
  if ([inputNode respondsToSelector:@selector(setVoiceProcessingEnabled:error:)]) {
    NSError *vpError = nil;
    [inputNode setVoiceProcessingEnabled:YES error:&vpError];
    // vpError 不影响录音主流程，仅在调试时关注
  }

  AVAudioFormat *format = [inputNode outputFormatForBus:0];
  _sampleRate = (float)format.sampleRate;
  _historyCount = 0;
  memset(_history, 0, sizeof(_history));

  // detectionRate Hz → bufferSize（向上取整，最小 128，最大 4096）
  AVAudioFrameCount bufferSize = (detectionRate > 0)
    ? (AVAudioFrameCount)MAX(128, MIN(4096, ceil(_sampleRate / detectionRate)))
    : 2048;
  NSLog(@"[PitchDetector] detectionRate=%.0fHz sampleRate=%.0fHz bufferSize=%u", detectionRate, _sampleRate, (unsigned)bufferSize);

  __weak PitchDetectorModule *weakSelf = self;
  [inputNode installTapOnBus:0 bufferSize:bufferSize format:format
                       block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
    PitchDetectorModule *self = weakSelf;
    if (!self || !self->_running) return;

    float *samples = buffer.floatChannelData[0];
    int frames = (int)buffer.frameLength;

    // --- Recording ---
    if (self->_isRecordingAudio) {
      [self->_recordingLock lock];
      if (self->_recordingFile) {
        NSError *writeError = nil;
        [self->_recordingFile writeFromBuffer:buffer error:&writeError];
      }
      [self->_recordingLock unlock];
    }

    // --- Pitch detection ---
    float sr = self->_sampleRate;
    if (rms_level(samples, frames) < 0.008f) {
      self->_historyCount = 0;
      return;
    }

    float freq = yin_detect(samples, frames, sr, 0.12f);
    if (freq < 60.0f || freq > 1400.0f) {
      self->_historyCount = 0;
      return;
    }

    if (self->_historyCount > 0) {
      float ref = self->_history[(self->_historyCount - 1) % 5];
      float ratio = freq / ref;
      if (ratio < 0.5f || ratio > 2.0f) return;
    }

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

// ---------------------------------------------------------------------------
// stopDetection
// ---------------------------------------------------------------------------
RCT_EXPORT_METHOD(stopDetection:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [self _stop];
  resolve(nil);
}

// ---------------------------------------------------------------------------
// startRecording — call after startDetection
// ---------------------------------------------------------------------------
RCT_EXPORT_METHOD(startRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  if (!_running) {
    reject(@"not_running", @"Call startDetection first", nil);
    return;
  }

  NSString *cacheDir = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES) firstObject];
  NSString *dir = [cacheDir stringByAppendingPathComponent:@"PitchPerfect"];
  [[NSFileManager defaultManager] createDirectoryAtPath:dir
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:nil];

  NSDateFormatter *fmt = [[NSDateFormatter alloc] init];
  fmt.dateFormat = @"yyyyMMdd_HHmmss_SSS";
  NSString *filename = [NSString stringWithFormat:@"recording_%@.wav", [fmt stringFromDate:[NSDate date]]];
  _recordingPath = [dir stringByAppendingPathComponent:filename];

  // Use input format — AVAudioFile handles float→int16 conversion automatically
  AVAudioFormat *inputFormat = [_engine.inputNode outputFormatForBus:0];
  NSDictionary *settings = @{
    AVFormatIDKey:             @(kAudioFormatLinearPCM),
    AVSampleRateKey:           @(inputFormat.sampleRate),
    AVNumberOfChannelsKey:     @(inputFormat.channelCount),
    AVLinearPCMBitDepthKey:    @(16),
    AVLinearPCMIsFloatKey:     @(NO),
    AVLinearPCMIsBigEndianKey: @(NO),
  };

  NSError *error = nil;
  NSURL *url = [NSURL fileURLWithPath:_recordingPath];
  AVAudioFile *file = [[AVAudioFile alloc] initForWriting:url settings:settings error:&error];
  if (error || !file) {
    reject(@"file_error", @"Could not create recording file", error);
    return;
  }

  [_recordingLock lock];
  _recordingFile = file;
  _isRecordingAudio = YES;
  [_recordingLock unlock];

  resolve(_recordingPath);
}

// ---------------------------------------------------------------------------
// stopRecording — returns file path
// ---------------------------------------------------------------------------
RCT_EXPORT_METHOD(stopRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  _isRecordingAudio = NO;
  [_recordingLock lock];
  _recordingFile = nil;
  [_recordingLock unlock];

  NSString *filename = [_recordingPath lastPathComponent] ?: @"";
  _recordingPath = nil;
  resolve(filename);
}

RCT_EXPORT_METHOD(getRecordingsDirectory:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *docDir = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES) firstObject];
  NSString *dir = [docDir stringByAppendingPathComponent:@"PitchPerfect"];
  [[NSFileManager defaultManager] createDirectoryAtPath:dir
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:nil];
  resolve(dir);
}

// 按文件名查找录音文件：先找 Documents，再找 Caches（兼容旧录音）
RCT_EXPORT_METHOD(resolveRecordingPath:(NSString *)filename
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSFileManager *fm = [NSFileManager defaultManager];
  NSString *docDir = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES) firstObject];
  NSString *docsPath = [[docDir stringByAppendingPathComponent:@"PitchPerfect"] stringByAppendingPathComponent:filename];
  if ([fm fileExistsAtPath:docsPath]) { resolve(docsPath); return; }
  NSString *cacheDir = [NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES) firstObject];
  NSString *cachePath = [[cacheDir stringByAppendingPathComponent:@"PitchPerfect"] stringByAppendingPathComponent:filename];
  if ([fm fileExistsAtPath:cachePath]) { resolve(cachePath); return; }
  resolve(docsPath); // 都不存在，返回 Documents 路径（播放时会报错）
}

// ---------------------------------------------------------------------------
// pauseRecording / resumeRecording
// ---------------------------------------------------------------------------
RCT_EXPORT_METHOD(pauseRecording) {
  _isRecordingAudio = NO;
}

RCT_EXPORT_METHOD(resumeRecording) {
  if (_recordingFile) {
    _isRecordingAudio = YES;
  }
}

// ---------------------------------------------------------------------------
// Internal stop
// ---------------------------------------------------------------------------
- (void)_stop {
  if (!_running) return;
  _running = NO;
  _isRecordingAudio = NO;
  [_recordingLock lock];
  _recordingFile = nil;
  [_recordingLock unlock];
  _recordingPath = nil;
  AVAudioEngine *engine = _engine;
  _engine = nil;
  if (engine) {
    [engine.inputNode removeTapOnBus:0];
    [engine stop];
  }
  [[AVAudioSession sharedInstance] setActive:NO
                                 withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                                       error:nil];
}

- (void)invalidate {
  [self _stop];
  [super invalidate];
}

@end
