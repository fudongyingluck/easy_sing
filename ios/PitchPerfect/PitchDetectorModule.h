#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UIKit/UIKit.h>

@interface PitchDetectorModule : RCTEventEmitter <RCTBridgeModule, UIDocumentPickerDelegate>
@end
