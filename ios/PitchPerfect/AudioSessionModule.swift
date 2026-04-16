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

  // 录音结束后释放 session，让其他 app（如 B 站）恢复音频
  @objc func deactivate() {
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  // 检查当前是否有耳机或蓝牙音频输出
  @objc func isHeadphonesConnected(_ resolve: @escaping RCTPromiseResolveBlock,
                                    rejecter reject: RCTPromiseRejectBlock) {
    #if targetEnvironment(simulator)
    resolve(true)  // 模拟器无法检测 Mac 音频路由，直接视为已连接
    #else
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
    let connected = outputs.contains {
      [AVAudioSession.Port.headphones,
       .bluetoothA2DP, .bluetoothHFP, .bluetoothLE].contains($0.portType)
    }
    resolve(connected)
    #endif
  }
}
