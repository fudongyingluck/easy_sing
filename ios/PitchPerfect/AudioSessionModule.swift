import Foundation
import AVFoundation

@objc(AudioSessionModule)
class AudioSessionModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc func resetForPlayback() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .mixWithOthers])
    try? session.setActive(true)
  }
}
