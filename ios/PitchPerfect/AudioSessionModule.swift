import Foundation
import AVFoundation

@objc(AudioSessionModule)
class AudioSessionModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  // 用于钢琴音效：在录音 session 内混音播放
  @objc func resetForPlayback() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .mixWithOthers])
    try? session.setActive(true)
  }

  // 用于历史录音播放：纯播放模式，支持耳机/蓝牙，不强制走扬声器
  @objc func activateForRecordingPlayback() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .default, options: [.allowBluetooth, .allowBluetoothA2DP])
    try? session.setActive(true)
  }
}
