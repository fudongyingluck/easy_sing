module.exports = {
  DocumentDirectoryPath: '/mock/documents',
  exists: jest.fn().mockResolvedValue(false),
  unlink: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(''),
  writeFile: jest.fn().mockResolvedValue(undefined),
  copyFile: jest.fn().mockResolvedValue(undefined),
  moveFile: jest.fn().mockResolvedValue(undefined),
  readDir: jest.fn().mockResolvedValue([]),
  stat: jest.fn().mockResolvedValue({ size: 0 }),
  downloadFile: jest.fn().mockReturnValue({ jobId: 1, promise: Promise.resolve({ statusCode: 200 }) }),
}
