import Foundation
import AVFoundation
import React

@objc(AudioSessionModule)
class AudioSessionModule: RCTEventEmitter {

  override static func requiresMainQueueSetup() -> Bool { return false }

  override func supportedEvents() -> [String]! {
    return ["onHeadphonesDisconnected"]
  }

  override init() {
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification,
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func handleRouteChange(_ notification: Notification) {
    guard
      let info = notification.userInfo,
      let reasonValue = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
      let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue),
      reason == .oldDeviceUnavailable || reason == .newDeviceAvailable
    else { return }

    sendEvent(withName: "onHeadphonesDisconnected", body: nil)
  }

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

}
