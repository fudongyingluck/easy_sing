import { NativeModules } from 'react-native'

const { PitchDetectorModule } = NativeModules

/** 弹出系统文件选择器，返回临时文件路径；用户取消返回 null */
export async function pickAudioFile(): Promise<string | null> {
  const result = await PitchDetectorModule.pickAudioFile()
  return result ?? null
}

/** 将文件复制到 Documents/PitchPerfect/Imports/，返回沙盒内完整路径 */
export async function copyAudioFileToImports(srcPath: string): Promise<string> {
  return PitchDetectorModule.copyAudioFileToImports(srcPath)
}

/** 读取音频时长（秒） */
export async function getAudioDuration(filePath: string): Promise<number> {
  return PitchDetectorModule.getAudioDuration(filePath)
}
