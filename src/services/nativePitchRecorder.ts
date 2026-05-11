import { NativeModules, NativeEventEmitter } from 'react-native'

const { PitchDetectorModule } = NativeModules
const emitter = new NativeEventEmitter(PitchDetectorModule)

export const nativePitchRecorder = {
  /** 启动 AVAudioEngine，开始发送音高事件（detectionRate: Hz，控制检测频率）
   *  disableVoiceProcessing: true 时跳过 AUVoiceIO，避免模板音频与回声消除冲突 */
  startDetection: (detectionRate: number, disableVoiceProcessing = false): Promise<void> =>
    PitchDetectorModule.startDetection(detectionRate, disableVoiceProcessing),

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

  /** 按文件名查找录音（Documents 优先，兼容旧 Caches 路径） */
  resolveRecordingPath: (filename: string): Promise<string> =>
    PitchDetectorModule.resolveRecordingPath(filename),

  /** 暂停写文件（引擎继续运行） */
  pauseRecording: (): void =>
    PitchDetectorModule.pauseRecording(),

  /** 恢复写文件 */
  resumeRecording: (): void =>
    PitchDetectorModule.resumeRecording(),

  /** 分析音频文件，返回 10Hz 音高数据，最长 10 分钟 */
  analyzeAudioFile: (filePath: string): Promise<{ points: Array<{ time: number; freq: number }>; duration: number }> =>
    PitchDetectorModule.analyzeAudioFile(filePath),

  /** 订阅音高事件，返回可取消的订阅 */
  addPitchListener: (callback: (freq: number) => void) =>
    emitter.addListener('onPitchDetected', ({ freq }: { freq: number }) => callback(freq)),
}
