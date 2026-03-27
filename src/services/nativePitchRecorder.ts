import { NativeModules, NativeEventEmitter } from 'react-native'

const { PitchDetectorModule } = NativeModules
const emitter = new NativeEventEmitter(PitchDetectorModule)

export const nativePitchRecorder = {
  /** 启动 AVAudioEngine，开始发送音高事件 */
  startDetection: (): Promise<void> =>
    PitchDetectorModule.startDetection(),

  /** 停止 AVAudioEngine */
  stopDetection: (): Promise<void> =>
    PitchDetectorModule.stopDetection(),

  /** 开始写 WAV 文件，返回文件路径（需先 startDetection）*/
  startRecording: (): Promise<string> =>
    PitchDetectorModule.startRecording(),

  /** 停止写文件，返回文件名（不含目录） */
  stopRecording: (): Promise<string> =>
    PitchDetectorModule.stopRecording(),

  /** 返回录音文件所在目录的当前完整路径 */
  getRecordingsDirectory: (): Promise<string> =>
    PitchDetectorModule.getRecordingsDirectory(),

  /** 暂停写文件（引擎继续运行） */
  pauseRecording: (): void =>
    PitchDetectorModule.pauseRecording(),

  /** 恢复写文件 */
  resumeRecording: (): void =>
    PitchDetectorModule.resumeRecording(),

  /** 订阅音高事件，返回可取消的订阅 */
  addPitchListener: (callback: (freq: number) => void) =>
    emitter.addListener('onPitchDetected', ({ freq }: { freq: number }) => callback(freq)),
}
