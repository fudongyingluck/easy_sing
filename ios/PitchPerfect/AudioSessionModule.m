#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AudioSessionModule, NSObject)
RCT_EXTERN_METHOD(resetForPlayback)
RCT_EXTERN_METHOD(activateForRecordingPlayback)
@end
