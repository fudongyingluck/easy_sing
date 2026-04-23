#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(AudioSessionModule, RCTEventEmitter)
RCT_EXTERN_METHOD(resetForPlayback)
RCT_EXTERN_METHOD(activateForRecordingPlayback)
RCT_EXTERN_METHOD(deactivate)
RCT_EXTERN_METHOD(getBuildInfo:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
