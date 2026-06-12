export const toSaveFile = (save, gameData = {}) =>
  JSON.stringify({
    __meta: save,
    ...(typeof gameData === 'string' ? JSON.parse(gameData || '{}') : gameData)
  })

export const parseSaveFile = (payload) => {
  const { __meta, ...gameData } = JSON.parse(payload)

  if (!__meta?.id) {
    throw new Error('Save file is missing metadata')
  }

  return {
    save: __meta,
    data: gameData
  }
}

export const saveFileDataUrl = (save, gameData = {}) =>
  `data:text/json;charset=utf-8,${encodeURIComponent(toSaveFile(save, gameData))}`

export const saveFileName = (name) => `Nuzlocke Tracker - ${name}.nzsav`
