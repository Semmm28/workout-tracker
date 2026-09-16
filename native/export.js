export function createNativeExporter({ Filesystem, Share, Directory, Encoding }) {
  return async (filename, payload) => {
    if (!/^[a-zA-Z0-9_-]+\.json$/.test(filename)) {
      throw new Error('Invalid backup filename');
    }
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: JSON.stringify(payload, null, 2),
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    // Keep the file until the share sheet is dismissed by the user.
    return Share.share({
      title: 'Workout Log-backup',
      files: [uri],
    });
  };
}
