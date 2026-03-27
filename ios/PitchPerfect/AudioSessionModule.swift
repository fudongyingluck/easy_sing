import Foundation
import AVFoundation

@objc(AudioSessionModule)
class AudioSessionModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  // 用于钢琴音效：在录音 session 内混音播放
  @objc func resetForPlayback() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .mixWithOthers, .allowBluetooth, .allowBluetoothA2DP])
    try? session.setActive(true)
  }

  // 用于历史录音播放：与钢琴共用同一 session，避免类别切换导致的路由冲突
  @objc func activateForRecordingPlayback() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .mixWithOthers])
    try? session.setActive(true)
  }
}
