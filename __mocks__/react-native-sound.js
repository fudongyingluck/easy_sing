const Sound = jest.fn().mockImplementation((file, base, callback) => {
  if (callback) setTimeout(() => callback(null), 0)
  return {
    play: jest.fn(),
    stop: jest.fn(),
    release: jest.fn(),
    setVolume: jest.fn(),
    setNumberOfLoops: jest.fn(),
    getDuration: jest.fn().mockReturnValue(0),
    isLoaded: jest.fn().mockReturnValue(true),
  }
})
Sound.setCategory = jest.fn()
Sound.MAIN_BUNDLE = ''
Sound.LIBRARY = ''
Sound.DOCUMENT = ''
module.exports = Sound
